/**
 * Core types and interfaces for the @autotelic/oc-kit package
 */

export interface ToolArgs {
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

export interface DockerCapabilities {
  dockerAvailable: boolean
  hasDockerfile: boolean
  dockerfiles: string[]
  composeFiles: string[]
  services: Set<string>
  networks: Set<string>
  volumes: Set<string>
  profiles: Record<string, string[]>
}

export interface DopplerCapabilities {
  available: boolean
  hasConfig: boolean
  configFile: string | null
  error?: string
}

export interface CommandResult {
  command: string[]
  exitCode: number
  stdout: string
  stderr: string
}

export interface ExecutionOptions {
  cwd: string
  timeout?: number
  skipDoppler?: boolean
}