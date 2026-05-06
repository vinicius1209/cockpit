# Changelog

Todas as mudanças notáveis do Cockpit. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [0.6.0] — 2026-05-06

Foco: **fechar o ciclo MCP** (spec gen via chat) + **extensibilidade via hooks** + **mobile responsive**. Cockpit agora roda end-to-end pelo Claude Code e pode ser usado do celular.

### Added — `cockpit_spec_gen_async` (MCP Tier 5)

Última peça do MCP: agora gerar spec técnica é via chat, sem Web UI. Total: 20 tools.

```
[Você] "transforme SW79 em spec"
[Claude] → cockpit_spec_gen_async(card_id="SW79")
         ✓ session sess_xyz iniciada
[Você] "como tá?"
[Claude] → cockpit_get_session  →  phase=done
[Você] "mostra a spec"
[Claude] → cockpit_show_card  →  spec_content já populado
```

Daemon: `daemon/src/spec/spec-runner.ts` com `startSpecGenAsync` fire-and-forget. Carrega card do `kv_stores`, monta prompt (system DEFAULT_SYSTEM_PROMPT + contexto card), spawna agent CLI com cwd=projectPath (Read/Glob real do código). Persiste chunks incrementais. Ao completar: salva `card.spec_content` + `spec_status='draft'` direto no DB.

Endpoint: `POST /agents/spec/async`. Aborto via `cockpit_abort_session` reaproveitado.

### Added — Hooks (`before_implement`, `after_implement`, `after_pr`)

Power users plugam shell scripts em momentos chave do ciclo de implementação. Padrão git-hooks.

- **`before_implement`** (gate): exit != 0 ABORTA. Use pra `bun run lint`, schema check, etc
- **`after_implement`**: informativo, antes do PR. Use pra rodar testes, métricas, etc
- **`after_pr`**: depois do PR criado. Use pra Slack notify, deploy preview, etc

Daemon (`daemon/src/hooks/hook-runner.ts`): executa em `/bin/sh -c <script>` com env vars (`COCKPIT_CARD_ID`, `SESSION_ID`, `BRANCH`, `PROJECT_PATH`, `AGENT`, `PR_URL`, `PR_NUMBER`, `SUMMARY`). Timeout 60s. Stdout aparece no live tail.

UI: nova tab "Hooks" em workspace settings com:
- Banner amber de aviso de segurança ("rodam com permissões do daemon")
- Cada hook tem card com label + GATE badge (se blocking) + textarea mono + lista expansível de env vars disponíveis

### Added — Mobile responsive Web UI

Triagem do celular vira viável.

- **Board**: `BoardColumn` `w-72` → `w-[85vw] sm:w-72`. `snap-x snap-mandatory` no container, `snap-center` na coluna → swipe natural alinhado. Hint "swipe ← →" visível em mobile com 2+ colunas
- **Card dialog**: full-screen no mobile (`h-[100dvh] sm:h-[88vh]` + `rounded-none sm:rounded-lg`)
- **Card detail**: sidebar direita (`w-52 + border-l`) vira bottom-stack com `border-t` em mobile
- **Live Agents**: heatmap empilha embaixo das lanes em mobile. Lane header com `flex-wrap`
- **Header**: workspace name truncado em mobile, botão `⌘K` já era `hidden md:flex`

Sidebar e Toaster já tinham comportamento mobile via shadcn (sidebar vira drawer < md).

### Changed

- Daemon `/health` reporta `version: 0.6.0`
- CLI banner / MCP server identifier sincronizados
- `session-manager.updateSession` aceita `action` + `chunks` (eram só `ImplementSession`-fields). Sempre atualiza `updated_at` (reaper sabe que há atividade)

## [0.5.0] — 2026-05-06

Foco: **qualidade interna** (cobertura inicial de tests) + **UX pra usuário não 100% técnico** (first-run wizard, empty states, tooltips em jargão).

### Added — Cobertura inicial de tests (92 tests, 0 falhas)

