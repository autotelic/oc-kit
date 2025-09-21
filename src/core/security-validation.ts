/**
 * Security validation and input sanitization utilities
 */

/**
 * Characters that are dangerous in shell commands
 */
const DANGEROUS_SHELL_CHARS = new Set([
  ';', '&&', '||', '|', '>', '<', '`', '$', '(', ')', '{', '}',
  '\\', '"', "'", '\n', '\r', '\t'
])

/**
 * Patterns that indicate potential command injection
 */
const INJECTION_PATTERNS = [
  /[;&|`$(){}\\]/,  // Shell metacharacters
  /\$\(/,           // Command substitution
  /`[^`]*`/,        // Backtick command execution
  />\s*\/dev/,      // Device file redirection
  />\s*\/proc/,     // Proc filesystem access
  />\s*\/sys/,      // Sys filesystem access
  /rm\s+-rf/i,      // Dangerous file deletion
  /chmod\s+\+x/i,   // Making files executable
  /curl.*\|/,       // Curl piped to shell
  /wget.*\|/,       // Wget piped to shell
]

/**
 * Paths that should never be accessible
 */
const DANGEROUS_PATHS = [
  '/etc/', '/var/', '/usr/', '/bin/', '/sbin/', '/boot/', '/sys/', '/proc/',
  '/dev/', '/root/', '/home/', '~/', '../', '..'
]

/**
 * Docker arguments that are potentially dangerous
 */
const DANGEROUS_DOCKER_ARGS = new Set([
  '--privileged',
  '--cap-add',
  '--cap-drop',
  '--security-opt',
  '--user=root',
  '--user=0',
  '--pid=host',
  '--network=host',
  '--ipc=host',
  '--uts=host'
])

/**
 * Maximum allowed length for various input types
 */
const MAX_LENGTHS = {
  argument: 1000,
  scriptName: 100,
  containerName: 100,
  imageName: 200,
  serviceName: 100,
  filePath: 500
}

export interface ValidationResult {
  valid: boolean
  error?: string
  sanitized?: string
}

export interface ArrayValidationResult {
  valid: boolean
  error?: string
  sanitized?: string[]
}

/**
 * Validates and sanitizes a single argument for shell safety
 * @param arg - Argument to validate
 * @param maxLength - Maximum allowed length
 * @returns Validation result with sanitized value if valid
 */
export function validateArgument(arg: string, maxLength = MAX_LENGTHS.argument): ValidationResult {
  if (!arg || typeof arg !== 'string') {
    return { valid: false, error: 'Argument must be a non-empty string' }
  }

  if (arg.length > maxLength) {
    return { valid: false, error: `Argument too long (max ${maxLength} characters)` }
  }

  // Check for dangerous shell characters
  for (const char of arg) {
    if (DANGEROUS_SHELL_CHARS.has(char)) {
      return { valid: false, error: `Dangerous character '${char}' not allowed in arguments` }
    }
  }

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(arg)) {
      return { valid: false, error: 'Potentially dangerous command pattern detected' }
    }
  }

  return { valid: true, sanitized: arg.trim() }
}

/**
 * Validates an array of arguments
 * @param args - Array of arguments to validate
 * @returns Validation result with sanitized arguments if valid
 */
export function validateArgumentArray(args: string[]): ArrayValidationResult {
  if (!Array.isArray(args)) {
    return { valid: false, error: 'Arguments must be an array' }
  }

  if (args.length > 50) {
    return { valid: false, error: 'Too many arguments (max 50)' }
  }

  const sanitized: string[] = []
  for (const arg of args) {
    const result = validateArgument(arg)
    if (!result.valid) {
      return { valid: false, error: result.error || 'Invalid argument' }
    }
    sanitized.push(result.sanitized!)
  }

  return { valid: true, sanitized }
}

/**
 * Validates a file path for safety
 * @param path - File path to validate
 * @returns Validation result
 */
export function validateFilePath(path: string): ValidationResult {
  if (!path || typeof path !== 'string') {
    return { valid: false, error: 'File path must be a non-empty string' }
  }

  if (path.length > MAX_LENGTHS.filePath) {
    return { valid: false, error: `File path too long (max ${MAX_LENGTHS.filePath} characters)` }
  }

  // Normalize path to check for traversal attempts
  const normalizedPath = path.replace(/\\/g, '/').replace(/\/+/g, '/')

  // Check for directory traversal
  if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
    return { valid: false, error: 'Directory traversal not allowed' }
  }

  // Check for dangerous paths
  for (const dangerousPath of DANGEROUS_PATHS) {
    // Handle both exact matches and prefix matches with trailing slashes
    const pathToCheck = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/'
    if (pathToCheck.startsWith(dangerousPath) || normalizedPath === dangerousPath.slice(0, -1)) {
      return { valid: false, error: `Access to ${dangerousPath.slice(0, -1)} is not allowed` }
    }
  }

  // Check for null bytes (path truncation attack)
  if (normalizedPath.includes('\0')) {
    return { valid: false, error: 'Null bytes not allowed in file paths' }
  }

  return { valid: true, sanitized: normalizedPath }
}

