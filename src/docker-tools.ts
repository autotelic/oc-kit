/**
 * Docker tool implementations
 */

import type { ToolArgs, OpenCodeContext } from './types.js'
import { getDockerCapabilities } from './docker.js'
import { wrapWithDoppler } from './doppler.js'
import { executeCommand, formatCommandResult, getDockerTimeout } from './execution.js'
import { 
  validateAction, 
  validateRequiredParam, 
  validateDockerAvailable,
  addAdditionalArgs,
  CONTAINER_ACTIONS,
  IMAGE_ACTIONS,
  SPECIAL_ARG_ACTIONS
} from './docker-command-utils.js'

/**
 * Builds a Docker command based on the provided arguments
 * @param args - Tool arguments containing action and parameters
 * @returns Command array ready for execution or error string
 */
export function buildDockerCommand(args: ToolArgs): string[] | string {
  const actionValidation = validateAction(args.action)
  if (!actionValidation.valid) {
    return actionValidation.error!
  }

  const action = args.action!
  const baseCommand = ['docker', action]

  // Validate required parameters based on action
  if (CONTAINER_ACTIONS.has(action)) {
    const validation = validateRequiredParam('container', args.container, action)
    if (!validation.valid) {
      return validation.error!
    }
  }

  if (IMAGE_ACTIONS.has(action)) {
    const validation = validateRequiredParam('image', args.image, action)
    if (!validation.valid) {
      return validation.error!
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
  const workingDir = args.cwd || context.cwd || process.cwd()
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

  const result = await executeCommand(finalCommand, {
    cwd: workingDir,
    timeout
  })

  return formatCommandResult(result)
}