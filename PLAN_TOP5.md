# Plano de Execução — Top 5 Ações Imediatas

Resultado do eval completo (2026-05-03). Cada ação e independente — podem ser executadas em paralelo.

---

## A1 — CORS restrito no daemon

**Risco**: Qualquer site aberto no browser pode chamar `localhost:4800` e executar agents.
**Esforco**: 5 min

### Arquivos
- `daemon/src/index.ts` (linhas 35-41)

### O que fazer
Trocar `Access-Control-Allow-Origin: *` por uma whitelist:

```ts
function corsHeaders(): Record<string, string> {
  const allowedOrigins = ['http://localhost:5173', 'http://localhost:4173']
  return {
    'Access-Control-Allow-Origin': allowedOrigins[0], // vite dev
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
```

Melhor: ler o `Origin` header do request e validar contra a whitelist:

```ts
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || ''
  const allowed = ['http://localhost:5173', 'http://localhost:4173']
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
```

Atualizar as 2 chamadas a `corsHeaders()` em `fetch()` para passar `req`.

### Verificacao
1. Frontend em localhost:5173 funciona normalmente
2. Abrir DevTools em outro site e tentar `fetch('http://localhost:4800/health')` → bloqueado por CORS

---

## A2 — Timeout no agent executor

**Risco**: Agent travado = stream infinito, conexao presa pra sempre.
**Esforco**: 30 min

### Arquivos
- `daemon/src/executor/agent-executor.ts` (funções `executeAgent`, `executeAgentWithCallbacks`, `executeAgentStreaming`)

### O que fazer

1. Criar helper de timeout:

```ts
const AGENT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutos

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} excedeu ${ms/1000}s`)), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
```

2. Envolver `await proc.exited` com timeout nas 3 funções:

```ts
// executeAgent (linha 187)
const exitCode = await withTimeout(proc.exited, AGENT_TIMEOUT_MS, request.agent)

// executeAgentWithCallbacks (linha 248)
const exitCode = await withTimeout(proc.exited, AGENT_TIMEOUT_MS, request.agent)

// executeAgentStreaming (linha 304)
const exitCode = await withTimeout(proc.exited, AGENT_TIMEOUT_MS, request.agent)
```

3. No catch do timeout, matar o processo:

```ts
} catch (err) {
  proc?.kill()
  return {
    agent: request.agent,
    output: err instanceof Error ? err.message : 'Unknown error',
    exitCode: 1,
    duration: Date.now() - startTime,
  }
}
```

4. `executeAgentStreaming` (linha 283) também precisa do `usePipe` para prompts grandes (hoje esta faltando):

```ts
const usePipe = request.prompt.length > 4000
const args = usePipe
  ? agentDef.buildArgs(agentDef.headlessFlag, '-', request.model)
  : agentDef.buildArgs(agentDef.headlessFlag, request.prompt, request.model)
```

### Verificacao
1. Executar agent normalmente → funciona sem mudanca
2. Simular timeout (setar AGENT_TIMEOUT_MS para 5s) → processo morto, erro retornado

---

## A3 — Error Boundary no CardDialog e panels

**Risco**: Um erro em qualquer panel (spec, interview, implement, agent) crasha o app inteiro.
**Esforco**: 15 min

### Arquivos
- `src/components/ui/error-boundary.tsx` (NOVO)
- `src/features/board/card-dialog.tsx` (linhas 205-219)

### O que fazer

1. Criar componente ErrorBoundary:

```tsx
// src/components/ui/error-boundary.tsx
import { Component, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from './button'

interface Props { children: ReactNode; fallbackLabel?: string }
interface State { hasError: boolean; error: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Erro no {this.props.fallbackLabel || 'painel'}</p>
          <p className="text-xs text-muted-foreground max-w-xs">{this.state.error}</p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false, error: null })}>
            Tentar novamente
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
```

2. Envolver cada panel no card-dialog.tsx:

```tsx
<div className={`... ${activeTab === 'interview' ? 'flex flex-col' : 'hidden'}`}>
  <ErrorBoundary fallbackLabel="Entrevista">
    <InterviewPanel card={card} workspaceId={workspaceId} />
  </ErrorBoundary>
