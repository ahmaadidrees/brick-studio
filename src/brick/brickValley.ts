import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GRID_SIZE, PLATE_HEIGHT, STUD } from './parts'

/**
 * Brick Valley — the explore-mode diorama the build plate sits inside.
 *
 * Everything in here obeys one rule: the world is made of oversized toy bricks.
 * Hills are terraced brick masses with studs, trees are stacked round bricks,
 * clouds are brick clusters, the ground is a field of giant plates. That single
 * vocabulary is what lets a handful of primitive builders cover an entire
 * landscape without it reading as an assortment of unrelated props.
 *
 * The module is deliberately free of React and WebGL so the layout rules
 * (nothing overlaps the plate, ground sits exactly one plate-height below it,
 * the perf ladder actually removes work) are unit-testable.
 */

export type ValleyQuality = 'full' | 'compact'

/** Draw-order/material band. Also drives how far the palette hazes out. */
export type ValleyBand = 'near' | 'mid' | 'far'

export const PLATE_WORLD_SIZE = GRID_SIZE * STUD
/** The visible plate mesh overhangs the grid by 0.35 total (see Baseplate). */
export const PLATE_HALF_EXTENT = PLATE_WORLD_SIZE / 2 + 0.175

/**
 * The plate's underside. Putting the world floor exactly here means stepping off
 * the plate is a 0.18 drop and stepping back on is a 0.18 rise — inside the
 * character controller's 0.22 autostep, so a kid never gets stranded.
 */
export const VALLEY_GROUND_Y = -PLATE_HEIGHT
export const VALLEY_GROUND_COLLIDER_HALF_EXTENT = 170
export const VALLEY_GROUND_COLLIDER_THICKNESS = 4
/** Centre of the floor slab: its top face has to land exactly on the floor. */
export const VALLEY_GROUND_COLLIDER_CENTRE_Y = VALLEY_GROUND_Y - VALLEY_GROUND_COLLIDER_THICKNESS

export const VALLEY_FOG_NEAR = 70
export const VALLEY_FOG_FAR = 300
/**
 * The build camera keeps far at 240; the valley needs the horizon ridge and the
 * ground sheet inside the frustum. Applied only while explore is mounted.
 */
export const VALLEY_CAMERA_FAR = 620
export const VALLEY_SKY_RADIUS = 430

export const VALLEY_HORIZON_COLOR = '#dbeef8'
export const VALLEY_SKY_MID_COLOR = '#63bdec'
export const VALLEY_SKY_ZENITH_COLOR = '#1d7ad2'
export const VALLEY_SUN_COLOR = '#fff2cf'
/** Key light / sun disc direction, shared by the rig and the sky shader. */
export const VALLEY_SUN_DIRECTION: readonly [number, number, number] = [0.52, 0.66, 0.44]

/** Beyond this the palette is fully melted into the horizon colour. */
const HAZE_START = 40
const HAZE_END = 240
const HAZE_MAX = 0.86

/** Real bricks: stud radius and height as a fraction of the stud pitch. */
const STUD_RADIUS_RATIO = 0.235
const STUD_HEIGHT_RATIO = 0.161

/** Riser must stay under the controller's 0.22 autostep or the stair is a wall. */
export const VALLEY_STAIR_RISER = 0.2
const VALLEY_STAIR_TREAD = 1.25
const VALLEY_STAIR_WIDTH = 4.2

export function createValleyRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** XZ distance from a point to the plate's rectangle; 0 when the point is over it. */
export function distanceToPlate(x: number, z: number) {
  const dx = Math.max(Math.abs(x) - PLATE_HALF_EXTENT, 0)
  const dz = Math.max(Math.abs(z) - PLATE_HALF_EXTENT, 0)
  return Math.hypot(dx, dz)
}

/** How far a colour has melted into the horizon at this distance from the plate. */
export function hazeFactor(distance: number) {
  const t = (distance - HAZE_START) / (HAZE_END - HAZE_START)
  return THREE.MathUtils.clamp(t, 0, 1) * HAZE_MAX
}

const horizonColor = new THREE.Color(VALLEY_HORIZON_COLOR)
const scratchColor = new THREE.Color()

/** Saturated up close, pastel at the ridge — the cue that reads as landscape. */
export function hazedColor(hex: string, distance: number, target = new THREE.Color()) {
  target.set(hex)
  return target.lerp(horizonColor, hazeFactor(distance))
}

export function bandForDistance(distance: number): ValleyBand {
  if (distance < 46) return 'near'
  if (distance < 120) return 'mid'
  return 'far'
}

// ---------------------------------------------------------------------------
// Brick primitives
// ---------------------------------------------------------------------------

function mergeParts(parts: THREE.BufferGeometry[]) {
  if (parts.length === 1) return parts[0]
  const merged = mergeGeometries(parts, false)
  if (!merged) throw new Error('Could not merge brick valley geometry')
  return merged
}

function studGeometry(radius: number, height: number, segments: number) {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments)
  geometry.translate(0, height / 2, 0)
  return geometry
}

/**
 * A rectangular brick with its base at y = 0 and studs laid out on the top face.
 * `studPitch` is the world size of one stud cell — pass the giant pitch and the
 * same builder produces a mountain terrace or a cloud puff.
 */
