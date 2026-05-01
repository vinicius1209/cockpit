import { handleRequest } from './routes/router'

const PORT = Number(process.env.COCKPIT_DAEMON_PORT || 4800)

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // max allowed by Bun (seconds) — needed for long SSE streams during agent execution
  async fetch(req) {
    // CORS for local frontend
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      })
    }

    try {
      const response = await handleRequest(req)
      // Add CORS headers to all responses
      for (const [key, value] of Object.entries(corsHeaders())) {
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

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
