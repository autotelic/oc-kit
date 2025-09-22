/**
 * AST-grep integration tools
 * Part of @autotelic/oc-kit
 */

import type { ToolArgs, OpenCodeContext } from '../types.js'
import { executeCommand, formatCommandResult } from '../core/execution.js'
import { validateArgumentArray } from '../core/security-validation.js'
import { getOpenCodeTool } from '../core/plugin-compat.js'
import { resolveWorkingDirectory } from '../utils/common.js'

// OpenCode plugin compatibility layer
let tool: any
try {
  tool = await getOpenCodeTool()
} catch (error) {
  throw new Error(`Failed to initialize OpenCode tool: ${(error as Error).message}`)
}

/**
 * Executes ast-grep pattern search with semantic code understanding
 * @param args - Tool arguments containing pattern and search parameters
 * @param context - OpenCode context containing session information
 * @returns Promise resolving to formatted search results
 */
export async function executeAstGrepSearch(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)

  try {
    if (!args.pattern) {
      return 'Error: pattern parameter is required'
    }

    // Build ast-grep command
    const astGrepArgs = ['ast-grep']
    
    // Add pattern
    astGrepArgs.push('--pattern', args.pattern)
    
    // Add language if specified
    if (args.language) {
      astGrepArgs.push('--lang', args.language)
    }
    
    // Add path if specified, otherwise current directory
    if (args.path) {
      astGrepArgs.push(args.path)
    } else {
      astGrepArgs.push('.')
    }
    
    // Add context lines if specified
    if (args.context) {
      astGrepArgs.push('--context', args.context.toString())
    }
    
    // Add max results if specified
    if (args.maxResults) {
      astGrepArgs.push('--json') // Use JSON for easier parsing when limiting results
    }

    // Validate additional arguments if provided
    if (args.extraArgs && args.extraArgs.length > 0) {
      const argsValidation = validateArgumentArray(args.extraArgs)
      if (!argsValidation.valid) {
        return `Invalid arguments: ${argsValidation.error}`
      }
      astGrepArgs.push(...args.extraArgs)
    }

    const result = await executeCommand(astGrepArgs, {
      cwd: workingDir,
      timeout: 30000 // 30 seconds for search operations
    })

    if (result.exitCode !== 0) {
      return `ast-grep search failed: ${result.stderr || 'Unknown error'}`
    }

    // If maxResults is specified and we used JSON, parse and limit results
    if (args.maxResults && result.stdout) {
      try {
        const jsonResults = JSON.parse(result.stdout)
        const limitedResults = Array.isArray(jsonResults) 
          ? jsonResults.slice(0, args.maxResults)
          : jsonResults
        
        return `AST-grep search results (limited to ${args.maxResults}):\n${JSON.stringify(limitedResults, null, 2)}`
      } catch {
        // If JSON parsing fails, return raw output
        return formatCommandResult(result, 'ast-grep search')
      }
    }

    return formatCommandResult(result, 'ast-grep search')
  } catch (error) {
    return `Error: ${(error as Error).message}`
  }
}

/**
 * Executes ast-grep scan using YAML rules file
 * @param args - Tool arguments containing rule file and scan parameters
 * @param context - OpenCode context containing session information
 * @returns Promise resolving to formatted scan results
 */
export async function executeAstGrepScan(args: ToolArgs, context: OpenCodeContext): Promise<string> {
  const workingDir = resolveWorkingDirectory(args, context)

  try {
    if (!args.rule && !args.ruleFile) {
      return 'Error: either rule (inline YAML) or ruleFile parameter is required'
    }

    // Build ast-grep scan command
    const astGrepArgs = ['ast-grep', 'scan']
    
    // Handle inline rule vs rule file
    if (args.rule) {
      // Create temporary rule file for inline rule
      const tempRuleFile = `${workingDir}/.ast-grep-temp-rule.yml`
      await Bun.write(tempRuleFile, args.rule)
      astGrepArgs.push('--rule', tempRuleFile)
    } else if (args.ruleFile) {
      astGrepArgs.push('--rule', args.ruleFile)
    }
    
    // Add path if specified, otherwise current directory
    if (args.path) {
      astGrepArgs.push(args.path)
    } else {
      astGrepArgs.push('.')
    }
    
    // Add format if specified
    if (args.format) {
      astGrepArgs.push('--format', args.format)
    }
    
    // Add max results if specified
    if (args.maxResults) {
      astGrepArgs.push('--json') // Use JSON for easier parsing when limiting results
    }

    // Validate additional arguments if provided
    if (args.extraArgs && args.extraArgs.length > 0) {
      const argsValidation = validateArgumentArray(args.extraArgs)
      if (!argsValidation.valid) {
        return `Invalid arguments: ${argsValidation.error}`
      }
      astGrepArgs.push(...args.extraArgs)
    }

    const result = await executeCommand(astGrepArgs, {
      cwd: workingDir,
      timeout: 60000 // 60 seconds for rule scanning
    })

    // Clean up temporary rule file if created
    if (args.rule) {
      try {
        await Bun.write(`${workingDir}/.ast-grep-temp-rule.yml`, '')
      } catch {
        // Ignore cleanup errors
      }
    }

    if (result.exitCode !== 0) {
      return `ast-grep scan failed: ${result.stderr || 'Unknown error'}`
    }

    // If maxResults is specified and we used JSON, parse and limit results
    if (args.maxResults && result.stdout) {
      try {
        const jsonResults = JSON.parse(result.stdout)
        const limitedResults = Array.isArray(jsonResults) 
          ? jsonResults.slice(0, args.maxResults)
          : jsonResults
        
        return `AST-grep scan results (limited to ${args.maxResults}):\n${JSON.stringify(limitedResults, null, 2)}`
      } catch {
        // If JSON parsing fails, return raw output
        return formatCommandResult(result, 'ast-grep scan')
      }
    }

    return formatCommandResult(result, 'ast-grep scan')
  } catch (error) {
    return `Error: ${(error as Error).message}`
  }
}

