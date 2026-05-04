import { useState, useEffect } from 'react'
import { DAEMON_URL } from '@/shared/lib/constants'

export function useDaemonStatus(intervalMs = 10000) {
  const [online, setOnline] = useState<boolean | null>(null)

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const res = await fetch(`${DAEMON_URL}/health`, { signal: AbortSignal.timeout(3000) })
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
