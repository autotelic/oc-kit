/**
 * Development server management tools
 * True background process spawning within OpenCode sessions
 */

import { spawn, ChildProcess } from 'child_process'
import { join, dirname } from 'path'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import type { ToolArgs, OpenCodeContext } from './types.js'
import { getPackageJson, getScripts, detectPackageManager } from './package-manager.js'
import { wrapWithDoppler } from './doppler.js'

interface BackgroundProcess {
  pid: number
  script: string
  cwd: string
  startTime: number
  command: string[]
}

interface ProcessRegistry {
  processes: Record<string, BackgroundProcess>
}

/**
 * Get the process registry file path
 */
function getRegistryPath(workingDir: string): string {
  const ocDir = join(workingDir, '.opencode')
  return join(ocDir, 'processes.json')
}

/**
 * Load process registry
 */
function loadRegistry(workingDir: string): ProcessRegistry {
  const registryPath = getRegistryPath(workingDir)
  
  if (!existsSync(registryPath)) {
    return { processes: {} }
  }
  
  try {
    const content = readFileSync(registryPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return { processes: {} }
  }
}

/**
 * Save process registry
 */
function saveRegistry(workingDir: string, registry: ProcessRegistry): void {
  const registryPath = getRegistryPath(workingDir)
  const ocDir = dirname(registryPath)
  
  // Ensure .opencode directory exists
  mkdirSync(ocDir, { recursive: true })
  
  writeFileSync(registryPath, JSON.stringify(registry, null, 2))
}

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0) // Signal 0 checks if process exists
    return true
  } catch {
    return false
  }
}

/**
 * Clean up dead processes from registry
 */
function cleanupRegistry(workingDir: string): ProcessRegistry {
  const registry = loadRegistry(workingDir)
  
  for (const [key, proc] of Object.entries(registry.processes)) {
    if (!isProcessRunning(proc.pid)) {
      delete registry.processes[key]
    }
  }
  
  saveRegistry(workingDir, registry)
  return registry
}

/**
 * Starts a development server in true background within OpenCode session
 * @param args - Tool arguments containing optional script name and working directory  
 * @param context - OpenCode context containing session information
 * @returns Promise resolving immediately after starting background process
 */
export async function executeDevStart(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  // Use context working directory, then args.cwd, then fallback to process.cwd()
  const workingDir = args.cwd || context.cwd || process.cwd()

  try {
    // Clean up any dead processes first
    const registry = cleanupRegistry(workingDir)
    
    // Auto-detect development script if not specified
    let devScript = args.script
    
    if (!devScript) {
      const packageJson = await getPackageJson(workingDir)
      const scripts = getScripts(packageJson)
      
      // Common development script names in priority order
      const devScriptCandidates = ['dev', 'start', 'serve', 'develop']
      
      for (const candidate of devScriptCandidates) {
        if (scripts[candidate]) {
          devScript = candidate
          break
        }
      }
      
      if (!devScript) {
        const availableScripts = Object.keys(scripts)
        return `No development script found. Available scripts: ${availableScripts.join(', ')}\n\nTry specifying a script manually with: kit_devStart { script: "your-script-name" }`
      }
    }

    // Check if this script is already running
    const processKey = `${devScript}-${workingDir}`
    if (registry.processes[processKey]) {
      const proc = registry.processes[processKey]
      if (isProcessRunning(proc.pid)) {
        return `Development server already running!\n\n**Script:** \`${devScript}\`\n**PID:** ${proc.pid}\n**Started:** ${new Date(proc.startTime).toLocaleTimeString()}\n**Working directory:** \`${workingDir}\``
      } else {
        // Clean up dead process
        delete registry.processes[processKey]
      }
    }

    // Detect package manager and build command
    const packageManager = await detectPackageManager(workingDir)
    let command = [packageManager, 'run', devScript]

    // Add Doppler if available
    const wrappedCommand = await wrapWithDoppler(command, workingDir, false)
    command = wrappedCommand

    // Spawn the process in background
    const child: ChildProcess = spawn(command[0]!, command.slice(1), {
      cwd: workingDir,
      detached: false, // Keep as part of this session
      stdio: ['ignore', 'pipe', 'pipe'], // Capture output for monitoring
    })

    if (!child.pid) {
      return `Failed to start development server process`
    }

    // Register the process
    const backgroundProcess: BackgroundProcess = {
      pid: child.pid,
      script: devScript,
      cwd: workingDir,
      startTime: Date.now(),
      command
    }

    registry.processes[processKey] = backgroundProcess
    saveRegistry(workingDir, registry)

    // Set up basic monitoring (non-blocking)
    let startupOutput = ''
    let hasStarted = false

    const timeout = setTimeout(() => {
      if (!hasStarted) {
        hasStarted = true
      }
    }, 3000) // Give it 3 seconds to show startup output

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        if (!hasStarted) {
          startupOutput += data.toString()
          // Look for common success indicators
          const output = startupOutput.toLowerCase()
          if (output.includes('server') && (output.includes('running') || output.includes('listening') || output.includes('started'))) {
            hasStarted = true
            clearTimeout(timeout)
          }
        }
      })
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        if (!hasStarted) {
          startupOutput += data.toString()
        }
      })
    }

    // Handle process exit
    child.on('exit', (_code) => {
      const currentRegistry = loadRegistry(workingDir)
      delete currentRegistry.processes[processKey]
      saveRegistry(workingDir, currentRegistry)
    })

    // Return immediately - this is the key to non-blocking behavior
    return `🚀 **Development Server Started**

**Script:** \`${devScript}\`
**PID:** ${child.pid}
**Command:** \`${command.join(' ')}\`
**Working directory:** \`${workingDir}\`

✅ Process running in background within this OpenCode session
✅ Conversation can continue while server runs
✅ Use \`kit_devStatus\` to check server status

The development server will continue running while you work. It will automatically stop when this OpenCode session ends.`

  } catch (error) {
    return `Error starting development server: ${(error as Error).message}`
  }
}

