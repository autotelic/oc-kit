/**
 * Package.json script tool implementations
 */

import type { ToolArgs } from './types.js'
import { detectPackageManager, getPackageJson, getScripts, buildPackageCommand } from './package-manager.js'
import { wrapWithDoppler } from './doppler.js'
import { executeCommand, formatCommandResult } from './execution.js'

/**
 * Executes a package.json script with package manager auto-detection and Doppler integration
 * @param args - Tool arguments containing script name and parameters
 * @returns Promise resolving to formatted command result
 */
export async function executePackageScript(args: ToolArgs): Promise<string> {
  const workingDir = args.cwd || process.cwd()

  try {
    const packageJson = await getPackageJson(workingDir)
    const scripts = getScripts(packageJson)

    if (!args.script) {
      return 'Error: script parameter is required'
    }

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
 * @returns Promise resolving to formatted list of available scripts
 */
export async function listPackageScripts(args: ToolArgs): Promise<string> {
  const workingDir = args.cwd || process.cwd()

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