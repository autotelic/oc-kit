/**
 * Docker Compose tool implementations
 */

import type { ToolArgs, OpenCodeContext } from './types.js'
import { getDockerCapabilities } from './docker.js'
import { wrapWithDoppler } from './doppler.js'
import { executeCommand, formatCommandResult, getComposeTimeout } from './execution.js'
import {
  validateAction,
  validateDockerAvailable,
  validateComposeAvailable,
  addAdditionalArgs,
  resolveComposeFile,
  resolveTargetServices,
  SPECIAL_ARG_ACTIONS
} from './docker-command-utils.js'
import { validateDockerArgs } from './security-validation.js'
import {
  checkOperationGuardrails,
  checkDockerVolumeMounts,
  checkDockerNetworkSettings,
  DEFAULT_SECURITY_CONFIG
} from './security-guardrails.js'
import { executeWithStreaming, shouldUseStreaming, createProgressLogger, createOutputStreamers } from './streaming.js'

/**
 * Builds a Docker Compose command based on the provided arguments
 * @param args - Tool arguments containing action and parameters
 * @param capabilities - Docker capabilities for file and service resolution
 * @returns Command array ready for execution or error string
 */
export function buildComposeCommand(args: ToolArgs, capabilities: any): string[] | string {
  const actionValidation = validateAction(args.action)
  if (!actionValidation.valid) {
    return actionValidation.error!
  }

  const action = args.action!

  // Check security guardrails for the operation
  const guardrailResult = checkOperationGuardrails(action, args.args, DEFAULT_SECURITY_CONFIG)
  if (!guardrailResult.allowed) {
    return `Security: ${guardrailResult.reason}`
  }
  if (guardrailResult.requiresConfirmation) {
    return `Security Warning: ${guardrailResult.reason}. Add --confirm flag to proceed.`
  }

  // Validate Docker-specific arguments if provided
  if (args.args && args.args.length > 0) {
    const argsValidation = validateDockerArgs(args.args)
    if (!argsValidation.valid) {
      return `Invalid arguments: ${argsValidation.error}`
    }

    // Check for dangerous volume mounts
    const volumeCheck = checkDockerVolumeMounts(args.args)
    if (!volumeCheck.allowed) {
      return `Security: ${volumeCheck.reason}`
    }
    if (volumeCheck.requiresConfirmation) {
      return `Security Warning: ${volumeCheck.reason}. Add --confirm flag to proceed.`
    }

    // Check for dangerous network settings
    const networkCheck = checkDockerNetworkSettings(args.args)
    if (!networkCheck.allowed) {
      return `Security: ${networkCheck.reason}`
    }
    if (networkCheck.requiresConfirmation) {
      return `Security Warning: ${networkCheck.reason}. Add --confirm flag to proceed.`
    }
  }

  const baseCommand = ['docker-compose']

  // Add compose file if needed
  const composeFile = resolveComposeFile(args, capabilities)
  if (composeFile) {
    baseCommand.push('-f', composeFile)
  }

  baseCommand.push(action)

  // Resolve target services
  const targetServices = resolveTargetServices(args, capabilities)

  // Handle action-specific logic
  switch (action) {
    case 'up':
      if (args.detach !== false) {
        baseCommand.push('-d')
      }
      break

    case 'logs':
      baseCommand.push('--tail=100')
      break

    case 'exec':
      if (targetServices.length === 0) {
        return 'Error: exec action requires a service to be specified via services parameter'
      }
      if (targetServices.length > 1) {
        return 'Error: exec action can only target one service at a time'
      }
      const targetService = targetServices[0]
      if (!targetService) {
        return 'Error: no target service found'
      }
      baseCommand.push(targetService)
      if (args.args && args.args.length > 0) {
        baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
      } else {
        baseCommand.push('/bin/sh')
      }
      // Don't add target services again for exec
      return baseCommand
  }

  // Add additional arguments for actions that support them
  addAdditionalArgs(baseCommand, args, Array.from(SPECIAL_ARG_ACTIONS))

  // Add target services if any
  if (targetServices.length > 0) {
    baseCommand.push(...targetServices)
  }

  return baseCommand
}

/**
 * Executes a Docker Compose command with proper error handling and Doppler integration
 * @param args - Tool arguments containing Compose action and parameters
 * @param context - OpenCode context with session information
 * @returns Promise resolving to formatted command result
 */
export async function executeComposeCommand(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = args.cwd || context.cwd || process.cwd()
  const capabilities = await getDockerCapabilities(workingDir)

  // Validate Docker and Compose availability
  const dockerValidation = validateDockerAvailable(capabilities)
  if (!dockerValidation.valid) {
    return dockerValidation.error!
  }

  const composeValidation = validateComposeAvailable(capabilities)
  if (!composeValidation.valid) {
    return composeValidation.error!
  }

  const commandOrError = buildComposeCommand(args, capabilities)
  if (typeof commandOrError === 'string') {
    return commandOrError
  }

  const finalCommand = await wrapWithDoppler(commandOrError, workingDir, args.skipDoppler, args.action)
  const timeout = getComposeTimeout(args.action || '', args.timeout)

  // Check if this Compose command should use streaming
  const [command, ...commandArgs] = finalCommand
  if (!command) {
    return 'Error: Invalid command structure'
  }

  const useStreaming = shouldUseStreaming(command, commandArgs) || 
    ['up', 'build', 'pull', 'logs'].includes(args.action || '')

  if (useStreaming) {
    // Use streaming execution for long-running Compose commands
    const progressLogger = createProgressLogger('🐙')
    const { onStdout, onStderr } = createOutputStreamers('📤', '📥')

    const result = await executeWithStreaming(command, commandArgs, {
      cwd: workingDir,
      timeout,
      onProgress: progressLogger,
      onStdout,
      onStderr
    })

    return `Command: ${result.command}\nExit code: ${result.exitCode}\n\nFinal stdout:\n${result.stdout}\n\nFinal stderr:\n${result.stderr}`
  } else {
    // Use regular execution for quick commands
    const result = await executeCommand(finalCommand, {
      cwd: workingDir,
      timeout
    })

    return formatCommandResult(result)
  }
}