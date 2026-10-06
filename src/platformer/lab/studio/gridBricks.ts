/**
 * Step 7 (docs/qa/code-lab-core/STEP7.md): the standard grid bricks. Every painted block in a level is one of these
 * (or a kid's own grid brick): a real brick with costumes and Scratch code you can open with See inside.
 *
 * Costumes are the Brickgineers tile art itself (render/art/tiles.ts, the same pictures the old tile layer drew), cut
 * into 16 x 16 pixel costumes, so a painted cell looks exactly as before. Code is a few labelled scripts, with My
 * Blocks where they read better, in the Walker's style (starter.ts). The engine has no rule for any of them.
 *
 * Bump hats (STEP7.md "Bump hats on both sides"): the brick that was hit hears `when I bump [SIDE] of [Hero]` where
 * SIDE is the side of the Hero that touched it. The Hero jumping into a ? block or Brick from below touches with its
 * top, so they listen for `top`; landing on a Bounce block touches with its bottom, so Bounce listens for `bottom`.
 *
 * "Only on top" for the One-way platform is the `top` value of `platformer_setsolid`'s SOLID menu (the engine lane adds
 * that option; until it merges the field value is accepted by the compiler and acts like `on`).
 */
import type { BrickDef, Costume, VariableDecl } from '../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../core/editor/compile'
import { Bitmap } from '../../render/art/bitmap'
import { COIN_FRAMES } from '../../render/art/creatures'
import {
  GROUND_DOWN,
  GROUND_LEFT,
  GROUND_RIGHT,
  GROUND_UP,
  bounceTile,
  brickTile,
  groundTile,
  hardTile,
  lavaTile,
  questionTile,
  semiTile,
  spikesTile,
  usedTile,
} from '../../render/art/tiles'
import { Blocks, type MyBlock } from './blockBuilder'
import { costumeFromImage } from './pixels'

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

// -----------------------------------------------------------------------------
// Costumes (16 x 16, rotation center in the middle, mask and opaque box from the pixels)
// -----------------------------------------------------------------------------

const costumeOf = (name: string, tile: Bitmap): Costume =>
  costumeFromImage(name, { width: tile.w, height: tile.h, data: tile.data }, { x: 8, y: 8 })

/** A ground tile joined to its neighbours left and right (a row of Ground has no seams); `covered` = ground above it. */
const groundArt = (covered: boolean): Bitmap =>
  groundTile(GROUND_LEFT | GROUND_RIGHT | GROUND_DOWN | (covered ? GROUND_UP : 0), 'day', 0, covered ? 1 : 0)

/** The ? block's coin: the first spin frame of the real coin art, 16 x 16. */
const coinArt = (): Bitmap => {
  const out = new Bitmap(16, 16)
  out.blit(COIN_FRAMES[0]!, 0, 0)
  return out
}

/** The Bounce block pressed down 3 pixels: drop three rows from inside the coil, settle on the floor of the cell. */
const squashedBounceArt = (): Bitmap => {
  const src = bounceTile()
  const dropped = new Set([6, 8, 10])
  const out = new Bitmap(16, 16)
  let y = 3
  for (let sy = 0; sy < 16; sy++) {
    if (dropped.has(sy)) continue
    for (let x = 0; x < 16; x++) out.set(x, y, src.get(x, sy))
    y++
  }
  return out
}

// -----------------------------------------------------------------------------
// Assembling a template
// -----------------------------------------------------------------------------

interface Spec {
  key: GridBrickKey
  name: string
  char: string
  autotile?: boolean
  category: GridBrickTemplate['category']
  hint: string
  costumes: Costume[]
  variables?: VariableDecl[]
  workspace: WorkspaceJson
}

function assemble(spec: Spec): GridBrickTemplate {
  const compiledProgram = compileWorkspace(spec.workspace, spec.variables ? { variables: spec.variables } : undefined)
  return {
    key: spec.key,
    brick: {
      name: spec.name,
      costumes: spec.costumes,
      sounds: [],
      program: compiledProgram.program,
      grid: { char: spec.char, ...(spec.autotile ? { autotile: true } : {}) },
    },
    workspace: spec.workspace,
    category: spec.category,
    hint: spec.hint,
  }
}

/** The common first script: "when the level starts: be solid". `value` is the SOLID menu value ('on', or 'top' for only on top). */
function solidOnStart(b: Blocks, label: string, value: string): void {
  b.flag(label, [b.setSolid(value)])
}

