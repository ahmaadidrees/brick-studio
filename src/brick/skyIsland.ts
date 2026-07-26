import { GRID_SIZE, STUD } from './parts'

/**
 * Authored layout + geometry math for the Explore-mode "sky island" diorama.
 *
 * Everything here is pure: no three.js, no React. The mesh builders
 * (`skyIslandMesh.ts`) and the scene components (`SkyIslandWorld.tsx`) both read
 * from this module so the visual island, its collider, and the prop placements
 * can never drift apart.
 */

/** Baseplate footprint. The plate mesh is slightly wider than its collider. */
export const PLATE_COLLIDER_HALF = (GRID_SIZE * STUD) / 2
export const PLATE_MESH_HALF = (GRID_SIZE * STUD + 0.35) / 2

/**
 * The island's walkable surface sits exactly one plate-thickness below the
 * plate top so stepping off drops you 0.18 into the grass and the character
 * controller's 0.22 autostep carries you back up without a jump.
 */
export const GROUND_Y = -0.18

export const SKY_ISLAND = {
  /** Rounded-square outline: half extent and corner radius before noise. */
  half: 32,
  cornerRadius: 14,
  /** Bottom of the rock cone hanging under the grass. */
  apexY: -34,
  /** Clouds/props/islands all live inside this so nothing crosses camera far. */
  worldRadius: 164,
  skyDomeRadius: 175,
  fogNear: 62,
  fogFar: 270,
  /** Anything below this has fallen off the world and gets flown back. */
  respawnY: -46,
} as const

export const SKY_PALETTE = {
  zenith: '#12509f',
  sky: '#3f8ede',
  horizon: '#ffdcae',
  /** Fog + background: the band distant land melts into. */
  haze: '#b3d0ee',
  /** Below the horizon the atmosphere deepens, so white cloud tops read. */
  abyss: '#6a9ed6',
  sun: '#fff6dc',
  cloudLit: '#ffffff',
  cloudShade: '#6e94c8',
  /** Clouds fade toward this rather than the land haze, so depth stays blue. */
  cloudHaze: '#9cc0e8',
  grass: '#79c14b',
  grassLight: '#96d465',
  grassDark: '#4f8f34',
  grassFringe: '#3f7a2c',
  dirt: '#a97a4c',
  dirtDark: '#835a37',
  rock: '#948a7c',
  rockDark: '#6d6559',
  rockDeep: '#4b463f',
  wood: '#8b5c34',
  woodDark: '#67421f',
  foliage: '#43a338',
  foliageDeep: '#2f7d2c',
  foliageLight: '#6cc74b',
  water: '#7fd4f5',
  waterDeep: '#2f8fc9',
  foam: '#f2fbff',
  gravel: '#c9bda6',
  stone: '#b9b2a4',
  plate: '#dee2df',
  flagWarm: '#e2543b',
  flagGold: '#f2b134',
  ember: '#ff9c3f',
} as const

/* ------------------------------------------------------------------ shape */

function roundedSquareSdf(x: number, z: number, half: number, radius: number) {
  const inner = half - radius
  const qx = Math.abs(x) - inner
  const qz = Math.abs(z) - inner
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - radius
}

/** Low-frequency wobble so the rounded square reads as land, not as CAD. */
export function islandOutlineNoise(theta: number) {
  return (
    Math.sin(theta * 3 + 0.9) * 0.028
    + Math.sin(theta * 5 - 2.4) * 0.016
    + Math.sin(theta * 8 + 1.7) * 0.009
  )
}

/** Distance from the island centre to its grass edge along `theta`. */
export function islandOutlineRadius(theta: number) {
  const dx = Math.cos(theta)
  const dz = Math.sin(theta)
  let low = 0
  let high = SKY_ISLAND.half * 3
  for (let i = 0; i < 26; i += 1) {
    const mid = (low + high) / 2
    if (roundedSquareSdf(dx * mid, dz * mid, SKY_ISLAND.half, SKY_ISLAND.cornerRadius) < 0) low = mid
    else high = mid
  }
  return ((low + high) / 2) * (1 + islandOutlineNoise(theta))
}

