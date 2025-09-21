/**
 * Real-time output streaming for long-running operations
 * Provides live progress feedback instead of waiting for command completion
 */

import { spawn, type SpawnOptionsWithoutStdio } from 'child_process'

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
 * Executes a command with real-time output streaming
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

    const spawnOptions: SpawnOptionsWithoutStdio = {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    }

    onProgress?.(`Starting: ${command} ${args.join(' ')}`)

    const child = spawn(command, args, spawnOptions)

    // Set up timeout if specified
    let timeoutId: NodeJS.Timeout | undefined
    if (timeout) {
      timeoutId = setTimeout(() => {
        isTimedOut = true
        child.kill('SIGTERM')
        
        // Force kill after 5 seconds if SIGTERM doesn't work
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL')
          }
        }, 5000)
      }, timeout)
    }

    // Handle stdout
    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      if (captureOutput) {
        stdout += text
      }
      onStdout?.(text)
    })

    // Handle stderr
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      if (captureOutput) {
        stderr += text
      }
      onStderr?.(text)
    })

    // Handle process exit
    child.on('close', (code, signal) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      if (isTimedOut) {
        onProgress?.('❌ Command timed out')
        reject(new Error(`Command timed out after ${timeout}ms`))
        return
      }

      const exitCode = code ?? (signal ? 1 : 0)
      
      if (exitCode === 0) {
        onProgress?.('✅ Command completed successfully')
      } else {
        onProgress?.(`❌ Command failed with exit code ${exitCode}`)
      }

      resolve({
        success: exitCode === 0,
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        command: `${command} ${args.join(' ')}`
      })
    })

    // Handle spawn errors
    child.on('error', (error) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      onProgress?.(`❌ Failed to start command: ${error.message}`)
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