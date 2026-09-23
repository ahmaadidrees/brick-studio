import type RAPIER from '@dimforge/rapier3d-compat'
import { useFrame, useThree } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, RigidBody, RoundCuboidCollider, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import type * as THREE from 'three'
import { followCameraYaw } from '../../brick/explorePreferences'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP, EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS, PLATE_HEIGHT, brickPhysicalShapes, type PhysicalShape } from '../../brick/parts'
import { CAMERA_PROBE_RADIUS } from '../../brick/scenePhysics'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { brickIdOfNode, isArmNode } from '../model/assembly'
import { brickFrame } from '../model/grid'
import { rotateByQuat } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { buildHingeHousing, buildHingeTurntable } from '../parts/geometry'
import type { TestProp } from '../run/types'
import { WALL_CAP_COLOR, brickWallTile } from '../scene/brickWall'
import type { RapierModule } from '../sim/colliders'
import { createCameraLift, unwedgedTarget } from './cameraLift'
import { findHopOffPlacement, hopOffShapes } from './hopOff'
import { createMirrorRegistry, type MirrorWorld } from './mirrors'
import { isCurbProp } from './plateCurb'
import { setExploreCameraHandler, setExploreCameraTargetHandler, setExploreRideHandler } from './rideBridge'
import { installRideKeys } from './rideKeys'
import { yawOf } from './rideModel'
import { advanceRides, bringBackRide, footprintOf, lastAvatarPosition, liveRide, liveRides, rideAvatarFrame, rideCameraTarget, riderBodyHandle, seatOf, useExploreRideStore, type LiveRide } from './rideStore'

/**
 * Riding in Explore, the scene half (checkpoint 4). Mounted inside `ExploreScene`'s
 * `<Physics>` behind the robotics flag.
 *
 * Two physics worlds, on purpose. Each live creation runs in its own run controller
 * (`run/controller.ts`, a Rapier world of its own in My world: the creation's joints, motors
 * and wheels, with every other brick as static scenery), exactly the mechanics the stage
 * proves. The Explore world (`@react-three/rapier`) keeps the character, its controller and
 * the static bricks. Each frame, before the character moves, this layer advances the
 * controllers and mirrors every controller body into a kinematic body here that carries the
 * body's bricks as colliders (the studio's own brick shapes) and meshes. So the character
 * cannot walk through a creation and can stand beside or on it, while the creation never
 * feels the character (a kinematic character pushes nothing in either world). The meshes
 * ride the kinematic bodies, so they are interpolated exactly like the rider on the seat.
 *
 * While a creation is live the studio's static copy of its bricks is hidden
 * (`scene/hiddenBricks.ts`); unmounting (leaving Explore) disposes every controller, so
 * every creation is back where it was built.
 *
 * The mirrored bodies are found through `mirrors.ts`, by ride generation and only while the
 * Explore world still holds them: a ride that is retired, brought back to the start or ridden
 * again remounts its bodies, and a removed body must never be touched (Rapier's WASM panics and
 * the studio crashes). While a creation is ridden, the curb it drives against (the same walls as
 * in its controller's world, `plateCurb.ts`) is drawn at the plate's edge.
 */
const PART_COLLIDER_FRICTION = 0.5
const FORWARD = { x: 0, z: 1 }
const CLOCK_PRIORITY = -2
const ORIGIN: [number, number, number] = [0, 0, 0]

