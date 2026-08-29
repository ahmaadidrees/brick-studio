import { describe, expect, it } from 'vitest'
import {
  CHARACTER_DESCRIPTORS,
  CHARACTER_PALETTE_GROUPS,
  ENVIRONMENT_DESCRIPTORS,
  resolveCharacterId,
} from './contentCatalog'

describe('production content catalog', () => {
  it('includes the classic fallback and every lazy environment and character', () => {
    expect(ENVIRONMENT_DESCRIPTORS.map(({ id }) => id)).toEqual([
      'classic', 'toy-room', 'brick-valley', 'sky-island',
    ])
    expect(CHARACTER_DESCRIPTORS.map(({ id }) => id)).toEqual([
      'classic', 'toy-figure', 'cc0-hero',
    ])
  })

  it('falls stale multiplayer character ids back to the classic builder', () => {
    expect(resolveCharacterId('toy-figure')).toBe('toy-figure')
    expect(resolveCharacterId('retired-character')).toBe('classic')
    expect(resolveCharacterId(undefined)).toBe('classic')
  })

  it('exposes only palette slots implemented by every selectable color customizer', () => {
    expect(CHARACTER_PALETTE_GROUPS.map(({ key }) => key)).toEqual([
      'primary', 'secondary', 'accent',
    ])
    expect(CHARACTER_PALETTE_GROUPS.every(({ swatches }) => swatches.length >= 8)).toBe(true)
  })
})

