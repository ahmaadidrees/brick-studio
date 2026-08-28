import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  GROUND_Y,
  PLATE_MESH_HALF,
  SKY_ISLAND,
  SKY_PALETTE,
  createSeededRandom,
  islandOutlineRadius,
  plateBoundaryRadius,
  type CloudField,
  type ResolvedProp,
  type ResolvedWaterfall,
} from './skyIsland'

/**
 * Geometry factories for the sky island. Everything is flat-shaded and vertex
 * coloured so the whole diorama renders through two materials: one matte
 * "nature" material for land and dressing, one shader for water/cloud.
 */

const color = new THREE.Color()
const colorB = new THREE.Color()

/**
 * Flattens a primitive into faceted, vertex-coloured, sway-tagged geometry so
 * anything can be merged with anything else.
 *
 * `sway` is ramped by height inside the part's own bounds: trunks stay planted
 * while canopies move.
 */
function facet(
  source: THREE.BufferGeometry,
  bottomColor: string,
  topColor = bottomColor,
  sway = 0,
) {
  const geometry = source.index ? source.toNonIndexed() : source
  if (geometry !== source) source.dispose()
  geometry.deleteAttribute('uv')
  geometry.deleteAttribute('uv1')
  geometry.deleteAttribute('uv2')
  geometry.computeVertexNormals()
  const position = geometry.getAttribute('position')
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const spanY = Math.max(box.max.y - box.min.y, 1e-4)
  const colors = new Float32Array(position.count * 3)
  const sways = new Float32Array(position.count)
  color.set(bottomColor)
  colorB.set(topColor)
  for (let i = 0; i < position.count; i += 1) {
    const t = (position.getY(i) - box.min.y) / spanY
    colors[i * 3] = color.r + (colorB.r - color.r) * t
    colors[i * 3 + 1] = color.g + (colorB.g - color.g) * t
    colors[i * 3 + 2] = color.b + (colorB.b - color.b) * t
    sways[i] = sway * t * t
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setAttribute('aSway', new THREE.BufferAttribute(sways, 1))
  return geometry
}

function mergeFaceted(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts, false)
  parts.forEach((part) => part.dispose())
  if (!merged) throw new Error('sky island: could not merge geometry')
  return merged
}

function placed(geometry: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, scale = 1) {
  if (scale !== 1) geometry.scale(scale, scale, scale)
  if (yaw !== 0) geometry.rotateY(yaw)
  geometry.translate(x, y, z)
  return geometry
}

/* ----------------------------------------------------------- island mass */

type MassRing = { y: number; scale: number; color: string; jitter: number }

const ISLAND_RINGS: MassRing[] = [
  { y: GROUND_Y, scale: 1.0, color: SKY_PALETTE.grass, jitter: 0 },
  { y: -0.78, scale: 1.032, color: SKY_PALETTE.grass, jitter: 0.006 },
  { y: -1.7, scale: 1.008, color: SKY_PALETTE.grassFringe, jitter: 0.018 },
  { y: -3.4, scale: 0.955, color: SKY_PALETTE.dirt, jitter: 0.034 },
  { y: -6.2, scale: 0.882, color: SKY_PALETTE.dirtDark, jitter: 0.05 },
  { y: -9.8, scale: 0.788, color: SKY_PALETTE.rock, jitter: 0.07 },
  { y: -14.2, scale: 0.638, color: SKY_PALETTE.rock, jitter: 0.086 },
  { y: -19.2, scale: 0.468, color: SKY_PALETTE.rockDark, jitter: 0.098 },
  { y: -24.2, scale: 0.302, color: SKY_PALETTE.rockDark, jitter: 0.1 },
  { y: -29.4, scale: 0.148, color: SKY_PALETTE.rockDeep, jitter: 0.088 },
  { y: SKY_ISLAND.apexY, scale: 0.0, color: SKY_PALETTE.rockDeep, jitter: 0 },
]

function craggy(theta: number, y: number) {
  return (
    Math.sin(theta * 7 + y * 0.42) * 0.55
    + Math.sin(theta * 13 - y * 0.27) * 0.28
    + Math.sin(theta * 4 + y * 0.71) * 0.17
  )
}

function ringRadius(theta: number, ring: MassRing) {
  return islandOutlineRadius(theta) * ring.scale * (1 + ring.jitter * craggy(theta, ring.y))
}