export function createBrickSlab(options: {
  width: number
  depth: number
  height: number
  studPitch?: number
  studSegments?: number
}) {
  const { width, depth, height, studPitch = 0, studSegments = 8 } = options
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.BoxGeometry(width, height, depth)
  body.translate(0, height / 2, 0)
  parts.push(body)

  if (studPitch > 0) {
    const cols = Math.max(1, Math.round(width / studPitch))
    const rows = Math.max(1, Math.round(depth / studPitch))
    const stepX = width / cols
    const stepZ = depth / rows
    const pitch = Math.min(stepX, stepZ)
    const radius = pitch * STUD_RADIUS_RATIO
    const studHeight = pitch * STUD_HEIGHT_RATIO
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const stud = studGeometry(radius, studHeight, studSegments)
        stud.translate((col + 0.5) * stepX - width / 2, height, (row + 0.5) * stepZ - depth / 2)
        parts.push(stud)
      }
    }
  }

  return mergeParts(parts)
}

/** A round brick (base at y = 0) with an optional ring of studs on its top face. */
export function createRoundBrick(options: {
  radius: number
  height: number
  segments?: number
  studs?: number
  studSegments?: number
}) {
  const { radius, height, segments = 14, studs = 0, studSegments = 8 } = options
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.CylinderGeometry(radius, radius, height, segments)
  body.translate(0, height / 2, 0)
  parts.push(body)

  if (studs > 0) {
    const studRadius = radius * (studs > 1 ? 0.17 : STUD_RADIUS_RATIO)
    const studHeight = studRadius * 0.69
    parts.push(studGeometry(studRadius, studHeight, studSegments).translate(0, height, 0))
    for (let index = 1; index < studs; index += 1) {
      const angle = ((index - 1) / (studs - 1)) * Math.PI * 2
      const ring = studGeometry(studRadius, studHeight, studSegments)
      ring.translate(Math.cos(angle) * radius * 0.55, height, Math.sin(angle) * radius * 0.55)
      parts.push(ring)
    }
  }

  return mergeParts(parts)
}

