import {
  BRICK_VALLEY_DESCRIPTOR,
  SKY_ISLAND_DESCRIPTOR,
  TOY_ROOM_DESCRIPTOR,
} from './environments'
import { CC0_HERO_DESCRIPTOR, TOY_FIGURE_DESCRIPTOR } from './characters'
import type { CharacterDescriptor, EnvironmentDescriptor } from './registries'
import type { CharacterPaletteGroup } from './contentPicker'
import type { CharacterId } from './types'

export const CLASSIC_ENVIRONMENT_DESCRIPTOR = {
  id: 'classic',
  name: 'Classic Studio',
  description: 'The bright, familiar Brick Studio build plate.',
  previewKey: 'environment:classic',
} satisfies EnvironmentDescriptor

export const CLASSIC_CHARACTER_DESCRIPTOR = {
  id: 'classic',
  name: 'Classic Builder',
  description: 'The original friendly block character.',
  previewKey: 'character:classic',
  customizable: true,
} satisfies CharacterDescriptor

export const ENVIRONMENT_DESCRIPTORS = [
  CLASSIC_ENVIRONMENT_DESCRIPTOR,
  TOY_ROOM_DESCRIPTOR,
  BRICK_VALLEY_DESCRIPTOR,
  SKY_ISLAND_DESCRIPTOR,
] as const satisfies readonly EnvironmentDescriptor[]

export const CHARACTER_DESCRIPTORS = [
  CLASSIC_CHARACTER_DESCRIPTOR,
  TOY_FIGURE_DESCRIPTOR,
  CC0_HERO_DESCRIPTOR,
] as const satisfies readonly CharacterDescriptor[]

const BRICK_COLORS = [
  { value: '#e7473c', label: 'Brick red' },
  { value: '#f59e33', label: 'Orange' },
  { value: '#ffd34e', label: 'Sun yellow' },
  { value: '#4caf70', label: 'Leaf green' },
  { value: '#3e83d7', label: 'Sky blue' },
  { value: '#7657c8', label: 'Violet' },
  { value: '#ef74aa', label: 'Pink' },
  { value: '#edf2f5', label: 'Cloud white' },
  { value: '#3a424a', label: 'Charcoal' },
] as const

export const CHARACTER_PALETTE_GROUPS = [
  { key: 'primary', label: 'Main color', swatches: BRICK_COLORS },
  { key: 'secondary', label: 'Second color', swatches: BRICK_COLORS },
  { key: 'accent', label: 'Accent', swatches: BRICK_COLORS },
] as const satisfies readonly CharacterPaletteGroup[]

const CHARACTER_PALETTE_LABELS: Record<CharacterId, readonly [string, string, string]> = {
  classic: ['Shirt', 'Pants', 'Badge'],
  'toy-figure': ['Suit', 'Trim', 'Emblem'],
  'cc0-hero': ['Limbs', 'Shell', 'Hands'],
}

export function characterPaletteGroups(characterId: CharacterId): readonly CharacterPaletteGroup[] {
  const labels = CHARACTER_PALETTE_LABELS[characterId]
  return CHARACTER_PALETTE_GROUPS.map((group, index) => ({ ...group, label: labels[index] }))
}

export function resolveCharacterId(value: unknown): CharacterId {
  return CHARACTER_DESCRIPTORS.some(({ id }) => id === value)
    ? value as CharacterId
    : 'classic'
}