/** Distance from the centre to the plate's square edge along `theta`. */
export function plateBoundaryRadius(theta: number) {
  const axis = Math.max(Math.abs(Math.cos(theta)), Math.abs(Math.sin(theta)))
  return PLATE_MESH_HALF / Math.max(axis, 1e-6)
}

export function islandOutlinePoints(segments: number) {
  const points: { x: number; z: number; theta: number; radius: number }[] = []
  for (let i = 0; i < segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2
    const radius = islandOutlineRadius(theta)
    points.push({ x: Math.cos(theta) * radius, z: Math.sin(theta) * radius, theta, radius })
  }
  return points
}

/**
 * Convex hull vertices for the walkable ground. The hull is pulled in a hair
 * from the visible outline and the grass lip below overhangs it, so the hull
 * edge never sticks out past the grass a player can see.
 */
export const GROUND_HULL_INSET = 0.995
export const GROUND_HULL_DEPTH = 2.6

export function islandColliderVertices(segments = 48) {
  const vertices: number[] = []
  for (const point of islandOutlinePoints(segments)) {
    vertices.push(point.x * GROUND_HULL_INSET, GROUND_Y, point.z * GROUND_HULL_INSET)
    vertices.push(point.x * GROUND_HULL_INSET * 0.94, GROUND_Y - GROUND_HULL_DEPTH, point.z * GROUND_HULL_INSET * 0.94)
  }
  return new Float32Array(vertices)
}

/* ---------------------------------------------------------------- quality */

export type SkyIslandQuality = {
  outlineSegments: number
  treeSegments: number
  cloudPuffs: { deck: number; rim: number; wisp: number; drift: number; high: number }
  mistPuffs: number
  grassTufts: number
  birds: number
  floatingRocks: number
  distantIslands: number
  shadowMapSize: number
  /** Offline Lightformer environment for the clearcoat plastic bricks. */
  useEnvironment: boolean
  useRockSpurs: boolean
}

/** Phone-class renderers keep every themed element, at a lighter weight. */
export function getSkyIslandQuality(compact: boolean): SkyIslandQuality {
  if (compact) {
    return {
      outlineSegments: 44,
      treeSegments: 6,
      cloudPuffs: { deck: 46, rim: 18, wisp: 8, drift: 12, high: 12 },
      mistPuffs: 5,
      grassTufts: 0,
      birds: 3,
      floatingRocks: 2,
      distantIslands: 3,
      shadowMapSize: 512,
      useEnvironment: false,
      useRockSpurs: false,
    }
  }
  return {
    outlineSegments: 96,
    treeSegments: 9,
    cloudPuffs: { deck: 156, rim: 62, wisp: 28, drift: 40, high: 38 },
    mistPuffs: 14,
    grassTufts: 340,
    birds: 6,
    floatingRocks: 5,
    distantIslands: 6,
    shadowMapSize: 2048,
    useEnvironment: true,
    useRockSpurs: true,
  }
}

/* --------------------------------------------------------------- rng util */

/** Mulberry32 — deterministic so every reload composes the same postcard. */
export function createSeededRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ------------------------------------------------------------- set dressing */

export type PropKind =
  | 'coniferTall'
  | 'conifer'
  | 'broadleaf'
  | 'broadleafBig'
  | 'bush'
  | 'boulder'
  | 'stones'
  | 'pier'
  | 'signpost'
  | 'campfire'
  | 'arch'
  | 'fence'
  | 'flagpole'

export type PropPlacement = {
  id: string
  kind: PropKind
  /** Bearing around the island; 90 deg is +Z, the lookout pier side. */
  angleDeg: number
  /** How far inside the grass edge the prop stands. */
  inset: number
  yawDeg?: number
  scale?: number
  /** `extra` props are dropped on compact renderers. */
  tier?: 'core' | 'extra'
}

/**
 * Hand-placed dressing. Bearings are chosen so the four plate edges each read
 * differently: a lookout pier south, a waterfall bay east, a woodland north,
 * and a ruin/camp west.
 */