// -----------------------------------------------------------------------------
// The eight bricks
// -----------------------------------------------------------------------------

function ground(): GridBrickTemplate {
  const b = new Blocks('ground')
  solidOnStart(b, 'When the level starts: be solid ground', 'on')
  return assemble({
    key: 'ground', name: 'Ground', char: 'G', autotile: true, category: 'terrain',
    hint: 'Solid. Grass on top, dirt underneath',
    costumes: [costumeOf('Grass', groundArt(false)), costumeOf('Dirt', groundArt(true))],
    workspace: b.workspace(),
  })
}

function hard(): GridBrickTemplate {
  const b = new Blocks('hard')
  solidOnStart(b, 'When the level starts: be solid', 'on')
  return assemble({
    key: 'hard', name: 'Hard block', char: 'H', category: 'terrain',
    hint: 'Solid. Walkers turn around when they bump it',
    costumes: [costumeOf('Hard', hardTile())],
    workspace: b.workspace(),
  })
}

function spikes(): GridBrickTemplate {
  const b = new Blocks('spikes')
  solidOnStart(b, 'When the level starts: be solid', 'on')
  b.bump('When the Hero bumps me from any side: hurt the Hero', '_any_', [b.broadcast('hero hurt')], 'Hero')
  return assemble({
    key: 'spikes', name: 'Spikes', char: 'S', category: 'terrain',
    hint: 'Solid. Hurts the Hero when it touches',
    costumes: [costumeOf('Spikes', spikesTile())],
    workspace: b.workspace(),
  })
}

/**
 * Lava is not solid: the Hero sinks in, so the check is "touching Hero?". It runs every tick (no wait): a wait would
 * let the Hero stand in lava for up to a few ticks, which feels wrong, and one sensing check per cell per tick is cheap
 * next to Ground's one-off script. The bubbling is a frame counter in My Block `bubble`, so every cell animates in step.
 */
function lava(): GridBrickTemplate {
  const b = new Blocks('lava')
  const frame = 'lava_frame'
  const bubble: MyBlock = { proccode: 'bubble', argumentNames: [] }
  const burn: MyBlock = { proccode: 'burn the Hero', argumentNames: [] }
  b.flag('When the level starts: bubble, and burn the Hero that touches me', [b.forever([b.call(bubble), b.call(burn)])])
  b.define(bubble, 'Show the next costume every 6th tick', [
    b.change(frame, 1),
    b.when(b.eq(b.mod(b.v(frame), 6), 0), [b.nextCostume()]),
  ])
  b.define(burn, 'Hurt the Hero if it touches me', [b.when(b.touchingHero(), [b.broadcast('hero hurt')])])
  const variables: VariableDecl[] = [{ id: frame, name: 'frame', value: 0 }]
  return assemble({
    key: 'lava', name: 'Lava', char: 'L', category: 'terrain',
    hint: 'Not solid. Hurts the Hero when it touches',
    costumes: [0, 2, 4, 6].map((f, i) => costumeOf(`Lava ${i + 1}`, lavaTile(f, true))),
    variables,
    workspace: b.workspace([{ id: frame, name: 'frame' }]),
  })
}

function semi(): GridBrickTemplate {
  const b = new Blocks('semi')
  solidOnStart(b, 'When the level starts: be solid only on top', 'top')
  return assemble({
    key: 'semi', name: 'One-way platform', char: '-', category: 'terrain',
    hint: 'Jump up through it, land on top',
    costumes: [costumeOf('Plate', semiTile(true, true))],
    workspace: b.workspace(),
  })
}

/** Brick: solid; bumped from below it hops up 4 and back down. (Breaking when the Hero is big comes later.) */
function brick(): GridBrickTemplate {
  const b = new Blocks('brick')
  const home = 'brick_home'
  const hop: MyBlock = { proccode: 'hop', argumentNames: [] }
  b.flag('When the level starts: be solid, and remember where I stand', [b.setSolid('on'), b.set(home, b.myY())])
  b.bump('When the Hero bumps me from below: hop', 'top', [b.call(hop)], 'Hero')
  // Ends with "set y to home", so a second bump in the middle of a hop can't leave the block out of place.
  b.define(hop, 'Up 4 steps, then back down', [b.repeat(2, [b.changeY(2)]), b.repeat(2, [b.changeY(-2)]), b.setYTo(b.v(home))])
  const variables: VariableDecl[] = [{ id: home, name: 'home', value: 0 }]
  return assemble({
    key: 'brick', name: 'Brick', char: 'B', category: 'blocks',
    hint: 'Solid. Hops when the Hero bumps it from below',
    costumes: [costumeOf('Brick', brickTile())],
    variables,
    workspace: b.workspace([{ id: home, name: 'home' }]),
  })
}