CLI/TUI (`cli/src/__tests__/`, 70 tests):
- **`tui-keys.test.ts`**: parser stdin raw — letras, ctrl+letra, alt+letra, enter/tab/backspace/space/escape, setas (CSI), home/end/pgup/pgdn/del, F1-F12 (xterm legacy + tilde), paste com várias keys, robustez (chunk vazio, escape incompleto, CSI desconhecido, diacríticos)
- **`tui-layout.test.ts`**: clip preservando ANSI, padRight/padLeft/center, joinCols com gap configurável, box com título
- **`resolve.test.ts`**: shortId, resolveCard (id/short/com#/lower/prefix/ambíguo/vazio), resolveWorkspace (slug/nome/id/case-insensitive)

MCP (`mcp/src/__tests__/`, 22 tests):
- **`api.test.ts`**: shortId, resolveCard, resolveWorkspace, newCardId, ProjectLockedError (path+heldBy+hints, instance check, defaults)
- **`daemon-post.test.ts`**: integration test com `Bun.serve` fake — 409 vira ProjectLockedError preservando held_by, 500/404 viram Error genérico

Refactor pra permitir testar:
- `mcp/src/api.ts`: `getDaemonUrl()` lazy (era const capturada no load)
- `mcp/src/index.ts`: `daemonHint()` lazy (mesmo motivo)

Scripts: `bun run test` em CLI e MCP (além dos já existentes em daemon e frontend).

Cobertura intencional: regressão do bug TUI raw mode (`\n` staircase) seria pega pelo parser/layout. Detecta também regressão em parsing 409 → MCP deixar de surface PROJECT_LOCKED corretamente pro Claude Code.

### Added — First-run wizard (Web UI)

Pra usuário não 100% técnico que abre Cockpit pela primeira vez. Dialog 4-step:

1. **Welcome** — tour rápido (workspace/projeto/card explicados como tiles)
2. **Workspace** — nome + descrição + slug auto-derivado preview
3. **Projeto** — path absoluto, opcional (pode pular e adicionar depois)
4. **Card** — título + descrição opcional → "Boarding completo" com hint pra Spec → "Gerar com AI"

UX: pula step "workspace" se já há workspaces, "pular tutorial" sempre visível, slug renderiza em real-time, caixinhas explicando o modelo.

`useFirstRun` hook dispara wizard auto quando `totalCards === 0` E nunca viu o tutorial (localStorage). `showAgain()` pra reabrir manualmente no futuro.

### Added — Empty state Dashboard

Quando `totalCards === 0`, banner com CTA grande (3 botões: "Novo card em X", "⌘K abrir busca", "Configurar daemon / agents") + hint do uso via Claude Code com exemplo de prompt MCP. Some assim que primeiro card é criado.

### Added — InfoHint (`<InfoHint>`)

Componente reutilizável: info icon (i) com tooltip de 1 linha + detail opcional. Aplicado em 3 lugares de alta confusão:

- **Card detail → Spec status**: explica `draft / ready / in_progress / review / done`
- **Workspace settings → Auto PR**: explica `gh CLI`, draft mode, quando desligar
- **Live Agents → CONFLICT badge**: explica conflito de arquivo + sugere `--isolation worktree` com tradeoffs

`TelemetryRow` ganha prop opcional `hint` pra reaproveitar no futuro.

### Changed

- Daemon `/health` reporta `version: 0.5.0`
- CLI banner / MCP server identifier sincronizados

## [0.4.0] — 2026-05-05

Foco: **bootstrap completo via Claude Code**, **navegação ⌘K na Web**, **PR status ao vivo no card**. Cockpit fecha o loop "ideia → spec → implement → PR" sem precisar trocar de ferramenta.

### Added — MCP Tier 4 (19 tools no total)

4 tools novas que cobrem 100% do bootstrap via chat:

- **`cockpit_create_workspace`**: cria workspace novo (name, slug auto-derivado, description, color). Dedup por slug. Retorna `next_steps` pra guiar o LLM
- **`cockpit_list_projects`**: lista projetos vinculados (filtrável por workspace) — útil pro LLM saber `project_id` antes de `set_card_project`
- **`cockpit_link_project`**: vincula diretório local como projeto. Valida path existe + é diretório. Aceita `auto_pr`. Default workspace = ativo (cli.json) ou primeiro
- **`cockpit_set_card_project`**: atribui projeto específico a card. Valida workspace match. `project_id=""` desvincula

```
[Você] "cria workspace 'Cliente XPTO', vincula meu repo /Users/x/foo,
        e cria card pra implementar OAuth"
[Claude] → 4 tools sequenciais. Bootstrap zero-friction, zero Web UI.
```

### Added — Web UI Command Palette (⌘K)

cmdk-based palette global. Abre com **⌘K** (Mac) / **Ctrl+K** (Win/Linux). Atalhos sequenciais estilo Vim sem modifiers, fora de input:

- `g d` → Dashboard, `g a` → Live Agents, `g b` → Board, `g m` → Métricas, `g s` → Settings

Conteúdo:
- Cards do workspace ativo (top 12 por updated_at) — uso mais comum no topo
- Cards cross-workspace aparecem só com search digitado
- Workspaces (todos, marca o ativo)
- Ações: Novo card, Ver descartados
- Navegar com shortcuts visíveis em mono à direita

UX: AppHeader ganha botão `buscar / ir para [⌘K]` (descobribilidade pra novato). `workspace.tsx` + `board-view.tsx` escutam `?cardId=...` / `?new=1` / `?archived=1` pra abrir card / criar / mostrar archived direto. Live Agents links agora funcionam end-to-end.

### Added — PR status sync (gh integration)

Loop card → PR fechado dentro do Cockpit.

- Daemon: `GET /git/pr-status?url=<prUrl>` roda `gh pr view --json state,isDraft,mergedAt,...`. Cache 30s in-memory.
- Schema: `Card.pr_url: string | null` (Web/CLI/MCP). `updateCardPrUrl` no daemon escreve direto no `kv_stores` quando PR é criado pelo `runImplementation`
- UI: `<PrStatusBadge>` com modos compact (Live Agents lane) e full (card detail). Estados `DRAFT/OPEN/MERGED/CLOSED` com cores semânticas (amber/emerald/violet/rose). Refresh 60s. Fallback gracioso quando gh offline ou repo privado
- Card detail ganha bloco "PULL REQUEST" quando há `pr_url` setado

### Fixed

- Daemon `/health` reporta `version: 0.4.0`
- CLI banner / MCP server identifier sincronizados

### Migration

Sem mudança breaking de schema (campo `pr_url` é opcional, default null em cards existentes).

## [0.3.0] — 2026-05-05

Foco: **observabilidade cross-workspace**, **controle pelo Claude Code via MCP**, **TUI deixa de ser viewer e vira controlador**, **doctor com auto-fix**.

### Fixed — TUI rendering em raw mode

Em raw mode terminal, `\n` faz line feed mas NÃO carriage return — produzia escada/sobreposição. `Engine.draw()` agora usa `moveTo + clearLine` por linha em vez de juntar com `\n`. Também limpa linhas residuais quando o frame encolhe e parqueia o cursor no canto direito ao final pra evitar piscar no meio do conteúdo.

### Added — Live Agents Panel (Web UI)

Nova rota `/live-agents` na sidebar (`LIV`). Visão cross-workspace de TODAS as sessions em tempo real:

- Cada lane: header com link pro card + agent + phase + elapsed (atualiza por segundo); tail das últimas 8 chunks live; banner de erro; chips de arquivos tocados pelo agent
- File heatmap sticky à direita: top 10 arquivos tocados, marca `CONFLICT` em vermelho quando 2+ sessions tocam o mesmo path simultâneo (= use `--isolation worktree`)
- SSE EventSource per-session, reconcile a cada 5s pra detectar sessions novas que apareceram entre updates
- Botão "limpar" remove finished do panel sem afetar histórico no DB

### Added — MCP Tier 3 (15 tools no total)

- **`cockpit_edit_card`**: patch de campos (título/tipo/prioridade/descrição/assignee/due_date) sem precisar abrir Web UI
- **`cockpit_set_active_workspace`**: muda o workspace ativo compartilhado entre CLI e MCP (escreve `~/.cockpit/cli.json`)
- **`cockpit_abort_session`**: aborta uma session em curso (mata o processo do agent, marca phase=error, libera lock, limpa worktree). Idempotente.

Daemon: novo endpoint `POST /agents/sessions/<id>/abort`. `executeAgentWithCallbacks` aceita `AbortSignal` opcional. `runImplementation` registra abort via `registerSessionAbort(sessionId, fn)`.

### Added — TUI vira controlador

Card screen ganha actions:
- **`i`** = implementar (lock mode)
- **`I`** (Shift+I) = implementar com `--isolation worktree`
- **`s`** = spec gen (placeholder com hint pro `cockpit spec gen`)
- **`a`** = archive/unarchive (existia, ganhou flash de feedback)
- **`x`** = abortar session ativa
- Flash banner inline: feedback colorido em emerald/amber/rose por 3s
- Tick periódico atualiza sessions ativas

Sessions screen ganha **`x`** = abortar selecionada.

### Added — `cockpit doctor --fix`

Detecta + corrige issues comuns:

- Locks órfãos (sessions já terminaram mas lock ficou) → `reapOrphanLocks`
- Sessions zumbis (>30min sem update) → `reapStaleSessions`
- Projetos com path inexistente (sem auto-fix — usuário decide reescrever ou desvincular)
- `cockpit` não no PATH (sem auto-fix — mexer em rc não deve ser auto)

Daemon: novo módulo `daemon/src/routes/maintenance.ts` com:
- `GET /maintenance/locks` — lista locks marcando órfãos (`active: false`)
- `POST /maintenance/reap-locks`
- `GET /maintenance/zombie-sessions?staleAfterMin=N` — preview
- `POST /maintenance/reap-sessions`

Sem `--fix`, doctor lista issues e sugere `cockpit doctor --fix`.

### Changed

- Daemon `/health` reporta `version: 0.3.0`
- CLI banner mostra `v0.3.0`
- MCP server identifica como `cockpit/0.3.0`
- README / CLAUDE.md / cli/README.md / mcp/README.md atualizados

### Migration

Sem mudança breaking de schema. Sessions e locks da v0.2.0 funcionam normalmente.

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

[0.6.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.6.0
[0.5.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.5.0
[0.4.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.4.0
[0.3.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.3.0
[0.2.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.2.0
[0.1.0]: https://github.com/vinicius1209/cockpit/releases/tag/v0.1.0