export const PROP_PLACEMENTS: PropPlacement[] = [
  // South — the money shot. Pier out over the void, signpost on the approach.
  { id: 'pier', kind: 'pier', angleDeg: 90, inset: 2.2, tier: 'core' },
  { id: 'sign', kind: 'signpost', angleDeg: 84, inset: 10.6, yawDeg: 14, tier: 'core' },
  { id: 'pier-rock', kind: 'stones', angleDeg: 99, inset: 6.0, tier: 'extra' },
  { id: 'flag-se', kind: 'flagpole', angleDeg: 45, inset: 10.4, tier: 'core' },
  { id: 'flag-sw', kind: 'flagpole', angleDeg: 135, inset: 10.4, tier: 'core' },
  { id: 'flag-nw', kind: 'flagpole', angleDeg: 225, inset: 10.4, tier: 'core' },
  { id: 'flag-ne', kind: 'flagpole', angleDeg: 315, inset: 10.4, tier: 'core' },

  // South-east woodland shoulder.
  { id: 'tree-a', kind: 'coniferTall', angleDeg: 60, inset: 3.4, scale: 1.15, tier: 'core' },
  { id: 'tree-b', kind: 'conifer', angleDeg: 67, inset: 7.4, scale: 0.86, tier: 'core' },
  { id: 'tree-c', kind: 'broadleaf', angleDeg: 53, inset: 5.2, tier: 'extra' },
  { id: 'bush-a', kind: 'bush', angleDeg: 71, inset: 3.0, tier: 'extra' },
  { id: 'camp', kind: 'campfire', angleDeg: 74, inset: 8.4, tier: 'core' },

  // East — waterfall bay.
  { id: 'rock-a', kind: 'boulder', angleDeg: 32, inset: 5.6, scale: 1.2, tier: 'core' },
  { id: 'stones-a', kind: 'stones', angleDeg: 26, inset: 3.2, tier: 'core' },
  { id: 'bush-b', kind: 'bush', angleDeg: 13, inset: 4.4, tier: 'extra' },
  { id: 'rock-b', kind: 'boulder', angleDeg: 6, inset: 8.0, scale: 0.8, tier: 'extra' },

  // North-east ridge.
  { id: 'tree-d', kind: 'broadleafBig', angleDeg: 340, inset: 4.6, tier: 'core' },
  { id: 'tree-e', kind: 'conifer', angleDeg: 331, inset: 8.2, scale: 0.95, tier: 'core' },
  { id: 'stones-b', kind: 'stones', angleDeg: 348, inset: 8.6, tier: 'extra' },
  { id: 'fence-a', kind: 'fence', angleDeg: 305, inset: 3.2, tier: 'core' },
  { id: 'fence-b', kind: 'fence', angleDeg: 296, inset: 3.2, tier: 'extra' },

  // North — deep woods behind the build.
  { id: 'tree-f', kind: 'coniferTall', angleDeg: 268, inset: 4.0, scale: 1.25, tier: 'core' },
  { id: 'tree-g', kind: 'conifer', angleDeg: 259, inset: 8.6, tier: 'core' },
  { id: 'tree-h', kind: 'broadleaf', angleDeg: 277, inset: 8.0, scale: 1.1, tier: 'core' },
  { id: 'bush-c', kind: 'bush', angleDeg: 250, inset: 3.6, tier: 'extra' },
  { id: 'rock-c', kind: 'boulder', angleDeg: 285, inset: 6.4, tier: 'extra' },

  // West — the ruin.
  { id: 'arch', kind: 'arch', angleDeg: 180, inset: 6.6, tier: 'core' },
  { id: 'stones-c', kind: 'stones', angleDeg: 172, inset: 4.0, tier: 'core' },
  { id: 'tree-i', kind: 'broadleaf', angleDeg: 195, inset: 4.2, scale: 0.9, tier: 'core' },
  { id: 'bush-d', kind: 'bush', angleDeg: 165, inset: 8.2, tier: 'extra' },
  { id: 'tree-j', kind: 'coniferTall', angleDeg: 205, inset: 8.8, scale: 0.9, tier: 'extra' },
]

export type ResolvedProp = PropPlacement & {
  x: number
  z: number
  yaw: number
  scaleFactor: number
  /** Outward bearing in radians, for props that face the drop. */
  outward: number
}

/** Clearance kept between any prop and the baseplate edge. */
export const PROP_PLATE_CLEARANCE = 1.3
/** Clearance kept between any prop and the grass edge. */
export const PROP_EDGE_CLEARANCE = 1.4

