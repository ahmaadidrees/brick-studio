/**
 * Start from nothing's own blocks (docs/qa/blank-2d): the Game category's "touching the player?". A game made from
 * nothing names its player by brick id (LevelDesign.player), so a job never has to know what the kid called it.
 */
import { playerBrickIdOf, type PrimitiveTable } from './contracts'
import { touchingBrick } from './sensing'

export const gamePrimitives: PrimitiveTable = {
  /**
   * Am I touching the player (any copy of it: every friend's in a room, and its clones)? The player's own copies never
   * touch "the player". In a room it works like "touching Hero?": the script is then about the players it touched
   * (ThreadHandle.about), so a Hurts job's "hero hurt" sends back only that friend, and a Goal job finishes only them.
   */
  game_touchingplayer(ctx) {
    const self = ctx.target
    const world = ctx.runtime.world
    const player = playerBrickIdOf(world)
    if (!player || self.isStage || self.brickId === player) return false
    const brick = world.bricks[player]
    return !!brick && !brick.isStage && touchingBrick(ctx, brick)
  },
}
