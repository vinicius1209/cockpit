# Cockpit CLI — Roadmap

Posicionamento: o CLI **orquestra** workspaces, cards e agents — não compete com Claude Code/gh.
Foca em centralização e automação que o web UI não dá agilidade.

Distribuição atual: symlink em `~/.local/bin/cockpit` apontando pro `cli/src/index.ts`.
Distribuição futura: `bun build --compile --outfile=dist/cockpit` produz binário standalone.

---

## ✅ Tier 1 — Read-only (entregue)

- [x] `cockpit` — status overview global (active ws, live runs, other ws)
- [x] `cockpit doctor` — health check (daemon, agents CLI, workspaces, projetos, gh)
- [x] `cockpit ws` — lista workspaces com contadores
- [x] `cockpit ws use <name>` — set workspace ativo (CLI state)
- [x] `cockpit ws info [name]` — detalhes do workspace
- [x] `cockpit board [ws]` — ASCII kanban
- [x] `cockpit card list [--ws] [--type] [--priority] [--status] [--json]` — lista cards
- [x] `cockpit card show <#id>` — ficha completa do card
- [x] `cockpit help [cmd]` — ajuda
- [x] Flags globais: `--json`, `--help`, `NO_COLOR=1`, `COCKPIT_DAEMON_URL`

---

## 🚧 Tier 2 — Write commands

### Card CRUD

- [ ] `cockpit card new "<title>" [--type feature] [--prio high] [--ws X] [--col inbox]`
  - Cria card direto no daemon (POST `/api/data/cards`)
  - Output: `✓ #SW79 criado em Portfolio/inbox`
  - Considerar: pipe stdin pra description longa

- [ ] `cockpit card move <id> <column-slug>`
  - Move card entre colunas. Aceita `inbox`, `discovery`, `spec`, `ready`, etc.
  - Dispara automation_engine no daemon? Ou só atualiza state? **Decisão**: por enquanto só state — automações via web pra evitar surpresas.

- [ ] `cockpit card edit <id>`
  - Abre `$EDITOR` com o markdown da descrição (e meta no top YAML)
  - Salva ao fechar
  - Útil pra bulk edit

- [ ] `cockpit card delete <id> [--force]`
  - Confirm prompt a menos que `--force`

- [ ] `cockpit card label add <id> <label-name>` / `label rm`
  - Auto-cria label se não existir

### Workspace CRUD

- [ ] `cockpit ws new <name> [--color #...] [--desc "..."]`
- [ ] `cockpit ws delete <name> --force`
- [ ] `cockpit ws rename <old> <new>`

### Spec lifecycle

- [ ] `cockpit spec show <id>` — imprime spec completa em mono no terminal (markdown rendering simples)
- [ ] `cockpit spec gen <id> [--watch]` — dispara geração via daemon
- [ ] `cockpit spec edit <id>` — abre $EDITOR
- [ ] `cockpit spec ready <id>` — marca como pronta (transição draft → ready)
- [ ] `cockpit spec reset <id>` — limpa spec (descarta)

---

## 🚧 Tier 3 — Long-running (live streams)

### Implementação

- [ ] `cockpit implement <id> [--feedback "..."] [--watch] [--no-pr]`
  - POST `/agents/implement` com SSE
  - Sem `--watch`: dispara e retorna imediato (background no daemon)
  - Com `--watch`: tail no stdout (mesmo formato visual do web terminal)
  - Output cores semânticas: `›` log cyan, `▶` tool amber, texto agent normal
  - Phase headers: `─── ANALISANDO ───`, `─── AGENT EXECUTANDO ───`
  - `--no-pr` desabilita auto-PR pra essa exec

- [ ] `cockpit watch <id>` — tail live de QUALQUER session running do card
  - Conecta ao SSE `/agents/sessions/:id/stream`
  - Mostra chunks em real-time
  - Ctrl+C → desconecta, daemon segue rodando

### History & Logs

- [ ] `cockpit log <id> [--last N] [--json]`
  - Lista sessões do card em ordem cronológica
  - Cada uma: phase, agent, duração, exit, branch
  - `--last 5` mostra detalhe das últimas 5

- [ ] `cockpit log <id> <session-id>` — output completo de uma session específica

### AI Chat (REPL)

- [ ] `cockpit ai <id>`
  - Abre REPL conectado ao AI Chat do card
  - Contexto carregado automaticamente (card + projeto)
  - Multi-line input (Esc + Enter pra enviar)
  - Histórico persistido (compartilha com web AI Chat via session)
  - `/exit`, `/clear`, `/copy` slash commands

### Discovery

- [ ] `cockpit discover [--project <name>] [--agent claude-code] [--watch]`
  - Dispara discovery scan via daemon
  - Lista findings em ASCII, cada um com ID curto pra import
  - `cockpit discover import <#X>` — vira card no inbox

