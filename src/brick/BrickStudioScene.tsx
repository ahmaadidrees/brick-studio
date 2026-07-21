import { Edges, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, ConvexHullCollider, CuboidCollider, Physics, RigidBody, RoundCuboidCollider, useRapier, type RapierRigidBody } from '@react-three/rapier'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { getBuildBounds, getFrameDistance } from './bounds'
import { createBrickGeometry } from './geometry'
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
  const visual = useRef<THREE.Group>(null)
  const keys = useRef(new Set<string>())
  const yaw = useRef(Math.PI)
  const lastJump = useRef(0)
  const touchMove = useBrickStore((state) => state.touchMove)
  const touchYaw = useBrickStore((state) => state.touchYaw)
  const jumpNonce = useBrickStore((state) => state.jumpNonce)
  const setMode = useBrickStore((state) => state.setMode)
  const { world, rapier } = useRapier()
  const { camera } = useThree()
  const cameraProbe = useMemo(() => new rapier.Ball(CAMERA_PROBE_RADIUS), [rapier])
  const boomDistance = useRef<number | null>(null)

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current.add(event.key.toLowerCase())
      if (event.key === 'Escape') setMode('build')
    }
    const up = (event: KeyboardEvent) => keys.current.delete(event.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [setMode])

  useFrame((_, delta) => {
    if (!body.current) return
    yaw.current = touchYaw
    const keyboardX = Number(keys.current.has('d') || keys.current.has('arrowright')) - Number(keys.current.has('a') || keys.current.has('arrowleft'))
    const keyboardZ = Number(keys.current.has('s') || keys.current.has('arrowdown')) - Number(keys.current.has('w') || keys.current.has('arrowup'))
    const input = new THREE.Vector2(keyboardX + touchMove.x, keyboardZ + touchMove.z)
    if (input.length() > 1) input.normalize()
    const forward = new THREE.Vector3(Math.sin(yaw.current), 0, Math.cos(yaw.current))
    const right = new THREE.Vector3(forward.z, 0, -forward.x)
    const move = forward.multiplyScalar(input.y).add(right.multiplyScalar(input.x)).multiplyScalar(3.5)
    const velocity = body.current.linvel()
    body.current.setLinvel({ x: move.x, y: velocity.y, z: move.z }, true)

    if (input.lengthSq() > 0.02 && visual.current) visual.current.rotation.y = Math.atan2(move.x, move.z)
    const position = body.current.translation()
    const ray = new rapier.Ray({ x: position.x, y: position.y, z: position.z }, { x: 0, y: -1, z: 0 })
    const groundedDistance = EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS + 0.12
    const grounded = Boolean(world.castRay(ray, groundedDistance, true, undefined, undefined, undefined, body.current))
    const wantsJump = keys.current.has(' ') || jumpNonce !== lastJump.current
    if (wantsJump && grounded) {
      body.current.setLinvel({ x: move.x, y: 5, z: move.z }, true)
      keys.current.delete(' ')
      lastJump.current = jumpNonce
    }

    const target = new THREE.Vector3(position.x, position.y + 0.45, position.z)
    const desired = target.clone().add(new THREE.Vector3(-Math.sin(yaw.current) * 5.2, 3.2, -Math.cos(yaw.current) * 5.2))
    const boom = desired.clone().sub(target)
    const desiredDistance = boom.length()
    const direction = boom.normalize()
    const obstruction = world.castShape(
      target,
      { x: 0, y: 0, z: 0, w: 1 },
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
      delta,
    )
    const resolved = target.clone().addScaledVector(direction, boomDistance.current)
    if (obstruction) camera.position.copy(resolved)
    else camera.position.lerp(resolved, 1 - Math.pow(0.002, delta))
    camera.lookAt(target)
  })

  return (
    <RigidBody ref={body} colliders={false} position={[0, 2.2, 5]} enabledRotations={[false, false, false]} linearDamping={4} ccd>
      <CapsuleCollider args={[EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS]} friction={0.2} />
      <group ref={visual} position={[0, -0.3, 0]} scale={0.4}>
        <RoundedBox args={[0.58, 0.7, 0.42]} radius={0.1} smoothness={3} position={[0, 0.72, 0]} castShadow><meshStandardMaterial color="#ef6f54" /></RoundedBox>
        <RoundedBox args={[0.62, 0.58, 0.5]} radius={0.13} smoothness={3} position={[0, 1.35, 0]} castShadow><meshStandardMaterial color="#f2c37f" /></RoundedBox>
        {[-0.19, 0.19].map((x) => <RoundedBox key={x} args={[0.2, 0.52, 0.22]} radius={0.06} smoothness={2} position={[x, 0.12, 0]} castShadow><meshStandardMaterial color="#356c89" /></RoundedBox>)}
      </group>
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
    <Physics gravity={[0, -9.81, 0]} timeStep="vary">
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[gridWorldSize / 2, 0.09, gridWorldSize / 2]} position={[0, -0.09, 0]} />
        <Baseplate explore />
      </RigidBody>
      {bricks.map((brick) => <BrickCollider key={brick.id} brick={brick} />)}
      <ExplorerAvatar />
    </Physics>
  )
}

export default function BrickStudioScene() {
  const mode = useBrickStore((state) => state.mode)
  const compactRenderer = window.innerWidth < 600
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
