/**
 * Package.json script tool implementations
 */

import type { ToolArgs, OpenCodeContext } from './types.js'
import { detectPackageManager, getPackageJson, getScripts, buildPackageCommand } from './package-manager.js'
import { wrapWithDoppler } from './doppler.js'
import { executeCommand, formatCommandResult } from './execution.js'
import { validateScriptName, validateArgumentArray } from './security-validation.js'
import { checkScriptGuardrails, DEFAULT_SECURITY_CONFIG } from './security-guardrails.js'

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

    const result = await executeCommand(finalCommand, {
      cwd: workingDir
    })

    return formatCommandResult(result)
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