export default function ExploreRides() {
  const { rapier, world } = useRapier()
  const camera = useThree((state) => state.camera)
  const liveIds = useExploreRideStore((state) => state.liveIds)
  // The ridden creation while its rider is on board (riding or hopping off): its curb is drawn.
  const ridden = useExploreRideStore((state) => (state.phase !== 'walking' ? state.riding : null))
  const shapes = useMemo(() => hopOffShapes(rapier as unknown as RapierModule), [rapier])

  useEffect(() => {
    const store = useExploreRideStore.getState()
    store.enter(rapier as unknown as RapierModule)
    setExploreRideHandler(rideAvatarFrame)
    // The camera rises over a big build (a robot, parked or not) instead of closing in on the character's head.
    const cameraWorld = world as unknown as RAPIER.World
    const avatarBody = () => { const handle = riderBodyHandle(); return handle === null ? undefined : cameraWorld.getRigidBody(handle) ?? undefined }
    setExploreCameraHandler(createCameraLift(cameraWorld, new (rapier as unknown as RapierModule).Ball(CAMERA_PROBE_RADIUS), avatarBody))
    // While riding, the camera frames the robot rather than only the rider's head; walking with her head
    // wedged among parts (a wheel well), it looks from just above them.
    setExploreCameraTargetHandler(() => {
      const riding = rideCameraTarget()
      if (riding) return riding
      const avatar = lastAvatarPosition()
      return avatar ? unwedgedTarget(cameraWorld, rapier as unknown as RapierModule, { x: avatar.x, y: avatar.y + 0.52, z: avatar.z }, avatarBody()) : null
    })
    const removeKeys = installRideKeys()
    return () => {
      removeKeys()
      setExploreCameraTargetHandler(null)
      setExploreCameraHandler(null)
      setExploreRideHandler(null)
      useExploreRideStore.getState().leave()
      mirrors.clear()
    }
  }, [rapier, world])

  // Dev-only hook for the QA harnesses (scripts/qa/robotics-cp4-explore.mjs, robotics-kid-ride.mjs).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    const hook = (host.__robotics = host.__robotics ?? {})
    hook.exploreRides = { store: useExploreRideStore, debug: () => rideDebug(world as unknown as RAPIER.World, rapier as unknown as RapierModule, camera), bringBack: bringBackRide }
    return () => { delete hook.exploreRides }
  }, [world, rapier, camera])

  const lastYaw = useRef<number | null>(null)
  useFrame((_, delta) => {
    const brick = useBrickStore.getState()
    if (brick.graphicsPaused) return
    const avatarBody = (() => { const handle = riderBodyHandle(); return handle === null ? undefined : world.getRigidBody(handle) ?? undefined })()
    advanceRides(delta, {
      touchMove: brick.touchMove,
      findPlacement: (points, range) => findHopOffPlacement(world as unknown as RAPIER.World, rapier as unknown as RapierModule, points, range, shapes, avatarBody),
    })
    const rideState = useExploreRideStore.getState()
    for (const ride of liveRides()) {
      // Only this ride's own bodies, still in the world: right after a ride is (re)built its bodies
      // are not mounted yet, and the bodies of the ride it replaced are gone or going.
      const bodies = mirrors.bodies(world, ride.creationId, ride.generation)
      if (!bodies.size) continue
      // The creation being ridden is not solid in the Explore world until its rider is put down:
      // the rider sits inside it, and the follow camera's obstruction probe would otherwise stop
      // at the seat back. A parked creation is solid again (hop-off spots are outside its footprint).
      const solid = !(rideState.riding === ride.creationId && rideState.phase !== 'walking')
      for (const body of bodies.values()) setSolid(body, solid)
      if (ride.frozen) continue
      const poses = ride.controller.poses()
      for (const [bodyId, body] of bodies) {
        const pose = poses.get(bodyId)
        if (!pose) continue
        body.setNextKinematicTranslation(pose.position)
        body.setNextKinematicRotation(pose.rotation)
      }
    }
    // The follow camera swings in behind the rider as the creation drives and turns (the
    // character stands still on the seat, so its own follow rule never fires).
    const ride = rideState.phase === 'riding' && rideState.riding ? liveRide(rideState.riding) : null
    if (!ride) { lastYaw.current = null; return }
    const seat = seatOf(ride)
    const velocity = ride.controller.mechanics.bodyVelocity(ride.seatBodyId)
    const speed = velocity ? Math.hypot(velocity.x, velocity.z) : 0
    const previous = lastYaw.current
    const turning = previous === null || delta <= 0 ? 0 : Math.abs(Math.atan2(Math.sin(seat.facingYaw - previous), Math.cos(seat.facingYaw - previous))) / delta
    lastYaw.current = seat.facingYaw
    const nextYaw = followCameraYaw(brick.touchYaw, seat.facingYaw, delta, Math.max(speed, turning > 0.3 ? 1 : 0), brick.exploreCameraMode, Date.now() - brick.exploreManualLookAt, FORWARD)
    if (nextYaw !== brick.touchYaw) useBrickStore.setState({ touchYaw: nextYaw })
  }, CLOCK_PRIORITY)

  const curb = ridden ? liveRide(ridden)?.controller.props.filter(isCurbProp) ?? [] : []
  return (
    <group name="explore-rides">
      {liveIds.map((id) => <LiveCreation key={id} creationId={id} />)}
      {curb.map((prop) => <CurbWall key={prop.id} prop={prop} />)}
    </group>
  )
}

