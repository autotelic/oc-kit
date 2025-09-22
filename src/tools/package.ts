/**
 * Package.json script execution tools
 * Part of @autotelic/oc-kit
 */

import type { ToolArgs, OpenCodeContext } from '../types.js'
import { detectPackageManager, getPackageJson, getScripts, buildPackageCommand, discoverWorkspaces, findWorkspaceWithScript, type WorkspaceInfo } from '../core/package-manager.js'
import { wrapWithDoppler } from '../core/doppler.js'
import { executeCommand, formatCommandResult } from '../core/execution.js'
import { validateScriptName, validateArgumentArray } from '../core/security-validation.js'
import { checkScriptGuardrails, DEFAULT_SECURITY_CONFIG } from '../core/security-guardrails.js'
import { executeWithStreaming, shouldUseStreaming, isDevServerScript, createProgressLogger, createOutputStreamers } from '../core/streaming.js'
import { getOpenCodeTool } from '../core/plugin-compat.js'
import { resolveWorkingDirectory, areDevToolsAvailable } from '../utils/common.js'

// OpenCode plugin compatibility layer
const tool = await getOpenCodeTool()

// Load tool description
const DESCRIPTION = await Bun.file(`${import.meta.dir}/../../tool/kit.txt`).text()

/**
 * Converts a StreamingResult to CommandResult format for consistent formatting
 * @param streamingResult - Result from streaming execution
 * @returns CommandResult compatible object
 */
function streamingToCommandResult(streamingResult: any): any {
  return {
    command: streamingResult.command.split(' '), // Convert string back to array
    exitCode: streamingResult.exitCode,
    stdout: streamingResult.stdout,
    stderr: streamingResult.stderr,
    duration: undefined // Streaming doesn't track duration yet
  }
}

/**
 * Executes a dev server with appropriate warnings and timeout handling
 * @param command - Command to execute
 * @param commandArgs - Command arguments
 * @param executionDir - Directory to execute in
 * @param targetWorkspace - Target workspace info
 * @param scriptName - Name of the script being executed
 * @returns Promise resolving to formatted command result
 */
async function executeDevServerWithWarning(
  command: string,
  commandArgs: string[],
  executionDir: string,
  targetWorkspace: any,
  scriptName: string
): Promise<string> {
  const useStreaming = shouldUseStreaming(command, commandArgs)

  if (useStreaming) {
    // Use streaming execution with longer timeout for dev servers
    const progressLogger = createProgressLogger('📦')
    const { onStdout, onStderr } = createOutputStreamers('📤', '📥')

    const result = await executeWithStreaming(command, commandArgs, {
      cwd: executionDir,
      timeout: 30000, // 30 seconds timeout for dev servers
      onProgress: progressLogger,
      onStdout,
      onStderr
    })

    // Convert streaming result to CommandResult format and use enhanced formatting
    const commandResult = streamingToCommandResult(result)
    const workspaceNote = targetWorkspace.relativePath !== '.' 
      ? ` (workspace: ${targetWorkspace.name || targetWorkspace.relativePath})`
      : ''
    return formatCommandResult(commandResult, `${scriptName}${workspaceNote}`)
  } else {
    // Use regular execution for quick commands
    const result = await executeCommand([command, ...commandArgs], {
      cwd: executionDir
    })

    const workspaceNote = targetWorkspace.relativePath !== '.' 
      ? ` (workspace: ${targetWorkspace.name || targetWorkspace.relativePath})`
      : ''
    return formatCommandResult(result, `${scriptName}${workspaceNote}`)
  }
}

/**
 * Executes a package.json script with package manager auto-detection and Doppler integration.
 * Supports monorepo workspaces by automatically finding the workspace containing the script.
 * @param args - Tool arguments containing script name and parameters
 * @param context - OpenCode context containing session information
 * @returns Promise resolving to formatted command result
 */
