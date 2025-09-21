/**
 * Simple test server for demonstrating kit_devStart background execution
 * Does some "dumb" but observable things to test monitoring
 */

const port = 3001
let requestCount = 0
let startTime = Date.now()

console.log(`🚀 Test server starting on port ${port}...`)

const server = Bun.serve({
  port,
  fetch(request) {
    requestCount++
    const uptime = Math.floor((Date.now() - startTime) / 1000)
    
    // Do something dumb but observable
    const randomDelay = Math.random() * 100
    const dumbCalculation = Math.sqrt(requestCount * 42) + Math.PI
    
    console.log(`📝 Request #${requestCount} - Uptime: ${uptime}s - Dumb calc: ${dumbCalculation.toFixed(2)}`)
    
    // Simulate some async work
    return new Promise<Response>(resolve => {
      setTimeout(() => {
        resolve(new Response(JSON.stringify({
          message: "Test server is working!",
          requestCount,
          uptime: `${uptime} seconds`,
          dumbCalculation: dumbCalculation.toFixed(2),
          timestamp: new Date().toISOString(),
          port,
          url: request.url
        }), {
          headers: { "Content-Type": "application/json" }
        }))
      }, randomDelay)
    })
  }
})

console.log(`✅ Test server running at http://localhost:${port}`)
console.log(`📊 Server will log each request with running stats`)
console.log(`🔄 Try: curl http://localhost:${port}`)

// Log periodic status updates
setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  console.log(`💖 Server heartbeat - Uptime: ${uptime}s, Total requests: ${requestCount}`)
}, 10000) // Every 10 seconds

process.on('SIGTERM', () => {
  console.log(`🛑 Test server shutting down after ${requestCount} requests`)
  server.stop()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log(`🛑 Test server interrupted after ${requestCount} requests`)
  server.stop()
  process.exit(0)
})