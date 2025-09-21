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

// Re-export tools from organized modules
export { run, list } from './tools/package.js'
export { docker, dockerList } from './tools/docker.js'
export { compose } from './tools/compose.js'
export { devStart, devStatus, devStop, devRestart, devStartAll, devQuery } from './tools/dev.js'
export { astGrepSearch, astGrepScan, astGrepDump } from './tools/astgrep.js'