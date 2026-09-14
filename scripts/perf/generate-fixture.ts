// Generates valid `.brickstudio.json` performance fixtures for docs/PERF-BASELINE.md.
//
//   node --import ./scripts/lib/register-ts.mjs scripts/perf/generate-fixture.ts
//   node --import ./scripts/lib/register-ts.mjs scripts/perf/generate-fixture.ts --out /tmp/fixtures --sizes 100,1000
//
// Two layouts at 250 / 500 / 1000 bricks (the shared world limit):
//   dense  three full layers of 2 x 4 bricks in a brick bond — the worst case for
//          overdraw and instancing, and a flat roof to walk on in Explore.
//   mixed  a spread-out scene: plates carrying 1 x 1 / round / cone bits, walls with
//          window, door and arch frames and sloped tops, tall 2 x 2 towers, pillars,
//          stairs and loose parts — every stock part kind, spread across the 64 x 64
//          plate with no overlaps.
//
// Placement is deterministic (seeded) so re-running reproduces the committed
// files. Every document is written, read back through parseBrickStudioDocument
// (the same path the studio's Import uses) and must validate with exactly the
// requested brick count; anything else exits non-zero.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BRICK_STUDIO_FILE_EXTENSION,
  BRICK_STUDIO_MAX_BRICKS,
  createBrickStudioDocument,
  parseBrickStudioDocument,
  type BrickStudioDocument,
} from '../../packages/brick-core/src/brickDocument.ts'
import { BrickLayoutIndex } from '../../packages/brick-core/src/brickRules.ts'
import { BRICK_COLORS, BRICK_PART_MAP, GRID_SIZE, rotatedSize } from '../../packages/brick-core/src/parts.ts'
import type { BrickInstance, EnvironmentId } from '../../packages/brick-core/src/types.ts'

type Rotation = BrickInstance['rotation']
type Layout = 'dense' | 'mixed'

const DEFAULT_SIZES = [250, 500, 1000]
const DEFAULT_OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures')
const ENVIRONMENT: EnvironmentId = 'classic'

// ---------------------------------------------------------------------------
// Deterministic randomness (mulberry32) so fixtures are reproducible.

class Random {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Integer in [min, max]. */
  int(min: number, max: number) {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  rotation(): Rotation {
    return this.int(0, 3) as Rotation
  }

  shuffle<T>(items: T[]) {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const swap = this.int(0, index)
      ;[items[index], items[swap]] = [items[swap], items[index]]
    }
    return items
  }
}

// ---------------------------------------------------------------------------
// Scene: places bricks with "gravity" on a height map and mirrors every
// placement into the real BrickLayoutIndex, so an overlap is impossible by
// construction and a generator bug fails loudly instead of producing a file.

class Scene {
  readonly bricks: BrickInstance[] = []
  private readonly top = new Uint16Array(GRID_SIZE * GRID_SIZE)
  private readonly index = new BrickLayoutIndex()
  private readonly layout: Layout
  private readonly budget: number

  constructor(layout: Layout, budget: number) {
    this.layout = layout
    this.budget = budget
  }

  get remaining() {
    return this.budget - this.bricks.length
  }

  topOf(x: number, z: number, width: number, depth: number) {
    let highest = 0
    for (let dx = 0; dx < width; dx += 1) {
      for (let dz = 0; dz < depth; dz += 1) highest = Math.max(highest, this.top[(x + dx) * GRID_SIZE + z + dz])
    }
    return highest
  }

  /** Free ground for a width x depth footprint, scanning from a random start so features spread out. */
  findGround(rng: Random, width: number, depth: number) {
    if (width > GRID_SIZE || depth > GRID_SIZE) return null
    const columns = GRID_SIZE - width + 1
    const rows = GRID_SIZE - depth + 1
    const start = rng.int(0, columns * rows - 1)
    for (let step = 0; step < columns * rows; step += 1) {
      const slot = (start + step) % (columns * rows)
      const x = slot % columns
      const z = Math.floor(slot / columns)
      if (this.topOf(x, z, width, depth) === 0) return { x, z }
    }
    return null
  }

