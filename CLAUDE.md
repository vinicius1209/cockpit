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

## Modos de uso (importante para LLMs)

O Cockpit pode ser operado de **3 formas paralelas** que conversam com o mesmo daemon:

| Modo | Quando usar | Onde fica o código |
|---|---|---|
| **Web UI** (port 5173) | Visão geral, kanban visual, dashboard, AI Chat com contexto rico | `src/` (React + Vite) |
| **CLI `cockpit`** | Operações rápidas no terminal, scripts, watch live de execução, REPL ai | `cli/` (Bun standalone, zero deps) |
| **MCP server `cockpit-mcp`** | Claude Code controla Cockpit pelo protocolo MCP (19 tools + 2 resources, bootstrap completo: create_workspace + link_project + set_card_project) | `mcp/` (Bun + `@modelcontextprotocol/sdk`) |

Os 3 modos compartilham 100% do estado (mesmo SQLite, mesmas sessions, mesmas APIs). Não há "modo prioritário" — cada um serve um caso de uso.

### Quando recomendar CLI vs Web

- Implementação rápida + tail no terminal → `cockpit implement <id> --watch`
- Triagem em massa + filtros via jq → `cockpit card list --json | jq ...`
- Discussão livre com AI sobre um card → `cockpit ai <id>` (REPL)
- Visualização de board em tela cheia → Web UI ou `cockpit board`
- Configurar agentes/automações/templates → Web UI (workspace settings)

Veja [`cli/README.md`](./cli/README.md) para a cheatsheet completa.

## Fluxo de dados

```
Frontend (React + Zustand persist) ──HTTP──▶ Daemon (Bun + SQLite)
CLI cockpit (Bun standalone)       ──HTTP──▶
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
- **Project lock (F9-A)**: `daemon/src/tasks/project-lock.ts` impede 2 implementacoes simultaneas no mesmo path. Pre-check nas rotas implement retorna 409 com payload `held_by` rico antes de criar session. Locks orfaos sao limpos lazy (peek) + batch (reaper 5min) + boot. Lock NAO afeta spec/discovery/chat/watch — so implementations.
- **Worktree opt-in (F9-B)**: `daemon/src/git/worktree-manager.ts` cria git worktree separado por session quando `isolation=worktree`. Path: `<projectPath>.cockpit-worktrees/<sessionId>/`. Skipa lock, usa working tree isolado. Cleanup automatico no finally. CLI: `--isolation worktree`. MCP: `isolation: "worktree"` arg.
- **Card archive (F10)**: `Card.archived_at` field (Zustand-persisted). Web UI tem botao Descartar (amber) separado de Excluir. Board filtra archived por padrao com toggle. Cards archived: opacity-50 + grayscale + border-dashed.
- **TUI (`cli/src/tui/`)**: engine proprio (alternate screen + raw mode), screens em `cli/src/tui/screens/`. Cada screen implementa interface `Screen` (render + onKey + onEnter/onLeave + tick opcional). Engine gerencia stack (push/pop/replace) e cleanup ANSI no exit. **Render usa moveTo+clearLine por linha** (NAO `\n`) pra evitar staircase em raw mode. Card screen tem actions: i=implement, I=worktree, s=spec hint, a=archive, x=abort.
- **Session abort (F-MCP-T3)**: `daemon/src/tasks/session-manager.ts` exporta `registerSessionAbort/unregisterSessionAbort/abortSession`. `executeAgentWithCallbacks` aceita `AbortSignal` opcional. `runImplementation` registra/desregistra automaticamente. Endpoint `POST /agents/sessions/<id>/abort`.
- **Live Agents Panel** (`src/app/routes/live-agents.tsx`): visao cross-workspace de sessions ativas. SSE per-session. File heatmap detecta conflito (2+ sessions tocando mesmo path → sugestao de worktree).
- **Maintenance** (`daemon/src/routes/maintenance.ts`): endpoints pro `cockpit doctor --fix` chamar (`reap-locks`, `reap-sessions`, listagem).
- **Command Palette** (`src/widgets/command-palette/command-palette.tsx`): cmdk-based, ⌘K global. `useCommandPalette` hook tambem instala atalhos sequenciais `g d/g a/g b/g m/g s` (Vim-style, fora de input). `workspace.tsx` + `board-view.tsx` escutam `?cardId/?new=1/?archived=1` pra integrar com palette + Live Agents links.
- **PR status** (`src/features/board/pr-status-badge.tsx` + `daemon/src/routes/git.ts`): live status via `gh pr view --json` no daemon (cache 30s). Card.pr_url salvo automaticamente quando `runImplementation` cria PR. Badge usado no card detail (full) e Live Agents lane (compact).
- **First-run wizard** (`src/widgets/onboarding/`): Dialog 4-step disparado quando `totalCards === 0` E `localStorage['cockpit-first-run-seen']` ausente. Cria workspace+projeto+card guiado.
- **InfoHint** (`src/components/ui/info-hint.tsx`): tooltip wrapper pra explicar jargao tecnico (spec status, auto_pr, isolation worktree). Use sempre que adicionar termo novo que pode confundir usuario nao 100% tecnico.
- **Tests**: `bun test src/__tests__/` em cada package (cli, mcp, daemon, frontend usa vitest). Total v0.5.0: 175 tests.
- **Agent execution**: `daemon/src/executor/agent-executor.ts` — abstrai
  CLI agents (claude-code, opencode, gemini-cli) com `KNOWN_AGENTS` registry.
  - **claude-code precisa de `--permission-mode bypassPermissions`** em modo
    headless `-p`, senão Read/Edit são bloqueados silenciosamente.
  - Models longos como `claude-sonnet-4-7` são normalizados para tier names
    (`sonnet`/`haiku`/`opus`) via `normalizeModelForCli()`.
- **Streaming**: SSE no formato `{type: 'chunk'|'done'|'error', text|fullText}`.
  Reader compartilhado em `agent-service.ts:readDaemonSSE()`.

## Daemon lifecycle (macOS launchd)

O daemon e o unico processo que precisa ficar rodando — Web/CLI/MCP sao clientes dele. Pra nao depender de subir manualmente toda vez:

```bash
cockpit daemon install     # escreve ~/Library/LaunchAgents/dev.cockpit.daemon.plist + load -w
cockpit daemon status      # health + estado do launchagent + paths
cockpit daemon logs -f     # tail (stdout: ~/.cockpit/logs/daemon.log)
cockpit daemon stop        # unload (volta no proximo login)
cockpit daemon restart     # unload + load
cockpit daemon uninstall   # unload -w + remove plist
```

Detalhes:
- Label: `dev.cockpit.daemon` · Plist: `~/Library/LaunchAgents/dev.cockpit.daemon.plist`
- Logs: `~/.cockpit/logs/{daemon,daemon.err}.log`
- `KeepAlive: true` + `ThrottleInterval: 10` — respawn automatico se crashar
- `RunAtLoad: true` + `load -w` — sobe em todo login

Em Linux/Windows nao ha launchd; o comando emite instrucao pra usar systemd/Task Scheduler. Pra dev iterativo continua valendo `bun run dev:daemon` (foreground).

## Comandos úteis

```bash
# Frontend (Vite, port 5173)
bun run dev
bun run test                 # vitest (24 tests)
bun run lint
bun run build                # tsc -b && vite build

