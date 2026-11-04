/**
 * Hackable 3D: classic parts as collision boxes (docs/qa/hackable-3d/SPIKE.md, "How classic parts become boxes").
 *
 * A design's parts are the classic stock parts plus the design's own custom parts (`customParts3d`), never this
 * browser's global registry, so every browser builds the same boxes. Exact stud and plate multiples (no insets), so
 * neighbours meet face to face. Slopes become plate-high steps the Hero climbs by autostep; round parts and cones are
 * their footprint; doors and arches are frames you walk through.
 */
import { createPartMap } from '../../../../packages/brick-core/src/parts'
import type { BrickPart, CustomPartDefinition } from '../../../../packages/brick-core/src/types'
import { GRID, PLATE, STUD, type LevelDesign3, type SceneryBrick } from './contracts3d'

export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

export type PartMap = Readonly<Record<string, BrickPart>>

const STOCK: PartMap = createPartMap([])
const maps = new WeakMap<CustomPartDefinition[], PartMap>()

/** The parts a design can use: stock parts, plus its own custom parts (cached per list). */
export function partsOf(design: Pick<LevelDesign3, 'customParts3d'> | undefined): PartMap {
  const custom = design?.customParts3d
  if (!custom || custom.length === 0) return STOCK
  let map = maps.get(custom)
  if (!map) {
    map = createPartMap(custom)
    maps.set(custom, map)
  }
  return map
}

/** Quarter turns as exact integers: [cos, sin] (packages/brick-core rotateLocalPoint, without Math.cos). */
const QUARTER: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

/** A part-local box (x across the width, z along the depth, origin at the footprint centre, y up from its bottom). */
type Local = [cx: number, cy: number, cz: number, w: number, h: number, d: number]

function partBoxes(part: BrickPart): Local[] {
  const W = part.width * STUD
  const D = part.depth * STUD
  const H = part.height * PLATE
  switch (part.kind) {
    case 'corner':
      return [[-(W - STUD) / 2, 0, 0, STUD, H, D], [0, 0, -(D - STUD) / 2, W, H, STUD]]
    case 'door': {
      const m = 0.16
      return [[0, 0, -(D - m) / 2, W, H, m], [0, 0, (D - m) / 2, W, H, m], [0, H - m, 0, W, m, D]]
    }
    case 'arch': {
      const leg = 0.62
      const beam = 0.34
      return [[0, 0, -(D - leg) / 2, W, H, leg], [0, 0, (D - leg) / 2, W, H, leg], [0, H - beam, 0, W, beam, D]]
    }
    case 'stair': {
      const out: Local[] = []
      for (let s = 0; s < part.depth; s++) out.push([0, 0, (s - (part.depth - 1) / 2) * STUD, W, ((s + 1) * H) / part.depth, STUD])
      return out
    }
    case 'slope': {
      // High at +z (the classic hull): one step per plate of height.
      const steps = part.height
      const out: Local[] = []
      for (let s = 0; s < steps; s++) out.push([0, 0, -D / 2 + ((s + 0.5) * D) / steps, W, (s + 1) * PLATE, D / steps])
      return out
    }
    default:
      return [[0, 0, 0, W, H, D]]
  }
}

/** The footprint of a part turned `rotation` quarter turns, in studs. */
export function footprint(part: BrickPart, rotation: number): { w: number; d: number } {
  return rotation % 2 === 1 ? { w: part.depth, d: part.width } : { w: part.width, d: part.depth }
}

/** World boxes of one build brick on a plate `plate` studs square. */
export function sceneryBoxes(brick: SceneryBrick, parts: PartMap = STOCK, plate: number = GRID): Box[] {
  const part = parts[brick.partId]
  if (!part) return []
  const odd = brick.rotation % 2 === 1
  const { w: sw, d: sd } = footprint(part, brick.rotation)
  // Centre of the footprint: brickWorldPosition, with the plate's half width taken off in studs first (exact).
  const ox = (2 * brick.x + sw - plate) * (STUD / 2)
  const oz = (2 * brick.z + sd - plate) * (STUD / 2)
  const oy = brick.y * PLATE
  const [c, s] = QUARTER[brick.rotation & 3]
  return partBoxes(part).map(([cx, cy, cz, w, h, d]) => {
    const x = cx * c + cz * s
    const z = -cx * s + cz * c
    const hw = (odd ? d : w) / 2
    const hd = (odd ? w : d) / 2
    return { x0: ox + x - hw, x1: ox + x + hw, y0: oy + cy, y1: oy + cy + h, z0: oz + z - hd, z1: oz + z + hd }
  })
}

/** The top of the build under a footprint, in plates (supportHeightForFootprint, with the design's own parts). */
export function supportTop(scenery: readonly SceneryBrick[], parts: PartMap, x: number, z: number, w: number, d: number): number {
  let top = 0
  for (const b of scenery) {
    const part = parts[b.partId]
    if (!part) continue
    const f = footprint(part, b.rotation)
    if (x < b.x + f.w && x + w > b.x && z < b.z + f.d && z + d > b.z) top = Math.max(top, b.y + part.height)
  }
  return top
}
