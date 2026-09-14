import { useState } from 'react'
import type { CharacterPreferences } from '../contentPreferences'
import { loadWardrobe, saveWardrobe, MAX_SAVED_OUTFITS, type SavedOutfit } from './wardrobe'

export function WardrobePanel({ appearance, onChoose }: { appearance: CharacterPreferences; onChoose: (appearance: CharacterPreferences) => void }) {
  const [outfits, setOutfits] = useState(() => { try { return loadWardrobe(window.localStorage) } catch { return [] } })
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const update = (next: SavedOutfit[]) => {
    try {
      if (!saveWardrobe(next, window.localStorage)) throw Error()
      setOutfits(next)
      setMessage('Saved on this browser.')
      return true
    } catch { setMessage('Could not save this outfit. Your current character is unchanged.'); return false }
  }
  return <section className="wardrobe-panel" aria-label="Saved outfits">
    <h3>Your outfits</h3>
    <p>Keep favorite looks on this browser.</p>
    <div className="wardrobe-save">
      <input aria-label="Outfit name" placeholder="Name this look" maxLength={40} value={name} onChange={event => setName(event.target.value)} />
      <button type="button" disabled={!name.trim() || outfits.length >= MAX_SAVED_OUTFITS} onClick={() => {
        if (update([...outfits, { ...appearance, palette: { ...appearance.palette }, id: crypto.randomUUID(), name: name.trim(), favorite: false }])) setName('')
      }}>Save outfit</button>
    </div>
    {outfits.length >= MAX_SAVED_OUTFITS && <p>All {MAX_SAVED_OUTFITS} outfit slots are full. Remove one to save another.</p>}
    <ul>{[...outfits].sort((a,b) => Number(b.favorite)-Number(a.favorite)).map(outfit => <li key={outfit.id}>
      <button type="button" className="wardrobe-look" onClick={() => onChoose({ characterId: outfit.characterId, palette: { ...outfit.palette }, ...(outfit.appearance ? { appearance: { ...outfit.appearance } } : {}) })}>
        <span className="wardrobe-swatches" aria-hidden="true">{['primary','secondary','accent'].map(slot => <i key={slot} style={{background:outfit.palette[slot] ?? '#7fa2bc'}} />)}</span>{outfit.name}
      </button>
      <button type="button" aria-label={`Favorite ${outfit.name}`} aria-pressed={outfit.favorite} onClick={() => update(outfits.map(item => item.id === outfit.id ? {...item,favorite:!item.favorite} : item))}>{outfit.favorite ? '★' : '☆'}</button>
      <button type="button" aria-label={`Remove ${outfit.name}`} onClick={() => { if (window.confirm(`Remove “${outfit.name}” from saved outfits?`)) update(outfits.filter(item => item.id !== outfit.id)) }}>×</button>
    </li>)}</ul>
    {message && <p role="status">{message}</p>}
  </section>
}
