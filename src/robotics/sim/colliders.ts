import type RAPIER from '@dimforge/rapier3d-compat'
import { partPhysicalShapes, rotateLocalPoint, type PhysicalCuboid, type PhysicalShape } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import { brickOriginFor } from '../model/grid'

/**
 * Collider helpers ported from `codex/robotics-workshop` (`assembly/brickGeometry.ts`
 * and `simulation/rapier.ts`): the part-map-explicit twin of `brickPhysicalShapes`,
 * and the one place a `PhysicalShape` becomes a Rapier collider, built exactly the
 * way Explore builds them so a brick collides the same in both.
 */
export type RapierModule = typeof RAPIER

export function brickPhysicalShapesFor(brick: Pick<BrickInstance, 'x' | 'y' | 'z' | 'rotation'>, part: BrickPart, plateSize: number): PhysicalShape[] {
  const origin = brickOriginFor(brick, part, plateSize)
  const rotated = brick.rotation % 2 === 1
  return partPhysicalShapes(part).map((shape) => {
    if (shape.shape === 'convexHull') {
      return {
        shape: 'convexHull',
        vertices: shape.vertices.map((vertex) => {
          const point = rotateLocalPoint(vertex, brick.rotation)
          return [point[0] + origin.x, point[1] + origin.y, point[2] + origin.z]
        }),
      }
    }
    const center = rotateLocalPoint(shape.center, brick.rotation)
    const halfExtents: PhysicalCuboid['halfExtents'] = rotated
      ? [shape.halfExtents[2], shape.halfExtents[1], shape.halfExtents[0]]
      : [...shape.halfExtents]
    return { ...shape, center: [center[0] + origin.x, center[1] + origin.y, center[2] + origin.z], halfExtents }
  })
}

export type ColliderOptions = { friction?: number; density?: number }

export function addPhysicalShapeColliders(rapier: RapierModule, world: RAPIER.World, body: RAPIER.RigidBody, shapes: readonly PhysicalShape[], options: ColliderOptions = {}): RAPIER.Collider[] {
  const created: RAPIER.Collider[] = []
  for (const shape of shapes) {
    let description: RAPIER.ColliderDesc
    if (shape.shape === 'convexHull') {
      const hull = rapier.ColliderDesc.convexHull(new Float32Array(shape.vertices.flat()))
      if (!hull) throw new Error('Degenerate convex hull in physical shape')
      description = hull
    } else {
      const [halfWidth, halfHeight, halfDepth] = shape.halfExtents
      description = shape.shape === 'roundCuboid'
        ? rapier.ColliderDesc.roundCuboid(halfWidth - shape.borderRadius, halfHeight - shape.borderRadius, halfDepth - shape.borderRadius, shape.borderRadius)
        : rapier.ColliderDesc.cuboid(halfWidth, halfHeight, halfDepth)
      description.setTranslation(...shape.center)
    }
    description.setFriction(options.friction ?? 0.5)
    if (options.density !== undefined) description.setDensity(options.density)
    created.push(world.createCollider(description, body))
  }
  return created
}