# Daemon (Bun + SQLite, port 4800)
bun run dev:daemon           # foreground (dev/debug)
cockpit daemon install       # background via launchd (prod-style)
cd daemon && bun test        # 79 tests

# Tudo de uma vez
bun run test:all             # frontend + daemon

# CLI cockpit
bun run cli:install          # symlinka ~/.local/bin/cockpit + ck
bun run cli                  # roda local sem instalar (cli/src/index.ts)
bun run cli:build            # bun build --compile produz binário standalone
cd cli && bunx tsc --noEmit  # type check do CLI

# MCP server (Claude Code integration)
bun run mcp:install          # registra em ~/.claude.json
bun run mcp                  # roda standalone (test only — clientes spawnar via JSON-RPC)
cd mcp && bunx tsc --noEmit  # type check do MCP
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

### Frontend (`src/`)
- **Novo componente UI reutilizável**: `src/components/ui/`
- **Novo helper de página/widget**: `src/widgets/`
- **Nova feature (verticalmente integrada)**: `src/features/<feature-name>/`
- **Nova store/entidade**: `src/entities/<entity>/{types,store,presets}.ts`

### Daemon (`daemon/src/`)
- **Nova rota**: `daemon/src/routes/<route>.ts` + plugar em `daemon/src/routes/router.ts`
- **Novo executor de agente**: adicionar entry em `KNOWN_AGENTS` em `daemon/src/executor/agent-executor.ts`
- **Migration SQLite**: `daemon/src/persistence/db.ts` em `runMigrations()`, incrementar `PRAGMA user_version`

### CLI (`cli/src/`)
- **Novo comando**: `cli/src/commands/<name>.ts` + plugar no router em `cli/src/index.ts` + adicionar entry em `cli/src/commands/help.ts` (`COMMANDS` array)
- **Novo helper de UI ANSI**: `cli/src/ui/` (zero deps por convenção — cores via `colors.ts`)
- **Nova chamada ao daemon**: `cli/src/api/client.ts` (request) ou `cli/src/api/store.ts` (mutation via persist envelope)
- **SSE streaming**: usar `cli/src/api/sse.ts` (`postSSE` ou `getSSE`)

### TUI (`cli/src/tui/`)
- **Nova screen**: `cli/src/tui/screens/<name>-screen.ts` implementando interface `Screen` (render(width, height) → string, onKey(key) → KeyResult com `'consumed' | 'quit' | 'push' | 'pop' | 'replace'`)
- **Push/pop**: dentro de `onKey` retornar `{ kind: 'push', screen: new OutraScreen() }` ou `{ kind: 'pop' }`
- **Live data (SSE)**: spawn no `onEnter`, abort no `onLeave`. Engine chama `tick()` a cada 500ms se a screen tiver
- **Layout**: usar `cli/src/tui/layout.ts` (`clip`, `padRight`, `joinCols`, `box`) — respeitam ANSI

### MCP (`mcp/src/`)
- **Nova tool**: adicionar entry em `setRequestHandler(ListToolsRequestSchema, ...)` em `mcp/src/index.ts` + handler no `CallToolRequestSchema` switch
- **Tool naming**: prefix `cockpit_` (snake_case, claro pra LLM): `cockpit_create_card`, `cockpit_search`
- **Schema**: usar JSON Schema em `inputSchema` — explicar `description` bem (LLM lê pra escolher tool)
- **Mutation**: `daemonGet` + `daemonPost` ou `patchCardsStore` (mesma lógica do CLI, mas em `mcp/src/api.ts`)
- **Logs**: SEMPRE em `process.stderr.write` — stdout é reservado pra JSON-RPC

### Documentação
- **Roadmap do CLI**: `TODO_CLI.md`
- **Backlog técnico geral**: `TODO_HUMAN_LLM.md`
- **Tradeoffs / decisões arquiteturais**: este arquivo (CLAUDE.md)
