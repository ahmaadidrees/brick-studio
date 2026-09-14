import { useState } from 'react'
import type { CharacterPalette } from './types'

export const LOOK_COLOR_SETS = [
  { name: 'Forest trail', colors: ['#47734e', '#283e37', '#f2bc58'] },
  { name: 'Moon mission', colors: ['#e9eef4', '#3c456e', '#f2a54a'] },
  { name: 'Coral coast', colors: ['#ef806d', '#326e81', '#f7df9b'] },
  { name: 'Electric violet', colors: ['#9568c9', '#293851', '#65d9c4'] },
  { name: 'Sunrise', colors: ['#e8ab4c', '#735275', '#f3e2c0'] },
  { name: 'Arctic', colors: ['#82bccb', '#354966', '#e9f4ed'] },
] as const
const slots = ['primary', 'secondary', 'accent'] as const
export function LookColors({ palette, onChange }: { palette: CharacterPalette; onChange: (palette: CharacterPalette) => void }) {
  const [locked, setLocked] = useState<string[]>([])
  const apply = (index: number) => {
    const next = { ...palette }
    slots.forEach((slot, position) => { if (!locked.includes(slot)) next[slot] = LOOK_COLOR_SETS[index].colors[position] })
    onChange(next)
  }
  return <section className="look-colors" aria-label="Coordinated colors">
    <h3>Find your colors</h3>
    <div className="look-color-presets">{LOOK_COLOR_SETS.map((look,index) => <button type="button" key={look.name} onClick={() => apply(index)}>
      <span aria-hidden="true">{look.colors.map(color => <i key={color} style={{ background: color }} />)}</span>{look.name}
    </button>)}</div>
    <div className="look-color-locks">{slots.map((slot,index) => <label key={slot}><input type="checkbox" checked={locked.includes(slot)} onChange={event => setLocked(current => event.target.checked ? [...current,slot] : current.filter(value => value !== slot))} />Keep {['main','secondary','accent'][index]}</label>)}</div>
    <button type="button" disabled={locked.length === slots.length} onClick={() => apply(Math.floor(Math.random() * LOOK_COLOR_SETS.length))}>Shuffle colors</button>
  </section>
}