  /** Places a part resting on whatever is below it (or at an explicit height). Returns null when the budget is spent. */
  place(partId: string, x: number, z: number, rotation: Rotation, color: string, y?: number) {
    if (this.remaining <= 0) return null
    const part = BRICK_PART_MAP[partId]
    if (!part) throw new Error(`Unknown part ${partId}`)
    const { width, depth } = rotatedSize(part, rotation)
    const restY = y ?? this.topOf(x, z, width, depth)
    const brick: BrickInstance = {
      id: `${this.layout}-${String(this.bricks.length).padStart(4, '0')}`,
      partId,
      x,
      y: restY,
      z,
      rotation,
      color,
    }
    if (!this.index.add(brick)) {
      throw new Error(`Generator bug: ${partId} at (${x}, ${restY}, ${z}) r${rotation} overlaps or leaves the plate`)
    }
    const newTop = restY + part.height
    for (let dx = 0; dx < width; dx += 1) {
      for (let dz = 0; dz < depth; dz += 1) {
        const cell = (x + dx) * GRID_SIZE + z + dz
        this.top[cell] = Math.max(this.top[cell], newTop)
      }
    }
    this.bricks.push(brick)
    return brick
  }

  groundCoverage() {
    let covered = 0
    for (const height of this.top) if (height > 0) covered += 1
    return covered / (GRID_SIZE * GRID_SIZE)
  }
}

// ---------------------------------------------------------------------------
// Dense: three layers of 2 x 4 bricks, odd layers offset like a brick bond.

function generateDense(count: number) {
  const scene = new Scene('dense', count)
  const layers = 3
  const perLayer = Math.ceil(count / layers)
  const cellsPerLayer = perLayer * 8
  const columns = Math.min(31, Math.max(1, Math.round(Math.sqrt(cellsPerLayer) / 2)))
  const rows = Math.ceil(perLayer / columns)
  if (rows * 4 + 2 > GRID_SIZE) throw new Error(`Dense layout of ${count} bricks does not fit the plate`)
  const originX = Math.floor((GRID_SIZE - columns * 2 - 1) / 2)
  const originZ = Math.floor((GRID_SIZE - rows * 4 - 2) / 2)
  for (let layer = 0; layer < layers; layer += 1) {
    const offsetX = layer % 2
    const offsetZ = layer % 2 ? 2 : 0
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        if (scene.remaining <= 0) return scene
        scene.place(
          'brick_2x4',
          originX + offsetX + column * 2,
          originZ + offsetZ + row * 4,
          0,
          BRICK_COLORS[(row + column + layer * 5) % BRICK_COLORS.length],
          layer * 3,
        )
      }
    }
  }
  return scene
}

// ---------------------------------------------------------------------------
// Mixed: a spread-out scene of small features.

type Feature = (rng: Random, scene: Scene) => boolean

const BIT_PARTS = ['brick_1x1', 'brick_1x1', 'brick_1x1', 'round_1x1', 'round_1x1', 'cone_1x1', 'brick_1x2']
const LOOSE_PARTS = [
  'brick_1x1', 'brick_1x1', 'brick_1x2', 'brick_1x3', 'brick_2x2', 'brick_2x3',
  'round_1x1', 'round_1x1', 'cone_1x1', 'slope_2x2', 'slope_2x2', 'corner_2x2', 'slope_inv_2x2',
]

function footprint(partId: string, rotation: Rotation) {
  return rotatedSize(BRICK_PART_MAP[partId], rotation)
}