/**
 * ? block: variable "used" (0 until hit). Bumped from below by the Hero and not used yet: used = 1 first (so a second
 * bump in the same tick gives nothing), costume "used", one more coin on the Stage's global "coins", and a clone of
 * myself that rises as a coin and goes away. The clone is the pop, so the engine and the builder draw no special effect.
 */
function qblock(): GridBrickTemplate {
  const b = new Blocks('qblock')
  const used = 'qblock_used'
  const give: MyBlock = { proccode: 'give a coin', argumentNames: [] }
  const rise: MyBlock = { proccode: 'rise and vanish', argumentNames: [] }
  solidOnStart(b, 'When the level starts: be solid', 'on')
  b.bump('When the Hero bumps me from below: give a coin', 'top', [b.call(give)], 'Hero')
  b.startAsClone('When I am a coin clone: rise and vanish', [b.call(rise)])
  b.define(give, 'Only once: become a used block, count a coin, pop a coin clone', [
    b.when(b.eq(b.v(used), 0), [b.set(used, 1), b.switchCostume('used'), b.change('coins', 1), b.cloneMyself()]),
  ])
  b.define(rise, 'Look like a coin, stop being solid, float up, then go away', [
    b.switchCostume('coin'),
    b.setSolid('off'),
    b.repeat(6, [b.changeY(5)]),
    b.deleteThisClone(),
  ])
  const variables: VariableDecl[] = [{ id: used, name: 'used', value: 0 }]
  return assemble({
    key: 'qblock', name: '? block', char: 'Q', category: 'blocks',
    hint: 'Hit it from below for a coin',
    costumes: [costumeOf('?', questionTile(0)), costumeOf('used', usedTile()), costumeOf('coin', coinArt())],
    variables,
    workspace: b.workspace([{ id: used, name: 'used' }]),
  })
}

/** Bounce block: when the Hero lands on it, say "bounce" (the Hero answers with its own launch) and squash for a moment. */
function bounce(): GridBrickTemplate {
  const b = new Blocks('bounce')
  const squash: MyBlock = { proccode: 'squash', argumentNames: [] }
  solidOnStart(b, 'When the level starts: be solid', 'on')
  b.bump('When the Hero lands on me: say bounce and squash', 'bottom', [b.broadcast('bounce'), b.call(squash)], 'Hero')
  b.define(squash, 'Press down for a moment, then spring back', [b.switchCostume('squashed'), b.wait(0.1), b.switchCostume('bounce')])
  return assemble({
    key: 'bounce', name: 'Bounce block', char: 'O', category: 'blocks',
    hint: 'Land on it to be thrown up (higher if you hold jump)',
    costumes: [costumeOf('bounce', bounceTile()), costumeOf('squashed', squashedBounceArt())],
    workspace: b.workspace(),
  })
}

/**
 * "Block (snaps to grid)" (templates.ts): a solid grid brick with a kid-picked character. It is `when the level starts:
 * be solid`, plus an example `when I bump [top] of [Hero]` the kid can change (it says "Bonk!" for a moment).
 * `char` must be one character, not '.', and unused by the level's other grid bricks: the builder picks a free one.
 */
export function createBlockBrick(name: string, char = '1'): { brick: Omit<BrickDef, 'id'>; workspace: WorkspaceJson } {
  const b = new Blocks('block')
  b.flag('When the level starts: be solid', [b.setSolid('on')])
  b.bump('When the Hero bumps me from below: say Bonk!', 'top', [b.say('Bonk!'), b.wait(1), b.say('')], 'Hero')
  const workspace = b.workspace()
  const made = assemble({
    key: 'ground', name, char, category: 'blocks', hint: '', costumes: [costumeOf('Block', hardTile())], workspace,
  })
  return { brick: made.brick, workspace }
}

const MAKERS: Record<GridBrickKey, () => GridBrickTemplate> = { ground, hard, spikes, lava, semi, brick, qblock, bounce }

/** Build a fresh copy of a standard grid brick. */
export function gridBrickTemplate(key: GridBrickKey): GridBrickTemplate {
  const make = MAKERS[key]
  if (!make) throw new Error(`gridBrickTemplate: unknown key ${String(key)}`)
  return make()
}