</div>
```

Repetir para SpecPanel, ImplementPanel, AgentChat.

### Verificacao
1. Simular erro em um panel (throw Error no useEffect) → apenas aquele panel mostra fallback
2. Clicar "Tentar novamente" → panel re-renderiza

---

## A4 — Centralizar DAEMON_URL

**Risco**: 6 definicoes duplicadas de `DAEMON_URL`, inconsistencia e manutenção.
**Esforco**: 15 min

### Arquivos afetados (remover declaracao local)
1. `src/features/agent-runner/agent-service.ts` (linha 9)
2. `src/entities/card/automation-engine.ts` (linha 7)
3. `src/shared/lib/daemon-client.ts` (linha 3)
4. `src/shared/lib/persistence/adapters/daemon-storage.ts` (linha 3)
5. `src/features/implement/implement-panel.tsx` (linha 17)
6. `src/app/routes/discovery.tsx` (linha 169, dentro de função)

### O que fazer

1. Adicionar em `src/shared/lib/constants.ts`:

```ts
export const DAEMON_URL = import.meta.env.VITE_DAEMON_URL || 'http://localhost:4800'
```

2. Em cada arquivo acima, remover a declaracao local e importar:

```ts
import { DAEMON_URL } from '@/shared/lib/constants'
```

3. Caso especial: `discovery.tsx` linha 169 declara dentro de um callback. Mover para import no topo.

### Verificacao
1. `grep -r "DAEMON_URL" src/` → deve aparecer so em constants.ts (definicao) e imports
2. Frontend funciona normalmente com daemon rodando

---

## A5 — Proxiar API keys pelo daemon

**Risco**: API keys do usuario expostas no DevTools Network tab quando usa provider direto.
**Esforco**: 1h

### Contexto
Hoje `agent-service.ts` tem 3 caminhos:
- Sem API key → rota pelo daemon (`/chat/run`) — seguro
- Com API key → chamada direta pra `api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com` — inseguro

### Arquivos
- `daemon/src/routes/chat.ts` — adicionar suporte a provider direto
- `daemon/src/persistence/secrets-store.ts` — já armazena keys
- `src/features/agent-runner/agent-service.ts` — simplificar, sempre rotear pelo daemon

### O que fazer

**Daemon — nova rota `POST /chat/api`:**

```ts
// daemon/src/routes/chat.ts — adicionar handler

// POST /chat/api — proxy para APIs diretas (Claude, OpenAI, Gemini)
if (path === '/chat/api' && req.method === 'POST') {
  const body = await req.json() as {
    provider: 'claude' | 'openai' | 'gemini'
    model: string
    systemPrompt: string
    messages: ChatMessage[]
    maxTokens?: number
    temperature?: number
  }

  const apiKey = getSecret(body.provider)
  if (!apiKey) {
    return jsonResponse({ error: `API key para ${body.provider} não configurada` }, 400)
  }

  // Fazer a chamada pra API usando a key do secrets store
  // Retornar SSE stream pro frontend (mesmo formato do /chat/run)
}
```

Implementar cada provider (Claude, OpenAI, Gemini) no daemon, reutilizando a lógica que hoje esta no `agent-service.ts` (linhas 117-256). Mover as funções `runClaude`, `runOpenAI`, `runGemini` para o daemon.

**Frontend — simplificar `agent-service.ts`:**

```ts
export async function runAgent(config, messages, apiKey, callbacks, signal, projectPath) {
  // Sempre rotear pelo daemon
  // Se tem API key configurada no daemon → usa API direta (via /chat/api)
  // Se não → usa CLI agent (via /chat/run)
  return runViaDaemon(config, messages, callbacks, signal, projectPath)
}
```

O frontend não precisa mais saber a API key. O daemon decide qual caminho usar baseado nas keys que tem no secrets store.

### Verificacao
1. Configurar API key via Settings → daemon armazena
2. Chat/Spec/Interview usa API direta → request vai pro daemon, não pro provider
3. DevTools Network → nenhuma chamada pra api.anthropic.com/openai/google
4. Sem API key → continua usando CLI agent via daemon

---

## Ordem de Execução Sugerida

```
A1 (5 min)  →  A4 (15 min)  →  A3 (15 min)  →  A2 (30 min)  →  A5 (1h)
   CORS          DRY             Safety          Stability        Security
```

A1 e A4 são rapidos e independentes — podem ir primeiro.
A3 protege o UX imediatamente.
A2 evita travamento do daemon.
A5 e a maior mudanca mas a mais importante pra seguranca.

Tempo total estimado: ~2h