/** Grass cap: concentric fan with mottled colour so the rim is not flat green. */
function islandTopCap(segments: number) {
  const rings = [0, 0.5, 0.78, 0.93, 1]
  const positions: number[] = []
  const colors: number[] = []
  const push = (theta: number, ratio: number) => {
    const radius = islandOutlineRadius(theta) * ratio
    positions.push(Math.cos(theta) * radius, GROUND_Y, Math.sin(theta) * radius)
    const mottle = Math.sin(theta * 9 + ratio * 11) * 0.5 + Math.sin(theta * 17 - ratio * 6) * 0.5
    const edge = Math.max(0, (ratio - 0.72) / 0.28)
    color.set(SKY_PALETTE.grass)
    colorB.set(mottle > 0.15 ? SKY_PALETTE.grassLight : SKY_PALETTE.grassDark)
    const blend = 0.18 + Math.abs(mottle) * 0.24 + edge * 0.3
    colors.push(
      color.r + (colorB.r - color.r) * blend,
      color.g + (colorB.g - color.g) * blend,
      color.b + (colorB.b - color.b) * blend,
    )
  }
  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * Math.PI * 2
    const t1 = ((i + 1) / segments) * Math.PI * 2
    for (let r = 0; r < rings.length - 1; r += 1) {
      const inner = rings[r]
      const outer = rings[r + 1]
      // Wound counter-clockwise seen from above so the cap's normal is +Y.
      if (inner === 0) {
        push(0, 0)
        push(t1, outer)
        push(t0, outer)
        continue
      }
      push(t0, inner); push(t1, outer); push(t0, outer)
      push(t0, inner); push(t1, inner); push(t1, outer)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  geometry.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1))
  geometry.computeVertexNormals()
  return geometry
}

function islandSkirt(segments: number) {
  const positions: number[] = []
  const colors: number[] = []
  const push = (theta: number, ring: MassRing) => {
    const radius = ringRadius(theta, ring)
    positions.push(Math.cos(theta) * radius, ring.y, Math.sin(theta) * radius)
    color.set(ring.color)
    const shade = 1 + craggy(theta, ring.y) * 0.06
    colors.push(color.r * shade, color.g * shade, color.b * shade)
  }
  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * Math.PI * 2
    const t1 = ((i + 1) / segments) * Math.PI * 2
    for (let r = 0; r < ISLAND_RINGS.length - 1; r += 1) {
      const top = ISLAND_RINGS[r]
      const bottom = ISLAND_RINGS[r + 1]
      if (bottom.scale === 0) {
        push(t0, top); push(t1, top); push(t0, bottom)
        continue
      }
      push(t0, top); push(t1, top); push(t1, bottom)
      push(t0, top); push(t1, bottom); push(t0, bottom)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  geometry.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1))
  geometry.computeVertexNormals()
  return geometry
}

/** Rock spurs jutting from the underside so the silhouette is not a plain cone. */
function rockSpurs() {
  const random = createSeededRandom(9182)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 7; i += 1) {
    const theta = (i / 7) * Math.PI * 2 + random() * 0.8
    const depth = -4 - random() * 17
    const ring = ISLAND_RINGS.reduce((best, candidate) =>
      Math.abs(candidate.y - depth) < Math.abs(best.y - depth) ? candidate : best)
    const radius = ringRadius(theta, ring) * (0.82 + random() * 0.18)
    const size = 1.6 + random() * 3.4
    const spur = new THREE.IcosahedronGeometry(size, 0)
    spur.scale(1, 0.55 + random() * 0.5, 1.9 + random())
    spur.rotateX(-0.5 - random() * 0.7)
    parts.push(placed(
      facet(spur, SKY_PALETTE.rockDeep, SKY_PALETTE.rock),
      Math.cos(theta) * radius,
      depth,
      Math.sin(theta) * radius,
      -theta,
    ))
  }
  return parts
}

export function createIslandMassGeometry(segments: number, includeSpurs: boolean) {
  const parts = [islandTopCap(segments), islandSkirt(segments)]
  if (includeSpurs) parts.push(...rockSpurs())
  return mergeFaceted(parts)
}

/* -------------------------------------------------------------- dressing */

function conifer(segments: number, tall: boolean) {
  const height = tall ? 2.0 : 1.5
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, height, segments)
  trunk.translate(0, height / 2, 0)
  const parts = [facet(trunk, SKY_PALETTE.woodDark, SKY_PALETTE.wood)]
  const tiers = tall ? 4 : 3
  let y = height * 0.62
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers
    const radius = (tall ? 2.05 : 1.65) * (1 - t * 0.52)
    const tierHeight = (tall ? 2.5 : 2.0) * (1 - t * 0.24)
    const cone = new THREE.ConeGeometry(radius, tierHeight, segments)
    cone.translate(0, tierHeight / 2, 0)
    cone.rotateY(i * 0.5)
    parts.push(placed(
      facet(cone, SKY_PALETTE.foliageDeep, SKY_PALETTE.foliage, 0.55),
      0,
      y,
      0,
    ))
    y += tierHeight * 0.46
  }
  return mergeFaceted(parts)
}