/** A plate with a handful of small parts standing on it. */
const plateWithBits: Feature = (rng, scene) => {
  const partId = rng.pick(['plate_2x4', 'plate_4x6', 'plate_4x6', 'plate_6x8'])
  const rotation = rng.int(0, 1) as Rotation
  const { width, depth } = footprint(partId, rotation)
  const spot = scene.findGround(rng, width, depth)
  if (!spot) return false
  const plateColor = rng.pick(BRICK_COLORS)
  scene.place(partId, spot.x, spot.z, rotation, plateColor)
  const cells: Array<[number, number]> = []
  for (let dx = 0; dx < width; dx += 1) for (let dz = 0; dz < depth; dz += 1) cells.push([spot.x + dx, spot.z + dz])
  rng.shuffle(cells)
  const bits = rng.int(2, Math.min(8, Math.floor(cells.length / 2)))
  const used = new Set<number>()
  for (const [x, z] of cells) {
    if (used.size >= bits) break
    const bitPart = rng.pick(BIT_PARTS)
    const bitRotation = rng.rotation()
    const size = footprint(bitPart, bitRotation)
    if (x + size.width > spot.x + width || z + size.depth > spot.z + depth) continue
    let overlaps = false
    for (let dx = 0; dx < size.width; dx += 1) {
      for (let dz = 0; dz < size.depth; dz += 1) if (used.has((x + dx) * GRID_SIZE + z + dz)) overlaps = true
    }
    if (overlaps) continue
    for (let dx = 0; dx < size.width; dx += 1) for (let dz = 0; dz < size.depth; dz += 1) used.add((x + dx) * GRID_SIZE + z + dz)
    if (!scene.place(bitPart, x, z, bitRotation, rng.pick(BRICK_COLORS))) return true
  }
  return true
}

/** A wall of 2 x 4 or 1 x 4 bricks, sometimes with a window / door / arch frame, topped with slopes. */
const wall: Feature = (rng, scene) => {
  const thin = rng.next() < 0.4
  const brickPart = thin ? rng.pick(['brick_1x4', 'brick_1x6']) : rng.pick(['brick_2x4', 'brick_2x6'])
  const rotation = rng.int(0, 1) as Rotation
  const segment = footprint(brickPart, rotation)
  const segments = rng.int(2, 5)
  const courses = rng.int(1, 3)
  const width = rotation === 0 ? segment.width : segment.width * segments
  const depth = rotation === 0 ? segment.depth * segments : segment.depth
  const spot = scene.findGround(rng, width, depth)
  if (!spot) return false
  const color = rng.pick(BRICK_COLORS)
  const frameSegment = thin && courses >= 2 && rng.next() < 0.6 ? rng.int(0, segments - 1) : -1
  const framePart = courses === 3 ? rng.pick(['window_1x4', 'door_1x4', 'arch_1x4']) : 'window_1x4'
  const targetTop = courses * 3
  for (let index = 0; index < segments; index += 1) {
    const x = rotation === 0 ? spot.x : spot.x + index * segment.width
    const z = rotation === 0 ? spot.z + index * segment.depth : spot.z
    if (index === frameSegment && footprint(framePart, rotation).depth === segment.depth) {
      if (!scene.place(framePart, x, z, rotation, rng.pick(BRICK_COLORS))) return true
    }
    while (scene.topOf(x, z, segment.width, segment.depth) < targetTop) {
      if (!scene.place(brickPart, x, z, rotation, color)) return true
    }
  }
  if (!thin && rng.next() < 0.7) {
    // Sloped top: 2 x 2 slopes along the wall, facing outward.
    const slopeRotation = rotation === 0 ? (rng.next() < 0.5 ? 0 : 2) : rng.next() < 0.5 ? 1 : 3
    for (let offset = 0; offset + 2 <= (rotation === 0 ? depth : width); offset += 2) {
      const x = rotation === 0 ? spot.x : spot.x + offset
      const z = rotation === 0 ? spot.z + offset : spot.z
      if (!scene.place('slope_2x2', x, z, slopeRotation as Rotation, color)) return true
    }
  }
  return true
}

/** A tall 2 x 2 stack in two alternating colors with a cap piece. */
const tower: Feature = (rng, scene) => {
  const spot = scene.findGround(rng, 2, 2)
  if (!spot) return false
  const colors = [rng.pick(BRICK_COLORS), rng.pick(BRICK_COLORS)]
  const levels = rng.int(5, 10)
  for (let level = 0; level < levels; level += 1) {
    if (!scene.place('brick_2x2', spot.x, spot.z, 0, colors[level % 2])) return true
  }
  const cap = rng.pick(['slope_2x2', 'corner_2x2', 'plate_2x4', 'cone_1x1'])
  if (cap === 'plate_2x4') return true // would overhang; leave the tower flat
  scene.place(cap, spot.x, spot.z, rng.rotation(), rng.pick(BRICK_COLORS))
  return true
}

