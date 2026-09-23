import { useEffect, useRef, useState } from 'react'
import type { DerivedCreation } from '../model/creations'
import { startersFor, type Starter } from '../program/starters'
import { PROGRAM_LIMITS, type RoboticsProgram } from '../program/types'

/**
 * The creation's programs as tabs (CP2-PLAN §7): switch with a click, rename with a
 * double-click or the ⋯ menu, delete from the menu after a confirm, and "+" to start a
 * new one from a starter that fits this creation (or blank).
 */
export type ProgramTabsProps = {
  creation: DerivedCreation
  programs: readonly RoboticsProgram[]
  activeId: string
  onSelect: (programId: string) => void
  onAdd: (starter: Starter) => void
  onRename: (programId: string, name: string) => void
  onDelete: (programId: string) => void
}

/** Closes a popover on Escape or a pointer outside it. */
function useDismiss(open: boolean, root: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close() }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      close()
    }
    window.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open, root, close])
}

export function ProgramTabs({ creation, programs, activeId, onSelect, onAdd, onRename, onDelete }: ProgramTabsProps) {
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<RoboticsProgram | null>(null)
  const menuRoot = useRef<HTMLDivElement>(null)
  const addRoot = useRef<HTMLDivElement>(null)
  const closeMenu = () => setMenuFor(null)
  const closeAdd = () => setAdding(false)
  useDismiss(menuFor !== null, menuRoot, closeMenu)
  useDismiss(adding, addRoot, closeAdd)
  const full = programs.length >= PROGRAM_LIMITS.maxProgramsPerCreation
  const starters = adding ? startersFor(creation) : []

  const commitRename = () => {
    if (!renaming) return
    if (renaming.name.trim()) onRename(renaming.id, renaming.name)
    setRenaming(null)
  }

  return (
    <div className="robo-tabs-row">
      <div className="robo-tabs" role="tablist" aria-label="Programs">
        {programs.map((program) => {
          const active = program.id === activeId
          if (renaming?.id === program.id) {
            return (
              <input
                key={program.id}
                className="robo-tab-rename"
                aria-label="Program name"
                autoFocus
                maxLength={PROGRAM_LIMITS.maxNameLength}
                value={renaming.name}
                onChange={(event) => setRenaming({ id: program.id, name: event.target.value })}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRenaming(null) }
                }}
              />
            )
          }
          return (
            <span key={program.id} className={`robo-tab-wrap${active ? ' on' : ''}`} ref={active ? menuRoot : undefined}>
              <button
                type="button"
                role="tab"
                className={`robo-tab${active ? ' on' : ''}`}
                aria-selected={active}
                data-program-id={program.id}
                title={active ? 'Double-click to rename' : undefined}
                onClick={() => { if (!active) onSelect(program.id) }}
                onDoubleClick={() => setRenaming({ id: program.id, name: program.name })}
              >{program.name}</button>
              {active && (
                <button type="button" className="robo-tab-more" aria-label={`${program.name} options`} aria-haspopup="menu" aria-expanded={menuFor === program.id} onClick={() => setMenuFor(menuFor === program.id ? null : program.id)}>⋯</button>
              )}
              {menuFor === program.id && (
                <div className="robo-menu" role="menu" aria-label={`${program.name} options`}>
                  <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setRenaming({ id: program.id, name: program.name }) }}>Rename</button>
                  <button type="button" role="menuitem" className="danger" disabled={programs.length <= 1} title={programs.length <= 1 ? 'A creation keeps at least one program. Add another first.' : undefined} onClick={() => { setMenuFor(null); setConfirmDelete(program) }}>Delete…</button>
                </div>
              )}
            </span>
          )
        })}
      </div>
      <div className="robo-add" ref={addRoot}>
        <button
          type="button"
          className="robo-tab-add"
          aria-label="New program"
          title={full ? `A creation can have ${PROGRAM_LIMITS.maxProgramsPerCreation} programs. Delete one first.` : 'New program'}
          aria-haspopup="menu"
          aria-expanded={adding}
          disabled={full}
          onClick={() => setAdding(!adding)}
        >+</button>
        {adding && (
          <div className="robo-menu robo-starters" role="menu" aria-label="Start a program" data-testid="robo-starters-menu">
            <p className="robo-menu-title">Start from</p>
            {starters.map((starter) => (
              <button key={starter.id} type="button" role="menuitem" data-starter={starter.id} onClick={() => { setAdding(false); onAdd(starter) }}>
                <strong>{starter.id === 'blank' ? 'Blank' : starter.name}</strong>
                <span>{starter.id === 'blank' ? 'One “when run” block. Build it your way.' : starter.goal}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {confirmDelete && (
        <div className="robo-confirm" role="alertdialog" aria-modal="false" aria-labelledby="robo-confirm-title" data-testid="robo-delete-confirm">
          <p id="robo-confirm-title">Delete “{confirmDelete.name}”? Its blocks can’t be brought back.</p>
          <div>
            <button type="button" className="robo-button" autoFocus onClick={() => setConfirmDelete(null)}>Keep it</button>
            <button type="button" className="robo-button danger" onClick={() => { const id = confirmDelete.id; setConfirmDelete(null); onDelete(id) }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  )
}
