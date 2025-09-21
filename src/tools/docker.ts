/**
 * Docker operation tools
 * Part of @autotelic/oc-kit
 */

import type { ToolArgs, OpenCodeContext } from '../types.js'
import { getDockerCapabilities } from '../core/docker.js'
import { wrapWithDoppler } from '../core/doppler.js'
import { executeCommand, formatCommandResult, getDockerTimeout } from '../core/execution.js'
import { 
  validateAction, 
  validateRequiredParam, 
  validateDockerAvailable,
  addAdditionalArgs,
  CONTAINER_ACTIONS,
  IMAGE_ACTIONS,
  SPECIAL_ARG_ACTIONS
} from '../utils/docker-command-utils.js'
import { 
  validateContainerName,
  validateImageName,
  validateDockerArgs
} from '../core/security-validation.js'
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
 * Builds a Docker command based on the provided arguments
 * @param args - Tool arguments containing action and parameters
 * @returns Command array ready for execution or error string
 */
function buildDockerCommand(args: ToolArgs): string[] | string {
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

  const baseCommand = ['docker', action]

  // Validate required parameters based on action
  if (CONTAINER_ACTIONS.has(action)) {
    const validation = validateRequiredParam('container', args.container, action)
    if (!validation.valid) {
      return validation.error!
    }
    
    // Validate container name format
    if (args.container) {
      const containerValidation = validateContainerName(args.container)
      if (!containerValidation.valid) {
        return `Invalid container name: ${containerValidation.error}`
      }
    }
  }

  if (IMAGE_ACTIONS.has(action)) {
    const validation = validateRequiredParam('image', args.image, action)
    if (!validation.valid) {
      return validation.error!
    }
    
    // Validate image name format
    if (args.image) {
      const imageValidation = validateImageName(args.image)
      if (!imageValidation.valid) {
        return `Invalid image name: ${imageValidation.error}`
      }
    }
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

  // Build command based on action
  switch (action) {
    case 'build':
      if (args.tag) baseCommand.push('-t', args.tag)
      if (args.image) baseCommand.push(args.image)
      else baseCommand.push('.')
      break

    case 'run':
      baseCommand.push(args.image!)
      break

    case 'exec':
      baseCommand.push('-it', args.container!)
      if (args.args && args.args.length > 0) {
        baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
      } else {
        baseCommand.push('/bin/sh')
      }
      break

    case 'logs':
      baseCommand.push('--tail', '100', args.container!)
      break

    case 'stop':
    case 'start':
    case 'restart':
    case 'rm':
      baseCommand.push(args.container!)
      break

    case 'pull':
    case 'push':
      baseCommand.push(args.image!)
      break
  }

  // Add additional arguments for actions that support them
  addAdditionalArgs(baseCommand, args, Array.from(SPECIAL_ARG_ACTIONS))

  return baseCommand
}

/**
 * Executes a Docker command with proper error handling and Doppler integration
 * @param args - Tool arguments containing Docker action and parameters
 * @param context - OpenCode context with session information
 * @returns Promise resolving to formatted command result
 */
export async function executeDockerCommand(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)
  const capabilities = await getDockerCapabilities(workingDir)

  // Validate Docker availability
  const dockerValidation = validateDockerAvailable(capabilities)
  if (!dockerValidation.valid) {
    return dockerValidation.error!
  }

  const commandOrError = buildDockerCommand(args)
  if (typeof commandOrError === 'string') {
    return commandOrError
  }

  const finalCommand = await wrapWithDoppler(commandOrError, workingDir, args.skipDoppler, args.action)
  const timeout = getDockerTimeout(args.action || '', args.timeout)

  // Check if this Docker command should use streaming
  const [command, ...commandArgs] = finalCommand
  if (!command) {
    return 'Error: Invalid command structure'
  }

  const useStreaming = shouldUseStreaming(command, commandArgs) || 
    ['build', 'pull', 'logs', 'run'].includes(args.action || '')

  if (useStreaming) {
    // Use streaming execution for long-running Docker commands
    const progressLogger = createProgressLogger('🐳')
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
}

/**
 * Lists Docker capabilities and discovered files in the current project
 * @param args - Tool arguments containing optional working directory
 * @param context - OpenCode context with session information
 * @returns Promise resolving to formatted Docker capabilities report
 */
export async function listDockerCapabilities(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)
  const capabilities = await getDockerCapabilities(workingDir)

  const output: string[] = []

  output.push('=== Docker Capabilities ===')
  output.push(`Docker Available: ${capabilities.dockerAvailable ? '✅' : '❌'}`)
  output.push(`Dockerfiles Found: ${capabilities.dockerfiles.length}`)
  output.push(`Compose Files Found: ${capabilities.composeFiles.length}`)
  output.push('')

  if (capabilities.dockerfiles.length > 0) {
    output.push('📁 Dockerfiles:')
    capabilities.dockerfiles.forEach(file => {
      const relativePath = file.replace(workingDir, '.')
      output.push(`  ${relativePath}`)
    })
    output.push('')
  }

  if (capabilities.composeFiles.length > 0) {
    output.push('🐳 Docker Compose Files:')
    capabilities.composeFiles.forEach(file => {
      const relativePath = file.replace(workingDir, '.')
      output.push(`  ${relativePath}`)
    })
    output.push('')
  }

  if (capabilities.services.size > 0) {
    output.push('🔧 Discovered Services:')
    Array.from(capabilities.services).sort().forEach(service => {
      output.push(`  ${service}`)
    })
    output.push('')
  }

  if (Object.keys(capabilities.profiles).length > 0) {
    output.push('📋 Auto-Generated Profiles:')
    Object.entries(capabilities.profiles).forEach(([profile, services]) => {
      output.push(`  ${profile}: [${services.join(', ')}]`)
    })
    output.push('')
  }

  if (capabilities.dockerAvailable) {
    output.push('⚡ Available Tools:')
    output.push('  kit_docker - Container operations (build, run, exec, logs, ps, etc.)')

    if (capabilities.composeFiles.length > 0) {
      output.push('  kit_compose - Docker Compose operations (up, down, build, logs, etc.)')
    }

    output.push('')
    output.push('📖 Usage Examples:')
    output.push('  kit_docker { action: "ps" }')
    output.push('  kit_docker { action: "build", tag: "myapp:latest" }')

    if (capabilities.composeFiles.length > 0) {
      output.push('  kit_compose { action: "up" }')
      output.push('  kit_compose { action: "up", profile: "database" }')

      if (capabilities.services.size > 0) {
        const firstService = Array.from(capabilities.services)[0]
        output.push(`  kit_compose { action: "logs", services: ["${firstService}"] }`)
      }
    }
  } else {
    output.push('❌ Docker Tools Unavailable:')
    output.push('  Docker is not installed or not accessible.')
    output.push('  Install Docker to enable kit_docker and kit_compose tools.')
  }

  return output.join('\n')
}

