/**
 * @autotelic/oc-kit - Custom tools for opencode
 * 
 * This package provides custom tools for opencode that replace bash commands with smart automation
 * for package.json scripts and Docker operations. Built by Autotelic.
 * 
 * The tools in this file are designed to be used by opencode agents to provide superior automation
 * over raw bash commands, with features like auto-detection of package managers, Doppler integration,
 * structured output, and proper error handling.
 * 
 * @see https://github.com/autotelic/oc-kit
 * @see https://opencode.ai/docs/custom-tools
 */

// Types for opencode plugin compatibility
interface ToolArgs {
  script?: string
  args?: string[]
  cwd?: string
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
  skipDoppler?: boolean
  action?: string
  image?: string
  container?: string
  tag?: string
  timeout?: number
  services?: string[]
  profile?: string
  file?: string
  detach?: boolean
}

const toolModule = await import('@opencode-ai/plugin').catch(() => {
  const mockDescribe = { 
    describe: (_d: string) => mockDescribe,
    optional: () => mockDescribe,
    _zod: true as any
  }
  const mockOptional = { 
    describe: (_d: string) => mockOptional,
    optional: () => mockDescribe,
    _zod: true as any
  }
  
  return {
    tool: Object.assign((config: any) => config, {
      schema: {
        string: () => mockDescribe,
        array: () => mockOptional,
        enum: () => mockOptional,
        boolean: () => mockOptional,
        number: () => mockOptional
      }
    })
  }
})
const { tool } = toolModule

/**
 * Loads the tool description from the kit.txt file.
 * This description is provided to the opencode agent to understand when and how to use this tool.
 */
// eslint-disable-next-line no-undef
const DESCRIPTION = await Bun.file(`${import.meta.dir}/../tool/kit.txt`).text()

/**
 * Custom opencode tool for running package.json scripts with smart automation and Doppler integration.
 * 
 * This is an Autotelic-built tool that provides superior automation over bash commands for package.json
 * scripts and Docker operations. It auto-detects package managers, integrates with Doppler for environment
 * variables, and provides structured output with proper error handling.
 * 
 * @see https://github.com/autotelic/oc-kit - Source code and documentation
 * @see https://opencode.ai/docs/custom-tools - opencode custom tools documentation
 */
export default tool({
  description: DESCRIPTION,
  args: {
    script: tool.schema.string().describe("Name of the script to run (e.g., 'build', 'test', 'dev')"),
    args: tool.schema.array(tool.schema.string()).optional().describe('Additional arguments to pass to the script'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)'),
    packageManager: tool.schema.enum(['npm', 'yarn', 'pnpm', 'bun']).optional().describe('Package manager to use (auto-detected if not specified)'),
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)')
  },
  async execute (args: ToolArgs): Promise<string> {
    const workingDir = args.cwd || process.cwd()
    // eslint-disable-next-line no-undef
    const packagePath = Bun.resolveSync('./package.json', workingDir)

    try {
      // eslint-disable-next-line no-undef
      const packageJson = await Bun.file(packagePath).json() as Record<string, unknown>

      const scripts = (packageJson.scripts as Record<string, string>) || {}

      if (!args.script) {
        return 'Error: script parameter is required'
      }

      if (!scripts[args.script]) {
        const availableScripts = Object.keys(scripts)
        return `Script "${args.script}" not found. Available scripts: ${availableScripts.join(', ')}`
      }

      const packageManager = args.packageManager || await detectPackageManager(workingDir)

      const baseCommand = [packageManager, 'run', args.script]
      if (args.args && args.args.length > 0) {
        baseCommand.push('--', ...args.args)
      }

      const finalCommand = await wrapWithDoppler(baseCommand, workingDir, args.skipDoppler, args.script)

      // eslint-disable-next-line no-undef
      const proc = Bun.spawn(finalCommand, {
        cwd: workingDir,
        stdout: 'pipe',
        stderr: 'pipe'
      })

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ])

      const exitCode = await proc.exited

      return `Command: ${finalCommand.join(' ')}\nExit code: ${exitCode}\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`
    } catch (error) {
      return `Error: ${(error as Error).message}`
    }
  }
})

