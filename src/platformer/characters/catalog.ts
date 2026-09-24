import { DEFAULT_CHARACTER, isCharacterId, type CharacterId } from '@brick-studio/platformer-core/net/protocol'

export interface CharacterOption {
  readonly id: CharacterId
  readonly name: string
  readonly description: string
  /** The source picture. Use characterPreviewStyle for a single-frame selector preview. */
  readonly previewUrl: string
}

export const CHARACTER_OPTIONS: readonly CharacterOption[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'The original builder.',
    previewUrl: '/platformer/characters/classic-preview.svg',
  },
  {
    id: 'builder',
    name: 'Builder',
    description: 'A brave explorer in a red cap.',
    previewUrl: '/platformer/characters/builder-v1.png',
  },
  {
    id: 'bolt-bot',
    name: 'Bolt Bot',
    description: 'A friendly robot with bouncy boots.',
    previewUrl: '/platformer/characters/bolt-bot-v1.png',
  },
  {
    id: 'brick-fox',
    name: 'Brick Fox',
    description: 'A playful fox with a blocky tail.',
    previewUrl: '/platformer/characters/brick-fox-v1.png',
  },
] as const

export function normalizeCharacterId(value: unknown): CharacterId {
  return isCharacterId(value) ? value : DEFAULT_CHARACTER
}

/** CSS for a square preview swatch. Generated art shows only the first idle cell of its 6 × 4 sheet. */
export function characterPreviewStyle(id: CharacterId): {
  backgroundImage: string
  backgroundPosition: string
  backgroundSize: string
  backgroundRepeat: 'no-repeat'
} {
  const url = CHARACTER_OPTIONS.find((option) => option.id === id)?.previewUrl ?? CHARACTER_OPTIONS[1].previewUrl
  return {
    backgroundImage: `url("${url}")`,
    backgroundPosition: id === 'classic' ? 'center' : 'left top',
    backgroundSize: id === 'classic' ? 'contain' : '600% 400%',
    backgroundRepeat: 'no-repeat',
  }
}
