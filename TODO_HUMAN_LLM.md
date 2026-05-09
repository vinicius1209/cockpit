# Cockpit — Backlog Técnico

Gerado a partir do eval completo (Web + Daemon) em 2026-05-03.
Atualizado com eval de idempotencia/safety em 2026-05-04.
Items marcados com `[x]` já foram feitos.

---

## Concluidos

- [x] Histórico de discovery com id/hash, persistido entre recarregamentos
- [x] Persistir estado da aba Entrevista ao trocar tabs no card dialog
- [x] Task Workspace — arquivos permanentes por card em `~/.cockpit/tasks/`
- [x] **A1** CORS restrito no daemon (trocar `*` por `localhost:5173`)
- [x] **A2** Timeout no agent executor (5 min max)
- [x] **A3** Error Boundary no CardDialog e panels
- [x] **A4** Centralizar `DAEMON_URL` em `shared/lib/constants.ts`
- [x] **A5** Proxiar API keys pelo daemon (eliminar chamadas diretas do browser)
- [x] Auto PR via `gh` após implementação (git flow profile + pr-creator)
- [x] Feedback loop — re-implementar com feedback do usuario (F2-F5)
- [x] Session-based architecture — execuções persistidas completas
- [x] Guards de idempotencia nas automações de coluna (save_to_vault, discovery, implementation)

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
- [x] **C9** `file-store.ts` — Atomic write (tmp + rename). Serialized updates via writing flag. Session ID com timestamp+random (não sequential count).

---

## ALTOS — Idempotencia (11 issues)

### Stores sem deduplicacao

- [x] **I1** `card/store.ts` — addCard dedup: rejeita se mesmo title+column criado nos últimos 3s
- [x] **I2** `card/store.ts` — Falso positivo: reorderCards já retorna card inalterado se não encontrado
- [x] **I3** `docs/store.ts` — addDoc dedup: se card_id+title existe, atualiza conteudo ao inves de criar
- [x] **I4** `workspace/store.ts` — addWorkspace dedup por slug. ID com random suffix (anti-collision)
- [x] **I5** `project-store.ts` — addProject dedup por path+workspace_id
- [x] **I6** `agent/store.ts` — addAgentConfig dedup por workspace+role

### Business logic sem idempotencia

- [x] **I7** `auto-doc.ts` — Coberto por I3 (addDoc agora faz upsert por card_id+title) + guard no automation-engine
- [x] **I8** `board-view.tsx` — Debounce: lastDragRef previne double-fire dentro de 500ms
- [x] **I9** `implementation-runner.ts` — Coberto pelo isRunning check no frontend + session por execução e correto
- [x] **I10** `pr-creator.ts` — Melhoria: log de erro se gh pr list falha (em vez de silenciar). Dedup check continua.
- [x] **I11** `scheduler.ts` — addScheduledJob dedup por projectPath

---

## ALTOS — Race Conditions (16 issues)

### Dual-write / Persistence

- [x] **RC1** Aceitar: mitigado por timestamps (C7) + SQLite como source of truth + banner offline (R7)
- [x] **RC2** Aceitar: timestamp-based conflict detection (C7). Daemon sempre ganha se _ts mais recente.
- [x] **RC3** Fixado: SQLite `INSERT OR REPLACE` atomico (Sprint 2)
- [x] **RC4** Fixado: SqliteJsonStore com atomic SQL write (Sprint 2)

### Task Workspace (read-modify-write sem lock)

- [x] **RC5-RC8** Aceitar: append-only markdown files, single-user local. Pior caso = perde 1 append. Não justifica complexidade de lock.

### Session Manager (read-modify-write sem lock)

- [x] **RC9** Fixado: Session ID com timestamp+random, INSERT atomico no SQLite (Sprint 2)
- [x] **RC10** Fixado: UPDATE sessions SET ... atomico no SQLite (Sprint 2)
- [x] **RC11** Fixado: json_insert atomico no SQLite (Sprint 2)
- [x] **RC12** Fixado: SELECT + UPDATE atomico no SQLite (Sprint 2)

