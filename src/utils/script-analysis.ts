/**
 * Smart script analysis for detecting risky patterns in package.json scripts
 * Inspired by opencode's AST-based approach for bash commands
 */

/**
 * Categories of script operations for grouping risks
 */
export type ScriptRiskCategory = 
  | 'publishing'
  | 'network_execution' 
  | 'data_transmission'
  | 'destructive'
  | 'permissions'
  | 'git'
  | 'docker'
  | 'secret_exposure'

/**
 * Risk levels for script operations
 */
export type ScriptRiskLevel = 'low' | 'medium' | 'high' | 'critical'

/**
 * Pattern definition for risky operations
 */
interface RiskPattern {
  pattern: RegExp
  risk: ScriptRiskLevel
  category: ScriptRiskCategory
  description: string
}

/**
 * Patterns that indicate potentially risky script operations
 */
const RISKY_SCRIPT_PATTERNS: RiskPattern[] = [
  // Publishing and deployment
  {
    pattern: /npm\s+publish/i,
    risk: 'high',
    category: 'publishing',
    description: 'Publishes package to npm registry'
  },
  {
    pattern: /yarn\s+publish/i,
    risk: 'high',
    category: 'publishing',
    description: 'Publishes package to npm registry'
  },
  {
    pattern: /pnpm\s+publish/i,
    risk: 'high',
    category: 'publishing',
    description: 'Publishes package to npm registry'
  },
  {
    pattern: /bun\s+publish/i,
    risk: 'high',
    category: 'publishing',
    description: 'Publishes package to npm registry'
  },
  
  // Network operations that could leak secrets
  {
    pattern: /curl\s+.*\|\s*(sh|bash)/i,
    risk: 'critical',
    category: 'network_execution',
    description: 'Downloads and executes remote scripts'
  },
  {
    pattern: /wget\s+.*\|\s*(sh|bash)/i,
    risk: 'critical',
    category: 'network_execution',
    description: 'Downloads and executes remote scripts'
  },
  {
    pattern: /curl\s+.*(-d|--data|--data-raw)\s+[^\\s]*\$[A-Z_]+/i,
    risk: 'high',
    category: 'data_transmission',
    description: 'Sends environment variables over network'
  },
  
  // File system operations
  {
    pattern: /rm\s+-rf?\s+\//,
    risk: 'critical',
    category: 'destructive',
    description: 'Deletes files from root directory'
  },
  {
    pattern: /rm\s+-rf?\s+\*/,
    risk: 'high',
    category: 'destructive',
    description: 'Deletes all files in current directory'
  },
  {
    pattern: /chmod\s+\+x\s+.*\.(sh|bash|zsh|fish)/i,
    risk: 'medium',
    category: 'permissions',
    description: 'Makes shell scripts executable'
  },
  
  // Git operations
  {
    pattern: /git\s+push\s+.*--force/i,
    risk: 'high',
    category: 'git',
    description: 'Force pushes to git repository'
  },
  {
    pattern: /git\s+reset\s+--hard/i,
    risk: 'medium',
    category: 'git',
    description: 'Hard resets git repository'
  },
  
  // Docker operations
  {
    pattern: /docker\s+.*--privileged/i,
    risk: 'critical',
    category: 'docker',
    description: 'Runs Docker container with privileged access'
  },
  {
    pattern: /docker\s+.*-v\s+\/[^:]*:/i,
    risk: 'high',
    category: 'docker',
    description: 'Mounts system directories in Docker'
  },
  
  // Environment variable exposure
  {
    pattern: /echo\s+\$[A-Z_]*(?:KEY|SECRET|PASSWORD|TOKEN)/i,
    risk: 'high',
    category: 'secret_exposure',
    description: 'May expose secrets in logs'
  },
  {
    pattern: /printenv|env\s*$/i,
    risk: 'medium',
    category: 'secret_exposure',
    description: 'Prints all environment variables'
  }
]

/**
 * Information about a detected risky pattern in a script
 */
export interface ScriptRiskMatch {
  /** The risky pattern that was matched */
  pattern: RegExp
  /** Risk level of this pattern */
  risk: ScriptRiskLevel
  /** Category of risk */
  category: ScriptRiskCategory
  /** Human-readable description */
  description: string
  /** The actual text that matched the pattern */
  match: string
  /** Position in script where match was found */
  index: number
}

/**
 * Result of analyzing a script for risky patterns
 */
export interface ScriptAnalysisResult {
  /** Whether any risky patterns were found */
  hasRisks: boolean
  /** Highest risk level found */
  maxRiskLevel: ScriptRiskLevel | null
  /** All risky patterns that were matched */
  risks: ScriptRiskMatch[]
  /** Categorized summary of risks */
  riskSummary: Record<ScriptRiskCategory, ScriptRiskMatch[]>
  /** Whether script should require confirmation */
  requiresConfirmation: boolean
  /** Whether script should be blocked entirely */
  shouldBlock: boolean
}

/**
 * Analyzes a package.json script for potentially risky patterns
 * @param _scriptName - Name of the script being analyzed (unused but kept for API consistency)
 * @param scriptContent - Content of the script command
 * @returns Analysis result with detected risks
 */
