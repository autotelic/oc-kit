# Development Environment Architecture

## Vision: Intelligent Background Service Management

Transform the typical manual development setup workflow into an intelligent, monitored system where OpenCode orchestrates services in the background while maintaining an interactive conversation flow.

## Current Manual Workflow

```bash
# Terminal 1: Start infrastructure
docker compose up -d

# Terminal 2: Database setup  
doppler run -- pnpm -F db knex:down && doppler run -- pnpm db:migrate && doppler run -- pnpm db:seed

# Terminal 3: Start development server
doppler run -- pnpm dev

# Developer: Switch between terminals, monitor logs, restart services manually
```

## Target Kit-Enabled Workflow

```typescript
// Single OpenCode session handles everything:
kit_devStart {}  // Orchestrates entire environment startup
// → Continue conversation while services run in background
// → OpenCode monitors health, provides status updates
// → Intelligent restart/recovery when needed
```

## Architecture Overview

### Core Components

#### 1. **Enhanced Kit Tools with Detached Mode**
```typescript
// Existing tools gain background execution
kit { script: "dev", detach: true, monitor: true }
kit_compose { action: "up", detach: true, profile: "database" }

// New composite orchestration tools
kit_devStart {}   // Smart environment startup
kit_devStatus {}  // Real-time service monitoring  
kit_devStop {}    // Graceful shutdown
kit_devRestart {} // Intelligent service restart
```

#### 2. **Service State Management**
```typescript
// OpenCode tool state tracking
interface DevEnvironmentState {
  services: Map<string, ServiceInfo>
  healthChecks: Map<string, HealthStatus>
  ports: Map<string, number>
  startupOrder: string[]
}

interface ServiceInfo {
  name: string
  type: 'docker' | 'npm' | 'custom'
  status: 'starting' | 'running' | 'stopped' | 'error'
  pid?: number
  port?: number
  healthEndpoint?: string
  lastHealthCheck?: Date
}
```

#### 3. **Intelligent Orchestration Engine**
```typescript
// Smart dependency resolution and startup sequencing
class DevEnvironmentOrchestrator {
  async startEnvironment(projectConfig: ProjectConfig): Promise<void> {
    // 1. Detect required services from project structure
    const services = await this.detectServices()
    
    // 2. Build dependency graph (DB → migrations → app)
    const startupPlan = this.buildStartupPlan(services)
    
    // 3. Execute in correct order with health checks
    await this.executeStartupPlan(startupPlan)
    
    // 4. Setup monitoring and auto-recovery
    this.startHealthMonitoring()
  }
}
```

## Technical Implementation

### OpenCode Integration Points

#### 1. **Tool Registry Integration**
```typescript
// Located in: tool/kit.ts (loaded by OpenCode automatically)
export const kit_devStart = {
  description: "Intelligently start entire development environment",
  parameters: z.object({
    profile: z.string().optional().describe("Environment profile (dev, test, staging)"),
    force: z.boolean().optional().describe("Force restart if already running"),
    monitor: z.boolean().default(true).describe("Enable health monitoring")
  }),
  execute: async (args, context) => {
    // Implementation here
  }
}
```

#### 2. **Real-time Status Updates**
```typescript
// Leverage OpenCode's metadata system for live updates
context.metadata({
  title: "Development Environment",
  metadata: {
    status: "Starting services...",
    services: [
      { name: "postgres", status: "✅ Running", port: 5432 },
      { name: "redis", status: "🟡 Starting", port: 6379 },
      { name: "dev-server", status: "⏳ Waiting for DB", port: 3000 }
    ],
    lastUpdate: new Date().toISOString()
  }
})
```

#### 3. **Background Process Management**
```typescript
// Using OpenCode's session/task model for background execution
export async function executeDetached(
  command: string,
  args: string[],
  options: DetachedOptions,
  context: OpenCodeContext
): Promise<DetachedProcess> {
  
  const process = spawn(command, args, {
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  
  // Register with OpenCode session for lifecycle management
  context.registerBackgroundProcess(process.pid, {
    name: options.name,
    onHealthCheck: options.healthCheck,
    onExit: options.onExit
  })
  
  return { pid: process.pid, port: options.port }
}
```

### Service Detection & Auto-configuration

