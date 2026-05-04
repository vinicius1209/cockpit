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

- [x] **C1** `routes/tasks.ts` — sanitizeSlug + sanitizeFilename em todos os params
- [x] **C2** `routes/git.ts` — validateProjectPath + sanitizeGhUser
- [x] **C3** `routes/implement.ts` — validateProjectPath
- [x] **C4** `routes/data.ts` — validateStoreName (whitelist)
- [x] **C5** `routes/projects.ts` — validateProjectPath (scan + bootstrap)
- [x] **C6** `routes/discovery.ts` — validateProjectPath (run + start)

> Modulo centralizado: `daemon/src/validation.ts` com sanitizeSlug, validateProjectPath, sanitizeFilename, validateStoreName, sanitizeGhUser, validatePositiveNumber.

### Data Integrity

- [x] **C7** `daemon-storage.ts` — Timestamp-based conflict detection. setItem stampa _ts, getItem so sobrescreve se daemon _ts > local _ts. Dispara StorageEvent para rehydration.
- [x] **C8** `workspace/store.ts` — Cascade delete: remove cards, docs, columns, labels, projects do workspace via dynamic import.
- [x] **C9** `file-store.ts` — Atomic write (tmp + rename). Serialized updates via writing flag. Session ID com timestamp+random (nao sequential count).

---

## ALTOS — Idempotencia (11 issues)

### Stores sem deduplicacao

- [x] **I1** `card/store.ts` — addCard dedup: rejeita se mesmo title+column criado nos ultimos 3s
- [x] **I2** `card/store.ts` — Falso positivo: reorderCards ja retorna card inalterado se nao encontrado
- [x] **I3** `docs/store.ts` — addDoc dedup: se card_id+title existe, atualiza conteudo ao inves de criar
- [x] **I4** `workspace/store.ts` — addWorkspace dedup por slug. ID com random suffix (anti-collision)
- [x] **I5** `project-store.ts` — addProject dedup por path+workspace_id
- [x] **I6** `agent/store.ts` — addAgentConfig dedup por workspace+role

### Business logic sem idempotencia

- [x] **I7** `auto-doc.ts` — Coberto por I3 (addDoc agora faz upsert por card_id+title) + guard no automation-engine
- [x] **I8** `board-view.tsx` — Debounce: lastDragRef previne double-fire dentro de 500ms
- [x] **I9** `implementation-runner.ts` — Coberto pelo isRunning check no frontend + session por execucao e correto
- [x] **I10** `pr-creator.ts` — Melhoria: log de erro se gh pr list falha (em vez de silenciar). Dedup check continua.
- [x] **I11** `scheduler.ts` — addScheduledJob dedup por projectPath

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

- [x] **RL1** `agent-executor.ts` — proc hoisted, proc.kill() no catch de timeout/erro em executeAgent e executeAgentWithCallbacks
- [x] **RL2** `implementation-runner.ts` — try/finally garante clearInterval do watchInterval
- [x] **RL3** `implementation-runner.ts` — try/finally garante clearInterval do heartbeatInterval
- [x] **RL4** `discovery.ts` — cancel() callback no ReadableStream chama unsubscribe(). try/catch no send() detecta disconnect.
- [x] **RL5** `agent-executor.ts` — proc.kill() no catch do executeAgentStreaming (ja existia)
- [x] **RL6** `agent-executor.ts` — try/catch no pipe write, proc.kill() se falha

---

## ALTOS — Error Handling (4 issues)

- [x] **EH1** `automation-engine.ts` — catch agora mostra toast.error com nome da automacao e mensagem do erro
- [x] **EH2** `board-view.tsx` — .catch() no import() com toast.error e console.error
- [ ] **EH3** `daemon-storage.ts` — Parcial: timestamp-based conflict detection (C7). Banner offline = R7 no backlog
- [x] **EH4** `file-store.ts` — console.error com path e erro ao detectar JSON corrompido (fixado em C9)