export function resolvePropPlacements(quality: Pick<SkyIslandQuality, 'grassTufts'> | boolean = false) {
  const compact = typeof quality === 'boolean' ? quality : quality.grassTufts === 0
  const resolved: ResolvedProp[] = []
  for (const placement of PROP_PLACEMENTS) {
    if (compact && placement.tier === 'extra') continue
    const theta = (placement.angleDeg * Math.PI) / 180
    const edge = islandOutlineRadius(theta)
    const plate = plateBoundaryRadius(theta)
    const min = plate + PROP_PLATE_CLEARANCE
    const max = edge - PROP_EDGE_CLEARANCE
    // The pier is the one prop allowed to reach the lip; it hangs past it.
    const wanted = edge - placement.inset
    const radius = placement.kind === 'pier'
      ? Math.max(min, edge - placement.inset)
      : Math.min(Math.max(wanted, min), Math.max(max, min))
    resolved.push({
      ...placement,
      x: Math.cos(theta) * radius,
      z: Math.sin(theta) * radius,
      yaw: placement.yawDeg === undefined ? -theta + Math.PI / 2 : (placement.yawDeg * Math.PI) / 180,
      scaleFactor: placement.scale ?? 1,
      outward: theta,
    })
  }
  return resolved
}

/* ------------------------------------------------------------- waterfalls */

export type WaterfallPlacement = {
  id: string
  angleDeg: number
  topWidth: number
  bottomWidth: number
  height: number
  /** How far the falling water bows outward before it dissolves into mist. */
  bow: number
  poolInset: number
  /** Spring pool on the grass; sized independently of the narrow pour. */
  poolRadius: number
  tier?: 'core' | 'extra'
}

export const WATERFALL_PLACEMENTS: WaterfallPlacement[] = [
  { id: 'fall-east', angleDeg: 19, topWidth: 2.6, bottomWidth: 4.1, height: 19, bow: 3.4, poolInset: 5.2, poolRadius: 3.4, tier: 'core' },
  { id: 'fall-north', angleDeg: 240, topWidth: 2.0, bottomWidth: 3.2, height: 16, bow: 2.6, poolInset: 4.4, poolRadius: 2.8, tier: 'core' },
  { id: 'fall-west', angleDeg: 152, topWidth: 1.6, bottomWidth: 2.7, height: 14, bow: 2.2, poolInset: 4.0, poolRadius: 2.3, tier: 'extra' },
]

export type ResolvedWaterfall = WaterfallPlacement & {
  lipX: number
  lipZ: number
  poolX: number
  poolZ: number
  theta: number
  /** Rotation about Y that points the ribbon's local +Z out over the drop. */
  yaw: number
}

export function resolveWaterfalls(compact = false) {
  const resolved: ResolvedWaterfall[] = []
  for (const fall of WATERFALL_PLACEMENTS) {
    if (compact && fall.tier === 'extra') continue
    const theta = (fall.angleDeg * Math.PI) / 180
    const edge = islandOutlineRadius(theta)
    const poolRadius = Math.max(
      plateBoundaryRadius(theta) + PROP_PLATE_CLEARANCE,
      edge - fall.poolInset,
    )
    resolved.push({
      ...fall,
      theta,
      // Just past the grass lip's overhang so the pour is never clipped by it.
      lipX: Math.cos(theta) * (edge + 0.55),
      lipZ: Math.sin(theta) * (edge + 0.55),
      poolX: Math.cos(theta) * poolRadius,
      poolZ: Math.sin(theta) * poolRadius,
      yaw: Math.PI / 2 - theta,
    })
  }
  return resolved
}

/* ---------------------------------------------------------- distant world */

export type DistantIsland = {
  id: string
  angleDeg: number
  distance: number
  y: number
  radius: number
  seed: number
  hasFall: boolean
  tier?: 'core' | 'extra'
}

