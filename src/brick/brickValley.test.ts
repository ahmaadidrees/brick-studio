import { describe, expect, it } from 'vitest'
import { Color } from 'three'
import type * as THREE from 'three'
import {
  CHARACTER_AUTOSTEP_HEIGHT,
  CHARACTER_AUTOSTEP_MIN_WIDTH,
  CHARACTER_GRAVITY,
  CHARACTER_JUMP_SPEED,
} from './characterController'
import { PLATE_HEIGHT } from './parts'
import {
  PLATE_HALF_EXTENT,
  VALLEY_FOG_FAR,
  VALLEY_HORIZON_COLOR,
  VALLEY_GROUND_COLLIDER_CENTRE_Y,
  VALLEY_GROUND_COLLIDER_HALF_EXTENT,
  VALLEY_GROUND_COLLIDER_THICKNESS,
  VALLEY_GROUND_Y,
  VALLEY_STAIR_RISER,
  bandForDistance,
  buildValleyBandGeometries,
  buildValleyCloudGeometry,
  buildValleyColliders,
  buildValleyGroundGeometry,
  buildValleyWaterGeometry,
  createBrickSlab,
  createRoundBrick,
  createValleyLayout,
  createValleyRng,
  distanceToPlate,
  footprintOverlapsPlate,
  hazeFactor,
  hazedColor,
  stairReach,
  valleyStairSteps,
  type ValleyBlock,
  type ValleyHill,
  type ValleyProp,
  type ValleyQuality,
} from './brickValley'

const JUMP_APEX = (CHARACTER_JUMP_SPEED * CHARACTER_JUMP_SPEED) / (2 * Math.abs(CHARACTER_GRAVITY))

function triangleCount(geometry: THREE.BufferGeometry | null) {
  if (!geometry) return 0
  const index = geometry.getIndex()
  return index ? index.count / 3 : geometry.attributes.position.count / 3
}

function boundingBox(geometry: THREE.BufferGeometry) {
  geometry.computeBoundingBox()
  return geometry.boundingBox!
}

function hills(props: ValleyProp[]) {
  return props.filter((prop): prop is ValleyHill => prop.kind === 'hill')
}

function totalTriangles(quality: ValleyQuality) {
  const layout = createValleyLayout({ quality })
  const bands = buildValleyBandGeometries(layout)
  const clouds = layout.clouds.reduce(
    (sum, cloud) => sum + triangleCount(buildValleyCloudGeometry(cloud, quality)),
    0,
  )
  return (
    triangleCount(bands.near)
    + triangleCount(bands.mid)
    + triangleCount(bands.far)
    + triangleCount(buildValleyGroundGeometry(quality))
    + triangleCount(buildValleyWaterGeometry(layout))
    + clouds
  )
}

describe('valley layout', () => {
  it('is deterministic for a seed so the diorama is the same world every visit', () => {
    const first = createValleyLayout({ quality: 'full' })
    const second = createValleyLayout({ quality: 'full' })
    expect(second.props.map((prop) => [prop.kind, prop.x, prop.z])).toEqual(
      first.props.map((prop) => [prop.kind, prop.x, prop.z]),
    )
    expect(second.clouds).toEqual(first.clouds)
  })

  it('reseeds into a different valley', () => {
    const a = createValleyLayout({ quality: 'full', seed: 1 })
    const b = createValleyLayout({ quality: 'full', seed: 2 })
    expect(a.props.map((prop) => prop.x)).not.toEqual(b.props.map((prop) => prop.x))
  })

  it('never grows anything through the build plate', () => {
    for (const quality of ['full', 'compact'] as const) {
      const layout = createValleyLayout({ quality })
      const trespassers = layout.props.filter((prop) => footprintOverlapsPlate(prop, 0))
      expect(trespassers).toEqual([])
    }
  })

  it('keeps the water inside the pond, well clear of the plate', () => {
    const layout = createValleyLayout({ quality: 'full' })
    for (const tile of layout.water) {
      expect(distanceToPlate(tile.x, tile.z)).toBeGreaterThan(tile.size)
    }
  })

  it('dresses the whole depth range rather than one ring', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const bands = new Set(layout.props.map((prop) => prop.band))
    expect(bands).toEqual(new Set(['near', 'mid', 'far']))
    const radii = layout.props.map((prop) => Math.hypot(prop.x, prop.z))
    expect(Math.min(...radii)).toBeLessThan(24)
    expect(Math.max(...radii)).toBeGreaterThan(240)
    expect(layout.props.length).toBeGreaterThanOrEqual(30)
  })

  it('hangs the clouds above the tallest thing a kid can climb', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const tallestClimb = Math.max(
      ...hills(layout.props).filter((hill) => hill.stairs).map((hill) => hill.tiers * hill.tierHeight),
    )
    for (const cloud of layout.clouds) {
      expect(cloud.y).toBeGreaterThan(tallestClimb + 12)
      expect(cloud.drift).toBeGreaterThan(0)
    }
  })
})

