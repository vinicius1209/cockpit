# Changelog

Todas as mudanças notáveis do Cockpit. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [Semantic Versioning](https://semver.org/lang/pt-BR/).

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

[0.1.0]: https://github.com/anthropics/cockpit/releases/tag/v0.1.0
