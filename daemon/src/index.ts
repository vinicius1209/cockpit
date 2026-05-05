import { handleRequest } from './routes/router'
import { initPersistence } from './persistence'
import { jsonResponse } from './http'
import { reapStaleSessions } from './tasks/session-manager'
import { reapOrphanLocks } from './tasks/project-lock'

const PORT = Number(process.env.COCKPIT_DAEMON_PORT || 4800)
// Bind explicito em 127.0.0.1 (IPv4 loopback). Sem isso, Bun.serve em algumas
// versoes binda APENAS em IPv6 (`::*`), e o navegador resolvendo "localhost"
// pode tentar IPv4 primeiro (Happy Eyeballs) e receber "connection refused"
// silenciosamente. Causou requests /health falhando aleatoriamente.
const HOST = process.env.COCKPIT_DAEMON_HOST || '127.0.0.1'

await initPersistence()

const server = Bun.serve({
  port: PORT,
  hostname: HOST,
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

console.log(`[cockpit-daemon] Running on http://${HOST}:${server.port}`)

// Reaper de sessoes stale — roda a cada 5min e marca como error sessions
// que estao "running" ha mais de 30min sem update. Captura agents travados
// ou crashes silenciosos sem precisar reiniciar o daemon.
const REAPER_INTERVAL_MS = 5 * 60 * 1000
const REAPER_STALE_MIN = 30
const reaperTimer = setInterval(async () => {
  try {
    const reaped = await reapStaleSessions(REAPER_STALE_MIN)
    if (reaped > 0) {
      console.log(`[reaper] ${reaped} sessao(oes) stale marcada(s) como error`)
    }
    // Locks orfaos (cuja session ja terminou) — depende do reaper de sessions
    // ter rodado primeiro pra marcar as zumbis como error.
    await reapOrphanLocks()
  } catch (err) {
    console.warn('[reaper] failed:', err)
  }
}, REAPER_INTERVAL_MS)

// Boot cleanup: locks orfaos de runs anteriores que crasharam sem release.
// Executa antes de aceitar requests novas pra evitar 409 falso-positivo.
try {
  const orphans = await reapOrphanLocks()
  if (orphans > 0) console.log(`[boot] cleaned ${orphans} orphan project lock(s)`)
} catch (err) {
  console.warn('[boot] orphan lock cleanup failed:', err)
}

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
  clearInterval(reaperTimer)
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
