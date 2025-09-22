/**
 * Package manager detection and utilities
 */

import { readdir } from 'node:fs/promises'

/**
 * Supported package managers for JavaScript/TypeScript projects
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

/**
 * Configuration for package manager detection based on lock files
 */
interface PackageManagerConfig {
  /** Lock file name to detect */
  lockFile: string
  /** Associated package manager */
  manager: PackageManager
}

/**
 * Package manager configurations in priority order (first match wins)
 */
const PACKAGE_MANAGERS: PackageManagerConfig[] = [
  { lockFile: 'bun.lock', manager: 'bun' },
  { lockFile: 'bun.lockb', manager: 'bun' },
  { lockFile: 'pnpm-lock.yaml', manager: 'pnpm' },
  { lockFile: 'yarn.lock', manager: 'yarn' },
  { lockFile: 'package-lock.json', manager: 'npm' }
]

/**
 * Detects the package manager used in a project by examining lock files
 * @param dir - Directory to search for lock files
 * @returns The detected package manager, defaults to 'npm' if none found
 */
export async function detectPackageManager(dir: string): Promise<PackageManager> {
  for (const { lockFile, manager } of PACKAGE_MANAGERS) {
    const lockFilePath = `${dir}/${lockFile}`
    const file = Bun.file(lockFilePath)
    
    if (await file.exists()) {
      return manager
    }
  }
  
  return 'npm'
}

/**
 * Reads and parses package.json from the specified directory
 * @param workingDir - Directory containing the package.json file
 * @returns Parsed package.json content as a record
 */
export async function getPackageJson(workingDir: string): Promise<Record<string, unknown>> {
  const packagePath = Bun.resolveSync('./package.json', workingDir)
  return await Bun.file(packagePath).json() as Record<string, unknown>
}

/**
 * Extracts the scripts section from package.json
 * @param packageJson - Parsed package.json content
 * @returns Scripts object with script names as keys and commands as values
 */
export function getScripts(packageJson: Record<string, unknown>): Record<string, string> {
  return (packageJson.scripts as Record<string, string>) || {}
}

/**
 * Builds a package manager command array for running scripts
 * @param packageManager - The package manager to use
 * @param script - The script name to run
 * @param args - Optional additional arguments to pass to the script
 * @returns Command array ready for execution
 */
export function buildPackageCommand(
  packageManager: PackageManager,
  script: string,
  args?: string[]
): string[] {
  const baseCommand = [packageManager, 'run', script]
  
  if (args && args.length > 0) {
    baseCommand.push('--', ...args)
  }
  
  return baseCommand
}

/**
 * Represents a discovered workspace with its package.json information
 */
export interface WorkspaceInfo {
  /** Absolute path to the workspace directory */
  path: string
  /** Relative path from the root directory */
  relativePath: string
  /** Parsed package.json content */
  packageJson: Record<string, unknown>
  /** Scripts available in this workspace */
  scripts: Record<string, string>
  /** Package name from package.json (if available) */
  name?: string | undefined
}

/**
 * Recursively discovers all package.json files in a directory tree, excluding node_modules
 * @param rootDir - Root directory to start searching from
 * @returns Array of WorkspaceInfo objects for each discovered workspace
 */
export async function discoverWorkspaces(rootDir: string): Promise<WorkspaceInfo[]> {
  const workspaces: WorkspaceInfo[] = []
  
  async function searchDirectory(currentDir: string) {
    try {
      // Use readdir to get all directory contents including directories
      const entries = await readdir(currentDir, { withFileTypes: true })
      
      let hasPackageJson = false
      const subdirectories: string[] = []
      
      for (const entry of entries) {
        if (entry.name === 'package.json' && entry.isFile()) {
          hasPackageJson = true
        } else if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          subdirectories.push(`${currentDir}/${entry.name}`)
        }
      }
      
      // If this directory has a package.json, add it as a workspace
      if (hasPackageJson) {
        try {
          const packageJson = await getPackageJson(currentDir)
          const scripts = getScripts(packageJson)
          const relativePath = currentDir === rootDir ? '.' : currentDir.replace(rootDir + '/', '')
          
          workspaces.push({
            path: currentDir,
            relativePath,
            packageJson,
            scripts,
            name: packageJson.name as string | undefined
          })
        } catch (error) {
          // Skip invalid package.json files - silent failure for workspace discovery
        }
      }
      
      // Recursively search subdirectories
      for (const subdir of subdirectories) {
        await searchDirectory(subdir)
      }
    } catch (error) {
      // Skip directories we can't read - silent failure for workspace discovery
    }
  }
  
  await searchDirectory(rootDir)
  return workspaces
}

/**
 * Finds a workspace that contains the specified script
 * @param workspaces - Array of discovered workspaces
 * @param scriptName - Name of the script to find
 * @returns WorkspaceInfo containing the script, or undefined if not found
 */
export function findWorkspaceWithScript(workspaces: WorkspaceInfo[], scriptName: string): WorkspaceInfo | undefined {
  return workspaces.find(workspace => workspace.scripts[scriptName])
}