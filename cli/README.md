# `cockpit` — CLI

> Orquestrador terminal-first do Cockpit. Gerencia workspaces, cards, specs e implementações sem abrir o browser.

```
$ cockpit board

━━━━━━━━━━━━━━━━━━━━━━ BOARD · PORTFOLIO ━━━━━━━━━━━━━━━━━━━━━━

 ● Inbox 02            ● Spec 01           ● Ready 01           ● In Progress 01    ● Review 00
─────────────────── ─────────────────── ─────────────────── ─────────────────── ───────────────────
 #AB12 BUGF           #CD34 FEAT          #EF56 FEAT           #SW78 FEAT  ● LIVE
 Login redirect       Add OAuth login     Mentorship section   Landing page CTA
 HIGH                 MEDIUM · ready      MEDIUM · ready       MEDIUM · in_progress

  4 cards · 1 LIVE
```

## Instalação

```bash
# da raiz do repo
bun run cli:install

# verificar
cockpit doctor
```

O instalador cria symlinks em `~/.local/bin/`:
- `cockpit` (comando principal)
- `ck` (atalho curto)

Se `~/.local/bin` não está no `$PATH`, o script avisa e mostra como adicionar.

## Quickstart (3 comandos)

```bash
cockpit doctor                  # 1. valida setup
cockpit ws use portfolio        # 2. seleciona workspace ativo
cockpit                         # 3. dashboard global no terminal
```

## Posicionamento

O CLI **não compete** com `claude-code`/`gh`. Ele **orquestra** o que você já tem:

|  | CLI Cockpit | Claude Code | gh |
|---|---|---|---|
| Vê todos workspaces | ✅ | ❌ pasta atual | ❌ repo atual |
| Pipeline (entrevista→spec→implement) | ✅ | ❌ | ❌ |
| Métricas cross-projeto | ✅ | ❌ | ❌ |
| Multi-agent | ✅ | ❌ só Claude | N/A |
| Background runs com reaper | ✅ | ❌ foreground | N/A |

## Workflows reais

### Triagem rápida da manhã

```bash
cockpit                            # status global
cockpit board                      # kanban do workspace ativo
cockpit ws                         # ver outros workspaces
cockpit search "TODO" --in cards   # busca cross-workspace
```

### Criar card e implementar end-to-end

```bash
# criar
cockpit card new "Add dark mode toggle" --type feature --prio medium

# discutir com AI antes de spec (opcional)
cockpit ai SW79
  # ▸ você acha que vale separar em 2 cards?
  # ◇ acho que sim, porque...
  # ▸ /exit

# gerar spec
cockpit spec gen SW79 --watch
cockpit spec edit SW79             # ajustar manualmente
cockpit spec ready SW79            # aprovar

# implementar com tail live
cockpit implement SW79 --watch

# se não resolveu
cockpit implement SW79 --feedback "ainda quebra no Safari mobile" --watch
```

### Disparar e receber notify quando terminar

```bash
# Implementa em background, alarme te avisa
cockpit implement SW79 &
cockpit alarm SW79
# (ao terminar) → notify nativo do OS aparece + bell + ● #SW79 ✓ concluida
```

Cross-platform: macOS via `osascript` (zero deps), Linux via `notify-send` (precisa libnotify), Windows fallback pra terminal bell. Sons configuráveis no macOS (`--sound Glass`/`Ping`/`Pop`/`Submarine`/`Basso`); `--silent` desliga.

### Multiplex de várias sessions ao mesmo tempo

```bash
# Em um terminal, dispara N implementações em background
cockpit implement SW79 &
cockpit implement SW80 &

# Em outro, acompanha tudo numa timeline única (cores por card)
cockpit watch --all
# [#SW79·implementation] ▶ Read src/auth.ts
# [#SW80·implementation] ▶ Edit src/login.tsx
# [#SW79·implementation] ✓ done (exit=0)
```

Cada session ganha um label `[#SW79·implementation]` colorido (rotaciona em 6 cores). Linhas ficam intercaladas em ordem cronológica. Ctrl+C desconecta sem matar — sessions continuam rodando no daemon.

### Acompanhar implementação rodando em background

```bash
# dispara em background
cockpit implement SW79             # sem --watch

# em outro terminal (ou depois)
cockpit watch SW79                 # tail live
```

