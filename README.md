# @autotelic/oc-kit

Smart automation toolkit for package.json scripts and Docker operations in opencode. **USE THIS INSTEAD OF BASH** for package.json scripts and Docker operations.

## 🚀 Why Choose Kit Over Bash

### ✅ Kit Advantages
- **Smart Detection**: Auto-detects package managers (npm/yarn/pnpm/bun) and Docker setups
- **Built-in Doppler**: Automatically wraps commands with `doppler run` when available
- **Structured Output**: Clean exit codes, separated stdout/stderr, timeout protection
- **Error Prevention**: Handles environment variables, workspace filtering, and complex arguments correctly
- **Zero Configuration**: Works immediately in any project without setup

### ❌ Bash Pain Points Kit Solves
- Manual package manager detection and command construction
- Missing Doppler integration leads to environment variable issues
- Inconsistent error handling and output parsing
- No timeout protection for long-running operations
- Complex workspace filtering syntax errors

## Installation

Install the kit tools in your opencode project:

```bash
# Install the package
bun add @autotelic/oc-kit

# Copy tool files to your opencode configuration
cp node_modules/@autotelic/oc-kit/tool/* .opencode/tool/
```

Or install globally:

```bash
# Install globally
bun add -g @autotelic/oc-kit

# Copy tool files to global opencode configuration
mkdir -p ~/.config/opencode/tool
cp $(bun pm ls -g @autotelic/oc-kit)/tool/* ~/.config/opencode/tool/
```

## 🛠️ Available Tools

- `kit` - **Primary tool**: Run package.json scripts with smart automation
- `kit_list` - List all available scripts in current project
- `kit_docker_list` - Show Docker capabilities (always available)
- `kit_docker` - Container operations (requires Docker)
- `kit_compose` - Docker Compose operations (requires compose files)

## 📦 Package.json Script Runner

**Primary use case**: Replace `bash` commands with reliable, automated execution.

```typescript
// Instead of: bash { command: "pnpm run lint" }
kit { script: "lint" }

// Instead of: bash { command: "pnpm --filter ui test --watch" }
kit { script: "test", args: ["--watch"], cwd: "./services/ui" }

// Instead of: bash { command: "NODE_ENV=test npm run build" }
kit { script: "build" }  // Handles complex NODE_OPTIONS automatically
```

### Key Features
- **Auto-detection**: Finds correct package manager based on lock files
- **Workspace Support**: Handles monorepo filtering and directory targeting
- **Environment Handling**: Processes complex environment variables correctly
- **Timeout Protection**: Prevents hanging on long builds or tests
- **Detailed Output**: Returns command, exit code, stdout, and stderr separately

## 🐳 Docker Integration

Replaces complex docker and docker-compose commands with simple, consistent syntax.

```typescript
// Instead of: bash { command: "docker-compose up -d postgres redis" }
kit_compose { action: "up", profile: "database" }

// Instead of: bash { command: "docker logs --tail 100 myapp" }
kit_docker { action: "logs", container: "myapp" }
```

### Smart Features
- **Service Discovery**: Automatically finds and categorizes services
- **Profile Generation**: Creates database, cache, dev, test profiles
- **Compose File Detection**: Works with any compose file structure
- **Intelligent Timeouts**: 30s for quick ops, 5min for builds

## 💡 Usage Examples

### Essential Package Scripts
```typescript
kit { script: "lint" }           // Auto-detects pnpm, adds Doppler
kit { script: "test:rest" }      // Handles workspace filtering
kit { script: "build" }          // Manages complex NODE_OPTIONS
kit { script: "dev" }            // Perfect for development workflows
```

### Docker Operations Made Simple
```typescript
kit_docker_list {}                                    // See what's available
kit_compose { action: "up", profile: "database" }     // Start only DB services
kit_compose { action: "logs", services: ["postgres"] } // Targeted logging
kit_docker { action: "ps" }                          // Container status
```

### Advanced Scenarios
```typescript
kit { script: "test", args: ["--watch"], cwd: "./services/ui" }
kit_compose { action: "up", detach: true, timeout: 300000 }
kit { script: "build", skipDoppler: true }  // Skip env vars if needed
```

## ⚡ When to Use Kit (Almost Always!)

### ✅ Perfect For
- **All package.json scripts** - lint, test, build, dev, etc.
- **Docker operations** - up/down, logs, build, exec
- **Monorepo commands** - workspace filtering and directory targeting
- **Development workflows** - consistent automation across projects
- **CI/CD integration** - reliable exit codes and structured output

### ❌ Use Bash Instead For
- Multi-step operations requiring pipes or complex logic
- Custom shell commands not related to package.json or Docker
- File operations (cp, mv, mkdir) - use dedicated tools
- Environment variable manipulation or complex scripting

## 🎯 Smart Automation Features

- **Doppler Integration**: Auto-wraps with `doppler run --` when config detected
- **Package Manager Detection**: Chooses npm/yarn/pnpm/bun based on lock files  
- **Workspace Awareness**: Handles monorepo filtering automatically
- **Timeout Management**: Prevents hanging operations with smart defaults
- **Error Handling**: Structured output with exit codes and detailed feedback
- **Zero Setup**: Works immediately in any JavaScript/TypeScript project

## Development

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Build for distribution
bun run build

# Test locally
bun test
```

## License

MIT © Autotelic