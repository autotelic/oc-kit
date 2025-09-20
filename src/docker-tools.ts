/**
 * Docker tool implementations
 */

import type { ToolArgs } from './types.js'
import { getDockerCapabilities } from './docker.js'
import { wrapWithDoppler } from './doppler.js'
import { executeCommand, formatCommandResult, getDockerTimeout } from './execution.js'

export function buildDockerCommand(args: ToolArgs): string[] | string {
  if (!args.action) {
    return 'Error: action parameter is required'
  }

  const baseCommand = ['docker', args.action]

  switch (args.action) {
    case 'build':
      if (args.tag) baseCommand.push('-t', args.tag)
      if (args.image) baseCommand.push(args.image)
      else baseCommand.push('.')
      break

    case 'run':
      if (!args.image) return 'Error: image parameter is required for run action'
      baseCommand.push(args.image)
      break

    case 'exec':
      if (!args.container) return 'Error: container parameter is required for exec action'
      baseCommand.push('-it', args.container)
      if (args.args && args.args.length > 0) {
        baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
      } else {
        baseCommand.push('/bin/sh')
      }
      break

    case 'logs':
      if (!args.container) return 'Error: container parameter is required for logs action'
      baseCommand.push('--tail', '100', args.container)
      break

    case 'stop':
    case 'start':
    case 'restart':
    case 'rm':
      if (!args.container) return `Error: container parameter is required for ${args.action} action`
      baseCommand.push(args.container)
      break

    case 'pull':
    case 'push':
      if (!args.image) return `Error: image parameter is required for ${args.action} action`
      baseCommand.push(args.image)
      break
  }

  if (args.args && args.args.length > 0 && !['exec'].includes(args.action || '')) {
    baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
  }

  return baseCommand
}

export async function executeDockerCommand(args: ToolArgs): Promise<string> {
  const workingDir = args.cwd || process.cwd()
  const capabilities = await getDockerCapabilities(workingDir)

  if (!capabilities.dockerAvailable) {
    return 'Error: Docker is not available on this system. Please install Docker to use this tool.'
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