### Ver histórico de tentativas

```bash
cockpit log SW79                   # tabela de attempts
cockpit log SW79 --last 3          # detalhe das 3 últimas
cockpit log SW79 --json | jq       # processar com jq
```

## Comandos completos

### Status & info

| Comando | Descrição |
|---|---|
| `cockpit` | status overview global (active ws, live runs, other ws) |
| `cockpit tui` | TUI fullscreen — kanban interativo + sessions live |
| `cockpit doctor [--fix]` | health check + manutenção (auto-fix de locks órfãos, sessions zumbis) |
| `cockpit metrics [--json]` | KPIs + sparklines + velocity |
| `cockpit help [cmd]` | ajuda |

### Daemon (macOS launchd)

| Comando | Descrição |
|---|---|
| `cockpit daemon status [--json]` | health + estado do launchagent + paths |
| `cockpit daemon install` | escreve `~/Library/LaunchAgents/dev.cockpit.daemon.plist` e carrega |
| `cockpit daemon uninstall` | unload + remove plist |
| `cockpit daemon start` | sobe agora (idempotente) |
| `cockpit daemon stop` | para (volta no proximo login — KeepAlive) |
| `cockpit daemon restart` | stop + start |
| `cockpit daemon logs [-f] [--lines N] [--err]` | tail dos logs |

> Apos `install`, o daemon roda como background service e sobe automaticamente em todo login. Logs em `~/.cockpit/logs/`.

### Workspaces

| Comando | Descrição |
|---|---|
| `cockpit ws` | lista workspaces |
| `cockpit ws use <name>` | set workspace ativo (CLI state) |
| `cockpit ws info [name]` | detalhes do workspace |
| `cockpit ws new "<name>" [--color] [--desc]` | cria novo workspace |
| `cockpit ws delete <name> [--force]` | exclui workspace |

### Board & cards

| Comando | Descrição |
|---|---|
| `cockpit board [ws]` | ASCII kanban |
| `cockpit card list [filtros]` | lista cards (filtros: `--ws --type --priority --status --json`) |
| `cockpit card show <id>` | ficha completa |
| `cockpit card new "<title>" [opts]` | cria card (`--type --prio --ws --col --desc`) |
| `cockpit card move <id> <col>` | move entre colunas |
| `cockpit card edit <id> [opts]` | edita campos (`--title --type --prio --assignee --due`) |
| `cockpit card delete <id> [--force]` | exclui permanente |
| `cockpit card archive <id>` | descarta (archive) — preserva spec/sessions, alias: `discard` |
| `cockpit card unarchive <id>` | reativa card descartado, alias: `restore` |
| `cockpit card list --include-archived \| --only-archived` | inclui ou só descartados |

### Spec lifecycle

| Comando | Descrição |
|---|---|
| `cockpit spec show <id>` | imprime markdown da spec colorido |
| `cockpit spec gen <id> [--watch]` | gera spec via AI (spec-writer agent) |
| `cockpit spec edit <id>` | abre `$EDITOR` (vim/nano/code/etc) |
| `cockpit spec ready <id>` | aprova spec (draft → ready) |
| `cockpit spec reset <id> [--force]` | apaga spec atual |
| `cockpit spec save-vault <id>` | copia spec para Docs Vault |

### Long-running (com SSE)

| Comando | Descrição |
|---|---|
| `cockpit implement <id> [opts]` | dispara implementação (`--watch --feedback "..." --no-pr --isolation worktree`) |
| `cockpit watch <id> [--action ...]` | tail live de session em curso ou histórica |
| `cockpit watch --all` | multiplex SSE de todas sessions running (timeline cronológica) |
| `cockpit alarm <id>` | notify desktop quando session terminar (`--silent --sound Glass`) |
| `cockpit alarm --all` | notify ao fim de cada session running |
| `cockpit log <id> [--last N] [--json]` | histórico de attempts em tabela |
| `cockpit ai <id>` | REPL de chat com card+projeto como contexto |

### Misc

| Comando | Descrição |
|---|---|
| `cockpit agent list [--json]` | lista CLI agents detectados |
| `cockpit agent test <name> [--prompt "..."]` | hello-world num agent |
| `cockpit init [--ws X] [--name Y]` | bootstrap `.cockpit/config.json` no cwd |
| `cockpit search "<query>" [opts]` | busca em cards/specs (`--in cards|specs --limit N --json`) |

