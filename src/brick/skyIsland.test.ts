import { describe, expect, it } from 'vitest'
import { CHARACTER_AUTOSTEP_HEIGHT } from './characterController'
import {
  DISTANT_ISLANDS,
  FROZEN_AMBIENT_TIME,
  GROUND_Y,
  PLATE_MESH_HALF,
  PROP_EDGE_CLEARANCE,
  PROP_PLACEMENTS,
  PROP_PLATE_CLEARANCE,
  SKY_ISLAND,
  WATERFALL_PLACEMENTS,
  ambientTime,
  createBirdPaths,
  createCloudField,
  createFloatingRocks,
  createSeededRandom,
  getSkyIslandQuality,
  islandColliderVertices,
  islandOutlineRadius,
  plateBoundaryRadius,
  puffCameraClearance,
  resolveDistantIslands,
  resolvePropPlacements,
  resolveWaterfalls,
  skyIslandCloudLayers,
} from './skyIsland'
import {
  createGrassTuftGeometry,
  createIslandMassGeometry,
  createPropColliders,
  createPropsGeometry,
} from './skyIslandMesh'

const PLATE_THICKNESS = 0.18

function sampleAngles(count = 180) {
  return Array.from({ length: count }, (_, index) => (index / count) * Math.PI * 2)
}

describe('sky island ground', () => {
  it('drops exactly one plate thickness so autostep carries you back on', () => {
    const step = 0 - GROUND_Y
    expect(step).toBeCloseTo(PLATE_THICKNESS, 6)
    expect(step).toBeLessThan(CHARACTER_AUTOSTEP_HEIGHT)
  })

  it('surrounds the whole baseplate with walkable grass', () => {
    for (const theta of sampleAngles()) {
      const edge = islandOutlineRadius(theta)
      const plate = plateBoundaryRadius(theta)
      expect(edge).toBeGreaterThan(plate + 8)
    }
  })

  it('keeps the island inside the fog/camera envelope', () => {
    for (const theta of sampleAngles()) {
      expect(islandOutlineRadius(theta)).toBeLessThan(SKY_ISLAND.worldRadius)
    }
  })

  it('builds a collider hull whose top face is the walkable surface', () => {
    const vertices = islandColliderVertices(48)
    expect(vertices.length).toBe(48 * 2 * 3)
    const topY: number[] = []
    for (let i = 0; i < vertices.length; i += 3) topY.push(vertices[i + 1])
    expect(Math.max(...topY)).toBeCloseTo(GROUND_Y, 6)
    expect(Math.min(...topY)).toBeCloseTo(GROUND_Y - 2.6, 6)
  })

  it('extends the collider past every plate corner so nothing falls through the seam', () => {
    const vertices = islandColliderVertices(96)
    let minTopRadius = Infinity
    for (let i = 0; i < vertices.length; i += 3) {
      if (vertices[i + 1] !== GROUND_Y) continue
      minTopRadius = Math.min(minTopRadius, Math.hypot(vertices[i], vertices[i + 2]))
    }
    // The plate's far corner is the worst case for hull coverage.
    expect(minTopRadius).toBeGreaterThan(Math.SQRT2 * PLATE_MESH_HALF)
  })
})

