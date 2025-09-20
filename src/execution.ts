/**
 * Command execution utilities with timeout and error handling
 */

import type { CommandResult, ExecutionOptions } from './types.js'

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

export function formatCommandResult(result: CommandResult): string {
  return `Command: ${result.command.join(' ')}\nExit code: ${result.exitCode}\n\nStdout:\n${result.stdout}\n\nStderr:\n${result.stderr}`
}

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