import { Edges, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, ConvexHullCollider, CuboidCollider, Physics, RigidBody, RoundCuboidCollider, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BlockAvatar } from './BlockAvatar'
import { createMotionSnapshot } from './avatarMotion'
import { getBuildBounds, getFrameDistance } from './bounds'
import {
  CHARACTER_FIXED_STEP,
  CHARACTER_CONTROLLER_OFFSET,
  accumulateCharacterTranslation,
  applyKinematicCharacterStep,
  bufferCharacterJump,
  configureKinematicCharacterController,
  consumeCharacterFixedSteps,
  createCharacterMotionState,
  createCharacterStepResult,
  createFixedStepClock,
  resetCharacterFrameTranslation,
  stepCharacterMotion,
} from './characterController'
import { cameraRelativeMove, combineMoveAxes, readKeyboardMove } from './characterInput'
import { createBrickGeometry } from './geometry'
import { clampPitch, computeOrbitBoom, createOrbitState, stepOrbit } from './orbitCamera'
import {
  BRICK_PART_MAP,
  EXPLORER_CAPSULE_HALF_HEIGHT,
  EXPLORER_CAPSULE_RADIUS,
  GRID_SIZE,
  STUD,
  brickPhysicalShapes,
  brickWorldPosition,
  rotatedSize,
  type PhysicalShape,
} from './parts'
import { CAMERA_PROBE_RADIUS, CAMERA_SURFACE_PADDING, resolveCameraBoomDistance } from './scenePhysics'
import { usesCompactRenderer } from './rendererQuality'
import { draftIsValid, useBrickStore } from './store'
import type { BrickDraft, BrickInstance } from './types'

const gridWorldSize = GRID_SIZE * STUD
const PART_COLLIDER_FRICTION = 0.5

function gridDraftFromPoint(point: THREE.Vector3, y: number, draft: BrickDraft) {
  const part = BRICK_PART_MAP[draft.partId]
  const size = rotatedSize(part, draft.rotation)
  return {
    x: Math.round(point.x / STUD + GRID_SIZE / 2 - size.width / 2),
    y,
    z: Math.round(point.z / STUD + GRID_SIZE / 2 - size.depth / 2),
  }
}

function BaseplateStuds() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => new THREE.CylinderGeometry(STUD * 0.18, STUD * 0.18, 0.075, 10), [])

  useEffect(() => {
    if (!ref.current) return
    const matrix = new THREE.Matrix4()
    let index = 0
    for (let x = 0; x < GRID_SIZE; x += 1) {
      for (let z = 0; z < GRID_SIZE; z += 1) {
        matrix.makeTranslation((x + 0.5 - GRID_SIZE / 2) * STUD, 0.075, (z + 0.5 - GRID_SIZE / 2) * STUD)
        ref.current.setMatrixAt(index, matrix)
        index += 1
      }
    }
    ref.current.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <instancedMesh ref={ref} args={[geometry, undefined, GRID_SIZE * GRID_SIZE]} receiveShadow>
      <meshStandardMaterial color="#d5dce0" roughness={0.82} />
    </instancedMesh>
  )
}

function Baseplate({ explore = false }: { explore?: boolean }) {
  const draft = useBrickStore((state) => state.draft)
  const setDraftPosition = useBrickStore((state) => state.setDraftPosition)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const selectBrick = useBrickStore((state) => state.selectBrick)

  const moveDraft = (event: ThreeEvent<PointerEvent>) => {
    if (!draft || explore) return
    event.stopPropagation()
    const next = gridDraftFromPoint(event.point, 0, draft)
    setDraftPosition(next.x, next.y, next.z)
  }

  return (
    <group>
      <mesh
        position={[0, -0.09, 0]}
        receiveShadow
        onPointerMove={moveDraft}
        onClick={(event) => {
          event.stopPropagation()
          if (draft && !explore) placeDraft()
          else if (!explore) selectBrick(null)
        }}
      >
        <boxGeometry args={[gridWorldSize + 0.35, 0.18, gridWorldSize + 0.35]} />
        <meshStandardMaterial color="#e7ebed" roughness={0.9} />
      </mesh>
      {!explore && <BaseplateStuds />}
      <gridHelper args={[gridWorldSize, GRID_SIZE, '#b6c0c5', '#cbd3d6']} position={[0, 0.12, 0]} />
    </group>
  )
}