/** A tall pillar with a cone on top, or a short column of round bricks. */
const pillar: Feature = (rng, scene) => {
  const spot = scene.findGround(rng, 1, 1)
  if (!spot) return false
  const color = rng.pick(BRICK_COLORS)
  if (rng.next() < 0.5) {
    if (!scene.place('pillar_1x1', spot.x, spot.z, 0, color)) return true
  } else {
    for (let level = 0; level < 3; level += 1) if (!scene.place('round_1x1', spot.x, spot.z, 0, color)) return true
  }
  scene.place('cone_1x1', spot.x, spot.z, 0, rng.pick(BRICK_COLORS))
  return true
}

/** Three steps leading up to a small 2 x 3 podium. */
const stairs: Feature = (rng, scene) => {
  const rotation = rng.rotation()
  const step = footprint('stair_2x3', rotation)
  const along = rotation % 2 === 0 ? 'z' : 'x'
  const width = along === 'x' ? step.width * 2 : step.width
  const depth = along === 'z' ? step.depth * 2 : step.depth
  const spot = scene.findGround(rng, width, depth)
  if (!spot) return false
  const color = rng.pick(BRICK_COLORS)
  const podiumX = along === 'x' ? spot.x + step.width : spot.x
  const podiumZ = along === 'z' ? spot.z + step.depth : spot.z
  if (!scene.place('stair_2x3', spot.x, spot.z, rotation, color)) return true
  if (!scene.place('brick_2x3', podiumX, podiumZ, rotation, color)) return true
  scene.place('brick_2x3', podiumX, podiumZ, rotation, rng.pick(BRICK_COLORS))
  return true
}

/** One loose part on the ground. */
const loosePart: Feature = (rng, scene) => {
  const partId = rng.pick(LOOSE_PARTS)
  const rotation = rng.rotation()
  const { width, depth } = footprint(partId, rotation)
  const spot = scene.findGround(rng, width, depth)
  if (!spot) return false
  scene.place(partId, spot.x, spot.z, rotation, rng.pick(BRICK_COLORS))
  return true
}

/** A big 4 x 4 block, one or two high. */
const block: Feature = (rng, scene) => {
  const spot = scene.findGround(rng, 4, 4)
  if (!spot) return false
  const color = rng.pick(BRICK_COLORS)
  if (!scene.place('brick_4x4', spot.x, spot.z, 0, color)) return true
  if (rng.next() < 0.5) scene.place('brick_4x4', spot.x, spot.z, 0, rng.pick(BRICK_COLORS))
  return true
}

const MIXED_FEATURES: Array<{ feature: Feature; weight: number; name: string }> = [
  { feature: loosePart, weight: 34, name: 'loose' },
  { feature: wall, weight: 22, name: 'wall' },
  { feature: plateWithBits, weight: 16, name: 'plate' },
  { feature: tower, weight: 8, name: 'tower' },
  { feature: pillar, weight: 8, name: 'pillar' },
  { feature: stairs, weight: 8, name: 'stairs' },
  { feature: block, weight: 4, name: 'block' },
]

function generateMixed(count: number, seed: number) {
  const rng = new Random(seed)
  const scene = new Scene('mixed', count)
  const totalWeight = MIXED_FEATURES.reduce((sum, entry) => sum + entry.weight, 0)
  const towerCap = Math.max(3, Math.ceil(count / 80)) // "a few tall stacks"
  let towers = 0
  let stalls = 0
  while (scene.remaining > 0) {
    let roll = rng.next() * totalWeight
    let chosen = MIXED_FEATURES[0]
    for (const entry of MIXED_FEATURES) {
      roll -= entry.weight
      if (roll <= 0) {
        chosen = entry
        break
      }
    }
    if (chosen.name === 'tower') {
      if (towers >= towerCap) chosen = MIXED_FEATURES[0]
      else towers += 1
    }
    if (chosen.feature(rng, scene)) {
      stalls = 0
      continue
    }
    stalls += 1
    if (stalls > 50 && !loosePart(rng, scene)) throw new Error(`Mixed layout ran out of ground at ${scene.bricks.length} bricks`)
  }
  return scene
}