/**
 * Custom opencode tool for semantic code search using ast-grep patterns.
 * 
 * This tool provides structural code search that understands syntax, not just text patterns.
 * Use semantic patterns like 'function $NAME($ARGS) { $BODY }' to find all functions
 * regardless of formatting.
 */
export const astGrepSearch = tool({
  description: 'Search code using ast-grep semantic patterns that understand syntax structure',
  args: {
    pattern: tool.schema.string().describe("AST pattern to search for (e.g., 'function $NAME($ARGS) { $BODY }')"),
    language: tool.schema.string().optional().describe('Programming language (javascript, typescript, python, rust, go, etc.)'),
    path: tool.schema.string().optional().describe('Path to search in (defaults to current directory)'),
    context: tool.schema.number().optional().describe('Number of context lines to show around matches'),
    maxResults: tool.schema.number().optional().describe('Maximum number of results to return'),
    extraArgs: tool.schema.array(tool.schema.string()).optional().describe('Additional ast-grep arguments')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeAstGrepSearch(args, context)
  }
})

/**
 * Custom opencode tool for running ast-grep rule-based scans.
 * 
 * This tool runs linting and analysis using YAML rule files that can detect
 * complex patterns, security issues, and code quality problems.
 */
export const astGrepScan = tool({
  description: 'Scan codebase using ast-grep YAML rules for pattern matching and linting',
  args: {
    rule: tool.schema.string().optional().describe('Inline YAML rule content'),
    ruleFile: tool.schema.string().optional().describe('Path to YAML rule file'),
    path: tool.schema.string().optional().describe('Path to scan (defaults to current directory)'),
    format: tool.schema.enum(['json', 'pretty']).optional().describe('Output format'),
    maxResults: tool.schema.number().optional().describe('Maximum number of results to return'),
    extraArgs: tool.schema.array(tool.schema.string()).optional().describe('Additional ast-grep arguments')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    return executeAstGrepScan(args, context)
  }
})

/**
 * Custom opencode tool for dumping syntax tree structure to help debug ast-grep patterns.
 */
export const astGrepDump = tool({
  description: 'Dump AST syntax tree structure to help debug ast-grep patterns',
  args: {
    code: tool.schema.string().describe('Code snippet to analyze'),
    language: tool.schema.string().describe('Programming language (javascript, typescript, python, etc.)'),
    format: tool.schema.enum(['cst', 'ast', 'pattern']).optional().describe('Tree format to dump (default: ast)')
  },
  async execute(args: ToolArgs, context: OpenCodeContext): Promise<string> {
    const workingDir = resolveWorkingDirectory(args, context)

    try {
      if (!args.code || !args.language) {
        return 'Error: both code and language parameters are required'
      }

      // Create temporary file with code
      const tempFile = `${workingDir}/.ast-grep-temp-code.${args.language === 'typescript' ? 'ts' : args.language === 'javascript' ? 'js' : 'txt'}`
      await Bun.write(tempFile, args.code)

      // Build ast-grep command using 'run' subcommand for debug-query support
      const astGrepArgs = ['ast-grep', 'run']
      astGrepArgs.push('--pattern', '$$$') // Pattern that matches everything
      astGrepArgs.push('--lang', args.language)
      astGrepArgs.push('--debug-query=' + (args.format || 'ast'))
      astGrepArgs.push(tempFile)

      const result = await executeCommand(astGrepArgs, {
        cwd: workingDir,
        timeout: 10000 // 10 seconds for syntax dump
      })

      // Clean up temporary file
      try {
        await Bun.write(tempFile, '')
      } catch {
        // Ignore cleanup errors
      }

      if (result.exitCode !== 0) {
        return `ast-grep dump failed: ${result.stderr || 'Unknown error'}`
      }

      return formatCommandResult(result, 'ast-grep dump')
    } catch (error) {
      return `Error: ${(error as Error).message}`
    }
  }
})