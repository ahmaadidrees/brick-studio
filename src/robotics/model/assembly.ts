import type { BrickInstance, BrickPart } from '../../brick/types'
import { roboticsSpec } from '../parts/catalog'
import { brickCells, brickTop, type PartMap } from './grid'

/**
 * Assembly (contract §2, "Is it attached?"): structural joints between bricks.
 * The studio has no adjacency model of its own (`supportHeightForFootprint` only
 * finds the height a ghost should land on), so this is the first: a stud joint
 * exists where a brick with studs on its top face carries a brick with tubes under
 * its bottom face, at least one stud column in common. Bricks joined this way move
 * as one rigid body.
 *
 * Nodes are brick ids, except the hinge motor, which is one brick with two rigid
 * sides: its bottom tubes belong to the node `<id>` (the fixed housing) and its top
 * studs to `<id>#arm` (the moving turntable). The build plate is the node `world`:
 * a brick with tubes standing at y = 0 is studded to it.
 */
export const WORLD_NODE = 'world'
export const ARM_SUFFIX = '#arm'

export type AssemblyNode = string

export type StudJoint = {
  /** Node whose studs carry the joint; `world` for the build plate. */
  lower: AssemblyNode
  /** Node whose tubes sit on those studs. */
  upper: AssemblyNode
  lowerBrickId: string | null
  upperBrickId: string
  /** Shared stud columns, `x,z` keys. */
  cells: string[]
}

export const armNode = (brickId: string) => `${brickId}${ARM_SUFFIX}`
export const isArmNode = (node: AssemblyNode) => node.endsWith(ARM_SUFFIX)
export const brickIdOfNode = (node: AssemblyNode): string | null => node === WORLD_NODE ? null : isArmNode(node) ? node.slice(0, -ARM_SUFFIX.length) : node

/** Node that owns a brick's top studs. */
export function topNode(brick: BrickInstance): AssemblyNode {
  return roboticsSpec(brick.partId)?.hinge ? armNode(brick.id) : brick.id
}

/** Node that owns a brick's bottom tubes. */
export function bottomNode(brick: BrickInstance): AssemblyNode {
  return brick.id
}

/** Same rule the renderer uses for stock parts; robotics parts declare it. */
export function studsTopOf(part: BrickPart): boolean {
  const spec = roboticsSpec(part.id)
  if (spec) return spec.studsTop
  if (part.studs === 'none') return false
  if (part.studs === 'full') return true
  return part.kind !== 'slope' && part.kind !== 'stair' && part.kind !== 'cone'
}

/** Every stock brick has tubes; robotics parts declare it (an axle or a wheel has none). */
export function tubesBottomOf(part: BrickPart): boolean {
  const spec = roboticsSpec(part.id)
  return spec ? spec.tubesBottom : true
}

export function deriveStudJoints(bricks: readonly BrickInstance[], partMap: PartMap): StudJoint[] {
  const joints: StudJoint[] = []
  const byTop = new Map<number, { brick: BrickInstance; part: BrickPart; cells: Set<string> }[]>()
  const cellsOf = new Map<string, string[]>()
  for (const brick of bricks) {
    const part = partMap[brick.partId]
    if (!part) continue
    const cells = brickCells(brick, part)
    cellsOf.set(brick.id, cells)
    if (!studsTopOf(part)) continue
    const top = brickTop(brick, part)
    const list = byTop.get(top) ?? []
    list.push({ brick, part, cells: new Set(cells) })
    byTop.set(top, list)
  }
  for (const brick of bricks) {
    const part = partMap[brick.partId]
    if (!part || !tubesBottomOf(part)) continue
    const cells = cellsOf.get(brick.id) ?? []
    if (brick.y === 0) {
      joints.push({ lower: WORLD_NODE, upper: bottomNode(brick), lowerBrickId: null, upperBrickId: brick.id, cells: [...cells] })
      continue
    }
    for (const carrier of byTop.get(brick.y) ?? []) {
      if (carrier.brick.id === brick.id) continue
      const shared = cells.filter((cell) => carrier.cells.has(cell))
      if (shared.length === 0) continue
      joints.push({ lower: topNode(carrier.brick), upper: bottomNode(brick), lowerBrickId: carrier.brick.id, upperBrickId: brick.id, cells: shared })
    }
  }
  return joints
}
