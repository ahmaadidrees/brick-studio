import type { BrickDef } from '../core/contracts'
import { createBlockBrick } from './gridBricks'
import { createCoinBrick, createEmptyBrick, createGoalBrick, createSpringBrick, createWalkerBrick } from './starter'

/** A "start from a brick that works" choice for + New brick (STEP6.md). */
export interface BrickTemplate {
  id: string
  /** Shown on the card: "Start from Walker". */
  label: string
  /** One short line: "walks and turns around". */
  blurb: string
  /** A fresh brick (new ids) plus its Blockly workspace JSON, ready for store.addBrick + setWorkspace. */
  make(id: string, name: string, options?: { char?: string }): { brick: BrickDef; workspace: unknown }
}

/**
 * Walker, Coin, Spring, Goal, Block (snaps to grid) and Empty. Each is the same brick the starter level uses (scripts made of My Blocks, one
 * label per script), so "start from Walker" shows a kid a brick that already works. They talk to the rest of the level
 * only through broadcasts (stomped, hero hurt, coin collected, boing, course clear), so they work in any project that
 * has a Hero, and a Coin counts when the Stage listens for coin collected.
 */
export const BRICK_TEMPLATES: BrickTemplate[] = [
  { id: 'walker', label: 'Walker', blurb: 'walks, turns around, hurts the Hero', make: (id, name) => createWalkerBrick(id, name) },
  { id: 'coin', label: 'Coin', blurb: 'spins and vanishes when the Hero touches it', make: (id, name) => createCoinBrick(id, name) },
  { id: 'spring', label: 'Spring', blurb: 'launches the Hero up', make: (id, name) => createSpringBrick(id, name) },
  { id: 'goal', label: 'Goal', blurb: 'ends the level when the Hero reaches it', make: (id, name) => createGoalBrick(id, name) },
  {
    id: 'block',
    label: 'Block (snaps to grid)',
    blurb: 'a solid block you paint on the grid, like Ground',
    make: (id, name, options) => {
      const made = createBlockBrick(name, options?.char)
      return { brick: { ...made.brick, id }, workspace: made.workspace }
    },
  },
  { id: 'empty', label: 'Empty', blurb: 'a blank brick: you write the blocks', make: (id, name) => createEmptyBrick(id, name) },
]
