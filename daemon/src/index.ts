import { handleRequest } from './routes/router'
import { initPersistence } from './persistence'
import { jsonResponse } from './http'

const PORT = Number(process.env.COCKPIT_DAEMON_PORT || 4800)

await initPersistence()

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // max allowed by Bun (seconds) — needed for long SSE streams during agent execution
  async fetch(req) {
    // CORS for local frontend
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(req),
      })
    }

    try {
      const response = await handleRequest(req)
      // Add CORS headers to all responses
      for (const [key, value] of Object.entries(corsHeaders(req))) {
        response.headers.set(key, value)
      }
      return response
    } catch (err) {
      console.error('Request error:', err)
      return jsonResponse({ error: 'Internal server error' }, 500)
    }
  },
})

console.log(`[cockpit-daemon] Running on http://localhost:${server.port}`)

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4173',
]

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

// Graceful shutdown
function shutdown() {
  console.log('\n[cockpit-daemon] Shutting down...')
  server.stop()
  // SQLite WAL checkpoint happens automatically on close
  try { require('./persistence/db').getDB()?.close() } catch { /* ok */ }
  console.log('[cockpit-daemon] Bye')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// Re-export for backwards compatibility
export { jsonResponse } from './http'
