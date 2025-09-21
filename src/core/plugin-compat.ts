/**
 * OpenCode plugin compatibility layer
 * Provides fallback mock when @opencode-ai/plugin is not available
 */

export interface ToolSchema {
  string: () => any
  array: (itemType?: any) => any
  enum: (values: string[]) => any
  boolean: () => any
  number: () => any
}

export interface ToolConfig {
  description: string
  args: Record<string, any>
  execute: (args: any, context: any) => Promise<string>
}

export interface Tool {
  (config: ToolConfig): ToolConfig
  schema: ToolSchema
}

/**
 * Loads the OpenCode plugin with fallback to mock implementation
 * @returns Tool function with schema support
 */
export async function getOpenCodeTool(): Promise<Tool> {
  try {
    const toolModule = await import('@opencode-ai/plugin')
    return toolModule.tool
  } catch {
    // Create mock implementations when plugin is not available
    const mockDescribe = { 
      describe: (_d: string) => mockDescribe,
      optional: () => mockDescribe,
      _zod: true as any
    }
    
    const mockOptional = { 
      describe: (_d: string) => mockOptional,
      optional: () => mockDescribe,
      _zod: true as any
    }
    
    const tool = Object.assign((config: ToolConfig) => config, {
      schema: {
        string: () => mockDescribe,
        array: () => mockOptional,
        enum: () => mockOptional,
        boolean: () => mockOptional,
        number: () => mockOptional
      }
    }) as Tool

    return tool
  }
}