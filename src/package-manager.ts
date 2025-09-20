/**
 * Package manager detection and utilities
 */

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun'

interface PackageManagerConfig {
  lockFile: string
  manager: PackageManager
}

const PACKAGE_MANAGERS: PackageManagerConfig[] = [
  { lockFile: 'bun.lock', manager: 'bun' },
  { lockFile: 'bun.lockb', manager: 'bun' },
  { lockFile: 'pnpm-lock.yaml', manager: 'pnpm' },
  { lockFile: 'yarn.lock', manager: 'yarn' },
  { lockFile: 'package-lock.json', manager: 'npm' }
]

export async function detectPackageManager(dir: string): Promise<PackageManager> {
  for (const { lockFile, manager } of PACKAGE_MANAGERS) {
    const lockFilePath = `${dir}/${lockFile}`
    // eslint-disable-next-line no-undef
    const file = Bun.file(lockFilePath)
    
    if (await file.exists()) {
      return manager
    }
  }
  
  return 'npm'
}

export async function getPackageJson(workingDir: string): Promise<Record<string, unknown>> {
  // eslint-disable-next-line no-undef
  const packagePath = Bun.resolveSync('./package.json', workingDir)
  // eslint-disable-next-line no-undef
  return await Bun.file(packagePath).json() as Record<string, unknown>
}

export function getScripts(packageJson: Record<string, unknown>): Record<string, string> {
  return (packageJson.scripts as Record<string, string>) || {}
}

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