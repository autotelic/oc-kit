/**
 * Package manager detection and utilities
 */

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