import { MonitorSmartphone, Save, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { CharacterPreferences } from '../contentPreferences'
import type { CharacterDescriptor } from '../registries'
import { loadWardrobe, saveWardrobe, MAX_SAVED_OUTFITS, WARDROBE_STORAGE_KEY, type SavedOutfit } from './wardrobe'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Site storage can be blocked (private mode, disabled cookies, enterprise policy),
 * in which case even touching `window.localStorage` throws. Probe once so the panel
 * can say so instead of pretending outfits are saved.
 */
function openStorage(storage?: StorageLike): StorageLike | null {
  try {
    const target = storage ?? window.localStorage
    target.getItem(WARDROBE_STORAGE_KEY)
    return target
  } catch { return null }
}

export const WARDROBE_BLOCKED_MESSAGE = 'Saved outfits are off because this browser blocks site storage. You can still choose a character and press Apply.'
export const WARDROBE_SAVE_FAILED_MESSAGE = 'Could not save this outfit. Your current character is unchanged.'

export type WardrobePanelProps = {
  appearance: CharacterPreferences
  onChoose: (appearance: CharacterPreferences) => void
  /** Names shown next to each outfit; falls back to the raw id when a character is unknown. */
  characterDescriptors?: readonly CharacterDescriptor[]
  /** Test seam; production always uses window.localStorage. */
  storage?: StorageLike
}

export function WardrobePanel({ appearance, onChoose, characterDescriptors = [], storage: storageInput }: WardrobePanelProps) {
  const [storage] = useState(() => openStorage(storageInput))
  const [outfits, setOutfits] = useState<SavedOutfit[]>(() => storage ? loadWardrobe(storage) : [])
  const [name, setName] = useState('')
  const [message, setMessage] = useState(storage ? '' : WARDROBE_BLOCKED_MESSAGE)
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null)
  const blocked = !storage
  const full = outfits.length >= MAX_SAVED_OUTFITS

  const update = (next: SavedOutfit[], saved: string) => {
    if (!storage || !saveWardrobe(next, storage)) { setMessage(WARDROBE_SAVE_FAILED_MESSAGE); return false }
    setOutfits(next)
    setMessage(saved)
    return true
  }
  const characterName = (id: string) => characterDescriptors.find(item => item.id === id)?.name ?? id

  return (
    <section className="character-wardrobe" aria-label="Saved outfits">
      <div className="character-studio__heading">
        <div><h3>Your outfits</h3><p>Save the look you have now, then bring it back any time.</p></div>
      </div>
      <form
        className="character-wardrobe__save"
        onSubmit={(event) => {
          event.preventDefault()
          if (!name.trim() || blocked || full) return
          const outfit: SavedOutfit = { ...appearance, palette: { ...appearance.palette }, id: crypto.randomUUID(), name: name.trim(), favorite: false }
          if (update([...outfits, outfit], `Saved “${outfit.name}” on this device.`)) setName('')
        }}
      >
        <input
          aria-label="Outfit name"
          placeholder="Name this look"
          maxLength={40}
          value={name}
          disabled={blocked}
          onChange={event => setName(event.target.value)}
        />
        <button type="submit" className="character-studio__primary" disabled={!name.trim() || blocked || full}>
          <Save aria-hidden="true" size={16} /><span>Save outfit</span>
        </button>
      </form>
      {full && <p className="character-wardrobe__note">All {MAX_SAVED_OUTFITS} outfit slots are full. Remove one to save another.</p>}
      {outfits.length === 0 && !blocked && <p className="character-wardrobe__empty">No saved outfits yet. Name your look and press Save outfit.</p>}
      {outfits.length > 0 && (
        <ul className="character-wardrobe__list">
          {[...outfits].sort((a, b) => Number(b.favorite) - Number(a.favorite)).map(outfit => (
            <li key={outfit.id} className="character-wardrobe__item" data-favorite={outfit.favorite || undefined}>
              <button
                type="button"
                className="character-wardrobe__look"
                onClick={() => onChoose({ characterId: outfit.characterId, palette: { ...outfit.palette }, ...(outfit.appearance ? { appearance: { ...outfit.appearance } } : {}) })}
              >
                <span className="character-wardrobe__swatches" aria-hidden="true">
                  {['primary', 'secondary', 'accent'].map(slot => <i key={slot} style={{ background: outfit.palette[slot] ?? 'var(--surface-2, #e6ebf0)' }} />)}
                </span>
                <span className="character-wardrobe__name">{outfit.name}</span>
                <small>{characterName(outfit.characterId)}</small>
              </button>
              <button
                type="button"
                className="character-wardrobe__icon"
                aria-label={`Favorite ${outfit.name}`}
                aria-pressed={outfit.favorite}
                onClick={() => update(outfits.map(item => item.id === outfit.id ? { ...item, favorite: !item.favorite } : item), outfit.favorite ? `Removed “${outfit.name}” from favorites.` : `“${outfit.name}” is a favorite.`)}
              ><Star aria-hidden="true" size={18} fill={outfit.favorite ? 'currentColor' : 'none'} /></button>
              {pendingRemoval === outfit.id ? (
                <span className="character-wardrobe__confirm" role="group" aria-label={`Remove ${outfit.name}?`}>
                  <button type="button" className="character-studio__danger" aria-label={`Confirm remove ${outfit.name}`} onClick={() => {
                    setPendingRemoval(null)
                    update(outfits.filter(item => item.id !== outfit.id), `Removed “${outfit.name}”.`)
                  }}>Remove</button>
                  <button type="button" className="character-studio__ghost" aria-label={`Keep ${outfit.name}`} onClick={() => setPendingRemoval(null)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="character-wardrobe__icon" aria-label={`Remove ${outfit.name}`} onClick={() => setPendingRemoval(outfit.id)}>
                  <Trash2 aria-hidden="true" size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="character-wardrobe__device"><MonitorSmartphone aria-hidden="true" size={16} /><span><strong>Saved on this device.</strong> Outfits stay in this browser only; they are not part of an account or a shared world.</span></p>
      <p role="status" className="character-wardrobe__status">{message}</p>
    </section>
  )
}

export default WardrobePanel
