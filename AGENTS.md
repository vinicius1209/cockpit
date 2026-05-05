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

## Comandos

Detalhes em CLAUDE.md.

## Onde colocar código

| Tipo | Path |
|---|---|
| UI reutilizável | `src/components/ui/` |
| Helper de página/widget | `src/widgets/` |
| Feature integrada | `src/features/<name>/` |
| Store/entidade | `src/entities/<name>/` |
| Rota daemon | `daemon/src/routes/<name>.ts` |
| Novo CLI executor | `daemon/src/executor/agent-executor.ts` (KNOWN_AGENTS) |
