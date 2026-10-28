import { useEffect, useRef, useState } from 'react'
import type { BrickDef } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { nameTaken, suggestName } from '../builder/newBrick'

export const MAX_BRICK_NAME = 24

/**
 * A brick's name, renamed by clicking it wherever it is shown. A brick just made with + New brick opens with the name
 * selected, so typing replaces "My brick 1". Code finds bricks by name, so a name already used becomes "Walker 2", and a
 * hint says so while typing.
 */
export function BrickName({ store, brick, size = 'lg', readOnly = false }: { store: StudioStore; brick: BrickDef; size?: 'md' | 'lg'; readOnly?: boolean }) {
  const naming = useStudio(store, (s) => s.namingBrickId === brick.id)
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const others = bricks.filter((b) => b.id !== brick.id).map((b) => b.name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(brick.name)
  const input = useRef<HTMLInputElement | null>(null)

  useEffect(() => { if (!editing) setDraft(brick.name) }, [brick.name, editing])
  useEffect(() => {
    if (!naming || readOnly) return
    setEditing(true)
    store.clearNaming()
  }, [naming, readOnly, store])
  useEffect(() => {
    if (!editing) return
    input.current?.focus()
    input.current?.select()
  }, [editing])

  const commit = () => {
    const typed = draft.trim().slice(0, MAX_BRICK_NAME)
    const name = nameTaken(typed, others) ? suggestName(typed, others) : typed
    if (name && name !== brick.name) store.renameBrick(brick.id, name)
    setEditing(false)
  }

  if (readOnly || !editing) {
    return <button type="button" className={`cl-name cl-name-${size}`} disabled={readOnly} title={readOnly ? undefined : 'Rename'} aria-label={readOnly ? brick.name : `${brick.name}. Rename`} onClick={() => setEditing(true)}>
      {brick.name}
    </button>
  }
  const dupe = nameTaken(draft, others)
  return <span className="cl-name-edit">
    <input ref={input} className={`cl-name-input cl-name-${size}`} aria-label="Brick name" value={draft} maxLength={MAX_BRICK_NAME}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDraft(brick.name); setEditing(false) }
      }} />
    {dupe && <span className="cl-name-hint cl-pop" role="status">There’s already a {draft.trim()} here, so this one will be “{suggestName(draft, others)}”.</span>}
  </span>
}