/* ------------------------------------------------------------------ mirrored bodies */

/** Per live creation and ride generation: its controller body id → the kinematic body mirroring it in the Explore world. */
const mirrors = createMirrorRegistry<RapierRigidBody>()

function setSolid(body: RapierRigidBody, solid: boolean) {
  for (let index = 0; index < body.numColliders(); index += 1) {
    const collider = body.collider(index)
    if (collider.isEnabled() !== solid) collider.setEnabled(solid)
  }
}

function LiveCreation({ creationId }: { creationId: string }) {
  const ride = liveRide(creationId)
  const byId = useMemo(() => new Map((ride?.bricks ?? []).map((brick) => [brick.id, brick])), [ride])
  if (!ride) return null
  return (
    // A new generation (a rebuilt ride of the same creation) remounts every body.
    <group key={ride.generation} name={`explore-ride:${creationId}`}>
      {ride.creation.bodies.map((body) => (
        <MirrorBody key={body.id} creationId={creationId} generation={ride.generation} bodyId={body.id}>
          {body.nodes.map((node) => {
            const brick = byId.get(brickIdOfNode(node)!)
            if (!brick) return null
            return <RideBrick key={node} brick={brick} node={node} plateSize={ride.plateSize} solid={!isArmNode(node)} />
          })}
        </MirrorBody>
      ))}
    </group>
  )
}

/**
 * One kinematic body mirroring a controller body, registered for its ride generation while it is
 * mounted. Its `<RigidBody>` creates the Rapier body in its own effect, which runs before this
 * one; its cleanup removes the body from the world, and this one's drops the registration.
 */
function MirrorBody({ creationId, generation, bodyId, children }: { creationId: string; generation: number; bodyId: string; children: ReactNode }) {
  const body = useRef<RapierRigidBody>(null)
  useEffect(() => {
    mirrors.register(creationId, generation, bodyId, body)
    return () => mirrors.unregister(creationId, generation, bodyId, body)
  }, [creationId, generation, bodyId])
  // Props stay constant: a changed rigid-body prop makes @react-three/rapier re-seat the body from its group.
  return <RigidBody ref={body} type="kinematicPosition" colliders={false} position={ORIGIN}>{children}</RigidBody>
}

const hingeGeometries = new Map<string, THREE.BufferGeometry>()
function rideGeometry(brick: BrickInstance, node: string): THREE.BufferGeometry | null {
  const part = BRICK_PART_MAP[brick.partId]
  if (!part) return null
  if (!roboticsSpec(brick.partId)?.hinge) return createBrickGeometry(part)
  const key = `${part.id}:${isArmNode(node) ? 'arm' : 'housing'}`
  let geometry = hingeGeometries.get(key)
  if (!geometry) {
    geometry = isArmNode(node) ? buildHingeTurntable(part) : buildHingeHousing(part)
    hingeGeometries.set(key, geometry)
  }
  return geometry
}

