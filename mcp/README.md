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
| `cockpit_edit_card` | Atualiza campos do card (title/type/priority/desc/assignee/due_date) | card_id*, ...campos |
| `cockpit_archive_card` | Descarta card (preserva spec/sessions) | card_id* |
| `cockpit_unarchive_card` | Reativa card descartado | card_id* |
| `cockpit_set_active_workspace` | Muda workspace ativo (compartilhado CLI+MCP via cli.json) | workspace* |
| `cockpit_spec_gen_async` | Gera spec técnica via AI em background (salva em card.spec_content) | card_id*, agent, model, system_prompt |
| `cockpit_implement_async` | Dispara `implement` em background, retorna sessionId | card_id*, feedback, no_pr, **isolation** (`lock`/`worktree`) |
| `cockpit_get_session` | Status de uma session (phase + últimas chunks) | session_id*, tail_chunks |
| `cockpit_abort_session` | Aborta session em curso (mata processo, marca error, libera lock/worktree) | session_id* |
| `cockpit_create_workspace` | Cria workspace novo (slug auto-derivado se omitido) | name*, slug, description, color |
| `cockpit_list_projects` | Lista projetos vinculados a um/todos workspaces | workspace |
| `cockpit_link_project` | Vincula diretório local como projeto (path precisa existir) | path*, workspace, name, auto_pr |
| `cockpit_set_card_project` | Atribui projeto especifico a um card (ou desvincula com "") | card_id*, project_id* |

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

Implementadas em v0.2.0:
- ✅ `cockpit_implement_async` (com `isolation: lock|worktree`)
- ✅ `cockpit_get_session`
- ✅ `cockpit_archive_card` / `cockpit_unarchive_card`

Implementadas em v0.3.0 (Tier 3):
- ✅ `cockpit_edit_card` — patch de campos
- ✅ `cockpit_set_active_workspace` — compartilhado entre CLI e MCP
- ✅ `cockpit_abort_session` — mata processo do agent + cleanup

Implementadas em v0.4.0 (Tier 4):
- ✅ `cockpit_create_workspace` — bootstrap workspace
- ✅ `cockpit_list_projects` — descobrir projetos
- ✅ `cockpit_link_project` — vincular diretório local
- ✅ `cockpit_set_card_project` — atribuir projeto a card

Implementadas em v0.6.0 (Tier 5):
- ✅ `cockpit_spec_gen_async` — gerar spec via chat (fluxo AI dedicado no daemon)

Próximas (Tier 6+):
- `cockpit_get_metrics_workspace` — métricas filtradas por ws
- `cockpit_pr_status` — atalho pra surface PR sem chamar /git/pr-status manualmente
- `cockpit_run_hook` — disparar hook avulso (testar before_implement/after_pr)

## Debugging

Logs do server vão pra **stderr** (stdout é reservado pra JSON-RPC):

```bash
bun run mcp 2>cockpit-mcp.log
# ou direto:
cd mcp && bun run src/index.ts 2>&1
```
