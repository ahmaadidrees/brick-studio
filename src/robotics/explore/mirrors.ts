/**
 * The kinematic bodies that mirror a live creation's controller bodies in the Explore world
 * (`ExploreRides.tsx`), kept per creation and per ride generation.
 *
 * Why it is careful: `@react-three/rapier` (2.2) hands a `<RigidBody>` ref its body once, when it
 * creates it, and never clears it when the component unmounts and the body leaves the world. A body
 * kept past that point is a dangling handle: the first call into it (`numColliders`,
 * `setNextKinematicTranslation`, `translation`…) panics Rapier's WASM (`RuntimeError: unreachable`)
 * and every later call throws ("recursive use of an object detected…"), so the studio crashes. A
 * ride that is retired, ridden again or brought back to the start remounts its bodies under a new
 * generation while the frame loop keeps running, so nothing here trusts what it holds:
 *
 * 1. every entry belongs to one ride generation, and a lookup for another generation finds nothing;
 * 2. the component that registers a body unregisters it when it unmounts (it registers its ref
 *    object, so a body @react-three/rapier recreates under the same component is still the one found);
 * 3. a body is handed out only while the world still holds that very body
 *    (`world.getRigidBody(handle) === body`: a JavaScript map lookup, never a call into WASM).
 */
export type MirrorWorld = { getRigidBody(handle: number): unknown }
export type MirrorBodyRef<Body> = { readonly current: Body | null | undefined }
type Handled = { readonly handle: number }

export type MirrorRegistry<Body extends Handled> = {
  /** A mounted body of `creationId`'s ride `generation`. A registration for an older generation than the one held is ignored. */
  register(creationId: string, generation: number, bodyId: string, ref: MirrorBodyRef<Body>): void
  /** The same body unmounting; only its own registration is removed. */
  unregister(creationId: string, generation: number, bodyId: string, ref: MirrorBodyRef<Body>): void
  /** The bodies of this very ride generation that the world still holds, by controller body id. */
  bodies(world: MirrorWorld, creationId: string, generation: number): Map<string, Body>
  /** One of them, or null. */
  body(world: MirrorWorld, creationId: string, generation: number, bodyId: string): Body | null
  /** Handles of every registered body the world still holds. */
  handles(world: MirrorWorld): Set<number>
  clear(): void
}

/** The body, while the world still holds this very object (a removed body's slot may hold another one). */
export function inWorld<Body extends Handled>(world: MirrorWorld, body: Body | null | undefined): Body | null {
  return body && world.getRigidBody(body.handle) === body ? body : null
}

export function createMirrorRegistry<Body extends Handled>(): MirrorRegistry<Body> {
  const entries = new Map<string, { generation: number; refs: Map<string, MirrorBodyRef<Body>> }>()
  return {
    register(creationId, generation, bodyId, ref) {
      const entry = entries.get(creationId)
      if (entry && entry.generation > generation) return
      if (!entry || entry.generation < generation) entries.set(creationId, { generation, refs: new Map([[bodyId, ref]]) })
      else entry.refs.set(bodyId, ref)
    },
    unregister(creationId, generation, bodyId, ref) {
      const entry = entries.get(creationId)
      if (!entry || entry.generation !== generation || entry.refs.get(bodyId) !== ref) return
      entry.refs.delete(bodyId)
      if (!entry.refs.size) entries.delete(creationId)
    },
    bodies(world, creationId, generation) {
      const found = new Map<string, Body>()
      const entry = entries.get(creationId)
      if (!entry || entry.generation !== generation) return found
      for (const [bodyId, ref] of entry.refs) {
        const body = inWorld(world, ref.current)
        if (body) found.set(bodyId, body)
      }
      return found
    },
    body(world, creationId, generation, bodyId) {
      const entry = entries.get(creationId)
      return entry && entry.generation === generation ? inWorld(world, entry.refs.get(bodyId)?.current) : null
    },
    handles(world) {
      const handles = new Set<number>()
      for (const entry of entries.values()) for (const ref of entry.refs.values()) {
        const body = inWorld(world, ref.current)
        if (body) handles.add(body.handle)
      }
      return handles
    },
    clear() {
      entries.clear()
    },
  }
}
