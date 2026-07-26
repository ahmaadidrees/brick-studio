import { GRID_SIZE, STUD } from './parts'

/**
 * Explore-mode "toy room diorama" layout.
 *
 * The build plate is a real Lego baseplate sitting on a kid's play table. Every
 * number here is shared by the renderer, the colliders, and the layout tests, so
 * a prop can never drift onto the plate or off the table.
 *
 * Scale: one world unit is ~1.3 cm (STUD 0.62 ≈ the 8 mm Lego stud pitch), so the
 * explorer capsule reads as a 5 cm minifig and a jumbo pencil is a fallen log.
 */

/** Baseplate slab thickness, matching the Baseplate mesh in BrickStudioScene. */
export const PLATE_THICKNESS = 0.18
/** Half width of the visible baseplate slab (the mesh is gridWorldSize + 0.35). */
export const PLATE_HALF = (GRID_SIZE * STUD + 0.35) / 2

/**
 * The table top sits exactly one plate-thickness below the plate top, so walking
 * off the plate is an 0.18 drop and walking back on is inside the character
 * controller's 0.22 autostep. Both numbers are load bearing — see toyRoom.test.
 */
export const DESK_TOP_Y = -PLATE_THICKNESS
export const DESK_HALF_X = 66
export const DESK_HALF_Z = 52
export const DESK_SLAB_THICKNESS = 3.4
export const DESK_LEG_INSET = 12

/**
 * A raised bull-nosed rail runs around the table — the honest, visible reason
 * you cannot walk off the world. It is deliberately low enough to see over and
 * to *jump onto*: standing on the rail looking down at the bedroom floor is the
 * payoff. An invisible guard just outside the rail catches the fall, and it is
 * tall enough that a double jump from the rail top (2 × ~1.4 apex) cannot clear it.
 */
export const DESK_RIM_WIDTH = 1.6
export const DESK_RIM_HEIGHT = 1.05
export const DESK_GUARD_HEIGHT = 6

export const DESK_INNER_HALF_X = DESK_HALF_X - DESK_RIM_WIDTH
export const DESK_INNER_HALF_Z = DESK_HALF_Z - DESK_RIM_WIDTH

/** Props must keep this much clear air around the plate so builds never fight set dressing. */
export const PLATE_CLEARANCE = 1.2

/** Classic light-bluish-grey baseplate — cool enough to hold the warm lamp pool. */
export const EXPLORE_PLATE_COLOR = '#b8c1bc'

/** Room shell — the bedroom the table stands in. */
export const ROOM = {
  floorY: -56,
  ceilingY: 129,
  backWallZ: -DESK_HALF_Z - 4,
  leftWallX: -DESK_HALF_X - 4,
  farWallZ: 196,
  rightWallX: 206,
} as const

export const WINDOW = {
  x: ROOM.leftWallX + 0.6,
  centerY: 58,
  centerZ: 12,
  halfHeight: 34,
  halfWidth: 30,
} as const

/**
 * The desk lamp is the key light. These are world-space points: the lamp mesh,
 * the spot light, the light beam and the dust motes all read the same three
 * numbers so the beam always leaves the shade it is drawn under.
 */
export const LAMP_BASE = { x: -49, y: DESK_TOP_Y, z: -35 } as const
export const LAMP_ELBOW = { x: -38, y: 13, z: -28 } as const
/**
 * The head hangs low over the plate's back corner on purpose. The explore
 * camera's pitch is clamped to roughly 13° above the horizon, so a tall lamp
 * would be permanently out of frame; at this height the shade comes into view
 * from across the table and its beam crosses the scene from anywhere.
 */
export const LAMP_SHADE = { x: -21, y: 16.5, z: -14.5 } as const
export const LAMP_SHADE_RADIUS = 5.6
export const LAMP_TARGET = { x: 1, y: 0.4, z: 2 } as const

/** Book stack: four hardcovers, a climbable ruler leaning on the top one. */
export const BOOK_THICKNESS = 2.55
export const BOOK_COUNT = 4
export const BOOK_STACK_HEIGHT = BOOK_THICKNESS * BOOK_COUNT
export const BOOK_STACK_X = 45
export const BOOK_STACK_Z = -12
export const BOOK_STACK_ROTATION = 0.2443
export const BOOK_HALF_LENGTH = 13
export const BOOK_HALF_WIDTH = 9.5

export const RAMP_LENGTH = 25
export const RAMP_WIDTH = 2.6
export const RAMP_THICKNESS = 0.2

/**
 * The ruler leans from the table up to the top book. Its pitch is chosen so the
 * board is exactly long enough to span the stack height: the top face meets the
 * book top with no lip, and the bottom tip sinks half a thickness into the table
 * so there is no step at the foot either. Both ends are therefore seamless
 * without any collider fudging.
 */
export const RAMP_ANGLE = Math.asin(BOOK_STACK_HEIGHT / RAMP_LENGTH)