#### 1. **Project Structure Analysis**
```typescript
interface ProjectDetector {
  // Analyze project to determine required services
  async detectServices(projectPath: string): Promise<ServiceConfig[]> {
    const services: ServiceConfig[] = []
    
    // Check for Docker Compose
    if (await exists('docker-compose.yml')) {
      services.push(...await this.parseDockerServices())
    }
    
    // Check package.json scripts
    const packageJson = await readPackageJson()
    if (packageJson.scripts?.['db:migrate']) {
      services.push({ type: 'database', requiresMigration: true })
    }
    
    // Check for common dev server patterns
    if (packageJson.scripts?.dev || packageJson.scripts?.start) {
      services.push({ type: 'webapp', port: await this.detectPort() })
    }
    
    return services
  }
}
```

#### 2. **Health Check System**
```typescript
interface HealthChecker {
  async checkService(service: ServiceInfo): Promise<HealthStatus> {
    switch (service.type) {
      case 'docker':
        return await this.checkDockerContainer(service.name)
      case 'webapp':
        return await this.checkHttpEndpoint(`http://localhost:${service.port}`)
      case 'database':
        return await this.checkDatabaseConnection(service.connectionString)
    }
  }
  
  async startContinuousMonitoring(): Promise<void> {
    setInterval(async () => {
      for (const service of this.trackedServices) {
        const health = await this.checkService(service)
        await this.updateServiceStatus(service.name, health)
        
        if (health.status === 'unhealthy') {
          await this.handleUnhealthyService(service)
        }
      }
    }, 30000) // Check every 30 seconds
  }
}
```

## User Experience Flow

### 1. **Intelligent Startup**
```
User: "Start my development environment"
OpenCode: 
├─ Analyzing project structure...
├─ Found: Docker Compose (postgres, redis)
├─ Found: Database migrations needed
├─ Found: Dev server on port 3000
├─ 
├─ Starting services in optimal order:
├─ ✅ postgres (5432) - healthy
├─ ✅ redis (6379) - healthy  
├─ ✅ database migrations - completed
├─ ✅ dev server (3000) - healthy
├─
└─ Environment ready! All services monitored in background.
```

### 2. **Ongoing Conversation**
```
User: "Add a new API endpoint for user profiles"
OpenCode: [Continues working while monitoring services in background]

# 10 minutes later, service becomes unhealthy
OpenCode: "⚠️ Dev server became unhealthy, restarting automatically..."
OpenCode: "✅ Dev server restarted successfully"
```

### 3. **Status Queries**
```
User: "What's the status of my environment?"
OpenCode:
Environment Status (Runtime: 1h 23m)
├─ postgres: ✅ Healthy (5432)
├─ redis: ✅ Healthy (6379)
├─ dev-server: ✅ Healthy (3000)
├─ Last health check: 30 seconds ago
└─ 0 restarts needed today
```

## Benefits

### For Developers
- **Single Command Setup** - No more terminal juggling
- **Intelligent Monitoring** - Services auto-restart when needed
- **Contextual Awareness** - OpenCode knows what's running
- **Conversation Continuity** - Work on code while environment manages itself

### For OpenCode
- **Enhanced Capabilities** - Becomes a true development partner
- **Persistent Context** - Maintains awareness of running services
- **Proactive Assistance** - Can suggest optimizations, warn about issues
- **Workflow Integration** - Tests/builds work with known service state

## Implementation Phases

### Phase 1: Basic Detached Mode
- Add `detach: true` support to existing kit tools
- Implement basic background process tracking
- Create simple health checking

### Phase 2: Service Orchestration  
- Build `kit_devStart/Stop/Status` composite tools
- Add project structure detection
- Implement dependency ordering

### Phase 3: Intelligent Monitoring
- Continuous health checking
- Auto-restart capabilities  
- Performance monitoring and optimization suggestions

### Phase 4: Advanced Features
- Multi-environment support (dev/test/staging)
- Service scaling and load balancing
- Integration with deployment workflows

## Security Considerations

- **Process Isolation** - Background processes run with appropriate permissions
- **Resource Limits** - Prevent runaway processes from consuming system resources  
- **Access Control** - Only allow operations on project-owned services
- **Audit Logging** - Track all background operations for debugging

## Future Extensions

- **Multi-Project Support** - Manage multiple development environments
- **Cloud Integration** - Extend to manage cloud development resources
- **Team Collaboration** - Share environment state across team members
- **CI/CD Integration** - Seamless transition from dev to deployment

---

This architecture transforms OpenCode from a code assistant into a comprehensive development environment manager, enabling the intelligent, background service orchestration workflow you envision.