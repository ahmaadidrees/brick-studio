import type RAPIER from '@dimforge/rapier3d-compat'
import { EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS } from '../../brick/parts'
import { EXPLORE_SPAWN_HEAD_CLEARANCE, EXPLORE_SPAWN_SIDE_CLEARANCE, findSafeExploreSpawn } from '../../brick/scenePhysics'
import type { Vec3 } from '../model/vec'
import type { RapierModule } from '../sim/colliders'
import { RIDER_STANDING_Y } from './rideModel'

/**
 * Free ground for a rider stepping off (checkpoint 4): for each point beside the creation
 * (best first, from `hopOffPoints`), find the surface under it in the Explore physics world
 * with a downward ray, stand the character's capsule on it, and keep the first spot the
 * studio's own spawn test accepts: the capsule, a little wider and taller, overlaps
 * nothing, and there is support under its feet. The same capsules and clearances as
 * `ExplorerAvatar`'s spawn search, so a spot this accepts is a spot the character can stand.
 */
type PlacementWorld = Pick<RAPIER.World, 'castRay' | 'castShape' | 'intersectionsWithShape'>

const CLEARANCE_CENTER_OFFSET = EXPLORE_SPAWN_HEAD_CLEARANCE / 2
const DOWN = { x: 0, y: -1, z: 0 }

export type HopOffShapes = { avatar: RAPIER.Shape; clearance: RAPIER.Shape }

export function hopOffShapes(rapier: RapierModule): HopOffShapes {
  return {
    avatar: new rapier.Capsule(EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS),
    clearance: new rapier.Capsule(
      EXPLORER_CAPSULE_HALF_HEIGHT + Math.max(0, EXPLORE_SPAWN_HEAD_CLEARANCE / 2 - EXPLORE_SPAWN_SIDE_CLEARANCE),
      EXPLORER_CAPSULE_RADIUS + EXPLORE_SPAWN_SIDE_CLEARANCE,
    ),
  }
}

/** Surface height under (x, z), looking down from `fromY`; null when there is nothing below. */
export function groundUnder(world: PlacementWorld, rapier: RapierModule, x: number, z: number, fromY: number, excludeBody?: RAPIER.RigidBody): number | null {
  const reach = fromY + 40
  const hit = world.castRay(new rapier.Ray({ x, y: fromY, z }, DOWN), reach, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, excludeBody)
  return hit ? fromY - hit.timeOfImpact : null
}

/**
 * Which surfaces count as ground to step off onto: looked for from `fromY` down, no higher
 * than `maxGround` (a rider steps down or across from a seat, never up onto a wall top) and
 * no lower than `minGround` (not over a drop).
 */
export type HopOffRange = { fromY: number; minGround: number; maxGround: number }

export function findHopOffPlacement(
  world: PlacementWorld,
  rapier: RapierModule,
  points: readonly { x: number; z: number }[],
  range: HopOffRange,
  shapes: HopOffShapes,
  excludeBody?: RAPIER.RigidBody,
): Vec3 | null {
  const candidates: Vec3[] = []
  for (const point of points) {
    const ground = groundUnder(world, rapier, point.x, point.z, range.fromY, excludeBody)
    if (ground === null || ground > range.maxGround || ground < range.minGround) continue
    candidates.push({ x: point.x, y: ground + RIDER_STANDING_Y, z: point.z })
  }
  return findSafeExploreSpawn(world, candidates, shapes.avatar, shapes.clearance, CLEARANCE_CENTER_OFFSET, excludeBody)
}
