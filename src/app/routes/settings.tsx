import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAgentStore } from '@/entities/agent/store'
import { useState } from 'react'
import { Key, Eye, EyeOff, Check } from 'lucide-react'

const PROVIDERS = [
  { id: 'claude', name: 'Anthropic (Claude)', placeholder: 'sk-ant-...' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
  { id: 'gemini', name: 'Google Gemini', placeholder: 'AIza...' },
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

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configuracoes</h1>
        <p className="text-muted-foreground text-sm mt-1">Configuracoes globais do Cockpit</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Key className="h-4 w-4" />
            API Keys
          </CardTitle>
          <CardDescription>
            Chaves de API para os providers de AI. Armazenadas localmente no navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PROVIDERS.map((provider) => {
            const currentKey = getApiKey(provider.id) || ''
            const isVisible = showKeys[provider.id]
            const isSaved = saved[provider.id]

            return (
              <div key={provider.id} className="space-y-2">
                <Label className="flex items-center gap-2">
                  {provider.name}
                  {currentKey && (
                    <Badge variant="outline" className="text-[10px] text-green-600">
                      Configurada
                    </Badge>
                  )}
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={isVisible ? 'text' : 'password'}
                      defaultValue={currentKey}
                      placeholder={provider.placeholder}
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
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setShowKeys((s) => ({ ...s, [provider.id]: !s[provider.id] }))}
                  >
                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  {isSaved && <Check className="h-4 w-4 text-green-600 shrink-0" />}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
