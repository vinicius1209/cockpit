import { useDaemonStatus } from '@/shared/hooks/use-daemon-status'
import type { ReactNode } from 'react'

interface CockpitPageHeaderProps {
  /** Mono uppercase prefix shown before the title — usually a system/section label. */
  systemLabel: string
  /** Page title (h1). */
  title: string
  /** Optional sub-line (small, muted) below title. */
  subtitle?: string
  /** Right-aligned slot for actions or extra telemetry. */
  rightSlot?: ReactNode
  /** Optional row of mono key-value stats below the header. */
  stats?: { label: string; value: string | number; tone?: 'default' | 'live' | 'error' }[]
  /** Hide the daemon LED on the right. */
  hideDaemonStatus?: boolean
}

// Cockpit-style page header. Combines flight-strip identification with optional
// stats row and daemon LED. Use as the top of every full-page route.
export function CockpitPageHeader({
  systemLabel,
  title,
  subtitle,
  rightSlot,
  stats,
  hideDaemonStatus = false,
}: CockpitPageHeaderProps) {
  const daemonOnline = useDaemonStatus()

  return (
    <div className="border rounded-lg overflow-hidden mb-4">
      {/* Top bar: system label + daemon LED */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/20 font-mono text-[10px] uppercase tracking-[0.18em]">
        <span className="text-muted-foreground">━ {systemLabel}</span>
        <div className="ml-auto flex items-center gap-3">
          {rightSlot}
          {!hideDaemonStatus && (
            <DaemonLed online={daemonOnline} />
          )}
        </div>
      </div>

      {/* Title block */}
      <div className="px-4 py-3 space-y-1">
        <h1 className="text-xl font-bold tracking-tight leading-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground leading-snug">{subtitle}</p>
        )}
      </div>

      {/* Optional stats row */}
      {stats && stats.length > 0 && (
        <div className="border-t flex items-center gap-4 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] bg-background flex-wrap">
          {stats.map((s, i) => {
            const valueClass =
              s.tone === 'live' ? 'text-amber-500' :
              s.tone === 'error' ? 'text-rose-500' :
              'text-foreground'
            return (
              <span key={`${s.label}-${i}`} className="flex items-center gap-1">
                <span className="text-muted-foreground">{s.label}</span>
                <span className={`tabular-nums ${valueClass}`}>{s.value}</span>
                {i < stats.length - 1 && <span className="text-muted-foreground/30 ml-3">·</span>}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DaemonLed({ online }: { online: boolean | null }) {
  const cls = online
    ? { text: 'text-emerald-500', dotBg: 'bg-emerald-500', pingBg: 'bg-emerald-400', label: 'DAEMON ONLINE' }
    : online === false
      ? { text: 'text-rose-500', dotBg: 'bg-rose-500', pingBg: 'bg-rose-400', label: 'DAEMON OFFLINE' }
      : { text: 'text-amber-500', dotBg: 'bg-amber-500', pingBg: 'bg-amber-400', label: 'DAEMON CHECK' }

  return (
    <div className={`flex items-center gap-1.5 ${cls.text}`}>
      <span className="relative flex h-2 w-2">
        {online && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${cls.pingBg} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${cls.dotBg}`} />
      </span>
      <span>{cls.label}</span>
    </div>
  )
}
