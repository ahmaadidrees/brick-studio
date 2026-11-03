import { useState } from 'react'
import type { VariableDecl } from '../../core/contracts'
import { useStudio, type StudioStore } from '../store'
import { activePreset, formatKnob, knobList, knobSpecFor, knobWords, sliderRange } from './knobs'
import './workshop.css'
import '../race/raceBuild.css'

/**
 * The brick's Build knobs as sliders (changing one sets the variable's starting value, so every copy follows). The Hero
 * shows just four, then a collapsed "More sliders (N)" section with every other tuning number, grouped, each with a
 * one-line hint. The Car also has its feel presets (Kart / Drifty / On rails) above its four sliders.
 */
export function KnobsCard({ store, brickId, compact = false }: { store: StudioStore; brickId: string; compact?: boolean }) {
  const brick = useStudio(store, (s) => (brickId === s.project.design.stage.id ? s.project.design.stage : s.project.design.bricks.find((b) => b.id === brickId)))
  const [moreOpen, setMoreOpen] = useState(false)
  const spec = knobSpecFor(brick)
  const variables = brick?.program.variables ?? []
  const { main, groups, moreCount } = knobList(variables, spec)
  const presets = spec.presets?.filter((p) => Object.keys(p.values).every((id) => variables.some((v) => v.id === id))) ?? []
  const pressed = presets.length ? activePreset(variables, spec) : null
  const usePreset = (values: Readonly<Record<string, number>>) => {
    for (const [id, value] of Object.entries(values)) store.setBrickSlider(brickId, id, value)
  }
  // Tuning numbers that are not Build knobs keep showInBuild off when they move.
  const slider = (v: VariableDecl) => {
    const value = v.value as number
    const r = sliderRange(v, spec)
    const { label, hint } = knobWords(v, spec)
    return (
      <li key={v.id} className="ws-knob">
        <label htmlFor={`knob-${v.id}`}>{label}</label>
        {hint && <small id={`knob-${v.id}-hint`} className="ws-knob-hint">{hint}</small>}
        <input
          id={`knob-${v.id}`}
          type="range"
          min={r.min}
          max={r.max}
          step={r.step}
          value={value}
          aria-label={label}
          aria-describedby={hint ? `knob-${v.id}-hint` : undefined}
          onChange={(e) => store.setBrickSlider(brickId, v.id, Number(e.target.value))}
        />
        <output>{formatKnob(value)}</output>
      </li>
    )
  }
  return (
    <section className="ws-card ws-knobs" aria-label="Sliders">
      {!compact && <div className="ws-card-head">
        <h2>Sliders</h2>
        <span className="ws-hint">{main.length === 0 && moreCount === 0 ? 'none yet' : `${main.length}`}</span>
      </div>}
      {presets.length > 0 && <div className="cl-seg ws-presets" role="group" aria-label="How it drives">
        {presets.map((p) => <button key={p.id} type="button" aria-pressed={pressed === p.id} title={p.hint} onClick={() => usePreset(p.values)}>{p.name}</button>)}
      </div>}
      {presets.length > 0 && <small className="ws-knob-hint ws-preset-hint">{presets.find((p) => p.id === pressed)?.hint ?? 'Your own mix of numbers.'}</small>}
      {main.length === 0 && moreCount === 0 ? (
        <p className="ws-hint">Make a variable and turn on “Show as a slider” to get a slider here.</p>
      ) : (
        <ul className="ws-knob-list ws-knob-main">{main.map((v) => slider(v))}</ul>
      )}
      {moreCount > 0 && (
        <div className="ws-more">
          <button type="button" className="ws-more-toggle" aria-expanded={moreOpen} aria-controls="ws-more-tuning" onClick={() => setMoreOpen((o) => !o)}>
            <span aria-hidden="true">{moreOpen ? '▾' : '▸'}</span> More sliders ({moreCount})
          </button>
          {moreOpen && (
            <div id="ws-more-tuning" className="ws-more-body">
              {groups.map((g) => (
                <section key={g.id} className="ws-knob-group" aria-label={g.label}>
                  <h3>{g.label}</h3>
                  <ul className="ws-knob-list">{g.knobs.map((v) => slider(v))}</ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