function broadleaf(segments: number, big: boolean) {
  const height = big ? 3.1 : 2.3
  const trunk = new THREE.CylinderGeometry(0.22, 0.4, height, segments)
  trunk.translate(0, height / 2, 0)
  const parts = [facet(trunk, SKY_PALETTE.woodDark, SKY_PALETTE.wood)]
  const random = createSeededRandom(big ? 71 : 17)
  const blobs = big ? 5 : 4
  for (let i = 0; i < blobs; i += 1) {
    const radius = (big ? 1.9 : 1.45) * (0.68 + random() * 0.5)
    const blob = new THREE.IcosahedronGeometry(radius, 1)
    blob.scale(1, 0.82, 1)
    const spread = (big ? 1.5 : 1.1) * random()
    const angle = random() * Math.PI * 2
    parts.push(placed(
      facet(blob, SKY_PALETTE.foliageDeep, SKY_PALETTE.foliageLight, 0.85),
      Math.cos(angle) * spread,
      height + (big ? 1.2 : 0.9) + (random() - 0.4) * 0.9,
      Math.sin(angle) * spread,
    ))
  }
  return mergeFaceted(parts)
}

function bush() {
  const random = createSeededRandom(303)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i += 1) {
    const radius = 0.5 + random() * 0.42
    const blob = new THREE.IcosahedronGeometry(radius, 1)
    blob.scale(1.15, 0.85, 1.15)
    parts.push(placed(
      facet(blob, SKY_PALETTE.foliageDeep, SKY_PALETTE.foliage, 0.9),
      (random() - 0.5) * 1.1,
      radius * 0.72,
      (random() - 0.5) * 1.1,
    ))
  }
  return mergeFaceted(parts)
}

function boulder(seed: number) {
  const random = createSeededRandom(seed)
  const parts: THREE.BufferGeometry[] = []
  const main = new THREE.IcosahedronGeometry(1.4, 0)
  main.scale(1.25, 0.86, 1.05)
  main.rotateY(random() * 3)
  main.rotateX(random() * 0.35)
  parts.push(placed(facet(main, SKY_PALETTE.rockDark, SKY_PALETTE.rock), 0, 1.05, 0))
  for (let i = 0; i < 2; i += 1) {
    const chunk = new THREE.IcosahedronGeometry(0.42 + random() * 0.4, 0)
    chunk.rotateY(random() * 3)
    parts.push(placed(
      facet(chunk, SKY_PALETTE.rockDark, SKY_PALETTE.stone),
      (random() - 0.5) * 2.6,
      0.3,
      (random() - 0.5) * 2.6,
    ))
  }
  return mergeFaceted(parts)
}

/** Low scatter stones — deliberately under the 0.22 autostep so you walk over. */
function stones(seed: number) {
  const random = createSeededRandom(seed)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 5; i += 1) {
    const size = 0.22 + random() * 0.3
    const stone = new THREE.IcosahedronGeometry(size, 0)
    stone.scale(1.4, 0.5, 1.2)
    stone.rotateY(random() * 3)
    parts.push(placed(
      facet(stone, SKY_PALETTE.rockDark, SKY_PALETTE.stone),
      (random() - 0.5) * 2.8,
      size * 0.3,
      (random() - 0.5) * 2.8,
    ))
  }
  return mergeFaceted(parts)
}

/** `deckLift` keeps the planks off the coplanar grass so they cannot z-fight;
 *  it is far under the 0.22 autostep, so walking on is still seamless. */
export const PIER = { halfWidth: 1.3, halfLength: 7, deckThickness: 0.18, railHeight: 0.62, deckLift: 0.04 }

/**
 * The lookout. Local +Z runs out over the drop, so the deck's far end and its
 * open railing frame the cloud sea.
 */
function pier() {
  const parts: THREE.BufferGeometry[] = []
  const plankCount = 22
  for (let i = 0; i < plankCount; i += 1) {
    const t = i / (plankCount - 1)
    const z = -PIER.halfLength + t * PIER.halfLength * 2
    const plank = new THREE.BoxGeometry(PIER.halfWidth * 2, PIER.deckThickness, (PIER.halfLength * 2) / plankCount - 0.06)
    parts.push(placed(
      facet(plank, SKY_PALETTE.woodDark, i % 2 === 0 ? SKY_PALETTE.wood : '#7d5230'),
      0,
      PIER.deckLift - PIER.deckThickness / 2,
      z,
    ))
  }
  // Support posts dropping into the void under the overhang.
  for (const [px, pz, length] of [
    [-PIER.halfWidth, PIER.halfLength - 0.6, 5.5],
    [PIER.halfWidth, PIER.halfLength - 0.6, 5.5],
    [-PIER.halfWidth, PIER.halfLength - 3.4, 3.4],
    [PIER.halfWidth, PIER.halfLength - 3.4, 3.4],
  ]) {
    const post = new THREE.CylinderGeometry(0.13, 0.11, length, 6)
    parts.push(placed(facet(post, SKY_PALETTE.woodDark, SKY_PALETTE.wood), px, -length / 2 - 0.1, pz))
  }
  // Rails: both sides, stopping short of the tip so the view stays open.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      const z = -PIER.halfLength + 0.5 + i * 2.4
      const post = new THREE.BoxGeometry(0.14, PIER.railHeight, 0.14)
      parts.push(placed(
        facet(post, SKY_PALETTE.woodDark, SKY_PALETTE.wood),
        side * PIER.halfWidth,
        PIER.railHeight / 2,
        z,
      ))
    }
    const rail = new THREE.BoxGeometry(0.09, 0.09, PIER.halfLength * 2 - 0.9)
    parts.push(placed(
      facet(rail, SKY_PALETTE.wood, SKY_PALETTE.wood),
      side * PIER.halfWidth,
      PIER.railHeight,
      -0.2,
    ))
  }
  // Lantern on the last post.
  const lanternPost = new THREE.CylinderGeometry(0.08, 0.08, 1.5, 6)
  parts.push(placed(facet(lanternPost, SKY_PALETTE.woodDark, SKY_PALETTE.wood), PIER.halfWidth, 0.75, PIER.halfLength - 0.9))
  return mergeFaceted(parts)
}

