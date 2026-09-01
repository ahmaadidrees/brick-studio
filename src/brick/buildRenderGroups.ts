import type { BrickInstance, EnvironmentId } from './types'

export type InstancedBrickGroup = {
  partId: string
  /** Maximum instance allocation while the brick document is unchanged. */
  capacity: number
  bricks: BrickInstance[]
}

export type BuildRenderPartition = {
  instancedGroups: InstancedBrickGroup[]
  interactiveBricks: BrickInstance[]
}

export type BuildRenderPartitionOptions = {
  selectedIds: readonly string[]
  movingId?: string | null
  recentlyPlacedId?: string | null
}

/**
 * Keep the small set that needs per-brick React state interactive and collapse
 * everything else into one GPU instance group per part geometry.
 */
export function partitionBuildBricks(
  bricks: readonly BrickInstance[],
  { selectedIds, movingId, recentlyPlacedId }: BuildRenderPartitionOptions,
): BuildRenderPartition {
  const interactiveIds = new Set(selectedIds)
  if (movingId) interactiveIds.add(movingId)
  if (recentlyPlacedId) interactiveIds.add(recentlyPlacedId)

  const groupsByPart = new Map<string, InstancedBrickGroup>()
  const interactiveBricks: BrickInstance[] = []

  for (const brick of bricks) {
    let group = groupsByPart.get(brick.partId)
    if (!group) {
      group = { partId: brick.partId, capacity: 0, bricks: [] }
      groupsByPart.set(brick.partId, group)
    }
    group.capacity += 1

    if (interactiveIds.has(brick.id)) interactiveBricks.push(brick)
    else group.bricks.push(brick)
  }

  return {
    instancedGroups: [...groupsByPart.values()],
    interactiveBricks,
  }
}

export function brickIdForInstance(brickIds: readonly string[], instanceId: number | undefined) {
  return instanceId === undefined ? null : brickIds[instanceId] ?? null
}

/** Loading and failed additive worlds resolve to Classic, preserving its fallback. */
export function usesClassicEnvironmentRig(resolvedId: EnvironmentId) {
  return resolvedId === 'classic'
}

/** Additive Build worlds now mount their visual world and its authored lighting. */
export function usesStudioBuildLights(_resolvedId: EnvironmentId) {
  return false
}
