/**
 * Command execution utilities with timeout and error handling
 */

import type { CommandResult, ExecutionOptions } from '../types.js'

/**
 * Executes a shell command with timeout protection and structured error handling
 * @param command - Array of command and arguments to execute
 * @param options - Execution options including working directory and timeout
 * @returns Promise resolving to structured command result with timing
 */
export async function executeCommand(
  command: string[],
  options: ExecutionOptions
): Promise<CommandResult> {
  const startTime = Date.now()
  
  try {
    // eslint-disable-next-line no-undef
    const proc = Bun.spawn(command, {
      cwd: options.cwd,
      stdout: 'pipe',
      stderr: 'pipe'
    })

    const timeoutMs = options.timeout || 120000 // 2 minutes default
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)), timeoutMs)
    })

    const result = await Promise.race([
      Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited
      ]),
      timeoutPromise
    ])

    const [stdout, stderr, exitCode] = result
    const duration = Date.now() - startTime

    return {
      command,
      exitCode,
      stdout,
      stderr,
      duration
    }
  } catch (error) {
    const duration = Date.now() - startTime
    return {
      command,
      exitCode: -1,
      stdout: '',
      stderr: `Error: ${(error as Error).message}`,
      duration
    }
  }
}

/**
 * Formats a command result into a user-friendly string with enhanced output
 * @param result - Command execution result to format
 * @param scriptName - Optional script name for context-aware messaging
 * @returns Enhanced formatted string with success indicators and relevant information
 */
export function formatCommandResult(result: CommandResult, scriptName?: string): string {
  const duration = result.duration ? `(${(result.duration / 1000).toFixed(1)}s)` : ''
  const isSuccess = result.exitCode === 0
  const statusIcon = isSuccess ? '✅' : '❌'
  
  // Generate context-aware success message
  let contextMessage = ''
  if (isSuccess && scriptName) {
    contextMessage = getContextMessage(scriptName, result)
  }
  
  // Build output sections
  const sections: string[] = []
  
  // Status line
  const statusLine = isSuccess 
    ? `${statusIcon} ${scriptName || 'Command'} completed successfully ${duration}`
    : `${statusIcon} ${scriptName || 'Command'} failed ${duration}`
  sections.push(statusLine)
  
  // Context message for successful operations
  if (contextMessage) {
    sections.push(contextMessage)
  }
  
  // Show command details for failures or when explicitly needed
  if (!isSuccess) {
    sections.push(`\n🔧 Command: ${result.command.join(' ')}`)
    sections.push(`📉 Exit code: ${result.exitCode}`)
  }
  
  // Show stdout if it contains meaningful content
  if (result.stdout.trim() && !isInternalOutput(result.stdout)) {
    const stdoutHeader = isSuccess ? '📄 Output:' : '📄 Stdout:'
    sections.push(`\n${stdoutHeader}\n${result.stdout.trim()}`)
  }
  
  // Show stderr for failures or when it contains meaningful content
  if (result.stderr.trim() && (!isSuccess || !isInternalOutput(result.stderr))) {
    const stderrHeader = isSuccess ? '⚠️  Warnings:' : '❌ Error details:'
    sections.push(`\n${stderrHeader}\n${result.stderr.trim()}`)
  }
  
  // Add suggestions for failures
  if (!isSuccess && scriptName) {
    const suggestions = getSuggestions(scriptName, result)
    if (suggestions) {
      sections.push(`\n💡 Suggestions:\n${suggestions}`)
    }
  }
  
  return sections.join('\n')
}

/**
 * Generates context-aware success messages based on script type and output
 * @param scriptName - Name of the script that was executed
 * @param result - Command execution result
 * @returns Context-aware message string or empty string
 */
function getContextMessage(scriptName: string, result: CommandResult): string {
  const stdout = result.stdout.toLowerCase()
  
  // Build scripts
  if (scriptName.includes('build')) {
    if (stdout.includes('built') || stdout.includes('compiled')) {
      return '🏗️  Build artifacts generated'
    }
    return '🏗️  Build process completed'
  }
  
  // Test scripts
  if (scriptName.includes('test')) {
    const testMatch = stdout.match(/(\d+)\s+(?:tests?|specs?)\s+passed/i)
    if (testMatch) {
      return `✅ ${testMatch[1]} tests passed`
    }
    if (stdout.includes('passed') || stdout.includes('ok')) {
      return '✅ All tests passed'
    }
    return '🧪 Test suite completed'
  }
  
  // Lint scripts
  if (scriptName.includes('lint')) {
    if (stdout.includes('no problems') || stdout.includes('0 errors')) {
      return '🧹 No linting issues found'
    }
    return '🧹 Linting completed'
  }
  
  // Type check scripts
  if (scriptName.includes('typecheck') || scriptName.includes('type-check')) {
    if (stdout.includes('no errors') || result.stderr.includes('no errors')) {
      return '🔍 No type errors found'
    }
    return '🔍 Type checking completed'
  }
  
  // Dev/start scripts
  if (scriptName.includes('dev') || scriptName.includes('start')) {
    if (stdout.includes('ready') || stdout.includes('listening') || stdout.includes('server')) {
      return '🚀 Server is ready'
    }
    return '🚀 Development server started'
  }
  
  // Install scripts
  if (scriptName.includes('install') || scriptName === 'i') {
    const packagesMatch = stdout.match(/(\d+)\s+packages?/i)
    if (packagesMatch) {
      return `📦 ${packagesMatch[1]} packages installed`
    }
    return '📦 Dependencies installed'
  }
  
  return ''
}

/**
 * Determines if output contains mostly internal/technical noise that users don't need to see
 * @param output - Command output to analyze
 * @returns True if output appears to be internal/technical noise
 */
