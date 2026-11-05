/**
 * Players in a Hackable room (docs/qa/hackable-rooms M0). The room puts joins, leaves and key presses in one order,
 * stamped with ticks; every player's game applies them at those ticks, so all of them run the same game.
 *
 * Each player gets a Hero: a painted copy of the kit's player brick (the Hero, the Car), tagged with their number. The
 * first player to join takes the Hero painted in the level; later players get new copies at the same spot, a little to
 * the side (in Racing, on a starting grid behind the painted Car). A Hero's "key pressed?" and "when key pressed" hear only its player's keys (runtime.pressKey with a
 * player); bricks that are no one's hear every player's.
 *
 * Outside a room nothing here runs and `world.players` stays missing, so a single game is exactly as before.
 */
import { TILE_SIZE, parseGridCopyId, type CopyPlacement, type KitId, type PlayerSlot, type Target, type World } from './contracts'
import { sinCosDeg } from './detmath'
import { targetForCopy } from './project'
import { racerRadius } from './race'
import type { Runtime } from './runtime'

/** Steps between one player's Hero and the next one's, so they don't start inside each other. */
export const PLAYER_SPACING = 20

/**
 * Racing's starting grid, as classic Racing lines cars up (packages/platformer-core engine/car.ts `gridSpots`): two by
 * two behind the start, 1.6 bricks between rows, the second car of each row 1.4 bricks to the right and 0.6 back. The
 * painted Car is slot 0. Slot `i` is that many steps from it, along the way the painted Car points.
 */
export function gridSlot(spawn: Pick<CopyPlacement, 'x' | 'y' | 'direction'>, i: number): { x: number; y: number } {
  const [sin, cos] = sinCosDeg(spawn.direction ?? 90)
  // Scratch directions: 0 is up, 90 is right. Forward is (sin, cos); the car's right is (cos, -sin).
  const back = (Math.floor(i / 2) * 1.6 + (i % 2) * 0.6) * TILE_SIZE
  const side = (i % 2) * 1.4 * TILE_SIZE
  return { x: spawn.x - sin * back + cos * side, y: spawn.y - cos * back - sin * side }
}

/** Grid slots a joining Car may try before it gives up on finding a clear one. */
const GRID_SLOTS = 32

/**
 * The first grid slot where `car` touches nothing: no other player's Car, no Computer racer, no brick placed there
 * (grid cells don't count, they are the track). Mid-race the front slots are usually free again. Everything it reads is
 * the shared world, so every game of a room picks the same slot. With no clear slot, the next one in line.
 */
function clearGridSlot(world: World, car: Target, spawn: CopyPlacement, fallback: number): { x: number; y: number } {
  const reach = racerRadius(world, car)
  const others = world.targets.filter((t) => t.visible && !(t.copyId && parseGridCopyId(t.copyId) && !t.isClone))
  for (let i = 0; i < GRID_SLOTS; i++) {
    const at = gridSlot(spawn, i)
    const clear = others.every((t) => {
      const dx = t.x - at.x
      const dy = t.y - at.y
      const r = reach + racerRadius(world, t)
      return dx * dx + dy * dy >= r * r
    })
    if (clear) return at
  }
  return gridSlot(spawn, fallback)
}

/** A player's Hero target id (later players; the first takes the painted Hero's own id). */
export const playerTargetId = (num: number): string => `player:${num}`

export const playerHero = (world: Runtime['world'], num: number): Target | undefined =>
  world.targets.find((t) => t.player === num && !t.isClone)

/**
 * A player joins. `spawn` is the painted Hero's placement in the project (where every player's Hero starts). Returns
 * their Hero, or undefined when the level has no player brick to copy. Joining twice changes nothing.
 */
export function addPlayer(
  runtime: Runtime,
  player: { num: number; name: string },
  spawn: CopyPlacement,
  kit: KitId = 'platformer',
): Target | undefined {
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
  if (kit === 'race') {
    // Cars bump, so they line up side by side instead of nose to tail on the race line.
    const at = clearGridSlot(world, hero, spawn, index)
    hero.x = at.x
    hero.y = at.y
  }
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
  // Everyone still here had finished, and was only waiting for this player: the round is over.
  if (world.players.length && world.players.every((p) => p.finished !== undefined)) runtime.stopAll()
  runtime.syncThreadsToWorld()
}
