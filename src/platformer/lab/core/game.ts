/**
 * Start from nothing's own blocks (docs/qa/blank-2d): the Game category's "touching the player?". A game made from
 * nothing names its player by brick id (LevelDesign.player), so a job never has to know what the kid called it.
 */
import type { PrimitiveTable } from './contracts'
import { targetsTouch } from './touching'

export const gamePrimitives: PrimitiveTable = {
  /** Am I touching the player (any copy of it: every friend's in a room, and its clones)? */
  game_touchingplayer(ctx) {
    const self = ctx.target
    const world = ctx.runtime.world
    const player = world.design?.player ?? world.player
    if (!player || self.isStage || !self.visible || self.brickId === player) return false
    return world.targets.some((other) => other !== self && other.brickId === player && other.visible && targetsTouch(world, self, other))
  },
}
