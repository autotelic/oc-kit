/**
 * Doppler CLI integration utilities
 */

import type { DopplerCapabilities } from './types.js'

let dopplerCapabilitiesCache: DopplerCapabilities | null = null
let dopplerCacheDir: string | null = null
let dopplerCachePromise: Promise<DopplerCapabilities> | null = null

export async function getDopplerCapabilities(workingDir: string): Promise<DopplerCapabilities> {
  if (dopplerCapabilitiesCache && dopplerCacheDir === workingDir) {
    return dopplerCapabilitiesCache
  }

  if (dopplerCachePromise) {
    return dopplerCachePromise
  }

  dopplerCachePromise = detectDopplerCapabilities(workingDir)
  const capabilities = await dopplerCachePromise

  // eslint-disable-next-line require-atomic-updates
  dopplerCapabilitiesCache = capabilities
  // eslint-disable-next-line require-atomic-updates
  dopplerCacheDir = workingDir
  // eslint-disable-next-line require-atomic-updates
  dopplerCachePromise = null

  return capabilities
}

async function detectDopplerCapabilities(workingDir: string): Promise<DopplerCapabilities> {
  const capabilities: DopplerCapabilities = {
    available: false,
    hasConfig: false,
    configFile: null
  }

  capabilities.available = await checkDopplerAvailability()
  
  if (capabilities.available) {
    await checkDopplerConfig(workingDir, capabilities)
  }

  return capabilities
}

async function checkDopplerAvailability(): Promise<boolean> {
  try {
    // eslint-disable-next-line no-undef
    const dopplerCheck = Bun.spawn(['doppler', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe'
    })
    await dopplerCheck.exited
    return dopplerCheck.exitCode === 0
  } catch {
    return false
  }
}

async function checkDopplerConfig(workingDir: string, capabilities: DopplerCapabilities) {
  // Check for doppler.yaml first
  // eslint-disable-next-line no-undef
  const dopplerYaml = Bun.file(`${workingDir}/doppler.yaml`)
  if (await dopplerYaml.exists()) {
    try {
      const content = await dopplerYaml.text()
      if (content.trim()) {
        capabilities.hasConfig = true
        capabilities.configFile = 'doppler.yaml'
        return
      } else {
        capabilities.error = 'doppler.yaml exists but is empty'
      }
    } catch (error) {
      capabilities.error = `Failed to read doppler.yaml: ${(error as Error).message}`
    }
  }

  // Check for .doppler/cli.json
  // eslint-disable-next-line no-undef
  const dopplerJson = Bun.file(`${workingDir}/.doppler/cli.json`)
  if (await dopplerJson.exists()) {
    try {
      const content = await dopplerJson.text()
      JSON.parse(content) // Validate it's valid JSON
      capabilities.hasConfig = true
      capabilities.configFile = '.doppler/cli.json'
    } catch (error) {
      capabilities.error = `Failed to parse .doppler/cli.json: ${(error as Error).message}`
    }
  } else if (!capabilities.hasConfig) {
    capabilities.error = 'No Doppler config found (doppler.yaml or .doppler/cli.json)'
  }
}

export async function wrapWithDoppler(
  command: string[],
  workingDir: string,
  skipDoppler?: boolean,
  action?: string
): Promise<string[]> {
  if (skipDoppler) return command

  const capabilities = await getDopplerCapabilities(workingDir)

  if (!capabilities.available || !capabilities.hasConfig) {
    return command
  }

  if (action && isReadOnlyAction(action)) {
    return command
  }

  if (command[0] === 'docker' && command[1] && isReadOnlyAction(command[1])) {
    return command
  }

  if (command[0] === 'docker-compose' && command.length > 1 && command[1] && isReadOnlyAction(command[1])) {
    return command
  }

  return ['doppler', 'run', '--', ...command]
}

function isReadOnlyAction(action: string): boolean {
  const readOnlyActions = new Set([
    'ps', 'logs', 'list', 'version', '--version', '--help',
    'status', 'inspect', 'history', 'images', 'info',
    'top', 'stats', 'port', 'diff'
  ])

  return readOnlyActions.has(action) || action.startsWith('--')
}