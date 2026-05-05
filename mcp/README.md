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
```

## Limitações conscientes

- **Sem long-running**: `implement` não está exposto via MCP (precisa de SSE; não fits MCP simples). Use o CLI ou Web UI pra disparar implementação.
- **Single-user**: assume `127.0.0.1` único usuário. Sem auth.
- **GitHub only**: auto-PR via gh quando aplicável; outras platforms não suportadas.
- **Daemon precisa estar rodando**: `bun run dev:daemon` antes do Claude Code

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

## Tier 2 — Próximas ferramentas

Veja `TODO_CLI.md` na raiz. Itens previstos:
- `cockpit_implement_async` — dispara em background, retorna sessionId
- `cockpit_get_session` — status de session em curso
- `cockpit_set_active_workspace` — mudar workspace ativo
- `cockpit_edit_card` — atualizar campos de card existente
- `cockpit_get_metrics_workspace` — métricas filtradas por ws

## Debugging

Logs do server vão pra **stderr** (stdout é reservado pra JSON-RPC):

```bash
bun run mcp 2>cockpit-mcp.log
# ou direto:
cd mcp && bun run src/index.ts 2>&1
```