### Frontend state

- [x] **RC13-RC15** Aceitar: frontend single-tab, mitigado por idempotencia (I1-I11) e dedup guards
- [x] **RC16** Fixado: backoff polling 3s→10s (P5)

---

## ALTOS — Resource Leaks (6 issues)

- [x] **RL1** `agent-executor.ts` — proc hoisted, proc.kill() no catch de timeout/erro em executeAgent e executeAgentWithCallbacks
- [x] **RL2** `implementation-runner.ts` — try/finally garante clearInterval do watchInterval
- [x] **RL3** `implementation-runner.ts` — try/finally garante clearInterval do heartbeatInterval
- [x] **RL4** `discovery.ts` — cancel() callback no ReadableStream chama unsubscribe(). try/catch no send() detecta disconnect.
- [x] **RL5** `agent-executor.ts` — proc.kill() no catch do executeAgentStreaming (já existia)
- [x] **RL6** `agent-executor.ts` — try/catch no pipe write, proc.kill() se falha

---

## ALTOS — Error Handling (4 issues)

- [x] **EH1** `automation-engine.ts` — catch agora mostra toast.error com nome da automação e mensagem do erro
- [x] **EH2** `board-view.tsx` — .catch() no import() com toast.error e console.error
- [x] **EH3** Banner offline implementado (R7). Timestamp conflict detection (C7). SQLite como source of truth (Sprint 2).
- [x] **EH4** `file-store.ts` — console.error com path e erro ao detectar JSON corrompido (fixado em C9)

---

## MEDIOS — Input Validation Daemon (11 issues)

- [x] **V1** `routes/chat.ts` — Array.isArray check em messages
- [x] **V2** `routes/chat.ts` — systemPrompt já tratado como '' por buildPrompt (aceitar)
- [x] **V3** `routes/implement.ts` — `!body.spec` já rejeita empty string (aceitar)
- [x] **V4** `routes/tasks.ts` — validatePositiveNumber no attempt (fixado em C1-C6)
- [x] **V5** `routes/scheduler.ts` — intervalHours validado: min 0.5, max 168
- [x] **V6** `routes/secrets.ts` — whitelist VALID_PROVIDERS em GET/POST/DELETE
- [x] **V7** `routes/agents.ts` — já tem `!body.agent || !body.prompt` check (aceitar)
- [x] **V8** `routes/discovery.ts` — validateProjectPath no link endpoint
- [x] **V9** `routes/data.ts` — aceitar: full-replace e o design, validado pelo store name whitelist (C4)
- [x] **V10** `routes/scheduler.ts` — typeof boolean check em enabled
- [x] **V11** `routes/secrets.ts` — max 500 chars no key

---

## MEDIOS — Fail-First Violations (9 issues)

- [x] **FF1** Aceitar: guard por includes() e melhor que nenhum guard. Falso positivo = apenas skip (não causa dano)
- [x] **FF2** Fixado em C8: cascade delete agora limpa dados e seleciona remaining[0]
- [x] **FF3** Aceitar: store pattern normal — caller deve verificar runId antes
- [x] **FF4** Aceitar: store pattern normal — silent no-op e seguro
- [x] **FF5** Aceitar: design intencional — executa sem branch quando git não existe
- [x] **FF6** `pr-creator.ts` — fail-fast: throw Error se switchGhAccount falha
- [x] **FF7** Aceitar: PR number 0 e tratado gracefully no frontend (não mostra link)
- [x] **FF8** Aceitar: caller (updateSession) verifica retorno adequadamente
- [x] **FF9** Aceitar: store pattern normal — silent no-op e seguro

---

## MEDIOS — Misc Data Issues (6 issues)

