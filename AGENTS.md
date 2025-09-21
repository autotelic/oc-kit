# Project: @autotelic/oc-kit

This is an Autotelic project that builds custom automation tools for opencode. The project provides smart alternatives to bash commands for package.json scripts and Docker operations.

## 🚀 FUNDAMENTAL RULE: Always Use Kit Tools

**THE SINGLE MOST IMPORTANT RULE**: Never use bash commands when kit tools are available. Kit tools provide superior automation, error handling, and integration. This project dogfoods its own tools to demonstrate best practices.

## Project Structure

- `src/kit.ts` - Main source file containing all the custom tool implementations
- `src/dev-tools.ts` - Development server management with SQLite in-memory database
- `tool/` - Distribution directory for tool files that users install
- `.opencode/tool/kit.ts` - Local development version for dogfooding (imports from src/)

## Tool Architecture

**IMPORTANT: When adding new tools, you must update BOTH export files:**

1. **`tool/kit.ts`** - Distribution version (what users get when they install the package)
2. **`.opencode/tool/kit.ts`** - Local development version (what this project uses for dogfooding)

Both files must export new tools or they won't be available to opencode users. The project uses a dual-path architecture:
- Production: `tool/kit.ts` → `dist/kit.js` 
- Development: `.opencode/tool/kit.ts` → `src/kit.ts` (direct import)

## Background Process Management

The dev tools (`kit_devStart`, `kit_devStatus`, etc.) use a **hybrid SQLite + Map approach**:

- **SQLite in-memory database** (`:memory:`) stores process metadata with proper schema
- **JavaScript Map** stores live `Subprocess` objects for process control
- **Session-scoped**: All data cleared when opencode session ends
- **Generic SQL querying**: Use `kit_devQuery` for advanced process analysis

**Example advanced queries:**
```sql
-- Count processes by script type
SELECT script, COUNT(*) FROM processes GROUP BY script

-- Find longest running processes  
SELECT * FROM processes ORDER BY start_time ASC LIMIT 5

-- Processes started in last hour
SELECT * FROM processes WHERE start_time > ?
```

## Key Features

The kit tools provide:
- Auto-detection of package managers (npm, yarn, pnpm, bun)
- Automatic Doppler integration for environment variables
- Smart Docker and Docker Compose operations
- **Background development server management** with SQLite-based process registry
- **Generic SQL querying** capability for advanced process monitoring
- **AST-based code search** that understands syntax structure, not just text
- **Semantic pattern matching** with metavariables for refactoring and analysis
- Structured output with proper error handling
- Timeout protection for long-running operations
- **Bun-native APIs** throughout (Bun.spawn, Bun.file, bun:sqlite)

## Development Workflow

This project dogfoods its own tools. When working on this codebase:

**🚨 CRITICAL: ALWAYS use kit tools, NEVER use bash for package.json scripts**

**Package.json Scripts (USE KIT, NOT BASH):**
- ✅ `kit { script: "build" }` ❌ `npm run build` or bash
- ✅ `kit { script: "typecheck" }` ❌ `npm run typecheck` or bash  
- ✅ `kit { script: "lint" }` ❌ `npm run lint` or bash
- ✅ `kit { script: "test" }` ❌ `npm run test` or bash
- ✅ `kit_list {}` to see all available scripts

**Code Search (USE KIT AST-GREP, NOT GREP):**
- ✅ `kit_astGrepSearch { pattern: "function $NAME($ARGS) { $BODY }" }` ❌ `grep` or bash
- ✅ `kit_astGrepScan { rule: "..." }` for complex pattern matching
- ✅ `kit_astGrepDump { code: "...", language: "typescript" }` for debugging patterns

**Docker Operations (USE KIT, NOT BASH):**
- ✅ `kit_docker { action: "build", image: "myapp" }` ❌ `docker build` or bash
- ✅ `kit_compose { action: "up", profile: "database" }` ❌ `docker-compose up` or bash
- ✅ `kit_dockerList {}` to see available capabilities

**Background Development Server Tools:**
- Use `kit_devStart { script: "dev" }` to start servers in background
- Use `kit_devStatus {}` to monitor running servers
- Use `kit_devQuery { query: "SELECT * FROM processes" }` for advanced analysis
- Use `kit_devStop {}` or `kit_devRestart {}` for process management

### Tool Demonstration
This project serves as a live demonstration of the kit tools' capabilities. When making changes:
1. Always use kit tools to run validation (typecheck, lint, test, build)
2. Show how the tools auto-detect the package manager (Bun in this case)
3. Demonstrate structured output and error handling
4. Use kit tools to validate changes before suggesting commits

## Package Management

This project uses Bun as the primary package manager and runtime. Lock file: `bun.lockb`

## Docker Support

No Docker setup in this project - it's a pure Node.js/TypeScript package that provides Docker tools for other projects.

## Publishing

Built for distribution as an npm package under the `@autotelic` namespace. Users install it and copy the tool files to their opencode configuration.