/** Studs sprinkled on the exposed shoulder between two stacked canopy discs. */
function annulusStuds(options: {
  radius: number
  y: number
  count: number
  studRadius: number
  studSegments: number
}) {
  const { radius, y, count, studRadius, studSegments } = options
  const parts: THREE.BufferGeometry[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
    const stud = studGeometry(studRadius, studRadius * 0.69, studSegments)
    stud.translate(Math.cos(angle) * radius, y, Math.sin(angle) * radius)
    parts.push(stud)
  }
  return parts
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type ValleyHill = {
  kind: 'hill'
  x: number
  z: number
  yaw: number
  width: number
  depth: number
  tiers: number
  tierHeight: number
  inset: number
  studPitch: number
  baseColor: string
  capColor: string
  stairs: boolean
  collides: boolean
  footprintRadius: number
  band: ValleyBand
}

export type ValleyTree = {
  kind: 'tree'
  x: number
  z: number
  yaw: number
  scale: number
  trunkColor: string
  canopyColor: string
  footprintRadius: number
  band: ValleyBand
}

export type ValleyBlock = {
  kind: 'block'
  x: number
  z: number
  yaw: number
  width: number
  depth: number
  height: number
  color: string
  footprintRadius: number
  band: ValleyBand
}

export type ValleyTuft = {
  kind: 'tuft'
  x: number
  z: number
  yaw: number
  scale: number
  flower: boolean
  stemColor: string
  headColor: string
  footprintRadius: number
  band: ValleyBand
}

export type ValleyPondRim = {
  kind: 'pondRim'
  x: number
  z: number
  yaw: number
  width: number
  depth: number
  height: number
  color: string
  footprintRadius: number
  band: ValleyBand
}

export type ValleyProp = ValleyHill | ValleyTree | ValleyBlock | ValleyTuft | ValleyPondRim

export type ValleyWaterTile = {
  x: number
  z: number
  size: number
}

export type ValleyCloudBrick = {
  dx: number
  dy: number
  dz: number
  width: number
  height: number
  depth: number
}

export type ValleyCloud = {
  x: number
  y: number
  z: number
  drift: number
  phase: number
  bricks: ValleyCloudBrick[]
}

export type ValleyLayout = {
  props: ValleyProp[]
  water: ValleyWaterTile[]
  clouds: ValleyCloud[]
  quality: ValleyQuality
}

/** Polar helper: theta 0 looks down -z, which is the valley's open end. */
function polar(theta: number, radius: number) {
  return { x: Math.sin(theta) * radius, z: -Math.cos(theta) * radius }
}

/** Yaw that turns a prop's local +z toward the plate. */
function facingPlate(x: number, z: number) {
  return Math.atan2(-x, -z)
}

const HILL_ANCHORS = [
  { theta: 0.86, radius: 37, width: 26, depth: 22, tiers: 2, tierHeight: 1.2, stairs: true },
  { theta: -1.12, radius: 45, width: 31, depth: 25, tiers: 4, tierHeight: 1.35, stairs: false },
  { theta: -0.55, radius: 63, width: 30, depth: 26, tiers: 3, tierHeight: 1.5, stairs: false },
  { theta: 2.15, radius: 54, width: 35, depth: 28, tiers: 3, tierHeight: 1.7, stairs: false },
  { theta: -2.45, radius: 71, width: 44, depth: 34, tiers: 4, tierHeight: 1.95, stairs: false },
  { theta: 1.6, radius: 83, width: 48, depth: 38, tiers: 5, tierHeight: 2.1, stairs: false },
  { theta: 0.3, radius: 99, width: 40, depth: 32, tiers: 4, tierHeight: 2.3, stairs: false },
] as const

const MASSIF_ANCHORS = [
  { theta: -2.15, radius: 168, width: 96, depth: 62, tiers: 5, tierHeight: 7.5 },
  { theta: -1.45, radius: 196, width: 118, depth: 70, tiers: 6, tierHeight: 8.4 },
  { theta: -0.72, radius: 158, width: 84, depth: 56, tiers: 4, tierHeight: 7 },
  { theta: 0.62, radius: 176, width: 92, depth: 60, tiers: 5, tierHeight: 7.8 },
  { theta: 1.38, radius: 152, width: 78, depth: 54, tiers: 4, tierHeight: 6.6 },
  { theta: 2.28, radius: 188, width: 110, depth: 68, tiers: 6, tierHeight: 8.8 },
  { theta: 3.02, radius: 164, width: 88, depth: 58, tiers: 5, tierHeight: 7.4 },
  // Sits in the valley's open end, deep enough that fog leaves only a pale silhouette.
  { theta: 0.02, radius: 250, width: 150, depth: 80, tiers: 4, tierHeight: 6 },
] as const

const GROVE_ANCHORS = [
  { theta: -0.62, radius: 32, count: 4, spread: 7 },
  { theta: -1.9, radius: 35, count: 3, spread: 8 },
  { theta: 2.62, radius: 47, count: 3, spread: 9 },
  { theta: 1.92, radius: 67, count: 3, spread: 10 },
] as const

const SINGLE_TREE_ANCHORS = [
  { theta: 0.18, radius: 29 },
  { theta: 1.15, radius: 31 },
  { theta: -2.9, radius: 40 },
  { theta: 2.95, radius: 59 },
  { theta: 0.95, radius: 88 },
] as const

/**
 * Three loose giant bricks off the plate's south edge, sized 0.6 / 1.05 / 1.6 so
 * they chain into a hop-up: the jump apex is ~0.86, so the first is a jump, the
 * rest are steps.
 */
const BLOCK_ANCHORS = [
  { x: -3.2, z: 24.6, width: 5, depth: 2.6, height: 0.6, yaw: 0.12, color: '#e0483c' },
  { x: 2.1, z: 26.4, width: 3.8, depth: 2.4, height: 1.05, yaw: -0.35, color: '#f2b632' },
  { x: 6.6, z: 24.2, width: 3, depth: 3, height: 1.6, yaw: 0.5, color: '#2f7fd0' },
] as const

const HILL_BASE_COLORS = ['#6a9d3f', '#77a94a', '#5f9439', '#7fae52'] as const
const HILL_CAP_COLORS = ['#8fca57', '#9ad463', '#84c34e', '#a3db6e'] as const
const MASSIF_BASE_COLORS = ['#6f9fa8', '#79a6b4', '#68979f'] as const
const MASSIF_CAP_COLORS = ['#a9d4dc', '#b6dde3', '#9ecad4'] as const
const TRUNK_COLORS = ['#8a5a33', '#7d5130', '#96643a'] as const
const CANOPY_COLORS = ['#3f9f3a', '#4bb043', '#358c33', '#57bd4d'] as const
const PETAL_COLORS = ['#ef476f', '#ffd166', '#f78c6b', '#cf6fd1', '#ff8fab'] as const
const GRASS_COLORS = ['#5fae3c', '#6cbc47', '#559f36'] as const

const POND = { theta: -2.35, radius: 64, radiusX: 22, radiusZ: 15, tile: 6.4 } as const

function hillProp(
  anchor: { theta: number; radius: number; width: number; depth: number; tiers: number; tierHeight: number; stairs: boolean },
  index: number,
): ValleyHill {
  const { x, z } = polar(anchor.theta, anchor.radius)
  const distance = Math.hypot(x, z)
  return {
    kind: 'hill',
    x,
    z,
    yaw: facingPlate(x, z),
    width: anchor.width,
    depth: anchor.depth,
    tiers: anchor.tiers,
    tierHeight: anchor.tierHeight,
    inset: 0.17,
    studPitch: Math.max(2.4, anchor.width / 6),
    baseColor: HILL_BASE_COLORS[index % HILL_BASE_COLORS.length],
    capColor: HILL_CAP_COLORS[index % HILL_CAP_COLORS.length],
    stairs: anchor.stairs,
    collides: true,
    footprintRadius: Math.hypot(anchor.width, anchor.depth) / 2,
    band: bandForDistance(distance),
  }
}

function massifProp(
  anchor: { theta: number; radius: number; width: number; depth: number; tiers: number; tierHeight: number },
  index: number,
): ValleyHill {
  const { x, z } = polar(anchor.theta, anchor.radius)
  const distance = Math.hypot(x, z)
  return {
    kind: 'hill',
    x,
    z,
    yaw: facingPlate(x, z),
    width: anchor.width,
    depth: anchor.depth,
    tiers: anchor.tiers,
    tierHeight: anchor.tierHeight,
    inset: 0.13,
    studPitch: anchor.width / 5,
    baseColor: MASSIF_BASE_COLORS[index % MASSIF_BASE_COLORS.length],
    capColor: MASSIF_CAP_COLORS[index % MASSIF_CAP_COLORS.length],
    stairs: false,
    // Far enough that a kid meets fog long before the collider; skipping them
    // keeps the physics world to the props you can actually reach.
    collides: false,
    footprintRadius: Math.hypot(anchor.width, anchor.depth) / 2,
    band: bandForDistance(distance),
  }
}

function treeProp(x: number, z: number, rng: () => number): ValleyTree {
  const distance = Math.hypot(x, z)
  const scale = 0.78 + rng() * 0.62
  return {
    kind: 'tree',
    x,
    z,
    yaw: rng() * Math.PI * 2,
    scale,
    trunkColor: TRUNK_COLORS[Math.floor(rng() * TRUNK_COLORS.length)],
    canopyColor: CANOPY_COLORS[Math.floor(rng() * CANOPY_COLORS.length)],
    footprintRadius: 3 * scale,
    band: bandForDistance(distance),
  }
}

/** Tufts hug the plate's rectangle, not a circle, so the corners stay planted too. */
function plateEdgePoint(t: number, offset: number) {
  const half = PLATE_HALF_EXTENT + offset
  const side = Math.floor(t * 4) % 4
  const local = t * 4 - Math.floor(t * 4)
  const travel = (local * 2 - 1) * half
  if (side === 0) return { x: travel, z: -half }
  if (side === 1) return { x: half, z: travel }
  if (side === 2) return { x: -travel, z: half }
  return { x: -half, z: -travel }
}

export type ValleyFootprint = {
  cx: number
  cz: number
  halfWidth: number
  halfDepth: number
  yaw: number
}

/** How far the lookout hill's stair ramp reaches out from the hill's centre. */
export function stairReach(hill: ValleyHill) {
  const steps = valleyStairSteps(hill)
  const last = steps[steps.length - 1]
  return last.z + VALLEY_STAIR_TREAD / 2
}

/**
 * The prop's oriented footprint. Hills are asymmetric when they carry a stair,
 * so this is not just width × depth around the anchor.
 */
export function propFootprint(prop: ValleyProp): ValleyFootprint {
  if (prop.kind === 'hill') {
    const back = prop.depth / 2
    const front = prop.stairs ? stairReach(prop) : prop.depth / 2
    const offset = (front - back) / 2
    return {
      cx: prop.x + Math.sin(prop.yaw) * offset,
      cz: prop.z + Math.cos(prop.yaw) * offset,
      halfWidth: prop.width / 2,
      halfDepth: (front + back) / 2,
      yaw: prop.yaw,
    }
  }
  if (prop.kind === 'block' || prop.kind === 'pondRim') {
    return { cx: prop.x, cz: prop.z, halfWidth: prop.width / 2, halfDepth: prop.depth / 2, yaw: prop.yaw }
  }
  return {
    cx: prop.x,
    cz: prop.z,
    halfWidth: prop.footprintRadius,
    halfDepth: prop.footprintRadius,
    yaw: 0,
  }
}

/**
 * Separating-axis test against the plate square. Nothing may grow through the
 * build plate — a tree sprouting out of a kid's model is the fastest way to
 * break the illusion that the plate belongs to the valley.
 */
export function footprintOverlapsPlate(prop: ValleyProp, margin: number) {
  const footprint = propFootprint(prop)
  const half = PLATE_HALF_EXTENT + margin
  const cos = Math.cos(footprint.yaw)
  const sin = Math.sin(footprint.yaw)
  const localX: [number, number] = [cos, -sin]
  const localZ: [number, number] = [sin, cos]
  const axes: [number, number][] = [[1, 0], [0, 1], localX, localZ]
  for (const axis of axes) {
    const plateRadius = half * (Math.abs(axis[0]) + Math.abs(axis[1]))
    const propRadius =
      footprint.halfWidth * Math.abs(axis[0] * localX[0] + axis[1] * localX[1])
      + footprint.halfDepth * Math.abs(axis[0] * localZ[0] + axis[1] * localZ[1])
    const centre = Math.abs(footprint.cx * axis[0] + footprint.cz * axis[1])
    if (centre > plateRadius + propRadius) return false
  }
  return true
}

/**
 * Slide a prop straight out along its own bearing until it clears the plate.
 * Radial pushes keep the authored composition intact — the bearing is what was
 * designed, the exact radius is not.
 */
function clearOfPlate<T extends ValleyProp>(prop: T, margin: number): T {
  let guard = 0
  while (footprintOverlapsPlate(prop, margin) && guard < 400) {
    const radius = Math.hypot(prop.x, prop.z)
    const scale = radius < 1 ? 1 : (radius + 1.5) / radius
    if (radius < 1) prop.z -= 1.5
    else {
      prop.x *= scale
      prop.z *= scale
    }
    guard += 1
  }
  prop.band = bandForDistance(Math.hypot(prop.x, prop.z))
  return prop
}

export function createValleyLayout(options: { quality: ValleyQuality; seed?: number }): ValleyLayout {
  const { quality, seed = 20260725 } = options
  const compact = quality === 'compact'
  const rng = createValleyRng(seed)
  const props: ValleyProp[] = []

  const hills: ValleyHill[] = []
  for (const [index, anchor] of HILL_ANCHORS.entries()) {
    if (compact && index % 3 === 2) continue
    hills.push(clearOfPlate(hillProp(anchor, index), 1.2))
  }
  props.push(...hills)

  for (const [index, anchor] of MASSIF_ANCHORS.entries()) {
    if (compact && index % 4 === 3) continue
    props.push(clearOfPlate(massifProp(anchor, index), 1.2))
  }

  /** Keeps a grove from sprouting through the side of a hill. */
  const insideHill = (x: number, z: number, radius: number) =>
    hills.some((hill) => Math.hypot(hill.x - x, hill.z - z) < hill.footprintRadius + radius)

  for (const grove of GROVE_ANCHORS) {
    const centre = polar(grove.theta, grove.radius)
    const count = compact ? Math.max(1, grove.count - 2) : grove.count
    for (let index = 0; index < count; index += 1) {
      const x = centre.x + (rng() * 2 - 1) * grove.spread
      const z = centre.z + (rng() * 2 - 1) * grove.spread
      const tree = clearOfPlate(treeProp(x, z, rng), 1.2)
      if (insideHill(tree.x, tree.z, tree.footprintRadius)) continue
      props.push(tree)
    }
  }

  for (const [index, anchor] of SINGLE_TREE_ANCHORS.entries()) {
    if (compact && index % 2 === 1) continue
    const { x, z } = polar(anchor.theta, anchor.radius)
    const tree = clearOfPlate(treeProp(x, z, rng), 1.2)
    if (insideHill(tree.x, tree.z, tree.footprintRadius)) continue
    props.push(tree)
  }

  for (const anchor of BLOCK_ANCHORS) {
    props.push(clearOfPlate({
      kind: 'block',
      x: anchor.x,
      z: anchor.z,
      yaw: anchor.yaw,
      width: anchor.width,
      depth: anchor.depth,
      height: anchor.height,
      color: anchor.color,
      footprintRadius: Math.hypot(anchor.width, anchor.depth) / 2,
      band: 'near',
    }, 0.6))
  }

  // Brick pond: a rim course of tan bricks with translucent water plates inside.
  // Each brick spans the chord to the next one (plus an overlap) so the rim reads
  // as a laid course rather than as planks dropped around a puddle — an ellipse
  // sampled at even angles has very uneven arc spacing.
  const pondCentre = polar(POND.theta, POND.radius)
  const rimSteps = compact ? 12 : 20
  for (let index = 0; index < rimSteps; index += 1) {
    const angle = (index / rimSteps) * Math.PI * 2
    const next = ((index + 1) / rimSteps) * Math.PI * 2
    const from = {
      x: pondCentre.x + Math.cos(angle) * (POND.radiusX + 2.4),
      z: pondCentre.z + Math.sin(angle) * (POND.radiusZ + 2.4),
    }
    const to = {
      x: pondCentre.x + Math.cos(next) * (POND.radiusX + 2.4),
      z: pondCentre.z + Math.sin(next) * (POND.radiusZ + 2.4),
    }
    const dx = to.x - from.x
    const dz = to.z - from.z
    const width = Math.hypot(dx, dz) + 2.2
    const x = (from.x + to.x) / 2
    const z = (from.z + to.z) / 2
    props.push(clearOfPlate({
      kind: 'pondRim',
      x,
      z,
      yaw: Math.atan2(-dz, dx),
      width,
      depth: 3.4,
      height: index % 2 === 0 ? 0.58 : 0.76,
      color: index % 2 === 0 ? '#d9c089' : '#cbb07c',
      footprintRadius: Math.hypot(width, 3.4) / 2,
      band: bandForDistance(Math.hypot(x, z)),
    }, 0.6))
  }

  const water: ValleyWaterTile[] = []
  const cols = Math.ceil((POND.radiusX * 2) / POND.tile)
  const rows = Math.ceil((POND.radiusZ * 2) / POND.tile)
  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row < rows; row += 1) {
      const x = (col + 0.5 - cols / 2) * POND.tile
      const z = (row + 0.5 - rows / 2) * POND.tile
      if ((x / POND.radiusX) ** 2 + (z / POND.radiusZ) ** 2 > 1) continue
      water.push({ x: pondCentre.x + x, z: pondCentre.z + z, size: POND.tile - 0.22 })
    }
  }

  if (!compact) {
    const tuftCount = 34
    for (let index = 0; index < tuftCount; index += 1) {
      const point = plateEdgePoint((index + 0.5) / tuftCount, 0.9 + rng() * 3.4)
      props.push(clearOfPlate({
        kind: 'tuft',
        x: point.x,
        z: point.z,
        yaw: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.7,
        flower: index % 3 === 0,
        stemColor: GRASS_COLORS[Math.floor(rng() * GRASS_COLORS.length)],
        headColor: PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)],
        footprintRadius: 0.6,
        band: 'near',
      }, 0.05))
    }
    // A looser scatter out into the meadow so the ring around the plate does not
    // read as a planted border. Still measured off the plate's rectangle, not a
    // circle, or the corners would get a lawn growing over them.
    for (let index = 0; index < 22; index += 1) {
      const point = plateEdgePoint(rng(), 4 + rng() * 24)
      props.push(clearOfPlate({
        kind: 'tuft',
        x: point.x,
        z: point.z,
        yaw: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.8,
        flower: index % 4 === 0,
        stemColor: GRASS_COLORS[Math.floor(rng() * GRASS_COLORS.length)],
        headColor: PETAL_COLORS[Math.floor(rng() * PETAL_COLORS.length)],
        footprintRadius: 0.7,
        band: 'near',
      }, 0.05))
    }
  }

  const cloudCount = compact ? 4 : 8
  const clouds: ValleyCloud[] = []
  for (let index = 0; index < cloudCount; index += 1) {
    const theta = (index / cloudCount) * Math.PI * 2 + rng() * 0.5
    const radius = 45 + rng() * 105
    const { x, z } = polar(theta, radius)
    const brickCount = compact ? 3 : 3 + Math.floor(rng() * 3)
    const bricks: ValleyCloudBrick[] = []
    let cursor = 0
    for (let brick = 0; brick < brickCount; brick += 1) {
      const width = 7 + rng() * 7
      const depth = 5 + rng() * 4
      const height = 2.2 + rng() * 1.6
      bricks.push({
        dx: cursor,
        dy: brick === 0 ? 0 : (rng() - 0.35) * 1.8,
        dz: (rng() - 0.5) * 3.2,
        width,
        height,
        depth,
      })
      cursor += width * (0.5 + rng() * 0.25)
    }
    const span = cursor / 2
    for (const brick of bricks) brick.dx -= span
    clouds.push({
      x,
      y: 24 + rng() * 20,
      z,
      drift: 0.35 + rng() * 0.5,
      phase: rng() * Math.PI * 2,
      bricks,
    })
  }

  return { props, water, clouds, quality }
}