- [x] **MD1** Aceitar: UI controla input — usuario so ve labels do workspace. Risco baixo.
- [x] **MD2** Aceitar: card_id no doc e apenas referencia. Doc deletado não afeta card.
- [x] **MD3** Aceitar: migração one-time. API keys agora vao pelo daemon (A5).
- [x] **MD4** Fixado em C7: timestamp-based comparison substitui JSON string comparison.
- [x] **MD5** Aceitar: parsing funciona para o formato atual de gh. Fragil mas funcional.
- [x] **MD6** Mitigado: dedup guards (I1-I11) previnem side-effects do double update.

---

## Backlog — Seguranca (original)

- [x] **S3** Secrets migrados para SQLite (Sprint 2). Não ha mais secrets.json em plaintext.
- [x] **S4** Validar `model` contra lista de modelos do agent (validateModel em agent-executor)

## Backlog — Resiliencia / Dados (original)

- [x] **R1** Graceful shutdown no daemon (SIGTERM/SIGINT → server.stop + db.close)
- [x] **R5** Cleanup de jobs antigos (TTL 30 dias — discovery_jobs, scan_history, sessions)
- [x] **R7** Banner de "daemon offline" no frontend (Sprint 3 — useDaemonStatus + root layout)

## Backlog — Performance

- [x] **P1** Cache `detectInstalledAgents` 60s (Sprint perf)
- [x] **P2** Zustand selectors granulares (Sprint 3 — board-view, card-dialog, dashboard)
- [x] **P3** Lazy mount dos panels no CardDialog (Sprint perf)
- [ ] **P4** Virtualizacao no board (react-window) para 100+ cards
- [x] **P5** Backoff no git diff polling (3s → 10s over 10 polls, setTimeout recursivo)

## Backlog — Qualidade de Codigo

- [x] **Q1** Remover duplicação `todosToCards` (Sprint code quality)
- [ ] **Q2** Unificar schema SSE (um formato para chat, agents, discovery)
- [ ] **Q3** Mover `automation-engine.ts` de entities/ para features/automation/
- [ ] **Q4** Extrair form state do `card-dialog.tsx` para custom hook (reduzir 18 props drilling)
- [x] **Q5** Logging estruturado no daemon (logger.ts com timestamp+level+module)
- [x] **Q6** Consolidar prompts de discovery (buildDiscoveryAgentPrompt em utils)

## Backlog — Testes

- [x] **T1** Setup vitest no frontend + bun:test no daemon (Sprint 1)
- [x] **T2** Testes unitarios: card store, docs store, workspace store (Sprint 1 — 24 tests)
- [x] **T3** Testes unitarios daemon: validation, branch-name, file-store, session-manager, task-workspace (Sprint 1 — 64 tests)
- [x] **T4** Testes de integracao: rotas do daemon com input validation (Sprint 1 — 15 tests)
- [ ] **T5** Testes E2E: fluxo card Inbox → Discovery → Spec → Implement

## Backlog — UX / Acessibilidade

- [x] **U1** ARIA: board-column role=region + aria-label, board-card role=button + aria-label + keyboard Enter/Space
- [ ] **U2** Keyboard navigation no board (setas para mover entre colunas)
- [x] **U3** Focus management no CardDialog (autofocus no titulo — Sprint 3)
- [x] **U4** Empty states: coluna sem cards (Sprint 3). Vault/projetos = pendente.
- [ ] **U5** Loading skeletons (usar Skeleton component existente)

## Backlog — Cleanup de Deps

- [x] **D1** Removidas 7 deps não usadas: @xyflow, @rive-app, media-chrome, embla-carousel, react-jsx-parser, tokenlens, next-themes. Mantidas: @supabase (1 uso), ai (type import)

## Pendente (features)