function BrickObject({ brick, explore = false }: { brick: BrickInstance; explore?: boolean }) {
  const selectedId = useBrickStore((state) => state.selectedId)
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const selectBrick = useBrickStore((state) => state.selectBrick)
  const setDraftPosition = useBrickStore((state) => state.setDraftPosition)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const part = BRICK_PART_MAP[brick.partId]
  const position = brickWorldPosition(brick)
  const geometry = useMemo(() => createBrickGeometry(part), [part])

  const moveDraft = (event: ThreeEvent<PointerEvent>) => {
    if (!draft || explore) return
    event.stopPropagation()
    const next = gridDraftFromPoint(event.point, brick.y + part.height, draft)
    setDraftPosition(next.x, next.y, next.z)
  }

  return (
    <group position={position} rotation={[0, brick.rotation * Math.PI / 2, 0]}>
      <mesh
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerMove={moveDraft}
        onClick={(event) => {
          event.stopPropagation()
          if (draft && !explore) placeDraft()
          else if (!explore) selectBrick(brick.id)
        }}
        scale={movingId === brick.id ? 0.98 : 1}
      >
        <meshStandardMaterial color={brick.color} roughness={0.58} metalness={0.02} transparent={movingId === brick.id} opacity={movingId === brick.id ? 0.3 : 1} />
        {selectedId === brick.id && !explore && <Edges scale={1.025} color="#263e4b" threshold={15} />}
      </mesh>
    </group>
  )
}

function DraftBrick() {
  const draft = useBrickStore((state) => state.draft)
  const bricks = useBrickStore((state) => state.bricks)
  const movingId = useBrickStore((state) => state.movingId)
  if (!draft) return null
  return <DraftBrickMesh draft={draft} valid={draftIsValid(draft, bricks, movingId)} />
}

function DraftBrickMesh({ draft, valid }: { draft: BrickDraft; valid: boolean }) {
  const part = BRICK_PART_MAP[draft.partId]
  const geometry = useMemo(() => createBrickGeometry(part), [part])
  const position = brickWorldPosition(draft)
  return (
    <group position={position} rotation={[0, draft.rotation * Math.PI / 2, 0]}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={valid ? draft.color : '#ef5350'} transparent opacity={0.62} roughness={0.45} depthWrite={false} />
        <Edges scale={1.02} color={valid ? '#2a8f78' : '#b5222c'} />
      </mesh>
    </group>
  )
}

function BuildCamera() {
  const controls = useRef<any>(null)
  const request = useBrickStore((state) => state.viewRequest)
  const { camera, size: viewportSize } = useThree()

  useEffect(() => {
    const { bricks, selectedId } = useBrickStore.getState()
    const target = new THREE.Vector3(0, 0, 0)
    const selected = bricks.find((brick) => brick.id === selectedId)
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const frameBounds = getBuildBounds(bricks)
    if (request.preset === 'selection' && selected) {
      const position = brickWorldPosition(selected)
      target.set(position[0], position[1] + 0.5, position[2])
    } else if (request.preset === 'home') {
      target.fromArray(frameBounds.center)
    }
    const distance = request.preset === 'selection'
      ? 6
      : request.preset === 'home'
        ? getFrameDistance(frameBounds, perspectiveCamera.fov, perspectiveCamera.aspect)
        : 24
    const homeDirection = new THREE.Vector3(14, 12, 16).normalize()
    const positions: Record<string, THREE.Vector3> = {
      top: new THREE.Vector3(target.x, distance, target.z + 0.01),
      front: new THREE.Vector3(target.x, target.y + 5, target.z + distance),
      right: new THREE.Vector3(target.x + distance, target.y + 5, target.z),
      perspective: new THREE.Vector3(target.x + 14, target.y + 12, target.z + 16),
      home: target.clone().add(homeDirection.multiplyScalar(distance)),
      selection: new THREE.Vector3(target.x + 5, target.y + 4, target.z + 6),
    }
    camera.position.copy(positions[request.preset] ?? positions.home)
    controls.current?.target.copy(target)
    controls.current?.update()
  }, [request, camera, viewportSize.width, viewportSize.height])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[0, 0, 0]}
      enableDamping
      dampingFactor={0.08}
      minDistance={3}
      maxDistance={180}
      maxPolarAngle={Math.PI / 2.02}
      mouseButtons={{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  )
}