// OpenCode plugin compatibility layer
const tool = await getOpenCodeTool()

/**
 * Custom opencode tool for executing Docker container operations.
 * Part of the @autotelic/oc-kit package. Only available if Docker is detected.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const docker = tool({
  description: 'Execute Docker container operations. Auto-detects available containers and provides common Docker commands.',
  args: {
    action: tool.schema.enum(['build', 'run', 'exec', 'logs', 'ps', 'stop', 'start', 'restart', 'rm', 'pull', 'push']).describe('Docker action to perform'),
    image: tool.schema.string().optional().describe('Docker image name (for build, run, pull, push)'),
    container: tool.schema.string().optional().describe('Container name or ID (for exec, logs, stop, start, restart, rm)'),
    tag: tool.schema.string().optional().describe('Image tag (for build, push)'),
    args: tool.schema.array(tool.schema.string()).optional().describe('Additional arguments to pass to Docker command'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)'),
    timeout: tool.schema.number().optional().describe('Timeout in milliseconds (default: 30s for logs, 5min for build/pull, 30s for others)'),
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDockerCommand(args, context)
  }
})

/**
 * Custom opencode tool for listing available Docker operations, discovered services, and Docker capabilities.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const dockerList = tool({
  description: 'List available Docker operations, discovered services, and Docker capabilities in the current project.',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return listDockerCapabilities(args, context)
  }
})