- [x] Live preview dos agents trabalhando no dashboard (Sprint 3 — widget Live Agents)
- [ ] Session tracking + Branch hyperlink no implement panel (Task #50)
- [x] **F1** Botao "Rejeitar" no implement panel (move card pra Ready, reseta spec_status)
- [ ] **F6** Card type "revision" ou label automática quando e re-tentativa
- [x] **F7** Limite de 3 tentativas automaticas (MAX_ATTEMPTS guard no handleStart)

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

> **17 restantes** são Race Conditions (RC1-RC16) no file I/O + 1 EH3 (banner offline).
> As RC são inerentes ao modelo single-process + file-based. Resolver requer: mutex/lock
> por arquivo ou migrar para SQLite. Backlog para quando escala justificar.

---

## Multi-session orchestration — research direction (2026-05-05)

Pergunta levantada após `cockpit watch --all` + `cockpit_implement_async` (MCP Tier 2):
**quando N sessions rodam em paralelo (mesmas ou diferentes engines: claude-code,
opencode, gemini-cli), elas se ignoram. Como evitar conflitos?**

Estado atual:
- **Zero coordenação**. Cada session spawna o agent CLI com a spec do card.
- Isolamento "fraco": cada `implement` cria branch `<type>/<title>-<short_id>` (`pr-creator.ts`).
  Isso protege contra commits cruzados, mas:
  - 2 sessions no MESMO card → mesma branch → race condition no working tree
  - 2 sessions em cards diferentes mesmo projeto → working tree compartilhado, edits stomped
  - Reaper de órfãs (30min) e o único safety net runtime

### Tres direcoes possiveis (ordem custo→correcao):

**Opção A — Project-level lock (cheap, ~1d, cobre 80%)**
- Em `runImplementation`: `daemon/src/tasks/project-lock.ts` com `flock`-style sobre
  `<projectPath>/.cockpit/.lock` ou tabela SQLite `project_locks(path UNIQUE, session_id, acquired_at)`
- Disparar 2a session no mesmo project: ou enfileira (default) ou retorna 409 (`--no-wait`)
- Trade: serializa workflow de 1 projeto, mas e single-user — provavelmente ok
- Bug que resolve: edits stomped, branches criadas em working tree sujo

**Opção B — Git worktrees per-session (correct, ~3-5d)**
- Cada session ganha `<projectPath>.cockpit-worktree/<session_id>/` via `git worktree add`
- Agent CLI roda nesse path isolado; merge/PR ao terminar
- True isolation: 2 sessions no mesmo project, branches diferentes → zero conflito
- Trade: disco (full clone), IDE pode confundir, cleanup pos-merge
- Pre-req: project precisa ser git repo (hoje já e, mas talvez não bare/shallow safe)
- Bug que resolve: tudo de A + cards diferentes simultaneos no mesmo projeto

**Opção C — Coordination prompt (unreliable, ~half-day, NAO recomendado)**
- Injetar no system prompt: "outras sessions ativas: SW80 em src/auth.tsx, SW82 em src/billing/"
- LLM "deveria" evitar overlap. Na pratica: ignoram com frequencia, especialmente em refactors.
- Faz sentido COMO COMPLEMENTO de A ou B (heads-up), nunca como protecao primaria.

### Multi-session UI (separate concern):

Mesmo com isolation resolvido, falta visualizacao:
- Web UI: aba/painel "Live Agents" globalizado (existe widget no dashboard, mas e por workspace)
- File-level live diff stream: cada session emite `appendFile(...)` events; UI desenha mapa
  "agente X tocando arquivo Y" — heatmap de conflito potencial
- Linha do tempo unificada: cada chunk `cockpit watch --all` mas no browser com syntax highlight

Hoje: temos `appendFile` no session-manager. Falta surface UI.

### Recomendacao
1. **Curto prazo**: implementar **Opção A** (project-lock no daemon).
   Resolve a categoria mais comum de problema (working tree stomping) com baixo custo.
   ~1d. Acompanha de erro claro: "project locked by session X (started 12s ago)".
2. **Medio prazo**: experimentar **Opção B** num worktree opt-in (`--worktree` flag).
   Feature gate até validar tradeoffs (disco, IDE).
3. **UI multi-session**: priorizar painel global "Live Agents Cross-Workspace" + file
   heatmap. Reusa SSE existente, sem mudanca no daemon.

Saiu do escopo do v0.1.0. Listar como **F9 — multi-session orchestration** quando
fizer sentido (provavelmente quando primeiro conflito real der dor).
