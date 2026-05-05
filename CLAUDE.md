# Cockpit — guia para desenvolvimento

Cockpit é uma cabine de comando para gerenciamento de tarefas com agentes AI. UI/UX
deve sempre transmitir a sensação de estar pilotando algo (HUD, telemetria, LEDs,
mono fonts, identificadores técnicos), não de "mais um app web genérico".

Quando você for adicionar ou modificar UI neste projeto, siga as diretrizes abaixo.

---

## Design system COCKPIT

### Princípios

1. **Identidade técnica em todo lugar.** IDs curtos, slugs, paths em mono. Tudo é
   identificável: cards têm `#XXXX`, colunas têm `01/07`, workspaces têm `#ws-…`.
2. **LEDs falam o estado.** Verde `●` ativo, amber `◐` em progresso, cinza `○`
   vazio, vermelho `⊘` bloqueado. Loaders só giram quando há execução real.
3. **Telemetria sempre visível.** Status bars persistentes mostrando o que está
   acontecendo: agente em uso, modelo, timer, projeto, daemon LED.
4. **Numeração explícita.** Pipelines e tabs ganham `[1] [2] [3]` mono no início.
5. **Hierarquia por densidade.** Áreas críticas (status, abort) com mais peso
   visual; metadados ficam mono pequeno; dados de leitura em mono numérico.
6. **Ações destrutivas exigem confirmação.** Sempre. `useConfirm()` do
   `@/components/ui/confirm-dialog`. Para muito críticas (delete workspace), use
   `requireText` para forçar digitação do nome.

### Tokens visuais

#### Tipografia
- **Display/body**: Geist (variable), padrão do Tailwind.
- **Mono / técnica**: `font-mono` (Geist Mono). Use para:
  - IDs, slugs, paths
  - Section labels (`━ IDENTIFICACAO`, `━ PIPELINE`, etc)
  - Telemetria (chunks, tokens, timer)
  - Tab numbering `[1]..[N]`
- **Tracking**: textos mono uppercase usam `tracking-[0.14em]` ou `[0.18em]`.
  Quanto mais "técnica" a área, mais tracking.

#### Cores semânticas (LEDs)

| Estado | Cor | Tailwind |
|---|---|---|
| Done / online / OK | emerald-500 | `text-emerald-500 bg-emerald-500/10` |
| Live / running / em progresso | amber-500 | `text-amber-500 bg-amber-500/10` |
| Bloqueado / erro / offline | rose-500 | `text-rose-500 bg-rose-500/10` |
| Neutro / idle | muted-foreground | `text-muted-foreground` |
| Primary / ativo selecionado | primary | `text-primary` |

#### Separadores
- Inline mono: `·` em `text-muted-foreground/30`
- Section header: `━ NOME` (em mono uppercase)
- Vertical short divider: `<span className="h-5 w-px bg-border/60 mx-1" />`

#### Glow no LED ativo
Para LEDs importantes em estado ativo, adicione box-shadow colorido:
```tsx
style={{
  backgroundColor: color,
  boxShadow: `0 0 8px ${color}40`, // 40 = ~25% alpha
}}
```

### Patterns recorrentes

#### Flight strip header
Header de página/dialog que identifica o objeto (workspace, card, projeto):

```tsx
<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em]">
  <span className="text-muted-foreground">CARD</span>
  <span className="rounded-sm bg-muted px-1.5 py-0.5 tabular-nums">#{shortId}</span>
  <span className="text-muted-foreground/40">·</span>
  <span className="rounded-sm px-1.5 py-0.5 bg-blue-500/10 text-blue-500">FEATURE</span>
  <span className="text-muted-foreground/40">·</span>
  <span>P:MEDIA</span>
</div>
```
Implementação real: `src/features/board/card-flight-strip.tsx` (CardDialog),
`src/app/routes/workspace-settings.tsx` (workspace header).

#### Pipeline numerada com LEDs
Tabs sequenciais que representam estágios de um workflow. Use número, ícone,
label e LED de estado.

```tsx
<button className="flex items-center gap-1.5">
  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">[2]</span>
  <Icon className="h-3 w-3" />
  <span className="text-[11px] uppercase tracking-wider">Entrevista</span>
  {ledIcon}
</button>
```
Implementação: `src/features/board/card-pipeline-tabs.tsx`. LED states:
`empty | partial | running | done | blocked`.

#### Status bar persistente
Faixa fina no rodapé de container ativo, mostrando estado do sistema.

```
● LIVE · gerando spec · 00:34 · sonnet · 142 chunks · [✕ ABORT]
○ IDLE · ws: portfolio · proj: viniciusmachado · @ spec-writer /sonnet
```

Implementação: `src/features/board/card-status-bar.tsx`. Always present near
the bottom of dialogs/pages with active execution.

#### Telemetry strip
Linha mono compacta listando recursos detectados ou state global do sistema.

```tsx
<div className="font-mono text-[10px] uppercase tracking-[0.14em]">
  <span className="text-muted-foreground">━ EXECUTORS DETECTADOS</span>
  <span className="ml-auto flex items-center gap-3">
    {executors.map(e => (
      <span><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {e.name} {e.version}</span>
    ))}
  </span>
</div>
```

#### Live transmission overlay
Quando um agent está executando algo longo (gerando spec, implementando):
- Timer grande `T+MM:SS` em destaque (amber)
- Badge "TRANSMISSION ACTIVE" com ping
- Telemetria mono: chunks, chars, tokens, c/s
- Scanline progress bar indeterminada
- Live preview do stream com cursor pulsante
- Estado vazio: radar pulsante "AWAITING TRANSMISSION"

