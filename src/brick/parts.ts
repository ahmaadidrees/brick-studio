import type { BrickInstance, BrickPart } from './types'

export const STUD = 0.62
export const PLATE_HEIGHT = 0.18
export const GRID_SIZE = 64
export const WINDOW_FRAME_MEMBER = 0.13
export const DOOR_FRAME_MEMBER = 0.16
export const EXPLORER_CAPSULE_HALF_HEIGHT = 0.18
export const EXPLORER_CAPSULE_RADIUS = 0.18

const COLLIDER_INSET = 0.035
const STEP_INSET = 0.03
const STAIR_RISER_RUN = EXPLORER_CAPSULE_RADIUS

export type PhysicalCuboid = {
  shape: 'cuboid'
  center: [number, number, number]
  halfExtents: [number, number, number]
}

export type PhysicalConvexHull = {
  shape: 'convexHull'
  vertices: [number, number, number][]
}

export type PhysicalRoundCuboid = Omit<PhysicalCuboid, 'shape'> & {
  shape: 'roundCuboid'
  borderRadius: number
}

export type PhysicalShape = PhysicalCuboid | PhysicalRoundCuboid | PhysicalConvexHull

export type FrameOpening = {
  width: number
  height: number
  sillHeight: number
}

export const BRICK_PARTS: BrickPart[] = [
  { id: 'brick_1x1', name: '1 × 1 Brick', width: 1, depth: 1, height: 3, kind: 'brick', icon: '1×1' },
  { id: 'brick_1x2', name: '1 × 2 Brick', width: 1, depth: 2, height: 3, kind: 'brick', icon: '1×2' },
  { id: 'brick_1x4', name: '1 × 4 Brick', width: 1, depth: 4, height: 3, kind: 'brick', icon: '1×4' },
  { id: 'brick_2x2', name: '2 × 2 Brick', width: 2, depth: 2, height: 3, kind: 'brick', icon: '2×2' },
  { id: 'brick_2x3', name: '2 × 3 Brick', width: 2, depth: 3, height: 3, kind: 'brick', icon: '2×3' },
  { id: 'brick_2x4', name: '2 × 4 Brick', width: 2, depth: 4, height: 3, kind: 'brick', icon: '2×4' },
  { id: 'plate_2x4', name: '2 × 4 Plate', width: 2, depth: 4, height: 1, kind: 'plate', icon: '▱' },
  { id: 'plate_4x6', name: '4 × 6 Plate', width: 4, depth: 6, height: 1, kind: 'plate', icon: '4×6' },
  { id: 'pillar_1x1', name: 'Tall Pillar', width: 1, depth: 1, height: 9, kind: 'brick', icon: '▥' },
  { id: 'slope_2x2', name: '2 × 2 Slope', width: 2, depth: 2, height: 3, kind: 'slope', icon: '◢' },
  { id: 'stair_2x3', name: 'Three Steps', width: 2, depth: 3, height: 3, kind: 'stair', icon: '▟' },
  { id: 'window_1x4', name: 'Window Frame', width: 1, depth: 4, height: 6, kind: 'window', icon: '▣' },
  { id: 'door_1x4', name: 'Door Frame', width: 1, depth: 4, height: 9, kind: 'door', icon: '▯' },
]

export const BRICK_PART_MAP = Object.fromEntries(BRICK_PARTS.map((part) => [part.id, part])) as Record<string, BrickPart>

export const BRICK_COLORS = [
  '#e7473c', '#ef8d32', '#f4ca3a', '#65b85a', '#2eaa9d', '#3e83d7',
  '#6857d9', '#d765ae', '#f5eee0', '#a9b7bd', '#52636c', '#7b5238',
]

export function rotatedSize(part: BrickPart, rotation: number) {
  return rotation % 2 === 0
    ? { width: part.width, depth: part.depth }
    : { width: part.depth, depth: part.width }
}

export function brickWorldPosition(brick: Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>) {
  const part = BRICK_PART_MAP[brick.partId]
  const size = rotatedSize(part, brick.rotation)
  return [
    (brick.x + size.width / 2 - GRID_SIZE / 2) * STUD,
    brick.y * PLATE_HEIGHT,
    (brick.z + size.depth / 2 - GRID_SIZE / 2) * STUD,
  ] as [number, number, number]
}

function cuboid(
  width: number,
  height: number,
  depth: number,
  x = 0,
  y = height / 2,
  z = 0,
): PhysicalCuboid {
  return {
    shape: 'cuboid',
    center: [x, y, z],
    halfExtents: [width / 2, height / 2, depth / 2],
  }
}

function roundCuboid(
  width: number,
  height: number,
  depth: number,
  borderRadius: number,
  x = 0,
  y = height / 2,
  z = 0,
): PhysicalRoundCuboid {
  return {
    shape: 'roundCuboid',
    center: [x, y, z],
    halfExtents: [width / 2, height / 2, depth / 2],
    borderRadius,
  }
}

function riserRamp(
  width: number,
  previousHeight: number,
  nextHeight: number,
  front: number,
): PhysicalConvexHull {
  const x0 = -width / 2
  const x1 = width / 2
  const z0 = front - STAIR_RISER_RUN
  const z1 = front + STEP_INSET / 2
  return {
    shape: 'convexHull',
    vertices: [
      [x0, previousHeight, z0], [x0, previousHeight, z1], [x0, nextHeight, z1],
      [x1, previousHeight, z0], [x1, previousHeight, z1], [x1, nextHeight, z1],
    ],
  }
}