describe('set dressing layout', () => {
  it('ships enough authored pieces to read as a place', () => {
    expect(PROP_PLACEMENTS.length).toBeGreaterThanOrEqual(15)
    expect(PROP_PLACEMENTS.length).toBeLessThanOrEqual(40)
  })

  it('has unique ids', () => {
    const ids = new Set(PROP_PLACEMENTS.map((prop) => prop.id))
    expect(ids.size).toBe(PROP_PLACEMENTS.length)
  })

  it('keeps every prop off the baseplate and inside the grass edge', () => {
    for (const prop of resolvePropPlacements(false)) {
      const theta = Math.atan2(prop.z, prop.x)
      const radius = Math.hypot(prop.x, prop.z)
      expect(radius).toBeGreaterThanOrEqual(plateBoundaryRadius(theta) + PROP_PLATE_CLEARANCE - 1e-6)
      const edge = islandOutlineRadius(theta)
      // The lookout pier is the one prop allowed to hang over the drop.
      if (prop.kind === 'pier') expect(radius).toBeLessThan(edge)
      else expect(radius).toBeLessThanOrEqual(edge - PROP_EDGE_CLEARANCE + 1e-6)
    }
  })

  it('spreads dressing around all four sides of the plate', () => {
    const quadrants = new Set(
      resolvePropPlacements(false).map((prop) => Math.floor(((prop.angleDeg % 360) + 360) % 360 / 90)),
    )
    expect(quadrants.size).toBe(4)
  })

  it('drops only the extras on compact renderers', () => {
    const full = resolvePropPlacements(false)
    const compact = resolvePropPlacements(true)
    expect(compact.length).toBeGreaterThan(12)
    expect(compact.length).toBeLessThan(full.length)
    const fullIds = new Set(full.map((prop) => prop.id))
    for (const prop of compact) expect(fullIds.has(prop.id)).toBe(true)
  })

  it('gives the pier a step-free deck and rails either side', () => {
    const props = resolvePropPlacements(false)
    const pier = props.find((prop) => prop.kind === 'pier')!
    const colliders = createPropColliders([pier])
    expect(colliders).toHaveLength(3)
    const deck = colliders[0]
    const deckTop = deck.position[1] + deck.halfExtents[1]
    // Lifted just clear of the coplanar grass, far below the autostep height.
    expect(deckTop).toBeGreaterThan(GROUND_Y)
    expect(deckTop - GROUND_Y).toBeLessThan(CHARACTER_AUTOSTEP_HEIGHT / 3)
    for (const rail of colliders.slice(1)) {
      expect(rail.position[1] - rail.halfExtents[1]).toBeCloseTo(deckTop, 6)
    }
  })

  it('stands every solid collider on the ground plane', () => {
    for (const collider of createPropColliders(resolvePropPlacements(false))) {
      const bottom = collider.position[1] - collider.halfExtents[1]
      expect(bottom).toBeGreaterThanOrEqual(GROUND_Y - 0.2)
    }
  })
})

describe('waterfalls', () => {
  it('spills from the grass edge outward', () => {
    for (const fall of resolveWaterfalls(false)) {
      const lipRadius = Math.hypot(fall.lipX, fall.lipZ)
      const poolRadius = Math.hypot(fall.poolX, fall.poolZ)
      expect(lipRadius).toBeCloseTo(islandOutlineRadius(fall.theta) + 0.55, 5)
      expect(poolRadius).toBeLessThan(lipRadius)
      // The spring sits wholly on the grass — it never laps onto the baseplate.
      expect(poolRadius - fall.poolRadius).toBeGreaterThan(plateBoundaryRadius(fall.theta))
    }
  })

  it('keeps at least two falls on compact renderers', () => {
    expect(resolveWaterfalls(true).length).toBeGreaterThanOrEqual(2)
    expect(resolveWaterfalls(false).length).toBe(WATERFALL_PLACEMENTS.length)
  })
})

describe('distant world', () => {
  it('places horizon islands inside the camera envelope', () => {
    for (const island of resolveDistantIslands(DISTANT_ISLANDS.length)) {
      const distance = Math.hypot(island.x, island.z)
      expect(distance).toBeGreaterThan(SKY_ISLAND.half * 2)
      expect(distance + island.radius).toBeLessThan(SKY_ISLAND.skyDomeRadius)
    }
  })

  it('keeps the hero islands when the count is trimmed', () => {
    const trimmed = resolveDistantIslands(3)
    expect(trimmed).toHaveLength(3)
    for (const island of trimmed) expect(island.tier).not.toBe('extra')
  })
})

describe('cloudscape', () => {
  it('is deterministic and depth sorted outward-in', () => {
    const quality = getSkyIslandQuality(false)
    const first = createCloudField(skyIslandCloudLayers(quality))
    const second = createCloudField(skyIslandCloudLayers(quality))
    expect(first.count).toBeGreaterThan(200)
    expect(Array.from(first.centers)).toEqual(Array.from(second.centers))
    let previous = Infinity
    for (let i = 0; i < first.count; i += 1) {
      const distance = Math.hypot(first.centers[i * 3], first.centers[i * 3 + 2])
      expect(distance).toBeLessThanOrEqual(previous + 1e-4)
      previous = distance
    }
  })

  it('keeps the cloud deck below the island so the edge reveal reads', () => {
    const [deck] = skyIslandCloudLayers(getSkyIslandQuality(false))
    expect(deck.maxY).toBeLessThan(GROUND_Y - 10)
    expect(deck.innerRadius).toBeGreaterThan(SKY_ISLAND.half)
  })

  it('never lets a puff swallow a camera stood anywhere on the island', () => {
    for (const compact of [false, true]) {
      const field = createCloudField(skyIslandCloudLayers(getSkyIslandQuality(compact)))
      for (let i = 0; i < field.count; i += 1) {
        const clearance = puffCameraClearance(
          field.centers[i * 3],
          field.centers[i * 3 + 1],
          field.centers[i * 3 + 2],
          field.sizes[i],
          field.flatten[i],
        )
        expect(clearance).toBeGreaterThan(1)
      }
    }
  })

  it('puts cloud within sight of the rim so looking down is not empty sky', () => {
    const field = createCloudField(skyIslandCloudLayers(getSkyIslandQuality(false)))
    let nearRim = 0
    for (let i = 0; i < field.count; i += 1) {
      const radius = Math.hypot(field.centers[i * 3], field.centers[i * 3 + 2])
      if (radius < SKY_ISLAND.half * 2 && field.centers[i * 3 + 1] < GROUND_Y) nearRim += 1
    }
    expect(nearRim).toBeGreaterThan(20)
  })
})

