export interface Doc {
  id: string
  workspace_id: string
  project_id: string | null
  title: string
  content: string
  tags: string[]
  source: 'manual' | 'jira-mirror' | 'agent-generated'
  source_ref: string | null
  card_id: string | null
  created_at: string
  updated_at: string
}

export type DocInsert = Omit<Doc, 'id' | 'created_at' | 'updated_at'>