/**
 * Detects the package manager used in the given directory by checking for lock files.
 * @param dir - Directory to search for lock files
 * @returns The detected package manager (bun, pnpm, yarn, or npm)
 */
async function detectPackageManager (dir: string): Promise<string> {
  const lockFiles = [
    { file: 'bun.lock', manager: 'bun' },
    { file: 'bun.lockb', manager: 'bun' }, // Binary lock file format
    { file: 'pnpm-lock.yaml', manager: 'pnpm' },
    { file: 'yarn.lock', manager: 'yarn' },
    { file: 'package-lock.json', manager: 'npm' }
  ]

  for (const { file, manager } of lockFiles) {
    // eslint-disable-next-line no-undef
    const lockFile = Bun.file(`${dir}/${file}`)

    if (await lockFile.exists()) {
      return manager
    }
  }

  return 'npm'
}

/**
 * Describes the discovered Docker capabilities in a project directory.
 */
interface DockerCapabilities {
  dockerAvailable: boolean
  hasDockerfile: boolean
  dockerfiles: string[]
  composeFiles: string[]
  services: Set<string>
  networks: Set<string>
  volumes: Set<string>
  profiles: Record<string, string[]>
}

/**
 * Detects Docker capabilities in the given working directory, including Dockerfiles, compose files, and services.
 * @param workingDir - The directory to scan for Docker capabilities
 * @returns DockerCapabilities object describing the environment
 */
async function detectDockerCapabilities (workingDir: string): Promise<DockerCapabilities> {
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

  try {
    // eslint-disable-next-line no-undef
    const dockerCheck = Bun.spawn(['docker', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe'
    })
    await dockerCheck.exited
    capabilities.dockerAvailable = dockerCheck.exitCode === 0
  } catch {
  }

  await findDockerfiles(workingDir, capabilities)
  await findAndParseComposeFiles(workingDir, capabilities)
  generateServiceProfiles(capabilities)
  return capabilities
}

/**
 * Recursively finds Dockerfiles in the given directory and updates the capabilities object.
 * @param dir - Directory to search
 * @param capabilities - DockerCapabilities object to update
 */
async function findDockerfiles (dir: string, capabilities: DockerCapabilities) {
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
  }
}

/**
 * Finds and parses Docker Compose files in the given directory, updating the capabilities object.
 * @param dir - Directory to search
 * @param capabilities - DockerCapabilities object to update
 */
async function findAndParseComposeFiles (dir: string, capabilities: DockerCapabilities) {
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
    }
  }
}

/**
 * Parses a Docker Compose YAML file to extract services, networks, and volumes, updating the capabilities object.
 * @param filePath - Path to the compose file
 * @param capabilities - DockerCapabilities object to update
 */
async function parseComposeFile (filePath: string, capabilities: DockerCapabilities) {
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

      // Parse service names (handle indented services)
      if (inServices && line.match(/^ {2}[a-zA-Z][a-zA-Z0-9_-]*:/)) {
        const serviceName = trimmed.replace(':', '')
        capabilities.services.add(serviceName)
      }

      // Parse network names
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

  }
}

/**
 * Generates intelligent service profiles (database, cache, test, dev, all) based on discovered services.
 * @param capabilities - DockerCapabilities object to update
 */
function generateServiceProfiles (capabilities: DockerCapabilities) {
  const services = Array.from(capabilities.services)

  if (services.length === 0) return

  const databases = services.filter(service => service.toLowerCase().includes('db') ||
    service.toLowerCase().includes('postgres') ||
    service.toLowerCase().includes('mysql') ||
    service.toLowerCase().includes('mongo')
  )
  if (databases.length > 0) {
    capabilities.profiles.database = databases
  }

  const cache = services.filter(service => service.toLowerCase().includes('redis') ||
    service.toLowerCase().includes('memcached') ||
    service.toLowerCase().includes('cache')
  )
  if (cache.length > 0) {
    capabilities.profiles.cache = cache
  }

  const test = services.filter(service => service.toLowerCase().includes('test')
  )
  if (test.length > 0) {
    capabilities.profiles.test = test
  }

  const dev = services.filter(service => !service.toLowerCase().includes('test')
  )
  if (dev.length > 0) {
    capabilities.profiles.dev = dev
  }

  capabilities.profiles.all = services
}

