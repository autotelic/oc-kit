# Project: @autotelic/oc-kit

This is an Autotelic project that builds custom automation tools for opencode. The project provides smart alternatives to bash commands for package.json scripts and Docker operations.

## Project Structure

- `src/kit.ts` - Main source file containing all the custom tool implementations
- `tool/` - Distribution directory for tool files that users install
- `.opencode/tool/kit.ts` - Local development version for dogfooding (imports from src/)

## Key Features

The kit tools provide:
- Auto-detection of package managers (npm, yarn, pnpm, bun)
- Automatic Doppler integration for environment variables
- Smart Docker and Docker Compose operations
- Structured output with proper error handling
- Timeout protection for long-running operations

## Development Workflow

This project dogfoods its own tools. When working on this codebase:

**IMPORTANT: Always prefer kit tools over bash commands for package.json scripts**

- Use `kit { script: "build" }` instead of `npm run build` or bash
- Use `kit { script: "typecheck" }` instead of `npm run typecheck` or bash
- Use `kit { script: "lint" }` instead of `npm run lint` or bash
- Use `kit { script: "test" }` instead of `npm run test` or bash
- Use `kit_list {}` to see all available scripts

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