## Flags globais

| Flag | Descrição |
|---|---|
| `--json` | output em JSON (machine readable) |
| `--help`, `-h` | ajuda do comando |
| `NO_COLOR=1` | desabilita cores (env var) |
| `COCKPIT_DAEMON_URL=...` | override URL do daemon |

## ⚠ Sobre o `#` nos IDs

O CLI mostra cards como `#SW78` (mais bonito), mas **não use o `#` ao passar como argumento**:

```bash
# ❌ ERRADO — zsh/bash com interactive_comments tratam # como comentário
cockpit card show #SW78

# ✅ CERTO — sem o #
cockpit card show SW78
```

Aceita também: `sw78` (case-insensitive), prefixo do id completo, ou id completo.

## Aliases sugeridos

Adicione no seu `~/.zshrc` ou `~/.bashrc`:

```bash
alias ck='cockpit'
alias ckb='cockpit board'
alias ckc='cockpit card list'
alias cki='cockpit implement'
alias ckw='cockpit watch'
```

Aí fica:

```bash
ck                              # status
ckb                             # board
ckc --status review             # cards em review
cki SW78 --watch                # implementa + tail
ckw SW78                        # watch live
```

## Composição com Unix tools

Tudo aceita `--json`:

```bash
# implementar todos os cards em ready (com confirmação manual)
cockpit card list --status ready --json | jq -r '.[].id' | while read id; do
  echo "Implementar $id? (y/n)"; read confirm
  [[ "$confirm" == "y" ]] && cockpit implement "$id" --watch
done

# stats por agent
cockpit log SW78 --json | jq 'group_by(.agent) | map({agent: .[0].agent, count: length})'
```

## Aesthetic

CLI preserva o design system COCKPIT:

- **Boxes técnicos**: `╭─╮` borders, dividers `━━━ NAME ━━━`
- **Cores semânticas**: `emerald` (ok), `amber` (live/wip), `rose` (erro), `gray` (idle), `cyan` (info)
- **Mono identifiers**: `#SW78`, `#slug`, paths, contadores
- **Pipeline LEDs**: `[1] ●  [2] ○  [3] ●  [4] ●` no `card show`
- **ASCII kanban** com coluna por estágio
- **Status bar persistente** durante long-running com chunks counter, last-activity, agent label

## Limitações conhecidas

- **No-TTY mode**: cores desabilitadas automaticamente quando stdout é pipe/redirect (ou `NO_COLOR=1`)
- **Daemon offline**: `cockpit` ainda funciona em comandos read locais via cache, mas long-running falha
- **Single-user**: sem auth/multi-tenant — backend assume `127.0.0.1` único usuário
- **Só GitHub**: auto-PR via `gh`, sem suporte a GitLab/Bitbucket ainda

## Roadmap

Veja [`TODO_CLI.md`](../TODO_CLI.md) na raiz do repo:

- **Tier 5**: TUI fullscreen (`cockpit tui` estilo `lazygit`)
- **Warp Workflows export**: cada card vira `.warp-notebook` executável
- **Discovery commands**: `cockpit discover` integrando o scanner
- **Hooks**: `before_implement`, `after_pr` shell scripts
- **MCP server**: Claude Code controla Cockpit pelo protocolo

## Arquitetura interna

```
cli/src/
├── index.ts                # router de comandos
├── api/
│   ├── client.ts           # wrapper HTTP do daemon
│   ├── store.ts            # desempacota Zustand persist via /api/data
│   ├── resolve.ts          # resolve "SW78" → card real
│   └── sse.ts              # reader SSE pra streams
├── ui/                     # zero-dep ANSI colors, boxes, tables, kanban
│   ├── colors.ts
│   ├── box.ts
│   ├── table.ts
│   ├── kanban.ts
│   ├── banner.ts
│   └── stream-render.ts    # renderer compartilhado de chunks
├── commands/               # 1 arquivo por comando
└── config/
    └── daemon.ts           # ~/.cockpit/cli.json (active workspace)
```

Sem deps externas além do runtime Bun. Distribuído como symlink hoje;
`bun build --compile` produz binário standalone (planejado).
