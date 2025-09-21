/**
 * Core types and interfaces for the @autotelic/oc-kit package
 */

/**
 * OpenCode context information passed to custom tools
 */
export interface OpenCodeContext {
  /** Current session ID */
  sessionID: string
  /** Current message ID */
  messageID: string
  /** Agent name or identifier */
  agent: string
  /** Working directory for the current session */
  cwd?: string
}

/**
 * Arguments passed to all kit tools
 */
export interface ToolArgs {
  /** Name of the script to run (for package.json scripts) */
  script?: string
  /** Array of scripts to run (for multi-service operations) */
  scripts?: string[]
  /** Additional command line arguments to pass */
  args?: string[]
  /** Working directory to execute commands in */
  cwd?: string
  /** Package manager to use (npm, yarn, pnpm, bun) - auto-detected if not specified */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'bun'
  /** Skip automatic Doppler environment variable wrapping */
  skipDoppler?: boolean
  /** Docker/Compose action to perform */
  action?: string
  /** Docker image name for build/run/pull/push operations */
  image?: string
  /** Container name or ID for exec/logs/stop/start/restart/rm operations */
  container?: string
  /** Image tag for build/push operations */
  tag?: string
  /** Command timeout in milliseconds */
  timeout?: number
  /** Specific services to target in Docker Compose operations */
  services?: string[]
  /** Service profile to use (database, cache, test, dev, all) */
  profile?: string
  /** Specific compose file to use (auto-detects if not specified) */
  file?: string
  /** Run Docker Compose operations in detached mode */
  detach?: boolean
  /** SQL query string for dev query operations */
  query?: string
  /** Parameters for SQL query operations */
  params?: any[]
}

/**
 * Describes Docker capabilities discovered in a project directory
 */
export interface DockerCapabilities {
  /** Whether Docker CLI is available on the system */
  dockerAvailable: boolean
  /** Whether a main Dockerfile exists */
  hasDockerfile: boolean
  /** Paths to all discovered Dockerfiles */
  dockerfiles: string[]
  /** Paths to all discovered Docker Compose files */
  composeFiles: string[]
  /** Set of all services found in compose files */
  services: Set<string>
  /** Set of all networks found in compose files */
  networks: Set<string>
  /** Set of all volumes found in compose files */
  volumes: Set<string>
  /** Auto-generated service profiles (database, cache, test, dev, all) */
  profiles: Record<string, string[]>
}

/**
 * Describes Doppler CLI capabilities and configuration
 */
export interface DopplerCapabilities {
  /** Whether Doppler CLI is installed and accessible */
  available: boolean
  /** Whether a valid Doppler config file exists */
  hasConfig: boolean
  /** Path to the discovered config file (doppler.yaml or .doppler/cli.json) */
  configFile: string | null
  /** Error message if detection failed */
  error?: string
}

/**
 * Result of executing a shell command
 */
export interface CommandResult {
  /** The command array that was executed */
  command: string[]
  /** Exit code returned by the command */
  exitCode: number
  /** Standard output from the command */
  stdout: string
  /** Standard error output from the command */
  stderr: string
}

/**
 * Options for command execution
 */
export interface ExecutionOptions {
  /** Working directory to execute the command in */
  cwd: string
  /** Command timeout in milliseconds */
  timeout?: number
}