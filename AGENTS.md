# Agents

Este arquivo é o ponto de entrada para qualquer agente AI (Claude Code, OpenCode,
Gemini CLI, Aider) trabalhando neste repositório.

**👉 Leia primeiro [`CLAUDE.md`](./CLAUDE.md).** Ele contém:

- Design system COCKPIT (tokens, padrões, dont's)
- Mapa de arquitetura (frontend ↔ daemon ↔ CLI agents/APIs)
- Persistência (~/.cockpit, SQLite, .cockpit/task local)
- Comandos de dev/test/build
- Fix conhecido: claude-code em modo `-p` precisa de `--permission-mode bypassPermissions`

## TL;DR para mudanças de UI

Cockpit é uma cabine. Toda nova tela deve ter:

1. **Header tipo flight strip** — identificação técnica do objeto (ID curto, slug,
   tipo) em mono uppercase tracking-wide.
2. **LEDs e telemetria** — estados visíveis em todo lugar. Verde/amber/cinza/vermelho
   semânticos. Loaders só giram quando há execução real.
3. **Status bar persistente** quando houver execução longa.
4. **Confirmação destrutiva** — `useConfirm()` em qualquer delete.
5. **Mono em metadata** — IDs, paths, slugs, contadores tabulares.

Veja exemplos vivos em:
- `src/features/board/card-dialog.tsx` (flight strip + pipeline + status bar)
- `src/features/board/board-card.tsx` (kanban card cockpit)
- `src/widgets/sidebar/app-sidebar.tsx` (sidebar com daemon LED)
- `src/app/routes/workspace-settings.tsx` (settings page)
- `src/features/spec-engine/spec-generation-overlay.tsx` (live transmission)

## TL;DR para CLI

O CLI `cockpit` espelha a aesthetic no terminal:

1. **Boxes e dividers**: `╭─╮ ╰─╯` e `━━━ NAME ━━━` (helpers em `cli/src/ui/box.ts`)
2. **Cores semânticas**: `c.emerald` (ok), `c.amber` (live/wip), `c.rose` (erro), `c.gray` (idle)
3. **Pipeline LEDs no card show**: `[1] ●  [2] ○  [3] ●  [4] ●`
4. **Mono identifiers**: `#SW78` em display, mas **`SW78` sem `#`** ao passar como argumento (zsh trata como comentário)
5. **Streams**: usar `postSSE`/`getSSE` de `cli/src/api/sse.ts` + `renderChunk` de `ui/stream-render.ts`

Comandos disponíveis via `cockpit help`. Implementação em `cli/src/commands/`.

## Modos paralelos

O Cockpit roda 3 modos sobre o **mesmo daemon** + SQLite:

- **Web UI** (port 5173) — exploração visual, kanban
- **CLI `cockpit`** — operações no terminal, scripts, watch live
- **MCP server** (planejado) — Claude Code controla via protocolo

Não há "modo principal". Mesmo state em todos. Detalhes em [CLAUDE.md#modos-de-uso](./CLAUDE.md#modos-de-uso-importante-para-llms).

## Comandos

Detalhes em CLAUDE.md.

## Onde colocar código

| Tipo | Path |
|---|---|
| UI reutilizável | `src/components/ui/` |
| Helper de página/widget | `src/widgets/` |
| Feature integrada | `src/features/<name>/` |
| Store/entidade | `src/entities/<name>/` |
| Rota daemon | `daemon/src/routes/<name>.ts` (plugar em `routes/router.ts`) |
| Novo CLI agent executor (claude-code/etc) | `daemon/src/executor/agent-executor.ts` (KNOWN_AGENTS) |
| Migration SQLite | `daemon/src/persistence/db.ts` (`runMigrations()`) |
| Novo comando CLI | `cli/src/commands/<name>.ts` (plugar em `cli/src/index.ts` + `commands/help.ts`) |
| UI ANSI helper | `cli/src/ui/` (zero deps, cores via `colors.ts`) |