// ---------------------------------------------------------------------------
// Geometry assembly
// ---------------------------------------------------------------------------

/**
 * `aWind` marks the vertices the wind shader is allowed to nudge. It has to
 * exist on every geometry that shares the material, so it is written here for
 * solid parts too (as 0) — mergeGeometries refuses mismatched attribute sets.
 */
function paint(geometry: THREE.BufferGeometry, color: THREE.Color, wind = 0) {
  const count = geometry.attributes.position.count
  const colors = new Float32Array(count * 3)
  const winds = new Float32Array(count)
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = color.r
    colors[index * 3 + 1] = color.g
    colors[index * 3 + 2] = color.b
    winds[index] = wind
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aWind', new THREE.BufferAttribute(winds, 1))
  return geometry
}

function place(geometry: THREE.BufferGeometry, x: number, y: number, z: number, yaw: number) {
  if (yaw !== 0) geometry.rotateY(yaw)
  geometry.translate(x, y, z)
  return geometry
}

type BandBuckets = Record<ValleyBand, THREE.BufferGeometry[]>

function pushHill(buckets: BandBuckets, hill: ValleyHill, quality: ValleyQuality) {
  const segments = quality === 'compact' ? 6 : 8
  const distance = Math.hypot(hill.x, hill.z)
  for (let tier = 0; tier < hill.tiers; tier += 1) {
    const shrink = 1 - hill.inset * tier
    const width = hill.width * shrink
    const depth = hill.depth * shrink
    const top = tier === hill.tiers - 1
    const slab = createBrickSlab({
      width,
      depth,
      height: hill.tierHeight,
      // Only the exposed shoulders need studs; the buried faces never show.
      studPitch: hill.studPitch * shrink,
      studSegments: segments,
    })
    const mix = hill.tiers === 1 ? 1 : tier / (hill.tiers - 1)
    const colour = scratchColor.set(hill.baseColor).lerp(new THREE.Color(hill.capColor), top ? 1 : mix * 0.75)
    paint(slab, hazedColor(`#${colour.getHexString()}`, distance))
    place(slab, hill.x, VALLEY_GROUND_Y + tier * hill.tierHeight, hill.z, hill.yaw)
    buckets[hill.band].push(slab)
  }

  if (!hill.stairs) return
  for (const step of valleyStairSteps(hill)) {
    const slab = createBrickSlab({
      width: VALLEY_STAIR_WIDTH,
      depth: VALLEY_STAIR_TREAD,
      height: step.height,
      studPitch: VALLEY_STAIR_TREAD,
      studSegments: segments,
    })
    paint(slab, hazedColor('#d7dde0', distance))
    place(slab, 0, VALLEY_GROUND_Y, step.z, 0)
    slab.rotateY(hill.yaw)
    slab.translate(hill.x, 0, hill.z)
    buckets[hill.band].push(slab)
  }
}

