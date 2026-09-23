import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS, STUD } from '../../brick/parts'
import type { RapierModule } from '../sim/colliders'
import { findHopOffPlacement, groundUnder, hopOffShapes } from './hopOff'
import { RIDER_STANDING_Y, footprintInWorld, hopOffPoints } from './rideModel'

/**
 * Hop-off placement against a real Rapier world laid out like Explore: a plate whose top is
 * y = 0, a parked creation (a kinematic box), and whatever stands around it.
 */
beforeAll(async () => { await RAPIER.init() })

const rapier = RAPIER as unknown as RapierModule
const PLATE_HALF = 20
/** A 4 × 3 × 6 unit creation centred at the origin, facing -Z. */
const CREATION = { min: { x: -2, y: 0, z: -3 }, max: { x: 2, y: 1.5, z: 3 } }
const IDENTITY = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }
/** The seat's pan is 1.2 units up: step down or across, never up onto a wall top. */
const RANGE = { fromY: 4, minGround: -3, maxGround: 1.2 }

function world(extra: (world: RAPIER.World) => void = () => {}) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const ground = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  w.createCollider(RAPIER.ColliderDesc.cuboid(PLATE_HALF, 0.09, PLATE_HALF).setTranslation(0, -0.09, 0), ground)
  const creation = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
  w.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.75, 3).setTranslation(0, 0.75, 0), creation)
  extra(w)
  // Scene queries see the world as of the last step.
  w.step()
  return w
}

const overlaps = (w: RAPIER.World, at: { x: number; y: number; z: number }) => {
  let hits = 0
  w.intersectionsWithShape(at, { x: 0, y: 0, z: 0, w: 1 }, new RAPIER.Capsule(EXPLORER_CAPSULE_HALF_HEIGHT - 0.01, EXPLORER_CAPSULE_RADIUS - 0.01), () => { hits += 1; return true })
  return hits
}

describe('hopping off onto free ground', () => {
  const footprint = footprintInWorld(CREATION, IDENTITY)
  const points = hopOffPoints(footprint, { x: 0, y: 0, z: -1 })

  it('beside the seat on the rider’s left when that is free, standing on the plate', () => {
    const w = world()
    const spot = findHopOffPlacement(w, rapier, points, RANGE, hopOffShapes(rapier))!
    expect(spot.x).toBeLessThan(-2 - EXPLORER_CAPSULE_RADIUS)
    expect(spot.z).toBeCloseTo(0, 6)
    expect(spot.y).toBeCloseTo(RIDER_STANDING_Y, 3)
    expect(overlaps(w, spot)).toBe(0)
    w.free()
  })

  it('a wall on the left: the right side instead', () => {
    const w = world((w) => {
      const wall = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 1.5, 6).setTranslation(-2.6, 1.5, 0), wall)
    })
    const spot = findHopOffPlacement(w, rapier, points, RANGE, hopOffShapes(rapier))!
    expect(spot.x).toBeGreaterThan(2 + EXPLORER_CAPSULE_RADIUS)
    expect(overlaps(w, spot)).toBe(0)
    w.free()
  })

  it('a low step beside the creation is stood on, not stood in', () => {
    const w = world((w) => {
      const step = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
      w.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.18, 4).setTranslation(-3.2, 0.18, 0), step)
    })
    const spot = findHopOffPlacement(w, rapier, points, RANGE, hopOffShapes(rapier))!
    expect(spot.x).toBeLessThan(-2)
    expect(spot.y).toBeCloseTo(0.36 + RIDER_STANDING_Y, 3)
    expect(overlaps(w, spot)).toBe(0)
    w.free()
  })

  it('walled in on every side near the creation: a further ring; nowhere at all: null', () => {
    const boxed = world((w) => {
      const walls = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
      // A ring of walls hugging the creation, one stud out, taller than the character.
      w.createCollider(RAPIER.ColliderDesc.cuboid(4, 2, 0.2).setTranslation(0, 2, 3.8), walls)
      w.createCollider(RAPIER.ColliderDesc.cuboid(4, 2, 0.2).setTranslation(0, 2, -3.8), walls)
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 2, 4).setTranslation(2.8, 2, 0), walls)
      w.createCollider(RAPIER.ColliderDesc.cuboid(0.2, 2, 4).setTranslation(-2.8, 2, 0), walls)
    })
    const spot = findHopOffPlacement(boxed, rapier, points, RANGE, hopOffShapes(rapier))
    expect(spot).not.toBeNull()
    expect(Math.max(Math.abs(spot!.x) - 2, Math.abs(spot!.z) - 3)).toBeGreaterThan(1 * STUD)
    expect(overlaps(boxed, spot!)).toBe(0)
    boxed.free()

    // Off the plate there is no ground to stand on.
    const far = footprintInWorld(CREATION, { position: { x: 100, y: 0, z: 100 }, rotation: IDENTITY.rotation })
    const w = world()
    expect(findHopOffPlacement(w, rapier, hopOffPoints(far, { x: 0, y: 0, z: -1 }), RANGE, hopOffShapes(rapier))).toBeNull()
    expect(groundUnder(w, rapier, 100, 100, 4)).toBeNull()
    expect(groundUnder(w, rapier, 5, 5, 4)).toBeCloseTo(0, 3)
    w.free()
  })
})
