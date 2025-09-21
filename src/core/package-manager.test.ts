/**
 * Tests for package manager detection and utilities
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import {
  detectPackageManager,
  getPackageJson,
  getScripts,
  buildPackageCommand,
  type PackageManager
} from './package-manager.js'

describe('Package Manager Detection', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = `${import.meta.dir}/../tmp/package-manager-test-${Date.now()}`
    await Bun.write(`${testDir}/.keep`, '') // Create directory
  })

  afterEach(async () => {
    if (testDir) {
      try {
        await Bun.spawn(['rm', '-rf', testDir]).exited
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test('detects bun from bun.lock', async () => {
    await Bun.write(`${testDir}/bun.lock`, '')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('bun')
  })

  test('detects bun from bun.lockb', async () => {
    await Bun.write(`${testDir}/bun.lockb`, '')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('bun')
  })

  test('detects pnpm from pnpm-lock.yaml', async () => {
    await Bun.write(`${testDir}/pnpm-lock.yaml`, '')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('pnpm')
  })

  test('detects yarn from yarn.lock', async () => {
    await Bun.write(`${testDir}/yarn.lock`, '')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('yarn')
  })

  test('detects npm from package-lock.json', async () => {
    await Bun.write(`${testDir}/package-lock.json`, '{}')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('npm')
  })

  test('defaults to npm when no lock files exist', async () => {
    const result = await detectPackageManager(testDir)
    expect(result).toBe('npm')
  })

  test('respects priority order (bun over pnpm)', async () => {
    await Bun.write(`${testDir}/bun.lock`, '')
    await Bun.write(`${testDir}/pnpm-lock.yaml`, '')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('bun')
  })

  test('respects priority order (pnpm over yarn)', async () => {
    await Bun.write(`${testDir}/pnpm-lock.yaml`, '')
    await Bun.write(`${testDir}/yarn.lock`, '')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('pnpm')
  })

  test('respects priority order (yarn over npm)', async () => {
    await Bun.write(`${testDir}/yarn.lock`, '')
    await Bun.write(`${testDir}/package-lock.json`, '{}')
    const result = await detectPackageManager(testDir)
    expect(result).toBe('yarn')
  })
})

describe('Package.json Operations', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = `${import.meta.dir}/../tmp/package-json-test-${Date.now()}`
    await Bun.write(`${testDir}/.keep`, '') // Create directory
  })

  afterEach(async () => {
    if (testDir) {
      try {
        await Bun.spawn(['rm', '-rf', testDir]).exited
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test('reads and parses package.json', async () => {
    const packageContent = {
      name: 'test-package',
      version: '1.0.0',
      scripts: {
        test: 'echo test',
        build: 'tsc'
      }
    }
    await Bun.write(`${testDir}/package.json`, JSON.stringify(packageContent, null, 2))

    const result = await getPackageJson(testDir)
    expect(result).toEqual(packageContent)
  })

  test('extracts scripts from package.json', () => {
    const packageJson = {
      name: 'test-package',
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start'
      },
      dependencies: {}
    }

    const scripts = getScripts(packageJson)
    expect(scripts).toEqual({
      dev: 'next dev',
      build: 'next build',
      start: 'next start'
    })
  })

  test('returns empty object when no scripts exist', () => {
    const packageJson = {
      name: 'test-package',
      version: '1.0.0'
    }

    const scripts = getScripts(packageJson)
    expect(scripts).toEqual({})
  })

  test('handles undefined scripts gracefully', () => {
    const packageJson = {
      name: 'test-package',
      scripts: undefined
    }

    const scripts = getScripts(packageJson)
    expect(scripts).toEqual({})
  })
})

describe('Package Command Building', () => {
  test('builds basic npm command', () => {
    const command = buildPackageCommand('npm', 'test')
    expect(command).toEqual(['npm', 'run', 'test'])
  })

  test('builds basic yarn command', () => {
    const command = buildPackageCommand('yarn', 'build')
    expect(command).toEqual(['yarn', 'run', 'build'])
  })

  test('builds basic pnpm command', () => {
    const command = buildPackageCommand('pnpm', 'dev')
    expect(command).toEqual(['pnpm', 'run', 'dev'])
  })

  test('builds basic bun command', () => {
    const command = buildPackageCommand('bun', 'start')
    expect(command).toEqual(['bun', 'run', 'start'])
  })

  test('includes additional arguments with separator', () => {
    const command = buildPackageCommand('npm', 'test', ['--watch', '--coverage'])
    expect(command).toEqual(['npm', 'run', 'test', '--', '--watch', '--coverage'])
  })

  test('handles empty args array', () => {
    const command = buildPackageCommand('yarn', 'build', [])
    expect(command).toEqual(['yarn', 'run', 'build'])
  })

  test('handles undefined args', () => {
    const command = buildPackageCommand('pnpm', 'lint')
    expect(command).toEqual(['pnpm', 'run', 'lint'])
  })

  test('handles single argument', () => {
    const command = buildPackageCommand('bun', 'test', ['--verbose'])
    expect(command).toEqual(['bun', 'run', 'test', '--', '--verbose'])
  })

  test('handles complex arguments', () => {
    const command = buildPackageCommand('npm', 'test', [
      '--testPathPattern=src/',
      '--coverage',
      '--watchAll=false'
    ])
    expect(command).toEqual([
      'npm', 'run', 'test', '--',
      '--testPathPattern=src/',
      '--coverage',
      '--watchAll=false'
    ])
  })
})

describe('Type Safety', () => {
  test('all package managers are valid', () => {
    const managers: PackageManager[] = ['npm', 'yarn', 'pnpm', 'bun']
    
    managers.forEach(manager => {
      const command = buildPackageCommand(manager, 'test')
      expect(command[0]).toBe(manager)
      expect(command[1]).toBe('run')
      expect(command[2]).toBe('test')
    })
  })
})