describe('walking the valley', () => {
  it('lays the world floor exactly one plate-height down so autostep gets you back on', () => {
    const plateTop = 0
    const step = plateTop - VALLEY_GROUND_Y
    expect(step).toBeCloseTo(PLATE_HEIGHT, 6)
    expect(step).toBeLessThan(CHARACTER_AUTOSTEP_HEIGHT)
  })

  it('spreads the ground collider past every reachable prop', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const reachable = layout.props.filter((prop) => prop.kind !== 'hill' || prop.collides)
    for (const prop of reachable) {
      expect(Math.hypot(prop.x, prop.z) + prop.footprintRadius).toBeLessThan(
        VALLEY_GROUND_COLLIDER_HALF_EXTENT,
      )
    }
  })

  it('puts the ground collider top face on the world floor, not through it', () => {
    expect(VALLEY_GROUND_COLLIDER_CENTRE_Y + VALLEY_GROUND_COLLIDER_THICKNESS).toBeCloseTo(VALLEY_GROUND_Y, 6)
    // Thick enough that the plate's own collider never pokes out of the floor.
    expect(VALLEY_GROUND_COLLIDER_THICKNESS).toBeGreaterThan(PLATE_HEIGHT)
  })

  it('builds the lookout stair out of risers autostep can take', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const stairHill = hills(layout.props).find((hill) => hill.stairs)
    expect(stairHill).toBeDefined()
    const steps = valleyStairSteps(stairHill!)
    expect(steps.length).toBeGreaterThan(4)
    expect(steps[0].height).toBeCloseTo(stairHill!.tiers * stairHill!.tierHeight, 6)
    for (let index = 1; index < steps.length; index += 1) {
      const riser = steps[index - 1].height - steps[index].height
      expect(riser).toBeGreaterThan(0)
      expect(riser).toBeLessThanOrEqual(VALLEY_STAIR_RISER + 1e-9)
      expect(riser).toBeLessThan(CHARACTER_AUTOSTEP_HEIGHT)
    }
    // The lowest step also has to be autostep-able from the meadow.
    expect(steps[steps.length - 1].height).toBeLessThan(CHARACTER_AUTOSTEP_HEIGHT)
    // Treads have to be wider than the controller's minimum autostep landing.
    const tread = steps[1].z - steps[0].z
    expect(tread).toBeGreaterThan(CHARACTER_AUTOSTEP_MIN_WIDTH)
    // Reaching further than the hill's own footprint is what makes it a ramp.
    expect(stairReach(stairHill!)).toBeGreaterThan(stairHill!.depth / 2)
  })

  it('chains the loose bricks into hops a kid can actually make', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const blocks = layout.props
      .filter((prop): prop is ValleyBlock => prop.kind === 'block')
      .sort((a, b) => a.height - b.height)
    expect(blocks.length).toBeGreaterThanOrEqual(3)
    expect(blocks[0].height).toBeLessThan(JUMP_APEX)
    for (let index = 1; index < blocks.length; index += 1) {
      expect(blocks[index].height - blocks[index - 1].height).toBeLessThan(JUMP_APEX)
    }
  })

  it('stands every collider on or above the world floor', () => {
    const colliders = buildValleyColliders(createValleyLayout({ quality: 'full' }))
    expect(colliders.length).toBeGreaterThan(20)
    for (const collider of colliders) {
      expect(collider.position[1] - collider.halfExtents[1]).toBeGreaterThanOrEqual(VALLEY_GROUND_Y - 1e-9)
    }
  })

  it('skips physics for the ridge nobody can walk to', () => {
    const layout = createValleyLayout({ quality: 'full' })
    for (const hill of hills(layout.props)) {
      expect(hill.collides).toBe(hill.band !== 'far')
    }
  })
})

describe('palette and horizon', () => {
  it('leaves the plate saturated and melts the ridge into the sky', () => {
    expect(hazeFactor(0)).toBe(0)
    expect(hazeFactor(60)).toBeGreaterThan(0)
    expect(hazeFactor(60)).toBeLessThan(hazeFactor(160))
    expect(hazeFactor(10_000)).toBeLessThan(1)
    expect(hazeFactor(10_000)).toBe(hazeFactor(240))
  })

  it('moves a colour toward the horizon as it recedes', () => {
    const horizon = new Color(VALLEY_HORIZON_COLOR)
    const gap = (distance: number) => {
      const shifted = hazedColor('#3f9f3a', distance)
      return Math.hypot(shifted.r - horizon.r, shifted.g - horizon.g, shifted.b - horizon.b)
    }
    expect(gap(0)).toBeGreaterThan(gap(90))
    expect(gap(90)).toBeGreaterThan(gap(250))
    // Never all the way: a mountain that is exactly the sky has no silhouette.
    expect(gap(250)).toBeGreaterThan(0)
  })

  it('bands by distance', () => {
    expect(bandForDistance(10)).toBe('near')
    expect(bandForDistance(80)).toBe('mid')
    expect(bandForDistance(200)).toBe('far')
  })

  it('runs the ground sheet past fog saturation in every direction', () => {
    for (const quality of ['full', 'compact'] as const) {
      const box = boundingBox(buildValleyGroundGeometry(quality))
      // A kid can wander a long way off the plate; the sheet still has to reach
      // beyond VALLEY_FOG_FAR from wherever they end up or its edge shows.
      expect(box.max.x - PLATE_HALF_EXTENT).toBeGreaterThan(VALLEY_FOG_FAR + 100)
      expect(box.max.z - PLATE_HALF_EXTENT).toBeGreaterThan(VALLEY_FOG_FAR + 100)
      expect(box.max.y).toBeCloseTo(VALLEY_GROUND_Y, 6)
    }
  })
})

