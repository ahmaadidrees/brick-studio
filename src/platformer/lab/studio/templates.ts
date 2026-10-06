import type { BrickDef } from '../core/contracts'

/** A "start from a brick that works" choice for + New brick (STEP6.md). */
export interface BrickTemplate {
  id: string
  /** Shown on the card: "Start from Walker". */
  label: string
  /** One short line: "walks and turns around". */
  blurb: string
  /** A fresh brick (new ids) plus its Blockly workspace JSON, ready for store.addBrick + setWorkspace. */
  make(id: string, name: string): { brick: BrickDef; workspace: unknown }
}

/** Stub. Owned by the step 6 "starter" lane: Walker, Coin, Spring, Goal and Empty templates. */
export const BRICK_TEMPLATES: BrickTemplate[] = []