Implementação: `src/features/spec-engine/spec-generation-overlay.tsx`. Reuse
ou inspire-se neste componente para qualquer execução longa.

#### Card cockpit (kanban)
- Accent bar vertical à esquerda na cor do tipo
- Identifier strip mono no topo (`#ID · TYPE · P:PRIO`)
- Pipeline LEDs micro `[D-I-S-X]` indicando estágio
- Drag handle só visível no hover
- Live processing: borda âmbar com glow + LIVE badge no header

Implementação: `src/features/board/board-card.tsx`.

#### Confirm dialog destrutivo
Sempre. `useConfirm()` retorna promise. Para delete crítico:

```tsx
const ok = await confirm({
  title: 'Excluir workspace "Portfolio"?',
  description: 'Esta acao nao pode ser desfeita.',
  requireText: 'Portfolio',  // força digitar o nome
  confirmLabel: 'Excluir workspace',
})
if (ok) doIt()
```

### Dont's

- ❌ Não use loaders giratórios (`Loader2 animate-spin`) para indicar "tem dados
  parciais" — só para "executando agora". Use `CirclePause`/`CircleDot` para
  estados estáticos.
- ❌ Não duplique botões de cancelar (overlay e footer ao mesmo tempo). Esconda
  o do footer quando o overlay tem ABORT.
- ❌ Não esconda etapas bloqueadas — mostre com cadeado (`Lock`) e tooltip
  explicando o pré-requisito.
- ❌ Não use cores genéricas (purple gradient, etc) — siga a paleta semântica.
- ❌ Não use Inter/Roboto/Arial. Geist é padrão. Para mono, `font-mono`.
- ❌ Não esconda paths/IDs longos com truncate sem dar acesso ao valor completo
  (use `title` ou tooltip).

### Persistência (importante para LLMs)

| Tipo | Onde fica | Quando vai pro projeto |
|---|---|---|
| Workspace, cards, agentes config | `~/.cockpit/data/cockpit.db` (SQLite) | nunca — global |
| API keys | `~/.cockpit/data/secrets.json` | nunca |
| Spec/discovery/interview/feedback (.md) | `~/.cockpit/tasks/<ws-slug>/<card-id>/` | só após "Implementar" |
| Cópia para o agent CLI ler | `<projeto>/.cockpit/task/` | criada por `task-workspace.ts:copyToProject` (e `.cockpit/` é adicionado ao `.gitignore` automaticamente) |

Hoje **não há config por projeto** — agents e templates são por workspace, no DB
global. Se for adicionar config-in-project, faça em `<projeto>/.cockpit/config.json`.

---

## Fluxo de dados

```
Frontend (React + Zustand persist) ──HTTP──▶ Daemon (Bun + SQLite)
                                              │
                                              ├──spawn──▶ claude-code CLI
                                              ├──spawn──▶ opencode CLI
                                              ├──spawn──▶ gemini-cli
                                              │
                                              └──fetch──▶ Anthropic/OpenAI/Gemini API
                                                          (se API key configurada em /settings)
```

- **Frontend stores**: `src/entities/{card,workspace,agent,docs}/store.ts` —
  Zustand com adapter customizado que persiste no daemon (`createDaemonStorageAdapter`).
- **Daemon**: `daemon/src/index.ts` (Bun.serve), rotas em `daemon/src/routes/`.
- **Agent execution**: `daemon/src/executor/agent-executor.ts` — abstrai
  CLI agents (claude-code, opencode, gemini-cli) com `KNOWN_AGENTS` registry.
  - **claude-code precisa de `--permission-mode bypassPermissions`** em modo
    headless `-p`, senão Read/Edit são bloqueados silenciosamente.
  - Models longos como `claude-sonnet-4-7` são normalizados para tier names
    (`sonnet`/`haiku`/`opus`) via `normalizeModelForCli()`.
- **Streaming**: SSE no formato `{type: 'chunk'|'done'|'error', text|fullText}`.
  Reader compartilhado em `agent-service.ts:readDaemonSSE()`.

## Comandos úteis

```bash
npm run dev              # frontend (Vite, port 5173)
npm run test             # vitest run (24 tests, ~2s)
npm run lint             # ESLint (alguns warnings pré-existentes em recharts/use-mobile)
npm run build            # tsc -b && vite build

cd daemon && bun run dev # daemon (Bun, port 4800)
cd daemon && bun test    # 79 tests, ~200ms
```

## Architecture decision records (notas)

- **Por que SQLite em ~/.cockpit/data?** Single-user app, portabilidade não é
  prioridade. Backups JSON laterais (`cockpit-*.json.bak`) servem como fallback.
- **Por que daemon separado?** Agentes CLI precisam de processo nativo (não
  rodam em browser). Daemon centraliza spawn, secrets, persistence e métricas.
- **Por que dois fontes de model (presets + UI tab Agentes)?** Presets em
  `entities/agent/presets.ts` são o seed inicial; usuário pode customizar via
  workspace settings (tab Agentes). `addAgentConfig` deduplica por workspace+role.

## Onde colocar coisa nova

- **Novo componente UI reutilizável**: `src/components/ui/`
- **Novo helper de página/widget**: `src/widgets/`
- **Nova feature (verticalmente integrada)**: `src/features/<feature-name>/`
- **Nova store/entidade**: `src/entities/<entity>/{types,store,presets}.ts`
- **Nova rota daemon**: `daemon/src/routes/<route>.ts` + plugar em `daemon/src/index.ts`
- **Novo executor de agente**: adicionar entry em `KNOWN_AGENTS` em
  `daemon/src/executor/agent-executor.ts`
