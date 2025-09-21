/**
 * Package.json script execution tools
 * Part of @autotelic/oc-kit
 */

import type { ToolArgs, OpenCodeContext } from '../types.js'
import { detectPackageManager, getPackageJson, getScripts, buildPackageCommand } from '../core/package-manager.js'
import { wrapWithDoppler } from '../core/doppler.js'
import { executeCommand, formatCommandResult } from '../core/execution.js'
import { validateScriptName, validateArgumentArray } from '../core/security-validation.js'
import { checkScriptGuardrails, DEFAULT_SECURITY_CONFIG } from '../core/security-guardrails.js'
import { executeWithStreaming, shouldUseStreaming, createProgressLogger, createOutputStreamers } from '../core/streaming.js'

// OpenCode plugin compatibility layer
const toolModule = await import('@opencode-ai/plugin').catch(() => {
  const mockDescribe = { 
    describe: (_d: string) => mockDescribe,
    optional: () => mockDescribe,
    _zod: true as any
  }
  const mockOptional = { 
    describe: (_d: string) => mockOptional,
    optional: () => mockDescribe,
    _zod: true as any
  }
  
  return {
    tool: Object.assign((config: any) => config, {
      schema: {
        string: () => mockDescribe,
        array: () => mockOptional,
        enum: () => mockOptional,
        boolean: () => mockOptional,
        number: () => mockOptional
      }
    })
  }
})
const { tool } = toolModule

// Load tool description
// eslint-disable-next-line no-undef
const DESCRIPTION = await Bun.file(`${import.meta.dir}/../../tool/kit.txt`).text()

/**
 * Executes a package.json script with package manager auto-detection and Doppler integration
 * @param args - Tool arguments containing script name and parameters
 * @param context - OpenCode context containing session information
 * @returns Promise resolving to formatted command result
 */
export async function executePackageScript(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  // Use context working directory, then args.cwd, then fallback to process.cwd()
  const workingDir = args.cwd || context.cwd || process.cwd()

  try {
    if (!args.script) {
      return 'Error: script parameter is required'
    }

    // Validate script name
    const scriptValidation = validateScriptName(args.script)
    if (!scriptValidation.valid) {
      return `Invalid script name: ${scriptValidation.error}`
    }

    // Check security guardrails for the script
    const guardrailResult = checkScriptGuardrails(args.script, DEFAULT_SECURITY_CONFIG)
    if (!guardrailResult.allowed) {
      return `Security: ${guardrailResult.reason}`
    }
    if (guardrailResult.requiresConfirmation) {
      return `Security Warning: ${guardrailResult.reason}. Add --confirm flag to proceed.`
    }

    // Validate arguments if provided
    if (args.args && args.args.length > 0) {
      const argsValidation = validateArgumentArray(args.args)
      if (!argsValidation.valid) {
        return `Invalid arguments: ${argsValidation.error}`
      }
    }

    const packageJson = await getPackageJson(workingDir)
    const scripts = getScripts(packageJson)

    if (!scripts[args.script]) {
      const availableScripts = Object.keys(scripts)
      return `Script "${args.script}" not found. Available scripts: ${availableScripts.join(', ')}`
    }

    const packageManager = args.packageManager || await detectPackageManager(workingDir)
    const baseCommand = buildPackageCommand(packageManager, args.script, args.args)
    const finalCommand = await wrapWithDoppler(baseCommand, workingDir, args.skipDoppler, args.script)

    // Check if this command should use streaming for real-time output
    const [command, ...commandArgs] = finalCommand
    if (!command) {
      return 'Error: Invalid command structure'
    }
    
    const useStreaming = shouldUseStreaming(command, commandArgs)

    if (useStreaming) {
      // Use streaming execution for long-running commands
      const progressLogger = createProgressLogger('📦')
      const { onStdout, onStderr } = createOutputStreamers('📤', '📥')

      const result = await executeWithStreaming(command, commandArgs, {
        cwd: workingDir,
        timeout: 300000, // 5 minutes for package operations
        onProgress: progressLogger,
        onStdout,
        onStderr
      })

      return `Command: ${result.command}\nExit code: ${result.exitCode}\n\nFinal stdout:\n${result.stdout}\n\nFinal stderr:\n${result.stderr}`
    } else {
      // Use regular execution for quick commands
      const result = await executeCommand(finalCommand, {
        cwd: workingDir
      })

      return formatCommandResult(result)
    }
  } catch (error) {
    return `Error: ${(error as Error).message}`
  }
}

/**
 * Lists all available package.json scripts in the current project
 * @param args - Tool arguments containing optional working directory
 * @param context - OpenCode context containing session information
 * @returns Promise resolving to formatted list of available scripts
 */
export async function listPackageScripts(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  // Use context working directory, then args.cwd, then fallback to process.cwd()
  const workingDir = args.cwd || context.cwd || process.cwd()

  try {
    const packageJson = await getPackageJson(workingDir)
    const scripts = getScripts(packageJson)
    
    // eslint-disable-next-line no-undef
    const packagePath = Bun.resolveSync('./package.json', workingDir)

    const scriptList = Object.entries(scripts)
      .map(([name, command]) => `  ${name}: ${command}`)
      .join('\n')

    return `Available scripts in ${packagePath}:\n${scriptList}`
  } catch (error) {
    return `Error reading package.json: ${(error as Error).message}`
  }
}

/**
 * Custom opencode tool for running package.json scripts with smart automation and Doppler integration.
 * 
 * This is an Autotelic-built tool that provides superior automation over bash commands for package.json
 * scripts and Docker operations. It auto-detects package managers, integrates with Doppler for environment
 * variables, and provides structured output with proper error handling.
 * 
 * @see https://github.com/autotelic/oc-kit - Source code and documentation
 * @see https://opencode.ai/docs/custom-tools - opencode custom tools documentation
 */
export const run = tool({
  description: DESCRIPTION,
  args: {
    script: tool.schema.string().describe("Name of the script to run (e.g., 'build', 'test', 'dev')"),
    args: tool.schema.array(tool.schema.string()).optional().describe('Additional arguments to pass to the script'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)'),
    packageManager: tool.schema.enum(['npm', 'yarn', 'pnpm', 'bun']).optional().describe('Package manager to use (auto-detected if not specified)'),
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executePackageScript(args, context)
  }
})

/**
 * Custom opencode tool for listing all available scripts in package.json.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const list = tool({
  description: 'List all available scripts in package.json',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return listPackageScripts(args, context)
  }
})