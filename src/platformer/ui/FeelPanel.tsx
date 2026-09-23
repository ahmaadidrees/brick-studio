import { X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../../ui'
import { DEFAULT_FEEL, FEEL_GROUPS, type Feel } from '@brick-studio/platformer-core/engine/feel'

interface Props {
  feel: Feel
  onChange: (f: Feel) => void
  onClose: () => void
}

/** Live sliders for the player's movement, so the feel can be tuned while playing. */
export function FeelPanel({ feel, onChange, onClose }: Props) {
  const [copied, setCopied] = useState(false)
  const changed = (Object.keys(DEFAULT_FEEL) as (keyof Feel)[]).filter((k) => feel[k] !== DEFAULT_FEEL[k])
  return (
    <aside className="p2d-feel" aria-label="Tune how the player moves" onKeyDown={(e) => e.stopPropagation()}>
      <header>
        <h2>Tune how the player moves</h2>
        <Button variant="quiet" size="sm" iconOnly icon={<X size={18} />} aria-label="Close" onClick={onClose}>
          Close
        </Button>
      </header>
      <p className="p2d-feel-hint">Speeds are pixels per frame at 60 fps; a tile is 16 pixels. Changes apply instantly and stay in this browser.</p>
      {FEEL_GROUPS.map((g) => (
        <section key={g.title}>
          <h3>{g.title}</h3>
          {g.fields.map((f) => {
            const v = feel[f.key]
            const isDefault = v === DEFAULT_FEEL[f.key]
            return (
              <label key={f.key} className={isDefault ? '' : 'changed'}>
                <span className="name">{f.label}</span>
                <input
                  type="range"
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  value={v}
                  onChange={(e) => onChange({ ...feel, [f.key]: Number(e.target.value) })}
                  onPointerUp={(e) => e.currentTarget.blur()}
                />
                <span className="value">{f.step >= 1 ? v : v.toFixed(3)}</span>
              </label>
            )
          })}
        </section>
      ))}
      <footer>
        <Button size="sm" onClick={() => onChange({ ...DEFAULT_FEEL })} disabled={changed.length === 0}>
          Reset to the defaults
        </Button>
        <Button
          size="sm"
          onClick={() => {
            const diff = Object.fromEntries(changed.map((k) => [k, feel[k]]))
            void navigator.clipboard?.writeText(JSON.stringify(diff, null, 2)).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }}
          disabled={changed.length === 0}
        >
          {copied ? 'Copied' : `Copy ${changed.length} change${changed.length === 1 ? '' : 's'}`}
        </Button>
      </footer>
    </aside>
  )
}
