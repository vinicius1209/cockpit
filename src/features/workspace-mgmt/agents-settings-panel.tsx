import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAgentStore } from '@/entities/agent/store'
import { AGENT_PRESETS } from '@/entities/agent/presets'
import type { AgentConfig, AgentProvider, AgentRole } from '@/entities/agent/types'
import { daemonClient } from '@/shared/lib/daemon-client'
import { Bot, RotateCcw, ChevronDown, ChevronRight, Sparkles, ScrollText, MessageSquare, Rocket, Shield, Loader2, CheckCircle2, XCircle, Play } from 'lucide-react'
import { toast } from 'sonner'

interface AgentsSettingsPanelProps {
  workspaceId: string
}

const ROLE_META: Record<AgentRole, { icon: typeof Bot; label: string; tagline: string }> = {
  analyzer:     { icon: Sparkles,      label: 'Analyzer',     tagline: 'Analisa cards e sugere abordagens' },
  'spec-writer':{ icon: ScrollText,    label: 'Spec Writer',  tagline: 'Gera especificacoes tecnicas a partir do card' },
  interviewer:  { icon: MessageSquare, label: 'Interviewer',  tagline: 'Faz perguntas para refinar requisitos' },
  implementer:  { icon: Rocket,        label: 'Implementer',  tagline: 'Planeja a implementação após a spec' },
  reviewer:     { icon: Shield,        label: 'Reviewer',     tagline: 'Revisa o resultado da implementação' },
  custom:       { icon: Bot,           label: 'Custom',       tagline: 'Agente personalizado' },
}

// Curated catalog. Daemon normalizes long Claude IDs (e.g. claude-sonnet-4-7)
// into CLI tier names (sonnet) when falling back to claude-code.
const MODEL_CATALOG: Record<AgentProvider, { id: string; label: string }[]> = {
  claude: [
    { id: 'sonnet', label: 'sonnet — equilibrado (CLI ou API)' },
    { id: 'haiku',  label: 'haiku — rápido e barato' },
    { id: 'opus',   label: 'opus — profundo e caro' },
    { id: 'claude-sonnet-4-7', label: 'claude-sonnet-4-7 (API direta)' },
    { id: 'claude-haiku-4-5',  label: 'claude-haiku-4-5 (API direta)' },
    { id: 'claude-opus-4-7',   label: 'claude-opus-4-7 (API direta)' },
  ],
  openai: [
    { id: 'gpt-5.5',     label: 'gpt-5.5' },
    { id: 'gpt-5-nano',  label: 'gpt-5-nano' },
    { id: 'gpt-4o',      label: 'gpt-4o' },
  ],
  gemini: [
    { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash' },
    { id: 'gemini-2.5-pro',   label: 'gemini-2.5-pro' },
    { id: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview' },
  ],
  custom: [],
}

const PROVIDER_LABEL: Record<AgentProvider, string> = {
  claude: 'Anthropic / Claude',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  custom: 'Custom',
}

export function AgentsSettingsPanel({ workspaceId }: AgentsSettingsPanelProps) {
  const { getWorkspaceAgents, updateAgentConfig, addAgentConfig } = useAgentStore()
  const agents = getWorkspaceAgents(workspaceId)

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Cada agente abaixo tem um papel fixo na pipeline do card. O daemon roteia automaticamente
          para a API direta (se a key estiver em <span className="font-mono">/settings</span>) ou
          para o CLI instalado (claude-code, opencode, gemini-cli).
        </p>
      </div>

      {AGENT_PRESETS.map((preset) => {
        const agent = agents.find((a) => a.role === preset.role)
        if (!agent) {
          return (
            <Card key={preset.role}>
              <CardContent className="py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Preset {preset.name} não inicializado</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    addAgentConfig({
                      ...preset,
                      workspace_id: workspaceId,
                      enabled: true,
                    })
                  }}
                >
                  Inicializar
                </Button>
              </CardContent>
            </Card>
          )
        }
        return (
          <AgentEditor
            key={agent.id}
            agent={agent}
            workspaceId={workspaceId}
            onUpdate={(data) => updateAgentConfig(agent.id, workspaceId, data)}
          />
        )
      })}
    </div>
  )
}

interface AgentEditorProps {
  agent: AgentConfig
  workspaceId: string
  onUpdate: (data: Partial<AgentConfig>) => void
}

