/**
 * Simple test server #2 for testing background development server functionality
 */

const startTime2 = Date.now()

const server2 = Bun.serve({
  port: 3002,
  fetch(req) {
    console.log(`[${new Date().toISOString()}] Request to: ${req.url}`)
    
    return new Response(JSON.stringify({
      message: "Test server #2 is working!",
      requestCount: Math.floor(Math.random() * 100),
      uptime: `${Math.floor((Date.now() - startTime2) / 1000)} seconds`,
      dumbCalculation: (Math.random() * 10 + 5).toFixed(2),
      timestamp: new Date().toISOString(),
      port: 3002,
      url: "http://localhost:3002/",
      server: "test-server-2"
    }), {
      headers: { "Content-Type": "application/json" }
    })
  }
})

console.log(`🚀 Test Server #2 running on http://localhost:${server2.port}/`)

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('📴 Test Server #2 shutting down gracefully...')
  server2.stop()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('📴 Test Server #2 interrupted, shutting down...')
  server2.stop()
  process.exit(0)
})