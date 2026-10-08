import { Search, Trash2 } from 'lucide-react'
import type { Value } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { isKnobNumber, knobRange, snapKnob } from './knobs'
import { CostumeThumb } from './tileArt'
import { knobEdit, removeCopyEdit, type History } from './history'
import { isSingleton } from './limits'
import { cellCount, removeCell, selectedCell } from './cells'

/**
 * The card above the Placing strip when a copy is selected: the brick's picture and name, how many copies are in this
 * level, 🔍 See inside (opens the Brick Workshop), Remove, and this copy's knobs.
 */
export function SeeInsideCard({ store, history }: { store: StudioStore; history?: History }) {
  const copyId = useStudio(store, (s) => s.selectedCopyId)
  const design = useStudio(store, (s) => s.project.design)
  const cell = selectedCell(design, copyId)
  const copy = copyId && !cell ? design.copies.find((c) => c.id === copyId) : undefined
  const brick = cell?.brick ?? (copy ? design.bricks.find((b) => b.id === copy.brickId) : undefined)
  if (!brick || (!cell && !copy)) return null

  const count = cell ? cellCount(design, cell.ch) : design.copies.filter((c) => c.brickId === brick.id).length
  // One-per-level bricks (Hero, Goal) have no per-copy knobs: their knobs live in See inside (the workshop).
  // Grid cells have no per-copy knobs either (GridSpec): their code and variables are the brick's.
  const single = !cell && isSingleton(brick)
  const knobs = single || cell ? [] : brick.program.variables.filter((v) => v.showInBuild)
  const setKnob = (variableId: string, value: Value) => {
    if (!copy) return
    const before = copy.knobs?.[variableId]
    history?.push(knobEdit(history, copy.id, variableId, before, value))
    store.setKnob(copy.id, variableId, value)
  }

  return (
    <section className="builder-inside" aria-label={`${brick.name} copy`}>
      <div className="builder-inside-head">
        <span className="builder-inside-icon" aria-hidden="true">
          <CostumeThumb asset={brick.costumes[0]?.asset} box={34} />
        </span>
        <span className="builder-inside-text">
          <strong>{brick.name}</strong>
          <span>{single ? 'One per level' : `${count} in this level`}</span>
          {single && <span>Place it again to move it</span>}
        </span>
        <button type="button" className="builder-btn builder-btn-primary" onClick={() => store.openWorkshop(brick.id)} title="See how this brick works">
          <Search size={16} aria-hidden="true" />
          <span>See inside</span>
        </button>
        {/* The Hero and the Goal have no Remove: a level without them cannot be played, and one click should not do that.
            To change where they are, place them again (that moves them). */}
        {!single && (
          <button
            type="button"
            className="builder-btn builder-btn-danger"
            aria-label={`Remove this ${brick.name}`}
            title={cell ? 'Remove this block' : 'Remove this copy'}
            onClick={() => {
              if (cell) return removeCell(store, history, cell.col, cell.row)
              if (!copy) return
              if (history) history.push(removeCopyEdit(history, copy))
              store.deleteCopy(copy.id)
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>Remove</span>
          </button>
        )}
      </div>
      {copy && knobs.length > 0 && (
        <div className="builder-knobs" role="group" aria-label="This copy's knobs">
          {knobs.map((v) => {
            const value: Value = copy.knobs?.[v.id] ?? v.value
            return (
              <label key={v.id} className="builder-knob">
                <span className="builder-knob-name">{v.name}</span>
                {isKnobNumber(value) && isKnobNumber(v.value) ? (
                  <KnobSlider name={v.name} start={v.value} value={value} onChange={(n) => setKnob(v.id, n)} />
                ) : typeof value === 'boolean' ? (
                  <button type="button" className="builder-btn" aria-pressed={value} onClick={() => setKnob(v.id, !value)}>
                    {value ? 'On' : 'Off'}
                  </button>
                ) : (
                  <span className="builder-knob-value">{String(value)}</span>
                )}
              </label>
            )
          })}
        </div>
      )}
    </section>
  )
}

function KnobSlider({ name, start, value, onChange }: { name: string; start: number; value: number; onChange: (n: number) => void }) {
  const r = knobRange(start, value)
  return (
    <span className="builder-knob-control">
      <input
        type="range"
        aria-label={name}
        min={r.min}
        max={r.max}
        step={r.step}
        value={value}
        onChange={(e) => onChange(snapKnob(Number(e.target.value), r.step))}
      />
      <output className="builder-knob-value">{value}</output>
    </span>
  )
}
