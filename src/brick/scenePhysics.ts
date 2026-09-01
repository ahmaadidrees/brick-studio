import type {
  ColliderShapeCastHit,
  RigidBody,
  Rotation,
  Shape,
  Vector,
  World,
} from '@dimforge/rapier3d-compat'

export const CAMERA_PROBE_RADIUS = 0.22
export const CAMERA_SURFACE_PADDING = 0.08
export const CAMERA_MIN_DISTANCE = 0.65

export const EXPLORE_SPAWN_FLOOR_GAP = 0.03
export const EXPLORE_SPAWN_SIDE_CLEARANCE = 0.035
export const EXPLORE_SPAWN_HEAD_CLEARANCE = 0.08
export const EXPLORE_SPAWN_SUPPORT_DISTANCE = 0.12

export type ExplorePosition = { x: number; y: number; z: number }

type SpawnQuery = Pick<World, 'castShape' | 'intersectionsWithShape'>
type CameraQuery = Pick<World, 'castShape' | 'intersectionsWithShape'>

const IDENTITY_ROTATION: Rotation = { x: 0, y: 0, z: 0, w: 1 }
const DOWN: Vector = { x: 0, y: -1, z: 0 }

const CAMERA_RECOVERY_RATE = 4.5

/**
 * Obstructions contract the boom immediately; a clear path restores the
 * requested distance gradually so the camera does not snap away from walls.
 */
export function resolveCameraBoomDistance(
  currentDistance: number | null,
  desiredDistance: number,
  obstructionTimeOfImpact: number | null,
  delta: number,
) {
  const allowedDistance = obstructionTimeOfImpact === null
    ? desiredDistance
    : Math.max(CAMERA_MIN_DISTANCE, obstructionTimeOfImpact - CAMERA_SURFACE_PADDING)

  if (currentDistance === null || allowedDistance < currentDistance) return allowedDistance
  return allowedDistance + (currentDistance - allowedDistance) * Math.exp(-CAMERA_RECOVERY_RATE * delta)
}

/**
 * Casts the camera boom while ignoring only colliders already overlapping the
 * camera target. Rapier otherwise reports a time-of-impact of zero forever,
 * which pins the camera against the avatar until the avatar moves clear.
 */
export function findCameraObstruction(
  world: CameraQuery,
  target: Vector,
  rotation: Rotation,
  direction: Vector,
  probe: Shape,
  desiredDistance: number,
  excludeBody?: RigidBody,
): ColliderShapeCastHit | null {
  const initialOverlaps = new Set<number>()
  world.intersectionsWithShape(
    target,
    rotation,
    probe,
    (collider) => {
      initialOverlaps.add(collider.handle)
      return true
    },
    undefined,
    undefined,
    undefined,
    excludeBody,
  )

  return world.castShape(
    target,
    rotation,
    direction,
    probe,
    CAMERA_SURFACE_PADDING,
    desiredDistance,
    true,
    undefined,
    undefined,
    undefined,
    excludeBody,
    initialOverlaps.size
      ? (collider) => !initialOverlaps.has(collider.handle)
      : undefined,
  )
}

/**
 * Produces every baseplate cell from nearest to farthest, after any explicitly
 * preferred positions. The complete search is only performed while entering
 * Explore or requesting Respawn, never during ordinary movement.
 */
export function createExploreSpawnCandidates({
  preferred = [],
  gridSize,
  stud,
  standingY,
  origin = { x: 0, z: 5 },
}: {
  preferred?: ExplorePosition[]
  gridSize: number
  stud: number
  standingY: number
  origin?: { x: number; z: number }
}): ExplorePosition[] {
  const cells: ExplorePosition[] = []
  for (let gridX = 0; gridX < gridSize; gridX += 1) {
    for (let gridZ = 0; gridZ < gridSize; gridZ += 1) {
      cells.push({
        x: (gridX + 0.5 - gridSize / 2) * stud,
        y: standingY,
        z: (gridZ + 0.5 - gridSize / 2) * stud,
      })
    }
  }
  cells.sort((first, second) => {
    const firstDistance = (first.x - origin.x) ** 2 + (first.z - origin.z) ** 2
    const secondDistance = (second.x - origin.x) ** 2 + (second.z - origin.z) ** 2
    return firstDistance - secondDistance
  })

  const seen = new Set<string>()
  return [...preferred, { x: origin.x, y: standingY, z: origin.z }, ...cells].filter((candidate) => {
    const key = `${candidate.x.toFixed(4)}:${candidate.y.toFixed(4)}:${candidate.z.toFixed(4)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Clearance uses a slightly wider/taller capsule shifted upward so its feet
 * retain the normal floor gap while its sides and head receive extra room.
 * Support is checked independently with the real avatar capsule.
 */
export function isExploreSpawnSafe(
  world: SpawnQuery,
  candidate: ExplorePosition,
  avatarCapsule: Shape,
  clearanceCapsule: Shape,
  clearanceCenterOffset: number,
  excludeBody?: RigidBody,
): boolean {
  let blocked = false
  world.intersectionsWithShape(
    { x: candidate.x, y: candidate.y + clearanceCenterOffset, z: candidate.z },
    IDENTITY_ROTATION,
    clearanceCapsule,
    () => {
      blocked = true
      return false
    },
    undefined,
    undefined,
    undefined,
    excludeBody,
  )
  if (blocked) return false

  const support = world.castShape(
    candidate,
    IDENTITY_ROTATION,
    DOWN,
    avatarCapsule,
    0,
    EXPLORE_SPAWN_SUPPORT_DISTANCE,
    true,
    undefined,
    undefined,
    undefined,
    excludeBody,
  )
  return support !== null
}

export function findSafeExploreSpawn(
  world: SpawnQuery,
  candidates: readonly ExplorePosition[],
  avatarCapsule: Shape,
  clearanceCapsule: Shape,
  clearanceCenterOffset: number,
  excludeBody?: RigidBody,
): ExplorePosition | null {
  for (const candidate of candidates) {
    if (isExploreSpawnSafe(
      world,
      candidate,
      avatarCapsule,
      clearanceCapsule,
      clearanceCenterOffset,
      excludeBody,
    )) return candidate
  }
  return null
}
