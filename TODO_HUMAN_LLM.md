# Cockpit — Backlog Tecnico

Gerado a partir do eval completo (Web + Daemon) em 2026-05-03.
Atualizado com eval de idempotencia/safety em 2026-05-04.
Items marcados com `[x]` ja foram feitos.

---

## Concluidos

- [x] Historico de discovery com id/hash, persistido entre recarregamentos
- [x] Persistir estado da aba Entrevista ao trocar tabs no card dialog
- [x] Task Workspace — arquivos permanentes por card em `~/.cockpit/tasks/`
- [x] **A1** CORS restrito no daemon (trocar `*` por `localhost:5173`)
- [x] **A2** Timeout no agent executor (5 min max)
- [x] **A3** Error Boundary no CardDialog e panels
- [x] **A4** Centralizar `DAEMON_URL` em `shared/lib/constants.ts`
- [x] **A5** Proxiar API keys pelo daemon (eliminar chamadas diretas do browser)
- [x] Auto PR via `gh` apos implementacao (git flow profile + pr-creator)
- [x] Feedback loop — re-implementar com feedback do usuario (F2-F5)
- [x] Session-based architecture — execucoes persistidas completas
- [x] Guards de idempotencia nas automacoes de coluna (save_to_vault, discovery, implementation)

---

## CRITICOS — Corrigir Imediatamente (9 issues)

### Path Traversal / Input Validation

- [ ] **C1** `routes/tasks.ts:12` — `workspaceSlug` e `cardId` sem sanitizacao. `../../etc/passwd` possivel
- [ ] **C2** `routes/git.ts:10,50` — `projectPath` e `user` nao validados. Injecao possivel
- [ ] **C3** `routes/implement.ts:11` — `projectPath` aceita qualquer caminho
- [ ] **C4** `routes/data.ts:15` — nome do store nao validado contra whitelist
- [ ] **C5** `routes/projects.ts:11` — `path` aceita qualquer caminho
- [ ] **C6** `routes/discovery.ts:11,49` — `projectPath` nao validado

> **Solucao**: criar middleware `validatePath(path)` e `sanitizeSlug(slug)` no daemon. Rejeitar `..`, validar que path esta dentro de `$HOME`. Whitelist de stores em data.ts.

### Data Integrity

- [ ] **C7** `daemon-storage.ts:6-45` — Split-brain: localStorage e daemon podem divergir permanentemente. Sem timestamp, sem merge, sem conflict resolution
- [ ] **C8** `workspace/store.ts:83-88` — Cascade delete ausente: deletar workspace orphana cards, docs, labels, columns, projects
- [ ] **C9** `file-store.ts:33-40` — Race condition: `Bun.write()` nao e atomico. Escritas simultaneas corrompem JSON

---

## ALTOS — Idempotencia (11 issues)

### Stores sem deduplicacao

- [ ] **I1** `card/store.ts:47` — `addCard()` sem dedup. Mesmo card criado multiplas vezes
- [ ] **I2** `card/store.ts:86` — `reorderCards()` card nao encontrado fica position -1 (invisivel)
- [ ] **I3** `docs/store.ts:21` — `addDoc()` sem dedup por card_id + tag
- [ ] **I4** `workspace/store.ts:65` — `addWorkspace()` sem dedup por slug
- [ ] **I5** `project-store.ts:19` — `addProject()` sem dedup por path
- [ ] **I6** `agent/store.ts:63` — `addAgentConfig()` sem dedup por workspace+role

### Business logic sem idempotencia

- [ ] **I7** `auto-doc.ts:13` — `createDocFromSpec()` cria doc sem verificar existente (caller deve checar, mas nem sempre faz)
- [ ] **I8** `board-view.tsx:81` — DnD event pode disparar 2x → `moveCard()` duplicado
- [ ] **I9** `implementation-runner.ts:150` — Chamado 2x → 2 sessoes, mesma branch
- [ ] **I10** `pr-creator.ts:140` — Se `gh pr list` falha → assume sem PR → cria duplicata
- [ ] **I11** `scheduler.ts:33` — `addScheduledJob()` sem dedup por project

---

## ALTOS — Race Conditions (16 issues)

