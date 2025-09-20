/**
 * Docker Compose tool implementations
 */

import type { ToolArgs } from './types.js'
import { getDockerCapabilities } from './docker.js'
import { wrapWithDoppler } from './doppler.js'
import { executeCommand, formatCommandResult, getComposeTimeout } from './execution.js'

export function buildComposeCommand(args: ToolArgs, capabilities: any): string[] | string {
  if (!args.action) {
    return 'Error: action parameter is required'
  }

  const baseCommand = ['docker-compose']

  if (args.file) {
    baseCommand.push('-f', args.file)
  } else if (capabilities.composeFiles.length > 0) {
    const mainComposeFile = capabilities.composeFiles.find((f: string) => 
      f.endsWith('docker-compose.yaml') || f.endsWith('docker-compose.yml')
    ) || capabilities.composeFiles[0]

    if (mainComposeFile && !mainComposeFile.endsWith('docker-compose.yaml') && !mainComposeFile.endsWith('docker-compose.yml')) {
      baseCommand.push('-f', mainComposeFile)
    }
  }

  baseCommand.push(args.action)

  let targetServices: string[] = []

  if (args.profile && capabilities.profiles[args.profile]) {
    targetServices = capabilities.profiles[args.profile] || []
  } else if (args.services && args.services.length > 0) {
    targetServices = args.services
  }

  switch (args.action) {
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
      targetServices = []
      break
  }

  if (args.args && args.args.length > 0 && args.action !== 'exec') {
    baseCommand.push(...args.args)
  }

  if (targetServices.length > 0) {
    baseCommand.push(...targetServices)
  }

  return baseCommand
}

export async function executeComposeCommand(args: ToolArgs): Promise<string> {
  const workingDir = args.cwd || process.cwd()
  const capabilities = await getDockerCapabilities(workingDir)

  if (!capabilities.dockerAvailable) {
    return 'Error: Docker is not available on this system. Please install Docker to use this tool.'
  }

  if (capabilities.composeFiles.length === 0) {
    return 'Error: No Docker Compose files found in this project.'
  }

  const commandOrError = buildComposeCommand(args, capabilities)
  if (typeof commandOrError === 'string') {
    return commandOrError
  }

  const finalCommand = await wrapWithDoppler(commandOrError, workingDir, args.skipDoppler, args.action)
  const timeout = getComposeTimeout(args.action || '', args.timeout)

  const result = await executeCommand(finalCommand, {
    cwd: workingDir,
    timeout
  })

  return formatCommandResult(result)
}