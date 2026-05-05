# Changelog

Todas as mudanças notáveis do Cockpit. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.2.0] — 2026-05-05

Foco: **multi-session orchestration**, **descarte de cards** e **TUI fullscreen**. Cockpit deixa de ser apenas Web/CLI/MCP isolados e ganha primitivas pra trabalhar com N agents em paralelo de forma segura.

### Added — F10: archive (descartar) cards

Linear/Jira/GH-style: separar "soft delete" (preserva tudo) de "hard delete". Resolve a frustração de ter só `Excluir` vermelho.

- Field `Card.archived_at` (Zustand-persisted, sem migration SQLite)
- Web UI: botão `Descartar` (amber) ao lado de `Excluir`. Excluir agora exige `requireText` se card tem spec/entrevista
- Board: toggle `descartados <count>` no filtros bar; cards renderizam com opacity-50 + grayscale + border-dashed
- CLI: `cockpit card archive <id>`, `cockpit card unarchive <id>`, `--include-archived` / `--only-archived` no list
- MCP: `cockpit_archive_card`, `cockpit_unarchive_card`, args `include_archived` / `only_archived` em list_cards

### Added — F9-A: project lock (multi-session orchestration)

Quando duas implementações tentam rodar no mesmo projeto, a segunda recebe `409 project_locked` antes de criar uma session zumbi. Resolve a categoria mais comum de conflito: working tree compartilhado com edits stomped.

- Migration v4: tabela `project_locks(path PK, session_id, kind, acquired_at)`
- `daemon/src/tasks/project-lock.ts`: `acquireProjectLock`, `releaseProjectLock`, `peekActiveProjectLock`, `reapOrphanLocks`
- Pre-check em `/agents/implement` e `/agents/implement/async` retorna 409 com payload rico (`held_by` com session_id, card, workspace, agent, age_seconds + `hints`)
- Auto-cleanup de locks órfãos: peek limpa lazy quando session já terminou; reaper periódico (5min) limpa em batch; boot cleanup limpa survivors de daemon crash
- CLI: `cockpit implement` detecta 409 e renderiza UX rica (project, card, agent, idade, opções)
- MCP: `cockpit_implement_async` lança erro estruturado com options pra LLM ("aguarde, peça pra abortar, dispare em outro projeto")
- Lock NÃO afeta: spec gen, discovery, chat, watch, log, metrics — só implementations que tocam working tree
- Lock por path: 2 implementations em projetos diferentes rodam paralelo. Apenas o mesmo path bloqueia.

### Added — F9-B: `--isolation worktree` opt-in

Complemento do F9-A: lock continua sendo o default sensato, mas agora o usuário pode optar por worktree quando precisa rodar 2+ implementações no mesmo projeto ao mesmo tempo.

- `daemon/src/git/worktree-manager.ts`: `createWorktree`, `removeWorktree`, `listCockpitWorktrees`, `cleanupAbandonedWorktrees`. Worktrees em `<projectPath>.cockpit-worktrees/<sessionId>/`
- `ImplementConfig.isolation: 'lock' | 'worktree'` (default `'lock'`)
- `runImplementation`:
  - Em modo lock (default): comportamento idêntico ao v0.1.0
  - Em modo worktree: pula lock, cria worktree, redireciona toda atividade git e copy-to-project pro worktree, remove worktree no finally
- CLI: `cockpit implement <id> --isolation worktree` (alias `--worktree`)
- MCP: `cockpit_implement_async` aceita `isolation: "worktree"`. Description guia o LLM: "use worktree quando o usuário quer rodar 2+ no mesmo projeto ao mesmo tempo"
- Custo conhecido: full checkout duplicado, `node_modules` não compartilhado, portas conflitam entre worktrees do mesmo projeto. Opt-in justamente por isso.

### Added — `cockpit tui` (fullscreen kanban)

TUI interativo, zero deps. Engine próprio (alternate screen buffer + raw mode + event loop), múltiplas screens, navegação por teclado.

