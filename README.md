# @autotelic/oc-kit

> **🚀 Smart automation toolkit for OpenCode agents**  
> Beautiful, intelligent alternatives to bash commands with auto-detection, enhanced output, and zero configuration.

[![Tests](https://img.shields.io/badge/tests-126%20passing-brightgreen)](https://github.com/autotelic/oc-kit)
[![TypeScript](https://img.shields.io/badge/typescript-100%25-blue)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/runtime-bun-black)](https://bun.sh/)

## ✨ What Makes Kit Special

**Before Kit** 😤
```bash
bash { command: "npm run test" }
# Command: npm run test
# Exit code: 0
# 
# Stdout:
# 126 tests passed
# 
# Stderr:
```

**After Kit** ✨
```typescript
kit { script: "test" }
# ✅ test completed successfully (2.1s)
# 🧪 126 tests passed
# 
# 📄 Output:
# All test suites passed successfully
```

---

## 🎯 **USE THIS INSTEAD OF BASH**

Kit provides intelligent, context-aware automation for:
- 📦 **Package.json scripts** (lint, test, build, dev)
- 🐳 **Docker operations** (up/down, logs, build, exec) 
- 🐙 **Docker Compose** (multi-service orchestration)
- 🚀 **Development servers** (background process management)

---

## 🚀 Quick Start

### Global Installation
```bash
npm install -g @autotelic/oc-kit
mkdir -p ~/.opencode/tool
cp "$(npm root -g)/@autotelic/oc-kit/tool/*" ~/.opencode/tool/
```

### Project Installation  
```bash
npm install @autotelic/oc-kit
mkdir -p .opencode/tool
cp node_modules/@autotelic/oc-kit/tool/* .opencode/tool/
```

### Development Testing (Unpublished)
```bash
# In this repo
npm link
mkdir -p ~/.opencode/tool  
cp tool/* ~/.opencode/tool/
```

---

## 🛠️ **Core Tools**

| Tool | Purpose | Example |
|------|---------|---------|
| `kit` | **Package.json scripts** | `kit { script: "test" }` |
| `kit_list` | **List available scripts** | `kit_list {}` |
| `kit_docker` | **Container operations** | `kit_docker { action: "ps" }` |
| `kit_compose` | **Docker Compose** | `kit_compose { action: "up" }` |
| `kit_devStart` | **Background dev servers** | `kit_devStart { script: "api" }` |
| `kit_devStatus` | **Monitor processes** | `kit_devStatus {}` |

---

## 💡 **Enhanced Output Examples**

### ✅ **Successful Build**
```typescript
kit { script: "build" }
# ✅ build completed successfully (15.2s)
# 🏗️  Build artifacts generated
# 
# 📄 Output:
# Bundled 23 modules in 142ms
# dist/kit.js  89.2 KB
```

### ❌ **Failed Test with Smart Suggestions**
```typescript  
kit { script: "test" }
# ❌ test failed (0.8s)
# 
# 🔧 Command: bun test src/
# 📉 Exit code: 1
# 
# ❌ Error details:
# Module not found: cannot resolve './missing-file'
# 
# 💡 Suggestions:
# • Try running `npm install` to ensure dependencies are installed
# • Check the file path and ensure the module exists
```

### 🐳 **Docker Operations**
```typescript
kit_docker { action: "logs", container: "api" }
# ✅ logs completed successfully
# 
# 📄 Output:
# Server listening on port 3000
# Database connected successfully
# Ready to accept connections
```

---

## 🎨 **Smart Features**

### 🧠 **Context-Aware Messaging**
- 🧪 **Tests**: "142 tests passed", "Test suite completed"
- 🏗️ **Builds**: "Build artifacts generated", "Bundle created"  
- 🧹 **Linting**: "No issues found", "Code style verified"
- 🔍 **Type checking**: "No type errors", "Types validated"
- 🚀 **Dev servers**: "Server ready", "Listening on port 3000"

### ⚡ **Auto-Detection**
- **Package managers**: npm, yarn, pnpm, bun (based on lock files)
- **Docker setup**: Compose files, containers, services
- **Doppler config**: Automatic environment variable injection
- **Monorepo structure**: Workspace filtering and targeting

### 🎯 **Intelligent Error Handling** 
- **Contextual suggestions** based on error patterns
- **Dependency issues**: "Try running npm install"
- **Permission problems**: "Check file permissions"  
- **Port conflicts**: "Another process may be using this port"
- **Memory issues**: "Try increasing Node.js memory limit"

### 🕐 **Smart Timeouts**
- **Quick operations**: 30 seconds (ps, status, logs)
- **Build operations**: 5 minutes (build, pull, up)
- **Custom timeouts**: Override when needed
- **No hanging processes**: Automatic cleanup

---

## 📦 **Package Scripts Made Easy**

Replace complex bash commands with simple, reliable automation:

```typescript
// ❌ Old way - error-prone and verbose
bash { command: "NODE_OPTIONS='--max-old-space-size=4096' pnpm --filter @app/ui run build --mode production" }

// ✅ New way - handles complexity automatically  
kit { script: "build", cwd: "./packages/ui" }
```

### **Advanced Examples**
```typescript
// Monorepo workspace filtering
kit { script: "test", args: ["--watch"], cwd: "./services/api" }

// Skip Doppler if needed
kit { script: "build", skipDoppler: true }

// Custom package manager
kit { script: "dev", packageManager: "bun" }
```

---

## 🐳 **Docker & Compose Integration**

### **Container Management**
```typescript
kit_docker { action: "ps" }        // List containers
kit_docker { action: "logs", container: "api" }
kit_docker { action: "exec", container: "db", args: ["psql", "-U", "user"] }
```

### **Compose Operations**  
```typescript
kit_compose { action: "up", profile: "database" }     // Start DB services only
kit_compose { action: "logs", services: ["api", "worker"] }
kit_compose { action: "down" }                       // Clean shutdown
```

### **Service Discovery**
```typescript
kit_dockerList {}
# === Docker Capabilities ===
# Docker Available: ✅
# Compose Available: ✅
# 
# === Discovered Services ===
# Database: postgres, redis  
# API: api, worker
# Frontend: web, admin
```

---

## 🚀 **Background Development Servers**

Manage multiple dev servers with SQLite-based process tracking:

### **Start Services**
```typescript
kit_devStart { script: "api" }      // Backend server
kit_devStart { script: "web" }      // Frontend  
kit_devStart { script: "worker" }   // Background jobs

// Start multiple at once
kit_devStartAll { scripts: ["api", "worker", "web"] }
```

### **Monitor & Control**
```typescript
kit_devStatus {}                    // Show all running services
kit_devStop { script: "api" }       // Stop specific service
kit_devRestart { script: "web" }    // Restart service  
kit_devStop {}                      // Stop all services
```

### **Advanced Process Analysis**
```typescript
// Custom SQL queries on process database
kit_devQuery { 
  query: "SELECT script, COUNT(*) FROM processes GROUP BY script" 
}

kit_devQuery { 
  query: "SELECT * FROM processes WHERE start_time > ?", 
  params: ["1726929000000"] 
}
```

---

## ⚡ **When to Use Kit vs Bash**

### ✅ **Always Use Kit For**
- Package.json scripts (test, build, lint, dev)
- Docker operations (up, down, logs, exec) 
- Docker Compose orchestration
- Development server management
- Monorepo workspace commands
- Environment-dependent operations

### ❌ **Use Bash For** 
- Multi-step shell pipelines (`ls | grep | sort`)
- File operations (`cp`, `mv`, `mkdir`)
- Complex shell scripting
- System administration tasks

---

## 🎯 **Why Kit > Bash**

| Feature | Kit | Bash |
|---------|-----|------|
| **Package Manager Detection** | ✅ Automatic | ❌ Manual |
| **Doppler Integration** | ✅ Built-in | ❌ Manual setup |
| **Error Suggestions** | ✅ Context-aware | ❌ Raw output |
| **Timeout Protection** | ✅ Smart defaults | ❌ Hangs forever |
| **Output Formatting** | ✅ Beautiful, organized | ❌ Raw text |
| **Workspace Filtering** | ✅ Automatic | ❌ Complex syntax |
| **Process Management** | ✅ SQLite tracking | ❌ No tracking |
| **Zero Configuration** | ✅ Works everywhere | ❌ Project setup |

---

## 🔧 **Development**

This project dogfoods its own tools:

```bash
# Use kit instead of bash for everything!
kit { script: "test" }       # Run tests
kit { script: "typecheck" }  # Type checking  
kit { script: "lint" }       # Linting
kit { script: "build" }      # Build for distribution

# Background development
kit_devStart { script: "dev" }    # Start dev server
kit_devStatus {}                  # Monitor processes
```

### **Architecture**
- **Runtime**: Bun-native APIs throughout
- **Process Management**: SQLite in-memory database + JavaScript Map
- **Security**: Comprehensive validation and guardrails
- **Testing**: 126 tests with full coverage
- **Distribution**: Dual-path for production and development

---

## 📄 **License**

MIT © [Autotelic](https://autotelic.co)

---

<div align="center">

**Made with ❤️ for the OpenCode community**

[Documentation](https://opencode.ai/docs/custom-tools) • [Issues](https://github.com/autotelic/oc-kit/issues) • [Contributing](CONTRIBUTING.md)

</div>