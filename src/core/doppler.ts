/**
 * Doppler CLI integration utilities
 */

import type { DopplerCapabilities } from '../types.js'

/** Cache for Doppler capabilities to avoid repeated detection */
let dopplerCapabilitiesCache: DopplerCapabilities | null = null
/** Directory for which capabilities are cached */
let dopplerCacheDir: string | null = null
/** Promise for in-flight detection to prevent concurrent calls */
let dopplerCachePromise: Promise<DopplerCapabilities> | null = null

/**
 * Gets Doppler capabilities for a directory with caching
 * @param workingDir - Directory to check for Doppler configuration
 * @returns Promise resolving to Doppler capabilities
 */
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

/**
 * Detects Doppler CLI availability and configuration in a directory
 * @param workingDir - Directory to check for Doppler setup
 * @returns Promise resolving to detected capabilities
 */
async function detectDopplerCapabilities(workingDir: string): Promise<DopplerCapabilities> {
  const capabilities: DopplerCapabilities = {
    available: false,
    hasConfig: false,
    configFile: null
  }

  try {
    capabilities.available = await checkDopplerAvailability()
    
    if (capabilities.available) {
      await checkDopplerConfig(workingDir, capabilities)
    }
  } catch (error) {
    // If detection fails, return defaults with error info
    capabilities.error = `Failed to detect Doppler capabilities: ${error}`
  }

  return capabilities
}

/**
 * Checks if Doppler CLI is installed and accessible
 * @returns Promise resolving to true if Doppler CLI is available
 */
async function checkDopplerAvailability(): Promise<boolean> {
  try {
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

/**
 * Checks for Doppler configuration files in the working directory
 * @param workingDir - Directory to search for config files
 * @param capabilities - Capabilities object to update with findings
 */
/**
 * Checks for Doppler configuration files in the working directory
 * @param workingDir - Directory to scan for Doppler config files
 * @param capabilities - DopplerCapabilities object to populate with findings
 */
async function checkDopplerConfig(workingDir: string, capabilities: DopplerCapabilities) {
  // Check for doppler.yaml first
  const dopplerYaml = Bun.file(`${workingDir}/doppler.yaml`)
  try {
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
  } catch (error) {
    capabilities.error = `Failed to check doppler.yaml existence: ${error}`
  }

  // Check for .doppler/cli.json
  const dopplerJson = Bun.file(`${workingDir}/.doppler/cli.json`)
  try {
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
  } catch (error) {
    if (!capabilities.hasConfig) {
      capabilities.error = `Failed to check .doppler/cli.json existence: ${error}`
    }
  }
}

/**
 * Wraps a command with Doppler if available and appropriate
 * @param command - Command array to potentially wrap
 * @param workingDir - Directory to check for Doppler configuration
 * @param skipDoppler - Whether to skip Doppler wrapping
 * @param action - Action being performed (for read-only detection)
 * @returns Promise resolving to potentially wrapped command
 */
export async function wrapWithDoppler(
  command: string[],
  workingDir: string,
  skipDoppler?: boolean,
  action?: string
): Promise<string[]> {
  if (skipDoppler) return command

  try {
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
  } catch (error) {
    // If Doppler wrapping fails, return the original command
    return command
  }
}

/**
 * Determines if an action is read-only and should skip Doppler wrapping
 * @param action - Action string to check
 * @returns True if the action is read-only
 */
function isReadOnlyAction(action: string): boolean {
  const readOnlyActions = new Set([
    'ps', 'logs', 'list', 'version', '--version', '--help',
    'status', 'inspect', 'history', 'images', 'info',
    'top', 'stats', 'port', 'diff'
  ])

  return readOnlyActions.has(action) || action.startsWith('--')
}