function signpost() {
  const parts: THREE.BufferGeometry[] = []
  const post = new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6)
  parts.push(placed(facet(post, SKY_PALETTE.woodDark, SKY_PALETTE.wood), 0, 1.1, 0))
  const boardA = new THREE.BoxGeometry(1.5, 0.36, 0.08)
  parts.push(placed(facet(boardA, SKY_PALETTE.wood, '#a06a3c'), 0.55, 1.85, 0, 0.12))
  const boardB = new THREE.BoxGeometry(1.2, 0.3, 0.08)
  parts.push(placed(facet(boardB, SKY_PALETTE.wood, '#a06a3c'), -0.45, 1.4, 0, -0.35))
  return mergeFaceted(parts)
}

function campfire() {
  const random = createSeededRandom(616)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2
    const stone = new THREE.IcosahedronGeometry(0.26 + random() * 0.1, 0)
    stone.scale(1.1, 0.8, 1.1)
    parts.push(placed(
      facet(stone, SKY_PALETTE.rockDark, SKY_PALETTE.stone),
      Math.cos(angle) * 1.05,
      0.16,
      Math.sin(angle) * 1.05,
    ))
  }
  for (let i = 0; i < 4; i += 1) {
    const log = new THREE.CylinderGeometry(0.11, 0.13, 1.5, 6)
    log.rotateZ(1.15)
    parts.push(placed(
      facet(log, SKY_PALETTE.woodDark, SKY_PALETTE.wood),
      0,
      0.32,
      0,
      (i / 4) * Math.PI * 2,
    ))
  }
  // Two log seats.
  for (const seatAngle of [0.8, 3.6]) {
    const seat = new THREE.CylinderGeometry(0.28, 0.28, 1.9, 8)
    seat.rotateZ(Math.PI / 2)
    parts.push(placed(
      facet(seat, SKY_PALETTE.woodDark, SKY_PALETTE.wood),
      Math.cos(seatAngle) * 2.1,
      0.28,
      Math.sin(seatAngle) * 2.1,
      -seatAngle,
    ))
  }
  return mergeFaceted(parts)
}

function ruinArch() {
  const parts: THREE.BufferGeometry[] = []
  for (const side of [-1, 1]) {
    const pillar = new THREE.CylinderGeometry(0.52, 0.68, 4.2, 7)
    parts.push(placed(facet(pillar, SKY_PALETTE.rockDark, SKY_PALETTE.stone), side * 1.9, 2.1, 0))
    const cap = new THREE.BoxGeometry(1.5, 0.4, 1.2)
    parts.push(placed(facet(cap, SKY_PALETTE.stone, SKY_PALETTE.stone), side * 1.9, 4.35, 0))
  }
  const span = new THREE.TorusGeometry(1.9, 0.36, 5, 10, Math.PI)
  parts.push(placed(facet(span, SKY_PALETTE.rockDark, SKY_PALETTE.stone), 0, 4.5, 0, Math.PI / 2))
  const random = createSeededRandom(51)
  for (let i = 0; i < 4; i += 1) {
    const rubble = new THREE.IcosahedronGeometry(0.3 + random() * 0.25, 0)
    parts.push(placed(
      facet(rubble, SKY_PALETTE.rockDark, SKY_PALETTE.stone),
      (random() - 0.5) * 5,
      0.2,
      (random() - 0.5) * 3,
    ))
  }
  return mergeFaceted(parts)
}

function fence() {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i += 1) {
    const post = new THREE.BoxGeometry(0.16, 1.0, 0.16)
    parts.push(placed(facet(post, SKY_PALETTE.woodDark, SKY_PALETTE.wood), -1.5 + i, 0.5, 0))
  }
  for (const y of [0.42, 0.78]) {
    const rail = new THREE.BoxGeometry(3.2, 0.1, 0.08)
    parts.push(placed(facet(rail, SKY_PALETTE.wood, SKY_PALETTE.wood), -0.5, y, 0))
  }
  return mergeFaceted(parts)
}

