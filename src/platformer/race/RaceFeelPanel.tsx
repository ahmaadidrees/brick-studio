import { X } from 'lucide-react'
import { CAR_FEEL_GROUPS, CAR_FEEL_PRESETS, DEFAULT_CAR_FEEL, type CarFeel } from '@brick-studio/platformer-core/engine/car'
import { Button, SegmentedControl } from '../../ui'
import type { RaceFeel } from './raceFeel'
import type { CameraMode, SteerMode } from './raceRun'

/** Live sliders for how the car drives, with the mock's presets and the steering and camera choices. */
export function RaceFeelPanel({ value, onChange, onClose }: { value: RaceFeel; onChange: (v: RaceFeel) => void; onClose: () => void }) {
  const setFeel = (feel: CarFeel) => onChange({ ...value, feel })
  const preset = Object.entries(CAR_FEEL_PRESETS).find(([, p]) => (Object.keys(p) as (keyof CarFeel)[]).every((k) => p[k] === value.feel[k]))?.[0]
  const releaseFocus = () => requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur?.())
  return (
    <aside className="p2d-feel p2d-race-feel" aria-label="Tune how the car drives" onKeyDown={(e) => e.stopPropagation()} onPointerUp={releaseFocus}>
      <header>
        <h2>How the car drives</h2>
        <Button variant="quiet" size="sm" iconOnly icon={<X size={18} />} aria-label="Close" onClick={onClose}>
          Close
        </Button>
      </header>
      <p className="p2d-feel-hint">Changes apply right away, even mid-race, and stay in this browser. Each slider becomes a knob on a race brick later.</p>
      <div className="p2d-race-presets" role="group" aria-label="Presets">
        {Object.keys(CAR_FEEL_PRESETS).map((name) => (
          <Button key={name} size="sm" variant={preset === name ? 'primary' : 'secondary'} onClick={() => setFeel({ ...CAR_FEEL_PRESETS[name] })}>
            {name}
          </Button>
        ))}
      </div>
      {CAR_FEEL_GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          {g.fields.map((f) => {
            const v = value.feel[f.key]
            return (
              <label key={f.key} className={v === DEFAULT_CAR_FEEL[f.key] ? '' : 'changed'} title={f.hint}>
                <span className="name">{f.label}</span>
                <input type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => setFeel({ ...value.feel, [f.key]: Number(e.target.value) })} />
                <span className="value">{f.step >= 1 ? v : v.toFixed(2)}</span>
              </label>
            )
          })}
        </section>
      ))}
      <h3>Controls</h3>
      <div className="p2d-race-choices">
        <SegmentedControl<SteerMode>
          label="Steering"
          showLabel
          size="sm"
          value={value.steer}
          onChange={(steer) => onChange({ ...value, steer })}
          options={[{ value: 'turn', label: '← → turn the car' }, { value: 'point', label: 'Arrows point the way' }]}
        />
        <SegmentedControl<CameraMode>
          label="Camera"
          showLabel
          size="sm"
          value={value.camera}
          onChange={(camera) => onChange({ ...value, camera })}
          options={[{ value: 'map', label: 'Map stays still' }, { value: 'turn', label: 'Map turns with car' }]}
        />
      </div>
      <footer>
        <Button size="sm" onClick={() => setFeel({ ...DEFAULT_CAR_FEEL })} disabled={preset === 'Kart'}>
          Reset to Kart
        </Button>
        <Button size="sm" onClick={() => void navigator.clipboard?.writeText(JSON.stringify({ ...value.feel, steer: value.steer, camera: value.camera }, null, 2))}>
          Copy settings
        </Button>
      </footer>
    </aside>
  )
}