function isInternalOutput(output: string): boolean {
  const lowerOutput = output.toLowerCase()
  
  // Common technical noise patterns
  const noisePatterns = [
    /^[\s\n]*$/,  // Empty or whitespace only
    /^done in \d+(\.\d+)?s\.?$/i,  // Package manager completion messages
    /^added \d+ packages?/i,  // npm install completion
    /^audited \d+ packages?/i,  // npm audit messages
    /^found \d+ vulnerabilities/i,  // npm audit warnings (unless high severity)
    /^up to date/i,  // npm already up to date
    /^[\d\s\-\[\]:\.T]*$/,  // Timestamps and numbers only
  ]
  
  // Check if entire output matches noise patterns
  for (const pattern of noisePatterns) {
    if (pattern.test(output.trim())) {
      return true
    }
  }
  
  // Check for very short, uninformative messages
  const trimmed = output.trim()
  if (trimmed.length < 10 && !/error|fail|warn/i.test(trimmed)) {
    return true
  }
  
  // Technical debug output patterns
  if (lowerOutput.includes('debug:') || 
      lowerOutput.includes('verbose:') ||
      lowerOutput.startsWith('[object object]')) {
    return true
  }
  
  return false
}

/**
 * Provides helpful suggestions for failed commands based on script type and error patterns
 * @param scriptName - Name of the script that failed
 * @param result - Command execution result with error information
 * @returns Helpful suggestions string or empty string
 */
function getSuggestions(scriptName: string, result: CommandResult): string {
  const stderr = result.stderr.toLowerCase()
  const stdout = result.stdout.toLowerCase()
  const combinedOutput = `${stderr} ${stdout}`
  
  const suggestions: string[] = []
  
  // General dependency issues
  if (combinedOutput.includes('module not found') || 
      combinedOutput.includes('cannot resolve') ||
      combinedOutput.includes('package not found')) {
    suggestions.push('• Try running `npm install` or `yarn install` to ensure dependencies are installed')
  }
  
  // Permission issues
  if (combinedOutput.includes('permission denied') || 
      combinedOutput.includes('eacces')) {
    suggestions.push('• Check file permissions or try running with appropriate privileges')
  }
  
  // Port already in use (common with dev servers)
  if (combinedOutput.includes('port') && combinedOutput.includes('use')) {
    suggestions.push('• Another process may be using the same port - try killing existing processes or use a different port')
  }
  
  // Out of memory issues
  if (combinedOutput.includes('out of memory') || 
      combinedOutput.includes('heap out of memory')) {
    suggestions.push('• Try increasing Node.js memory limit with `--max-old-space-size=4096`')
  }
  
  // Script-specific suggestions
  if (scriptName.includes('build')) {
    if (combinedOutput.includes('type') && combinedOutput.includes('error')) {
      suggestions.push('• Run type checking first: `npm run typecheck` or similar')
    }
    if (combinedOutput.includes('lint')) {
      suggestions.push('• Fix linting issues first: `npm run lint` or similar')
    }
  }
  
  if (scriptName.includes('test')) {
    if (combinedOutput.includes('timeout')) {
      suggestions.push('• Tests may be taking too long - consider increasing timeout or optimizing slow tests')
    }
    if (combinedOutput.includes('coverage')) {
      suggestions.push('• Check test coverage requirements in your configuration')
    }
  }
  
  // Docker-related suggestions
  if (combinedOutput.includes('docker')) {
    if (combinedOutput.includes('not found') || combinedOutput.includes('not running')) {
      suggestions.push('• Ensure Docker is installed and running')
    }
    if (combinedOutput.includes('pull access denied')) {
      suggestions.push('• Check Docker registry authentication or image name')
    }
  }
  
  // Git-related suggestions
  if (combinedOutput.includes('git')) {
    if (combinedOutput.includes('not a git repository')) {
      suggestions.push('• Initialize git repository with `git init`')
    }
    if (combinedOutput.includes('remote') && combinedOutput.includes('exist')) {
      suggestions.push('• Check git remote configuration with `git remote -v`')
    }
  }
  
  // If no specific suggestions, provide general troubleshooting
  if (suggestions.length === 0) {
    if (result.exitCode > 0) {
      suggestions.push('• Check the error details above and refer to the tool\'s documentation')
      suggestions.push('• Try running the command with verbose flags for more details')
    }
  }
  
  return suggestions.join('\n')
}

/**
 * Determines appropriate timeout for Docker operations based on action type
 * @param action - Docker action being performed
 * @param customTimeout - Optional custom timeout override
 * @returns Timeout in milliseconds
 */
export function getDockerTimeout(action: string, customTimeout?: number): number {
  if (customTimeout) return customTimeout
  
  switch (action) {
    case 'build':
    case 'pull':
    case 'push':
      return 5 * 60 * 1000 // 5 minutes for potentially long operations
    case 'logs':
      return 30 * 1000 // 30 seconds for log viewing
    default:
      return 30 * 1000 // 30 seconds for quick operations
  }
}

/**
 * Determines appropriate timeout for Docker Compose operations based on action type
 * @param action - Docker Compose action being performed
 * @param customTimeout - Optional custom timeout override
 * @returns Timeout in milliseconds
 */
export function getComposeTimeout(action: string, customTimeout?: number): number {
  if (customTimeout) return customTimeout
  
  switch (action) {
    case 'build':
    case 'up':
    case 'pull':
      return 5 * 60 * 1000 // 5 minutes for potentially long operations
    case 'logs':
      return 30 * 1000 // 30 seconds for log viewing
    default:
      return 60 * 1000 // 1 minute for other compose operations
  }
}