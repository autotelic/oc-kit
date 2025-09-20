/**
 * Local development version of kit tools for dogfooding.
 * This imports directly from the source to avoid circular dependencies.
 */

// Import directly from source files during development
export { default } from '../../src/kit.ts'
export { list, docker, compose, dockerList } from '../../src/kit.ts'