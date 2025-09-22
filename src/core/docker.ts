/**
 * Docker capabilities detection and utilities
 */

import type { DockerCapabilities } from '../types.js';
import { SERVICE_PATTERNS } from '../utils/constants.js';

/** Cache for Docker capabilities to avoid repeated filesystem scanning */
let dockerCapabilitiesCache: DockerCapabilities | null = null;
/** Directory for which capabilities are cached */
let cacheDir: string | null = null;
/** Promise for in-flight detection to prevent concurrent scans */
let dockerCachePromise: Promise<DockerCapabilities> | null = null;

/**
 * Gets Docker capabilities for a directory with caching
 * @param workingDir - Directory to scan for Docker files and configuration
 * @returns Promise resolving to Docker capabilities
 */
export async function getDockerCapabilities(
  workingDir: string
): Promise<DockerCapabilities> {
  if (dockerCapabilitiesCache && cacheDir === workingDir) {
    return dockerCapabilitiesCache;
  }

  if (dockerCachePromise) {
    return dockerCachePromise;
  }

  dockerCapabilitiesCache = null;
  cacheDir = null;

  try {
    dockerCachePromise = detectDockerCapabilities(workingDir);
    const capabilities = await dockerCachePromise;

    // eslint-disable-next-line require-atomic-updates
    dockerCapabilitiesCache = capabilities;
    // eslint-disable-next-line require-atomic-updates
    cacheDir = workingDir;
    // eslint-disable-next-line require-atomic-updates
    dockerCachePromise = null;

    return capabilities;
  } catch (error) {
    // eslint-disable-next-line require-atomic-updates
    dockerCachePromise = null;
    throw new Error(`Failed to get Docker capabilities: ${(error as Error).message}`);
  }
}

/**
 * Detects Docker capabilities by scanning for files and checking CLI availability
 * @param workingDir - Directory to scan for Docker-related files
 * @returns Promise resolving to detected Docker capabilities
 */
async function detectDockerCapabilities(
  workingDir: string
): Promise<DockerCapabilities> {
  const capabilities: DockerCapabilities = {
    dockerAvailable: false,
    hasDockerfile: false,
    dockerfiles: [],
    composeFiles: [],
    services: new Set(),
    networks: new Set(),
    volumes: new Set(),
    profiles: {},
  };

  try {
    capabilities.dockerAvailable = await checkDockerAvailability();
    await findDockerfiles(workingDir, capabilities);
    await findAndParseComposeFiles(workingDir, capabilities);
    generateServiceProfiles(capabilities);
  } catch (error) {
    // Continue with partial capabilities on error
    // Error details are available in the outer try-catch if needed
  }

  return capabilities;
}

/**
 * Checks if Docker CLI is installed and accessible
 * @returns Promise resolving to true if Docker CLI is available
 */
async function checkDockerAvailability(): Promise<boolean> {
  try {
    const dockerCheck = Bun.spawn(['docker', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await dockerCheck.exited;
    return dockerCheck.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Recursively searches for Dockerfile patterns in the project directory
 * @param dir - Directory to scan for Dockerfiles
 * @param capabilities - DockerCapabilities object to populate with found Dockerfiles
 */
async function findDockerfiles(dir: string, capabilities: DockerCapabilities) {
  const dockerfileGlob = new Bun.Glob('**/Dockerfile*');

  try {
    for await (const file of dockerfileGlob.scan({
      cwd: dir,
      absolute: true,
    })) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        capabilities.dockerfiles.push(file);
        if (file.endsWith('Dockerfile')) {
          capabilities.hasDockerfile = true;
        }
      }
    }
  } catch {
    // Ignore errors in file scanning
  }
}

/**
 * Scans directory for Docker Compose files and parses their content
 * @param dir - Directory to search for Compose files
 * @param capabilities - Capabilities object to update with findings
 */
async function findAndParseComposeFiles(
  dir: string,
  capabilities: DockerCapabilities
) {
  const composePatterns = [
    '**/docker-compose.yml',
    '**/docker-compose.yaml',
    '**/compose.yml',
    '**/compose.yaml',
  ];

  for (const pattern of composePatterns) {
    const glob = new Bun.Glob(pattern);

    try {
      for await (const file of glob.scan({ cwd: dir, absolute: true })) {
        if (!file.includes('node_modules') && !file.includes('.git')) {
          capabilities.composeFiles.push(file);
          await parseComposeFile(file, capabilities);
        }
      }
    } catch {
      // Ignore errors in file scanning
    }
  }
}

/**
 * Parses a Docker Compose file to extract services, networks, and volumes
 * @param filePath - Path to the Compose file to parse
 * @param capabilities - Capabilities object to update with parsed information
 */
async function parseComposeFile(
  filePath: string,
  capabilities: DockerCapabilities
) {
  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split('\n');

    let inServices = false;
    let inNetworks = false;
    let inVolumes = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (line === 'services:') {
        inServices = true;
        inNetworks = false;
        inVolumes = false;
        continue;
      } else if (line === 'networks:') {
        inServices = false;
        inNetworks = true;
        inVolumes = false;
        continue;
      } else if (line === 'volumes:') {
        inServices = false;
        inNetworks = false;
        inVolumes = true;
        continue;
      } else if (
        line.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/) &&
        !trimmed.includes(' ')
      ) {
        inServices = false;
        inNetworks = false;
        inVolumes = false;
      }

      if (inServices && line.match(/^ {2}[a-zA-Z][a-zA-Z0-9_-]*:/)) {
        const serviceName = trimmed.replace(':', '');
        capabilities.services.add(serviceName);
      }

      if (
        inNetworks &&
        trimmed.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/) &&
        !trimmed.includes(' ')
      ) {
        const networkName = trimmed.replace(':', '');
        capabilities.networks.add(networkName);
      }

      if (
        inVolumes &&
        trimmed.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/) &&
        !trimmed.includes(' ')
      ) {
        const volumeName = trimmed.replace(':', '');
        capabilities.volumes.add(volumeName);
      }
    }
  } catch {
    // Ignore parsing errors
  }
}

/**
 * Generates service profiles based on service names for convenient grouping
 * Creates profiles like 'database', 'cache', 'test', 'dev', and 'all'
 * @param capabilities - Capabilities object to update with generated profiles
 */
function generateServiceProfiles(capabilities: DockerCapabilities) {
  const services = Array.from(capabilities.services);

  if (services.length === 0) return;

  const databases = services.filter((service) =>
    SERVICE_PATTERNS.DATABASE.some((pattern) =>
      service.toLowerCase().includes(pattern)
    )
  );
  if (databases.length > 0) {
    capabilities.profiles.database = databases;
  }

  const cache = services.filter((service) =>
    SERVICE_PATTERNS.CACHE.some((pattern) =>
      service.toLowerCase().includes(pattern)
    )
  );
  if (cache.length > 0) {
    capabilities.profiles.cache = cache;
  }

  const test = services.filter((service) =>
    SERVICE_PATTERNS.TEST.some((pattern) =>
      service.toLowerCase().includes(pattern)
    )
  );
  if (test.length > 0) {
    capabilities.profiles.test = test;
  }

  const dev = services.filter(
    (service) =>
      !SERVICE_PATTERNS.TEST.some((pattern) =>
        service.toLowerCase().includes(pattern)
      )
  );
  if (dev.length > 0) {
    capabilities.profiles.dev = dev;
  }

  capabilities.profiles.all = services;
}
