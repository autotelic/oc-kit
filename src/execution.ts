/**
 * Command execution utilities with timeout and error handling
 */

import type { CommandResult, ExecutionOptions } from './types.js'

/**
 * Executes a shell command with timeout protection and structured error handling
 * @param command - Array of command and arguments to execute
 * @param options - Execution options including working directory and timeout
 * @returns Promise resolving to structured command result
 */
export async function executeCommand(
  command: string[],
  options: ExecutionOptions
): Promise<CommandResult> {
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

    return {
      command,
      exitCode,
      stdout,
      stderr
    }
  } catch (error) {
    return {
      command,
      exitCode: -1,
      stdout: '',
      stderr: `Error: ${(error as Error).message}`
    }
  }
}

/**
 * Formats a command result into a human-readable string
 * @param result - Command execution result to format
 * @returns Formatted string with command, exit code, stdout, and stderr
 */
export function formatCommandResult(result: CommandResult): string {
  return `Command: ${result.command.join(' ')}\nExit code: ${result.exitCode}\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`
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