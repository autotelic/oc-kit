/**
 * Utility functions for working directory resolution and common patterns
 */

import type { ToolArgs, OpenCodeContext } from '../types.js'

/**
 * Resolves the working directory from tool arguments and context
 * Uses priority: args.cwd > context.cwd > process.cwd()
 * @param args - Tool arguments that may contain cwd
 * @param context - OpenCode context that may contain cwd
 * @returns Resolved working directory path
 */
export function resolveWorkingDirectory(args: ToolArgs, context: OpenCodeContext): string {
  return args.cwd || context.cwd || process.cwd()
}

/**
 * Checks if kit dev tools are available in the current environment
 * This function checks if the dev tools (kit_devStart, etc.) are available
 * by looking for the dev module in the project structure
 * @returns Promise<boolean> indicating if dev tools are available
 */
export async function areDevToolsAvailable(): Promise<boolean> {
  try {
    // Try to dynamically import the dev tools module
    await import('../tools/dev.js')
    return true
  } catch {
    // If the import fails, dev tools are not available
    return false
  }
}

/**
 * Gets the list of available dev tool names if dev tools are available
 * @returns Promise<string[]> list of available dev tool names
 */
export async function getAvailableDevTools(): Promise<string[]> {
  try {
    const devModule = await import('../tools/dev.js')
    const availableTools: string[] = []
    
    // Check which dev tools are exported
    if (devModule.devStart) availableTools.push('kit_devStart')
    if (devModule.devStatus) availableTools.push('kit_devStatus')
    if (devModule.devStop) availableTools.push('kit_devStop')
    if (devModule.devRestart) availableTools.push('kit_devRestart')
    if (devModule.devStartAll) availableTools.push('kit_devStartAll')
    if (devModule.devQuery) availableTools.push('kit_devQuery')
    
    return availableTools
  } catch {
    return []
  }
}