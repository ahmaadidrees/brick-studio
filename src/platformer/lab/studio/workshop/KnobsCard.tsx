import { useStudio, type StudioStore } from '../store'
import { formatKnob, knobRange } from './knobs'

/** The brick's showInBuild variables as sliders. Changing one sets the variable's starting value (every copy). */
export function KnobsCard({ store, brickId }: { store: StudioStore; brickId: string }) {
  const brick = useStudio(store, (s) => (brickId === s.project.design.stage.id ? s.project.design.stage : s.project.design.bricks.find((b) => b.id === brickId)))
  const knobs = (brick?.program.variables ?? []).filter((v) => v.showInBuild && typeof v.value === 'number')
  return (
    <section className="ws-card ws-knobs" aria-label="Knobs">
      <div className="ws-card-head">
        <h2>Knobs</h2>
        <span className="ws-hint">{knobs.length === 0 ? 'none yet' : `${knobs.length}`}</span>
      </div>
      {knobs.length === 0 ? (
        <p className="ws-hint">Make a variable and turn on “show in Build” to get a knob here.</p>
      ) : (
        <ul className="ws-knob-list">
          {knobs.map((v) => {
            const value = v.value as number
            const r = knobRange(value)
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
                  onChange={(e) => store.setVariableKnob(brickId, v.id, true, Number(e.target.value))}
                />
                <output>{formatKnob(value)}</output>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