### Dual-write / Persistence

- [ ] **RC1** `daemon-storage.ts:33-45` — `setItem` escreve localStorage + daemon fire-and-forget. Daemon offline = dados perdidos
- [ ] **RC2** `daemon-storage.ts:16-24` — Daemon retorna dados diferentes → sobrescreve localStorage sem checar timestamps
- [ ] **RC3** `file-store.ts:38-40` — `update()` le → transforma → escreve em 3 passos. Sem lock
- [ ] **RC4** `git-flow-profile.ts:199-202` — Le all profiles + modifica 1 + escreve tudo. Analise concurrent perde dados

### Task Workspace (read-modify-write sem lock)

- [ ] **RC5** `task-workspace.ts:41-48` — `appendInterviewMessage` le + appenda + escreve. Concurrent append perdido
- [ ] **RC6** `task-workspace.ts:50-58` — `writeFeedback` mesmo padrao
- [ ] **RC7** `task-workspace.ts:60-67` — `appendImplementationLog` mesmo padrao
- [ ] **RC8** `task-workspace.ts:69-75` — `writeMeta` le meta.json + merge + escreve. Sem atomic merge

### Session Manager (read-modify-write sem lock)

- [ ] **RC9** `session-manager.ts:46-83` — `createSession` conta arquivos + cria. Duas sessoes simultaneas geram mesmo ID
- [ ] **RC10** `session-manager.ts:85-98` — `updateSession` le + merge + escreve. Lost update
- [ ] **RC11** `session-manager.ts:100-113` — `appendOutput` le + appenda + escreve. Concurrent lost
- [ ] **RC12** `session-manager.ts:115-130` — `appendFile` le + appenda + escreve. Concurrent lost

### Frontend state

- [ ] **RC13** `board-view.tsx:107-116` — `moveCard()` + automation trigger nao sao atomicos
- [ ] **RC14** `automation-engine.ts:74-88` — `getCardDocs` + `updateDoc` + `createDoc` 3 ops sem transacao
- [ ] **RC15** `card/store.ts:72-80` — `moveCard()` concurrent pode causar position inconsistente
- [ ] **RC16** `implementation-runner.ts:242-277` — File watcher polls a cada 3s, inaccurate tracking

---

## ALTOS — Resource Leaks (6 issues)

- [ ] **RL1** `agent-executor.ts:176-207` — Timeout nao mata o processo spawned. Zombie processes acumulam
- [ ] **RL2** `implementation-runner.ts:243` — `watchInterval` criado mas nao limpo se erro antes do clearInterval
- [ ] **RL3** `implementation-runner.ts:283` — `heartbeatInterval` mesmo padrao
- [ ] **RL4** `discovery.ts:64-121` — Subscriber nao limpo se client desconecta. Memory leak
- [ ] **RL5** `agent-executor.ts:236-309` — Streaming: consumer desconecta mas processo continua
- [ ] **RL6** `agent-executor.ts:186-189` — Pipe write falha mas processo nao e morto

---

## ALTOS — Error Handling (4 issues)

- [ ] **EH1** `automation-engine.ts:97-100` — Automacao falha mas card state nao reflete erro. User sem feedback
- [ ] **EH2** `board-view.tsx:113` — `import()` fire-and-forget. Automacao falha silenciosamente
- [ ] **EH3** `daemon-storage.ts:26-28` — Daemon offline silenciado. App usa dados stale indefinidamente
- [ ] **EH4** `file-store.ts:18-26` — JSON corrompido → reset silencioso para default. Data loss sem warning

---

## MEDIOS — Input Validation Daemon (11 issues)

