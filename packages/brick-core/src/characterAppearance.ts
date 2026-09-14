/** Bounded cosmetic choices shared by persistence, multiplayer and rendering. */
export const CHARACTER_APPEARANCE_OPTIONS = {
  body: ['classic', 'broad', 'slim'],
  face: ['friendly', 'freckles', 'rosy'],
  hair: ['cap', 'short', 'curls', 'bun', 'none'],
  outfit: ['explorer', 'overalls', 'sport'],
  accessory: ['none', 'glasses', 'backpack'],
} as const

export type CharacterAppearance = {
  [K in keyof typeof CHARACTER_APPEARANCE_OPTIONS]: (typeof CHARACTER_APPEARANCE_OPTIONS)[K][number]
} & { skinColor: string; hairColor: string }

export const DEFAULT_CHARACTER_APPEARANCE: Readonly<CharacterAppearance> = Object.freeze({
  body: 'classic', face: 'friendly', hair: 'cap', outfit: 'explorer', accessory: 'none',
  skinColor: '#f0bd86', hairColor: '#593c2e',
})

export function normalizeCharacterAppearance(value: unknown): CharacterAppearance {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
  const result = { ...DEFAULT_CHARACTER_APPEARANCE }
  for (const key of Object.keys(CHARACTER_APPEARANCE_OPTIONS) as (keyof typeof CHARACTER_APPEARANCE_OPTIONS)[]) {
    const selected = source[key]
    if (typeof selected === 'string' && (CHARACTER_APPEARANCE_OPTIONS[key] as readonly string[]).includes(selected)) {
      Object.assign(result, { [key]: selected })
    }
  }
  for (const key of ['skinColor', 'hairColor'] as const) {
    if (typeof source[key] === 'string' && /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(source[key])) result[key] = source[key].toLowerCase()
  }
  return result
}
