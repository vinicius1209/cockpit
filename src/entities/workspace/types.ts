export interface Workspace {
  id: string
  name: string
  slug: string
  description: string | null
  color: string
  icon: string | null
  created_at: string
  updated_at: string
}

export type WorkspaceInsert = Omit<Workspace, 'id' | 'created_at' | 'updated_at'>
export type WorkspaceUpdate = Partial<WorkspaceInsert>
