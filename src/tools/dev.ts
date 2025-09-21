/**
 * Development server management tools
 * Part of @autotelic/oc-kit
 */

import { Database } from "bun:sqlite"
import type { Subprocess } from 'bun'
import type { ToolArgs, OpenCodeContext } from '../types.js'
import { getPackageJson, getScripts, detectPackageManager } from '../core/package-manager.js'
import { wrapWithDoppler } from '../core/doppler.js'
import { getOpenCodeTool } from '../core/plugin-compat.js'
import { resolveWorkingDirectory } from '../utils/common.js'
import { COMMON_DEV_SCRIPTS } from '../utils/constants.js'

// In-memory SQLite database (session-scoped, no disk persistence)
const db = new Database(":memory:")

// Process registry table schema
interface ProcessRow {
  id: string
  script: string
  cwd: string
  pid: number
  start_time: number
  command: string
}

// Initialize the database schema
db.exec(`
  CREATE TABLE IF NOT EXISTS processes (
    id TEXT PRIMARY KEY,
    script TEXT NOT NULL,
    cwd TEXT NOT NULL,
    pid INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    command TEXT NOT NULL
  )
`)

// Prepared statements for better performance
const insertProcess = db.prepare(`
  INSERT OR REPLACE INTO processes (id, script, cwd, pid, start_time, command)
  VALUES (?, ?, ?, ?, ?, ?)
`)

const getProcess = db.prepare(`
  SELECT * FROM processes WHERE id = ?
`)

const getAllProcesses = db.prepare(`
  SELECT * FROM processes ORDER BY start_time ASC
`)

const deleteProcess = db.prepare(`
  DELETE FROM processes WHERE id = ?
`)

// In-memory process registry for storing actual Subprocess objects
// SQLite stores metadata, Map stores the live process references
const processObjects = new Map<string, Subprocess>()

/**
 * Execute a custom SQL query on the process database
 * Supports both SELECT queries and data modification queries
 * @param query - SQL query string
 * @param params - Optional parameters for the query
 * @returns Query results or execution info
 */
function executeProcessQuery(query: string, ...params: any[]): any {
  try {
    const trimmedQuery = query.trim().toLowerCase()
    
    if (trimmedQuery.startsWith('select')) {
      // SELECT queries - return all results
      const stmt = db.prepare(query)
      return stmt.all(...params)
    } else if (trimmedQuery.startsWith('insert') || 
               trimmedQuery.startsWith('update') || 
               trimmedQuery.startsWith('delete')) {
      // Modification queries - return execution info
      const stmt = db.prepare(query)
      return stmt.run(...params)
    } else {
      // Other queries (CREATE, DROP, etc.) - execute directly
      return db.exec(query)
    }
  } catch (error) {
    throw new Error(`SQL query failed: ${(error as Error).message}`)
  }
}

/**
 * Query development servers with custom SQL
 * @param args - Tool arguments containing SQL query and optional parameters
 * @param context - OpenCode context
 * @returns Formatted query results
 */
async function executeDevQuery(args: ToolArgs, _context: OpenCodeContext): Promise<string> {
  try {
    cleanupRegistry()
    
    if (!args.query) {
      return `No SQL query provided. Example usage:
      
kit_devQuery { query: "SELECT script, COUNT(*) as count FROM processes GROUP BY script" }
kit_devQuery { query: "SELECT * FROM processes WHERE start_time > ?", params: [${Date.now() - 3600000}] }

Available columns: id, script, cwd, pid, start_time, command`
    }
    
    const params = args.params || []
    const results = executeProcessQuery(args.query, ...params)
    
    if (Array.isArray(results)) {
      if (results.length === 0) {
        return `Query executed successfully. No results returned.`
      }
      
      // Format results as a table
      let output = `**Query Results** (${results.length} rows)\n\n`
      
      if (results.length > 0) {
        const firstRow = results[0]
        const columns = Object.keys(firstRow)
        
        // Header
        output += `| ${columns.join(' | ')} |\n`
        output += `|${columns.map(() => '---').join('|')}|\n`
        
        // Data rows
        for (const row of results) {
          const values = columns.map(col => {
            const val = row[col]
            if (col === 'start_time') {
              return new Date(val).toLocaleString()
            }
            if (col === 'command') {
              try {
                return JSON.parse(val).join(' ')
              } catch {
                return val
              }
            }
            return String(val)
          })
          output += `| ${values.join(' | ')} |\n`
        }
      }
      
      return output
    } else {
      // Non-SELECT query result
      return `Query executed successfully. ${JSON.stringify(results)}`
    }
    
  } catch (error) {
    return `Error executing query: ${(error as Error).message}`
  }
}