function flagpole(warm: boolean) {
  const parts: THREE.BufferGeometry[] = []
  const pole = new THREE.CylinderGeometry(0.075, 0.1, 4.4, 6)
  parts.push(placed(facet(pole, SKY_PALETTE.woodDark, SKY_PALETTE.wood), 0, 2.2, 0))
  const base = new THREE.CylinderGeometry(0.36, 0.46, 0.34, 8)
  parts.push(placed(facet(base, SKY_PALETTE.rockDark, SKY_PALETTE.stone), 0, 0.17, 0))
  // The pennant is tagged with sway that grows along its free edge so it ripples.
  const flag = new THREE.BoxGeometry(1.5, 0.8, 0.06, 5, 2, 1)
  flag.translate(0.82, 0, 0)
  const flagGeometry = facet(
    flag,
    warm ? SKY_PALETTE.flagWarm : SKY_PALETTE.flagGold,
    warm ? '#f27a58' : '#ffd070',
  )
  const sway = flagGeometry.getAttribute('aSway')
  const flagPosition = flagGeometry.getAttribute('position')
  for (let i = 0; i < sway.count; i += 1) {
    sway.setX(i, Math.min(1, Math.max(0, flagPosition.getX(i) - 0.1) / 1.5) * 1.9)
  }
  parts.push(placed(flagGeometry, 0, 3.85, 0))
  return mergeFaceted(parts)
}

const PROP_BUILDERS: Record<ResolvedProp['kind'], (segments: number, seed: number) => THREE.BufferGeometry> = {
  coniferTall: (segments) => conifer(segments, true),
  conifer: (segments) => conifer(segments, false),
  broadleaf: (segments) => broadleaf(segments, false),
  broadleafBig: (segments) => broadleaf(segments, true),
  bush: () => bush(),
  boulder: (_segments, seed) => boulder(seed),
  stones: (_segments, seed) => stones(seed),
  pier: () => pier(),
  signpost: () => signpost(),
  campfire: () => campfire(),
  arch: () => ruinArch(),
  fence: () => fence(),
  flagpole: (_segments, seed) => flagpole(seed % 2 === 0),
}

/** Gravel apron + kerb stones that seat the baseplate into the meadow. */
function plateApron() {
  const parts: THREE.BufferGeometry[] = []
  const steps = 128
  const positions: number[] = []
  const colors: number[] = []
  const apronY = GROUND_Y + 0.01
  const squarePoint = (t: number) => {
    const angle = t * Math.PI * 2
    const radius = plateBoundaryRadius(angle)
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius, angle }
  }
  const width = (t: number) => 3.3 + Math.sin(t * Math.PI * 14 + 0.4) * 0.85 + Math.sin(t * Math.PI * 26) * 0.4
  const push = (t: number, outer: boolean) => {
    const point = squarePoint(t)
    const offset = outer ? width(t) : 0
    positions.push(
      point.x + Math.cos(point.angle) * offset,
      apronY,
      point.z + Math.sin(point.angle) * offset,
    )
    color.set(SKY_PALETTE.gravel)
    colorB.set(SKY_PALETTE.grassFringe)
    const blend = outer ? 0.72 : 0.0
    colors.push(
      color.r + (colorB.r - color.r) * blend,
      color.g + (colorB.g - color.g) * blend,
      color.b + (colorB.b - color.b) * blend,
    )
  }
  for (let i = 0; i < steps; i += 1) {
    const t0 = i / steps
    const t1 = (i + 1) / steps
    push(t0, false); push(t1, true); push(t0, true)
    push(t0, false); push(t1, false); push(t1, true)
  }
  const apron = new THREE.BufferGeometry()
  apron.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  apron.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  apron.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1))
  apron.computeVertexNormals()
  parts.push(apron)

  const random = createSeededRandom(2024)
  for (let i = 0; i < 44; i += 1) {
    if (random() < 0.32) continue
    const t = i / 44
    const angle = t * Math.PI * 2
    const radius = plateBoundaryRadius(angle) + 0.62 + random() * 0.3
    const kerb = new THREE.BoxGeometry(0.55 + random() * 0.5, 0.19, 0.42)
    parts.push(placed(
      facet(kerb, SKY_PALETTE.rockDark, SKY_PALETTE.stone),
      Math.cos(angle) * radius,
      GROUND_Y + 0.09,
      Math.sin(angle) * radius,
      -angle + (random() - 0.5) * 0.5,
    ))
  }
  return parts
}

export function createPropsGeometry(props: ResolvedProp[], treeSegments: number) {
  const parts: THREE.BufferGeometry[] = [...plateApron()]
  props.forEach((prop, index) => {
    const geometry = PROP_BUILDERS[prop.kind](treeSegments, 100 + index * 13)
    parts.push(placed(geometry, prop.x, GROUND_Y, prop.z, prop.yaw, prop.scaleFactor))
  })
  return mergeFaceted(parts)
}

/* ------------------------------------------------------------ prop colliders */

export type PropCollider = {
  halfExtents: [number, number, number]
  position: [number, number, number]
  rotation: [number, number, number]
}

