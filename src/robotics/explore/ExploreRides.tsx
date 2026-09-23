import type RAPIER from '@dimforge/rapier3d-compat'
import { useFrame } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, RigidBody, RoundCuboidCollider, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { followCameraYaw } from '../../brick/explorePreferences'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP, EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS, brickPhysicalShapes, type PhysicalShape } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { brickIdOfNode, isArmNode } from '../model/assembly'
import { brickFrame } from '../model/grid'
import { rotateByQuat } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { buildHingeHousing, buildHingeTurntable } from '../parts/geometry'
import type { RapierModule } from '../sim/colliders'
import { findHopOffPlacement, hopOffShapes } from './hopOff'
import { setExploreRideHandler } from './rideBridge'
import { installRideKeys } from './rideKeys'
import { yawOf } from './rideModel'
import { advanceRides, footprintOf, lastAvatarPosition, liveRide, liveRides, rideAvatarFrame, riderBodyHandle, seatOf, useExploreRideStore, type LiveRide } from './rideStore'

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
 */
const PART_COLLIDER_FRICTION = 0.5
const FORWARD = { x: 0, z: 1 }
const CLOCK_PRIORITY = -2
const ORIGIN: [number, number, number] = [0, 0, 0]

export default function ExploreRides() {
  const { rapier, world } = useRapier()
  const liveIds = useExploreRideStore((state) => state.liveIds)
  const shapes = useMemo(() => hopOffShapes(rapier as unknown as RapierModule), [rapier])

  useEffect(() => {
    const store = useExploreRideStore.getState()
    store.enter(rapier as unknown as RapierModule)
    setExploreRideHandler(rideAvatarFrame)
    const removeKeys = installRideKeys()
    return () => {
      removeKeys()
      setExploreRideHandler(null)
      useExploreRideStore.getState().leave()
    }
  }, [rapier])

  // Dev-only hook for the QA harness (scripts/qa/robotics-cp4-explore.mjs).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    const hook = (host.__robotics = host.__robotics ?? {})
    hook.exploreRides = { store: useExploreRideStore, debug: () => rideDebug(world as unknown as RAPIER.World, rapier as unknown as RapierModule) }
    return () => { delete hook.exploreRides }
  }, [world, rapier])

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
      const bodies = mirrors.get(ride.creationId)
      if (!bodies) continue
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

  return (
    <group name="explore-rides">
      {liveIds.map((id) => <LiveCreation key={id} creationId={id} />)}
    </group>
  )
}

/* ------------------------------------------------------------------ mirrored bodies */

/** Per live creation: its controller body id → the kinematic body mirroring it in the Explore world. */
const mirrors = new Map<string, Map<string, RapierRigidBody>>()

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
  const register = (bodyId: string) => (body: RapierRigidBody | null) => {
    let bodies = mirrors.get(creationId)
    if (!bodies) { bodies = new Map(); mirrors.set(creationId, bodies) }
    if (body) bodies.set(bodyId, body)
    else bodies.delete(bodyId)
  }
  return (
    <group key={ride.generation} name={`explore-ride:${creationId}`}>
      {ride.creation.bodies.map((body) => (
        // Props stay constant: a changed rigid-body prop makes @react-three/rapier re-seat the body from its group.
        <RigidBody key={body.id} ref={register(body.id)} type="kinematicPosition" colliders={false} position={ORIGIN}>
          {body.nodes.map((node) => {
            const brick = byId.get(brickIdOfNode(node)!)
            if (!brick) return null
            return <RideBrick key={node} brick={brick} node={node} plateSize={ride.plateSize} solid={!isArmNode(node)} />
          })}
        </RigidBody>
      ))}
    </group>
  )
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

/* ------------------------------------------------------------------ evidence */

type Point = { x: number; y: number; z: number }
const round = (value: number) => Math.round(value * 1000) / 1000
const roundPoint = (point: Point) => ({ x: round(point.x), y: round(point.y), z: round(point.z) })

/** Dev only: what the harness measures (never shipped behaviour). */
function rideDebug(world: RAPIER.World, rapier: RapierModule) {
  const state = useExploreRideStore.getState()
  const avatar = lastAvatarPosition()
  const mirrorHandles = new Set<number>()
  for (const bodies of mirrors.values()) for (const body of bodies.values()) mirrorHandles.add(body.handle)
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
      const mirrored = mirrors.get(ride.creationId)?.get(ride.seatBodyId)
      return {
        creationId: ride.creationId,
        name: ride.name,
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
        mirroredBodies: mirrors.get(ride.creationId)?.size ?? 0,
        bodies: ride.creation.bodies.length,
      }
    }),
  }
}
