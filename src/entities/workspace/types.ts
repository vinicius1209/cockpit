/** Hooks shell scripts executados pelo daemon em momentos do ciclo de
 *  implementação. Cada string e um script bash inteiro (multi-linha ok).
 *  Daemon executa com timeout de 60s e injeta env vars (CARD_ID, SESSION_ID,
 *  BRANCH, PR_URL, etc). Strings vazias = hook desabilitado. */
export interface WorkspaceHooks {
  /** Antes do agent CLI spawnar (após lock + branch criada). Exit != 0 aborta. */
  before_implement?: string
  /** Depois do agent terminar com sucesso, ANTES do PR ser criado. */
  after_implement?: string
  /** Depois do PR ser criado com sucesso. Recebe PR_URL e PR_NUMBER. */
  after_pr?: string
}

export interface Workspace {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string | null
  created_at: string
  updated_at: string
  hooks?: WorkspaceHooks
}

export type WorkspaceInsert = Omit<Workspace, 'id' | 'created_at' | 'updated_at'>
export type WorkspaceUpdate = Partial<WorkspaceInsert>
