import { describe, expect, it } from 'vitest'
import { DEFAULT_CHARACTER_APPEARANCE } from '@brick-studio/core'
import type { ContentPickerSelection } from '../contentPicker/selection'
import { applyColorSet, canMixDraft, LOOK_COLOR_SETS, mixDraft, randomizeCharacterAppearance, toggleLock } from './studioMix'

const swatches = [{ value: '#111111', label: 'One' }, { value: '#222222', label: 'Two' }]
const paletteGroups = [
  { key: 'primary', label: 'Helmet', swatches }, { key: 'secondary', label: 'Panels', swatches }, { key: 'accent', label: 'Glow', swatches },
]
const toy: ContentPickerSelection = { environmentId: 'classic', characterId: 'toy-figure', palette: { primary: '#123456' }, appearance: DEFAULT_CHARACTER_APPEARANCE }

describe('studio mix', () => {
  it('changes every unlocked category to a different option and never touches skin or hair color', () => {
    const result = randomizeCharacterAppearance(DEFAULT_CHARACTER_APPEARANCE, new Set(['body', 'hair']), () => 0)
    expect(result.body).toBe('classic')
    expect(result.hair).toBe('cap')
    expect(result.face).not.toBe('friendly')
    expect(result.outfit).not.toBe('explorer')
    expect(result.accessory).not.toBe('none')
    expect(result.skinColor).toBe(DEFAULT_CHARACTER_APPEARANCE.skinColor)
    expect(result.hairColor).toBe(DEFAULT_CHARACTER_APPEARANCE.hairColor)
  })

  it('applies a color set only to unlocked slots', () => {
    expect(applyColorSet({ primary: '#123456', accent: '#abcdef' }, ['#a', '#b', '#c'], new Set(['primary']))).toEqual({ primary: '#123456', secondary: '#b', accent: '#c' })
  })

  it('mixes appearance and colors together for the toy figure, honoring every lock, without mutating the draft', () => {
    const locked = new Set(['hair', 'secondary'])
    const before = JSON.stringify(toy)
    const next = mixDraft({ ...toy, palette: { secondary: '#999999' } }, { locked, paletteGroups, customizable: true, random: () => 0.99 })
    expect(next.appearance?.hair).toBe('cap')
    expect(next.appearance?.face).not.toBe('friendly')
    expect(next.palette.secondary).toBe('#999999')
    expect(next.palette.primary).toBe(LOOK_COLOR_SETS[LOOK_COLOR_SETS.length - 1].colors[0])
    expect(next.palette.accent).toBe(LOOK_COLOR_SETS[LOOK_COLOR_SETS.length - 1].colors[2])
    expect(next.characterId).toBe('toy-figure')
    expect(next.environmentId).toBe('classic')
    expect(JSON.stringify(toy)).toBe(before)
  })

  it('leaves appearance alone for other characters and colors alone for non-customizable ones', () => {
    const pip = mixDraft({ ...toy, characterId: 'pip' }, { locked: new Set(), paletteGroups, customizable: true, random: () => 0 })
    expect(pip.appearance).toEqual(DEFAULT_CHARACTER_APPEARANCE)
    expect(pip.palette).toEqual({ primary: LOOK_COLOR_SETS[0].colors[0], secondary: LOOK_COLOR_SETS[0].colors[1], accent: LOOK_COLOR_SETS[0].colors[2] })
    const fixed = mixDraft({ ...toy, characterId: 'cc0-hero' }, { locked: new Set(), paletteGroups, customizable: false })
    expect(fixed.palette).toEqual({ primary: '#123456' })
  })

  it('falls back to a random swatch for slots beyond the coordinated set', () => {
    const groups = [...paletteGroups, { key: 'dark', label: 'Boots', swatches }]
    const next = mixDraft({ ...toy, characterId: 'pip' }, { locked: new Set(), paletteGroups: groups, customizable: true, random: () => 0.6 })
    expect(next.palette.dark).toBe('#222222')
  })

  it('reports when a shuffle would change nothing', () => {
    const all = new Set(['body', 'face', 'hair', 'outfit', 'accessory', 'primary', 'secondary', 'accent'])
    expect(canMixDraft(toy, { locked: all, paletteGroups, customizable: true })).toBe(false)
    expect(canMixDraft(toy, { locked: toggleLock(all, 'face'), paletteGroups, customizable: true })).toBe(true)
    expect(canMixDraft({ ...toy, characterId: 'pip' }, { locked: new Set(['primary', 'secondary', 'accent']), paletteGroups, customizable: true })).toBe(false)
    expect(canMixDraft({ ...toy, characterId: 'cc0-hero' }, { locked: new Set(), paletteGroups, customizable: false })).toBe(false)
  })

  it('every coordinated set is three lowercase hex colors', () => {
    for (const set of LOOK_COLOR_SETS) {
      expect(set.colors).toHaveLength(3)
      for (const color of set.colors) expect(color).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
