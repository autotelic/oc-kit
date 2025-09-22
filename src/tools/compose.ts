/**
 * Docker Compose operation tools
 * Part of @autotelic/oc-kit
 */

import type { ToolArgs, OpenCodeContext } from '../types.js'
import { getDockerCapabilities } from '../core/docker.js'
import { wrapWithDoppler } from '../core/doppler.js'
import { executeCommand, formatCommandResult, getComposeTimeout } from '../core/execution.js'
import {
  validateAction,
  validateDockerAvailable,
  validateComposeAvailable,
  addAdditionalArgs,
  resolveComposeFile,
  resolveTargetServices,
  SPECIAL_ARG_ACTIONS
} from '../utils/docker-command-utils.js'
import { validateDockerArgs } from '../core/security-validation.js'
import {
  checkOperationGuardrails,
  checkDockerVolumeMounts,
  checkDockerNetworkSettings,
  DEFAULT_SECURITY_CONFIG
} from '../core/security-guardrails.js'
import { executeWithStreaming, shouldUseStreaming, createProgressLogger, createOutputStreamers } from '../core/streaming.js'
import { getOpenCodeTool } from '../core/plugin-compat.js'
import { resolveWorkingDirectory } from '../utils/common.js'

/**
 * Converts a StreamingResult to CommandResult format for consistent formatting
 * @param streamingResult - Result from streaming execution
 * @returns CommandResult compatible object
 */
function streamingToCommandResult(streamingResult: any): any {
  return {
    command: streamingResult.command.split(' '), // Convert string back to array
    exitCode: streamingResult.exitCode,
    stdout: streamingResult.stdout,
    stderr: streamingResult.stderr,
    duration: undefined // Streaming doesn't track duration yet
  }
}

/**
 * Builds a Docker Compose command based on the provided arguments
 * @param args - Tool arguments containing action and parameters
 * @param capabilities - Docker capabilities for file and service resolution
 * @returns Command array ready for execution or error string
 */
function buildComposeCommand(args: ToolArgs, capabilities: any): string[] | string {
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
  try {
    const workingDir = resolveWorkingDirectory(args, context)
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

      // Convert streaming result to CommandResult format and use enhanced formatting
      const commandResult = streamingToCommandResult(result)
      return formatCommandResult(commandResult, args.action)
    } else {
      // Use regular execution for quick commands
      const result = await executeCommand(finalCommand, {
        cwd: workingDir,
        timeout
      })

      return formatCommandResult(result, args.action)
    }
  } catch (error) {
    return `Error executing Docker Compose command: ${error instanceof Error ? error.message : String(error)}`
  }
}

// OpenCode plugin compatibility layer
const tool = await getOpenCodeTool()

/**
 * Custom opencode tool for executing Docker Compose operations.
 * Part of the @autotelic/oc-kit package. Only available if compose files are detected.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const compose = tool({
  description: 'Execute Docker Compose operations. Auto-detects compose files and services, supports profiles and service selection.',
  args: {
    action: tool.schema.enum(['up', 'down', 'build', 'logs', 'exec', 'ps', 'restart', 'stop', 'start', 'pull']).describe('Docker Compose action to perform'),
    services: tool.schema.array(tool.schema.string()).optional().describe('Specific services to target (leave empty for all)'),
    profile: tool.schema.string().optional().describe('Service profile to use (database, cache, test, dev, all)'),
    file: tool.schema.string().optional().describe('Specific compose file to use (auto-detects if not specified)'),
    detach: tool.schema.boolean().optional().describe('Run in detached mode (default: true for up action)'),
    args: tool.schema.array(tool.schema.string()).optional().describe('Additional arguments to pass to docker-compose'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)'),
    timeout: tool.schema.number().optional().describe('Timeout in milliseconds (default: 30s for logs, 5min for build/up/pull, 30s for others)'),
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeComposeCommand(args, context)
  }
})