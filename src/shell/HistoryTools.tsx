import { Redo2, Undo2 } from 'lucide-react'

export type HistoryToolsProps = {
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

/** Undo and Redo as both builders show them, top-left beside the drawer. */
export function HistoryTools({ onUndo, onRedo, canUndo, canRedo }: HistoryToolsProps) {
  return (
    <div className="brick-history-tools" role="group" aria-label="Edit history">
      <button className="studio-icon-button" type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={18} aria-hidden="true" /><span>Undo</span></button>
      <button className="studio-icon-button" type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 size={18} aria-hidden="true" /><span>Redo</span></button>
    </div>
  )
}