const COLLIDER_SHAPES: Partial<Record<ResolvedProp['kind'], [number, number, number][]>> = {
  coniferTall: [[0.3, 1.05, 0.3]],
  conifer: [[0.28, 0.85, 0.28]],
  broadleaf: [[0.34, 1.2, 0.34]],
  broadleafBig: [[0.42, 1.6, 0.42]],
  boulder: [[1.45, 1.0, 1.2]],
  signpost: [[0.14, 1.1, 0.14]],
  fence: [[1.7, 0.5, 0.12]],
  flagpole: [[0.16, 2.2, 0.16]],
}

/** Boxes the player can bump into. Bushes, stones and campfires stay walkable. */
export function createPropColliders(props: ResolvedProp[]): PropCollider[] {
  const colliders: PropCollider[] = []
  for (const prop of props) {
    if (prop.kind === 'pier') {
      const yaw = prop.yaw
      const sin = Math.sin(yaw)
      const cos = Math.cos(yaw)
      colliders.push({
        halfExtents: [PIER.halfWidth, PIER.deckThickness / 2, PIER.halfLength],
        position: [prop.x, GROUND_Y + PIER.deckLift - PIER.deckThickness / 2, prop.z],
        rotation: [0, yaw, 0],
      })
      for (const side of [-1, 1]) {
        colliders.push({
          halfExtents: [0.1, PIER.railHeight / 2, PIER.halfLength - 0.4],
          position: [
            prop.x + cos * side * PIER.halfWidth,
            GROUND_Y + PIER.deckLift + PIER.railHeight / 2,
            prop.z - sin * side * PIER.halfWidth,
          ],
          rotation: [0, yaw, 0],
        })
      }
      continue
    }
    if (prop.kind === 'arch') {
      for (const side of [-1, 1]) {
        colliders.push({
          halfExtents: [0.6, 2.1, 0.6],
          position: [
            prop.x + Math.cos(prop.yaw) * side * 1.9,
            GROUND_Y + 2.1,
            prop.z - Math.sin(prop.yaw) * side * 1.9,
          ],
          rotation: [0, prop.yaw, 0],
        })
      }
      continue
    }
    const shapes = COLLIDER_SHAPES[prop.kind]
    if (!shapes) continue
    for (const half of shapes) {
      const scale = prop.scaleFactor
      colliders.push({
        halfExtents: [half[0] * scale, half[1] * scale, half[2] * scale],
        position: [prop.x, GROUND_Y + half[1] * scale, prop.z],
        rotation: [0, prop.yaw, 0],
      })
    }
  }
  return colliders
}

/* --------------------------------------------------------------- grass */

/** Tufts keep clear of dressing so grass never grows through the pier decking. */
const TUFT_PROP_CLEARANCE: Partial<Record<ResolvedProp['kind'], number>> = {
  campfire: 3.2,
  arch: 3.6,
  boulder: 2.2,
  fence: 2.4,
}

export function createGrassTuftGeometry(count: number, props: ResolvedProp[] = []) {
  if (count <= 0) return null
  const random = createSeededRandom(1290)
  const positions: number[] = []
  const colors: number[] = []
  const sways: number[] = []
  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2
    const edge = islandOutlineRadius(theta) - 1.2
    const inner = plateBoundaryRadius(theta) + 1.9
    if (edge <= inner) continue
    const radius = inner + (edge - inner) * random()
    const cx = Math.cos(theta) * radius
    const cz = Math.sin(theta) * radius
    const blocked = props.some((prop) => {
      if (prop.kind === 'pier') {
        // The deck is a long rectangle, so a radial clearance would either leak
        // grass through the planks or scrub the whole meadow around it.
        const dx = cx - prop.x
        const dz = cz - prop.z
        const localX = dx * Math.cos(prop.yaw) - dz * Math.sin(prop.yaw)
        const localZ = dx * Math.sin(prop.yaw) + dz * Math.cos(prop.yaw)
        return Math.abs(localX) < PIER.halfWidth + 0.7 && Math.abs(localZ) < PIER.halfLength + 0.7
      }
      const clearance = TUFT_PROP_CLEARANCE[prop.kind] ?? 1.2
      return Math.hypot(prop.x - cx, prop.z - cz) < clearance
    })
    if (blocked) continue
    const blades = 3
    for (let blade = 0; blade < blades; blade += 1) {
      const angle = random() * Math.PI * 2
      const height = 0.3 + random() * 0.34
      const width = 0.09 + random() * 0.06
      const lean = (random() - 0.5) * 0.34
      const dx = Math.cos(angle) * width
      const dz = Math.sin(angle) * width
      const ox = (random() - 0.5) * 0.5
      const oz = (random() - 0.5) * 0.5
      positions.push(
        cx + ox - dx, GROUND_Y, cz + oz - dz,
        cx + ox + dx, GROUND_Y, cz + oz + dz,
        cx + ox + lean, GROUND_Y + height, cz + oz + lean,
      )
      const tint = 0.55 + random() * 0.45
      color.set(SKY_PALETTE.grassDark)
      colorB.set(SKY_PALETTE.grassLight)
      for (let v = 0; v < 3; v += 1) {
        const t = v === 2 ? 1 : 0
        colors.push(
          color.r + (colorB.r - color.r) * tint * t,
          color.g + (colorB.g - color.g) * tint * t,
          color.b + (colorB.b - color.b) * tint * t,
        )
        sways.push(v === 2 ? 1.8 : 0)
      }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  geometry.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(sways), 1))
  geometry.computeVertexNormals()
  return geometry
}

