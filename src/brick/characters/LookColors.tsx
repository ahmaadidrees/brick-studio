import { Shuffle } from 'lucide-react'
import { Button } from '../../ui'
import { applyColorSet, LOOK_COLOR_SETS, PALETTE_SLOTS, type StudioLocks } from './studioMix'
import type { CharacterPalette } from './types'

export { LOOK_COLOR_SETS }

export type LookColorsProps = {
  palette: Readonly<CharacterPalette>
  /** Shared with the per-slot locks in PaletteControls; locked slots keep their color. */
  locked: StudioLocks
  onChange: (palette: CharacterPalette) => void
  random?: () => number
}

/** Coordinated three-color sets that fill only the unlocked slots. */
export function LookColors({ palette, locked, onChange, random = Math.random }: LookColorsProps) {
  const allLocked = PALETTE_SLOTS.every(slot => locked.has(slot))
  const apply = (index: number) => onChange(applyColorSet(palette, LOOK_COLOR_SETS[index].colors, locked))
  return (
    <section className="character-looks" aria-label="Coordinated colors">
      <div className="character-studio__heading">
        <div><h3>Color sets</h3><p>Three colors that go together. Locked parts keep their color.</p></div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Shuffle size={14} />}
          disabled={allLocked}
          onClick={() => apply(Math.floor(random() * LOOK_COLOR_SETS.length))}
        >Shuffle colors</Button>
      </div>
      <div className="character-looks__grid">
        {LOOK_COLOR_SETS.map((look, index) => (
          <button type="button" key={look.name} className="character-look" disabled={allLocked} onClick={() => apply(index)}>
            <span aria-hidden="true">{look.colors.map(color => <i key={color} style={{ background: color }} />)}</span>
            {look.name}
          </button>
        ))}
      </div>
    </section>
  )
}

export default LookColors