/** One brick of a live creation at its built place in its body (body-local = world at build): the Explore look, and its collider. */
function RideBrick({ brick, node, plateSize, solid }: { brick: BrickInstance; node: string; plateSize: number; solid: boolean }) {
  const geometry = rideGeometry(brick, node)
  const part = BRICK_PART_MAP[brick.partId]
  const shapes = useMemo(() => (solid && part ? brickPhysicalShapes(brick, plateSize) : []), [brick, plateSize, solid, part])
  if (!geometry || !part) return null
  const origin = brickFrame(brick, part, plateSize).origin
  return (
    <>
      {shapes.map((shape, index) => <MirrorCollider key={index} shape={shape} />)}
      <mesh geometry={geometry} position={[origin.x, origin.y, origin.z]} rotation={[0, (brick.rotation * Math.PI) / 2, 0]} castShadow receiveShadow userData={{ exploreRideBrickId: brick.id }}>
        <meshStandardMaterial color={brick.color} roughness={0.58} metalness={0.02} />
      </mesh>
    </>
  )
}

/** The studio's `PhysicalCollider`, for a mirrored body. */
function MirrorCollider({ shape }: { shape: PhysicalShape }) {
  if (shape.shape === 'convexHull') return <ConvexHullCollider args={[shape.vertices.flat()]} friction={PART_COLLIDER_FRICTION} />
  if (shape.shape === 'roundCuboid') {
    const radius = shape.borderRadius
    return <RoundCuboidCollider args={[shape.halfExtents[0] - radius, shape.halfExtents[1] - radius, shape.halfExtents[2] - radius, radius]} position={shape.center} friction={PART_COLLIDER_FRICTION} />
  }
  return <CuboidCollider args={shape.halfExtents} position={shape.center} friction={PART_COLLIDER_FRICTION} />
}

/* ------------------------------------------------------------------ the curb */

/** The curb walls mounted now (the dev hook reports them). */
const drawnCurb = new Set<string>()

/**
 * One wall of the curb, drawn like the Test plate's fence (brick pattern, darker cap). It is the
 * controller's own wall, so what the rider sees is exactly what the robot bumps into; drawn down to
 * the plate's underside so it reads as the plate's raised rim, not a wall floating beside it.
 */
function CurbWall({ prop }: { prop: Extract<TestProp, { kind: 'wall' }> }) {
  useEffect(() => {
    drawnCurb.add(prop.id)
    return () => { drawnCurb.delete(prop.id) }
  }, [prop.id])
  const bottom = prop.center.y - prop.size.y / 2 - PLATE_HEIGHT
  const top = prop.center.y + prop.size.y / 2
  const size = useMemo(() => ({ x: prop.size.x, y: top - bottom, z: prop.size.z }), [prop.size.x, prop.size.z, top, bottom])
  const texture = useMemo(() => brickWallTile(size), [size])
  return (
    <group position={[prop.center.x, (top + bottom) / 2, prop.center.z]} name={`explore-curb:${prop.id}`}>
      <mesh castShadow receiveShadow userData={{ exploreCurbId: prop.id }}>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial color="#ffffff" map={texture ?? undefined} roughness={0.85} />
      </mesh>
      <mesh position={[0, size.y / 2 + 0.03, 0]} castShadow>
        <boxGeometry args={[size.x + 0.04, 0.06, size.z + 0.04]} />
        <meshStandardMaterial color={WALL_CAP_COLOR} roughness={0.9} />
      </mesh>
    </group>
  )
}

/* ------------------------------------------------------------------ evidence */

type Point = { x: number; y: number; z: number }
const round = (value: number) => Math.round(value * 1000) / 1000
const roundPoint = (point: Point) => ({ x: round(point.x), y: round(point.y), z: round(point.z) })

