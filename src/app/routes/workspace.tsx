import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useWorkspaceStore } from '@/entities/workspace/store'
import { useCardStore } from '@/entities/card/store'
import { BoardView } from '@/features/board/board-view'

export function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { setActiveWorkspace } = useWorkspaceStore()
  const { initWorkspaceColumns } = useCardStore()

  useEffect(() => {
    if (workspaceId) {
      setActiveWorkspace(workspaceId)
      initWorkspaceColumns(workspaceId)
    }
  }, [workspaceId, setActiveWorkspace, initWorkspaceColumns])

  if (!workspaceId) return null

  return (
    <div className="h-full">
      <BoardView />
    </div>
  )
}