/**
 * Caches for Docker capabilities to avoid redundant detection.
 */
let dockerCapabilitiesCache: DockerCapabilities | null = null
let cacheDir: string | null = null
let dockerCachePromise: Promise<DockerCapabilities> | null = null

/**
 * Gets cached Docker capabilities for a directory, or detects them if not cached.
 * @param workingDir - Directory to check
 * @returns DockerCapabilities object
 */
async function getDockerCapabilities (workingDir: string): Promise<DockerCapabilities> {
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

/**
 * Describes the discovered Doppler CLI and config capabilities in a project directory.
 */
interface DopplerCapabilities {
  available: boolean
  hasConfig: boolean
  configFile: string | null
  error?: string
}

/**
 * Caches for Doppler capabilities to avoid redundant detection.
 */
let dopplerCapabilitiesCache: DopplerCapabilities | null = null
let dopplerCacheDir: string | null = null
let dopplerCachePromise: Promise<DopplerCapabilities> | null = null

/**
 * Detects Doppler CLI and config file availability in the given directory.
 * @param workingDir - Directory to check
 * @returns DopplerCapabilities object
 */
async function detectDopplerCapabilities (workingDir: string): Promise<DopplerCapabilities> {
  const capabilities: DopplerCapabilities = {
    available: false,
    hasConfig: false,
    configFile: null
  }

  try {
    // eslint-disable-next-line no-undef
    const dopplerCheck = Bun.spawn(['doppler', '--version'], {
      stdout: 'pipe',
      stderr: 'pipe'
    })
    await dopplerCheck.exited
    capabilities.available = dopplerCheck.exitCode === 0

    if (!capabilities.available) {
      capabilities.error = 'Doppler CLI not installed or not accessible'
      return capabilities
    }
  } catch (error) {
    capabilities.error = `Failed to check Doppler availability: ${(error as Error).message}`
    return capabilities
  }

  if (capabilities.available) {
    // eslint-disable-next-line no-undef
    const dopplerYaml = Bun.file(`${workingDir}/doppler.yaml`)
    if (await dopplerYaml.exists()) {
      capabilities.hasConfig = true
      capabilities.configFile = 'doppler.yaml'

      try {
        const content = await dopplerYaml.text()
        if (!content.trim()) {
          capabilities.error = 'doppler.yaml exists but is empty'
          capabilities.hasConfig = false
        }
      } catch (error) {
        capabilities.error = `Failed to read doppler.yaml: ${(error as Error).message}`
        capabilities.hasConfig = false
      }
    } else {
      // eslint-disable-next-line no-undef
      const dopplerJson = Bun.file(`${workingDir}/.doppler/cli.json`)
      if (await dopplerJson.exists()) {
        capabilities.hasConfig = true
        capabilities.configFile = '.doppler/cli.json'

        try {
          const content = await dopplerJson.text()
          JSON.parse(content) // Validate it's valid JSON
        } catch (error) {
          capabilities.error = `Failed to parse .doppler/cli.json: ${(error as Error).message}`
          capabilities.hasConfig = false
        }
      } else {
        capabilities.error = 'No Doppler config found (doppler.yaml or .doppler/cli.json)'
      }
    }
  }

  return capabilities
}

/**
 * Gets cached Doppler capabilities for a directory, or detects them if not cached.
 * @param workingDir - Directory to check
 * @returns DopplerCapabilities object
 */
async function getDopplerCapabilities (workingDir: string): Promise<DopplerCapabilities> {
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
 * Wraps a command with Doppler if Doppler is available and not skipped, and if the action is not read-only.
 * @param command - The command array to wrap
 * @param workingDir - The working directory for Doppler detection
 * @param skipDoppler - If true, skips Doppler wrapping
 * @param action - The action name (for read-only detection)
 * @returns The possibly Doppler-wrapped command array
 */
async function wrapWithDoppler (
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

/**
 * Determines if a given Docker or script action is read-only (does not modify state).
 * @param action - The action name to check
 * @returns True if the action is read-only, false otherwise
 */
function isReadOnlyAction (action: string): boolean {
  const readOnlyActions = new Set([
    'ps', 'logs', 'list', 'version', '--version', '--help',
    'status', 'inspect', 'history', 'images', 'info',
    'top', 'stats', 'port', 'diff'
  ])

  return readOnlyActions.has(action) || action.startsWith('--')
}

/**
 * Custom opencode tool for executing Docker container operations.
 * Part of the @autotelic/oc-kit package. Only available if Docker is detected.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
const dockerTool = tool({
  description: 'Execute Docker container operations. Auto-detects available containers and provides common Docker commands.',
  args: {
    action: tool.schema.enum(['build', 'run', 'exec', 'logs', 'ps', 'stop', 'start', 'restart', 'rm', 'pull', 'push']).describe('Docker action to perform'),
    image: tool.schema.string().optional().describe('Docker image name (for build, run, pull, push)'),
    container: tool.schema.string().optional().describe('Container name or ID (for exec, logs, stop, start, restart, rm)'),
    tag: tool.schema.string().optional().describe('Image tag (for build, push)'),
    args: tool.schema.array(tool.schema.string()).optional().describe('Additional arguments to pass to Docker command'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)'),
    timeout: tool.schema.number().optional().describe('Timeout in milliseconds (default: 30s for logs, 5min for build/pull, 30s for others)'),
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)')
  },
  async execute (args: ToolArgs): Promise<string> {
    const workingDir = args.cwd || process.cwd()
    const capabilities = await getDockerCapabilities(workingDir)

    if (!capabilities.dockerAvailable) {
      return 'Error: Docker is not available on this system. Please install Docker to use this tool.'
    }

    if (!args.action) {
      return 'Error: action parameter is required'
    }

    const baseCommand = ['docker', args.action]

    switch (args.action) {
      case 'build':
        if (args.tag) baseCommand.push('-t', args.tag)
        if (args.image) baseCommand.push(args.image)
        else baseCommand.push('.')
        break

      case 'run':
        if (!args.image) return 'Error: image parameter is required for run action'
        baseCommand.push(args.image)
        break

      case 'exec':
        if (!args.container) return 'Error: container parameter is required for exec action'
        baseCommand.push('-it', args.container)
        if (args.args && args.args.length > 0) {
          baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
        } else {
          baseCommand.push('/bin/sh')
        }
        break

      case 'logs':
        if (!args.container) return 'Error: container parameter is required for logs action'

        baseCommand.push('--tail', '100', args.container)
        break

      case 'stop':
      case 'start':
      case 'restart':
      case 'rm':
        if (!args.container) return `Error: container parameter is required for ${args.action} action`
        baseCommand.push(args.container)
        break

      case 'pull':
      case 'push':
        if (!args.image) return `Error: image parameter is required for ${args.action} action`
        baseCommand.push(args.image)
        break
    }

    if (args.args && args.args.length > 0 && !['exec'].includes(args.action || '')) {
      baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
    }

    const getTimeout = () => {
      if (args.timeout) return args.timeout
      switch (args.action) {
        case 'build':
        case 'pull':
        case 'push':
          return 5 * 60 * 1000 // 5 minutes for potentially long operations
        case 'logs':
          return 30 * 1000 // 30 seconds for log viewing
        default:
          return 30 * 1000 // 30 seconds for quick operations
      }
    }

    const finalCommand = await wrapWithDoppler(baseCommand, workingDir, args.skipDoppler, args.action)

    try {
      // eslint-disable-next-line no-undef
      const proc = Bun.spawn(finalCommand, {
        cwd: workingDir,
        stdout: 'pipe',
        stderr: 'pipe'
      })

      const timeoutMs = getTimeout()
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)), timeoutMs)
      })

      const result = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited
        ]),
        timeoutPromise
      ])

      const [stdout, stderr, exitCode] = result

      return `Command: ${finalCommand.join(' ')}\nExit code: ${exitCode}\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`
    } catch (error) {
      return `Error: ${(error as Error).message}`
    }
  }
})

/**
 * Custom opencode tool for executing Docker Compose operations.
 * Part of the @autotelic/oc-kit package. Only available if compose files are detected.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
const composeTool = tool({
  description: 'Execute Docker Compose operations. Auto-detects compose files and services, supports profiles and service selection.',
  args: {
    action: tool.schema.enum(['up', 'down', 'build', 'logs', 'exec', 'ps', 'restart', 'stop', 'start', 'pull']).describe('Docker Compose action to perform'),
    services: tool.schema.array(tool.schema.string()).optional().describe('Specific services to target (leave empty for all)'),
    profile: tool.schema.string().optional().describe('Service profile to use (database, cache, test, dev, all)'),
    file: tool.schema.string().optional().describe('Specific compose file to use (auto-detects if not specified)'),
    detach: tool.schema.boolean().optional().describe('Run in detached mode (default: true for up action)'),
    args: tool.schema.array(tool.schema.string()).optional().describe('Additional arguments to pass to docker-compose'),
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)'),
    timeout: tool.schema.number().optional().describe('Timeout in milliseconds (default: 30s for logs, 5min for build/up/pull, 30s for others)'),
    skipDoppler: tool.schema.boolean().optional().describe('Skip automatic Doppler wrapping (default: false)')
  },
  async execute (args: ToolArgs): Promise<string> {
    const workingDir = args.cwd || process.cwd()
    const capabilities = await getDockerCapabilities(workingDir)

    if (!capabilities.dockerAvailable) {
      return 'Error: Docker is not available on this system. Please install Docker to use this tool.'
    }

    if (capabilities.composeFiles.length === 0) {
      return 'Error: No Docker Compose files found in this project.'
    }

    const baseCommand = ['docker-compose']

    if (args.file) {
      baseCommand.push('-f', args.file)
    } else if (capabilities.composeFiles.length > 0) {
      const mainComposeFile = capabilities.composeFiles.find(f => f.endsWith('docker-compose.yaml') || f.endsWith('docker-compose.yml')
      ) || capabilities.composeFiles[0]

      if (mainComposeFile && !mainComposeFile.endsWith('docker-compose.yaml') && !mainComposeFile.endsWith('docker-compose.yml')) {
        baseCommand.push('-f', mainComposeFile)
      }
    }

    if (!args.action) {
      return 'Error: action parameter is required'
    }

    baseCommand.push(args.action)

    let targetServices: string[] = []

    if (args.profile && capabilities.profiles[args.profile]) {
      targetServices = capabilities.profiles[args.profile] || []
    } else if (args.services && args.services.length > 0) {
      targetServices = args.services
    }

    switch (args.action) {
      case 'up':
        if (args.detach !== false) {
          baseCommand.push('-d')
        }
        break

      case 'logs':

        baseCommand.push('--tail=100')
        break

      case 'exec':
        if (targetServices.length === 0) {
          return 'Error: exec action requires a service to be specified via services parameter'
        }
        if (targetServices.length > 1) {
          return 'Error: exec action can only target one service at a time'
        }
        const targetService = targetServices[0]
        if (!targetService) {
          return 'Error: no target service found'
        }
        baseCommand.push(targetService)
        if (args.args && args.args.length > 0) {
          baseCommand.push(...args.args.filter((arg): arg is string => arg !== undefined))
        } else {
          baseCommand.push('/bin/sh')
        }
        targetServices = []
        break
    }

    if (args.args && args.args.length > 0 && args.action !== 'exec') {
      baseCommand.push(...args.args)
    }

    if (targetServices.length > 0) {
      baseCommand.push(...targetServices)
    }

    const getTimeout = () => {
      if (args.timeout) return args.timeout
      switch (args.action) {
        case 'build':
        case 'up':
        case 'pull':
          return 5 * 60 * 1000 // 5 minutes for potentially long operations
        case 'logs':
          return 30 * 1000 // 30 seconds for log viewing
        default:
          return 60 * 1000 // 1 minute for other compose operations
      }
    }

    const finalCommand = await wrapWithDoppler(baseCommand, workingDir, args.skipDoppler, args.action)

    try {
      // eslint-disable-next-line no-undef
      const proc = Bun.spawn(finalCommand, {
        cwd: workingDir,
        stdout: 'pipe',
        stderr: 'pipe'
      })

      const timeoutMs = getTimeout()
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Command timed out after ${timeoutMs}ms`)), timeoutMs)
      })

      const result = await Promise.race([
        Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited
        ]),
        timeoutPromise
      ])

      const [stdout, stderr, exitCode] = result

      return `Command: ${finalCommand.join(' ')}\nExit code: ${exitCode}\n\nStdout:\n${stdout}\n\nStderr:\n${stderr}`
    } catch (error) {
      return `Error: ${(error as Error).message}`
    }
  }
})

/**
 * Custom opencode tool for listing all available scripts in package.json.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const list = tool({
  description: 'List all available scripts in package.json',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute (args: ToolArgs): Promise<string> {
    const workingDir = args.cwd || process.cwd()
    // eslint-disable-next-line no-undef
    const packagePath = Bun.resolveSync('./package.json', workingDir)

    try {
      // eslint-disable-next-line no-undef
      const packageJson = await Bun.file(packagePath).json() as Record<string, unknown>
      const scripts = (packageJson.scripts as Record<string, string>) || {}

      const scriptList = Object.entries(scripts)
        .map(([name, command]) => `  ${name}: ${command}`)
        .join('\n')

      return `Available scripts in ${packagePath}:\n${scriptList}`
    } catch (error) {
      return `Error reading package.json: ${(error as Error).message}`
    }
  }
})

/**
 * Custom opencode tool for listing available Docker operations, discovered services, and Docker capabilities.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
const dockerListTool = tool({
  description: 'List available Docker operations, discovered services, and Docker capabilities in the current project.',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute (args: ToolArgs): Promise<string> {
    const workingDir = args.cwd || process.cwd()
    const capabilities = await getDockerCapabilities(workingDir)

    const output: string[] = []

    output.push('=== Docker Capabilities ===')
    output.push(`Docker Available: ${capabilities.dockerAvailable ? '✅' : '❌'}`)
    output.push(`Dockerfiles Found: ${capabilities.dockerfiles.length}`)
    output.push(`Compose Files Found: ${capabilities.composeFiles.length}`)
    output.push('')

    if (capabilities.dockerfiles.length > 0) {
      output.push('📁 Dockerfiles:')
      capabilities.dockerfiles.forEach(file => {
        const relativePath = file.replace(workingDir, '.')
        output.push(`  ${relativePath}`)
      })
      output.push('')
    }

    if (capabilities.composeFiles.length > 0) {
      output.push('🐳 Docker Compose Files:')
      capabilities.composeFiles.forEach(file => {
        const relativePath = file.replace(workingDir, '.')
        output.push(`  ${relativePath}`)
      })
      output.push('')
    }

    if (capabilities.services.size > 0) {
      output.push('🔧 Discovered Services:')
      Array.from(capabilities.services).sort().forEach(service => {
        output.push(`  ${service}`)
      })
      output.push('')
    }

    if (Object.keys(capabilities.profiles).length > 0) {
      output.push('📋 Auto-Generated Profiles:')
      Object.entries(capabilities.profiles).forEach(([profile, services]) => {
        output.push(`  ${profile}: [${services.join(', ')}]`)
      })
      output.push('')
    }

    if (capabilities.dockerAvailable) {
      output.push('⚡ Available Tools:')
      output.push('  kit_docker - Container operations (build, run, exec, logs, ps, etc.)')

      if (capabilities.composeFiles.length > 0) {
        output.push('  kit_compose - Docker Compose operations (up, down, build, logs, etc.)')
      }

      output.push('')
      output.push('📖 Usage Examples:')
      output.push('  kit_docker { action: "ps" }')
      output.push('  kit_docker { action: "build", tag: "myapp:latest" }')

      if (capabilities.composeFiles.length > 0) {
        output.push('  kit_compose { action: "up" }')
        output.push('  kit_compose { action: "up", profile: "database" }')

        if (capabilities.services.size > 0) {
          const firstService = Array.from(capabilities.services)[0]
          output.push(`  kit_compose { action: "logs", services: ["${firstService}"] }`)
        }
      }
    } else {
      output.push('❌ Docker Tools Unavailable:')
      output.push('  Docker is not installed or not accessible.')
      output.push('  Install Docker to enable kit_docker and kit_compose tools.')
    }

    return output.join('\n')
  }
})

/**
 * Export the dockerList tool for Docker capability discovery.
 */
export const dockerList = dockerListTool

/**
 * Export Docker and Compose tools (they handle their own availability checks).
 */
export const docker = dockerTool
export const compose = composeTool
