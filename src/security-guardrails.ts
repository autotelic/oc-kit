/**
 * Security guardrails for dangerous operations
 */

import { isDestructiveOperation } from './security-validation.js'

/**
 * Configuration for security guardrails
 */
export interface SecurityConfig {
  /** Whether to require confirmation for destructive operations */
  requireConfirmation: boolean
  /** Whether to block dangerous operations entirely */
  blockDangerous: boolean
  /** Maximum execution timeout in milliseconds */
  maxTimeout: number
  /** Whether to enable read-only mode */
  readOnlyMode: boolean
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: SecurityConfig = {
  requireConfirmation: true,
  blockDangerous: false,
  maxTimeout: 10 * 60 * 1000, // 10 minutes
  readOnlyMode: false
}

/**
 * Operations that are always blocked in read-only mode
 */
const READ_ONLY_BLOCKED_ACTIONS = new Set([
  'rm', 'remove', 'down', 'stop', 'kill', 'prune', 'rmi', 'system',
  'build', 'push', 'up', 'restart', 'exec'
])

/**
 * Docker operations that require elevated privileges
 */
const PRIVILEGED_DOCKER_ACTIONS = new Set([
  'build', 'run', 'exec', 'system'
])

/**
 * Package.json scripts that are considered dangerous
 */
const DANGEROUS_SCRIPT_PATTERNS = [
  /install$/i,     // npm install scripts
  /postinstall$/i, // postinstall hooks
  /preinstall$/i,  // preinstall hooks
  /prepare$/i,     // prepare scripts
  /prepublish$/i,  // prepublish scripts
]

export interface GuardrailResult {
  allowed: boolean
  reason?: string
  requiresConfirmation?: boolean
}

/**
 * Checks if an operation should be allowed based on security guardrails
 * @param action - Action being performed
 * @param args - Arguments for the action
 * @param config - Security configuration
 * @returns Guardrail result indicating if operation is allowed
 */
export function checkOperationGuardrails(
  action: string,
  args?: string[],
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): GuardrailResult {
  // Check read-only mode
  if (config.readOnlyMode && READ_ONLY_BLOCKED_ACTIONS.has(action)) {
    return {
      allowed: false,
      reason: `Operation '${action}' is blocked in read-only mode`
    }
  }

  // Check for destructive operations
  if (isDestructiveOperation(action, args)) {
    if (config.blockDangerous) {
      return {
        allowed: false,
        reason: `Destructive operation '${action}' is blocked by security policy`
      }
    }
    
    if (config.requireConfirmation) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: `Destructive operation '${action}' requires confirmation`
      }
    }
  }

  // Check for privileged Docker operations
  if (PRIVILEGED_DOCKER_ACTIONS.has(action)) {
    if (config.requireConfirmation) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: `Privileged Docker operation '${action}' requires confirmation`
      }
    }
  }

  return { allowed: true }
}

/**
 * Checks if a package.json script should be allowed
 * @param scriptName - Name of the script
 * @param config - Security configuration
 * @returns Guardrail result indicating if script execution is allowed
 */
export function checkScriptGuardrails(
  scriptName: string,
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): GuardrailResult {
  // Check for dangerous script patterns
  for (const pattern of DANGEROUS_SCRIPT_PATTERNS) {
    if (pattern.test(scriptName)) {
      if (config.blockDangerous) {
        return {
          allowed: false,
          reason: `Script '${scriptName}' matches dangerous pattern and is blocked`
        }
      }
      
      if (config.requireConfirmation) {
        return {
          allowed: true,
          requiresConfirmation: true,
          reason: `Script '${scriptName}' is potentially dangerous and requires confirmation`
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * Validates timeout value against security limits
 * @param timeout - Requested timeout in milliseconds
 * @param config - Security configuration
 * @returns Validated timeout value
 */
export function validateTimeout(
  timeout: number,
  config: SecurityConfig = DEFAULT_SECURITY_CONFIG
): number {
  if (timeout > config.maxTimeout) {
    return config.maxTimeout
  }
  return timeout
}

/**
 * Checks if Docker volume mounts are safe
 * @param args - Docker arguments that may contain volume mounts
 * @returns Guardrail result for volume mounts
 */
export function checkDockerVolumeMounts(args: string[]): GuardrailResult {
  for (const arg of args) {
    if (arg.startsWith('-v') || arg.startsWith('--volume')) {
      // Extract volume mount paths
      const volumeMatch = arg.match(/(?:-v|--volume)=?([^:]+):([^:]+)(?::[rwz]+)?/)
      if (volumeMatch && volumeMatch[1] && volumeMatch[2]) {
        const hostPath = volumeMatch[1]
        const containerPath = volumeMatch[2]

        // Check for dangerous host paths
        const dangerousHostPaths = [
          '/var/run/docker.sock', // Docker socket access
          '/proc', '/sys', '/dev', // System directories
          '/etc', '/var', '/usr', '/bin', '/sbin', '/boot', // System directories
          '/root', '/home' // User directories
        ]

        for (const dangerousPath of dangerousHostPaths) {
          if (hostPath.startsWith(dangerousPath)) {
            return {
              allowed: false,
              reason: `Volume mount to ${hostPath} is not allowed for security reasons`
            }
          }
        }

        // Warn about root filesystem access
        if (containerPath === '/' || containerPath.startsWith('/etc') || containerPath.startsWith('/var')) {
          return {
            allowed: true,
            requiresConfirmation: true,
            reason: `Volume mount to ${containerPath} in container may be dangerous`
          }
        }
      }
    }
  }

  return { allowed: true }
}

/**
 * Checks if network settings are safe
 * @param args - Docker arguments that may contain network settings
 * @returns Guardrail result for network settings
 */
export function checkDockerNetworkSettings(args: string[]): GuardrailResult {
  for (const arg of args) {
    // Check for host networking (dangerous)
    if (arg === '--network=host' || arg === '--net=host') {
      return {
        allowed: false,
        reason: 'Host networking is not allowed for security reasons'
      }
    }

    // Check for privileged containers
    if (arg === '--privileged') {
      return {
        allowed: false,
        reason: 'Privileged containers are not allowed for security reasons'
      }
    }

    // Check for capability additions
    if (arg.startsWith('--cap-add')) {
      return {
        allowed: true,
        requiresConfirmation: true,
        reason: 'Adding container capabilities requires confirmation'
      }
    }
  }

  return { allowed: true }
}