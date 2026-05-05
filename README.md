# Cockpit

> Cabine de comando pra orquestrar code agents (Claude Code, OpenCode, Gemini CLI, Aider) em workspaces multi-projeto.

```
▰▰▰▰▰  COCKPIT v0.1.0
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
cockpit board                   # ASCII kanban
cockpit implement SW78 --watch  # implementa + tail no terminal
cockpit ai SW78                 # REPL de chat com card+projeto como contexto
```
Ideal pra power-user que vive no terminal (Warp/iTerm/etc). [Ver `cli/README.md`](./cli/README.md).

### 🔌 MCP Server · em breve
Cockpit vira MCP server, controla pelo Claude Code:
```
[Você no Claude Code] "implementa o card SW78 com prioridade alta"
[Claude Code → MCP cockpit.implement(id='SW78') → SSE → live no chat]
```

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
├── bin/                     # scripts: install-cli.sh
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
| `cockpit board` | ASCII kanban |
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

# Re-implementar com feedback se não resolveu
cockpit implement SW79 --feedback "PDF ainda corta na direita em A4 portrait" --watch

# Ver métricas globais
cockpit metrics
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
| **MCP server** | 🚧 planejado |
| **TUI fullscreen** (`cockpit tui`) | 🚧 planejado |
| **Auth multi-user** | ❌ não está no roadmap (single-user OSS) |

## Documentação adicional

- [`CLAUDE.md`](./CLAUDE.md) — design system COCKPIT, arquitetura, comandos de dev
- [`AGENTS.md`](./AGENTS.md) — ponto de entrada pra LLMs trabalhando no repo
- [`cli/README.md`](./cli/README.md) — cheatsheet do CLI
- [`TODO_CLI.md`](./TODO_CLI.md) — roadmap do CLI (Tier 5 e além)
- [`TODO_HUMAN_LLM.md`](./TODO_HUMAN_LLM.md) — backlog técnico

## Licença

Em breve (open source planejado).

---

Built with [Bun](https://bun.sh), [React](https://react.dev), [Tailwind](https://tailwindcss.com), [SQLite](https://sqlite.org), [shadcn/ui](https://ui.shadcn.com).