/** Dev only: what the harness measures (never shipped behaviour). */
function rideDebug(world: RAPIER.World, rapier: RapierModule, camera: THREE.Camera) {
  const state = useExploreRideStore.getState()
  const avatar = lastAvatarPosition()
  const handle = riderBodyHandle()
  const avatarBody = handle === null ? undefined : world.getRigidBody(handle) ?? undefined
  // Where the follow camera is: how far from the character's head (its target), and how many colliders its lens sits inside.
  const lens = { x: camera.position.x, y: camera.position.y, z: camera.position.z }
  let cameraInside = 0
  world.intersectionsWithShape(lens, { x: 0, y: 0, z: 0, w: 1 }, new rapier.Ball(0.12), () => { cameraInside += 1; return true }, undefined, undefined, undefined, avatarBody)
  const cameraToTarget = avatar ? Math.hypot(lens.x - avatar.x, lens.y - (avatar.y + 0.52), lens.z - avatar.z) : null
  const mirrorWorld = world as unknown as MirrorWorld
  const mirrorHandles = mirrors.handles(mirrorWorld)
  let avatarOverlaps = 0
  if (avatar) {
    // A capsule a hair smaller than the character's: touching is fine, being inside is not.
    const probe = new rapier.Capsule(EXPLORER_CAPSULE_HALF_HEIGHT - 0.03, EXPLORER_CAPSULE_RADIUS - 0.03)
    world.intersectionsWithShape(avatar, { x: 0, y: 0, z: 0, w: 1 }, probe, (collider) => {
      const parent = collider.parent()
      if (parent && mirrorHandles.has(parent.handle)) avatarOverlaps += 1
      return true
    })
  }
  return {
    active: state.active,
    phase: state.phase,
    riding: state.riding,
    nearestId: state.nearestId,
    liveIds: state.liveIds,
    candidates: state.candidates,
    avatar: avatar && roundPoint(avatar),
    avatarOverlaps,
    rides: liveRides().map((ride: LiveRide) => {
      const seat = seatOf(ride)
      const footprint = footprintOf(ride)
      const velocity = ride.controller.mechanics.bodyVelocity(ride.seatBodyId)
      const pose = ride.controller.poses().get(ride.seatBodyId)
      const mirrored = mirrors.body(mirrorWorld, ride.creationId, ride.generation, ride.seatBodyId)
      return {
        creationId: ride.creationId,
        name: ride.name,
        generation: ride.generation,
        frozen: ride.frozen,
        controllerPhase: ride.controller.phase,
        program: ride.program ? { source: ride.program.source, name: ride.program.name, programId: ride.program.programId } : null,
        seat: roundPoint(seat.point),
        seatYaw: round(seat.facingYaw),
        yaw: pose ? round(yawOf(rotateByQuat(pose.rotation, { x: 0, y: 0, z: -1 }))) : null,
        chassis: pose ? roundPoint(pose.position) : null,
        mirroredChassis: mirrored ? roundPoint(mirrored.translation()) : null,
        speed: velocity ? round(Math.hypot(velocity.x, velocity.z)) : 0,
        footprint: { center: roundPoint(footprint.center), halfX: round(footprint.halfX), halfZ: round(footprint.halfZ), axisX: roundPoint(footprint.axisX) },
        hiddenBricks: ride.controller.hiddenBrickIds.size,
        mirroredBodies: mirrors.bodies(mirrorWorld, ride.creationId, ride.generation).size,
        bodies: ride.creation.bodies.length,
        curb: ride.controller.props.filter(isCurbProp).map((prop) => ({ id: prop.id, center: roundPoint(prop.center), size: roundPoint(prop.size) })),
      }
    }),
    notice: state.notice?.text ?? null,
    curbDrawn: [...drawnCurb],
    camera: roundPoint(lens),
    cameraToTarget: cameraToTarget === null ? null : round(cameraToTarget),
    cameraInside,
  }
}
