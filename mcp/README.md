# `cockpit-mcp` — MCP Server

> Cockpit como Model Context Protocol server. Claude Code (e qualquer cliente compatível) controla workspaces, cards e specs via tools.

## Por quê?

Você usa Claude Code no terminal pra trabalhar. Agora ele pode **ler e escrever no Cockpit** sem você sair do chat:

```
[Você] "Quais bugs críticos abertos no workspace Portfolio?"
  [Claude] → cockpit_list_cards(workspace='portfolio', priority='critical')
  [Claude] Encontrei 2:
    - #SW79 Login redirect quebra após OAuth (medium)
    - #SW84 PDF corta a direita em A4 portrait (high)

[Você] "Crie um card pra refatorar a tela de auth"
  [Claude] → cockpit_create_card(title='Refatorar tela de auth', type='chore')
  [Claude] ✓ Criado #SW85 em Portfolio/inbox.

[Você] "Mostra a spec do SW79"
  [Claude] → cockpit_show_card(card_id='SW79')
  [Claude] Card #SW79 — Login redirect...
           Spec status: ready
           Conteúdo: ...
```

## Instalação

```bash
# da raiz do repo
bun run mcp:install

# reinicie sessões abertas do Claude Code
# então rode:
claude
> /mcp                # lista MCP servers
```

O instalador:
1. Instala dependências do MCP (`@modelcontextprotocol/sdk`)
2. Faz backup de `~/.claude.json`
3. Adiciona entry `cockpit` em `mcpServers`

## Tools expostas

| Tool | Descrição | Args |
|---|---|---|
| `cockpit_health` | Status do daemon | — |
| `cockpit_list_workspaces` | Lista workspaces com counters | — |
| `cockpit_list_cards` | Lista cards filtráveis | workspace, type, priority, spec_status, column_slug, limit |
| `cockpit_show_card` | Detalhes completos de um card | card_id (SW78 ou full) |
| `cockpit_create_card` | Cria card novo | title*, type, priority, description, workspace, column_slug |
| `cockpit_move_card` | Move entre colunas | card_id*, column_slug* |
| `cockpit_search` | Busca substring cross-workspace | query*, in (cards/specs/all), limit |
| `cockpit_metrics` | KPIs globais | — |
| `cockpit_archive_card` | Descarta card (preserva spec/sessions) | card_id* |
| `cockpit_unarchive_card` | Reativa card descartado | card_id* |
| `cockpit_implement_async` | Dispara `implement` em background, retorna sessionId | card_id*, feedback, no_pr, **isolation** (`lock`/`worktree`) |
| `cockpit_get_session` | Status de uma session (phase + últimas chunks) | session_id*, tail_chunks |

## Resources

| URI | Conteúdo |
|---|---|
| `cockpit://card/<id>` | Card como markdown completo (description + interview + spec) |
| `cockpit://board/<workspace>` | Kanban do workspace em texto (colunas + cards) |

Claude Code lista resources automaticamente; você pode pedir "leia o resource cockpit://card/SW78" e ele insere no contexto.

## Exemplos de prompts

```
"Liste todos os cards em ready, ordenados por prioridade"
"Quantos bugfixes em wip no momento?"
"Mostre o conteúdo da spec do card SW78"
"Crie 3 cards: refatorar auth (chore), bug no logout (bugfix high), nova feature de dark mode (feature medium)"
"Move o SW79 pra ready"
"Busque cards sobre 'mentoria' e me dê excerto"
"Quais foram minhas métricas de implementação esta semana?"
"Implementa o SW79 — o spec já está ready"
"Como tá indo a session sess_abc123?"
```

## Long-running (cockpit_implement_async)

Disparar implementação pelo Claude Code:

```
[Você] "implementa o SW79"
[Claude] → cockpit_implement_async(card_id='SW79')
[Claude] ✓ session sess_xyz iniciada (claude-code/sonnet)
         use cockpit_get_session pra acompanhar

[Você] "como tá?"
[Claude] → cockpit_get_session(session_id='sess_xyz')
[Claude] phase: implementing · 47s rodando
         últimas chunks: ...
```

Pré-requisitos: card precisa ter `spec_content` (`spec_status: ready` é suficiente) e o workspace precisa de pelo menos 1 projeto vinculado. O daemon roda `runImplementation` em background; o MCP retorna o `sessionId` em <1s.

## Limitações conscientes

- **Sem stream live no Claude Code**: `cockpit_implement_async` retorna o sessionId imediatamente, mas a UI do Claude Code não streama os chunks ao vivo (MCP tools são request/response). Pra ver live, abra `cockpit watch <id>` no terminal — mesma sessão, SSE real.
- **Single-user**: assume `127.0.0.1` único usuário. Sem auth.
- **GitHub only**: auto-PR via gh quando aplicável; outras platforms não suportadas.
- **Daemon precisa estar rodando**: `cockpit daemon install` (auto-start) ou `bun run dev:daemon`.

## Como funciona

```
Claude Code (cliente MCP) ◀─stdio JSON-RPC─▶ cockpit-mcp (server)
                                                    │
                                                    ▼
                                            HTTP requests
                                                    │
                                                    ▼
                                            daemon Bun (port 4800)
                                                    │
                                                    ▼
                                            SQLite (~/.cockpit/data/)
```

O Claude Code spawna `cockpit-mcp` quando inicia (configurado em `~/.claude.json`). Conversas via stdio em JSON-RPC 2.0. Cada tool call vira um ou mais HTTP requests pro daemon — mesma API que o web UI e o CLI usam.

## Arquitetura

```
mcp/
├── package.json              # bin: cockpit-mcp
├── src/
│   ├── index.ts              # registra server + tools + resources
│   └── api.ts                # HTTP client + types + helpers (resolveCard, etc)
└── tsconfig.json
```

Stack:
- [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk) (Anthropic, oficial)
- Bun runtime
- HTTP fetch nativo

## Roadmap

Implementadas em v0.2.0 (eram Tier 2):
- ✅ `cockpit_implement_async` — dispara em background, retorna sessionId (com `isolation: lock|worktree`)
- ✅ `cockpit_get_session` — status + tail de chunks
- ✅ `cockpit_archive_card` / `cockpit_unarchive_card`

Próximas (Tier 3):
- `cockpit_set_active_workspace` — mudar workspace ativo (CLI state)
- `cockpit_edit_card` — atualizar campos (title/type/priority/assignee/due) sem dialog
- `cockpit_get_metrics_workspace` — métricas filtradas por ws
- `cockpit_abort_session` — abortar session em curso pelo Claude Code

## Debugging

Logs do server vão pra **stderr** (stdout é reservado pra JSON-RPC):

```bash
bun run mcp 2>cockpit-mcp.log
# ou direto:
cd mcp && bun run src/index.ts 2>&1
```
