# Dogfood — checklist de validação real do Cockpit

Antes de adicionar mais features, vale a pena **usar o Cockpit num projeto seu de verdade** e mapear o que trava. Esse arquivo é o roteiro pra esse exercício.

> **Tempo estimado:** 1-2 horas em um projeto que você já conhece (não em projeto novo — você quer testar Cockpit, não aprender o domínio).

---

## Pré-flight

- [ ] Daemon rodando (`cockpit daemon status` mostra `loaded` + `online`)
- [ ] CLI instalado (`cockpit doctor` sem erros, `cockpit` mostra status)
- [ ] MCP registrado no Claude Code (`/mcp` lista `cockpit` em sessão nova)
- [ ] Pelo menos 1 workspace + 1 projeto vinculado existem (Web UI > workspace settings > Projetos)
- [ ] `gh` autenticado se o projeto tem `auto_pr: true`

---

## Cenários de uso (ordem natural)

### 1. Triagem — capturar 5 cards num burst

**Objetivo:** validar que a friction de "anotar uma ideia" é mínima.

- [ ] Abre `cockpit tui`, navega para o workspace certo
- [ ] Sai do TUI e roda 5×: `cockpit card new "..." --type bugfix --prio high`
  - bug que você já tem na cabeça do projeto
  - feature que ficou pendente
  - chore (refactor pequeno)
  - improvement
  - discovery (algo pra investigar)
- [ ] Confirma todos no `cockpit board`
- [ ] **Anota friction:** quantos cliques? mensagens de erro? qual fluxo foi confuso?

### 2. Spec writing — entrevista + spec automática

**Objetivo:** validar o pipeline de spec antes da implementação.

- [ ] Pega o card de bug e abre no Web UI: `http://127.0.0.1:5173`
- [ ] Tab Entrevista: digita 3-5 mensagens descrevendo o problema
- [ ] Tab Spec → "Gerar com AI" (acompanha live transmission overlay)
- [ ] Lê a spec gerada, ajusta manualmente se necessário
- [ ] Marca `Ready`
- [ ] **Anota friction:** spec gerada faz sentido? AI usa o contexto da entrevista? UX da geração é clara?

### 3. Implementação simples — 1 card, modo lock (default)

**Objetivo:** validar o fluxo completo card → branch → agent → PR.

- [ ] No Claude Code: `"implementa o SW79"` → MCP dispara via `cockpit_implement_async`
- [ ] Em outro terminal: `cockpit watch SW79` (acompanha live)
- [ ] **Mantém o terminal aberto** — anota:
  - quanto tempo até primeira chunk útil?
  - tool calls fazem sentido?
  - qual seria o melhor momento pra interromper se o agent fosse pra rumo errado?
- [ ] Quando terminar: vai pro PR no GitHub, lê o diff
- [ ] **Anota friction:** PR description bate com a spec? branch nome legível? algum arquivo tocado que não devia?

### 4. Re-implementação com feedback

**Objetivo:** validar o loop de iteração quando o agent erra algo.

- [ ] Pega o resultado do passo 3 e identifica 1 coisa que ficou parcial
- [ ] No Web UI: clica "Re-implementar com feedback"
- [ ] Escreve o feedback específico (ex: "PDF ainda corta na direita em A4 portrait")
- [ ] Acompanha a 2ª tentativa
- [ ] **Anota friction:** feedback foi entendido? agent re-leu spec? branch reaproveitada?

### 5. Multi-card paralelo (testar F9-A lock)

**Objetivo:** **forçar** o conflito de project lock pra ver UX do erro.

- [ ] Dispara `cockpit implement SW80 --watch` em 1 terminal
- [ ] **Sem esperar terminar**, em outro terminal: `cockpit implement SW81 --watch` no mesmo projeto
- [ ] Esperado: 2º recebe `PROJECT LOCKED` com card_id, agent, idade da session
- [ ] **Anota friction:** mensagem é clara? você sabe o que fazer? as opções listadas funcionam?

### 6. Multi-card paralelo (testar F9-B worktree)

**Objetivo:** validar isolamento real.

- [ ] Dispara `cockpit implement SW80 --isolation worktree --watch`
- [ ] Em paralelo: `cockpit implement SW81 --isolation worktree --watch` (mesmo projeto)
- [ ] Esperado: 2 worktrees em `<project>.cockpit-worktrees/<sessionId>/`, agents trabalham em paralelo, cada um sua branch
- [ ] Após terminar ambos: confirma worktrees foram limpos automaticamente
- [ ] **Anota friction:** install/build duplicado pesa? alguma porta colidiu? worktree ficou orfão?

### 7. Descartar cards (F10)

**Objetivo:** validar que `Descartar` é melhor que `Excluir` na maioria dos casos.

- [ ] Pega 1 card que você decidiu não fazer → clica `Descartar` (botão amber no Web UI)
- [ ] Confirma: some do board, não some das métricas
- [ ] Toggle `descartados` no filtro do board → reaparece com style apagado
- [ ] Reativar via clicar no card e clicar `Reativar`
- [ ] **Anota friction:** o caminho de "esconder mas não perder" foi suficiente? Faltou algum lugar pra ver descartados?

### 8. TUI fullscreen (`cockpit tui`)

**Objetivo:** validar que a TUI substitui Web UI pra navegação rápida.

- [ ] `cockpit tui` — navega entre colunas com setas, abre 2 cards
- [ ] Tab → vai pra Sessions screen, vê quem tá rodando
- [ ] Enter numa session → live tail
- [ ] `w` → troca de workspace
- [ ] `q` → volta pro shell limpo (sem lixo na tela)
- [ ] **Anota friction:** algum atalho intuitivo faltou? layout estourou em terminal pequeno?

### 9. Métricas em uma sentada de uso

**Objetivo:** ver se as métricas têm valor de verdade depois de usar.

- [ ] `cockpit metrics` ou Dashboard no Web UI
- [ ] **Anota:** algum número te disse algo novo? Ou todos eram óbvios?

### 10. Daemon lifecycle (boot do mac)

**Objetivo:** validar o launchd auto-start.

- [ ] `cockpit daemon install` (se ainda não fez)
- [ ] Reinicia o mac
- [ ] Após login: `cockpit daemon status` em terminal novo → deveria mostrar `loaded` + `online` sem você ter feito nada
- [ ] **Anota friction:** demorou pra subir? algum erro nos logs (`cockpit daemon logs`)?

---

## O que registrar

Cada item da checklist tem campo "anota friction". Concentre essas anotações em **issues no GitHub** (`https://github.com/vinicius1209/cockpit/issues/new`):

- 1 issue por friction concreta — não por tema
- Título no formato `[area] descrição curta` (ex: `[tui] terminal estreito quebra layout do board`)
- Body: passos pra reproduzir + screenshot/log se possível
- Label sugerida: `dogfood-feedback`

**Resultado esperado do exercício:** 5-15 issues que viram backlog real do próximo bloco. Mais valioso que codar 1 feature nova.

---

## Quando voltar pra esse arquivo

Atualize com **novos cenários** quando:

- Adicionar feature nova que vale validar real
- Bug recorrente sair em produção (vira teste de regressão)
- Workflow muda significativamente (ex: novo agent, nova etapa do pipeline)

---

## Anotações livres

Espaço pra você escrever observações que não cabem em issues:

```
data: 2026-MM-DD
projeto usado:
tempo total dogfood:
N issues abertas:
maior friction:
maior surpresa boa:
o que iria mudar primeiro:
```
