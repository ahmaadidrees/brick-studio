/**
 * Players in a Hackable room (docs/qa/hackable-rooms M0). The room puts joins, leaves and key presses in one order,
 * stamped with ticks; every player's game applies them at those ticks, so all of them run the same game.
 *
 * Each player gets a Hero: a painted copy of the kit's player brick (the Hero, the Car), tagged with their number. The
 * first player to join takes the Hero painted in the level; later players get new copies at the same spot, a little to
 * the side. A Hero's "key pressed?" and "when key pressed" hear only its player's keys (runtime.pressKey with a
 * player); bricks that are no one's hear every player's.
 *
 * Outside a room nothing here runs and `world.players` stays missing, so a single game is exactly as before.
 */
import type { CopyPlacement, PlayerSlot, Target } from './contracts'
import { targetForCopy } from './project'
import type { Runtime } from './runtime'

/** Steps between one player's Hero and the next one's, so they don't start inside each other. */
export const PLAYER_SPACING = 20

/** A player's Hero target id (later players; the first takes the painted Hero's own id). */
export const playerTargetId = (num: number): string => `player:${num}`

export const playerHero = (world: Runtime['world'], num: number): Target | undefined =>
  world.targets.find((t) => t.player === num && !t.isClone)

/**
 * A player joins. `spawn` is the painted Hero's placement in the project (where every player's Hero starts). Returns
 * their Hero, or undefined when the level has no player brick to copy. Joining twice changes nothing.
 */
export function addPlayer(runtime: Runtime, player: { num: number; name: string }, spawn: CopyPlacement): Target | undefined {
  const world = runtime.world
  const players = (world.players ??= [])
  if (players.some((p) => p.num === player.num)) return playerHero(world, player.num)
  const slot: PlayerSlot = { num: player.num, name: player.name, keys: [] }
  players.push(slot)

  // The first player takes the painted Hero (anyone, if it is free again).
  const painted = world.targets.find((t) => !t.isClone && t.copyId === spawn.id && t.player === undefined)
  if (painted) {
    painted.player = player.num
    return painted
  }

  const brick = world.bricks[spawn.brickId]
  if (!brick) return undefined
  const index = players.length - 1
  const hero = targetForCopy({ ...spawn, id: playerTargetId(player.num), x: spawn.x + index * PLAYER_SPACING }, brick)
  hero.player = player.num
  world.targets.push(hero)
  // A game already running starts the new Hero the way the green flag started everyone's ("every tick" scripts pick
  // it up on their own next tick).
  if (world.everyTick) runtime.startHats('event_whenflagclicked', { target: hero })
  return hero
}

/** A player leaves: their keys come up, and their Hero and its clones go. */
export function removePlayer(runtime: Runtime, num: number): void {
  const world = runtime.world
  const slot = world.players?.find((p) => p.num === num)
  if (!slot) return
  for (const key of [...slot.keys]) runtime.releaseKey(key, num)
  world.players = world.players!.filter((p) => p !== slot)
  for (const t of world.targets.filter((x) => x.player === num)) {
    if (t.isClone) {
      runtime.removeClone(t)
      continue
    }
    runtime.stopTarget(t)
    const i = world.targets.indexOf(t)
    if (i >= 0) world.targets.splice(i, 1)
  }
  runtime.syncThreadsToWorld()
}