/* ---------------------------------------------------------- water shapes */

/**
 * The falling ribbon: local +Z bows outward as it drops so the water arcs away
 * from the cliff instead of hugging it.
 */
/** Overlapping strands of different width, speed and drift read as water; one
 *  flat sheet reads as glass. Each strand carries its own phase attribute. */
const FALL_STRANDS = [
  { widthScale: 1.0, offset: 0, phase: 0, wobble: 0.18, depth: 0 },
  { widthScale: 0.58, offset: -0.22, phase: 2.1, wobble: 0.34, depth: 0.28 },
  { widthScale: 0.4, offset: 0.27, phase: 4.3, wobble: 0.46, depth: -0.26 },
]

export function createWaterfallRibbonGeometry(fall: ResolvedWaterfall) {
  const columns = 6
  const rows = 26
  const positions: number[] = []
  const uvs: number[] = []
  const phases: number[] = []
  const indices: number[] = []
  let base = 0
  for (const strand of FALL_STRANDS) {
    for (let row = 0; row <= rows; row += 1) {
      const v = row / rows
      const width = (fall.topWidth + (fall.bottomWidth - fall.topWidth) * v) * strand.widthScale
      const drop = -fall.height * v
      const bow = fall.bow * Math.pow(v, 1.55)
      const sway = Math.sin(v * 5.4 + strand.phase) * strand.wobble * fall.topWidth
      for (let col = 0; col <= columns; col += 1) {
        const u = col / columns
        const curl = Math.cos((u - 0.5) * Math.PI) * 0.35 * v
        positions.push(
          (u - 0.5) * width + strand.offset * fall.topWidth + sway,
          drop,
          bow + curl + strand.depth,
        )
        uvs.push(u, 1 - v)
        phases.push(strand.phase)
      }
    }
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        const a = base + row * (columns + 1) + col
        const b = a + 1
        const c = a + columns + 1
        const d = c + 1
        indices.push(a, c, b, b, c, d)
      }
    }
    base += (rows + 1) * (columns + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(new Float32Array(phases), 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** Stream bed running from the spring pool to the lip. */
export function createStreamGeometry(fall: ResolvedWaterfall) {
  const from = new THREE.Vector2(fall.poolX, fall.poolZ)
  const to = new THREE.Vector2(fall.lipX, fall.lipZ)
  const direction = to.clone().sub(from)
  const normal = new THREE.Vector2(-direction.y, direction.x).normalize()
  const positions: number[] = []
  const segments = 12
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const width = (1.5 + t * (fall.topWidth * 0.5 - 1.5)) * 0.5
    const cx = from.x + direction.x * t
    const cz = from.y + direction.y * t
    const wobble = Math.sin(t * 5.5) * 0.5
    positions.push(
      cx + normal.x * (width + wobble * 0.2) + normal.x * 0,
      GROUND_Y + 0.02,
      cz + normal.y * (width + wobble * 0.2),
      cx - normal.x * (width - wobble * 0.2),
      GROUND_Y + 0.02,
      cz - normal.y * (width - wobble * 0.2),
    )
  }
  const indices: number[] = []
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/* -------------------------------------------------------------- clouds */

/**
 * Every puff is a quad whose corners are billboarded in the vertex shader.
 * One geometry, one draw call, already depth-sorted by `createCloudField`.
 */
export function createCloudPuffGeometry(field: CloudField) {
  const quadCount = field.count
  const positions = new Float32Array(quadCount * 6 * 3)
  const centers = new Float32Array(quadCount * 6 * 3)
  const sizes = new Float32Array(quadCount * 6)
  const seeds = new Float32Array(quadCount * 6)
  const flatten = new Float32Array(quadCount * 6)
  const corners = [
    [-1, -1], [1, -1], [1, 1],
    [-1, -1], [1, 1], [-1, 1],
  ]
  for (let i = 0; i < quadCount; i += 1) {
    for (let v = 0; v < 6; v += 1) {
      const index = i * 6 + v
      positions[index * 3] = corners[v][0]
      positions[index * 3 + 1] = corners[v][1]
      positions[index * 3 + 2] = 0
      centers[index * 3] = field.centers[i * 3]
      centers[index * 3 + 1] = field.centers[i * 3 + 1]
      centers[index * 3 + 2] = field.centers[i * 3 + 2]
      sizes[index] = field.sizes[i]
      seeds[index] = field.seeds[i]
      flatten[index] = field.flatten[i]
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aCenter', new THREE.BufferAttribute(centers, 3))
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
  geometry.setAttribute('aFlatten', new THREE.BufferAttribute(flatten, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SKY_ISLAND.worldRadius * 1.6)
  return geometry
}

/* ------------------------------------------------------- distant islands */

const DISTANT_RINGS: { y: number; scale: number; color: string }[] = [
  { y: 0, scale: 1.0, color: SKY_PALETTE.grass },
  { y: -0.07, scale: 1.04, color: SKY_PALETTE.grass },
  { y: -0.16, scale: 1.0, color: SKY_PALETTE.grassFringe },
  { y: -0.3, scale: 0.92, color: SKY_PALETTE.dirt },
  { y: -0.52, scale: 0.78, color: SKY_PALETTE.rock },
  { y: -0.78, scale: 0.54, color: SKY_PALETTE.rockDark },
  { y: -1.02, scale: 0.26, color: SKY_PALETTE.rockDeep },
  { y: -1.25, scale: 0, color: SKY_PALETTE.rockDeep },
]

export function createDistantIslandGeometry(radius: number, seed: number, segments = 22) {
  const random = createSeededRandom(seed)
  const wobbleA = random() * 6
  const wobbleB = random() * 6
  const outline = (theta: number) =>
    radius * (1 + Math.sin(theta * 3 + wobbleA) * 0.13 + Math.sin(theta * 6 + wobbleB) * 0.07)
  const positions: number[] = []
  const colors: number[] = []
  const push = (theta: number, ring: { y: number; scale: number; color: string }) => {
    const r = outline(theta) * ring.scale
    positions.push(Math.cos(theta) * r, ring.y * radius, Math.sin(theta) * r)
    color.set(ring.color)
    colors.push(color.r, color.g, color.b)
  }
  for (let i = 0; i < segments; i += 1) {
    const t0 = (i / segments) * Math.PI * 2
    const t1 = ((i + 1) / segments) * Math.PI * 2
    // Grass cap, wound so its normal is +Y.
    positions.push(0, 0, 0)
    const capRadius0 = outline(t0)
    const capRadius1 = outline(t1)
    positions.push(Math.cos(t1) * capRadius1, 0, Math.sin(t1) * capRadius1)
    positions.push(Math.cos(t0) * capRadius0, 0, Math.sin(t0) * capRadius0)
    color.set(SKY_PALETTE.grass)
    for (let v = 0; v < 3; v += 1) colors.push(color.r, color.g, color.b)
    for (let r = 0; r < DISTANT_RINGS.length - 1; r += 1) {
      const top = DISTANT_RINGS[r]
      const bottom = DISTANT_RINGS[r + 1]
      if (bottom.scale === 0) {
        push(t0, top); push(t1, top); push(t0, bottom)
        continue
      }
      push(t0, top); push(t1, top); push(t1, bottom)
      push(t0, top); push(t1, bottom); push(t0, bottom)
    }
  }
  const body = new THREE.BufferGeometry()
  body.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  body.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  body.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(positions.length / 3), 1))
  body.computeVertexNormals()

  const parts: THREE.BufferGeometry[] = [body]
  const treeCount = 3 + Math.floor(random() * 4)
  for (let i = 0; i < treeCount; i += 1) {
    const theta = random() * Math.PI * 2
    const distance = outline(theta) * (0.2 + random() * 0.55)
    const height = radius * (0.28 + random() * 0.22)
    const tree = new THREE.ConeGeometry(height * 0.36, height, 6)
    tree.translate(0, height / 2, 0)
    parts.push(placed(
      facet(tree, SKY_PALETTE.foliageDeep, SKY_PALETTE.foliage),
      Math.cos(theta) * distance,
      0,
      Math.sin(theta) * distance,
    ))
  }
  return mergeFaceted(parts)
}

/* ------------------------------------------------------- floating debris */

export function createFloatingRockGeometry(radius: number, seed: number) {
  const random = createSeededRandom(seed)
  const rock = new THREE.IcosahedronGeometry(radius, 0)
  rock.scale(1.1, 0.7 + random() * 0.5, 1.05)
  const parts = [facet(rock, SKY_PALETTE.rockDeep, SKY_PALETTE.rock)]
  const cap = new THREE.IcosahedronGeometry(radius * 0.92, 0)
  cap.scale(1, 0.24, 1)
  parts.push(placed(facet(cap, SKY_PALETTE.grassDark, SKY_PALETTE.grass), 0, radius * 0.5, 0))
  return mergeFaceted(parts)
}

export function createBirdGeometry() {
  const positions = new Float32Array([
    0, 0, 0.34,
    -0.72, 0.2, -0.2,
    0, 0.02, -0.1,
    0, 0, 0.34,
    0, 0.02, -0.1,
    0.72, 0.2, -0.2,
  ])
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export { PLATE_MESH_HALF }