export function rulerRampPose() {
  const cos = Math.cos(RAMP_ANGLE)
  const sin = Math.sin(RAMP_ANGLE)
  const dirX = Math.sin(BOOK_STACK_ROTATION)
  const dirZ = Math.cos(BOOK_STACK_ROTATION)
  const topX = BOOK_STACK_X + BOOK_HALF_WIDTH * dirX
  const topZ = BOOK_STACK_Z + BOOK_HALF_WIDTH * dirZ
  const run = RAMP_LENGTH * cos
  const topY = BOOK_STACK_HEIGHT - (RAMP_THICKNESS / 2) * cos
  const bottomY = topY - RAMP_LENGTH * sin
  return {
    x: topX + (run / 2) * dirX,
    z: topZ + (run / 2) * dirZ,
    /** Height above DESK_TOP_Y of the board's centre. */
    y: (topY + bottomY) / 2,
    rotation: BOOK_STACK_ROTATION,
    pitch: RAMP_ANGLE,
    halfLength: RAMP_LENGTH / 2,
  }
}

export type ToyPropKind =
  | 'lamp'
  | 'cord'
  | 'book'
  | 'ruler-ramp'
  | 'mug'
  | 'coffee-ring'
  | 'pencil'
  | 'giant-brick'
  | 'eraser'
  | 'crayon'
  | 'paintbrush'
  | 'alphabet-block'
  | 'marble'
  | 'die'
  | 'sticky-note'
  | 'ball'

export type ToyProp = {
  id: string
  kind: ToyPropKind
  /** Table-plane centre. */
  x: number
  z: number
  /** Yaw, radians. */
  rotation: number
  /** Local half extents on the table plane, before yaw. */
  half: readonly [number, number]
  /** Props in the same group are allowed to touch (a stack, a lamp and its cord). */
  group?: string
  color?: string
  /** Height above DESK_TOP_Y for stacked pieces. */
  lift?: number
  scale?: number
  variant?: string
}

const ramp = rulerRampPose()

export const TOY_PROPS: readonly ToyProp[] = [
  { id: 'lamp', kind: 'lamp', x: LAMP_BASE.x, z: LAMP_BASE.z, rotation: 0, half: [7.5, 7.5], group: 'lamp' },
  { id: 'cord', kind: 'cord', x: -55, z: -41, rotation: 0, half: [7, 7], group: 'lamp' },

  { id: 'book-0', kind: 'book', x: 45.6, z: -12.9, rotation: 0.052, half: [BOOK_HALF_LENGTH, BOOK_HALF_WIDTH], group: 'books', lift: 0, color: '#8f3730' },
  { id: 'book-1', kind: 'book', x: 44.3, z: -11.2, rotation: 0.331, half: [12.4, 9], group: 'books', lift: BOOK_THICKNESS, color: '#20554f' },
  { id: 'book-2', kind: 'book', x: 45.4, z: -12.4, rotation: 0.14, half: [11.8, 8.6], group: 'books', lift: BOOK_THICKNESS * 2, color: '#c68a24' },
  { id: 'book-3', kind: 'book', x: BOOK_STACK_X, z: BOOK_STACK_Z, rotation: BOOK_STACK_ROTATION, half: [BOOK_HALF_LENGTH, BOOK_HALF_WIDTH], group: 'books', lift: BOOK_THICKNESS * 3, color: '#2f4f7a' },
  { id: 'ruler-ramp', kind: 'ruler-ramp', x: ramp.x, z: ramp.z, rotation: ramp.rotation, half: [RAMP_WIDTH / 2, RAMP_LENGTH / 2], group: 'books' },

  { id: 'mug', kind: 'mug', x: 33, z: 33, rotation: -0.44, half: [5.7, 4.3], group: 'coffee' },
  { id: 'coffee-ring', kind: 'coffee-ring', x: 24.5, z: 41, rotation: 0, half: [5.2, 5.2], group: 'coffee' },

  { id: 'pencil', kind: 'pencil', x: -30, z: 40, rotation: 0.14, half: [13.2, 0.7] },

  { id: 'giant-brick-red', kind: 'giant-brick', x: 56, z: 34, rotation: 0.7, half: [3.72, 7.44], color: '#d8402f', scale: 6, variant: 'brick_2x4' },
  { id: 'giant-brick-blue', kind: 'giant-brick', x: -54, z: -8, rotation: 1.31, half: [3.72, 7.44], color: '#2172c4', scale: 6, variant: 'brick_2x4' },
  { id: 'giant-brick-yellow', kind: 'giant-brick', x: 18, z: -40, rotation: 0.35, half: [2.48, 2.48], color: '#f2b01e', scale: 4, variant: 'brick_2x2' },
  { id: 'giant-brick-green', kind: 'giant-brick', x: -6, z: 44, rotation: -0.52, half: [3.1, 3.1], color: '#3f9d4a', scale: 5, variant: 'brick_2x2' },
  { id: 'giant-brick-orange', kind: 'giant-brick', x: 50, z: -38, rotation: 0.96, half: [3.72, 7.44], color: '#ec7726', scale: 6, variant: 'brick_2x4' },

  { id: 'eraser', kind: 'eraser', x: 14, z: 36, rotation: 0.44, half: [3, 1.5] },
  { id: 'crayon-a', kind: 'crayon', x: -40, z: -12, rotation: 1.75, half: [5.5, 0.55], color: '#e0483f' },
  { id: 'crayon-b', kind: 'crayon', x: -38, z: 8, rotation: 1.19, half: [5.5, 0.55], color: '#3f7fd0' },
  { id: 'crayon-c', kind: 'crayon', x: -34, z: -26, rotation: 0.26, half: [5.5, 0.55], color: '#57ab4d' },
  { id: 'paintbrush', kind: 'paintbrush', x: -58, z: 13, rotation: 1.54, half: [10, 1.2] },

  { id: 'block-a', kind: 'alphabet-block', x: 34, z: 46, rotation: 0.31, half: [1.8, 1.8], variant: 'A' },
  { id: 'block-b', kind: 'alphabet-block', x: 39.6, z: 43.6, rotation: -0.21, half: [1.8, 1.8], variant: 'B' },

  { id: 'marble', kind: 'marble', x: -10, z: -42, rotation: 0, half: [1.3, 1.3] },
  { id: 'die-a', kind: 'die', x: -23, z: 33, rotation: 0.38, half: [1.1, 1.1] },
  { id: 'die-b', kind: 'die', x: -18.6, z: 33.2, rotation: -0.7, half: [1.1, 1.1] },
  { id: 'sticky-note', kind: 'sticky-note', x: 30, z: -42, rotation: -0.14, half: [4.2, 4.2] },
  { id: 'ball', kind: 'ball', x: 61, z: 46, rotation: 0, half: [2.6, 2.6] },
]

