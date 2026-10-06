import { Search, Trash2 } from 'lucide-react'
import type { Value } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { isKnobNumber, knobRange, snapKnob } from './knobs'
import { CostumeThumb } from './tileArt'
import { removeCopyEdit, type History } from './history'

/**
 * The card above the Placing strip when a copy is selected: the brick's picture and name, how many copies are in this
 * level, 🔍 See inside (opens the Brick Workshop), Remove, and this copy's knobs.
 */
export function SeeInsideCard({ store, history }: { store: StudioStore; history?: History }) {
  const copyId = useStudio(store, (s) => s.selectedCopyId)
  const design = useStudio(store, (s) => s.project.design)
  const copy = copyId ? design.copies.find((c) => c.id === copyId) : undefined
  const brick = copy ? design.bricks.find((b) => b.id === copy.brickId) : undefined
  if (!copy || !brick) return null

  const count = design.copies.filter((c) => c.brickId === brick.id).length
  const knobs = brick.program.variables.filter((v) => v.showInBuild)

  return (
    <section className="builder-inside" aria-label={`${brick.name} copy`}>
      <div className="builder-inside-head">
        <span className="builder-inside-icon" aria-hidden="true">
          <CostumeThumb asset={brick.costumes[0]?.asset} box={34} />
        </span>
        <span className="builder-inside-text">
          <strong>{brick.name}</strong>
          <span>{count} in this level</span>
        </span>
        <button type="button" className="builder-btn builder-btn-primary" onClick={() => store.openWorkshop(brick.id)} title="See how this brick works">
          <Search size={16} aria-hidden="true" />
          <span>See inside</span>
        </button>
        <button
          type="button"
          className="builder-btn builder-btn-danger"
          aria-label={`Remove this ${brick.name}`}
          title="Remove this copy"
          onClick={() => {
            if (history) history.push(removeCopyEdit(history, copy))
            store.deleteCopy(copy.id)
          }}
        >
          <Trash2 size={16} aria-hidden="true" />
          <span>Remove</span>
        </button>
      </div>
      {knobs.length > 0 && (
        <div className="builder-knobs" role="group" aria-label="This copy's knobs">
          {knobs.map((v) => {
            const value: Value = copy.knobs?.[v.id] ?? v.value
            return (
              <label key={v.id} className="builder-knob">
                <span className="builder-knob-name">{v.name}</span>
                {isKnobNumber(value) && isKnobNumber(v.value) ? (
                  <KnobSlider name={v.name} start={v.value} value={value} onChange={(n) => store.setKnob(copy.id, v.id, n)} />
                ) : typeof value === 'boolean' ? (
                  <button type="button" className="builder-btn" aria-pressed={value} onClick={() => store.setKnob(copy.id, v.id, !value)}>
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
