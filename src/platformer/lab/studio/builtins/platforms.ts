/**
 * Moving platform and Up-down platform (parity bucket B, 2026-11-04): the classic lifts (platformer-core world.ts
 * PLATFORM, 48 x 8, 1 px a frame over 5 tiles and back; player.ts rides them) as bricks with open code.
 *
 * The engine has no rule for them. The platform moves itself ("move me with my own blocks"), is solid only on top like
 * a One-way platform, and every tick moves with "move [x] by (speed) and carry what stands on me", so a Hero or a
 * Walker standing on it goes along. Classic speeds, converted to ticks: 1 px a frame is 2 steps a tick; 5 tiles is 80
 * steps, so it turns every 40 ticks, as classic did every 80 frames.
 *
 * Placed classic lifts start left (sideways) or up (up-down): the classic editor gave them that way.
 */
import type { VariableDecl } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { buildArt } from '../../../render/art/library'
import { Blocks, type MyBlock } from '../blockBuilder'
import { costumeFromImage } from '../pixels'
import type { MadeBrick } from '../starter'

export const PLATFORM_BRICK_ID = 'brick_platform'
export const LIFT_BRICK_ID = 'brick_lift'
/** Steps a tick (classic PLATFORM_SPEED 1 px a frame, x 2). */
export const PLATFORM_SPEED = 2
/** How far it goes before it turns back (classic PLATFORM_RANGE, 5 tiles). */
export const PLATFORM_DISTANCE = 80

export function liftCostume() {
  const art = buildArt('lift')
  return costumeFromImage('Lift', { width: art.w, height: art.h, data: art.data }, { x: art.w / 2, y: art.h / 2 })
}

/** A moving platform brick. `axis` x goes side to side, y up and down. */
export function createPlatformBrick(id: string, name: string, axis: 'x' | 'y'): MadeBrick {
  const b = new Blocks(id)
  const speed = `${id}_speed`
  const distance = `${id}_distance`
  const way = `${id}_way`
  const gone = `${id}_gone`
  const glide: MyBlock = { proccode: 'glide and carry', argumentNames: [] }
  const turn: MyBlock = { proccode: 'turn back at the end', argumentNames: [] }
  const along = axis === 'x' ? 'side to side' : 'up and down'

  b.flag('When the level starts: be a platform you stand on, and move myself', [b.setMover('self'), b.setSolid('top'), b.set(gone, 0)])
  b.everyTick(`Over and over: glide ${along}, taking along whatever stands on me`, [b.call(glide), b.call(turn)])
  b.define(glide, 'Move my speed the way I am going, and carry what stands on me', [
    b.moveCarry(axis, b.mul(b.v(way), b.v(speed))),
    b.change(gone, b.v(speed)),
  ])
  b.define(turn, 'Gone the whole distance: start again, the other way', [
    b.when(b.not(b.lt(b.v(gone), b.v(distance))), [b.set(gone, 0), b.set(way, b.sub(0, b.v(way)))]),
  ])

  const variables: VariableDecl[] = [
    { id: speed, name: 'speed', value: PLATFORM_SPEED, showInBuild: true },
    { id: distance, name: 'distance', value: PLATFORM_DISTANCE, showInBuild: true },
    { id: way, name: 'way', value: axis === 'x' ? -1 : 1 },
    { id: gone, name: 'gone so far', value: 0 },
  ]
  const workspace = b.workspace(variables.map((v) => ({ id: v.id, name: v.name })))
  return {
    brick: { id, name, costumes: [liftCostume()], sounds: [], program: compileWorkspace(workspace, { variables }).program },
    workspace,
  }
}

export const createMovingPlatformBrick = (id = PLATFORM_BRICK_ID, name = 'Moving platform') => createPlatformBrick(id, name, 'x')
export const createUpDownPlatformBrick = (id = LIFT_BRICK_ID, name = 'Up-down platform') => createPlatformBrick(id, name, 'y')
