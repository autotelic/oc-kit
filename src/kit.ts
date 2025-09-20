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

import type { ToolArgs, OpenCodeContext } from './types.js'
import { executePackageScript, listPackageScripts } from './package-tools.js'
import { executeDockerCommand } from './docker-tools.js'
import { executeComposeCommand } from './compose-tools.js'
import { listDockerCapabilities } from './docker-list.js'

// OpenCode plugin compatibility layer
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

// Load tool description
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
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executePackageScript(args, context)
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
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return listPackageScripts(args, context)
  }
})

/**
 * Custom opencode tool for executing Docker container operations.
 * Part of the @autotelic/oc-kit package. Only available if Docker is detected.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const docker = tool({
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
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeDockerCommand(args, context)
  }
})

/**
 * Custom opencode tool for executing Docker Compose operations.
 * Part of the @autotelic/oc-kit package. Only available if compose files are detected.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const compose = tool({
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
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeComposeCommand(args, context)
  }
})

/**
 * Custom opencode tool for listing available Docker operations, discovered services, and Docker capabilities.
 * Part of the @autotelic/oc-kit package.
 * 
 * @see https://opencode.ai/docs/custom-tools
 */
export const dockerList = tool({
  description: 'List available Docker operations, discovered services, and Docker capabilities in the current project.',
  args: {
    cwd: tool.schema.string().optional().describe('Working directory (defaults to current directory)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return listDockerCapabilities(args, context)
  }
})