/**
 * Checkpoint (parity bucket B, 2026-11-04): the classic checkpoint flag (platformer-core player.ts touchCourse and
 * respawn, art render/art/library.ts checkpointFlag, sound "checkpoint") as a brick with open code.
 *
 * When the Hero touches it, its flag goes up with the classic jingle and it says "checkpoint". The Hero hears that and
 * makes the spot where it stands its new start, so getting hurt brings it back here (heroBrick.ts, "When I reach a
 * Checkpoint"). Every other Checkpoint hears it too and lowers its flag: only the newest one is up, as in classic.
 * Touching a lowered flag again raises it again.
 *
 * In a room each player is on their own (docs/qa/hackable-rooms M2): "touching Hero?" makes the word reach only the
 * Heroes touching the flag, and the flag is everyone's. So the Checkpoint tells a Hero that touches it to come back here
 * whenever that Hero's own start is not here yet, flag up or not: every player gets their own checkpoint.
 */
import type { VariableDecl } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { buildArt } from '../../../render/art/library'
import { classicSound } from '../assets/classicSounds'
import { Blocks, type Conn, type MyBlock } from '../blockBuilder'
import { costumeFromImage } from '../pixels'
import type { MadeBrick } from '../starter'

export const CHECKPOINT_BRICK_ID = 'brick_checkpoint'
/** What a Checkpoint says when the Hero reaches it (the Hero listens for it). */
export const CHECKPOINT_MESSAGE = 'checkpoint'
export const CHECKPOINT_SOUND = 'Checkpoint'
/** A Hero whose start is further than this from a flag it touches (in steps, sideways) is told to come back here. */
const START_NEAR = 24

function flagCostume(name: string, active: number) {
  const art = buildArt(`checkpoint:${active}`)
  return costumeFromImage(name, { width: art.w, height: art.h, data: art.data }, { x: art.w / 2, y: art.h / 2 })
}

export function createCheckpointBrick(id = CHECKPOINT_BRICK_ID, name = 'Checkpoint'): MadeBrick {
  const b = new Blocks(id)
  const up = `${id}_up`
  const mine = `${id}_mine`
  const watch: MyBlock = { proccode: 'watch for the Hero', argumentNames: [] }
  const raise: MyBlock = { proccode: 'raise my flag', argumentNames: [] }
  const tell: MyBlock = { proccode: 'tell the Hero to come back here', argumentNames: [] }

  b.flag('When the level starts: flag down, and watch for the Hero', [b.switchCostume('down'), b.set(up, 0), b.set(mine, 0), b.forever([b.call(watch)])])
  b.receive('When the Hero reaches a checkpoint: lower my flag, unless it was me', CHECKPOINT_MESSAGE, [
    b.either(b.eq(b.v(mine), 1), [b.set(mine, 0)], [b.set(up, 0), b.switchCostume('down')]),
  ])
  // "start x of Hero" is the Hero that touched me (in a room, that player's): its own start.
  const heroStartX: Conn = { block: b.blk('sensing_of', { fields: { PROPERTY: 'start x', OBJECT: 'Hero' } }) }
  const startIsElsewhere = b.lt(START_NEAR, { block: b.blk('operator_mathop', { fields: { OPERATOR: 'abs' }, inputs: { NUM: b.as(b.sub(heroStartX, b.myX())) } }) })
  b.define(watch, 'The Hero touched me: raise my flag if it is down, and tell the Hero to come back here if its start is elsewhere', [
    b.when(b.touchingHero(), [b.when(b.eq(b.v(up), 0), [b.call(raise)]), b.when(startIsElsewhere, [b.call(tell)])]),
  ])
  b.define(raise, 'Flag up, and play the jingle', [
    b.set(up, 1),
    b.switchCostume('up'),
    b.blk('sound_play', { fields: { SOUND_MENU: CHECKPOINT_SOUND } }),
  ])
  b.define(tell, 'Tell the Hero to come back here (and the other flags to go down)', [b.set(mine, 1), b.broadcast(CHECKPOINT_MESSAGE)])

  const variables: VariableDecl[] = [
    { id: up, name: 'flag up', value: 0 },
    { id: mine, name: 'it was me', value: 0 },
  ]
  const workspace = b.workspace(variables.map((v) => ({ id: v.id, name: v.name })))
  return {
    brick: {
      id,
      name,
      costumes: [flagCostume('down', 0), flagCostume('up', 1)],
      sounds: [classicSound('checkpoint', CHECKPOINT_SOUND)],
      program: compileWorkspace(workspace, { variables }).program,
    },
    workspace,
  }
}
