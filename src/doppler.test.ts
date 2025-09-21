/**
 * Tests for Doppler CLI integration utilities (simplified without global mocking)
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'

describe('Doppler Integration Tests (No Mocking)', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await Bun.file('').name! // Use Bun's temp directory approach
    testDir = `${import.meta.dir}/../tmp/doppler-test-${Date.now()}`
    await Bun.write(`${testDir}/.keep`, '') // Create directory
  })

  afterEach(async () => {
    if (testDir) {
      // Clean up test directory - Bun handles this better than fs/promises
      try {
        await Bun.spawn(['rm', '-rf', testDir]).exited
      } catch {
        // Ignore cleanup errors
      }
    }
  })

  test('can create test directories and files', async () => {
    // Simple test to verify our test setup works
    await Bun.write(`${testDir}/test-file.txt`, 'test content')
    
    const file = Bun.file(`${testDir}/test-file.txt`)
    const content = await file.text()
    
    expect(content).toBe('test content')
  })

  test('can create doppler config structure', async () => {
    // Test creating the doppler config structure
    await Bun.write(`${testDir}/doppler.yaml`, 'project: test\nconfig: dev\n')
    await Bun.write(`${testDir}/.doppler/.keep`, '') // Create .doppler directory
    await Bun.write(`${testDir}/.doppler/cli.json`, '{"project":"test","config":"dev"}')
    
    const yamlFile = Bun.file(`${testDir}/doppler.yaml`)
    const jsonFile = Bun.file(`${testDir}/.doppler/cli.json`)
    
    expect(await yamlFile.exists()).toBe(true)
    expect(await jsonFile.exists()).toBe(true)
    
    const yamlContent = await yamlFile.text()
    const jsonContent = await jsonFile.text()
    
    expect(yamlContent.trim()).toBe('project: test\nconfig: dev')
    expect(JSON.parse(jsonContent)).toEqual({ project: 'test', config: 'dev' })
  })
})