export interface DocTemplate {
  id: string
  name: string
  description: string
  content: string
}

export const DOC_TEMPLATES: DocTemplate[] = [
  {
    id: 'blank',
    name: 'Documento livre',
    description: 'Comece do zero',
    content: '',
  },
  {
    id: 'adr',
    name: 'ADR (Architecture Decision Record)',
    description: 'Registrar uma decisão arquitetural',
    content: `# ADR: [Titulo da decisão]

## Status
Proposta | Aceita | Deprecada | Substituida

## Contexto
Descreva o contexto e o problema que motivou essa decisão.

## Decisao
Descreva a decisão tomada e as razões.

## Consequencias

### Positivas
-

### Negativas
-

### Riscos
-

## Notas
`,
  },
  {
    id: 'rfc',
    name: 'RFC (Request for Comments)',
    description: 'Proposta técnica para discussao',
    content: `# RFC: [Titulo da proposta]

## Resumo
Uma descrição breve da proposta (2-3 frases).

## Motivacao
Por que essa mudanca e necessária? Qual problema resolve?

## Proposta Detalhada
Descreva a solucao proposta em detalhes.

### Arquitetura
### Implementação
### Migracao

## Alternativas Consideradas

### Alternativa 1
- **Descrição**:
- **Pros**:
- **Contras**:

### Alternativa 2
- **Descrição**:
- **Pros**:
- **Contras**:

## Plano de Implementação
1.
2.
3.

## Perguntas em Aberto
-
`,
  },
  {
    id: 'runbook',
    name: 'Runbook',
    description: 'Guia operacional passo a passo',
    content: `# Runbook: [Nome do procedimento]

## Objetivo
O que esse runbook resolve ou executa.

## Pre-requisitos
- [ ] Acesso a ...
- [ ] Ferramentas: ...
- [ ] Permissoes: ...

## Passos

### 1. [Passo 1]
\`\`\`bash
# comando
\`\`\`

### 2. [Passo 2]

### 3. [Passo 3]

## Verificacao
Como confirmar que o procedimento foi bem sucedido.

## Rollback
Passos para reverter em caso de problema.

## Contatos
| Papel | Nome | Canal |
|-------|------|-------|
| Owner | | |
| Backup | | |
`,
  },
  {
    id: 'story',
    name: 'Story (Jira/Agile)',
    description: 'Historia de usuario com criterios de aceite',
    content: `# [PROJ-XXX] Titulo da story

## User Story
**Como** [persona/papel],
**quero** [ação/funcionalidade],
**para** [beneficio/valor].

## Descrição
Contexto adicional sobre a necessidade.

## Criterios de Aceite
- [ ] CA1:
- [ ] CA2:
- [ ] CA3:

## Regras de Negocio
- RN1:
- RN2:

## Mockup / Wireframe
(adicionar imagens ou links)

## Notas Tecnicas
-

## Estimativa
Story Points:
`,
  },
  {
    id: 'postmortem',
    name: 'Post-mortem',
    description: 'Analise de incidente',
    content: `# Post-mortem: [Nome do incidente]

## Resumo
**Data**: DD/MM/YYYY
**Duracao**: Xh Xmin
**Severidade**: P1 | P2 | P3
**Impacto**: X usuarios afetados

## Timeline
| Hora | Evento |
|------|--------|
| HH:MM | Incidente detectado |
| HH:MM | Investigacao iniciada |
| HH:MM | Causa identificada |
| HH:MM | Fix aplicado |
| HH:MM | Servico restaurado |

## Causa Raiz
Descreva a causa raiz do incidente.

## Deteccao
Como o incidente foi detectado? Alertas? Usuarios?

## Resolucao
O que foi feito para resolver.

## Ações Preventivas
- [ ] Ação 1:
- [ ] Ação 2:
- [ ] Ação 3:

## Licoes Aprendidas
- O que funcionou bem:
- O que pode melhorar:
`,
  },
]
