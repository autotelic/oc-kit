/**
 * Tests for command execution utilities - focusing on pure functions
 * Note: executeCommand tests are skipped due to Bun global mocking limitations
 */
import { describe, test, expect } from 'bun:test'
import { formatCommandResult, getDockerTimeout, getComposeTimeout } from './execution.js'
import type { CommandResult } from '../types.js'

// Skip executeCommand tests due to global mocking limitations in Bun
// These would require mocking globalThis.Bun and globalThis.Response which are readonly

describe('Command Result Formatting', () => {
  test('formats successful command result', () => {
    const result: CommandResult = {
      command: ['npm', 'run', 'test'],
      exitCode: 0,
      stdout: 'All tests passed',
      stderr: ''
    }

    const formatted = formatCommandResult(result)

    expect(formatted).toContain('✅ Command completed successfully')
    expect(formatted).toContain('📄 Output:\nAll tests passed')
    expect(formatted).not.toContain('🔧 Command:') // Should not show command details for success
  })

  test('formats failed command result', () => {
    const result: CommandResult = {
      command: ['npm', 'run', 'build'],
      exitCode: 1,
      stdout: 'Building...',
      stderr: 'Type error found'
    }

    const formatted = formatCommandResult(result)

    expect(formatted).toContain('❌ Command failed')
    expect(formatted).toContain('🔧 Command: npm run build')
    expect(formatted).toContain('📉 Exit code: 1')
    expect(formatted).toContain('📄 Stdout:\nBuilding...')
    expect(formatted).toContain('❌ Error details:\nType error found')
  })

  test('formats command with complex arguments', () => {
    const result: CommandResult = {
      command: ['docker', 'run', '--rm', '-it', 'ubuntu:latest', '/bin/bash'],
      exitCode: 0,
      stdout: 'Container output',
      stderr: 'Container warnings'
    }

    const formatted = formatCommandResult(result)

    expect(formatted).toContain('✅ Command completed successfully')
    expect(formatted).toContain('📄 Output:\nContainer output')
    expect(formatted).toContain('⚠️  Warnings:\nContainer warnings')
    expect(formatted).not.toContain('docker run --rm -it ubuntu:latest /bin/bash') // Command details not shown for success
  })

  test('formats result with script name context', () => {
    const result: CommandResult = {
      command: ['npm', 'run', 'test'],
      exitCode: 0,
      stdout: '15 tests passed',
      stderr: '',
      duration: 2500
    }

    const formatted = formatCommandResult(result, 'test')

    expect(formatted).toContain('✅ test completed successfully (2.5s)')
    expect(formatted).toContain('✅ 15 tests passed') // Context message for test script
  })

  test('formats result with timing information', () => {
    const result: CommandResult = {
      command: ['npm', 'run', 'build'],
      exitCode: 0,
      stdout: 'Build complete',
      stderr: '',
      duration: 15000
    }

    const formatted = formatCommandResult(result, 'build')

    expect(formatted).toContain('✅ build completed successfully (15.0s)')
    expect(formatted).toContain('🏗️  Build process completed') // Context message for build script
  })

  test('includes suggestions for failed commands', () => {
    const result: CommandResult = {
      command: ['npm', 'run', 'test'],
      exitCode: 1,
      stdout: '',
      stderr: 'Module not found: cannot resolve dependency'
    }

    const formatted = formatCommandResult(result, 'test')

    expect(formatted).toContain('❌ test failed')
    expect(formatted).toContain('💡 Suggestions:')
    expect(formatted).toContain('npm install') // Should suggest installing dependencies
  })
})

describe('Docker Timeout Calculation', () => {
  test('returns custom timeout when provided', () => {
    const timeout = getDockerTimeout('build', 300000)
    expect(timeout).toBe(300000)
  })

  test('returns 5 minutes for build operations', () => {
    const timeout = getDockerTimeout('build')
    expect(timeout).toBe(5 * 60 * 1000)
  })

  test('returns 5 minutes for pull operations', () => {
    const timeout = getDockerTimeout('pull')
    expect(timeout).toBe(5 * 60 * 1000)
  })

  test('returns 5 minutes for push operations', () => {
    const timeout = getDockerTimeout('push')
    expect(timeout).toBe(5 * 60 * 1000)
  })

  test('returns 30 seconds for logs operations', () => {
    const timeout = getDockerTimeout('logs')
    expect(timeout).toBe(30 * 1000)
  })

  test('returns 30 seconds for other operations', () => {
    const operations = ['ps', 'stop', 'start', 'restart', 'rm', 'exec']
    
    operations.forEach(op => {
      const timeout = getDockerTimeout(op)
      expect(timeout).toBe(30 * 1000)
    })
  })

  test('returns 30 seconds for unknown operations', () => {
    const timeout = getDockerTimeout('unknown-operation')
    expect(timeout).toBe(30 * 1000)
  })
})

describe('Docker Compose Timeout Calculation', () => {
  test('returns custom timeout when provided', () => {
    const timeout = getComposeTimeout('up', 600000)
    expect(timeout).toBe(600000)
  })

  test('returns 5 minutes for build operations', () => {
    const timeout = getComposeTimeout('build')
    expect(timeout).toBe(5 * 60 * 1000)
  })

  test('returns 5 minutes for up operations', () => {
    const timeout = getComposeTimeout('up')
    expect(timeout).toBe(5 * 60 * 1000)
  })

  test('returns 5 minutes for pull operations', () => {
    const timeout = getComposeTimeout('pull')
    expect(timeout).toBe(5 * 60 * 1000)
  })

  test('returns 30 seconds for logs operations', () => {
    const timeout = getComposeTimeout('logs')
    expect(timeout).toBe(30 * 1000)
  })

  test('returns 1 minute for other operations', () => {
    const operations = ['down', 'restart', 'stop', 'start', 'ps']
    
    operations.forEach(op => {
      const timeout = getComposeTimeout(op)
      expect(timeout).toBe(60 * 1000)
    })
  })

  test('returns 1 minute for unknown operations', () => {
    const timeout = getComposeTimeout('unknown-operation')
    expect(timeout).toBe(60 * 1000)
  })
})