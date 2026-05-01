import type { ProjectScanResult } from '../scanner/project-scanner'

export function generateAgentsMd(scan: ProjectScanResult): string {
  const stackList = scan.stack.length > 0 ? scan.stack.join(', ') : 'N/A'
  const depsCount = Object.keys(scan.dependencies).length
  const devDepsCount = Object.keys(scan.devDependencies).length
  const topDirs = scan.structure
    .filter((s) => s.startsWith('📁'))
    .map((s) => s.replace('📁 ', ''))
    .slice(0, 10)

  return `# AGENTS.md - ${scan.name}

## OVERVIEW
Projeto: ${scan.name}
Stack: ${stackList}
${scan.git ? `Branch principal: ${scan.git.branch}` : ''}
${scan.git?.remoteUrl ? `Repositorio: ${scan.git.remoteUrl}` : ''}

## STRUCTURE
${topDirs.map((d) => `- \`${d}/\``).join('\n')}

## CONVENTIONS
- **Linguagem UI**: Todo texto voltado ao usuario em **Portugues Brasileiro (pt-BR)**
- **Anotacoes de codigo**: Usar os seguintes marcadores em comentarios para rastreamento automatico:
  - \`// TODO: descricao\` — Tarefa pendente a ser implementada
  - \`// FIXME: descricao\` — Bug ou problema conhecido que precisa correcao
  - \`// HACK: descricao\` — Solucao temporaria que precisa ser refatorada
  - \`// BUG: descricao\` — Bug identificado mas nao corrigido ainda
- **Ao concluir uma tarefa**: Remover a anotacao correspondente do codigo
- **Ao encontrar problemas durante desenvolvimento**: Anotar imediatamente com o marcador apropriado

## DEPENDENCIES
${depsCount > 0 ? `- ${depsCount} dependencias de producao` : '- Nenhuma dependencia detectada'}
${devDepsCount > 0 ? `- ${devDepsCount} dependencias de desenvolvimento` : ''}

## COMMANDS
${Object.keys(scan.scripts).length > 0 ? Object.entries(scan.scripts).slice(0, 10).map(([k, v]) => `- \`npm run ${k}\` — \`${v}\``).join('\n') : '- Nenhum script detectado'}
`
}

export function generateClaudeMd(scan: ProjectScanResult): string {
  const stackList = scan.stack.length > 0 ? scan.stack.join(', ') : 'a ser definida'

  return `# CLAUDE.md - ${scan.name}

## Contexto
Este projeto faz parte do ecossistema gerenciado pelo Cockpit VM Solucoes.
Stack: ${stackList}

## Instrucoes Gerais
- Linguagem: Portugues Brasileiro (pt-BR) para textos de UI e comentarios
- Ao encontrar problemas no codigo, anote com os marcadores apropriados:
  - \`// TODO: descricao\` para tarefas pendentes
  - \`// FIXME: descricao\` para bugs conhecidos
  - \`// HACK: descricao\` para solucoes temporarias
  - \`// BUG: descricao\` para bugs identificados
- Ao resolver um problema anotado, remova o marcador do codigo
- Siga as convencoes existentes do projeto (formatacao, naming, estrutura)

## Workflow
1. Antes de implementar, verifique se existe spec ou card relacionado
2. Anote qualquer debt tecnico encontrado durante o desenvolvimento
3. Apos concluir, remova anotacoes resolvidas

## Comandos Uteis
${Object.entries(scan.scripts).slice(0, 8).map(([k, v]) => `- \`npm run ${k}\` — ${v}`).join('\n') || '- Consulte package.json para scripts disponiveis'}
`
}

export function generateAnnotateCommand(): string {
  return `# /annotate - Anotar problemas no codigo

Analise o codigo do projeto e adicione anotacoes estruturadas nos locais apropriados.

## Tipos de anotacao
- \`// TODO: descricao\` — Funcionalidade pendente
- \`// FIXME: descricao\` — Bug ou comportamento incorreto
- \`// HACK: descricao\` — Workaround temporario
- \`// BUG: descricao\` — Bug identificado

## Instrucoes
1. Percorra os arquivos do projeto
2. Identifique: codigo duplicado, tratamento de erro ausente, TODOs implicitos, funcoes muito longas, tipos faltando, testes ausentes
3. Adicione anotacoes com descricao clara e concisa
4. Nao altere logica de negocio, apenas adicione comentarios
5. Foque nos problemas mais criticos primeiro

## Formato
Cada anotacao deve ter o formato:
\`\`\`
// TIPO: Descricao clara do problema ou tarefa
\`\`\`

Exemplo:
\`\`\`typescript
// FIXME: Funcao nao trata caso de lista vazia, causa crash em producao
// TODO: Implementar paginacao na listagem de clientes
// HACK: Usando timeout de 5s como workaround para race condition
\`\`\`
`
}

export function generateReviewCommand(): string {
  return `# /review - Revisar e anotar debt tecnico

Faca uma revisao completa do codigo buscando:

1. **Seguranca**: SQL injection, XSS, secrets expostos, auth bypass
2. **Performance**: N+1 queries, loops desnecessarios, falta de cache, bundle size
3. **Qualidade**: Funcoes > 50 linhas, duplicacao, tipos any/unknown, error handling
4. **Testes**: Funcoes criticas sem teste, edge cases nao cobertos
5. **Deps**: Dependencias desatualizadas, vulnerabilidades conhecidas

Para cada problema encontrado, adicione um comentario no codigo com o marcador apropriado (TODO, FIXME, HACK, BUG).

Ao final, liste um resumo dos problemas encontrados por categoria.
`
}
