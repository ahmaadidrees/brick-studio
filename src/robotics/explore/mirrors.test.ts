import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { createMirrorRegistry, inWorld } from './mirrors'

/**
 * The mirror registry against a real Rapier world, the way `ExploreRides.tsx` uses it. The crash a
 * tester hit (ride, get sent back, Ride again: "RuntimeError: unreachable", then "recursive use of an
 * object…") came from a body kept after @react-three/rapier removed it from the world: its ref is set
 * once and never cleared. These tests never call into a removed body (that would poison Rapier's
 * WASM for the rest of the file); they check the registry never hands one out.
 */
beforeAll(async () => { await RAPIER.init() })

function kinematicWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const body = () => {
    const created = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), created)
    return created
  }
  return { world, body }
}

/** What the scene does to every body it is handed each frame: all of these call into WASM. */
function touch(bodies: Iterable<RAPIER.RigidBody>) {
  for (const body of bodies) {
    for (let index = 0; index < body.numColliders(); index += 1) body.collider(index).setEnabled(true)
    body.setNextKinematicTranslation({ x: 1, y: 0, z: 0 })
    body.translation()
  }
}

describe('the mirrored bodies of a live ride', () => {
  it('a body removed from the world is never handed out, even when a new body takes its slot', () => {
    const { world, body } = kinematicWorld()
    const registry = createMirrorRegistry<RAPIER.RigidBody>()
    const chassis = { current: body() }
    const wheel = { current: body() }
    registry.register('buggy', 1, 'chassis', chassis)
    registry.register('buggy', 1, 'wheel', wheel)
    expect([...registry.bodies(world, 'buggy', 1).keys()]).toEqual(['chassis', 'wheel'])

    // The ride went back: @react-three/rapier removed the bodies, and the refs still hold them.
    const removed = chassis.current
    world.removeRigidBody(removed)
    expect(registry.body(world, 'buggy', 1, 'chassis')).toBeNull()
    expect([...registry.bodies(world, 'buggy', 1).keys()]).toEqual(['wheel'])
    // Rapier reuses the slot: a lookup by the old handle finds the NEW body, so presence alone is not enough.
    const next = body()
    expect(world.getRigidBody(removed.handle)).toBe(next)
    expect(inWorld(world, removed)).toBeNull()
    expect(inWorld(world, next)).toBe(next)
    expect(registry.body(world, 'buggy', 1, 'chassis')).toBeNull()
    world.removeRigidBody(wheel.current)
    expect(registry.bodies(world, 'buggy', 1).size).toBe(0)
    expect(registry.handles(world).size).toBe(0)
    // Whatever the registry hands out can be called into.
    touch(registry.bodies(world, 'buggy', 1).values())
  })

  it('a rebuilt ride (a new generation) never sees the old one’s bodies, and a late registration of the old one is ignored', () => {
    const { world, body } = kinematicWorld()
    const registry = createMirrorRegistry<RAPIER.RigidBody>()
    const first = { current: body() }
    registry.register('buggy', 1, 'chassis', first)
    // Ride again before React has mounted the new bodies: the frame loop asks for generation 2.
    expect(registry.bodies(world, 'buggy', 2).size).toBe(0)
    const second = { current: body() }
    registry.register('buggy', 2, 'chassis', second)
    expect(registry.body(world, 'buggy', 2, 'chassis')).toBe(second.current)
    expect(registry.body(world, 'buggy', 1, 'chassis')).toBeNull()
    // The old body's unmount (its cleanup) comes after: it must not drop the new registration.
    registry.unregister('buggy', 1, 'chassis', first)
    expect(registry.body(world, 'buggy', 2, 'chassis')).toBe(second.current)
    // An effect of the old generation that runs late does not take the entry back.
    registry.register('buggy', 1, 'chassis', first)
    expect(registry.body(world, 'buggy', 2, 'chassis')).toBe(second.current)
    touch(registry.bodies(world, 'buggy', 2).values())
  })

  it('unmounting unregisters; a body @react-three/rapier recreates under the same ref is the one found', () => {
    const { world, body } = kinematicWorld()
    const registry = createMirrorRegistry<RAPIER.RigidBody>()
    const ref: { current: RAPIER.RigidBody | null } = { current: body() }
    registry.register('buggy', 3, 'chassis', ref)
    world.removeRigidBody(ref.current!)
    ref.current = body()
    expect(registry.body(world, 'buggy', 3, 'chassis')).toBe(ref.current)
    expect(registry.handles(world)).toEqual(new Set([ref.current.handle]))
    // Another ref for the same body id (a stale component) cannot unregister it.
    registry.unregister('buggy', 3, 'chassis', { current: ref.current })
    expect(registry.body(world, 'buggy', 3, 'chassis')).toBe(ref.current)
    registry.unregister('buggy', 3, 'chassis', ref)
    expect(registry.bodies(world, 'buggy', 3).size).toBe(0)
    registry.register('buggy', 4, 'chassis', ref)
    registry.clear()
    expect(registry.handles(world).size).toBe(0)
  })
})
