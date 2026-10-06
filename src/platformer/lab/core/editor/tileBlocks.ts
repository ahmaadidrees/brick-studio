/**
 * The tile block for the editor (step 6). The integrator wires these into definitions.ts / toolbox.ts:
 *  - add `TILE_BLOCK_DEFINITIONS` to the array `getBlockDefinitions` returns (block JSON, same style as the rest);
 *  - add `TILE_TOOLBOX_ENTRY` to the Platformer category's contents, after `platformer_onground`;
 *  - add `TILE_BRICK_OPTION` to the `BRICK` menu of `platformer_whenbump` (after "edge").
 */
import { TILE_KINDS } from '../contracts'
import type { TileKind } from '../contracts'
import { CATEGORY_COLORS } from './colors'


const TILE_LABELS: Record<TileKind, string> = {
  ground: 'ground',
  brick: 'brick',
  hard: 'hard block',
  qblock: '? block',
  spikes: 'spikes',
  lava: 'lava',
}

/** Menu for `fields.TILE`: [label, value] with the value a TileKind. */
export const TILE_KIND_OPTIONS: [string, TileKind][] = TILE_KINDS.map((k): [string, TileKind] => [TILE_LABELS[k], k])

/** The extra `BRICK` menu option for `platformer_whenbump`: bumping any tile. */
export const TILE_BRICK_OPTION: [string, string] = ['a tile', '_tiles_']

/** `touching tile [spikes ▾]?` a boolean that is true when this brick's box overlaps a tile of that kind. */
export const TILE_BLOCK_DEFINITIONS = [
  {
    type: 'platformer_touchingtile',
    message0: 'touching tile %1?',
    args0: [{ type: 'field_dropdown', name: 'TILE', options: TILE_KIND_OPTIONS }],
    category: 'platformer',
    colour: CATEGORY_COLORS.platformer,
    output: 'Boolean',
    tooltip: '',
  },
]

/** Toolbox entry; spikes is the default kind. */
export const TILE_TOOLBOX_ENTRY = { kind: 'block' as const, type: 'platformer_touchingtile', fields: { TILE: 'spikes' } }