- Engine (`cli/src/tui/engine.ts`, `keys.ts`, `layout.ts`): Screen interface + KeyResult (push/pop/replace/quit), parser de stdin raw, helpers de clip/pad/center respeitando ANSI
- Screens:
  - **Board**: kanban interativo. Setas movem seleção entre colunas/cards, enter abre detalhe, w troca workspace, tab → sessions, a toggle archived, r refresh, q sai
  - **Card detail**: tabs `[1] DETALHES [2] SPEC [3] ENTREVISTA [4] SESSIONS`, scroll com ↑/↓, a archive/unarchive inline
  - **Sessions**: lista live com auto-refresh 3s, enter abre live tail
  - **Session tail**: SSE live no fullscreen, cap 1000 linhas
  - **Workspace picker**: modal pra trocar workspace ativo (persiste em `~/.cockpit/cli.json`)
- Coexiste com Web UI sem conflito — ambos clientes do daemon

### Added — Dogfood checklist (`DOGFOOD.md`)

10 cenários pra validar v0.2.0 num projeto real (1-2h investidas). Saiu como roteiro pra abrir issues estruturadas no repo público em vez de codar features especulativas.

### Changed

- Daemon health endpoint reporta `version: 0.2.0`
- CLI banner mostra `v0.2.0`
- MCP server identifica como `cockpit/0.2.0`
- README marca os novos componentes como ✅

### Migration

- SQLite migration v4: tabela `project_locks` (auto-aplicada no boot)
- Sem mudança breaking de API. Clients antigos do daemon continuam funcionando — os flags novos (`isolation`, `include_archived`, etc) têm defaults seguros.

## [0.1.0] — 2026-05-05

Primeiro release público. Cockpit deixa de ser "interno" e ganha as três interfaces (Web/CLI/MCP) com persistência consistente, streaming live e auto-start no macOS.

### Added — Web UI

- Pipeline completa: card → discovery → entrevista → spec → implement → PR
- Design system COCKPIT (flight strips, pipeline LEDs, telemetry strip, status bars persistentes, mono identifiers)
- Dashboard com KPIs, sparklines, velocity por workspace
- Docs Vault (markdown editor + busca cross-workspace)
- AI Chat com contexto rico (card + projeto + workspace)
- Live transmission overlay durante geração de spec / implementação
- `confirm-dialog` com `requireText` para ações destrutivas (delete workspace etc)
- Multi-agent UI (claude-code, opencode, gemini-cli, aider) — config por workspace
- Workspace settings cockpit-like (Agentes, Projetos, Templates, Automações)

### Added — Daemon

- Bun.serve em `127.0.0.1:4800` com SQLite WAL em `~/.cockpit/data/cockpit.db`
- Migrations versionadas (v1 base, v2 sessions com action/model/chunks, v3 updated_at)
- `agent-executor` com registry `KNOWN_AGENTS` (claude-code/opencode/gemini-cli/aider)
- Parser stateful do `stream-json` do claude-code (`pendingTools` + `sawStreamEvent`)
- `normalizeModelForCli()` mapeia IDs longos (`claude-sonnet-4-6`) → tier names (`sonnet`/`opus`/`haiku`)
- `--permission-mode bypassPermissions` no claude-code headless (Read/Edit não bloqueiam mais silenciosamente)
- SSE real (`session-broker` pub/sub) — chunks ao vivo durante e após reload
- Heartbeat anti-buffering (`: hb\n\n` a cada 1.5s) + `retry: 60000` + `X-Accel-Buffering: no`
- Reaper de sessions órfãs (boot cleanup + interval a cada 5min, threshold 30min sem update)
- Auto-PR via `gh` quando projeto vinculado tem `auto_pr: true`

### Added — CLI `cockpit`

- Bun standalone, zero deps, instalado via `bin/install-cli.sh` (`~/.local/bin/cockpit` + `ck`)
- 4 tiers de comandos:
  - **Tier 1 — read**: `status`, `doctor`, `ws`, `board`, `card list/show`, `metrics`, `agent list`
  - **Tier 2 — write**: `card new/edit/move/delete`, `ws new/delete`, `init`, `agent test`
  - **Tier 3 — long-running**: `implement --watch`, `watch`, `log`, `ai` (REPL)
  - **Tier 4 — misc**: `search`, `spec show/gen/edit/ready/reset/save-vault`
