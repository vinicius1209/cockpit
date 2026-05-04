# Cockpit — Backlog Tecnico

Gerado a partir do eval completo (Web + Daemon) em 2026-05-03.
Items marcados com `[x]` ja foram feitos. Os demais estao priorizados por severidade.

---

## Concluidos

- [x] Historico de discovery com id/hash, persistido entre recarregamentos
- [x] Persistir estado da aba Entrevista ao trocar tabs no card dialog
- [x] Task Workspace — arquivos permanentes por card em `~/.cockpit/tasks/`

---

## Sprint Atual — Top 5 Acoes Imediatas

> Detalhes de execucao no plano abaixo.

- [x] **A1** CORS restrito no daemon (trocar `*` por `localhost:5173`)
- [x] **A2** Timeout no agent executor (5 min max)
- [x] **A3** Error Boundary no CardDialog e panels
- [x] **A4** Centralizar `DAEMON_URL` em `shared/lib/constants.ts`
- [x] **A5** Proxiar API keys pelo daemon (eliminar chamadas diretas do browser)

---

## Backlog — Seguranca

- [ ] **S1** Validar `filename` no endpoint `GET /api/tasks/:ws/:card/:file` — rejeitar `..`
- [ ] **S2** Validar `projectPath` em todos os endpoints — checar se existe e nao escapa `$HOME`
- [ ] **S3** Secrets: usar file permissions 600 no `secrets.json` ou keychain do OS
- [ ] **S4** Validar `model` contra lista de modelos do agent no executor
- [ ] **S5** Validar `intervalHours` no scheduler (min 0.5, max 168)
- [ ] **S6** Input validation em todas as rotas do daemon (body JSON schema)

## Backlog — Resiliencia / Dados

- [ ] **R1** Graceful shutdown no daemon (SIGTERM/SIGINT → cleanup timers, listeners, pending writes)
- [ ] **R2** Atomic writes no `DaemonFileStore` (write tmp + rename)
- [ ] **R3** Retry queue no dual-write (quando daemon offline, enfileirar e reenviar)
- [ ] **R4** Reconciliacao real no daemon-storage (re-hydrate Zustand quando daemon retorna dados mais novos)
- [ ] **R5** Cleanup de jobs antigos no `job-queue.ts` (TTL de 30 dias)
- [ ] **R6** Cleanup de listeners orfaos no `job-queue.ts` (quando SSE desconecta)
- [ ] **R7** Banner de "daemon offline" no frontend quando fetch falha

## Backlog — Performance

- [ ] **P1** Cache `detectInstalledAgents` (chamada a cada request, deveria cachear por 60s)
- [ ] **P2** Zustand selectors granulares (substituir destructuring de store inteiro)
- [ ] **P3** Lazy mount dos panels no CardDialog (montar so quando tab ativa, nao CSS hidden)
- [ ] **P4** Virtualizacao no board (react-window) para 100+ cards
- [ ] **P5** Backoff exponencial no git diff polling do implementation-runner

## Backlog — Qualidade de Codigo

- [ ] **Q1** Remover duplicacao `todosToCards` (manter so em `discovery-engine-utils.ts`)
- [ ] **Q2** Unificar schema SSE (um formato para chat, agents, discovery)
- [ ] **Q3** Mover `automation-engine.ts` de entities/ para features/automation/
- [ ] **Q4** Extrair form state do `card-dialog.tsx` para custom hook (reduzir 18 props drilling)
- [ ] **Q5** Logging estruturado no daemon (JSON com request ID, duracao, contexto)
- [ ] **Q6** Consolidar prompts de discovery (duplicados em engine e job-queue)

## Backlog — Testes

- [ ] **T1** Setup vitest no frontend + bun:test no daemon
- [ ] **T2** Testes unitarios: card store mutations, automation-engine, agent-service
- [ ] **T3** Testes unitarios daemon: agent-executor, task-workspace, file-store
- [ ] **T4** Testes de integracao: rotas do daemon (tasks, data, implement)
- [ ] **T5** Testes E2E: fluxo card Inbox → Discovery → Spec → Implement

## Backlog — UX / Acessibilidade

- [ ] **U1** ARIA labels nos componentes custom (board-card, board-column, conversation)
- [ ] **U2** Keyboard navigation no board (setas para mover entre colunas)
- [ ] **U3** Focus management no CardDialog (autofocus no titulo)
- [ ] **U4** Empty states: coluna sem cards, vault sem docs, sem projetos vinculados
- [ ] **U5** Loading skeletons (usar Skeleton component existente)

## Backlog — Cleanup de Deps

- [ ] **D1** Verificar e remover deps nao usadas: `@supabase/supabase-js`, `@xyflow/react`, `@rive-app/react-webgl2`, `media-chrome`, `embla-carousel-react`, `react-jsx-parser`, `tokenlens`, `ai` (Vercel SDK), `next-themes`

## Pendente (features)

- [ ] Live preview dos agents trabalhando no dashboard
- [ ] Session tracking + Branch hyperlink no implement panel (Task #50)