- [ ] **V1** `routes/chat.ts:61` — `messages` pode ser undefined (crash no length check). Validar Array.isArray
- [ ] **V2** `routes/chat.ts:74` — `systemPrompt` pode ser undefined
- [ ] **V3** `routes/implement.ts:11` — `spec` pode ser string vazia (truthy mas invalida)
- [ ] **V4** `routes/tasks.ts:29` — `attempt` pode ser 0 ou negativo
- [ ] **V5** `routes/scheduler.ts:29-30` — `intervalHours` pode ser 0 ou negativo
- [ ] **V6** `routes/secrets.ts:15,22,33` — `provider` sem whitelist
- [ ] **V7** `routes/agents.ts:15,26` — `agent` e `prompt` nao validados
- [ ] **V8** `routes/discovery.ts:149-152` — `fingerprint` e `cardId` sem format check
- [ ] **V9** `routes/data.ts:27` — `req.json()` parsado sem validacao de schema
- [ ] **V10** `routes/scheduler.ts:47` — `enabled` nao validado como boolean
- [ ] **V11** `routes/secrets.ts:23` — `key` sem max length. Payload enorme possivel

---

## MEDIOS — Fail-First Violations (9 issues)

- [ ] **FF1** `automation-engine.ts:39` — Guard de discovery checa `description.includes()` — falso positivo se texto editado manualmente
- [ ] **FF2** `workspace/store.ts:86` — Apos delete, seta activeWorkspaceId pro primeiro sem verificar
- [ ] **FF3** `agent/store.ts:125` — `addMessage` com runId inexistente: mensagem silenciosamente dropada
- [ ] **FF4** `agent/store.ts:130-138` — `updateRunStatus` com runId inexistente: silent no-op
- [ ] **FF5** `implementation-runner.ts:160-163` — Git nao disponivel: loga mas continua com branchName=null
- [ ] **FF6** `pr-creator.ts:159-161` — `switchGhAccount()` falha: continua com conta errada
- [ ] **FF7** `pr-creator.ts:189-190` — URL parsing fragil: PR number vira 0 se formato mudar
- [ ] **FF8** `session-manager.ts:92-93` — File nao existe: silent return sem feedback ao caller
- [ ] **FF9** `docs/store.ts:33-39` — `updateDoc` com id inexistente: silent no-op

---

## MEDIOS — Misc Data Issues (6 issues)

- [ ] **MD1** `card/store.ts:161-166` — `toggleCardLabel` nao valida que label existe no workspace
- [ ] **MD2** `docs/store.ts:41-43` — `deleteDoc` nao limpa referencias em cards (dangling card_id)
- [ ] **MD3** `agent/store.ts:148-172` — API keys podem nao ser completamente removidas do state antigo na migracao
- [ ] **MD4** `daemon-storage.ts:21` — Compara JSON serializado mas key ordering difere. Atualizacoes espurias
- [ ] **MD5** `git-flow-profile.ts:81` — Parsing de gh auth status fragil. Pode setar active=false para conta ativa
- [ ] **MD6** `automation-engine.ts:166-170` — Apos mover card, automation atualiza state novamente. Double update

---

## Backlog — Seguranca (original)

- [ ] **S3** Secrets: usar file permissions 600 no `secrets.json` ou keychain do OS
- [ ] **S4** Validar `model` contra lista de modelos do agent no executor

## Backlog — Resiliencia / Dados (original)

- [ ] **R1** Graceful shutdown no daemon (SIGTERM/SIGINT → cleanup timers, listeners, pending writes)
- [ ] **R5** Cleanup de jobs antigos no `job-queue.ts` (TTL de 30 dias)
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
- [ ] **F1** Botao "Rejeitar" no implement panel (fecha PR draft, card volta pra Ready/Spec)
- [ ] **F6** Card type "revision" ou label automatica quando e re-tentativa
- [ ] **F7** Limite de tentativas automaticas (max 3, depois exige intervencao humana)

---

## Resumo do Eval de Safety (2026-05-04)

| Categoria | Total | Critico | Alto | Medio |
|-----------|-------|---------|------|-------|
| Path Traversal / Validation | 6 | 6 | 0 | 0 |
| Data Integrity | 3 | 3 | 0 | 0 |
| Idempotencia | 11 | 0 | 11 | 0 |
| Race Conditions | 16 | 0 | 16 | 0 |
| Resource Leaks | 6 | 0 | 6 | 0 |
| Error Handling | 4 | 0 | 4 | 0 |
| Input Validation | 11 | 0 | 0 | 11 |
| Fail-First | 9 | 0 | 0 | 9 |
| Misc Data | 6 | 0 | 0 | 6 |
| **TOTAL** | **72** | **9** | **37** | **26** |