function AgentEditor({ agent, onUpdate }: AgentEditorProps) {
  const meta = ROLE_META[agent.role] || ROLE_META.custom
  const Icon = meta.icon
  const preset = AGENT_PRESETS.find((p) => p.role === agent.role)
  const [expanded, setExpanded] = useState(false)
  const [promptDraft, setPromptDraft] = useState(agent.system_prompt)

  // Test state — N6: hello-world via daemon's /agents/execute
  const [testState, setTestState] = useState<'idle' | 'running' | 'ok' | 'error'>('idle')
  const [testInfo, setTestInfo] = useState<{ duration?: number; output?: string; error?: string }>({})

  const models = MODEL_CATALOG[agent.provider] || []
  const knownModel = models.some((m) => m.id === agent.model)
  const [customModel, setCustomModel] = useState(!knownModel)

  const handleTest = async () => {
    setTestState('running')
    setTestInfo({})
    const start = Date.now()
    // Map provider → installed CLI agent name. claude-code is the only one we
    // currently support testing via /agents/execute.
    const cliAgent = agent.provider === 'claude' ? 'claude-code'
      : agent.provider === 'gemini' ? 'gemini-cli'
      : 'opencode'
    try {
      const res = await daemonClient.executeAgent(
        cliAgent,
        'Responda apenas a palavra "OK" se você conseguir me ouvir.',
      )
      const duration = Date.now() - start
      if (res.exitCode === 0) {
        setTestState('ok')
        setTestInfo({ duration, output: res.output.slice(0, 80) })
      } else {
        setTestState('error')
        setTestInfo({ duration, error: res.output.slice(0, 200) })
      }
    } catch (err) {
      setTestState('error')
      setTestInfo({ error: err instanceof Error ? err.message : 'Erro' })
    }
    // Auto-clear after 6s
    setTimeout(() => setTestState('idle'), 6000)
  }

  const handleProviderChange = (newProvider: AgentProvider) => {
    const defaultModel = MODEL_CATALOG[newProvider]?.[0]?.id || agent.model
    onUpdate({ provider: newProvider, model: defaultModel })
    setCustomModel(false)
  }

  const handleReset = () => {
    if (!preset) return
    onUpdate({
      provider: preset.provider,
      model: preset.model,
      temperature: preset.temperature,
      max_tokens: preset.max_tokens,
      system_prompt: preset.system_prompt,
      enabled: true,
    })
    setPromptDraft(preset.system_prompt)
    setCustomModel(false)
    toast.success(`${meta.label} restaurado para o preset`)
  }

  const promptDirty = promptDraft !== agent.system_prompt
  const tempStr = String(agent.temperature)

  return (
    <Card className={agent.enabled ? '' : 'opacity-60'}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm flex items-center gap-2">
              {meta.label}
              <Badge variant="outline" className="text-[10px] font-mono">{agent.role}</Badge>
              {!agent.enabled && <Badge variant="secondary" className="text-[10px]">desativado</Badge>}
            </CardTitle>
            <CardDescription className="text-[11px] mt-0.5">{meta.tagline}</CardDescription>
          </div>
          <Switch
            checked={agent.enabled}
            onCheckedChange={(v) => onUpdate({ enabled: v })}
            aria-label="Ativar agente"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Provider + Model row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Provider</Label>
            <Select value={agent.provider} onValueChange={(v) => handleProviderChange(v as AgentProvider)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(MODEL_CATALOG) as AgentProvider[]).filter((p) => p !== 'custom').map((p) => (
                  <SelectItem key={p} value={p} className="text-xs">{PROVIDER_LABEL[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Model</Label>
            {customModel ? (
              <div className="flex gap-1">
                <Input
                  value={agent.model}
                  onChange={(e) => onUpdate({ model: e.target.value })}
                  className="h-8 text-xs font-mono"
                  placeholder="model-id"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-[10px]"
                  onClick={() => setCustomModel(false)}
                >
                  Lista
                </Button>
              </div>
            ) : (
              <Select
                value={knownModel ? agent.model : '__custom__'}
                onValueChange={(v) => {
                  if (v === '__custom__') { setCustomModel(true); return }
                  onUpdate({ model: v })
                }}
              >
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <span className="font-mono">{m.label}</span>
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__" className="text-xs text-muted-foreground italic">
                    Personalizado…
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Temperature */}
        <div className="grid grid-cols-2 gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Temperatura <span className="text-muted-foreground/60 normal-case">(0 = determinístico, 1 = criativo)</span>
            </Label>
            <Input
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={tempStr}
              onChange={(e) => {
                const n = parseFloat(e.target.value)
                if (!isNaN(n)) onUpdate({ temperature: n })
              }}
              className="h-8 text-xs font-mono w-24"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            {/* N6 — Testar */}
            <TestResultBadge state={testState} info={testInfo} />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={handleTest}
              disabled={testState === 'running' || !agent.enabled}
              title="Hello-world ao agente CLI: confirma que ele responde"
            >
              {testState === 'running'
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> testando…</>
                : <><Play className="h-3 w-3 mr-1" /> Testar</>}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] text-muted-foreground"
              onClick={handleReset}
              disabled={!preset}
              title="Resetar todas as configurações deste agente para os valores do preset"
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Resetar preset
            </Button>
          </div>
        </div>

        {/* System prompt — collapsible */}
        <div className="space-y-1.5">
          <button
            className="flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            System prompt
            {promptDirty && <Badge variant="outline" className="text-[9px] ml-1">modificado</Badge>}
          </button>
          {expanded && (
            <div className="space-y-2">
              <Textarea
                value={promptDraft}
                onChange={(e) => setPromptDraft(e.target.value)}
                rows={8}
                className="text-xs font-mono resize-none"
                placeholder="Você e um..."
              />
              <div className="flex gap-2 justify-end">
                {promptDirty && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setPromptDraft(agent.system_prompt)}
                    >
                      Descartar
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        onUpdate({ system_prompt: promptDraft })
                        toast.success(`${meta.label} salvo`)
                      }}
                    >
                      Salvar prompt
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function TestResultBadge({
  state,
  info,
}: {
  state: 'idle' | 'running' | 'ok' | 'error'
  info: { duration?: number; output?: string; error?: string }
}) {
  if (state === 'idle' || state === 'running') return null
  const isOk = state === 'ok'
  return (
    <span
      className={`flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] ${
        isOk ? 'text-emerald-500' : 'text-rose-500'
      }`}
      title={isOk ? `OK · ${info.output}` : info.error}
    >
      {isOk ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {isOk ? `OK · ${info.duration}ms` : 'falhou'}
    </span>
  )
}
