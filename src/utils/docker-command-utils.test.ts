/**
 * Tests for Docker command utilities
 */
import { describe, test, expect } from 'bun:test'
import {
  validateAction,
  validateRequiredParam,
  validateDockerAvailable,
  validateComposeAvailable,
  addAdditionalArgs,
  resolveComposeFile,
  resolveTargetServices,
  CONTAINER_ACTIONS,
  IMAGE_ACTIONS,
  SPECIAL_ARG_ACTIONS
} from './docker-command-utils.js'
import type { DockerCapabilities, ToolArgs } from '../types.js'

describe('Command Validation', () => {
  test('validateAction succeeds with valid action', () => {
    const result = validateAction('build')
    expect(result).toEqual({ valid: true })
  })

  test('validateAction fails with undefined action', () => {
    const result = validateAction(undefined)
    expect(result).toEqual({
      valid: false,
      error: 'Error: action parameter is required'
    })
  })

  test('validateAction fails with empty action', () => {
    const result = validateAction('')
    expect(result).toEqual({
      valid: false,
      error: 'Error: action parameter is required'
    })
  })

  test('validateRequiredParam succeeds with valid parameter', () => {
    const result = validateRequiredParam('container', 'my-container', 'logs')
    expect(result).toEqual({ valid: true })
  })

  test('validateRequiredParam fails with undefined parameter', () => {
    const result = validateRequiredParam('container', undefined, 'logs')
    expect(result).toEqual({
      valid: false,
      error: 'Error: container parameter is required for logs action'
    })
  })

  test('validateRequiredParam fails with empty parameter', () => {
    const result = validateRequiredParam('image', '', 'run')
    expect(result).toEqual({
      valid: false,
      error: 'Error: image parameter is required for run action'
    })
  })

  test('validateDockerAvailable succeeds when Docker is available', () => {
    const capabilities: DockerCapabilities = {
      dockerAvailable: true,
      hasDockerfile: false,
      dockerfiles: [],
      composeFiles: [],
      services: new Set(),
      networks: new Set(),
      volumes: new Set(),
      profiles: {}
    }
    const result = validateDockerAvailable(capabilities)
    expect(result).toEqual({ valid: true })
  })

  test('validateDockerAvailable fails when Docker is not available', () => {
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
    const result = validateDockerAvailable(capabilities)
    expect(result).toEqual({
      valid: false,
      error: 'Error: Docker is not available on this system. Please install Docker to use this tool.'
    })
  })

  test('validateComposeAvailable succeeds when compose files exist', () => {
    const capabilities: DockerCapabilities = {
      dockerAvailable: true,
      hasDockerfile: false,
      dockerfiles: [],
      composeFiles: ['docker-compose.yml'],
      services: new Set(),
      networks: new Set(),
      volumes: new Set(),
      profiles: {}
    }
    const result = validateComposeAvailable(capabilities)
    expect(result).toEqual({ valid: true })
  })

  test('validateComposeAvailable fails when no compose files exist', () => {
    const capabilities: DockerCapabilities = {
      dockerAvailable: true,
      hasDockerfile: false,
      dockerfiles: [],
      composeFiles: [],
      services: new Set(),
      networks: new Set(),
      volumes: new Set(),
      profiles: {}
    }
    const result = validateComposeAvailable(capabilities)
    expect(result).toEqual({
      valid: false,
      error: 'Error: No Docker Compose files found in this project.'
    })
  })
})

describe('Command Building Utilities', () => {
  test('addAdditionalArgs adds args when present', () => {
    const command = ['docker', 'build']
    const args: ToolArgs = {
      action: 'build',
      args: ['--no-cache', '--tag', 'my-image']
    }
    
    addAdditionalArgs(command, args)
    expect(command).toEqual(['docker', 'build', '--no-cache', '--tag', 'my-image'])
  })

  test('addAdditionalArgs skips excluded actions', () => {
    const command = ['docker', 'exec']
    const args: ToolArgs = {
      action: 'exec',
      args: ['-it', '/bin/bash']
    }
    
    addAdditionalArgs(command, args, ['exec'])
    expect(command).toEqual(['docker', 'exec'])
  })

  test('addAdditionalArgs handles empty args', () => {
    const command = ['docker', 'build']
    const args: ToolArgs = {
      action: 'build',
      args: []
    }
    
    addAdditionalArgs(command, args)
    expect(command).toEqual(['docker', 'build'])
  })

  test('addAdditionalArgs handles undefined args', () => {
    const command = ['docker', 'build']
    const args: ToolArgs = {
      action: 'build'
    }
    
    addAdditionalArgs(command, args)
    expect(command).toEqual(['docker', 'build'])
  })

  test('addAdditionalArgs filters out undefined values', () => {
    const command = ['docker', 'build']
    const args: ToolArgs = {
      action: 'build',
      args: ['--no-cache', '--tag', 'my-image']
    }
    
    addAdditionalArgs(command, args)
    expect(command).toEqual(['docker', 'build', '--no-cache', '--tag', 'my-image'])
  })
})