/**
 * Steps for the lookout hill's ramp, in the hill's local frame (+z runs back
 * toward the plate). Every riser stays under the controller's autostep so the
 * climb needs no jumping.
 */
export function valleyStairSteps(hill: ValleyHill) {
  const total = hill.tiers * hill.tierHeight
  const count = Math.ceil(total / VALLEY_STAIR_RISER)
  const riser = total / count
  const summitHalfDepth = (hill.depth / 2) * (1 - hill.inset * (hill.tiers - 1))
  const steps: { z: number; height: number }[] = []
  for (let index = 0; index < count; index += 1) {
    steps.push({
      height: total - index * riser,
      z: summitHalfDepth - 0.4 + index * VALLEY_STAIR_TREAD,
    })
  }
  return steps
}

function pushTree(buckets: BandBuckets, tree: ValleyTree, quality: ValleyQuality) {
  const compact = quality === 'compact'
  const segments = compact ? 8 : 14
  const studSegments = compact ? 6 : 8
  const distance = Math.hypot(tree.x, tree.z)
  const scale = tree.scale
  const trunk = hazedColor(tree.trunkColor, distance)
  const canopy = hazedColor(tree.canopyColor, distance, new THREE.Color())

  const root = createRoundBrick({ radius: 0.76 * scale, height: 0.26 * scale, segments })
  paint(root, trunk)
  buckets[tree.band].push(place(root, tree.x, VALLEY_GROUND_Y, tree.z, tree.yaw))

  const stem = createRoundBrick({ radius: 0.5 * scale, height: 2.05 * scale, segments })
  paint(stem, trunk)
  buckets[tree.band].push(place(stem, tree.x, VALLEY_GROUND_Y + 0.26 * scale, tree.z, tree.yaw))

  const radii = compact ? [2.55, 1.6] : [2.8, 2.15, 1.45]
  const heights = compact ? [1.35, 1.15] : [1.2, 1.1, 1]
  let cursor = 2.0 * scale
  for (let layer = 0; layer < radii.length; layer += 1) {
    const top = layer === radii.length - 1
    const disc = createRoundBrick({
      radius: radii[layer] * scale,
      height: heights[layer] * scale,
      segments,
      studs: top ? (compact ? 3 : 5) : 0,
      studSegments,
    })
    // Canopy vertices are the only ones the wind shader moves.
    paint(disc, canopy, 0.055 * scale)
    buckets[tree.band].push(place(disc, tree.x, VALLEY_GROUND_Y + cursor, tree.z, tree.yaw))
    cursor += heights[layer] * scale

    if (top || compact) continue
    const shoulder = annulusStuds({
      radius: ((radii[layer] + radii[layer + 1]) / 2) * scale,
      y: cursor,
      count: layer === 0 ? 8 : 6,
      studRadius: 0.17 * scale,
      studSegments,
    })
    for (const stud of shoulder) {
      paint(stud, canopy, 0.055 * scale)
      buckets[tree.band].push(place(stud, tree.x, VALLEY_GROUND_Y, tree.z, tree.yaw))
    }
  }
}