export const DISTANT_ISLANDS: DistantIsland[] = [
  { id: 'far-a', angleDeg: 104, distance: 118, y: -14, radius: 25, seed: 11, hasFall: true, tier: 'core' },
  { id: 'far-b', angleDeg: 33, distance: 150, y: 9, radius: 19, seed: 27, hasFall: true, tier: 'core' },
  { id: 'far-c', angleDeg: 214, distance: 132, y: -4, radius: 22, seed: 43, hasFall: false, tier: 'core' },
  { id: 'far-d', angleDeg: 300, distance: 152, y: 17, radius: 14, seed: 58, hasFall: false, tier: 'extra' },
  { id: 'far-e', angleDeg: 145, distance: 151, y: -20, radius: 16, seed: 71, hasFall: false, tier: 'extra' },
  { id: 'far-f', angleDeg: 355, distance: 108, y: -27, radius: 12, seed: 89, hasFall: false, tier: 'extra' },
]

export function resolveDistantIslands(count: number) {
  const ordered = [
    ...DISTANT_ISLANDS.filter((island) => island.tier !== 'extra'),
    ...DISTANT_ISLANDS.filter((island) => island.tier === 'extra'),
  ].slice(0, count)
  return ordered.map((island) => {
    const theta = (island.angleDeg * Math.PI) / 180
    return {
      ...island,
      x: Math.cos(theta) * island.distance,
      z: Math.sin(theta) * island.distance,
      yaw: -theta,
    }
  })
}

/* -------------------------------------------------------------- cloudscape */

/**
 * Every position a player camera can reach: anywhere over the island or its
 * pier, at any boom height. No cloud puff may intersect it, or the view fills
 * with white fog the moment you walk to the edge.
 */
export const PLAYER_CAMERA_VOLUME = { radius: 37, minY: -0.5, maxY: 11 }

/** Squared ellipsoid coordinate of the camera volume against one puff; > 1 is clear. */
export function puffCameraClearance(x: number, y: number, z: number, size: number, flatten: number) {
  const horizontal = Math.max(0, Math.hypot(x, z) - PLAYER_CAMERA_VOLUME.radius)
  const vertical = y < PLAYER_CAMERA_VOLUME.minY
    ? PLAYER_CAMERA_VOLUME.minY - y
    : Math.max(0, y - PLAYER_CAMERA_VOLUME.maxY)
  return (horizontal / size) ** 2 + (vertical / (size * flatten)) ** 2
}

export type CloudLayer = {
  count: number
  innerRadius: number
  outerRadius: number
  minY: number
  maxY: number
  minSize: number
  maxSize: number
  flatten: number
  seed: number
}

export type CloudField = {
  centers: Float32Array
  sizes: Float32Array
  seeds: Float32Array
  flatten: Float32Array
  count: number
}

/**
 * Puffs are emitted far-to-near around the island so the unsorted alpha quads
 * still composite roughly back-to-front from any camera near the plate.
 */
export function createCloudField(layers: CloudLayer[]): CloudField {
  type Puff = { x: number; y: number; z: number; size: number; seed: number; flatten: number; key: number }
  const puffs: Puff[] = []
  for (const layer of layers) {
    const random = createSeededRandom(layer.seed)
    // Clusters of 3-6 puffs read as one billowing cloud instead of confetti.
    let emitted = 0
    while (emitted < layer.count) {
      const angle = random() * Math.PI * 2
      const radius = layer.innerRadius + (layer.outerRadius - layer.innerRadius) * Math.sqrt(random())
      const baseX = Math.cos(angle) * radius
      const baseZ = Math.sin(angle) * radius
      const baseY = layer.minY + (layer.maxY - layer.minY) * random()
      const baseSize = layer.minSize + (layer.maxSize - layer.minSize) * random()
      const lobes = Math.min(layer.count - emitted, 3 + Math.floor(random() * 4))
      for (let lobe = 0; lobe < lobes; lobe += 1) {
        const spread = baseSize * (0.35 + random() * 0.85)
        const lobeAngle = random() * Math.PI * 2
        const size = baseSize * (0.5 + random() * 0.75)
        let x = baseX + Math.cos(lobeAngle) * spread
        let z = baseZ + Math.sin(lobeAngle) * spread * 0.8
        const y = baseY + (random() - 0.5) * baseSize * 0.4
        // Clustering must never drag a lobe inside its layer's standoff, or a
        // deck-sized puff can end up swallowing a camera stood at the rim.
        const lobeRadius = Math.hypot(x, z)
        if (lobeRadius < layer.innerRadius && lobeRadius > 1e-6) {
          const push = layer.innerRadius / lobeRadius
          x *= push
          z *= push
        }
        puffs.push({ x, y, z, size, seed: random(), flatten: layer.flatten, key: Math.hypot(x, z) })
        emitted += 1
      }
    }
  }
  puffs.sort((a, b) => b.key - a.key)
  const centers = new Float32Array(puffs.length * 3)
  const sizes = new Float32Array(puffs.length)
  const seeds = new Float32Array(puffs.length)
  const flatten = new Float32Array(puffs.length)
  puffs.forEach((puff, index) => {
    centers[index * 3] = puff.x
    centers[index * 3 + 1] = puff.y
    centers[index * 3 + 2] = puff.z
    sizes[index] = puff.size
    seeds[index] = puff.seed
    flatten[index] = puff.flatten
  })
  return { centers, sizes, seeds, flatten, count: puffs.length }
}

