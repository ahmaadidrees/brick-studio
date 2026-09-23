import type { ObjKind } from '@brick-studio/platformer-core/engine/level'
import { C, T } from '@brick-studio/platformer-core/engine/tiles'

export type Category = 'terrain' | 'blocks' | 'items' | 'enemies' | 'gizmos' | 'course'

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'items', label: 'Items' },
  { id: 'enemies', label: 'Enemies' },
  { id: 'gizmos', label: 'Gizmos' },
  { id: 'course', label: 'Course' },
]

export type Placement =
  | { kind: 'tile'; tile: number; content: number }
  | { kind: 'pipe' }
  | { kind: 'object'; obj: ObjKind; alt: 0 | 1 }
  /** Goes inside a ? block or brick when dropped on one, otherwise placed as `fallback`. */
  | { kind: 'content'; content: number; fallback: { kind: 'tile'; tile: number } | { kind: 'object'; obj: ObjKind } }

export interface PaletteItem {
  id: string
  label: string
  category: Category
  /** Art key for the icon. */
  icon: string
  place: Placement
  hint?: string
}

export const PALETTE: PaletteItem[] = [
  { id: 'ground', label: 'Ground', category: 'terrain', icon: 'g:0:day', place: { kind: 'tile', tile: T.GROUND, content: 0 } },
  { id: 'hard', label: 'Hard block', category: 'terrain', icon: 'hard', place: { kind: 'tile', tile: T.HARD, content: 0 } },
  { id: 'semi', label: 'One-way platform', category: 'terrain', icon: 'semi:00', place: { kind: 'tile', tile: T.SEMI, content: 0 }, hint: 'Jump up through it, land on top' },
  { id: 'pipe', label: 'Pipe', category: 'terrain', icon: 'pipeicon', place: { kind: 'pipe' }, hint: 'Click where the top should be; it reaches down to the ground' },
  { id: 'spikes', label: 'Spikes', category: 'terrain', icon: 'spikes', place: { kind: 'tile', tile: T.SPIKES, content: 0 } },
  { id: 'lava', label: 'Lava', category: 'terrain', icon: 'lava:0:1', place: { kind: 'tile', tile: T.LAVA, content: 0 } },

  { id: 'brick', label: 'Brick', category: 'blocks', icon: 'brick', place: { kind: 'tile', tile: T.BRICK, content: 0 }, hint: 'Breaks when you are big' },
  { id: 'qblock', label: '? block', category: 'blocks', icon: 'q:0', place: { kind: 'tile', tile: T.QBLOCK, content: C.COIN }, hint: 'Drop an item on it to change what comes out' },
  { id: 'bounce', label: 'Bounce block', category: 'blocks', icon: 'bounce', place: { kind: 'tile', tile: T.BOUNCE, content: 0 } },
  { id: 'spring', label: 'Spring', category: 'blocks', icon: 'spring:0', place: { kind: 'tile', tile: T.SPRING, content: 0 }, hint: 'Hold jump when you land for a big bounce' },

  { id: 'coin', label: 'Coin', category: 'items', icon: 'coin:0', place: { kind: 'content', content: C.COIN, fallback: { kind: 'tile', tile: T.COIN } } },
  { id: 'grow', label: 'Grow power-up', category: 'items', icon: 'grow', place: { kind: 'content', content: C.GROW, fallback: { kind: 'object', obj: 'grow' } }, hint: 'Drop on a ? block or brick to hide it inside' },
  { id: 'spark', label: 'Spark power-up', category: 'items', icon: 'sparkitem:1', place: { kind: 'content', content: C.SPARK, fallback: { kind: 'object', obj: 'spark' } }, hint: 'Throw sparks with the run button' },

  { id: 'walker', label: 'Walker', category: 'enemies', icon: 'walker:1', place: { kind: 'object', obj: 'walker', alt: 0 } },
  { id: 'shellbug', label: 'Shellbug', category: 'enemies', icon: 'shellbug:1', place: { kind: 'object', obj: 'shellbug', alt: 0 }, hint: 'Stomp it, then kick the shell' },
  { id: 'spiky', label: 'Spiky', category: 'enemies', icon: 'spiky:1', place: { kind: 'object', obj: 'spiky', alt: 0 }, hint: 'Cannot be stomped' },
  { id: 'flyer', label: 'Flyer', category: 'enemies', icon: 'flyer:1', place: { kind: 'object', obj: 'flyer', alt: 0 }, hint: 'Bobs up and down; stomp it to ground it' },

  { id: 'lift', label: 'Moving platform', category: 'gizmos', icon: 'lift', place: { kind: 'object', obj: 'platform', alt: 0 }, hint: 'Press R before placing to flip direction' },
  { id: 'liftv', label: 'Up-down platform', category: 'gizmos', icon: 'lift', place: { kind: 'object', obj: 'platform', alt: 1 } },

  { id: 'start', label: 'Start', category: 'course', icon: 'start', place: { kind: 'object', obj: 'start', alt: 0 } },
  { id: 'checkpoint', label: 'Checkpoint', category: 'course', icon: 'checkpoint:0', place: { kind: 'object', obj: 'checkpoint', alt: 0 } },
  { id: 'goal', label: 'Goal', category: 'course', icon: 'goalicon', place: { kind: 'object', obj: 'goal', alt: 0 } },
]

export const itemById = (id: string) => PALETTE.find((p) => p.id === id)
