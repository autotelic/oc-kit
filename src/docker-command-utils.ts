/**
 * Utility functions for building Docker and Docker Compose commands
 */

import type { ToolArgs, DockerCapabilities } from './types.js'

/**
 * Standard validation result for command building
 */
export interface CommandValidationResult {
  /** Whether validation passed */
  valid: boolean
  /** Error message if validation failed */
  error?: string
}

/**
 * Validates that an action is provided
 * @param action - Action to validate
 * @returns Validation result
 */
export function validateAction(action?: string): CommandValidationResult {
  if (!action) {
    return { valid: false, error: 'Error: action parameter is required' }
  }
  return { valid: true }
}

/**
 * Validates that a required parameter is provided for an action
 * @param paramName - Name of the parameter
 * @param paramValue - Value of the parameter
 * @param action - Action that requires the parameter
 * @returns Validation result
 */
export function validateRequiredParam(
  paramName: string,
  paramValue?: string,
  action?: string
): CommandValidationResult {
  if (!paramValue) {
    return { 
      valid: false, 
      error: `Error: ${paramName} parameter is required for ${action} action` 
    }
  }
  return { valid: true }
}

/**
 * Validates Docker availability
 * @param capabilities - Docker capabilities to check
 * @returns Validation result
 */
export function validateDockerAvailable(capabilities: DockerCapabilities): CommandValidationResult {
  if (!capabilities.dockerAvailable) {
    return { 
      valid: false, 
      error: 'Error: Docker is not available on this system. Please install Docker to use this tool.' 
    }
  }
  return { valid: true }
}

/**
 * Validates that Compose files are available
 * @param capabilities - Docker capabilities to check
 * @returns Validation result
 */
export function validateComposeAvailable(capabilities: DockerCapabilities): CommandValidationResult {
  if (capabilities.composeFiles.length === 0) {
    return { 
      valid: false, 
      error: 'Error: No Docker Compose files found in this project.' 
    }
  }
  return { valid: true }
}

/**
 * Adds additional arguments to a command if they exist and the action supports them
 * @param command - Command array to modify
 * @param args - Tool arguments containing potential additional args
 * @param excludeActions - Actions that handle args specially
 */
export function addAdditionalArgs(
  command: string[],
  args: ToolArgs,
  excludeActions: string[] = []
): void {
  if (args.args && args.args.length > 0 && !excludeActions.includes(args.action || '')) {
    command.push(...args.args.filter((arg): arg is string => arg !== undefined))
  }
}

/**
 * Resolves the best Compose file to use
 * @param args - Tool arguments that may specify a file
 * @param capabilities - Docker capabilities with discovered files
 * @returns File path or null if none specified/found
 */
export function resolveComposeFile(args: ToolArgs, capabilities: DockerCapabilities): string | null {
  if (args.file) {
    return args.file
  }
  
  if (capabilities.composeFiles.length === 0) {
    return null
  }

  // Prefer standard docker-compose.y[a]ml files
  const mainComposeFile = capabilities.composeFiles.find((f: string) => 
    f.endsWith('docker-compose.yaml') || f.endsWith('docker-compose.yml')
  ) || capabilities.composeFiles[0]

  // Only specify -f if it's not a standard name
  if (mainComposeFile && 
      !mainComposeFile.endsWith('docker-compose.yaml') && 
      !mainComposeFile.endsWith('docker-compose.yml')) {
    return mainComposeFile
  }

  return null
}

/**
 * Resolves target services based on profile or explicit services
 * @param args - Tool arguments containing profile or services
 * @param capabilities - Docker capabilities with profile definitions
 * @returns Array of target service names
 */
export function resolveTargetServices(args: ToolArgs, capabilities: DockerCapabilities): string[] {
  if (args.profile && capabilities.profiles[args.profile]) {
    return capabilities.profiles[args.profile] || []
  }
  
  if (args.services && args.services.length > 0) {
    return args.services
  }

  return []
}

/**
 * Actions that require container parameter
 */
export const CONTAINER_ACTIONS = new Set(['exec', 'logs', 'stop', 'start', 'restart', 'rm'])

/**
 * Actions that require image parameter
 */
export const IMAGE_ACTIONS = new Set(['run', 'pull', 'push'])

/**
 * Actions that handle arguments in a special way
 */
export const SPECIAL_ARG_ACTIONS = new Set(['exec'])