---

## MEDIOS — Input Validation Daemon (11 issues)

- [x] **V1** `routes/chat.ts` — Array.isArray check em messages
- [x] **V2** `routes/chat.ts` — systemPrompt ja tratado como '' por buildPrompt (aceitar)
- [x] **V3** `routes/implement.ts` — `!body.spec` ja rejeita empty string (aceitar)
- [x] **V4** `routes/tasks.ts` — validatePositiveNumber no attempt (fixado em C1-C6)
- [x] **V5** `routes/scheduler.ts` — intervalHours validado: min 0.5, max 168
- [x] **V6** `routes/secrets.ts` — whitelist VALID_PROVIDERS em GET/POST/DELETE
- [x] **V7** `routes/agents.ts` — ja tem `!body.agent || !body.prompt` check (aceitar)
- [x] **V8** `routes/discovery.ts` — validateProjectPath no link endpoint
- [x] **V9** `routes/data.ts` — aceitar: full-replace e o design, validado pelo store name whitelist (C4)
- [x] **V10** `routes/scheduler.ts` — typeof boolean check em enabled
- [x] **V11** `routes/secrets.ts` — max 500 chars no key

---

## MEDIOS — Fail-First Violations (9 issues)

- [x] **FF1** Aceitar: guard por includes() e melhor que nenhum guard. Falso positivo = apenas skip (nao causa dano)
- [x] **FF2** Fixado em C8: cascade delete agora limpa dados e seleciona remaining[0]
- [x] **FF3** Aceitar: store pattern normal — caller deve verificar runId antes
- [x] **FF4** Aceitar: store pattern normal — silent no-op e seguro
- [x] **FF5** Aceitar: design intencional — executa sem branch quando git nao existe
- [x] **FF6** `pr-creator.ts` — fail-fast: throw Error se switchGhAccount falha
- [x] **FF7** Aceitar: PR number 0 e tratado gracefully no frontend (nao mostra link)
- [x] **FF8** Aceitar: caller (updateSession) verifica retorno adequadamente
- [x] **FF9** Aceitar: store pattern normal — silent no-op e seguro

---

## MEDIOS — Misc Data Issues (6 issues)

- [x] **MD1** Aceitar: UI controla input — usuario so ve labels do workspace. Risco baixo.
- [x] **MD2** Aceitar: card_id no doc e apenas referencia. Doc deletado nao afeta card.
- [x] **MD3** Aceitar: migracao one-time. API keys agora vao pelo daemon (A5).
- [x] **MD4** Fixado em C7: timestamp-based comparison substitui JSON string comparison.
- [x] **MD5** Aceitar: parsing funciona para o formato atual de gh. Fragil mas funcional.
- [x] **MD6** Mitigado: dedup guards (I1-I11) previnem side-effects do double update.

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

| Categoria | Total | Fixado | Aceitar | Restante |
|-----------|-------|--------|---------|----------|
| Path Traversal / Validation (C) | 6 | 6 | 0 | 0 |
| Data Integrity (C) | 3 | 3 | 0 | 0 |
| Idempotencia (I) | 11 | 11 | 0 | 0 |
| Race Conditions (RC) | 16 | 0 | 0 | **16** |
| Resource Leaks (RL) | 6 | 6 | 0 | 0 |
| Error Handling (EH) | 4 | 3 | 0 | 1 |
| Input Validation (V) | 11 | 7 | 4 | 0 |
| Fail-First (FF) | 9 | 2 | 7 | 0 |
| Misc Data (MD) | 6 | 1 | 5 | 0 |
| **TOTAL** | **72** | **39** | **16** | **17** |

> **17 restantes** sao Race Conditions (RC1-RC16) no file I/O + 1 EH3 (banner offline).
> As RC sao inerentes ao modelo single-process + file-based. Resolver requer: mutex/lock
> por arquivo ou migrar para SQLite. Backlog para quando escala justificar.