/**
 * Check status of background development servers
 */
export async function executeDevStatus(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = args.cwd || context.cwd || process.cwd()
  
  try {
    const registry = cleanupRegistry(workingDir)
    const processes = Object.values(registry.processes)
    
    if (processes.length === 0) {
      return `No development servers currently running in \`${workingDir}\``
    }
    
    let output = `**Development Servers Status**\n\n`
    
    for (const proc of processes) {
      const uptime = Math.floor((Date.now() - proc.startTime) / 1000)
      const uptimeStr = uptime > 60 ? `${Math.floor(uptime/60)}m ${uptime%60}s` : `${uptime}s`
      
      output += `**${proc.script}**\n`
      output += `- PID: ${proc.pid}\n`
      output += `- Uptime: ${uptimeStr}\n`
      output += `- Command: \`${proc.command.join(' ')}\`\n`
      output += `- Directory: \`${proc.cwd}\`\n\n`
    }
    
    return output.trim()
    
  } catch (error) {
    return `Error checking development server status: ${(error as Error).message}`
  }
}

/**
 * Stop background development servers
 */
export async function executeDevStop(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = args.cwd || context.cwd || process.cwd()
  
  try {
    const registry = cleanupRegistry(workingDir)
    const processes = Object.values(registry.processes)
    
    if (processes.length === 0) {
      return `No development servers currently running in \`${workingDir}\``
    }
    
    // If script specified, stop only that script
    if (args.script) {
      const processKey = `${args.script}-${workingDir}`
      const proc = registry.processes[processKey]
      
      if (!proc) {
        const availableScripts = Object.values(registry.processes).map(p => p.script)
        return `No server running for script \`${args.script}\`. Running servers: ${availableScripts.join(', ')}`
      }
      
      if (!isProcessRunning(proc.pid)) {
        delete registry.processes[processKey]
        saveRegistry(workingDir, registry)
        return `Server for \`${args.script}\` was already stopped (cleaned up dead process)`
      }
      
      try {
        process.kill(proc.pid, 'SIGTERM')
        // Give it a moment to gracefully shutdown
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // If still running, force kill
        if (isProcessRunning(proc.pid)) {
          process.kill(proc.pid, 'SIGKILL')
        }
        
        delete registry.processes[processKey]
        saveRegistry(workingDir, registry)
        
        return `✅ Stopped development server: \`${args.script}\` (PID: ${proc.pid})`
        
      } catch (error) {
        return `Error stopping server \`${args.script}\`: ${(error as Error).message}`
      }
    }
    
    // Stop all servers
    let stoppedCount = 0
    let errors: string[] = []
    
    for (const [processKey, proc] of Object.entries(registry.processes)) {
      try {
        if (isProcessRunning(proc.pid)) {
          process.kill(proc.pid, 'SIGTERM')
          stoppedCount++
        }
        delete registry.processes[processKey]
      } catch (error) {
        errors.push(`${proc.script}: ${(error as Error).message}`)
      }
    }
    
    // Give processes time to gracefully shutdown
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Force kill any remaining processes
    for (const proc of processes) {
      try {
        if (isProcessRunning(proc.pid)) {
          process.kill(proc.pid, 'SIGKILL')
        }
      } catch {
        // Process already gone, ignore
      }
    }
    
    saveRegistry(workingDir, registry)
    
    let result = `✅ Stopped ${stoppedCount} development server(s)`
    if (errors.length > 0) {
      result += `\n\n⚠️  Errors:\n${errors.join('\n')}`
    }
    
    return result
    
  } catch (error) {
    return `Error stopping development servers: ${(error as Error).message}`
  }
}

/**
 * Restart background development servers
 */
export async function executeDevRestart(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = args.cwd || context.cwd || process.cwd()
  
  try {
    const registry = cleanupRegistry(workingDir)
    
    // If script specified, restart only that script
    if (args.script) {
      const processKey = `${args.script}-${workingDir}`
      const proc = registry.processes[processKey]
      
      if (!proc) {
        // Script not running, just start it
        return await executeDevStart(args, context)
      }
      
      // Stop the existing process
      const stopResult = await executeDevStop(args, context)
      if (stopResult.includes('Error')) {
        return stopResult
      }
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Start it again
      const startResult = await executeDevStart(args, context)
      
      return `🔄 **Restarted Development Server**\n\n${startResult}`
    }
    
    // Restart all servers
    const processes = Object.values(registry.processes)
    
    if (processes.length === 0) {
      return `No development servers currently running in \`${workingDir}\` to restart`
    }
    
    // Remember what was running
    const scriptsToRestart = processes.map(p => p.script)
    
    // Stop all
    const stopResult = await executeDevStop(args, context)
    if (stopResult.includes('Error')) {
      return stopResult
    }
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Start each one again
    let results: string[] = []
    for (const script of scriptsToRestart) {
      const startResult = await executeDevStart({ ...args, script }, context)
      if (startResult.includes('Started')) {
        results.push(`✅ Restarted: \`${script}\``)
      } else {
        results.push(`❌ Failed to restart \`${script}\`: ${startResult}`)
      }
    }
    
    return `🔄 **Restarted Development Servers**\n\n${results.join('\n')}`
    
  } catch (error) {
    return `Error restarting development servers: ${(error as Error).message}`
  }
}