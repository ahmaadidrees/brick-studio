import { useState } from 'react'
import { CHARACTER_APPEARANCE_OPTIONS, normalizeCharacterAppearance, type CharacterAppearance } from '@brick-studio/core'
import './appearance-controls.css'

type Category = keyof typeof CHARACTER_APPEARANCE_OPTIONS
const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'body', label: 'Body' }, { key: 'face', label: 'Face' }, { key: 'hair', label: 'Hair & hats' },
  { key: 'outfit', label: 'Outfit' }, { key: 'accessory', label: 'Accessory' },
]
const LABELS: Record<string, string> = {
  classic: 'Classic', broad: 'Broad', slim: 'Slim', friendly: 'Smile', freckles: 'Freckles', rosy: 'Rosy cheeks',
  cap: 'Cap', short: 'Swept hair', curls: 'Curls', bun: 'Bun', none: 'None',
  explorer: 'Explorer', overalls: 'Overalls', sport: 'Sport', glasses: 'Glasses', backpack: 'Backpack',
}

export function randomizeCharacterAppearance(appearance: CharacterAppearance, locked: ReadonlySet<Category>, random = Math.random): CharacterAppearance {
  const next = { ...appearance }
  for (const { key } of CATEGORIES) {
    if (locked.has(key)) continue
    const options = CHARACTER_APPEARANCE_OPTIONS[key].filter(value => value !== appearance[key])
    Object.assign(next, { [key]: options[Math.min(options.length - 1, Math.max(0, Math.floor(random() * options.length)))] })
  }
  return next
}

export function AppearanceControls({ appearance, onChange }: {
  appearance?: CharacterAppearance
  onChange: (appearance: CharacterAppearance) => void
}) {
  const current = normalizeCharacterAppearance(appearance)
  const [locked, setLocked] = useState<Set<Category>>(() => new Set())
  const toggleLock = (key: Category) => setLocked(previous => {
    const next = new Set(previous)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  return <section className="appearance-controls" aria-label="Customize your figure">
    <div className="appearance-controls-heading">
      <div><h3>Make it yours</h3><p>Keep your favorites, then mix up the rest.</p></div>
      <button type="button" className="appearance-mix" disabled={locked.size === CATEGORIES.length} onClick={() => onChange(randomizeCharacterAppearance(current, locked))}>Mix it up</button>
    </div>
    {CATEGORIES.map(({ key, label }) => <fieldset key={key} className="appearance-category">
      <legend>{label}</legend>
      <button className="appearance-lock" type="button" aria-label={`Keep ${label.toLowerCase()} when mixing`} aria-pressed={locked.has(key)} onClick={() => toggleLock(key)}>{locked.has(key) ? 'Kept' : 'Keep'}</button>
      <div className="appearance-options">{CHARACTER_APPEARANCE_OPTIONS[key].map(value => <button key={value} type="button" aria-pressed={current[key] === value} onClick={() => onChange({ ...current, [key]: value })}>{LABELS[value]}</button>)}</div>
    </fieldset>)}
    <div className="appearance-colors">
      <label>Skin tone<input type="color" value={current.skinColor.length === 4 ? `#${current.skinColor.slice(1).split('').map(c => c + c).join('')}` : current.skinColor} onChange={event => onChange({ ...current, skinColor: event.target.value })} /></label>
      <label>Hair color<input type="color" value={current.hairColor.length === 4 ? `#${current.hairColor.slice(1).split('').map(c => c + c).join('')}` : current.hairColor} onChange={event => onChange({ ...current, hairColor: event.target.value })} /></label>
    </div>
  </section>
}
