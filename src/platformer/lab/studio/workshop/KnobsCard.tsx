import { useState } from 'react'
import type { VariableDecl } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { formatKnob, knobList, sliderRange } from './knobs'

/**
 * The brick's Build knobs as sliders (changing one sets the variable's starting value, so every copy follows). The Hero
 * shows just four, then a collapsed "More tuning (N)" section with every other tuning number, grouped.
 */
export function KnobsCard({ store, brickId }: { store: StudioStore; brickId: string }) {
  const brick = useStudio(store, (s) => (brickId === s.project.design.stage.id ? s.project.design.stage : s.project.design.bricks.find((b) => b.id === brickId)))
  const [moreOpen, setMoreOpen] = useState(false)
  const { main, groups, moreCount } = knobList(brick?.program.variables ?? [])
  // Tuning numbers that are not Build knobs keep showInBuild off when they move.
  const slider = (v: VariableDecl, showInBuild: boolean) => {
    const value = v.value as number
    const r = sliderRange(v)
    return (
      <li key={v.id} className="ws-knob">
        <label htmlFor={`knob-${v.id}`}>{v.name}</label>
        <input
          id={`knob-${v.id}`}
          type="range"
          min={r.min}
          max={r.max}
          step={r.step}
          value={value}
          aria-label={v.name}
          onChange={(e) => store.setVariableKnob(brickId, v.id, showInBuild, Number(e.target.value))}
        />
        <output>{formatKnob(value)}</output>
      </li>
    )
  }
  return (
    <section className="ws-card ws-knobs" aria-label="Knobs">
      <div className="ws-card-head">
        <h2>Knobs</h2>
        <span className="ws-hint">{main.length === 0 && moreCount === 0 ? 'none yet' : `${main.length}`}</span>
      </div>
      {main.length === 0 && moreCount === 0 ? (
        <p className="ws-hint">Make a variable and turn on “show in Build” to get a knob here.</p>
      ) : (
        <ul className="ws-knob-list">{main.map((v) => slider(v, true))}</ul>
      )}
      {moreCount > 0 && (
        <div className="ws-more">
          <button type="button" className="ws-more-toggle" aria-expanded={moreOpen} aria-controls="ws-more-tuning" onClick={() => setMoreOpen((o) => !o)}>
            <span aria-hidden="true">{moreOpen ? '▾' : '▸'}</span> More tuning ({moreCount})
          </button>
          {moreOpen && (
            <div id="ws-more-tuning" className="ws-more-body">
              {groups.map((g) => (
                <section key={g.id} className="ws-knob-group" aria-label={g.label}>
                  <h3>{g.label}</h3>
                  <ul className="ws-knob-list">{g.knobs.map((v) => slider(v, false))}</ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