function BuildScene() {
  const bricks = useBrickStore((state) => state.bricks)
  const selectBrick = useBrickStore((state) => state.selectBrick)
  return (
    <>
      <Baseplate />
      {bricks.map((brick) => <BrickObject key={brick.id} brick={brick} />)}
      <DraftBrick />
      <BuildCamera />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#f5f2ec" roughness={1} />
      </mesh>
      <group onClick={() => selectBrick(null)} />
    </>
  )
}

function PhysicalCollider({ shape }: { shape: PhysicalShape }) {
  if (shape.shape === 'convexHull') {
    return <ConvexHullCollider args={[shape.vertices.flat()]} friction={PART_COLLIDER_FRICTION} />
  }
  if (shape.shape === 'roundCuboid') {
    const { borderRadius } = shape
    return (
      <RoundCuboidCollider
        args={[
          shape.halfExtents[0] - borderRadius,
          shape.halfExtents[1] - borderRadius,
          shape.halfExtents[2] - borderRadius,
          borderRadius,
        ]}
        position={shape.center}
        friction={PART_COLLIDER_FRICTION}
      />
    )
  }
  return <CuboidCollider args={shape.halfExtents} position={shape.center} friction={PART_COLLIDER_FRICTION} />
}

function BrickCollider({ brick }: { brick: BrickInstance }) {
  const shapes = useMemo(() => brickPhysicalShapes(brick), [brick])
  return (
    <>
      <RigidBody type="fixed" colliders={false}>
        {shapes.map((shape, index) => <PhysicalCollider key={index} shape={shape} />)}
      </RigidBody>
      <BrickObject brick={brick} explore />
    </>
  )
}