/**
 * Returns the collision pieces in part-local coordinates. The local origin is
 * the center of the part footprint at its bottom face, matching the rendered
 * brick geometry.
 */
export function partPhysicalShapes(part: BrickPart): PhysicalShape[] {
  const width = part.width * STUD - COLLIDER_INSET
  const depth = part.depth * STUD - COLLIDER_INSET
  const height = part.height * PLATE_HEIGHT - 0.015

  if (part.kind === 'window') {
    const member = WINDOW_FRAME_MEMBER
    return [
      roundCuboid(width, member, depth, Math.min(0.055, member / 2 - 0.005), 0, member / 2, 0),
      cuboid(width, member, depth, 0, height - member / 2, 0),
      cuboid(width, height - member * 2, member, 0, height / 2, -depth / 2 + member / 2),
      cuboid(width, height - member * 2, member, 0, height / 2, depth / 2 - member / 2),
    ]
  }

  if (part.kind === 'door') {
    const member = DOOR_FRAME_MEMBER
    return [
      cuboid(width, height, member, 0, height / 2, -depth / 2 + member / 2),
      cuboid(width, height, member, 0, height / 2, depth / 2 - member / 2),
      cuboid(width, member, depth, 0, height - member / 2, 0),
    ]
  }

  if (part.kind === 'stair') {
    return Array.from({ length: part.depth }, (_, step): PhysicalShape[] => {
      const stepHeight = ((step + 1) / part.depth) * height
      const stepZ = (step - (part.depth - 1) / 2) * STUD
      const stepCollider = cuboid(
        width,
        stepHeight,
        STUD - STEP_INSET,
        0,
        stepHeight / 2,
        stepZ,
      )
      const ramp = riserRamp(
        width,
        (step / part.depth) * height,
        stepHeight,
        stepZ - (STUD - STEP_INSET) / 2,
      )
      return [stepCollider, ramp]
    }).flat()
  }

  if (part.kind === 'slope') {
    const x0 = -width / 2
    const x1 = width / 2
    const z0 = -depth / 2
    const z1 = depth / 2
    return [{
      shape: 'convexHull',
      vertices: [
        [x0, 0, z0], [x0, 0, z1], [x0, height, z1],
        [x1, 0, z0], [x1, 0, z1], [x1, height, z1],
      ],
    }]
  }

  return [cuboid(width, height, depth)]
}

export function frameOpening(part: BrickPart): FrameOpening | null {
  const depth = part.depth * STUD - COLLIDER_INSET
  const height = part.height * PLATE_HEIGHT - 0.015
  if (part.kind === 'window') {
    return {
      width: depth - WINDOW_FRAME_MEMBER * 2,
      height: height - WINDOW_FRAME_MEMBER * 2,
      sillHeight: WINDOW_FRAME_MEMBER,
    }
  }
  if (part.kind === 'door') {
    return {
      width: depth - DOOR_FRAME_MEMBER * 2,
      height: height - DOOR_FRAME_MEMBER,
      sillHeight: 0,
    }
  }
  return null
}

export function rotateLocalPoint(
  point: [number, number, number],
  rotation: BrickInstance['rotation'],
): [number, number, number] {
  const quarterTurn = rotation * Math.PI / 2
  const cosine = Math.round(Math.cos(quarterTurn))
  const sine = Math.round(Math.sin(quarterTurn))
  const x = point[0] * cosine + point[2] * sine
  const z = -point[0] * sine + point[2] * cosine
  return [
    Object.is(x, -0) ? 0 : x,
    point[1],
    Object.is(z, -0) ? 0 : z,
  ]
}

/** Converts local collision pieces into axis-aligned world-space pieces. */
export function brickPhysicalShapes(brick: BrickInstance): PhysicalShape[] {
  const origin = brickWorldPosition(brick)
  const rotated = brick.rotation % 2 === 1

  return partPhysicalShapes(BRICK_PART_MAP[brick.partId]).map((shape) => {
    if (shape.shape === 'convexHull') {
      return {
        shape: 'convexHull',
        vertices: shape.vertices.map((vertex) => {
          const point = rotateLocalPoint(vertex, brick.rotation)
          return [point[0] + origin[0], point[1] + origin[1], point[2] + origin[2]]
        }),
      }
    }

    const center = rotateLocalPoint(shape.center, brick.rotation)
    const halfExtents: PhysicalCuboid['halfExtents'] = rotated
      ? [shape.halfExtents[2], shape.halfExtents[1], shape.halfExtents[0]]
      : [...shape.halfExtents]
    return {
      ...shape,
      center: [center[0] + origin[0], center[1] + origin[1], center[2] + origin[2]],
      halfExtents,
    }
  })
}

/** Height of a walkable special-part surface at a local z coordinate. */
export function walkableSurfaceHeight(part: BrickPart, localZ: number) {
  const height = part.height * PLATE_HEIGHT - 0.015
  if (part.kind === 'slope') {
    const depth = part.depth * STUD - COLLIDER_INSET
    return Math.min(height, Math.max(0, ((localZ + depth / 2) / depth) * height))
  }
  if (part.kind === 'stair') {
    const step = Math.min(part.depth - 1, Math.max(0, Math.floor(localZ / STUD + part.depth / 2)))
    return ((step + 1) / part.depth) * height
  }
  return height
}