describe('quality ladder', () => {
  const full = getSkyIslandQuality(false)
  const compact = getSkyIslandQuality(true)

  it('makes the compact tier genuinely lighter', () => {
    expect(compact.outlineSegments).toBeLessThan(full.outlineSegments)
    expect(compact.cloudPuffs.deck).toBeLessThan(full.cloudPuffs.deck)
    expect(compact.grassTufts).toBeLessThan(full.grassTufts)
    expect(compact.shadowMapSize).toBeLessThan(full.shadowMapSize)
    expect(compact.useEnvironment).toBe(false)
    expect(compact.useRockSpurs).toBe(false)
  })

  it('still evokes the theme on compact: clouds, islands and life survive', () => {
    expect(compact.cloudPuffs.deck).toBeGreaterThan(0)
    expect(compact.cloudPuffs.drift).toBeGreaterThan(0)
    expect(compact.cloudPuffs.high).toBeGreaterThan(0)
    expect(compact.distantIslands).toBeGreaterThanOrEqual(2)
    expect(compact.birds).toBeGreaterThan(0)
    expect(compact.floatingRocks).toBeGreaterThan(0)
    expect(compact.mistPuffs).toBeGreaterThan(0)
  })
})

describe('ambient motion gating', () => {
  it('parks every added animation on a composed frame under reduced motion', () => {
    expect(ambientTime(12.5, true)).toBe(FROZEN_AMBIENT_TIME)
    expect(ambientTime(19.75, true)).toBe(ambientTime(3.25, true))
    expect(ambientTime(12.5, false)).toBe(12.5)
  })

  it('seeds ambient life deterministically', () => {
    expect(createFloatingRocks(4)).toEqual(createFloatingRocks(4))
    expect(createBirdPaths(5)).toEqual(createBirdPaths(5))
    const random = createSeededRandom(7)
    const values = [random(), random(), random()]
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
    const replay = createSeededRandom(7)
    expect([replay(), replay(), replay()]).toEqual(values)
  })
})

describe('generated meshes', () => {
  it('builds the island mass with grass on top and rock at the apex', () => {
    const geometry = createIslandMassGeometry(24, true)
    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    expect(box.max.y).toBeCloseTo(GROUND_Y, 5)
    expect(box.min.y).toBeLessThanOrEqual(SKY_ISLAND.apexY)
    expect(geometry.getAttribute('color')).toBeTruthy()
    expect(geometry.getAttribute('aSway')).toBeTruthy()
    geometry.dispose()
  })

  it('merges all dressing into one sway-tagged mesh that sits on the ground', () => {
    const geometry = createPropsGeometry(resolvePropPlacements(false), 8)
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.min.y).toBeGreaterThan(GROUND_Y - 7)
    const sway = geometry.getAttribute('aSway')
    let moving = 0
    for (let i = 0; i < sway.count; i += 1) if (sway.getX(i) > 0) moving += 1
    expect(moving).toBeGreaterThan(0)
    geometry.dispose()
  })

  it('scatters grass only in the band between the plate and the edge', () => {
    const geometry = createGrassTuftGeometry(40)!
    const position = geometry.getAttribute('position')
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i)
      const z = position.getZ(i)
      const theta = Math.atan2(z, x)
      const radius = Math.hypot(x, z)
      expect(radius).toBeGreaterThan(plateBoundaryRadius(theta))
      expect(radius).toBeLessThan(islandOutlineRadius(theta))
    }
    geometry.dispose()
    expect(createGrassTuftGeometry(0)).toBeNull()
  })
})
