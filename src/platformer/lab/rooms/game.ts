/**
 * What a Hackable room's events do to the game (docs/qa/hackable-rooms M1). Every player's browser applies the same
 * events at the same ticks with these functions, so every game stays the same.
 *
 * The project the game runs is kept on the world (`world.design`), shared between the timeline's copies like the
 * bricks: going back before an edit goes back to the project as it was, so a Hero joining or a Play again then uses
 * the right one.
 */
import { createRuntime, type Runtime } from '../core'
import type { CopyPlacement, LevelDesign } from '../core/contracts'
import { addPlayer, removePlayer } from '../core/players'
import { bricksOf } from '../core/project'
import { parse } from '../core/save'
import { worldFromJson } from '../core/snapshot'
import { isPlayerBrick } from '../studio/kitScreens'
import type { Base, RoomEv } from './protocol'

/** A project's text read once, however many times its event is played again. */
const designs = new WeakMap<object, LevelDesign>()

/** The design in a room's project text. Throws when it can't be read (the room already checked it). */
export function designOfText(text: string): LevelDesign {
  const result = parse(text)
  if (!result.ok) throw new Error('This project could not be read.')
  return result.save.design
}

function designOfEvent(ev: Extract<RoomEv, { t: 'project' }>): LevelDesign {
  let design = designs.get(ev)
  if (!design) designs.set(ev, (design = designOfText(ev.text)))
  return design
}

/** Where every player's Hero starts: the first placed copy of the kit's player brick (the Hero, the Car). */
export function spawnOf(design: LevelDesign): CopyPlacement | undefined {
  return design.copies.find((c) => isPlayerBrick(design, c.brickId))
}

/** A player's slot without a Hero (a level with no player brick placed): they can still press keys. */
function join(runtime: Runtime, num: number, name: string): void {
  const design = runtime.world.design
  const spawn = design && spawnOf(design)
  if (spawn) {
    addPlayer(runtime, { num, name }, spawn)
    return
  }
  const players = (runtime.world.players ??= [])
  if (!players.some((p) => p.num === num)) players.push({ num, name, keys: [] })
}

/** A fresh game from `design` at `tick`, the green flag pressed: how a room's session starts. */
export function freshGame(design: LevelDesign, tick: number): Runtime {
  const runtime = createRuntime(design)
  runtime.world.tick = tick
  runtime.world.design = design
  runtime.greenFlag()
  return runtime
}

/** The game a joining player starts from: the room's keyframe, or a fresh game. */
export function gameFromBase(base: Base): Runtime {
  const design = designOfText(base.project)
  if (!base.world) return freshGame(design, base.tick)
  const runtime = createRuntime(design)
  runtime.restoreWorld(worldFromJson(base.world, bricksOf(design), design))
  return runtime
}

/**
 * Play again: a fresh game from `design`, the clock carrying on, with the same players in the same order (added
 * before the green flag, so it starts every Hero) still holding the keys they held.
 */
export function playAgain(old: Runtime, design: LevelDesign): Runtime {
  const runtime = createRuntime(design)
  runtime.world.tick = old.world.tick
  runtime.world.design = design
  const players = old.world.players ?? []
  for (const p of players) join(runtime, p.num, p.name)
  runtime.greenFlag()
  for (const p of players) for (const key of p.keys) runtime.pressKey(key, p.num)
  return runtime
}

/**
 * The host's edit, live: the bricks are replaced (never changed in place), so scripts that start from now on run the
 * new blocks. Bricks the edit removed stay for the copies still using them, until the next Play again.
 */
function editLive(runtime: Runtime, design: LevelDesign): void {
  const world = runtime.world
  world.bricks = Object.assign(Object.create(null) as typeof world.bricks, world.bricks, bricksOf(design))
  world.design = design
}

/** Apply one room event before its tick runs. Returns the runtime to carry on with when the game was rebuilt. */
export function applyRoomEvent(runtime: Runtime, ev: RoomEv, by: number): Runtime | void {
  switch (ev.t) {
    case 'join':
      return join(runtime, ev.num, ev.name)
    case 'leave':
      return removePlayer(runtime, ev.num)
    case 'key':
      if (ev.down) runtime.pressKey(ev.key, by)
      else runtime.releaseKey(ev.key, by)
      return
    case 'project': {
      const design = designOfEvent(ev)
      if (ev.restart) return playAgain(runtime, design)
      return editLive(runtime, design)
    }
    case 'restart':
      return runtime.world.design ? playAgain(runtime, runtime.world.design) : undefined
  }
}