export type Extent = { minX: number; maxX: number; minZ: number; maxZ: number }

/** Axis-aligned footprint of a yawed prop. */
export function propExtent(prop: ToyProp): Extent {
  const cos = Math.abs(Math.cos(prop.rotation))
  const sin = Math.abs(Math.sin(prop.rotation))
  const ex = prop.half[0] * cos + prop.half[1] * sin
  const ez = prop.half[0] * sin + prop.half[1] * cos
  return { minX: prop.x - ex, maxX: prop.x + ex, minZ: prop.z - ez, maxZ: prop.z + ez }
}

export function extentsOverlap(a: Extent, b: Extent, tolerance = 0) {
  return (
    a.minX < b.maxX - tolerance
    && b.minX < a.maxX - tolerance
    && a.minZ < b.maxZ - tolerance
    && b.minZ < a.maxZ - tolerance
  )
}

export function plateExtent(clearance = PLATE_CLEARANCE): Extent {
  const half = PLATE_HALF + clearance
  return { minX: -half, maxX: half, minZ: -half, maxZ: half }
}

/** Shortest gap on the table plane between a prop's footprint and the plate edge. */
export function plateGap(prop: ToyProp) {
  const extent = propExtent(prop)
  const gapX = Math.max(0, -PLATE_HALF - extent.maxX, extent.minX - PLATE_HALF)
  const gapZ = Math.max(0, -PLATE_HALF - extent.maxZ, extent.minZ - PLATE_HALF)
  return Math.hypot(gapX, gapZ)
}

export type ToyRoomFeatures = {
  /** Shadow map edge for the warm key light. */
  shadowMapSize: number
  dustCount: number
  animateDust: boolean
  /** Additive cone under the lamp shade — the visible beam. */
  lightBeam: boolean
  contactShadowResolution: number
  /**
   * Live on desktop; on a phone (where the Canvas turns shadow maps off entirely)
   * the same pass is baked over a handful of frames and then frozen, which is the
   * only grounding the props get and costs nothing after the first moment.
   */
  contactShadowFrames: number
  /** Clearcoat plastic on bricks, satin varnish on the table. */
  clearcoat: boolean
  woodTextureSize: number
  /** Radial segments for lathed / round props. */
  roundSegments: number
  distantFurniture: boolean
  /** Slow sway on the window light and the hanging cord. */
  ambientMotion: boolean
}

/**
 * The perf ladder. A phone still gets the table, the room, the lamp and every
 * prop — it loses the render-target extras (contact shadows, the additive beam),
 * halves the dust, and drops to standard materials at lower tessellation.
 */
export function toyRoomFeatures(compactRenderer: boolean, reducedMotion: boolean): ToyRoomFeatures {
  return {
    shadowMapSize: compactRenderer ? 512 : 2048,
    dustCount: compactRenderer ? 48 : 170,
    animateDust: !reducedMotion,
    lightBeam: !compactRenderer,
    contactShadowResolution: compactRenderer ? 256 : 512,
    contactShadowFrames: compactRenderer ? 4 : Infinity,
    clearcoat: !compactRenderer,
    woodTextureSize: compactRenderer ? 256 : 512,
    roundSegments: compactRenderer ? 12 : 28,
    distantFurniture: true,
    ambientMotion: !reducedMotion,
  }
}
