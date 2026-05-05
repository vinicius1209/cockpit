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
- [x] `cockpit card list [--ws] [--type] [--priority] [--status] [--json]`
- [x] `cockpit card show <#id>` — ficha completa do card
- [x] `cockpit help [cmd]` — ajuda
- [x] Flags globais: `--json`, `--help`, `NO_COLOR=1`, `COCKPIT_DAEMON_URL`

## ✅ Tier 2 — Write commands (entregue)

- [x] `cockpit card new "<title>" [--type] [--prio] [--ws] [--col] [--desc]`
- [x] `cockpit card move <#id> <column-slug>`
- [x] `cockpit card edit <#id> [--title] [--type] [--priority] [--assignee] [--due]`
- [x] `cockpit card delete <#id> [--force]`
- [x] `cockpit ws new "<name>" [--color] [--desc]`
- [x] `cockpit ws delete <name> [--force]`

## ✅ Tier 3 — Long-running (entregue)

- [x] `cockpit implement <#id> [--watch] [--feedback "..."] [--no-pr]` — SSE com phase headers, tool calls, live preview
- [x] `cockpit watch <#id> [--action ...]` — tail live de session via SSE broker
- [x] `cockpit log <#id> [--last N] [--json]` — histórico de sessions com tabela
- [x] `cockpit ai <#id>` — REPL de chat com card+projeto como contexto + slash commands

## ✅ Tier 4 — Misc (entregue)

- [x] `cockpit metrics [--json]` — KPIs + sparklines + bars + per-workspace + velocity
- [x] `cockpit agent list [--json]` — tabela de CLI agents detectados
- [x] `cockpit agent test <name> [--prompt "..."]` — hello-world com latência
- [x] `cockpit init [--ws] [--name]` — bootstrap .cockpit/config.json no cwd via /projects/sync-config
- [x] `cockpit search "<q>" [--in cards|specs] [--limit N] [--json]` — substring com excerpt + highlight

---

## 🚧 Tier 2.5 — Comandos pendentes

### Spec lifecycle

- [ ] `cockpit spec show <#id>` — imprime spec completa em markdown
- [ ] `cockpit spec gen <#id> [--watch]` — dispara geração via daemon
- [ ] `cockpit spec edit <#id>` — abre `$EDITOR`
- [ ] `cockpit spec ready <#id>` — marca como pronta (draft → ready)
- [ ] `cockpit spec reset <#id>` — limpa spec
- [ ] `cockpit spec save-vault <#id>` — salva no Docs Vault

### Card extras

- [ ] `cockpit card label add <#id> <label-name>` / `label rm <#id> <label>`
- [ ] `cockpit card edit <#id>` (sem flags) → abre `$EDITOR` com markdown completo (description + meta YAML top)
- [ ] `cockpit card link <#id-A> <#id-B>` — referencia cross-card

### Workspace extras

- [ ] `cockpit ws rename <old> <new>`
- [ ] `cockpit ws color <name> <#hex>`
- [ ] `cockpit ws export <name> > workspace.json` — backup/share

### Discovery

- [ ] `cockpit discover [--project <name>] [--agent claude-code] [--watch]`
  - Dispara scan, lista findings com #ID curto, permite `import <#X>`
- [ ] `cockpit discover history` — últimos jobs

### Project / hooks

- [ ] `cockpit project list [--ws]` — projetos vinculados
- [ ] `cockpit project link <path>` — vincula projeto ao workspace ativo
- [ ] `cockpit hook add <event> <command>` — registra script para `before_implement`, `after_pr`, etc.
- [ ] `cockpit hook list/rm`

### Output formats

- [ ] `--json` em todos os comandos (parcialmente: ws/card list/log/agent list/metrics/search)
- [ ] `--quiet/-q` flag pra modo CI (sem cores, sem banners)
- [ ] `--watch N` polling pra `card list`/`board` (atualiza a cada N segundos)

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

Tiers 1-4 entregues.

**Próximas ondas:**

1. **Tier 2.5 — spec lifecycle** (1 dia) — completa o loop de criação
2. **Tier 5 — TUI fullscreen** (3-4 dias) — modo `cockpit tui` aplicação interativa
3. **Tier 5 — Warp workflows export** (1 dia) — gera YAML por card
4. **Tier 5 — Discovery commands** (1 dia)
5. **Cleanup técnico** — bin compilada, autocompletion zsh/bash, tests

---

## 🧪 Como usar agora

```bash
# Já está no PATH via symlink
cockpit                                    # status global
cockpit help                               # menu completo
cockpit doctor                             # health check
cockpit ws use portfolio                   # set workspace
cockpit board                              # ascii kanban
cockpit card new "Fix login" --type bugfix --prio high
cockpit card show SW79
cockpit card move SW79 ready
cockpit implement SW79 --watch             # tail no terminal
cockpit watch SW79                         # acompanha session em curso
cockpit log SW79                           # histórico de attempts
cockpit ai SW79                            # REPL de chat
cockpit metrics                            # dashboards ASCII
cockpit search "mentoria" --limit 5
cockpit init                               # bootstrap .cockpit/config.json no cwd
cockpit agent test claude-code             # ping
```