function ExplorerAvatar() {
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const controller = useRef<KinematicCharacterController | null>(null)
  const keys = useRef(new Set<string>())
  const lastTouchJump = useRef(useBrickStore.getState().jumpNonce)
  const observedGrounded = useRef(false)
  const character = useRef(createCharacterMotionState(false))
  const characterStep = useRef(createCharacterStepResult())
  const fixedClock = useRef(createFixedStepClock())
  const keyboardMove = useRef({ x: 0, z: 0 })
  const combinedMove = useRef({ x: 0, z: 0 })
  const worldMove = useRef({ x: 0, z: 0 })
  const motionInput = useRef({ worldX: 0, worldZ: 0, running: false })
  const frameTranslation = useRef({ x: 0, y: 0, z: 0 })
  const nextPosition = useRef({ x: 0, y: 0, z: 0 })
  const motion = useRef(createMotionSnapshot({ grounded: false, facingYaw: Math.PI }))
  const orbit = useRef(createOrbitState())
  const orbitBoom = useRef(new THREE.Vector3())
  const cameraTarget = useRef(new THREE.Vector3())
  const cameraDirection = useRef(new THREE.Vector3())
  const resolvedCamera = useRef(new THREE.Vector3())
  const cameraRotation = useRef({ x: 0, y: 0, z: 0, w: 1 })
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const setMode = useBrickStore((state) => state.setMode)
  const { world, rapier } = useRapier()
  const { camera } = useThree()
  const cameraProbe = useMemo(() => new rapier.Ball(CAMERA_PROBE_RADIUS), [rapier])
  const boomDistance = useRef<number | null>(null)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', ' '].includes(key)) {
        event.preventDefault()
        keys.current.add(key)
      }
      if (key === ' ' && !event.repeat) bufferCharacterJump(character.current)
      if (event.key === 'Escape') {
        event.preventDefault()
        setMode('build')
      }
    }
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    const clearKeys = () => keys.current.clear()
    const visibility = () => { if (document.visibilityState !== 'visible') clearKeys() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clearKeys)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clearKeys)
      document.removeEventListener('visibilitychange', visibility)
      clearKeys()
    }
  }, [setMode])

  useEffect(() => {
    const nextController = configureKinematicCharacterController(
      world.createCharacterController(CHARACTER_CONTROLLER_OFFSET),
    )
    controller.current = nextController
    return () => {
      controller.current = null
      world.removeCharacterController(nextController)
    }
  }, [world])

  const advanceFixedStep = useCallback((delta: number) => {
    const result = stepCharacterMotion(
      character.current,
      motionInput.current,
      observedGrounded.current,
      delta,
      characterStep.current,
    )
    accumulateCharacterTranslation(frameTranslation.current, result)

    const snapshot = motion.current
    snapshot.grounded = result.grounded
    snapshot.horizontalSpeed = result.horizontalSpeed
    snapshot.maxSpeed = result.maxSpeed
    snapshot.verticalVelocity = result.verticalVelocity
    snapshot.facingYaw = result.facingYaw
    snapshot.acceleration = THREE.MathUtils.clamp(result.acceleration / 12, -1, 1)
    snapshot.turnSignal = THREE.MathUtils.clamp(result.turn / 6, -1, 1)
    if (result.jump) snapshot.jumpSequence += 1
    if (result.jump === 'air') snapshot.flipSequence += 1
    if (result.landed) {
      snapshot.landSequence += 1
      snapshot.impact = result.impact
    }
  }, [])

  useFrame((_, delta) => {
    if (!body.current || !collider.current || !controller.current) return
    const store = useBrickStore.getState()
    if (store.jumpNonce !== lastTouchJump.current) {
      bufferCharacterJump(character.current)
      lastTouchJump.current = store.jumpNonce
    }

    readKeyboardMove(keys.current, keyboardMove.current)
    combineMoveAxes(keyboardMove.current, store.touchMove, combinedMove.current)
    cameraRelativeMove(
      combinedMove.current.x,
      combinedMove.current.z,
      orbit.current.yaw,
      worldMove.current,
    )
    motionInput.current.worldX = worldMove.current.x
    motionInput.current.worldZ = worldMove.current.z
    motionInput.current.running = keys.current.has('shift') || store.touchRunning

    resetCharacterFrameTranslation(frameTranslation.current)
    const steps = consumeCharacterFixedSteps(fixedClock.current, delta, advanceFixedStep)
    if (steps > 0) {
      observedGrounded.current = applyKinematicCharacterStep(
        controller.current,
        collider.current,
        body.current,
        frameTranslation.current,
        nextPosition.current,
      )
    }
  }, -1)

  useFrame((_, delta) => {
    if (!body.current) return
    const store = useBrickStore.getState()
    orbit.current.targetYaw = store.touchYaw
    orbit.current.targetPitch = clampPitch(store.touchPitch)
    stepOrbit(orbit.current, delta, store.reducedMotion ? 24 : undefined)

    const position = body.current.translation()
    const target = cameraTarget.current.set(position.x, position.y + 0.52, position.z)
    const desiredDistance = 6.1
    const boom = computeOrbitBoom(orbit.current.yaw, orbit.current.pitch, desiredDistance, orbitBoom.current)
    const direction = cameraDirection.current.copy(boom).normalize()
    const obstruction = world.castShape(
      target,
      cameraRotation.current,
      direction,
      cameraProbe,
      CAMERA_SURFACE_PADDING,
      desiredDistance,
      true,
      undefined,
      undefined,
      undefined,
      body.current,
    )
    boomDistance.current = resolveCameraBoomDistance(
      boomDistance.current,
      desiredDistance,
      obstruction?.time_of_impact ?? null,
      Math.min(delta, 0.05),
    )
    const resolved = resolvedCamera.current.copy(target).addScaledVector(direction, boomDistance.current)
    camera.position.copy(resolved)
    camera.up.set(0, 1, 0)
    camera.lookAt(target)
  }, 0)

  return (
    <RigidBody
      ref={body}
      type="kinematicPosition"
      colliders={false}
      position={[0, EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS + 0.03, 5]}
      enabledRotations={[false, false, false]}
      ccd
    >
      <CapsuleCollider ref={collider} args={[EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS]} friction={0.2} />
      <BlockAvatar motion={motion} reducedMotion={reducedMotion} />
    </RigidBody>
  )
}

