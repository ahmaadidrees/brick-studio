import { useId, type CSSProperties } from 'react'
import { CHARACTER_APPEARANCE_OPTIONS, normalizeCharacterAppearance, type CharacterAppearance } from '@brick-studio/core'
import { Button } from '../../ui'
import { LockToggle } from './PaletteControls'
import { APPEARANCE_CATEGORIES, type StudioLocks } from './studioMix'

export { randomizeCharacterAppearance } from './studioMix'

const LABELS: Record<string, string> = {
  classic: 'Classic', broad: 'Broad', slim: 'Slim', friendly: 'Smile', freckles: 'Freckles', rosy: 'Rosy cheeks',
  cap: 'Cap', short: 'Swept hair', curls: 'Curls', bun: 'Bun', none: 'None',
  explorer: 'Explorer', overalls: 'Overalls', sport: 'Sport', glasses: 'Glasses', backpack: 'Backpack',
}

/** Preset tones; any other value still comes through the custom picker and normalizes the same way. */
export const SKIN_TONES = [
  { value: '#f7dcc4', label: 'Porcelain' }, { value: '#f0bd86', label: 'Sand' }, { value: '#d9a06b', label: 'Honey' },
  { value: '#b87a4e', label: 'Caramel' }, { value: '#8d5a3a', label: 'Cocoa' }, { value: '#5b3a29', label: 'Espresso' },
] as const
export const HAIR_COLORS = [
  { value: '#593c2e', label: 'Chestnut' }, { value: '#2b2117', label: 'Black' }, { value: '#f2d16b', label: 'Blonde' },
  { value: '#c8532d', label: 'Auburn' }, { value: '#9a9aa0', label: 'Silver' }, { value: '#5888da', label: 'Cornflower' },
] as const

function toLongHex(color: string) {
  return color.length === 4 ? `#${color.slice(1).split('').map(c => c + c).join('')}` : color
}

export type AppearanceControlsProps = {
  appearance?: CharacterAppearance
  locked: StudioLocks
  onToggleLock: (category: string) => void
  onChange: (appearance: CharacterAppearance) => void
}

/** Toy Figure categories: body, face, hair & hats, outfit, accessory, then skin tone and hair color. */
export function AppearanceControls({ appearance, locked, onToggleLock, onChange }: AppearanceControlsProps) {
  const current = normalizeCharacterAppearance(appearance)
  const idBase = useId()
  const colorRow = (key: 'skinColor' | 'hairColor', label: string, presets: readonly { value: string; label: string }[]) => (
    <div role="group" aria-labelledby={`${idBase}-${key}`} className="appearance-category appearance-category--colors">
      <div className="character-category__header"><span id={`${idBase}-${key}`} className="character-category__label">{label}</span></div>
      <div className="character-colors__swatches">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className="character-swatch"
            style={{ '--character-swatch': preset.value } as CSSProperties}
            aria-label={`Set ${label.toLowerCase()} to ${preset.label}`}
            aria-pressed={current[key] === preset.value}
            title={preset.label}
            onClick={() => onChange({ ...current, [key]: preset.value })}
          ><span aria-hidden="true" /></button>
        ))}
        <label className="character-swatch character-swatch--custom" title={`Custom ${label.toLowerCase()}`}>
          <input
            type="color"
            aria-label={`Custom ${label.toLowerCase()}`}
            value={toLongHex(current[key])}
            onChange={event => onChange({ ...current, [key]: event.target.value })}
          />
        </label>
      </div>
    </div>
  )
  return (
    <section className="appearance-controls" aria-label="Customize your figure">
      <div className="character-studio__heading">
        <div><h3>Your figure</h3><p>Choose a look for each part. Lock a part to keep it when you mix.</p></div>
      </div>
      {APPEARANCE_CATEGORIES.map(({ key, label }) => {
        const isLocked = locked.has(key)
        return (
          <div key={key} role="group" aria-labelledby={`${idBase}-${key}`} className="appearance-category" data-locked={isLocked || undefined}>
            <div className="character-category__header">
              <span id={`${idBase}-${key}`} className="character-category__label">{label}</span>
              <LockToggle label={label.toLowerCase()} locked={isLocked} onToggle={() => onToggleLock(key)} />
            </div>
            <div className="appearance-options">
              {/* Toggle buttons on purpose: the QA harness drives these by name + aria-pressed. */}
              {CHARACTER_APPEARANCE_OPTIONS[key].map(value => (
                <Button key={value} variant="secondary" size="sm" className="appearance-option" aria-pressed={current[key] === value} onClick={() => onChange({ ...current, [key]: value })}>{LABELS[value]}</Button>
              ))}
            </div>
          </div>
        )
      })}
      {colorRow('skinColor', 'Skin tone', SKIN_TONES)}
      {colorRow('hairColor', 'Hair color', HAIR_COLORS)}
    </section>
  )
}

export default AppearanceControls