function pushBlock(buckets: BandBuckets, block: ValleyBlock, quality: ValleyQuality) {
  const slab = createBrickSlab({
    width: block.width,
    depth: block.depth,
    height: block.height,
    studPitch: Math.min(block.width, block.depth) / 2,
    studSegments: quality === 'compact' ? 6 : 10,
  })
  paint(slab, hazedColor(block.color, Math.hypot(block.x, block.z)))
  buckets[block.band].push(place(slab, block.x, VALLEY_GROUND_Y, block.z, block.yaw))
}

function pushPondRim(buckets: BandBuckets, rim: ValleyPondRim, quality: ValleyQuality) {
  const slab = createBrickSlab({
    width: rim.width,
    depth: rim.depth,
    height: rim.height,
    studPitch: rim.depth,
    studSegments: quality === 'compact' ? 6 : 8,
  })
  paint(slab, hazedColor(rim.color, Math.hypot(rim.x, rim.z)))
  buckets[rim.band].push(place(slab, rim.x, VALLEY_GROUND_Y, rim.z, rim.yaw))
}

function pushTuft(buckets: BandBuckets, tuft: ValleyTuft) {
  const scale = tuft.scale
  const stem = hazedColor(tuft.stemColor, Math.hypot(tuft.x, tuft.z))
  if (tuft.flower) {
    const stalk = createRoundBrick({ radius: 0.055 * scale, height: 0.62 * scale, segments: 6 })
    paint(stalk, stem, 0.02 * scale)
    buckets.near.push(place(stalk, tuft.x, VALLEY_GROUND_Y, tuft.z, tuft.yaw))
    const head = hazedColor(tuft.headColor, Math.hypot(tuft.x, tuft.z), new THREE.Color())
    const disc = createRoundBrick({ radius: 0.16 * scale, height: 0.06 * scale, segments: 8, studs: 1, studSegments: 6 })
    paint(disc, head, 0.03 * scale)
    buckets.near.push(place(disc, tuft.x, VALLEY_GROUND_Y + 0.62 * scale, tuft.z, tuft.yaw))
    return
  }
  for (let blade = 0; blade < 3; blade += 1) {
    const angle = tuft.yaw + (blade / 3) * Math.PI * 2
    const shoot = createRoundBrick({ radius: 0.05 * scale, height: (0.4 + blade * 0.12) * scale, segments: 5 })
    paint(shoot, stem, 0.028 * scale)
    shoot.translate(Math.cos(angle) * 0.13 * scale, VALLEY_GROUND_Y, Math.sin(angle) * 0.13 * scale)
    shoot.translate(tuft.x, 0, tuft.z)
    buckets.near.push(shoot)
  }
}