function PhysicsPreload() {
  const [preload, setPreload] = useState(false)

  useEffect(() => {
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(() => setPreload(true), { timeout: 1500 })
      return () => window.cancelIdleCallback(idleId)
    }
    const timeoutId = globalThis.setTimeout(() => setPreload(true), 250)
    return () => globalThis.clearTimeout(timeoutId)
  }, [])

  return preload ? <Physics paused>{null}</Physics> : null
}

function ExploreScene() {
  const bricks = useBrickStore((state) => state.bricks)
  return (
    <Physics gravity={[0, -9.81, 0]} timeStep={CHARACTER_FIXED_STEP} interpolate>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[gridWorldSize / 2, 0.09, gridWorldSize / 2]} position={[0, -0.09, 0]} />
        <Baseplate explore />
      </RigidBody>
      {bricks.map((brick) => <BrickCollider key={brick.id} brick={brick} />)}
      <ExplorerAvatar />
    </Physics>
  )
}

function readCompactRenderer() {
  return usesCompactRenderer(window.innerWidth, window.innerHeight)
}

function useCompactRenderer() {
  const [compactRenderer, setCompactRenderer] = useState(readCompactRenderer)

  useEffect(() => {
    const updateRenderer = () => setCompactRenderer(readCompactRenderer())
    window.addEventListener('resize', updateRenderer)
    window.addEventListener('orientationchange', updateRenderer)
    return () => {
      window.removeEventListener('resize', updateRenderer)
      window.removeEventListener('orientationchange', updateRenderer)
    }
  }, [])

  return compactRenderer
}

export default function BrickStudioScene() {
  const mode = useBrickStore((state) => state.mode)
  const compactRenderer = useCompactRenderer()
  return (
    <Canvas
      shadows={!compactRenderer}
      dpr={[1, compactRenderer ? 1.1 : 1.25]}
      camera={{ position: [14, 12, 16], fov: 45, near: 0.05, far: 240 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => mode === 'build' && useBrickStore.getState().selectBrick(null)}
    >
      <color attach="background" args={['#f4f2ed']} />
      <fog attach="fog" args={['#f4f2ed', 42, 90]} />
      <ambientLight intensity={1.35} />
      <hemisphereLight color="#ffffff" groundColor="#aeb8b5" intensity={1.2} />
      <directionalLight castShadow={!compactRenderer} position={[14, 22, 12]} intensity={2.3} shadow-mapSize={[compactRenderer ? 512 : 1024, compactRenderer ? 512 : 1024]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} />
      {mode === 'build'
        ? <><BuildScene /><Suspense fallback={null}><PhysicsPreload /></Suspense></>
        : <Suspense fallback={null}><ExploreScene /></Suspense>}
    </Canvas>
  )
}
