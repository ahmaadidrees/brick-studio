/**
 * Hackable 3D (docs/qa/hackable-3d/SPIKE.md, D1.md): the 3D kit's engine on the shared Hackable runtime.
 *
 * Same scheduler, op budget, blocks, RNG, snapshot and players as the Platformer and Racing; the kit adds its blocks
 * (blocks3d.ts), makes its own world (every copy gets a z and a box) and runs its physics step after every tick.
 * core/index.ts registers it as `KIT_ENGINES['3d']`; this file never imports core/index (no cycle).
 */
import type { CopyPlacement, LevelDesign } from '../core/contracts'
import type { RuntimeLifecycle } from '../core/runtime'
import { onGreenFlagLooks, onStopAllLooks } from '../core/looks'
import { everyTickLifecycle } from '../core/platformer'
import { addPlayer, removePlayer, playerHero } from '../core/players'
import { instantiate, targetForCopy } from '../core/project'
import type { Runtime } from '../core/runtime'
import { clearQuestions } from '../core/sensing'
import { onGreenFlagSound, onStopAllSound } from '../core/sound'
import { PLATE, STUD, plateOf, type BrickDef3, type CopyPlacement3, type LevelDesign3, type Target3, type World3 } from './contracts3d'
import { HERO_SIZE, newCharacter, physicsStep3d, sceneryBoxes } from './physics3d'
import { partsOf } from './parts3d'

/** The 3D Hero brick (the kit's player, like brick_hero and brick_car). */
export const HERO3D = 'brick_hero3d'
/** SPIKE: the one brick every scenery target uses when `sceneryAsTargets` is on. */
export const SCENERY_BRICK = 'brick_scenery3d'

/** The Platformer's lifecycle (looks, sound, "over and over"), with the 3D physics step after each tick. */
export const kit3dLifecycle: Partial<RuntimeLifecycle> = {
  greenFlag: [onGreenFlagLooks, onGreenFlagSound],
  afterGreenFlag: [everyTickLifecycle.afterGreenFlag],
  stopAll: [onStopAllLooks, onStopAllSound, clearQuestions, everyTickLifecycle.stopAll],
  afterTick: [everyTickLifecycle.afterTick, physicsStep3d],
}

export const isHero3dBrick = (brick: Pick<BrickDef3, 'id' | 'remixOf'> | undefined): boolean => !!brick && (brick.id === HERO3D || brick.remixOf === HERO3D)
const isHeroBrick = isHero3dBrick

/** A code brick with no shape of its own (a new brick) is a 1 × 1 brick. */
export const DEFAULT_SHAPE3 = { w: STUD, h: 3 * PLATE, d: STUD } as const

/** Give a fresh target its z and body from its placement and brick. */
function make3d(t: Target3, placement: { z: number } | undefined, brick: BrickDef3 | undefined): void {
  t.z = placement?.z ?? 0
  const shape = brick?.shape3d ?? DEFAULT_SHAPE3
  t.body3 = { w: shape.w, h: shape.h, d: shape.d, solid: false, gravity: false, vx: 0, vy: 0, vz: 0, onGround: false }
  if (isHeroBrick(brick)) {
    t.body3.w = HERO_SIZE.w
    t.body3.h = HERO_SIZE.h
    t.body3.d = HERO_SIZE.d
    // Heroes are solid (owner decision 2026-11-04): they stand on and bump into each other, in rooms too.
    t.body3.solid = true
    t.body3.character = newCharacter()
  }
}

/** A fresh 3D world: the core's world, every copy given its z and body, the build kept as the project. */
export function instantiate3d(design: LevelDesign3): World3 {
  const world = instantiate(design) as World3
  const byId = new Map(design.copies.map((c) => [c.id, c]))
  for (const t of world.targets) make3d(t, byId.get(t.copyId ?? t.id), world.bricks[t.brickId] as BrickDef3)
  if (design.sceneryAsTargets) {
    // The 2D way, for comparison: every build brick a solid target (its bounding box).
    const parts = partsOf(design)
    design.scenery3d.forEach((brick, i) => {
      const boxes = sceneryBoxes(brick, parts, plateOf(design))
      if (boxes.length === 0) return
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
      for (const b of boxes) { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); z0 = Math.min(z0, b.z0); z1 = Math.max(z1, b.z1) }
      const t = targetForCopy({ id: `s:${i}`, brickId: SCENERY_BRICK, x: (x0 + x1) / 2, y: y0 }, undefined) as Target3
      t.z = (z0 + z1) / 2
      t.body3 = { w: x1 - x0, h: y1 - y0, d: z1 - z0, solid: true, gravity: false, vx: 0, vy: 0, vz: 0, onGround: false }
      world.targets.unshift(t)
    })
  }
  world.design = design
  return world
}

/** The spacing between players' Heroes (2D uses 20 steps; here a little over a stud). */
const PLAYER_SPACING_3D = 0.6

/** The painted Hero every player's Hero starts from. */
export function heroSpawn(design: LevelDesign): CopyPlacement3 {
  const spawn = (design as LevelDesign3).copies.find((c) => c.brickId === HERO3D)
  if (!spawn) throw new Error('The project has no 3D Hero')
  return spawn
}

/** core/players.addPlayer, then the new Hero's z, body and a 3D-sized offset. */
export function addPlayer3d(runtime: Runtime, player: { num: number; name: string; yaw?: number }, spawn: CopyPlacement3): Target3 | undefined {
  const world = runtime.world as World3
  const hero = addPlayer(runtime, player, spawn as CopyPlacement) as Target3 | undefined
  const slot = world.players?.find((p) => p.num === player.num)
  if (slot && player.yaw !== undefined) slot.yaw = player.yaw
  if (!hero || hero.body3) return hero
  const index = (world.players?.length ?? 1) - 1
  make3d(hero, spawn, world.bricks[spawn.brickId] as BrickDef3)
  hero.x = spawn.x + index * PLAYER_SPACING_3D
  return hero
}

export const removePlayer3d = removePlayer
export { playerHero }

/** A player turned their camera: their keys now move along this yaw (whole degrees, so every browser agrees). */
export function lookPlayer3d(runtime: Runtime, num: number | undefined, yaw: number): void {
  const world = runtime.world as World3
  const y = Math.round(yaw) % 360
  if (num === undefined) { world.yaw3d = y; return }
  const slot = world.players?.find((p) => p.num === num)
  if (slot) slot.yaw = y
}
