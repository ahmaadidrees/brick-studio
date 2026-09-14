import { Lock, LockOpen } from 'lucide-react'
import { useId, type CSSProperties } from 'react'
import { Button } from '../../ui'
import type { CharacterPaletteGroup } from '../contentPicker/ContentPicker'
import { updateCharacterPalette } from '../contentPicker/selection'
import type { StudioLocks } from './studioMix'
import type { CharacterPalette } from './types'

export type PaletteControlsProps = {
  /** Slots that really exist for the selected character, with their real labels (Helmet, Coat, Suit…). */
  groups: readonly CharacterPaletteGroup[]
  palette: Readonly<CharacterPalette>
  locked: StudioLocks
  onToggleLock: (slot: string) => void
  onChange: (palette: CharacterPalette) => void
}

/** The "Keep" toggle shared by figure categories and color slots. */
export function LockToggle({ label, locked, onToggle }: { label: string; locked: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="quiet"
      size="sm"
      className="character-studio__lock"
      aria-label={`Keep ${label} when mixing`}
      aria-pressed={locked}
      icon={locked ? <Lock size={14} /> : <LockOpen size={14} />}
      onClick={onToggle}
    >{locked ? 'Kept' : 'Keep'}</Button>
  )
}

/** Per-slot swatches with a lock each, so "Mix it up" and coordinated sets can leave a slot alone. */
export function PaletteControls({ groups, palette, locked, onToggleLock, onChange }: PaletteControlsProps) {
  const hasChoices = Object.keys(palette).length > 0
  const idBase = useId()
  return (
    <section className="character-colors" aria-label="Character colors">
      <div className="character-studio__heading">
        <div><h3>Character colors</h3><p>Pick a color for each part. Lock a part to keep it when you mix.</p></div>
        <Button variant="secondary" size="sm" disabled={!hasChoices} onClick={() => onChange({})}>Reset colors</Button>
      </div>
      <div className="character-colors__groups">
        {groups.map((group) => {
          const isLocked = locked.has(group.key)
          return (
            <div key={group.key} role="group" aria-labelledby={`${idBase}-${group.key}`} className="character-colors__group" data-locked={isLocked || undefined}>
              <div className="character-category__header">
                <span id={`${idBase}-${group.key}`} className="character-category__label">{group.label}</span>
                <LockToggle label={group.label} locked={isLocked} onToggle={() => onToggleLock(group.key)} />
              </div>
              <div className="character-colors__swatches">
                {group.swatches.map((swatch) => (
                  <button
                    key={`${group.key}:${swatch.value}`}
                    type="button"
                    className="character-swatch"
                    style={{ '--character-swatch': swatch.value } as CSSProperties}
                    aria-label={`Set ${group.label} to ${swatch.label}`}
                    aria-pressed={palette[group.key] === swatch.value}
                    title={swatch.label}
                    onClick={() => onChange(updateCharacterPalette(palette, group.key, swatch.value))}
                  >
                    <span aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default PaletteControls
