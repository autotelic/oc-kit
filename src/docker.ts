/**
 * Docker capabilities detection and utilities
 */

import type { DockerCapabilities } from './types.js'

let dockerCapabilitiesCache: DockerCapabilities | null = null
let cacheDir: string | null = null
let dockerCachePromise: Promise<DockerCapabilities> | null = null

export async function getDockerCapabilities(workingDir: string): Promise<DockerCapabilities> {
  if (dockerCapabilitiesCache && cacheDir === workingDir) {
    return dockerCapabilitiesCache
  }

  if (dockerCachePromise) {
    return dockerCachePromise
  }

  dockerCapabilitiesCache = null
  cacheDir = null

  dockerCachePromise = detectDockerCapabilities(workingDir)
  const capabilities = await dockerCachePromise

  // eslint-disable-next-line require-atomic-updates
  dockerCapabilitiesCache = capabilities
  // eslint-disable-next-line require-atomic-updates
  cacheDir = workingDir
  // eslint-disable-next-line require-atomic-updates
  dockerCachePromise = null

  return capabilities
}

async function detectDockerCapabilities(workingDir: string): Promise<DockerCapabilities> {
  const capabilities: DockerCapabilities = {
    dockerAvailable: false,
    hasDockerfile: false,
    dockerfiles: [],
    composeFiles: [],
    services: new Set(),
    networks: new Set(),
    volumes: new Set(),
    profiles: {}
  }

  capabilities.dockerAvailable = await checkDockerAvailability()
  await findDockerfiles(workingDir, capabilities)
  await findAndParseComposeFiles(workingDir, capabilities)
  generateServiceProfiles(capabilities)
  
  return capabilities
}

async function checkDockerAvailability(): Promise<boolean> {
  try {
    // eslint-disable-next-line no-undef
    const dockerCheck = Bun.spawn(['docker', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe'
    })
    await dockerCheck.exited
    return dockerCheck.exitCode === 0
  } catch {
    return false
  }
}

async function findDockerfiles(dir: string, capabilities: DockerCapabilities) {
  // eslint-disable-next-line no-undef
  const dockerfileGlob = new Bun.Glob('**/Dockerfile*')

  try {
    for await (const file of dockerfileGlob.scan({ cwd: dir, absolute: true })) {
      if (!file.includes('node_modules') && !file.includes('.git')) {
        capabilities.dockerfiles.push(file)
        if (file.endsWith('Dockerfile')) {
          capabilities.hasDockerfile = true
        }
      }
    }
  } catch {
    // Ignore errors in file scanning
  }
}

async function findAndParseComposeFiles(dir: string, capabilities: DockerCapabilities) {
  const composePatterns = [
    '**/docker-compose.yml',
    '**/docker-compose.yaml',
    '**/compose.yml',
    '**/compose.yaml'
  ]

  for (const pattern of composePatterns) {
    // eslint-disable-next-line no-undef
    const glob = new Bun.Glob(pattern)

    try {
      for await (const file of glob.scan({ cwd: dir, absolute: true })) {
        if (!file.includes('node_modules') && !file.includes('.git')) {
          capabilities.composeFiles.push(file)
          await parseComposeFile(file, capabilities)
        }
      }
    } catch {
      // Ignore errors in file scanning
    }
  }
}

async function parseComposeFile(filePath: string, capabilities: DockerCapabilities) {
  try {
    // eslint-disable-next-line no-undef
    const content = await Bun.file(filePath).text()
    const lines = content.split('\n')
    
    let inServices = false
    let inNetworks = false
    let inVolumes = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (line === 'services:') {
        inServices = true
        inNetworks = false
        inVolumes = false
        continue
      } else if (line === 'networks:') {
        inServices = false
        inNetworks = true
        inVolumes = false
        continue
      } else if (line === 'volumes:') {
        inServices = false
        inNetworks = false
        inVolumes = true
        continue
      } else if (line.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/) && !trimmed.includes(' ')) {
        inServices = false
        inNetworks = false
        inVolumes = false
      }

      if (inServices && line.match(/^ {2}[a-zA-Z][a-zA-Z0-9_-]*:/)) {
        const serviceName = trimmed.replace(':', '')
        capabilities.services.add(serviceName)
      }

      if (inNetworks && trimmed.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/) && !trimmed.includes(' ')) {
        const networkName = trimmed.replace(':', '')
        capabilities.networks.add(networkName)
      }

      if (inVolumes && trimmed.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/) && !trimmed.includes(' ')) {
        const volumeName = trimmed.replace(':', '')
        capabilities.volumes.add(volumeName)
      }
    }
  } catch {
    // Ignore parsing errors
  }
}

function generateServiceProfiles(capabilities: DockerCapabilities) {
  const services = Array.from(capabilities.services)

  if (services.length === 0) return

  const databases = services.filter(service => 
    service.toLowerCase().includes('db') ||
    service.toLowerCase().includes('postgres') ||
    service.toLowerCase().includes('mysql') ||
    service.toLowerCase().includes('mongo')
  )
  if (databases.length > 0) {
    capabilities.profiles.database = databases
  }

  const cache = services.filter(service => 
    service.toLowerCase().includes('redis') ||
    service.toLowerCase().includes('memcached') ||
    service.toLowerCase().includes('cache')
  )
  if (cache.length > 0) {
    capabilities.profiles.cache = cache
  }

  const test = services.filter(service => 
    service.toLowerCase().includes('test')
  )
  if (test.length > 0) {
    capabilities.profiles.test = test
  }

  const dev = services.filter(service => 
    !service.toLowerCase().includes('test')
  )
  if (dev.length > 0) {
    capabilities.profiles.dev = dev
  }

  capabilities.profiles.all = services
}