---

## 🚧 Tier 4 — Misc & Power features

### Init & Onboarding

- [ ] `cockpit init [--workspace X]`
  - Bootstrap `.cockpit/` na pasta atual
  - Detect git, lê remote pro auto-PR
  - Roda `gh auth status` e `claude --version`
  - Cria `.cockpit/config.json` com agentes do workspace
  - Adiciona `.cockpit/task/` ao `.gitignore`
  - Vincula projeto ao workspace ativo

### Search

- [ ] `cockpit search "<query>" [--in cards,specs,docs]`
  - Busca textual cross-workspace
  - Resultados rankeados por relevância simples (substring count)
  - Versão semântica via embeddings vem na O2.6

### Metrics

- [ ] `cockpit metrics [--ws X] [--last 7d|30d]`
  - ASCII charts inline (sparklines)
  - KPIs: cards/dia, lead-time, taxa de sucesso de implement, tempo médio por agent
  - `--last 7d` filtra janela

### Agent

- [ ] `cockpit agent list` — lista CLIs detectados (mesmo que doctor mas standalone)
- [ ] `cockpit agent test <name> [--prompt "..."]` — hello world
- [ ] `cockpit agent set <role> <agent> [--model X]` — set agente padrão por role do workspace ativo

### Config

- [ ] `cockpit config get/set/unset <key>` — manipula `~/.cockpit/cli.json`
  - Ex: `cockpit config set defaultEditor vim`

### Output formats

- [ ] `--json` em todos os comandos (já implementado em ws/card list)
- [ ] `--quiet/-q` flag pra modo CI (sem cores, sem banners)
- [ ] `--watch` tail mode pra comandos read (atualiza a cada N segundos)

---

## 🌟 Tier 5 — Power features avançadas

### TUI mode

- [ ] `cockpit tui` — interface full-screen com painel kanban + detalhes + live logs
  - Lib: ink (React-like) ou implementar nativo com escape sequences
  - Navegação: vim-like keys (j/k pra scroll, hjkl pra mover entre painéis)
  - Watch automático de sessions ativas

### Pipes & integrations

- [ ] Stdin pipe: `cat description.md | cockpit card new "Title" --stdin-desc`
- [ ] Hooks: `cockpit hook add <event> <command>` — registra script para `before_implement`, `after_pr`, etc.

### Warp Workflows export

- [ ] `cockpit warp export-workflows [--ws X]`
  - Para cada card "ready" gera `~/.warp/workflows/cockpit-impl-<id>.yaml`
  - Workflow chama `cockpit implement <id> --watch`

### Notebook export

- [ ] `cockpit card export <id> --format notebook` — gera `.warp-notebook` executável

---

## 🛠 Cleanups técnicos

- [ ] Tests do CLI (smoke + unit dos parsers/resolvers)
- [ ] `bun build --compile` produzir binário e publicar em release GitHub
- [ ] README do CLI com gif demo
- [ ] Auto-completion: `cockpit completions zsh > ~/.zfunc/_cockpit`
- [ ] Migrar de `process.stdout.columns` pra `tput cols` quando NÃO for TTY
- [ ] `cockpit version` ou `--version` flag (hoje só no banner)

---

## 📋 Decisões em aberto

1. **CLI vs daemon coupling**: hoje CLI lê via HTTP do daemon. Alternativa: lê SQLite direto (offline-first). Mais rápido mas duplica lógica de leitura. **Decisão atual**: HTTP. Reavaliar se latência incomodar.

2. **Color theme**: hoje hardcoded ANSI 16-color. Considerar 256-color ou themes user-configurable.

3. **Output linguagem**: pt-BR vs en-US. Hoje pt-BR misturado. Quando lançar OSS, padronizar (provavelmente en-US no CLI, pt-BR no web).

4. **Persistir CLI state where**: hoje em `~/.cockpit/cli.json`. Alternativa: como entry no `cli_state` table do SQLite. Manter file pra simplicidade.

5. **`cockpit` ou `ck` como comando primário**: hoje aceita ambos (npm package bin). Documentar `ck` como atalho power-user.

---

## 🎯 Ordem sugerida pra continuar

1. **Tier 2 — `card new/edit/move`** (1 dia) — fecha o loop CRUD básico
2. **Tier 3 — `implement` + `watch`** (2 dias) — o killer feature do CLI
3. **Tier 3 — `log` + `ai`** (1 dia)
4. **Tier 4 — `init`** (1 dia) — onboarding via CLI
5. **Tier 4 — `metrics` + `search`** (1 dia)
6. **Tier 5 — TUI mode** (3-4 dias) — visão dashboard fullscreen
