/**
 * Docker listing and capability discovery tool
 */

import type { ToolArgs, OpenCodeContext } from './types.js'
import { getDockerCapabilities } from './docker.js'

/**
 * Lists Docker capabilities and discovered files in the current project
 * @param args - Tool arguments containing optional working directory
 * @param context - OpenCode context with session information
 * @returns Promise resolving to formatted Docker capabilities report
 */
export async function listDockerCapabilities(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = args.cwd || context.cwd || process.cwd()
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