/** One merged geometry per band — three draw calls for the whole landscape. */
export function buildValleyBandGeometries(layout: ValleyLayout) {
  const buckets: BandBuckets = { near: [], mid: [], far: [] }
  for (const prop of layout.props) {
    if (prop.kind === 'hill') pushHill(buckets, prop, layout.quality)
    else if (prop.kind === 'tree') pushTree(buckets, prop, layout.quality)
    else if (prop.kind === 'block') pushBlock(buckets, prop, layout.quality)
    else if (prop.kind === 'pondRim') pushPondRim(buckets, prop, layout.quality)
    else pushTuft(buckets, prop)
  }
  return {
    near: buckets.near.length ? mergeParts(buckets.near) : null,
    mid: buckets.mid.length ? mergeParts(buckets.mid) : null,
    far: buckets.far.length ? mergeParts(buckets.far) : null,
  }
}

// Held deliberately close together: the seams carry the "field of plates" read,
// and any real contrast between neighbours turns the meadow into a quilt.
const GROUND_TILE_COLORS = ['#72a848', '#6da245', '#76ab4c', '#6b9f43'] as const

/**
 * The ground is a field of giant plates with seams between them. The seams are
 * what sell the horizon: at eye height they converge into perspective lines the
 * way a flat colour plane never can.
 */
