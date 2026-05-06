// HooksPanel — UI pra editar shell scripts disparados pelo daemon nos
// momentos before_implement / after_implement / after_pr.

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'
import { Terminal, AlertTriangle, Save } from 'lucide-react'
import type { Workspace, WorkspaceHooks } from '@/entities/workspace/types'
import { toast } from 'sonner'

interface HooksPanelProps {
  workspace: Workspace
  onSave: (hooks: WorkspaceHooks) => void
}

interface HookDef {
  key: keyof WorkspaceHooks
  label: string
  description: string
  envVars: { name: string; desc: string }[]
  example: string
  blocking?: boolean
}

const HOOK_DEFS: HookDef[] = [
  {
    key: 'before_implement',
    label: 'before_implement',
    description: 'Roda apos a branch ser criada e ANTES do agent CLI spawnar. Exit != 0 ABORTA o implement.',
    envVars: [
      { name: 'COCKPIT_CARD_ID', desc: 'id completo do card' },
      { name: 'COCKPIT_SESSION_ID', desc: 'id da session' },
      { name: 'COCKPIT_BRANCH', desc: 'branch criada/checkout' },
      { name: 'COCKPIT_PROJECT_PATH', desc: 'cwd onde o agent vai rodar' },
      { name: 'COCKPIT_AGENT', desc: 'nome do agent (claude-code, etc)' },
      { name: 'COCKPIT_WORKSPACE_SLUG', desc: 'slug do workspace' },
    ],
    example: '# checa lint local antes de soltar o agent\nbun run lint || exit 1',
    blocking: true,
  },
  {
    key: 'after_implement',
    label: 'after_implement',
    description: 'Roda apos o agent terminar com sucesso, ANTES do PR. Informativo (nao para fluxo).',
    envVars: [
      { name: 'COCKPIT_SUMMARY', desc: 'JSON com filesModified/Created/Deleted' },
      { name: 'COCKPIT_BRANCH', desc: 'branch com edits' },
    ],
    example: '# roda testes apos implementacao\ncd "$COCKPIT_PROJECT_PATH" && bun test || true',
  },
  {
    key: 'after_pr',
    label: 'after_pr',
    description: 'Roda apos PR ser criado com sucesso. Otimo pra notify Slack, deploy preview, etc.',
    envVars: [
      { name: 'COCKPIT_PR_URL', desc: 'URL completa do PR' },
      { name: 'COCKPIT_PR_NUMBER', desc: 'numero do PR' },
    ],
    example: 'curl -X POST -H "Content-Type: application/json" \\\n  -d "{\\"text\\":\\"PR aberto: $COCKPIT_PR_URL\\"}" \\\n  "$SLACK_WEBHOOK_URL"',
  },
]

export function HooksPanel({ workspace, onSave }: HooksPanelProps) {
  const initial = workspace.hooks || {}
  const [drafts, setDrafts] = useState<Record<string, string>>({
    before_implement: initial.before_implement || '',
    after_implement: initial.after_implement || '',
    after_pr: initial.after_pr || '',
  })
  const [dirty, setDirty] = useState(false)

  const handleChange = (key: string, value: string) => {
    setDrafts((d) => ({ ...d, [key]: value }))
    setDirty(true)
  }

  const handleSave = () => {
    const next: WorkspaceHooks = {}
    for (const def of HOOK_DEFS) {
      if (drafts[def.key].trim()) next[def.key] = drafts[def.key]
    }
    onSave(next)
    setDirty(false)
    toast.success('hooks salvos')
  }

  return (
    <div className="space-y-4">
      {/* Banner de aviso de seguranca */}
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2 text-xs">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1">
          <p className="font-medium text-amber-500">Hooks rodam com permissoes do daemon</p>
          <p className="text-muted-foreground">
            Scripts sao executados em <code className="font-mono">/bin/sh -c</code> com cwd no projeto.
            Timeout: 60s. Soh use scripts que voce confia. Stdout aparece no live tail; stderr eh capturado pra log.
          </p>
        </div>
      </div>

      {HOOK_DEFS.map((def) => (
        <Card key={def.key}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">{def.label}</span>
                {def.blocking && (
                  <span className="font-mono text-[9px] uppercase tracking-wider rounded-sm bg-rose-500/15 text-rose-500 border border-rose-500/30 px-1.5 py-0.5">
                    GATE
                  </span>
                )}
                <InfoHint
                  text={def.description}
                  detail={
                    def.blocking
                      ? 'Exit code != 0 cancela toda a implementacao. Use pra validacoes pre-flight (lint, schema check, etc).'
                      : 'Erros nao param o fluxo — usado pra integracoes (notificar, deploy, metricas).'
                  }
                />
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">
                {drafts[def.key].trim() ? `${drafts[def.key].split('\n').length} linhas` : 'desabilitado'}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">{def.description}</p>

            <Textarea
              value={drafts[def.key]}
              onChange={(e) => handleChange(def.key, e.target.value)}
              placeholder={def.example}
              className="font-mono text-xs min-h-[100px] bg-muted/20"
              spellCheck={false}
            />

            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground transition-colors">
                env vars disponiveis ({def.envVars.length})
              </summary>
              <ul className="mt-2 space-y-0.5 pl-3">
                {def.envVars.map((v) => (
                  <li key={v.name} className="font-mono">
                    <span className="text-foreground/80">{v.name}</span> <span className="opacity-60">— {v.desc}</span>
                  </li>
                ))}
                <li className="font-mono opacity-60 italic">
                  + COCKPIT_HOOK, COCKPIT_WORKSPACE_NAME, e o env do daemon
                </li>
              </ul>
            </details>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-end gap-2 sticky bottom-0 bg-background py-2">
        {dirty && <span className="text-[11px] text-amber-500 font-mono">alteracoes nao salvas</span>}
        <Button size="sm" onClick={handleSave} disabled={!dirty}>
          <Save className="h-3.5 w-3.5 mr-1" />
          Salvar hooks
        </Button>
      </div>
    </div>
  )
}