export async function executePackageScript(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  // Use context working directory, then args.cwd, then fallback to process.cwd()
  const workingDir = resolveWorkingDirectory(args, context)

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

    // Discover all workspaces and find the one containing the script
    const workspaces = await discoverWorkspaces(workingDir)
    let targetWorkspace: WorkspaceInfo | undefined
    let executionDir = workingDir

    // If workspace is specified, try to find it first
    if (args.workspace) {
      const specifiedWorkspace = workspaces.find(ws => 
        ws.relativePath === args.workspace || 
        ws.path === args.workspace ||
        ws.name === args.workspace
      )
      
      if (specifiedWorkspace) {
        if (specifiedWorkspace.scripts[args.script]) {
          targetWorkspace = specifiedWorkspace
          executionDir = targetWorkspace.path
        } else {
          return `Script "${args.script}" not found in specified workspace "${args.workspace}". Available scripts in that workspace: ${Object.keys(specifiedWorkspace.scripts).join(', ')}`
        }
      } else {
        return `Workspace "${args.workspace}" not found. Available workspaces: ${workspaces.map(ws => ws.name || ws.relativePath).join(', ')}`
      }
    } else {
      // Auto-discovery mode
      // First, try to find the script in the current directory
      try {
        const packageJson = await getPackageJson(workingDir)
        const scripts = getScripts(packageJson)
        
        if (scripts[args.script]) {
          // Script found in current directory, use it
          targetWorkspace = {
            path: workingDir,
            relativePath: '.',
            packageJson,
            scripts,
            name: packageJson.name as string | undefined
          }
        }
      } catch {
        // Current directory doesn't have a package.json, continue with workspace search
      }

      // If not found in current directory, search all workspaces
      if (!targetWorkspace) {
        targetWorkspace = findWorkspaceWithScript(workspaces, args.script)
        
        if (targetWorkspace) {
          executionDir = targetWorkspace.path
        }
      }
    }

    if (!targetWorkspace) {
      // Collect all available scripts from all workspaces for better error message
      const allScripts = new Set<string>()
      for (const workspace of workspaces) {
        Object.keys(workspace.scripts).forEach(script => allScripts.add(script))
      }
      
      const availableScripts = Array.from(allScripts).sort()
      return `Script "${args.script}" not found in any workspace. Available scripts: ${availableScripts.join(', ')}`
    }



    const packageManager = args.packageManager || await detectPackageManager(executionDir)
    const baseCommand = buildPackageCommand(packageManager, args.script, args.args)
    const finalCommand = await wrapWithDoppler(baseCommand, executionDir, args.skipDoppler, args.script)

    // Check if this command should use streaming for real-time output
    const [command, ...commandArgs] = finalCommand
    if (!command) {
      return 'Error: Invalid command structure'
    }
    
    const useStreaming = shouldUseStreaming(command, commandArgs)
    const isDevServer = isDevServerScript(command, commandArgs)

    // For dev servers, check if dev tools are available and handle intelligently
    // Skip this logic if force flag is set
    if (isDevServer && !args.force) {
      const devToolsAvailable = await areDevToolsAvailable()
      const workspaceParam = targetWorkspace.relativePath !== '.' 
        ? `, workspace: "${targetWorkspace.name || targetWorkspace.relativePath}"` 
        : ''
      
      if (devToolsAvailable) {
        // If dev tools are available, recommend using kit_devStart
        return `💡 Dev server detected! For long-running dev servers, use kit_devStart instead:

  kit_devStart { script: "${args.script}"${workspaceParam} }

This runs the server in the background without blocking your session. Use kit_devStatus to monitor it.

If you prefer to run it in the foreground anyway, add --force flag to kit_run.`
      } else {
        // If dev tools are not available, continue with regular execution but with a longer timeout for dev servers
        return await executeDevServerWithWarning(command, commandArgs, executionDir, targetWorkspace, args.script)
      }
    }

    if (useStreaming) {
      // Use streaming execution for long-running commands
      const progressLogger = createProgressLogger('📦')
      const { onStdout, onStderr } = createOutputStreamers('📤', '📥')

      const result = await executeWithStreaming(command, commandArgs, {
        cwd: executionDir,
        timeout: 300000, // 5 minutes for package operations
        onProgress: progressLogger,
        onStdout,
        onStderr
      })

      // Convert streaming result to CommandResult format and use enhanced formatting
      const commandResult = streamingToCommandResult(result)
      const workspaceNote = targetWorkspace.relativePath !== '.' 
        ? ` (workspace: ${targetWorkspace.name || targetWorkspace.relativePath})`
        : ''
      return formatCommandResult(commandResult, `${args.script}${workspaceNote}`)
    } else {
      // Use regular execution for quick commands
      const result = await executeCommand(finalCommand, {
        cwd: executionDir
      })

      const workspaceNote = targetWorkspace.relativePath !== '.' 
        ? ` (workspace: ${targetWorkspace.name || targetWorkspace.relativePath})`
        : ''
      return formatCommandResult(result, `${args.script}${workspaceNote}`)
    }
  } catch (error) {
    return `Error: ${(error as Error).message}`
  }
}

/**
 * Lists all available package.json scripts in the current project and all workspaces
 * @param args - Tool arguments containing optional working directory
 * @param context - OpenCode context containing session information
 * @returns Promise resolving to formatted list of available scripts from all workspaces
 */
export async function listPackageScripts(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  // Use context working directory, then args.cwd, then fallback to process.cwd()
  const workingDir = resolveWorkingDirectory(args, context)

  try {
    // Discover all workspaces in the project
    const workspaces = await discoverWorkspaces(workingDir)
    
    if (workspaces.length === 0) {
      return 'No package.json files found in the project'
    }

    // Sort workspaces by relative path for consistent output
    workspaces.sort((a, b) => a.relativePath.localeCompare(b.relativePath))

    const output: string[] = []
    
    for (const workspace of workspaces) {
      const scriptEntries = Object.entries(workspace.scripts)
      
      if (scriptEntries.length === 0) {
        continue // Skip workspaces with no scripts
      }

      const workspaceHeader = workspace.name 
        ? `${workspace.name} (${workspace.relativePath})`
        : workspace.relativePath

      output.push(`\n📦 ${workspaceHeader}:`)
      
      const scriptList = scriptEntries
        .map(([name, command]) => `  ${name}: ${command}`)
        .join('\n')
      
      output.push(scriptList)
    }

    if (output.length === 0) {
      return 'No scripts found in any workspace'
    }

    return `Available scripts across all workspaces:${output.join('\n')}`
  } catch (error) {
    return `Error discovering workspaces: ${(error as Error).message}`
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
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)'),
    workspace: tool.schema.string().optional().describe('Specific workspace path to run the script in (auto-detected if not specified)'),
    force: tool.schema.boolean().optional().describe('Force execution without dev server detection and recommendations')
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
  description: 'List all available package.json scripts with workspace detection and filtering capabilities',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return listPackageScripts(args, context)
  }
})