describe('Compose File Resolution', () => {
  const createCapabilities = (files: string[]): DockerCapabilities => ({
    dockerAvailable: true,
    hasDockerfile: false,
    dockerfiles: [],
    composeFiles: files,
    services: new Set(),
    networks: new Set(),
    volumes: new Set(),
    profiles: {}
  })

  test('resolveComposeFile uses explicit file when provided', () => {
    const args: ToolArgs = { action: 'up', file: 'custom-compose.yml' }
    const capabilities = createCapabilities(['docker-compose.yml'])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBe('custom-compose.yml')
  })

  test('resolveComposeFile returns null when no files available', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities([])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBeNull()
  })

  test('resolveComposeFile returns null for standard docker-compose.yaml', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities(['docker-compose.yaml'])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBeNull()
  })

  test('resolveComposeFile returns null for standard docker-compose.yml', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities(['docker-compose.yml'])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBeNull()
  })

  test('resolveComposeFile returns custom file name', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities(['docker-compose.dev.yml'])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBe('docker-compose.dev.yml')
  })

  test('resolveComposeFile prefers standard files over custom', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities(['custom.yml', 'docker-compose.yaml', 'other.yml'])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBeNull() // standard file doesn't need -f flag
  })

  test('resolveComposeFile prefers docker-compose.yml over docker-compose.yaml', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities(['docker-compose.yaml', 'docker-compose.yml'])
    
    const result = resolveComposeFile(args, capabilities)
    expect(result).toBeNull() // both are standard, uses first found
  })
})

describe('Target Service Resolution', () => {
  const createCapabilities = (profiles: Record<string, string[]>): DockerCapabilities => ({
    dockerAvailable: true,
    hasDockerfile: false,
    dockerfiles: [],
    composeFiles: [],
    services: new Set(),
    networks: new Set(),
    volumes: new Set(),
    profiles
  })

  test('resolveTargetServices uses profile when provided', () => {
    const args: ToolArgs = { action: 'up', profile: 'database' }
    const capabilities = createCapabilities({
      database: ['postgres', 'redis'],
      web: ['frontend', 'backend']
    })
    
    const result = resolveTargetServices(args, capabilities)
    expect(result).toEqual(['postgres', 'redis'])
  })

  test('resolveTargetServices uses explicit services when provided', () => {
    const args: ToolArgs = { action: 'up', services: ['nginx', 'app'] }
    const capabilities = createCapabilities({})
    
    const result = resolveTargetServices(args, capabilities)
    expect(result).toEqual(['nginx', 'app'])
  })

  test('resolveTargetServices prefers profile over services', () => {
    const args: ToolArgs = { 
      action: 'up', 
      profile: 'database',
      services: ['nginx', 'app'] 
    }
    const capabilities = createCapabilities({
      database: ['postgres', 'redis']
    })
    
    const result = resolveTargetServices(args, capabilities)
    expect(result).toEqual(['postgres', 'redis'])
  })

  test('resolveTargetServices returns empty array when profile not found', () => {
    const args: ToolArgs = { action: 'up', profile: 'nonexistent' }
    const capabilities = createCapabilities({
      database: ['postgres', 'redis']
    })
    
    const result = resolveTargetServices(args, capabilities)
    expect(result).toEqual([])
  })

  test('resolveTargetServices returns empty array when nothing specified', () => {
    const args: ToolArgs = { action: 'up' }
    const capabilities = createCapabilities({})
    
    const result = resolveTargetServices(args, capabilities)
    expect(result).toEqual([])
  })

  test('resolveTargetServices handles empty services array', () => {
    const args: ToolArgs = { action: 'up', services: [] }
    const capabilities = createCapabilities({})
    
    const result = resolveTargetServices(args, capabilities)
    expect(result).toEqual([])
  })
})

describe('Action Constants', () => {
  test('CONTAINER_ACTIONS contains expected actions', () => {
    expect(CONTAINER_ACTIONS.has('exec')).toBe(true)
    expect(CONTAINER_ACTIONS.has('logs')).toBe(true)
    expect(CONTAINER_ACTIONS.has('stop')).toBe(true)
    expect(CONTAINER_ACTIONS.has('start')).toBe(true)
    expect(CONTAINER_ACTIONS.has('restart')).toBe(true)
    expect(CONTAINER_ACTIONS.has('rm')).toBe(true)
    expect(CONTAINER_ACTIONS.has('build')).toBe(false)
  })

  test('IMAGE_ACTIONS contains expected actions', () => {
    expect(IMAGE_ACTIONS.has('run')).toBe(true)
    expect(IMAGE_ACTIONS.has('pull')).toBe(true)
    expect(IMAGE_ACTIONS.has('push')).toBe(true)
    expect(IMAGE_ACTIONS.has('exec')).toBe(false)
  })

  test('SPECIAL_ARG_ACTIONS contains expected actions', () => {
    expect(SPECIAL_ARG_ACTIONS.has('exec')).toBe(true)
    expect(SPECIAL_ARG_ACTIONS.has('logs')).toBe(false)
  })

  test('action sets are mutually exclusive', () => {
    const containerActionsArray = Array.from(CONTAINER_ACTIONS)
    
    const intersection = containerActionsArray.filter(action => 
      IMAGE_ACTIONS.has(action)
    )
    
    expect(intersection).toHaveLength(0)
  })
})