export function buildValleyGroundGeometry(quality: ValleyQuality) {
  const compact = quality === 'compact'
  const tile = compact ? 46 : 30
  // Wide enough that the sheet still runs past VALLEY_FOG_FAR in every
  // direction after a kid has walked a hundred units off the plate — otherwise
  // the ground's own edge shows up as a hard line against the sky.
  const half = compact ? 9 : 14
  const seam = compact ? 0.42 : 0.3
  const parts: THREE.BufferGeometry[] = []
  const colour = new THREE.Color()
  for (let col = -half; col <= half; col += 1) {
    for (let row = -half; row <= half; row += 1) {
      const x = col * tile
      const z = row * tile
      const distance = Math.hypot(x, z)
      const slab = new THREE.BoxGeometry(tile - seam, 1.2, tile - seam)
      slab.translate(x, VALLEY_GROUND_Y - 0.6, z)
      const index = (Math.abs(col) + Math.abs(row) * 2 + ((col * 7 + row * 13) % 4 === 0 ? 1 : 0)) % GROUND_TILE_COLORS.length
      hazedColor(GROUND_TILE_COLORS[index], distance, colour)
      paint(slab, colour)
      parts.push(slab)
    }
  }
  return mergeParts(parts)
}

/** Sits under the tiles so the seams read as gaps rather than holes to the sky. */
export function valleyGroundUnderlayExtent(quality: ValleyQuality) {
  return quality === 'compact' ? 46 * 19 : 30 * 29
}

export function buildValleyCloudGeometry(cloud: ValleyCloud, quality: ValleyQuality) {
  const compact = quality === 'compact'
  const parts: THREE.BufferGeometry[] = []
  const colour = new THREE.Color()
  for (const [index, brick] of cloud.bricks.entries()) {
    const slab = createBrickSlab({
      width: brick.width,
      depth: brick.depth,
      height: brick.height,
      studPitch: brick.depth / 1.6,
      studSegments: compact ? 6 : 8,
    })
    // A hint of sky in the lower bricks keeps them from reading as white boxes.
    colour.set(index % 2 === 0 ? '#ffffff' : '#eef6fd')
    paint(slab, colour)
    slab.translate(brick.dx, brick.dy, brick.dz)
    parts.push(slab)
  }
  return mergeParts(parts)
}

export function buildValleyWaterGeometry(layout: ValleyLayout) {
  const parts: THREE.BufferGeometry[] = []
  const colour = new THREE.Color('#4bb7dd')
  for (const tile of layout.water) {
    const slab = new THREE.BoxGeometry(tile.size, 0.14, tile.size)
    slab.translate(tile.x, VALLEY_GROUND_Y + 0.24, tile.z)
    paint(slab, colour)
    parts.push(slab)
  }
  return parts.length ? mergeParts(parts) : null
}

/** Physics bodies for the props a kid can actually walk into. */
export type ValleyCollider = {
  halfExtents: [number, number, number]
  position: [number, number, number]
  yaw: number
}

export function buildValleyColliders(layout: ValleyLayout): ValleyCollider[] {
  const colliders: ValleyCollider[] = []
  for (const prop of layout.props) {
    if (prop.kind === 'hill') {
      if (!prop.collides) continue
      for (let tier = 0; tier < prop.tiers; tier += 1) {
        const shrink = 1 - prop.inset * tier
        colliders.push({
          halfExtents: [(prop.width * shrink) / 2, prop.tierHeight / 2, (prop.depth * shrink) / 2],
          position: [prop.x, VALLEY_GROUND_Y + tier * prop.tierHeight + prop.tierHeight / 2, prop.z],
          yaw: prop.yaw,
        })
      }
      if (prop.stairs) {
        for (const step of valleyStairSteps(prop)) {
          const local = new THREE.Vector3(0, 0, step.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), prop.yaw)
          colliders.push({
            halfExtents: [VALLEY_STAIR_WIDTH / 2, step.height / 2, VALLEY_STAIR_TREAD / 2],
            position: [prop.x + local.x, VALLEY_GROUND_Y + step.height / 2, prop.z + local.z],
            yaw: prop.yaw,
          })
        }
      }
    } else if (prop.kind === 'block') {
      colliders.push({
        halfExtents: [prop.width / 2, prop.height / 2, prop.depth / 2],
        position: [prop.x, VALLEY_GROUND_Y + prop.height / 2, prop.z],
        yaw: prop.yaw,
      })
    } else if (prop.kind === 'tree') {
      const radius = 0.62 * prop.scale
      colliders.push({
        halfExtents: [radius, 1.2 * prop.scale, radius],
        position: [prop.x, VALLEY_GROUND_Y + 1.2 * prop.scale, prop.z],
        yaw: prop.yaw,
      })
    } else if (prop.kind === 'pondRim') {
      colliders.push({
        halfExtents: [prop.width / 2, prop.height / 2, prop.depth / 2],
        position: [prop.x, VALLEY_GROUND_Y + prop.height / 2, prop.z],
        yaw: prop.yaw,
      })
    }
  }
  return colliders
}
