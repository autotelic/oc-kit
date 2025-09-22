/**
 * Real-time output streaming for long-running operations
 * Provides live progress feedback instead of waiting for command completion
 */

import type { Subprocess } from 'bun'

/**
 * Result of streaming command execution
 */
export interface StreamingResult {
  /** Whether the command completed successfully */
  success: boolean
  /** Exit code returned by the command */
  exitCode: number
  /** Standard output from the command */
  stdout: string
  /** Standard error output from the command */
  stderr: string
  /** The command that was executed */
  command: string
}

/**
 * Configuration for streaming execution
 */
export interface StreamingOptions {
  /** Working directory for command execution */
  cwd?: string
  /** Environment variables to pass to the command */
  env?: Record<string, string>
  /** Timeout in milliseconds */
  timeout?: number
  /** Whether to capture output for final result */
  captureOutput?: boolean
  /** Callback for real-time stdout data */
  onStdout?: (data: string) => void
  /** Callback for real-time stderr data */
  onStderr?: (data: string) => void
  /** Callback for progress updates */
  onProgress?: (message: string) => void
}

/**
 * Executes a command with real-time output streaming using Bun.spawn
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Streaming configuration options
 * @returns Promise that resolves with execution result
 */
export function executeWithStreaming(
  command: string,
  args: string[] = [],
  options: StreamingOptions = {}
): Promise<StreamingResult> {
  return new Promise((resolve, reject) => {
    const {
      cwd = process.cwd(),
      env = {},
      timeout,
      captureOutput = true,
      onStdout,
      onStderr,
      onProgress
    } = options

    let stdout = ''
    let stderr = ''
    let isTimedOut = false

    onProgress?.(`Starting: ${command} ${args.join(' ')}`)

    // Spawn process using Bun.spawn
    const proc: Subprocess = Bun.spawn([command, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    // Set up timeout if specified
    let timeoutId: NodeJS.Timeout | undefined
    if (timeout) {
      timeoutId = setTimeout(() => {
        isTimedOut = true
        proc.kill()
        
        // Force kill after 5 seconds if first kill doesn't work
        setTimeout(() => {
          if (proc.exitCode === null) {
            proc.kill(9) // SIGKILL
          }
        }, 5000)
      }, timeout)
    }

    // Handle stdout streaming
    if (proc.stdout && typeof proc.stdout !== 'number') {
      const reader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      
      ;(async () => {
        try {
          while (true) {
            try {
              const { done, value } = await reader.read()
              if (done) break
              
              const text = decoder.decode(value)
              if (captureOutput) {
                stdout += text
              }
              onStdout?.(text)
            } catch (error) {
              // Stream read error - stop reading but don't fail the whole process
              onProgress?.(`⚠️  Stdout stream error: ${error}`)
              break
            }
          }
        } catch (error) {
          // Reader setup failed
          onProgress?.(`⚠️  Stdout reader error: ${error}`)
        } finally {
          try {
            reader.releaseLock()
          } catch {
            // Ignore releaseLock errors
          }
        }
      })()
    }

    // Handle stderr streaming
    if (proc.stderr && typeof proc.stderr !== 'number') {
      const reader = proc.stderr.getReader()
      const decoder = new TextDecoder()
      
      ;(async () => {
        try {
          while (true) {
            try {
              const { done, value } = await reader.read()
              if (done) break
              
              const text = decoder.decode(value)
              if (captureOutput) {
                stderr += text
              }
              onStderr?.(text)
            } catch (error) {
              // Stream read error - stop reading but don't fail the whole process
              onProgress?.(`⚠️  Stderr stream error: ${error}`)
              break
            }
          }
        } catch (error) {
          // Reader setup failed
          onProgress?.(`⚠️  Stderr reader error: ${error}`)
        } finally {
          try {
            reader.releaseLock()
          } catch {
            // Ignore releaseLock errors
          }
        }
      })()
    }

    // Handle process completion
    proc.exited.then((exitCode) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (isTimedOut) {
        onProgress?.('❌ Command timed out')
        reject(new Error(`Command timed out after ${timeout}ms`))
        return
      }

      const finalExitCode = exitCode ?? 1
      
      if (finalExitCode === 0) {
        onProgress?.('✅ Command completed successfully')
      } else {
        onProgress?.(`❌ Command failed with exit code ${finalExitCode}`)
      }

      resolve({
        success: finalExitCode === 0,
        exitCode: finalExitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: `${command} ${args.join(' ')}`
      })
    }).catch((error) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      onProgress?.(`❌ Failed to execute command: ${error.message}`)
      reject(error)
    })
  })
}