/**
 * Check if a process is still running
 */
function isProcessRunning(proc: Subprocess): boolean {
  try {
    return !proc.killed && proc.exitCode === null
  } catch {
    return false
  }
}

/**
 * Clean up dead processes from registry
 */
function cleanupRegistry(): void {
  const allProcesses = getAllProcesses.all() as ProcessRow[]
  
  for (const row of allProcesses) {
    const proc = processObjects.get(row.id)
    if (!proc || !isProcessRunning(proc)) {
      deleteProcess.run(row.id)
      processObjects.delete(row.id)
    }
  }
}

/**
 * Get process key for registry
 */
function getProcessKey(script: string, cwd: string): string {
  return `${script}-${cwd}`
}

/**
 * Register a new process in the database and object map
 */
function registerProcess(script: string, cwd: string, proc: Subprocess, command: string[]): void {
  const processKey = getProcessKey(script, cwd)
  const startTime = Date.now()
  
  // Store metadata in SQLite
  insertProcess.run(
    processKey,
    script,
    cwd,
    proc.pid,
    startTime,
    JSON.stringify(command)
  )
  
  // Store live process reference in Map
  processObjects.set(processKey, proc)
}

/**
 * Get a process from the registry
 */
function getRegisteredProcess(script: string, cwd: string): { row: ProcessRow; proc: Subprocess } | null {
  const processKey = getProcessKey(script, cwd)
  const row = getProcess.get(processKey) as ProcessRow | undefined
  const proc = processObjects.get(processKey)
  
  if (row && proc) {
    return { row, proc }
  }
  
  // Clean up orphaned entries
  if (row) deleteProcess.run(processKey)
  if (proc) processObjects.delete(processKey)
  
  return null
}

/**
 * Remove a process from the registry
 */
function unregisterProcess(script: string, cwd: string): void {
  const processKey = getProcessKey(script, cwd)
  deleteProcess.run(processKey)
  processObjects.delete(processKey)
}

/**
 * Starts a development server in true background within OpenCode session
 * @param args - Tool arguments containing optional script name and working directory  
 * @param context - OpenCode context containing session information
 * @returns Promise resolving immediately after starting background process
 */
async function executeDevStart(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  // Use context working directory, then args.cwd, then fallback to process.cwd()
  const workingDir = resolveWorkingDirectory(args, context)

  try {
    // Clean up any dead processes first
    cleanupRegistry()
    
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
    const existingProcess = getRegisteredProcess(devScript, workingDir)
    
    if (existingProcess && isProcessRunning(existingProcess.proc)) {
      return `Development server already running!\n\n**Script:** \`${devScript}\`\n**PID:** ${existingProcess.proc.pid}\n**Started:** ${new Date(existingProcess.row.start_time).toLocaleTimeString()}\n**Working directory:** \`${workingDir}\``
    } else if (existingProcess) {
      // Clean up dead process
      unregisterProcess(devScript, workingDir)
    }

    // Detect package manager and build command
    const packageManager = await detectPackageManager(workingDir)
    let command = [packageManager, 'run', devScript]

    // Add Doppler if available
    const wrappedCommand = await wrapWithDoppler(command, workingDir, false)
    command = wrappedCommand

    // Spawn the process in background using Bun.spawn
    const proc = Bun.spawn(command, {
      cwd: workingDir,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    })

    if (!proc.pid) {
      return `Failed to start development server process`
    }

    // Register the process
    registerProcess(devScript, workingDir, proc, command)

    // Set up basic monitoring (non-blocking)
    let startupOutput = ''
    let hasStarted = false

    const timeout = setTimeout(() => {
      if (!hasStarted) {
        hasStarted = true
      }
    }, 3000) // Give it 3 seconds to show startup output

    // Monitor stdout for startup indicators
    if (proc.stdout) {
      const reader = proc.stdout.getReader()
      const decoder = new TextDecoder()
      
      ;(async () => {
        try {
          while (!hasStarted) {
            const { done, value } = await reader.read()
            if (done) break
            
            const text = decoder.decode(value)
            startupOutput += text
            
            // Look for common success indicators
            const output = startupOutput.toLowerCase()
            if (output.includes('server') && (output.includes('running') || output.includes('listening') || output.includes('started'))) {
              hasStarted = true
              clearTimeout(timeout)
              break
            }
          }
        } catch {
          // Reader failed, ignore
        } finally {
          reader.releaseLock()
        }
      })()
    }

    // Handle process exit
    proc.exited.then(() => {
      unregisterProcess(devScript, workingDir)
    })

    // Return immediately - this is the key to non-blocking behavior
    return `🚀 **Development Server Started**

**Script:** \`${devScript}\`
**PID:** ${proc.pid}
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
async function executeDevStatus(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)
  
  try {
    cleanupRegistry()
    const allProcesses = getAllProcesses.all() as ProcessRow[]
    
    if (allProcesses.length === 0) {
      return `No development servers currently running in \`${workingDir}\``
    }
    
    let output = `**Development Servers Status**\n\n`
    
    for (const row of allProcesses) {
      const proc = processObjects.get(row.id)
      if (proc && isProcessRunning(proc)) {
        const uptime = Math.floor((Date.now() - row.start_time) / 1000)
        const uptimeStr = uptime > 60 ? `${Math.floor(uptime/60)}m ${uptime%60}s` : `${uptime}s`
        
        output += `**${row.script}**\n`
        output += `- PID: ${row.pid}\n`
        output += `- Uptime: ${uptimeStr}\n`
        output += `- Command: \`${JSON.parse(row.command).join(' ')}\`\n`
        output += `- Directory: \`${row.cwd}\`\n\n`
      }
    }
    
    return output.trim()
    
  } catch (error) {
    return `Error checking development server status: ${(error as Error).message}`
  }
}