// ---------------------------------------------------------------------------

/** One brick per line: readable diffs, one third the size of pretty-printed JSON. */
function serialize(document: BrickStudioDocument) {
  const bricks = document.bricks.map((brick) => `    ${JSON.stringify(brick)}`).join(',\n')
  return [
    '{',
    `  "schemaVersion": ${document.schemaVersion},`,
    `  "partLibraryVersion": ${document.partLibraryVersion},`,
    `  "environmentId": ${JSON.stringify(document.environmentId)},`,
    `  "customParts": ${JSON.stringify(document.customParts)},`,
    '  "bricks": [',
    bricks,
    '  ]',
    '}',
    '',
  ].join('\n')
}

function describe(scene: Scene) {
  const kinds = new Map<string, number>()
  let maxY = 0
  for (const brick of scene.bricks) {
    const kind = BRICK_PART_MAP[brick.partId].kind
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    maxY = Math.max(maxY, brick.y + BRICK_PART_MAP[brick.partId].height)
  }
  const parts = new Set(scene.bricks.map((brick) => brick.partId)).size
  const kindSummary = [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} ${n}`).join(', ')
  return `${parts} part types, top ${maxY} plates, ground ${(scene.groundCoverage() * 100).toFixed(0)}% — ${kindSummary}`
}

function parseArguments(argv: string[]) {
  let outDir = DEFAULT_OUT_DIR
  let sizes = DEFAULT_SIZES
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--out') outDir = resolve(argv[++index] ?? '')
    else if (argv[index] === '--sizes') sizes = (argv[++index] ?? '').split(',').map(Number)
    else throw new Error(`Unknown argument ${argv[index]}`)
  }
  for (const size of sizes) {
    if (!Number.isInteger(size) || size < 1 || size > BRICK_STUDIO_MAX_BRICKS) {
      throw new Error(`Sizes must be whole numbers from 1 to ${BRICK_STUDIO_MAX_BRICKS}; got ${size}`)
    }
  }
  return { outDir, sizes }
}

function main() {
  const { outDir, sizes } = parseArguments(process.argv.slice(2))
  mkdirSync(outDir, { recursive: true })
  let failures = 0
  for (const layout of ['dense', 'mixed'] as const) {
    for (const size of sizes) {
      const scene = layout === 'dense' ? generateDense(size) : generateMixed(size, 20260913 + size)
      const text = serialize(createBrickStudioDocument(scene.bricks, { environmentId: ENVIRONMENT }))
      const file = join(outDir, `${layout}-${size}${BRICK_STUDIO_FILE_EXTENSION}`)
      writeFileSync(file, text)

      // Re-read through the same parser Import uses; the file on disk is what must be valid.
      const result = parseBrickStudioDocument(text)
      const problems: string[] = []
      if (!result.ok) problems.push(`${result.error.code}: ${result.error.message}`)
      else if (result.document.bricks.length !== size) problems.push(`expected ${size} bricks, got ${result.document.bricks.length}`)
      else if (result.document.environmentId !== ENVIRONMENT) problems.push(`unexpected environment ${result.document.environmentId}`)
      if (problems.length) {
        failures += 1
        console.error(`FAIL ${file}: ${problems.join('; ')}`)
        continue
      }
      console.log(`ok   ${layout}-${size}: ${scene.bricks.length} bricks, ${(text.length / 1024).toFixed(0)} KB — ${describe(scene)}`)
    }
  }
  if (failures) {
    console.error(`${failures} fixture(s) failed validation`)
    process.exit(1)
  }
  console.log(`wrote ${sizes.length * 2} fixtures to ${outDir}`)
}

main()
