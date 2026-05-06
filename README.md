# Cockpit

> Cabine de comando pra orquestrar code agents (Claude Code, OpenCode, Gemini CLI, Aider) em workspaces multi-projeto.

```
▰▰▰▰▰  COCKPIT v0.5.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━ ACTIVE WORKSPACE
  Portfolio #portfolio
  cards   001 · 0 wip · 1 review · 0 done
  proj    1 vinculado

━ LIVE RUNS (1)
  ● #SW78 IMPLEMENTANDO · T+02:34 · claude-code
        Fazer o meu portfolio ser mais parecido com landing page…
```

## Por que existe?

Você já tem `claude-code`, `gh`, `opencode`, e 5 projetos abertos. Falta uma **camada acima orquestrando**:

- Um lugar pra ver **status global** de todos os projetos
- Pipeline estruturado: **card → entrevista → spec → implementar → PR**
- **Multi-agent** com config por workspace
- **Métricas** cross-projeto: lead time, taxa de sucesso, agente mais barato
- **Histórico estruturado** de cada implementação (não só logs perdidos)

## 3 modos de uso

### 🖥 Web UI · port 5173
```bash
bun run dev                     # frontend
bun run dev:daemon              # daemon (terminal separado)
open http://127.0.0.1:5173
```
Kanban visual, board drag-and-drop, dashboard de métricas, AI Chat com contexto. Ideal pra exploração e visão geral.

### ⌨ CLI `cockpit` · terminal-first
```bash
bun run cli:install             # symlink em ~/.local/bin/cockpit
cockpit                         # status global
cockpit tui                     # 🆕 TUI fullscreen (kanban interativo)
cockpit board                   # ASCII kanban (one-shot)
cockpit implement SW78 --watch  # implementa + tail no terminal
cockpit implement SW78 --isolation worktree  # 🆕 paralelismo real no mesmo projeto
cockpit ai SW78                 # REPL de chat com card+projeto como contexto
```
Ideal pra power-user que vive no terminal (Warp/iTerm/etc). [Ver `cli/README.md`](./cli/README.md).

### 🔌 MCP Server
Cockpit é um MCP server. Claude Code (e qualquer cliente compatível) controla via tools:

```bash
bun run mcp:install                # registra em ~/.claude.json
# reinicia sessão do Claude Code
```

```
[Você @ Claude Code] "liste meus workspaces e bugs críticos abertos"
[Claude] → cockpit_list_workspaces + cockpit_list_cards(priority='critical')
[Você] "crie um card pra refatorar o login"
[Claude] → cockpit_create_card(title='...', type='chore') → ✓ #SW82
```

Tools expostas (19): `cockpit_health`, `cockpit_list_workspaces`, `cockpit_list_cards`, `cockpit_show_card`, `cockpit_create_card`, `cockpit_edit_card`, `cockpit_move_card`, `cockpit_archive_card`, `cockpit_unarchive_card`, `cockpit_search`, `cockpit_metrics`, `cockpit_set_active_workspace`, `cockpit_create_workspace`, `cockpit_list_projects`, `cockpit_link_project`, `cockpit_set_card_project`, `cockpit_implement_async`, `cockpit_get_session`, `cockpit_abort_session`. Resources: `cockpit://card/<id>`, `cockpit://board/<workspace>`.

## Quickstart

```bash
# 1. Clone + deps do frontend
git clone <repo> cockpit && cd cockpit
bun install

# 2. Daemon (Bun + SQLite)
cd daemon && bun install && bun run dev   # roda em 127.0.0.1:4800

# 3. Frontend (em outro terminal)
bun run dev                                # roda em 127.0.0.1:5173

# 4. CLI (opcional, recomendado)
bun run cli:install                        # symlinka `cockpit` em ~/.local/bin
cockpit doctor                             # verifica daemon + agents instalados

# 5. Daemon como serviço (macOS, opcional)
cockpit daemon install                     # auto-start no login via launchd
cockpit daemon status                      # checa estado
```

