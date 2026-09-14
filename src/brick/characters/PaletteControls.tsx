import { Lock, LockOpen } from 'lucide-react'
import type { CSSProperties } from 'react'
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

/** Per-slot swatches with a lock each, so "Mix it up" and coordinated sets can leave a slot alone. */
export function PaletteControls({ groups, palette, locked, onToggleLock, onChange }: PaletteControlsProps) {
  const hasChoices = Object.keys(palette).length > 0
  return (
    <section className="character-colors" aria-label="Character colors">
      <div className="character-studio__heading">
        <div><h3>Character colors</h3><p>Pick a color for each part. Lock a part to keep it when you mix.</p></div>
        <button type="button" className="character-studio__ghost" disabled={!hasChoices} onClick={() => onChange({})}>Reset colors</button>
      </div>
      <div className="character-colors__groups">
        {groups.map((group) => {
          const isLocked = locked.has(group.key)
          return (
            <fieldset key={group.key} className="character-colors__group" data-locked={isLocked || undefined}>
              <legend>{group.label}</legend>
              <button
                type="button"
                className="character-studio__lock"
                aria-label={`Keep ${group.label} when mixing`}
                aria-pressed={isLocked}
                onClick={() => onToggleLock(group.key)}
              >
                {isLocked ? <Lock aria-hidden="true" size={14} /> : <LockOpen aria-hidden="true" size={14} />}
                <span>{isLocked ? 'Kept' : 'Keep'}</span>
              </button>
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
            </fieldset>
          )
        })}
      </div>
    </section>
  )
}

export default PaletteControls