export function analyzeScript(_scriptName: string, scriptContent: string): ScriptAnalysisResult {
  const risks: ScriptRiskMatch[] = []
  
  // Check each risky pattern against the script content
  for (const riskPattern of RISKY_SCRIPT_PATTERNS) {
    const matches = scriptContent.matchAll(new RegExp(riskPattern.pattern, 'gi'))
    
    for (const match of matches) {
      risks.push({
        pattern: riskPattern.pattern,
        risk: riskPattern.risk,
        category: riskPattern.category,
        description: riskPattern.description,
        match: match[0],
        index: match.index || 0
      })
    }
  }
  
  // Categorize risks
  const riskSummary: Record<ScriptRiskCategory, ScriptRiskMatch[]> = {
    publishing: [],
    network_execution: [],
    data_transmission: [],
    destructive: [],
    permissions: [],
    git: [],
    docker: [],
    secret_exposure: []
  }
  
  for (const risk of risks) {
    riskSummary[risk.category].push(risk)
  }
  
  // Determine max risk level
  const riskLevels: ScriptRiskLevel[] = ['low', 'medium', 'high', 'critical']
  const maxRiskLevel = risks.length > 0 
    ? risks.reduce((max, risk) => {
        const currentIndex = riskLevels.indexOf(risk.risk)
        const maxIndex = riskLevels.indexOf(max)
        return currentIndex > maxIndex ? risk.risk : max
      }, 'low' as ScriptRiskLevel)
    : null
  
  // Determine if confirmation or blocking is needed
  const criticalRisks = risks.filter(r => r.risk === 'critical')
  const highRisks = risks.filter(r => r.risk === 'high')
  
  return {
    hasRisks: risks.length > 0,
    maxRiskLevel,
    risks,
    riskSummary,
    requiresConfirmation: highRisks.length > 0 || criticalRisks.length > 0,
    shouldBlock: criticalRisks.some(r => 
      r.category === 'network_execution' || 
      (r.category === 'destructive' && r.match.includes('rm -rf /'))
    )
  }
}

/**
 * Formats risk analysis results into human-readable warnings
 * @param scriptName - Name of the script
 * @param analysis - Script analysis result
 * @returns Formatted warning messages
 */
export function formatScriptWarnings(scriptName: string, analysis: ScriptAnalysisResult): string[] {
  if (!analysis.hasRisks) {
    return []
  }
  
  const warnings: string[] = []
  
  // Add header based on risk level
  if (analysis.maxRiskLevel === 'critical') {
    warnings.push(`🚨 CRITICAL: Script "${scriptName}" contains dangerous operations`)
  } else if (analysis.maxRiskLevel === 'high') {
    warnings.push(`⚠️  HIGH RISK: Script "${scriptName}" contains risky operations`)
  } else if (analysis.maxRiskLevel === 'medium') {
    warnings.push(`⚠️  Script "${scriptName}" contains potentially risky operations`)
  }
  
  // Add specific warnings by category
  const categoryWarnings = {
    publishing: '📦 May publish package to registry',
    network_execution: '🌐 Downloads and executes remote code', 
    data_transmission: '📡 May transmit sensitive data over network',
    destructive: '💥 Performs destructive file operations',
    permissions: '🔒 Modifies file permissions',
    git: '📝 Performs git operations that may affect history',
    docker: '🐳 Uses potentially dangerous Docker options',
    secret_exposure: '🔑 May expose secrets in logs or output'
  }
  
  for (const [category, risks] of Object.entries(analysis.riskSummary)) {
    if (risks.length > 0) {
      const categoryKey = category as ScriptRiskCategory
      const warning = categoryWarnings[categoryKey]
      const firstRisk = risks[0]
      if (warning && firstRisk) {
        warnings.push(`   ${warning}: ${firstRisk.description}`)
      }
    }
  }
  
  return warnings
}

/**
 * Checks if a script name suggests it might be safe to run automatically
 * @param scriptName - Name of the script
 * @returns Whether the script appears safe based on naming conventions
 */
export function isScriptNameSafe(scriptName: string): boolean {
  const safePatterns = [
    /^(test|spec)/i,
    /^(lint|format|prettier)/i,
    /^(build|compile)/i,
    /^(dev|develop|serve)/i,
    /^(start|run)/i,
    /^(check|validate|verify)/i,
    /^(clean|clear)/i,
    /^(install|setup)/i
  ]
  
  const unsafePatterns = [
    /^(deploy|publish|release)/i,
    /^(push|upload)/i,
    /^(delete|remove|destroy)/i,
    /^(backup|restore)/i,
    /^(migrate|seed)/i
  ]
  
  // Check unsafe patterns first (they override safe patterns)
  for (const pattern of unsafePatterns) {
    if (pattern.test(scriptName)) {
      return false
    }
  }
  
  // Check safe patterns
  for (const pattern of safePatterns) {
    if (pattern.test(scriptName)) {
      return true
    }
  }
  
  // Unknown patterns are considered potentially unsafe
  return false
}