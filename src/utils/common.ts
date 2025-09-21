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