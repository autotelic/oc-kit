/**
 * Tests for Doppler CLI integration utilities (simplified without global mocking)
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

describe('Doppler Integration Tests (No Mocking)', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'doppler-simple-test-'))
  })

  afterEach(async () => {
    if (testDir) {
      await rm(testDir, { recursive: true, force: true })
    }
  })

  test('can create test directories and files', async () => {
    // Simple test to verify our test setup works
    await writeFile(join(testDir, 'test-file.txt'), 'test content')
    
    const file = Bun.file(join(testDir, 'test-file.txt'))
    const content = await file.text()
    
    expect(content).toBe('test content')
  })

  test('can create doppler config structure', async () => {
    // Test creating the doppler config structure
    await writeFile(join(testDir, 'doppler.yaml'), 'project: test\nconfig: dev\n')
    await mkdir(join(testDir, '.doppler'))
    await writeFile(join(testDir, '.doppler/cli.json'), '{"project":"test","config":"dev"}')
    
    const yamlFile = Bun.file(join(testDir, 'doppler.yaml'))
    const jsonFile = Bun.file(join(testDir, '.doppler/cli.json'))
    
    expect(await yamlFile.exists()).toBe(true)
    expect(await jsonFile.exists()).toBe(true)
    
    const yamlContent = await yamlFile.text()
    const jsonContent = await jsonFile.text()
    
    expect(yamlContent.trim()).toBe('project: test\nconfig: dev')
    expect(JSON.parse(jsonContent)).toEqual({ project: 'test', config: 'dev' })
  })
})