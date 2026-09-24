/** Cosmetic identities shared by the 2D game and room protocol. */
export const CHARACTER_IDS = ['classic', 'builder', 'bolt-bot', 'brick-fox'] as const
export type CharacterId = (typeof CHARACTER_IDS)[number]

/** New local sessions start here; a missing network identity belongs to a legacy Classic player. */
export const DEFAULT_CHARACTER: CharacterId = 'builder'

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value)
}
