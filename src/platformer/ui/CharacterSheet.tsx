import { Check } from 'lucide-react'
import { useRef, type KeyboardEvent } from 'react'
import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import { Sheet } from '../../ui'
import { CHARACTER_OPTIONS, characterPreviewStyle } from '../characters/catalog'

interface Props {
  open: boolean
  selected: CharacterId
  onSelect: (id: CharacterId) => void
  onClose: () => void
}

/** This player's character is a browser preference, independent of the world and its save. */
export function CharacterSheet({ open, selected, onSelect, onClose }: Props) {
  const selectedRef = useRef<HTMLButtonElement>(null)
  const pickWithArrow = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = CHARACTER_OPTIONS[(index + step + CHARACTER_OPTIONS.length) % CHARACTER_OPTIONS.length]
    onSelect(next.id)
    const card = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[(index + step + CHARACTER_OPTIONS.length) % CHARACTER_OPTIONS.length]
    card?.focus()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Character" description="Pick who you play as. Your choice stays on this browser." variant="dialog" size="lg" className="p2d-character-sheet" initialFocusRef={selectedRef}>
      <div className="p2d-character-grid" role="radiogroup" aria-label="Choose your character">
        {CHARACTER_OPTIONS.map((option, index) => {
          const active = option.id === selected
          return (
            <button
              key={option.id}
              ref={active ? selectedRef : undefined}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              className="p2d-character-card"
              onClick={() => onSelect(option.id)}
              onKeyDown={(event) => pickWithArrow(event, index)}
            >
              <span className="p2d-character-picture" aria-hidden="true"><span className="p2d-character-sprite" style={characterPreviewStyle(option.id)} /></span>
              <span className="p2d-character-copy"><strong>{option.name}</strong><span>{option.description}</span></span>
              {active && <span className="p2d-character-check" aria-hidden="true"><Check size={18} /></span>}
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}
