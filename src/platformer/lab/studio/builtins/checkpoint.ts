/**
 * Checkpoint (parity bucket B, 2026-11-04): the classic checkpoint flag (platformer-core player.ts touchCourse and
 * respawn, art render/art/library.ts checkpointFlag, sound "checkpoint") as a brick with open code.
 *
 * When the Hero touches it, its flag goes up with the classic jingle and it says "checkpoint". The Hero hears that and
 * makes the spot where it stands its new start, so getting hurt brings it back here (heroBrick.ts, "When I reach a
 * Checkpoint"). Every other Checkpoint hears it too and lowers its flag: only the newest one is up, as in classic.
 * Touching a lowered flag again raises it again.
 */
import type { VariableDecl } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { buildArt } from '../../../render/art/library'
import { classicSound } from '../assets/classicSounds'
import { Blocks, type MyBlock } from '../blockBuilder'
import { costumeFromImage } from '../pixels'
import type { MadeBrick } from '../starter'

export const CHECKPOINT_BRICK_ID = 'brick_checkpoint'
/** What a Checkpoint says when the Hero reaches it (the Hero listens for it). */
export const CHECKPOINT_MESSAGE = 'checkpoint'
export const CHECKPOINT_SOUND = 'Checkpoint'

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

  b.flag('When the level starts: flag down, and watch for the Hero', [b.switchCostume('down'), b.set(up, 0), b.set(mine, 0), b.forever([b.call(watch)])])
  b.receive('When the Hero reaches a checkpoint: lower my flag, unless it was me', CHECKPOINT_MESSAGE, [
    b.either(b.eq(b.v(mine), 1), [b.set(mine, 0)], [b.set(up, 0), b.switchCostume('down')]),
  ])
  b.define(watch, 'The Hero touched me while my flag is down: raise it', [b.when(b.and(b.touchingHero(), b.eq(b.v(up), 0)), [b.call(raise)])])
  b.define(raise, 'Flag up, play the jingle, and tell the Hero to come back here', [
    b.set(up, 1),
    b.set(mine, 1),
    b.switchCostume('up'),
    b.blk('sound_play', { fields: { SOUND_MENU: CHECKPOINT_SOUND } }),
    b.broadcast(CHECKPOINT_MESSAGE),
  ])

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