/**
 * Stop background development servers
 */
async function executeDevStop(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)
  
  try {
    cleanupRegistry()
    const allProcesses = getAllProcesses.all() as ProcessRow[]
    
    if (allProcesses.length === 0) {
      return `No development servers currently running in \`${workingDir}\``
    }
    
    // If script specified, stop only that script
    if (args.script) {
      const existingProcess = getRegisteredProcess(args.script, workingDir)
      
      if (!existingProcess) {
        const availableScripts = allProcesses.map(p => p.script)
        return `No server running for script \`${args.script}\`. Running servers: ${availableScripts.join(', ')}`
      }
      
      if (!isProcessRunning(existingProcess.proc)) {
        unregisterProcess(args.script, workingDir)
        return `Server for \`${args.script}\` was already stopped (cleaned up dead process)`
      }
      
      try {
        existingProcess.proc.kill()
        
        // Wait for graceful shutdown
        await existingProcess.proc.exited
        
        unregisterProcess(args.script, workingDir)
        
        return `✅ Stopped development server: \`${args.script}\` (PID: ${existingProcess.proc.pid})`
        
      } catch (error) {
        return `Error stopping server \`${args.script}\`: ${(error as Error).message}`
      }
    }
    
    // Stop all servers
    let stoppedCount = 0
    let errors: string[] = []
    
    for (const row of allProcesses) {
      const proc = processObjects.get(row.id)
      if (proc) {
        try {
          if (isProcessRunning(proc)) {
            proc.kill()
            stoppedCount++
          }
          unregisterProcess(row.script, row.cwd)
        } catch (error) {
          errors.push(`${row.script}: ${(error as Error).message}`)
        }
      }
    }
    
    // Give processes time to gracefully shutdown
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Force kill any remaining processes
    for (const row of allProcesses) {
      const proc = processObjects.get(row.id)
      if (proc) {
        try {
          if (isProcessRunning(proc)) {
            proc.kill(9) // SIGKILL
          }
        } catch {
          // Process already gone, ignore
        }
      }
    }
    
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
async function executeDevRestart(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)
  
  try {
    cleanupRegistry()
    
    // If script specified, restart only that script
    if (args.script) {
      const existingProcess = getRegisteredProcess(args.script, workingDir)
      
      if (!existingProcess) {
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
    const allProcesses = getAllProcesses.all() as ProcessRow[]
    
    if (allProcesses.length === 0) {
      return `No development servers currently running in \`${workingDir}\` to restart`
    }
    
    // Remember what was running
    const scriptsToRestart = allProcesses.map(p => p.script)
    
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

/**
 * Start multiple development services at once
 */
async function executeDevStartAll(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)
  
  try {
    // Get list of scripts to start
    let scriptsToStart: string[] = []
    
    if (args.scripts && Array.isArray(args.scripts)) {
      scriptsToStart = args.scripts
    } else if (args.profile) {
      // Predefined service profiles
      const profiles: Record<string, string[]> = {
        'dev': ['dev', 'start'],
        'test': ['test-server', 'test-server-2'],
        'backend': ['api', 'worker', 'scheduler'],
        'frontend': ['dev', 'storybook'],
        'full': ['api', 'worker', 'dev', 'docs']
      }
      
      if (profiles[args.profile]) {
        scriptsToStart = profiles[args.profile]!
      } else {
        const availableProfiles = Object.keys(profiles)
        return `Unknown profile: \`${args.profile}\`. Available profiles: ${availableProfiles.join(', ')}`
      }
    } else {
      // Auto-detect common development scripts
      const packageJson = await getPackageJson(workingDir)
      const scripts = getScripts(packageJson)
      
      scriptsToStart = COMMON_DEV_SCRIPTS.filter(script => scripts[script])
      
      if (scriptsToStart.length === 0) {
        const availableScripts = Object.keys(scripts)
        return `No common development scripts found. Available scripts: ${availableScripts.join(', ')}\n\nSpecify scripts manually: kit_devStartAll { scripts: ["script1", "script2"] }`
      }
    }
    
    if (scriptsToStart.length === 0) {
      return `No scripts specified to start`
    }
    
    // Start each script
    let results: string[] = []
    let successCount = 0
    
    for (const script of scriptsToStart) {
      try {
        const startResult = await executeDevStart({ ...args, script }, context)
        
        if (startResult.includes('Started') || startResult.includes('already running')) {
          results.push(`✅ ${script}: Started successfully`)
          successCount++
        } else {
          results.push(`❌ ${script}: ${startResult}`)
        }
        
        // Small delay between starts to avoid port conflicts
        await new Promise(resolve => setTimeout(resolve, 100))
        
      } catch (error) {
        results.push(`❌ ${script}: Error - ${(error as Error).message}`)
      }
    }
    
    const summary = `🚀 **Started ${successCount}/${scriptsToStart.length} Development Services**\n\n${results.join('\n')}`
    
    if (successCount > 0) {
      return `${summary}\n\n✅ Use \`kit_devStatus\` to monitor all running services`
    } else {
      return summary
    }
    
  } catch (error) {
    return `Error starting multiple development services: ${(error as Error).message}`
  }
}

// OpenCode plugin compatibility layer
const tool = await getOpenCodeTool()

/**
 * Custom opencode tool for starting a development server in the background using OpenCode's Task system.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const devStart = tool({
  description: 'Start development server in background sub-session. Auto-detects dev script (dev, start, serve) and monitors without blocking conversation.',
  args: {
    script: tool.schema.string().optional().describe('Development script name (auto-detects from dev, start, serve if not specified)'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDevStart(args, context)
  }
})

/**
 * Custom opencode tool for checking status of background development servers.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const devStatus = tool({
  description: 'Check status of background development servers running in current session.',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDevStatus(args, context)
  }
})

/**
 * Custom opencode tool for stopping background development servers.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const devStop = tool({
  description: 'Stop background development servers. Can stop specific script or all servers.',
  args: {
    script: tool.schema.string().optional().describe('Specific script to stop (stops all if not specified)'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDevStop(args, context)
  }
})

/**
 * Custom opencode tool for restarting background development servers.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const devRestart = tool({
  description: 'Restart background development servers. Can restart specific script or all servers.',
  args: {
    script: tool.schema.string().optional().describe('Specific script to restart (restarts all if not specified)'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDevRestart(args, context)
  }
})

/**
 * Custom opencode tool for starting multiple development services at once.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const devStartAll = tool({
  description: 'Start multiple development services at once. Supports service profiles and script arrays.',
  args: {
    scripts: tool.schema.array(tool.schema.string()).optional().describe('Array of script names to start'),
    profile: tool.schema.string().optional().describe('Service profile: dev, test, backend, frontend, full'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDevStartAll(args, context)
  }
})

/**
 * Custom opencode tool for querying development server database with SQL.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const devQuery = tool({
  description: 'Execute custom SQL queries on the development server process database for advanced monitoring and analysis.',
  args: {
    query: tool.schema.string().describe('SQL query to execute (SELECT, INSERT, UPDATE, DELETE)'),
    params: tool.schema.array(tool.schema.string()).optional().describe('Optional parameters for parameterized queries'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDevQuery(args, context)
  }
})