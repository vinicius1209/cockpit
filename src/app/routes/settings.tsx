import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAgentStore } from '@/entities/agent/store'
import { CockpitPageHeader } from '@/widgets/cockpit-page-header'
import { useState } from 'react'
import { Key, Eye, EyeOff, Check, ExternalLink } from 'lucide-react'

const PROVIDERS = [
  { id: 'claude', name: 'Anthropic Claude', placeholder: 'sk-ant-...', code: 'CLD', docsUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI',           placeholder: 'sk-...',     code: 'OAI', docsUrl: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Google Gemini',    placeholder: 'AIza...',    code: 'GEM', docsUrl: 'https://aistudio.google.com/app/apikey' },
]

export function SettingsPage() {
  const { setApiKey, getApiKey } = useAgentStore()
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})

  const handleSave = (providerId: string, value: string) => {
    setApiKey(providerId, value)
    setSaved((s) => ({ ...s, [providerId]: true }))
    setTimeout(() => setSaved((s) => ({ ...s, [providerId]: false })), 2000)
  }

  const configuredCount = PROVIDERS.filter((p) => getApiKey(p.id)).length

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto">
      <CockpitPageHeader
        systemLabel="SYSTEM · CONFIGURAÇÕES"
        title="Configuracoes"
        subtitle="Configuracoes globais do Cockpit · API keys, segredos e telemetria"
        stats={[
          { label: 'API KEYS', value: `${configuredCount}/${PROVIDERS.length}`, tone: configuredCount > 0 ? 'live' : 'default' },
        ]}
      />

      {/* ── API KEYS BLOCK ── */}
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/20 font-mono text-[10px] uppercase tracking-[0.18em]">
          <Key className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">━ API KEYS</span>
          <span className="ml-auto text-muted-foreground/60 normal-case tracking-normal text-[11px]">
            Opcional — sem key, agents rodam via CLI local
          </span>
        </div>

        <div className="divide-y">
          {PROVIDERS.map((provider) => {
            const currentKey = getApiKey(provider.id) || ''
            const isVisible = showKeys[provider.id]
            const isSaved = saved[provider.id]
            const isConfigured = !!currentKey

            return (
              <div key={provider.id} className="px-3 py-3 space-y-2">
                {/* Identifier strip */}
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
                  <span className="rounded-sm bg-muted/60 px-1.5 py-0.5 text-foreground tabular-nums">{provider.code}</span>
                  <span className="text-foreground/90 normal-case tracking-normal text-sm font-sans font-semibold">
                    {provider.name}
                  </span>
                  {isConfigured ? (
                    <span className="flex items-center gap-1 text-emerald-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      CONFIGURADA
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground/60">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                      VAZIA
                    </span>
                  )}
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto flex items-center gap-1 text-muted-foreground/70 hover:text-foreground transition-colors normal-case tracking-normal text-[11px]"
                  >
                    obter key <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>

                {/* Input row */}
                <div className="flex items-center gap-2">
                  <Input
                    type={isVisible ? 'text' : 'password'}
                    defaultValue={currentKey}
                    placeholder={provider.placeholder}
                    className="font-mono text-xs"
                    onBlur={(e) => {
                      if (e.target.value !== currentKey) {
                        handleSave(provider.id, e.target.value)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const target = e.target as HTMLInputElement
                        if (target.value !== currentKey) {
                          handleSave(provider.id, target.value)
                        }
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                    title={isVisible ? 'Ocultar key' : 'Mostrar key'}
                  >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {isSaved && (
                    <span className="flex items-center gap-1 text-emerald-500 font-mono text-[10px] uppercase tracking-[0.14em] shrink-0">
                      <Check className="h-3 w-3" />
                      saved
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer hint */}
        <div className="border-t bg-muted/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          ━ keys persistidas em ~/.cockpit/data/secrets.json (server-side, nunca expostas ao cliente)
        </div>
      </div>
    </div>
  )
}
