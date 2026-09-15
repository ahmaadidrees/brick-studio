import { CHARACTER_APPEARANCE_OPTIONS, normalizeCharacterAppearance, type CharacterAppearance } from '@brick-studio/core'
import type { CharacterPaletteGroup } from '../contentPicker/ContentPicker'
import type { ContentPickerSelection } from '../contentPicker/selection'
import type { CharacterPalette } from './types'

/** Appearance categories the studio can lock and shuffle. Skin and hair colors are never shuffled. */
export type AppearanceCategory = keyof typeof CHARACTER_APPEARANCE_OPTIONS
export const APPEARANCE_CATEGORIES: readonly { key: AppearanceCategory; label: string }[] = [
  { key: 'body', label: 'Body' }, { key: 'face', label: 'Face' }, { key: 'hair', label: 'Hair & hats' },
  { key: 'outfit', label: 'Outfit' }, { key: 'accessory', label: 'Accessory' },
]

/** Coordinated three-slot color sets (main, second, accent). Direction I accents lead. */
export const LOOK_COLOR_SETS = [
  { name: 'Brickgineer', colors: ['#5888da', '#263c51', '#f3ca74'] },
  { name: 'Coral coast', colors: ['#f17861', '#326e81', '#f8f4eb'] },
  { name: 'Butter sun', colors: ['#f3ca74', '#5888da', '#f17861'] },
  { name: 'Forest trail', colors: ['#47734e', '#283e37', '#f2bc58'] },
  { name: 'Moon mission', colors: ['#e9eef4', '#3c456e', '#f2a54a'] },
  { name: 'Electric violet', colors: ['#9568c9', '#293851', '#65d9c4'] },
  { name: 'Sunrise', colors: ['#e8ab4c', '#735275', '#f3e2c0'] },
  { name: 'Arctic', colors: ['#82bccb', '#354966', '#e9f4ed'] },
] as const

export const PALETTE_SLOTS = ['primary', 'secondary', 'accent'] as const

/** A lock is keyed by appearance category or palette slot; locked keys are never changed by a shuffle. */
export type StudioLocks = ReadonlySet<string>

export function toggleLock(locks: StudioLocks, key: string): Set<string> {
  const next = new Set(locks)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(random() * items.length)))]
}

/** Changes every unlocked category to a different option; colors are left alone. */
export function randomizeCharacterAppearance(appearance: CharacterAppearance, locked: StudioLocks, random = Math.random): CharacterAppearance {
  const next = { ...appearance }
  for (const { key } of APPEARANCE_CATEGORIES) {
    if (locked.has(key)) continue
    const options = CHARACTER_APPEARANCE_OPTIONS[key].filter(value => value !== appearance[key])
    Object.assign(next, { [key]: pick(options, random) })
  }
  return next
}

/** Applies one coordinated set to the unlocked slots of a palette. */
export function applyColorSet(palette: Readonly<CharacterPalette>, colors: readonly string[], locked: StudioLocks): CharacterPalette {
  const next = { ...palette }
  PALETTE_SLOTS.forEach((slot, index) => { if (!locked.has(slot) && colors[index]) next[slot] = colors[index] })
  return next
}

export type MixOptions = {
  locked: StudioLocks
  paletteGroups: readonly CharacterPaletteGroup[]
  /** Only customizable characters take colors; the toy figure also takes appearance categories. */
  customizable: boolean
  random?: () => number
}

/** True when a shuffle would change nothing, so the control can be disabled honestly. */
export function canMixDraft(draft: ContentPickerSelection, { locked, paletteGroups, customizable }: Omit<MixOptions, 'random'>): boolean {
  const appearanceOpen = draft.characterId === 'toy-figure' && APPEARANCE_CATEGORIES.some(({ key }) => !locked.has(key))
  const colorsOpen = customizable && paletteGroups.some(group => !locked.has(group.key))
  return appearanceOpen || colorsOpen
}

/**
 * "Mix it up": one new complete draft with every unlocked appearance category and
 * color slot changed. Locked choices, skin tone, hair color, scene and character
 * are untouched; the input is never mutated.
 */
export function mixDraft(draft: ContentPickerSelection, { locked, paletteGroups, customizable, random = Math.random }: MixOptions): ContentPickerSelection {
  const next: ContentPickerSelection = { ...draft, palette: { ...draft.palette } }
  if (draft.characterId === 'toy-figure') {
    next.appearance = randomizeCharacterAppearance(normalizeCharacterAppearance(draft.appearance), locked, random)
  }
  if (customizable && paletteGroups.length) {
    const set = pick(LOOK_COLOR_SETS, random)
    paletteGroups.forEach((group, index) => {
      if (locked.has(group.key)) return
      const fromSet = set.colors[index]
      next.palette[group.key] = fromSet ?? pick(group.swatches, random).value
    })
  }
  return next
}