Pré-requisitos:
- [Bun](https://bun.sh) ≥ 1.0
- Pelo menos um CLI agent: [Claude Code](https://claude.com/code) (recomendado), OpenCode, Gemini CLI, ou Aider
- (opcional) [`gh`](https://cli.github.com) autenticado, pra auto-PR

## Arquitetura

```
┌─ Web UI ──────────┐    ┌─ CLI cockpit ──┐
│ React + Vite      │    │ Bun standalone │
│ Zustand + persist │    │ ANSI + boxes   │
└────────┬──────────┘    └────────┬───────┘
         │                        │
         └──────── HTTP ──────────┘
                  │
                  ▼
         ┌─ Daemon ────────────────┐
         │ Bun.serve + SQLite WAL  │
         │ session-broker (SSE)    │
         │ reaper de sessions      │
         │ executor de CLI agents  │
         └────────┬────────────────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
   claude-code   opencode  gemini-cli
                                  │
                                  ▼
                          ┌─ API providers ─┐
                          │ Anthropic       │
                          │ OpenAI          │
                          │ Google Gemini   │
                          └─────────────────┘
```

Todos os dados em `~/.cockpit/data/cockpit.db` (SQLite). Sessions de execução com chunks streamados, reaper de órfãs a cada 5min.

[Detalhes técnicos em CLAUDE.md](./CLAUDE.md) · [Persistência por projeto em config.json (N7)](./CLAUDE.md#persistência-importante-para-llms)

## Estrutura do repo

```
cockpit/
├── src/                     # Frontend React (Vite, port 5173)
├── daemon/                  # Backend Bun + SQLite (port 4800)
│   ├── src/routes/          # HTTP API (cards, agents, sessions, ...)
│   ├── src/executor/        # spawn de CLI agents
│   ├── src/tasks/           # session-manager + broker SSE
│   └── src/persistence/     # SQLite + migrations
├── cli/                     # CLI cockpit (Bun standalone)
│   ├── src/commands/        # comandos: doctor, ws, board, card, spec, ...
│   ├── src/api/             # client HTTP do daemon
│   └── src/ui/              # box, table, kanban, banner (zero deps)
├── mcp/                     # Cockpit como MCP server (Claude Code)
│   └── src/                 # tools: list_cards, show_card, create_card, ...
├── bin/                     # scripts: install-cli.sh, install-mcp.sh
├── CLAUDE.md                # design system + arquitetura
├── AGENTS.md                # ponto de entrada pra LLMs
├── TODO_CLI.md              # roadmap do CLI
└── TODO_HUMAN_LLM.md        # backlog tecnico geral
```

## Comandos principais do CLI

| Comando | O que faz |
|---|---|
| `cockpit` | status overview global |
| `cockpit doctor` | health check (daemon, agents, projetos, gh) |
| `cockpit tui` | TUI fullscreen — kanban interativo + sessions live |
| `cockpit board` | ASCII kanban (one-shot) |
| `cockpit card list` | lista cards filtraveis |
| `cockpit card new "Title" --type bugfix --prio high` | cria card |
| `cockpit spec gen SW78 --watch` | gera spec via AI |
| `cockpit spec ready SW78` | aprova spec (draft → ready) |
| `cockpit implement SW78 --watch` | implementa + tail live no terminal |
| `cockpit watch SW78` | tail de qualquer session em curso |
| `cockpit log SW78` | histórico de tentativas |
| `cockpit ai SW78` | REPL de chat com card+projeto como contexto |
| `cockpit metrics` | KPIs + sparklines + velocity |
| `cockpit search "query"` | busca em cards/specs |
| `cockpit init` | bootstrap `.cockpit/config.json` no projeto atual |

[Cheatsheet completa em `cli/README.md`](./cli/README.md).

## Workflows reais

```bash
# Triagem matinal — ver tudo de relance
cockpit
cockpit board

# Criar card de bug rapidamente
cockpit card new "Login redirect quebra após OAuth" --type bugfix --prio high
# → ✓ #SW79 criado em Portfolio/inbox

# Discutir com AI antes de definir spec
cockpit ai SW79
# (REPL com contexto do card + projeto)

# Gerar spec automaticamente
cockpit spec gen SW79 --watch
cockpit spec edit SW79     # ajustes manuais
cockpit spec ready SW79    # aprova

# Implementar acompanhando live no terminal
cockpit implement SW79 --watch
# Phase headers, tool uses, output do agent ao vivo

# Multi-card paralelo — modo padrão (lock) bloqueia 2x mesmo projeto
cockpit implement SW79  &           # primeiro
cockpit implement SW80              # → 409 PROJECT LOCKED, mostra opções

# Multi-card paralelo — modo worktree (isolamento real)
cockpit implement SW79 --isolation worktree --watch &
cockpit implement SW80 --isolation worktree --watch
# Cada um em <project>.cockpit-worktrees/<sessionId>/

# Re-implementar com feedback se não resolveu
cockpit implement SW79 --feedback "PDF ainda corta na direita em A4 portrait" --watch

# Descartar card (preserva spec + sessions, some do board)
cockpit card archive SW82
cockpit card unarchive SW82  # reativa

# Ver métricas globais
cockpit metrics

# Ou navegar tudo isso num TUI fullscreen
cockpit tui
```

## Status do projeto

| Componente | Status |
|---|---|
| **Web UI** com pipeline completa | ✅ |
| **Daemon** + SQLite + sessions persistidas | ✅ |
| **Streaming SSE real** (live durante e após reload) | ✅ |
| **Multi-agent** (claude-code, opencode, gemini, aider) | ✅ |
| **CLI Tier 1-4** (read, write, long-running, misc) | ✅ |
| **`cockpit spec` lifecycle** | ✅ |
| **MCP server** (19 tools + 2 resources, bootstrap completo via chat: `create_workspace` / `link_project` / `set_card_project`) | ✅ |
| **Web UI Command Palette** (⌘K + atalhos `g d/g a/g b`) | ✅ |
| **PR status sync** (badge live no card detail e Live Agents) | ✅ |
| **First-run wizard** (4-step guiado pra primeiro uso) | ✅ |
| **Empty states** + tooltips em jargão técnico (InfoHint) | ✅ |
| **Tests** — 175 tests no total (24 frontend + 79 daemon + 70 cli + 22 mcp) | ✅ |
| **Daemon como serviço** (launchd auto-start no macOS) | ✅ |
| **TUI fullscreen** (`cockpit tui` — board + sessions + actions: implement/archive/abort) | ✅ |
| **Multi-session orchestration** (project lock + `--isolation worktree` opt-in) | ✅ |
| **Live Agents Panel** (Web UI cross-workspace + file heatmap de conflitos) | ✅ |
| **Archive de cards** (Descartar separado de Excluir) | ✅ |
| **Doctor `--fix`** (auto-corrige locks órfãos, sessions zumbis) | ✅ |
| **Auth multi-user** | ❌ não está no roadmap (single-user OSS) |

## Documentação adicional

- [`CLAUDE.md`](./CLAUDE.md) — design system COCKPIT, arquitetura, comandos de dev
- [`AGENTS.md`](./AGENTS.md) — ponto de entrada pra LLMs trabalhando no repo
- [`cli/README.md`](./cli/README.md) — cheatsheet do CLI
- [`mcp/README.md`](./mcp/README.md) — tools/resources do MCP server
- [`DOGFOOD.md`](./DOGFOOD.md) — checklist de validação real (10 cenários)
- [`CHANGELOG.md`](./CHANGELOG.md) — mudanças por versão
- [`TODO_CLI.md`](./TODO_CLI.md) — roadmap do CLI
- [`TODO_HUMAN_LLM.md`](./TODO_HUMAN_LLM.md) — backlog técnico (inclui F9 multi-session research direction)

## Licença

[MIT](./LICENSE) © 2026 Vinicius Machado

---

Built with [Bun](https://bun.sh), [React](https://react.dev), [Tailwind](https://tailwindcss.com), [SQLite](https://sqlite.org), [shadcn/ui](https://ui.shadcn.com).