/**
 * Creates a progress callback that collects status updates
 * @param _prefix - Optional prefix for progress messages (unused to prevent TUI interference)
 * @returns Progress callback function that collects messages
 */
export function createProgressLogger(_prefix = '⏳'): (message: string) => void {
  return (_message: string) => {
    // Don't log to console - just collect the message for final output
    // The calling function will handle displaying progress appropriately
  }
}

/**
 * Creates output callbacks that collect output without interfering with TUI
 * @param _stdoutPrefix - Prefix for stdout lines (unused to prevent TUI interference)
 * @param _stderrPrefix - Prefix for stderr lines (unused to prevent TUI interference)
 * @returns Object with stdout and stderr callback functions
 */
export function createOutputStreamers(
  _stdoutPrefix = '📤',
  _stderrPrefix = '📥'
): {
  onStdout: (data: string) => void
  onStderr: (data: string) => void
} {
  return {
    onStdout: (_data: string) => {
      // Don't stream to console - prevents TUI interference
      // Output will be captured and displayed in final result
    },
    onStderr: (_data: string) => {
      // Don't stream to console - prevents TUI interference  
      // Output will be captured and displayed in final result
    }
  }
}

/**
 * Detects if a command is likely to be long-running based on name and args
 * @param command - Command name  
 * @param args - Command arguments
 * @returns Whether the command should use streaming by default
 */
export function shouldUseStreaming(command: string, args: string[] = []): boolean {
  // Re-enabled streaming for better timeout handling and execution
  // Console logging has been disabled to prevent TUI interference
  
  const longRunningCommands = [
    'npm', 'yarn', 'pnpm', 'bun',           // Package managers
    'docker', 'docker-compose',             // Docker commands
    'webpack', 'vite', 'rollup',           // Build tools
    'jest', 'mocha', 'vitest',             // Test runners
    'tsc', 'babel',                        // Compilers
    'eslint', 'prettier'                   // Linters/formatters
  ]

  const longRunningScripts = [
    'build', 'test', 'watch', 'dev', 'start',
    'install', 'publish', 'deploy', 'bundle'
  ]

  // Check if command itself is long-running
  if (longRunningCommands.includes(command)) {
    return true
  }

  // Check if any args suggest long-running operation
  for (const arg of args) {
    if (longRunningScripts.some(script => arg.includes(script))) {
      return true
    }
    // Check for watch modes
    if (arg.includes('--watch') || arg.includes('-w')) {
      return true
    }
  }

  return false
}

/**
 * Determines if a script is likely a dev server that should run indefinitely
 * @param command - The command being executed
 * @param args - Command arguments
 * @returns Whether this is likely a dev server script
 */
export function isDevServerScript(command: string, args: string[] = []): boolean {
  const devServerCommands = ['npm', 'yarn', 'pnpm', 'bun']
  const devServerScripts = ['dev', 'start', 'serve', 'server']
  
  // Check if it's a package manager running a dev-like script
  if (devServerCommands.includes(command)) {
    for (const arg of args) {
      if (devServerScripts.some(script => arg === script || arg.includes(script))) {
        return true
      }
    }
  }
  
  return false
}