describe('brick primitives', () => {
  it('caps a slab with studs on the pitch it was given', () => {
    const plain = createBrickSlab({ width: 12, depth: 8, height: 2 })
    const studded = createBrickSlab({ width: 12, depth: 8, height: 2, studPitch: 4, studSegments: 8 })
    const coarse = createBrickSlab({ width: 12, depth: 8, height: 2, studPitch: 6, studSegments: 8 })
    expect(triangleCount(plain)).toBe(12)
    // 3 x 2 studs at a pitch of 4, 2 x 1 at a pitch of 6.
    expect(triangleCount(studded)).toBeGreaterThan(triangleCount(coarse))
    const box = boundingBox(studded)
    expect(box.min.y).toBeCloseTo(0, 6)
    expect(box.max.y).toBeGreaterThan(2)
    expect(box.max.x).toBeCloseTo(6, 6)
  })

  it('rings a round brick with studs', () => {
    const bare = createRoundBrick({ radius: 2, height: 1, segments: 12 })
    const capped = createRoundBrick({ radius: 2, height: 1, segments: 12, studs: 5 })
    expect(triangleCount(capped)).toBeGreaterThan(triangleCount(bare))
    expect(boundingBox(capped).max.y).toBeGreaterThan(1)
    expect(boundingBox(bare).max.y).toBeCloseTo(1, 6)
  })

  it('gives every merged band the attributes the shared material needs', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const bands = buildValleyBandGeometries(layout)
    for (const geometry of [bands.near, bands.mid, bands.far, buildValleyGroundGeometry('full')]) {
      expect(geometry).not.toBeNull()
      expect(geometry!.getAttribute('color')).toBeTruthy()
      expect(geometry!.getAttribute('aWind')).toBeTruthy()
    }
  })

  it('only lets the wind move foliage', () => {
    const layout = createValleyLayout({ quality: 'full' })
    const bands = buildValleyBandGeometries(layout)
    const near = bands.near!.getAttribute('aWind').array as ArrayLike<number>
    expect(Array.from(near).some((value) => value > 0)).toBe(true)
    const ground = buildValleyGroundGeometry('full').getAttribute('aWind').array as ArrayLike<number>
    expect(Array.from(ground).every((value) => value === 0)).toBe(true)
    const ridge = bands.far!.getAttribute('aWind').array as ArrayLike<number>
    expect(Array.from(ridge).every((value) => value === 0)).toBe(true)
  })
})

describe('perf ladder', () => {
  it('gives the compact renderer a genuinely lighter valley', () => {
    const full = createValleyLayout({ quality: 'full' })
    const compact = createValleyLayout({ quality: 'compact' })
    expect(compact.props.length).toBeLessThan(full.props.length)
    expect(compact.clouds.length).toBeLessThan(full.clouds.length)
    expect(buildValleyColliders(compact).length).toBeLessThan(buildValleyColliders(full).length)
    expect(totalTriangles('compact')).toBeLessThan(totalTriangles('full') * 0.6)
  })

  it('still evokes the theme on the compact ladder', () => {
    const compact = createValleyLayout({ quality: 'compact' })
    const kinds = new Set(compact.props.map((prop) => prop.kind))
    expect(kinds.has('hill')).toBe(true)
    expect(kinds.has('tree')).toBe(true)
    expect(kinds.has('block')).toBe(true)
    expect(compact.clouds.length).toBeGreaterThan(0)
    expect(compact.water.length).toBeGreaterThan(0)
    const bands = new Set(compact.props.map((prop) => prop.band))
    expect(bands).toEqual(new Set(['near', 'mid', 'far']))
  })
})

describe('rng', () => {
  it('is a stable stream in the unit range', () => {
    const draw = (seed: number) => {
      const rng = createValleyRng(seed)
      return Array.from({ length: 8 }, () => rng())
    }
    const values = draw(7)
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    expect(new Set(values).size).toBe(8)
    expect(draw(7)).toEqual(values)
    expect(draw(8)).not.toEqual(values)
  })
})