/**
 * Validates Docker-specific arguments for dangerous flags
 * @param args - Docker arguments to validate
 * @returns Validation result
 */
export function validateDockerArgs(args: string[]): ArrayValidationResult {
  const argValidation = validateArgumentArray(args)
  if (!argValidation.valid) {
    return argValidation
  }

  // Check for dangerous Docker flags
  for (const arg of args) {
    if (DANGEROUS_DOCKER_ARGS.has(arg)) {
      return { 
        valid: false, 
        error: `Dangerous Docker argument '${arg}' is not allowed` 
      }
    }

    // Check for volume mounts to dangerous paths
    if (arg.startsWith('-v') || arg.startsWith('--volume')) {
      const volumeMatch = arg.match(/(?:-v|--volume)=?([^:]+):/)
      if (volumeMatch && volumeMatch[1]) {
        const hostPath = volumeMatch[1]
        const pathValidation = validateFilePath(hostPath)
        if (!pathValidation.valid) {
          return { 
            valid: false, 
            error: `Invalid volume mount: ${pathValidation.error || 'Invalid path'}` 
          }
        }
      }
    }
  }

  return argValidation
}

/**
 * Validates a script name for package.json execution
 * @param scriptName - Script name to validate
 * @returns Validation result
 */
export function validateScriptName(scriptName: string): ValidationResult {
  if (!scriptName || typeof scriptName !== 'string') {
    return { valid: false, error: 'Script name must be a non-empty string' }
  }

  if (scriptName.length > MAX_LENGTHS.scriptName) {
    return { valid: false, error: `Script name too long (max ${MAX_LENGTHS.scriptName} characters)` }
  }

  // Allow only alphanumeric, dash, underscore, and colon (for npm namespaces)
  if (!/^[a-zA-Z0-9_:-]+$/.test(scriptName)) {
    return { 
      valid: false, 
      error: 'Script name can only contain letters, numbers, dashes, underscores, and colons' 
    }
  }

  return { valid: true, sanitized: scriptName }
}

/**
 * Validates a container name
 * @param containerName - Container name to validate
 * @returns Validation result
 */
export function validateContainerName(containerName: string): ValidationResult {
  if (!containerName || typeof containerName !== 'string') {
    return { valid: false, error: 'Container name must be a non-empty string' }
  }

  if (containerName.length > MAX_LENGTHS.containerName) {
    return { valid: false, error: `Container name too long (max ${MAX_LENGTHS.containerName} characters)` }
  }

  // Docker container name validation
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(containerName)) {
    return { 
      valid: false, 
      error: 'Invalid container name format' 
    }
  }

  return { valid: true, sanitized: containerName }
}

/**
 * Validates an image name
 * @param imageName - Image name to validate
 * @returns Validation result
 */
export function validateImageName(imageName: string): ValidationResult {
  if (!imageName || typeof imageName !== 'string') {
    return { valid: false, error: 'Image name must be a non-empty string' }
  }

  if (imageName.length > MAX_LENGTHS.imageName) {
    return { valid: false, error: `Image name too long (max ${MAX_LENGTHS.imageName} characters)` }
  }

  // Basic Docker image name validation
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[a-zA-Z0-9_.-]+)?$/.test(imageName)) {
    return { 
      valid: false, 
      error: 'Invalid image name format' 
    }
  }

  return { valid: true, sanitized: imageName }
}

/**
 * Checks if an operation is potentially destructive and should require confirmation
 * @param action - Action being performed
 * @param args - Arguments for the action
 * @returns True if the operation is destructive
 */
export function isDestructiveOperation(action: string, args?: string[]): boolean {
  const destructiveActions = new Set([
    'rm', 'remove', 'down', 'stop', 'kill', 'prune', 'rmi', 'system'
  ])

  if (destructiveActions.has(action)) {
    return true
  }

  // Check for force flags in arguments
  if (args) {
    for (const arg of args) {
      if (arg.includes('--force') || arg.includes('-f') || arg.includes('--rm')) {
        return true
      }
    }
  }

  return false
}