export function skyIslandCloudLayers(quality: SkyIslandQuality): CloudLayer[] {
  return [
    // The far sea of cloud. Big puffs, held back far enough that none of them
    // can ever swallow a camera standing at the island's rim.
    {
      count: quality.cloudPuffs.deck,
      innerRadius: 80,
      outerRadius: SKY_ISLAND.worldRadius,
      minY: -34,
      maxY: -13,
      minSize: 16,
      maxSize: 30,
      flatten: 0.58,
      seed: 1337,
    },
    // Smaller banks packed just under the rim: this is what you look down onto
    // from the lookout, so it is the layer the money shot actually depends on.
    {
      count: quality.cloudPuffs.rim,
      innerRadius: 31,
      outerRadius: 80,
      minY: -27,
      maxY: -16,
      minSize: 6,
      maxSize: 13,
      flatten: 0.62,
      seed: 24601,
    },
    // Wisps that pass across the rock spire, selling how far down it goes.
    {
      count: quality.cloudPuffs.wisp,
      innerRadius: 4,
      outerRadius: 30,
      minY: -23,
      maxY: -15,
      minSize: 3,
      maxSize: 7,
      flatten: 0.42,
      seed: 4711,
    },
    // Strays drifting past at plate height for parallax off the edge.
    {
      count: quality.cloudPuffs.drift,
      innerRadius: 66,
      outerRadius: 140,
      minY: -8,
      maxY: 9,
      minSize: 7,
      maxSize: 15,
      flatten: 0.62,
      seed: 90210,
    },
    // High cirrus so the sky is not an empty gradient overhead.
    {
      count: quality.cloudPuffs.high,
      innerRadius: 60,
      outerRadius: 155,
      minY: 34,
      maxY: 62,
      minSize: 14,
      maxSize: 30,
      flatten: 0.3,
      seed: 555,
    },
  ]
}

/* ------------------------------------------------------------ ambient life */

export type FloatingRock = { x: number; y: number; z: number; radius: number; seed: number }

export function createFloatingRocks(count: number): FloatingRock[] {
  const random = createSeededRandom(4242)
  const rocks: FloatingRock[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = (i / Math.max(count, 1)) * Math.PI * 2 + random() * 0.7
    const distance = 42 + random() * 26
    rocks.push({
      x: Math.cos(angle) * distance,
      y: -6 - random() * 12,
      z: Math.sin(angle) * distance,
      radius: 1.3 + random() * 2.4,
      seed: random(),
    })
  }
  return rocks
}

export type BirdPath = { radius: number; height: number; speed: number; phase: number; bank: number }

export function createBirdPaths(count: number): BirdPath[] {
  const random = createSeededRandom(808)
  const birds: BirdPath[] = []
  for (let i = 0; i < count; i += 1) {
    birds.push({
      radius: 48 + random() * 34,
      height: 6 + random() * 22,
      speed: 0.055 + random() * 0.05,
      phase: random() * Math.PI * 2,
      bank: 0.2 + random() * 0.35,
    })
  }
  return birds
}

/**
 * Single gate for every added ambient animation. Reduced motion parks the
 * clock at a composed frame instead of snapping shaders to zero.
 */
export const FROZEN_AMBIENT_TIME = 6.2

export function ambientTime(elapsed: number, reducedMotion: boolean) {
  return reducedMotion ? FROZEN_AMBIENT_TIME : elapsed
}
