import { useState, useEffect } from 'react'
import { DAEMON_URL } from '@/shared/lib/constants'

export function useDaemonStatus(intervalMs = 10000) {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        // 8s timeout — durante implementacoes pesadas o daemon pode demorar
        // alguns segundos pra responder /health. 3s era muito agressivo e
        // marcava daemon offline mesmo quando estava rodando.
        const res = await fetch(`${DAEMON_URL}/health`, { signal: AbortSignal.timeout(8000) })
        if (mounted) setOnline(res.ok)
      } catch {
        if (mounted) setOnline(false)
      }
    }

    check()
    const timer = setInterval(check, intervalMs)
    return () => { mounted = false; clearInterval(timer) }
  }, [intervalMs])

  return online
}
