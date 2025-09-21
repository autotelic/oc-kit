/**
 * Shared constants for the @autotelic/oc-kit package
 */

/**
 * Script type patterns for different use cases
 */
export const SCRIPT_TYPES = {
  BUILD: 'build',
  TEST: 'test',
  DEV: 'dev',
  START: 'start',
  SERVE: 'serve'
} as const

/**
 * Docker service patterns for auto-categorization
 */
export const SERVICE_PATTERNS = {
  DATABASE: ['db', 'postgres', 'mysql', 'mongo'],
  CACHE: ['redis', 'memcached', 'cache'],
  TEST: ['test']
} as const

/**
 * Common development script names for auto-detection
 */
export const COMMON_DEV_SCRIPTS = [
  SCRIPT_TYPES.DEV,
  SCRIPT_TYPES.START,
  SCRIPT_TYPES.SERVE,
  'api',
  'frontend', 
  'backend',
  'worker'
] as const

/**
 * Build success indicators in command output
 */
export const BUILD_SUCCESS_INDICATORS = ['built', 'compiled'] as const

/**
 * Test success indicators in command output  
 */
export const TEST_SUCCESS_INDICATORS = ['passed', 'ok'] as const