/**
 * Step 7 (docs/qa/code-lab-core/STEP7.md): the standard grid bricks. Every painted block in a level is one of these
 * (or a kid's own grid brick): a real brick with costumes and Scratch code you can open with See inside.
 *
 * CONTRACT STUB. The bricks lane fills in the bodies; the signatures and names below are fixed.
 */
import type { BrickDef } from '../core/contracts'

/** A grid brick ready to add to a level: the brick (no id yet) and its Blockly workspace JSON. */
export interface GridBrickTemplate {
  /** Stable key, e.g. 'ground'. */
  key: string
  brick: Omit<BrickDef, 'id'>
  workspace: unknown
  /** Bricks panel category in the builder. */
  category: 'terrain' | 'blocks'
  /** One-line hint for the Placing strip, e.g. "Jump up through it, land on top". */
  hint?: string
}

/** Keys of the standard grid bricks, in Bricks panel order. */
export const GRID_BRICK_KEYS = ['ground', 'hard', 'spikes', 'lava', 'semi', 'brick', 'qblock', 'bounce'] as const
export type GridBrickKey = (typeof GRID_BRICK_KEYS)[number]

/**
 * Step 6/6b save characters -> the standard grid brick that replaces them. 'U' (a used ? block) becomes a ? block
 * (it starts fresh on Play, like everything else in a design), so conversion rewrites 'U' cells to 'Q'. Every other
 * standard grid brick's `grid.char` is its old character, so the rest of an old tiles layer is unchanged.
 */
export const LEGACY_TILE_BRICKS: Record<string, GridBrickKey> = {
  G: 'ground', H: 'hard', S: 'spikes', L: 'lava', '-': 'semi', B: 'brick', Q: 'qblock', U: 'qblock', O: 'bounce',
}

/** Build a fresh copy of a standard grid brick. */
export function gridBrickTemplate(key: GridBrickKey): GridBrickTemplate {
  throw new Error(`gridBrickTemplate(${key}): filled in by the step 7 bricks lane`)
}