- **`cockpit watch --all`**: multiplex SSE de todas sessions running em uma timeline cronológica única (label por card colorido `[#SW79·spec]`, 6 cores rotativas)
- **`cockpit alarm <id>` / `--all`**: notify nativo do OS quando session terminar. macOS via `osascript` (zero deps, sons configuráveis), Linux via `notify-send`, Windows fallback bell.
- ANSI cockpit-style (boxes, dividers, sections, mono LEDs) — `cli/src/ui/`
- `ai <id>` REPL com contexto card+projeto carregado em system prompt
- `implement --watch` faz tail live no terminal (mesmo SSE da Web)
- `spec gen --watch` mostra live transmission no terminal

### Added — MCP server

- `cockpit-mcp` registra Cockpit como MCP server em `~/.claude.json`
- 10 tools: `cockpit_health`, `cockpit_list_workspaces`, `cockpit_list_cards`, `cockpit_show_card`, `cockpit_create_card`, `cockpit_move_card`, `cockpit_search`, `cockpit_metrics`, `cockpit_implement_async`, `cockpit_get_session`
- Endpoint `POST /agents/implement/async` (fire-and-forget) retorna `sessionId` imediatamente; `runImplementation` continua em background. Permite Claude Code disparar implementação e acompanhar via `cockpit_get_session`.
- 2 resources: `cockpit://card/<id>` (markdown completo), `cockpit://board/<workspace>` (kanban texto)
- Stdio JSON-RPC 2.0 via `@modelcontextprotocol/sdk`
- Logs em stderr (stdout reservado pra protocolo)
- Instalador `bin/install-mcp.sh` faz backup do `~/.claude.json` antes de patchear

### Added — Daemon lifecycle

- `cockpit daemon install/start/stop/restart/uninstall/status/logs`
- launchd plist em `~/Library/LaunchAgents/dev.cockpit.daemon.plist`
- `KeepAlive: true` + `ThrottleInterval: 10` — respawn automático em ≤10s se crashar
- `RunAtLoad: true` + `load -w` — auto-start em todo login
- Logs em `~/.cockpit/logs/{daemon,daemon.err}.log`
- Em Linux/Windows: comando avisa e direciona pra systemd/Task Scheduler

### Fixed

- **Request storm**: `lastPersistedContent` dedup no daemon-storage adapter + `subscribedSessions` Set + retry directive elimina re-conexões em loop
- **IPv4/IPv6 mismatch**: `hostname: '127.0.0.1'` explícito no `Bun.serve` resolve `/health` intermitente
- **Stale sessions no DB**: boot cleanup + reaper periódico
- **Stream-json duplicando texto**: parser stateful ignora eventos `assistant` quando `stream_event` já foi visto
- **Tool inputs vazios `{}`**: acumular `input_json_delta` em `pendingTools` Map até `content_block_stop`
- **Phase divider duplicado**: side-effect movido pra fora do callback de `setState` (StrictMode)
- **History restoration vazio**: `reconstructTerminalLines()` heurística reclassifica chunks ao reabrir
- **`#SW78` quebrando no zsh**: removido `#` dos exemplos (`interactive_comments` engole o argumento)
- **Spec UI inconsistente**: `resetToReady` consistente em todos os fluxos (abort/erro/rejeitar/limpar)
- **claude-code Read/Edit bloqueado**: `--permission-mode bypassPermissions` em modo headless
- **Bun stdin FileSink**: `proc.stdin.write()` + `.end()` (não tem `getWriter()`)

### Architecture

- Single-user, GitHub-only (`gh` CLI), terminal-first
- 3 interfaces (Web/CLI/MCP) compartilham 100% do estado via daemon
- Estado em `~/.cockpit/data/` (SQLite + secrets), tasks em `~/.cockpit/tasks/<ws>/<card>/`
- Cópia para projeto em `<projeto>/.cockpit/task/` (criada por `task-workspace.ts:copyToProject`, gitignore automático)
- Stack: Bun runtime, React 19, Vite 8, Zustand, Tailwind, shadcn/ui, SQLite WAL, `@modelcontextprotocol/sdk`

### Known limitations

- Single-user (sem auth no roadmap)
- macOS-first para serviço (Linux/Windows manuais via systemd/Task Scheduler)
- MCP `cockpit_implement_async` é fire-and-forget (Claude Code UI não streama chunks live; use `cockpit watch` no terminal pra acompanhar)
- Sem TUI fullscreen (`cockpit tui` planejado)

[0.2.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.2.0
[0.1.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.1.0
