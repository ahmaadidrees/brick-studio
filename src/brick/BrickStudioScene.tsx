import { Edges, OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, ConvexHullCollider, CuboidCollider, Physics, RigidBody, RoundCuboidCollider, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier'
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { BlockAvatar } from './BlockAvatar'
import { createMotionSnapshot } from './avatarMotion'
import { getBuildBounds } from './bounds'
import {
  clampBuildCameraTarget,
  createBuildFramePose,
  getBuildCameraLimits,
} from './buildCamera'
import {
  MOUSE_CLICK_DRAG_THRESHOLD,
  beginBuildPointer,
  beginPointerTravel,
  cancelBuildPointer,
  createBuildGestureState,
  createPointerTravel,
  endPointerTravel,
  finishBuildPointer,
  interruptBuildPointers,
  isConfirmationPlacementPointer,
  pointerTravelExceeds,
  resetBuildPointers,
  shouldSuppressBuildTouchClick,
  takeBuildPointerCompletion,
  updateBuildPointer,
  updatePointerTravel,
  type BuildGestureState,
  type PointerTravel,
} from './buildInput'
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
import {
  beginMarqueeGesture,
  finishMarqueeGesture,
  selectBricksInMarquee,
  shouldCaptureSelectionGesture,
  updateMarqueeGesture,
  type MarqueeGesture,
} from './marqueeSelection'
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
  supportHeightForFootprint,
  type PhysicalShape,
} from './parts'
import { CAMERA_PROBE_RADIUS, CAMERA_SURFACE_PADDING, resolveCameraBoomDistance } from './scenePhysics'
import { usesCompactRenderer } from './rendererQuality'
import { playPlaceClick } from './soundFeedback'
import { draftIsValid, useBrickStore } from './store'
import type { BrickDraft, BrickInstance } from './types'

const gridWorldSize = GRID_SIZE * STUD
const PART_COLLIDER_FRICTION = 0.5
const HOVER_GLOW_INTENSITY = 0.16
const PLACE_POP_START_SCALE = 0.86
const PLACE_POP_DURATION = 0.15
const BLOCKED_SHAKE_DURATION = 0.22
const BLOCKED_SHAKE_AMPLITUDE = STUD * 0.16

function gridDraftFromPoint(point: THREE.Vector3, y: number, draft: BrickDraft) {
  const part = BRICK_PART_MAP[draft.partId]
  const size = rotatedSize(part, draft.rotation)
  return {
    x: Math.round(point.x / STUD + GRID_SIZE / 2 - size.width / 2),
    y,
    z: Math.round(point.z / STUD + GRID_SIZE / 2 - size.depth / 2),
  }
}

/** Grid position with y resting on the tallest brick under the ghost footprint. */
function supportedDraftFromPoint(point: THREE.Vector3, draft: BrickDraft) {
  const next = gridDraftFromPoint(point, 0, draft)
  const size = rotatedSize(BRICK_PART_MAP[draft.partId], draft.rotation)
  next.y = supportHeightForFootprint(useBrickStore.getState().bricks, next.x, next.z, size.width, size.depth)
  return next
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

type CameraGestureFlag = { current: boolean }

function Baseplate({ explore = false, buildGesture, cameraActive }: { explore?: boolean; buildGesture?: BuildGestureState; cameraActive?: CameraGestureFlag }) {
  const draft = useBrickStore((state) => state.draft)
  const setDraftPosition = useBrickStore((state) => state.setDraftPosition)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const selectBrick = useBrickStore((state) => state.selectBrick)

  const moveDraft = (event: ThreeEvent<PointerEvent>) => {
    if (!draft || explore || isConfirmationPlacementPointer(event.pointerType)) return
    if (cameraActive?.current) return
    event.stopPropagation()
    const next = supportedDraftFromPoint(event.point, draft)
    setDraftPosition(next.x, next.y, next.z)
  }

  const positionTouchDraft = (event: ThreeEvent<PointerEvent>) => {
    if (explore || !buildGesture || !isConfirmationPlacementPointer(event.pointerType)) return
    const completion = takeBuildPointerCompletion(buildGesture, event.pointerId)
    if (completion?.intent !== 'position') return
    event.stopPropagation()
    const state = useBrickStore.getState()
    if (state.draft) {
      const next = supportedDraftFromPoint(event.point, state.draft)
      state.setDraftPosition(next.x, next.y, next.z)
    } else {
      state.selectBrick(null)
    }
  }

  return (
    <group>
      <mesh
        position={[0, -0.09, 0]}
        receiveShadow
        onPointerMove={moveDraft}
        onPointerUp={positionTouchDraft}
        onClick={(event) => {
          event.stopPropagation()
          const pointerType = (event.nativeEvent as PointerEvent).pointerType ?? ''
          if (isConfirmationPlacementPointer(pointerType)) return
          if (event.delta > MOUSE_CLICK_DRAG_THRESHOLD) return
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

function BrickObject({ brick, explore = false, buildGesture, cameraActive }: { brick: BrickInstance; explore?: boolean; buildGesture?: BuildGestureState; cameraActive?: CameraGestureFlag }) {
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const placeFeedback = useBrickStore((state) => state.placeFeedback)
  const selectBrick = useBrickStore((state) => state.selectBrick)
  const setDraftPosition = useBrickStore((state) => state.setDraftPosition)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const part = BRICK_PART_MAP[brick.partId]
  const position = brickWorldPosition(brick)
  const geometry = useMemo(() => createBrickGeometry(part), [part])
  const userData = useMemo(() => ({ brickId: brick.id }), [brick.id])
  const [hovered, setHovered] = useState(false)
  const groupRef = useRef<THREE.Group>(null)
  const popElapsed = useRef<number | null>(null)
  const popNonce = !explore && placeFeedback?.id === brick.id ? placeFeedback.nonce : null

  useEffect(() => {
    if (popNonce === null || useBrickStore.getState().reducedMotion) return
    popElapsed.current = 0
    groupRef.current?.scale.setScalar(PLACE_POP_START_SCALE)
  }, [popNonce])

  useFrame((_, delta) => {
    const group = groupRef.current
    if (!group || popElapsed.current === null) return
    popElapsed.current += delta
    const progress = Math.min(popElapsed.current / PLACE_POP_DURATION, 1)
    const eased = 1 - (1 - progress) ** 3
    group.scale.setScalar(PLACE_POP_START_SCALE + (1 - PLACE_POP_START_SCALE) * eased)
    if (progress >= 1) popElapsed.current = null
  })

  const moveDraft = (event: ThreeEvent<PointerEvent>) => {
    if (!draft || explore || isConfirmationPlacementPointer(event.pointerType)) return
    if (cameraActive?.current) return
    event.stopPropagation()
    const next = supportedDraftFromPoint(event.point, draft)
    setDraftPosition(next.x, next.y, next.z)
  }

  const positionTouchDraft = (event: ThreeEvent<PointerEvent>) => {
    if (explore || !buildGesture || !isConfirmationPlacementPointer(event.pointerType)) return
    const completion = takeBuildPointerCompletion(buildGesture, event.pointerId)
    if (completion?.intent !== 'position') return
    event.stopPropagation()
    const state = useBrickStore.getState()
    if (state.draft) {
      const next = supportedDraftFromPoint(event.point, state.draft)
      state.setDraftPosition(next.x, next.y, next.z)
    } else {
      state.selectBrick(brick.id)
    }
  }

  const hoverGlow = hovered && !explore && !draft
  return (
    <group ref={groupRef} position={position} rotation={[0, brick.rotation * Math.PI / 2, 0]}>
      <mesh
        userData={userData}
        geometry={geometry}
        castShadow
        receiveShadow
        onPointerMove={moveDraft}
        onPointerUp={positionTouchDraft}
        onPointerOver={(event) => {
          if (explore || draft || isConfirmationPlacementPointer(event.pointerType)) return
          setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={(event) => {
          event.stopPropagation()
          const pointerType = (event.nativeEvent as PointerEvent).pointerType ?? ''
          if (isConfirmationPlacementPointer(pointerType)) return
          if (event.delta > MOUSE_CLICK_DRAG_THRESHOLD) return
          if (draft && !explore) placeDraft()
          else if (!explore) {
            const nativeEvent = event.nativeEvent as MouseEvent
            selectBrick(brick.id, nativeEvent.metaKey || nativeEvent.ctrlKey || nativeEvent.shiftKey || useBrickStore.getState().selectionMode)
          }
        }}
        scale={movingId === brick.id ? 0.98 : 1}
      >
        <meshStandardMaterial color={brick.color} emissive={hoverGlow ? brick.color : '#000000'} emissiveIntensity={hoverGlow ? HOVER_GLOW_INTENSITY : 0} roughness={0.58} metalness={0.02} transparent={movingId === brick.id} opacity={movingId === brick.id ? 0.3 : 1} />
        {selectedIds.includes(brick.id) && !explore && <Edges scale={1.025} color={selectedId === brick.id ? '#263e4b' : '#219ebc'} threshold={15} />}
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
  const blockedNonce = useBrickStore((state) => state.blockedNonce)
  const shakeRef = useRef<THREE.Group>(null)
  const shakeElapsed = useRef<number | null>(null)
  const lastBlockedNonce = useRef(blockedNonce)

  useEffect(() => {
    // Key strictly off blockedNonce (a discrete rejected placeDraft). The
    // re-armed ghost can sit invalid for long stretches — continuous
    // invalidity must never shake, and neither may a fresh mount.
    if (blockedNonce === lastBlockedNonce.current) return
    lastBlockedNonce.current = blockedNonce
    if (useBrickStore.getState().reducedMotion) return
    shakeElapsed.current = 0
  }, [blockedNonce])

  useFrame((_, delta) => {
    const group = shakeRef.current
    if (!group || shakeElapsed.current === null) return
    shakeElapsed.current += delta
    const progress = shakeElapsed.current / BLOCKED_SHAKE_DURATION
    if (progress >= 1) {
      group.position.x = 0
      shakeElapsed.current = null
      return
    }
    group.position.x = Math.sin(progress * Math.PI * 6) * (1 - progress) * BLOCKED_SHAKE_AMPLITUDE
  })

  return (
    <group position={position} rotation={[0, draft.rotation * Math.PI / 2, 0]}>
      <group ref={shakeRef}>
        <mesh geometry={geometry}>
          <meshStandardMaterial color={valid ? draft.color : '#ef5350'} transparent opacity={0.62} roughness={0.45} depthWrite={false} />
          <Edges scale={1.02} color={valid ? '#2a8f78' : '#b5222c'} />
        </mesh>
      </group>
    </group>
  )
}

function BuildCamera({ gestureActive }: { gestureActive: CameraGestureFlag }) {
  const controls = useRef<OrbitControlsImpl | null>(null)
  const request = useBrickStore((state) => state.viewRequest)
  const selectionMode = useBrickStore((state) => state.selectionMode)
  const marquee = useBrickStore((state) => state.marquee)
  const bricks = useBrickStore((state) => state.bricks)
  const setViewTarget = useBrickStore((state) => state.setViewTarget)
  const { camera, gl, size: viewportSize } = useThree()
  const unclampedTarget = useRef(new THREE.Vector3())
  const clampedTarget = useRef(new THREE.Vector3())
  const targetCorrection = useRef(new THREE.Vector3())
  const perspectiveCamera = camera as THREE.PerspectiveCamera
  const bounds = useMemo(() => getBuildBounds(bricks), [bricks])
  const limits = useMemo(
    () => getBuildCameraLimits(bounds, perspectiveCamera.fov, perspectiveCamera.aspect),
    [bounds, perspectiveCamera.fov, perspectiveCamera.aspect, viewportSize.width, viewportSize.height],
  )

  const publishViewTarget = useCallback(() => {
    const target = controls.current?.target
    if (!target) return
    setViewTarget(target.x / STUD + GRID_SIZE / 2, target.z / STUD + GRID_SIZE / 2)
  }, [setViewTarget])

  const clampCameraNavigation = useCallback(() => {
    const control = controls.current
    if (!control) return
    const previous = unclampedTarget.current.copy(control.target)
    clampBuildCameraTarget(previous, limits, clampedTarget.current)
    if (clampedTarget.current.equals(previous)) return
    targetCorrection.current.subVectors(clampedTarget.current, previous)
    control.target.copy(clampedTarget.current)
    camera.position.add(targetCorrection.current)
  }, [camera, limits])

  useEffect(() => {
    const { bricks, selectedId } = useBrickStore.getState()
    const selected = bricks.find((brick) => brick.id === selectedId)
    const frameBounds = getBuildBounds(bricks)
    const selectedPosition = selected ? brickWorldPosition(selected) : null
    const pose = createBuildFramePose(
      frameBounds,
      request.preset,
      perspectiveCamera.fov,
      perspectiveCamera.aspect,
      selectedPosition
        ? { x: selectedPosition[0], y: selectedPosition[1] + 0.5, z: selectedPosition[2] }
        : null,
    )
    camera.position.set(pose.position.x, pose.position.y, pose.position.z)
    controls.current?.target.set(pose.target.x, pose.target.y, pose.target.z)
    controls.current?.update()
    publishViewTarget()
  }, [request, camera, viewportSize.width, viewportSize.height, publishViewTarget])

  useEffect(() => {
    clampCameraNavigation()
    controls.current?.update()
  }, [clampCameraNavigation])

  useEffect(() => {
    const canvas = gl.domElement
    const applyPanModifier = (event: PointerEvent) => {
      const control = controls.current
      if (!control || event.pointerType !== 'mouse') return
      control.mouseButtons.LEFT = event.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    }
    canvas.addEventListener('pointerdown', applyPanModifier, true)
    return () => canvas.removeEventListener('pointerdown', applyPanModifier, true)
  }, [gl])

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!selectionMode && !marquee}
      enableDamping
      dampingFactor={0.08}
      minDistance={limits.minDistance}
      maxDistance={limits.maxDistance}
      maxPolarAngle={Math.PI / 2.02}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      onStart={() => { gestureActive.current = true }}
      onEnd={() => { gestureActive.current = false; publishViewTarget() }}
      onChange={clampCameraNavigation}
    />
  )
}

type ActiveSelectionGesture = {
  pointerId: number
  brickId: string | null
  explicitMode: boolean
  gesture: MarqueeGesture
}

function findBrickAtPointer(
  event: PointerEvent,
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  pointer: THREE.Vector2,
) {
  const rect = canvas.getBoundingClientRect()
  pointer.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  )
  raycaster.setFromCamera(pointer, camera)
  for (const intersection of raycaster.intersectObjects(scene.children, true)) {
    let object: THREE.Object3D | null = intersection.object
    while (object) {
      if (typeof object.userData.brickId === 'string') return object.userData.brickId as string
      object = object.parent
    }
  }
  return null
}

function BuildSelectionInput() {
  const { camera, gl, scene } = useThree()
  const active = useRef<ActiveSelectionGesture | null>(null)
  const suppressClick = useRef(false)
  const suppressTimer = useRef<number | null>(null)
  const raycaster = useRef(new THREE.Raycaster())
  const pointer = useRef(new THREE.Vector2())

  useEffect(() => {
    const canvas = gl.domElement
    const localPoint = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: event.clientX - rect.left, y: event.clientY - rect.top }
    }
    const consume = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const clearSuppressTimer = () => {
      if (suppressTimer.current !== null) window.clearTimeout(suppressTimer.current)
      suppressTimer.current = null
    }
    const reset = () => {
      const gesture = active.current
      const hasMarquee = useBrickStore.getState().marquee !== null
      if (!gesture && !hasMarquee) return
      active.current = null
      if (gesture && canvas.hasPointerCapture?.(gesture.pointerId)) canvas.releasePointerCapture?.(gesture.pointerId)
      if (hasMarquee) useBrickStore.getState().setMarquee(null)
    }
    const pointerDown = (event: PointerEvent) => {
      const state = useBrickStore.getState()
      if (!shouldCaptureSelectionGesture({
        mode: state.mode,
        button: event.button,
        pointerType: event.pointerType,
        selectionMode: state.selectionMode,
      })) return
      consume(event)
      const point = localPoint(event)
      active.current = {
        pointerId: event.pointerId,
        brickId: findBrickAtPointer(event, canvas, camera, scene, raycaster.current, pointer.current),
        explicitMode: state.selectionMode,
        gesture: beginMarqueeGesture(point),
      }
      canvas.setPointerCapture?.(event.pointerId)
    }
    const pointerMove = (event: PointerEvent) => {
      const current = active.current
      if (!current || current.pointerId !== event.pointerId) return
      consume(event)
      updateMarqueeGesture(current.gesture, localPoint(event))
      if (!current.brickId) {
        useBrickStore.getState().setMarquee({
          start: { ...current.gesture.start },
          current: { ...current.gesture.current },
          dragging: current.gesture.dragging,
        })
      }
    }
    const pointerUp = (event: PointerEvent) => {
      const current = active.current
      if (!current || current.pointerId !== event.pointerId) return
      consume(event)
      updateMarqueeGesture(current.gesture, localPoint(event))
      const finished = finishMarqueeGesture(current.gesture)
      const state = useBrickStore.getState()
      if (state.mode !== 'build') {
        reset()
        return
      }
      if (current.gesture.dragging && !current.brickId) {
        const rect = canvas.getBoundingClientRect()
        state.selectBricks(selectBricksInMarquee(state.bricks, camera, rect.width, rect.height, finished.rectangle))
      } else if (!current.gesture.dragging && current.brickId) {
        state.toggleBrick(current.brickId)
      } else if (!current.gesture.dragging && state.selectionMode) {
        state.clearSelection()
      }
      suppressClick.current = true
      clearSuppressTimer()
      suppressTimer.current = window.setTimeout(() => { suppressClick.current = false }, 250)
      reset()
    }
    const pointerCancel = (event: PointerEvent) => {
      if (active.current?.pointerId !== event.pointerId) return
      consume(event)
      reset()
    }
    const click = (event: MouseEvent) => {
      if (!suppressClick.current) return
      consume(event)
      suppressClick.current = false
      clearSuppressTimer()
    }
    const blur = () => reset()
    const visibility = () => { if (document.visibilityState !== 'visible') reset() }
    const unsubscribe = useBrickStore.subscribe((state) => {
      if ((state.mode !== 'build' && (active.current || state.marquee)) || (active.current?.explicitMode && !state.selectionMode)) reset()
    })

    canvas.addEventListener('pointerdown', pointerDown, true)
    canvas.addEventListener('pointermove', pointerMove, true)
    canvas.addEventListener('pointerup', pointerUp, true)
    canvas.addEventListener('pointercancel', pointerCancel, true)
    canvas.addEventListener('lostpointercapture', pointerCancel, true)
    canvas.addEventListener('click', click, true)
    window.addEventListener('blur', blur)
    window.addEventListener('resize', reset)
    window.addEventListener('orientationchange', reset)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      canvas.removeEventListener('pointerdown', pointerDown, true)
      canvas.removeEventListener('pointermove', pointerMove, true)
      canvas.removeEventListener('pointerup', pointerUp, true)
      canvas.removeEventListener('pointercancel', pointerCancel, true)
      canvas.removeEventListener('lostpointercapture', pointerCancel, true)
      canvas.removeEventListener('click', click, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('resize', reset)
      window.removeEventListener('orientationchange', reset)
      document.removeEventListener('visibilitychange', visibility)
      unsubscribe()
      clearSuppressTimer()
      reset()
    }
  }, [camera, gl, scene])

  return null
}

function BuildTouchInput({ gesture }: { gesture: BuildGestureState }) {
  const { gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    const now = () => performance.now()
    const pointerDown = (event: PointerEvent) => {
      beginBuildPointer(gesture, event.pointerId, event.pointerType, event.clientX, event.clientY)
    }
    const pointerMove = (event: PointerEvent) => {
      updateBuildPointer(gesture, event.pointerId, event.clientX, event.clientY)
    }
    const pointerUp = (event: PointerEvent) => {
      finishBuildPointer(gesture, event.pointerId, event.clientX, event.clientY, now())
    }
    const pointerCancel = (event: PointerEvent) => {
      cancelBuildPointer(gesture, event.pointerId, now())
    }
    const click = (event: MouseEvent) => {
      if (!shouldSuppressBuildTouchClick(gesture, now())) return
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const interrupt = () => interruptBuildPointers(gesture, now())
    const reset = () => resetBuildPointers(gesture)
    const visibility = () => { if (document.visibilityState !== 'visible') interrupt() }
    const unsubscribe = useBrickStore.subscribe((state) => {
      if (state.mode !== 'build') reset()
    })

    canvas.addEventListener('pointerdown', pointerDown, true)
    canvas.addEventListener('pointermove', pointerMove, true)
    canvas.addEventListener('pointerup', pointerUp, true)
    canvas.addEventListener('pointercancel', pointerCancel, true)
    canvas.addEventListener('lostpointercapture', pointerCancel, true)
    canvas.addEventListener('click', click, true)
    window.addEventListener('blur', interrupt)
    window.addEventListener('resize', interrupt)
    window.addEventListener('orientationchange', interrupt)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      canvas.removeEventListener('pointerdown', pointerDown, true)
      canvas.removeEventListener('pointermove', pointerMove, true)
      canvas.removeEventListener('pointerup', pointerUp, true)
      canvas.removeEventListener('pointercancel', pointerCancel, true)
      canvas.removeEventListener('lostpointercapture', pointerCancel, true)
      canvas.removeEventListener('click', click, true)
      window.removeEventListener('blur', interrupt)
      window.removeEventListener('resize', interrupt)
      window.removeEventListener('orientationchange', interrupt)
      document.removeEventListener('visibilitychange', visibility)
      unsubscribe()
      reset()
    }
  }, [gesture, gl])

  return null
}

function MouseTravelTracker({ travel }: { travel: PointerTravel }) {
  const { gl } = useThree()

  useEffect(() => {
    const canvas = gl.domElement
    const down = (event: PointerEvent) => { if (event.pointerType === 'mouse') beginPointerTravel(travel, event.clientX, event.clientY) }
    const move = (event: PointerEvent) => { if (event.pointerType === 'mouse') updatePointerTravel(travel, event.clientX, event.clientY) }
    const up = (event: PointerEvent) => { if (event.pointerType === 'mouse') endPointerTravel(travel) }
    canvas.addEventListener('pointerdown', down, true)
    canvas.addEventListener('pointermove', move, true)
    canvas.addEventListener('pointerup', up, true)
    canvas.addEventListener('pointercancel', up, true)
    return () => {
      canvas.removeEventListener('pointerdown', down, true)
      canvas.removeEventListener('pointermove', move, true)
      canvas.removeEventListener('pointerup', up, true)
      canvas.removeEventListener('pointercancel', up, true)
    }
  }, [gl, travel])

  return null
}

function BuildScene({ mouseTravel }: { mouseTravel: PointerTravel }) {
  const bricks = useBrickStore((state) => state.bricks)
  const gesture = useRef(createBuildGestureState())
  const cameraGestureActive = useRef(false)
  return (
    <>
      <Baseplate buildGesture={gesture.current} cameraActive={cameraGestureActive} />
      {bricks.map((brick) => <BrickObject key={brick.id} brick={brick} buildGesture={gesture.current} cameraActive={cameraGestureActive} />)}
      <DraftBrick />
      <BuildCamera gestureActive={cameraGestureActive} />
      <BuildSelectionInput />
      <BuildTouchInput gesture={gesture.current} />
      <MouseTravelTracker travel={mouseTravel} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#f5f2ec" roughness={1} />
      </mesh>
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
    const desiredDistance = store.touchCameraDistance
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
  const placeFeedback = useBrickStore((state) => state.placeFeedback)
  const compactRenderer = useCompactRenderer()
  const mouseTravel = useRef(createPointerTravel())

  // Audible confirmation is orthogonal to reduced motion — always play it.
  useEffect(() => {
    if (placeFeedback) playPlaceClick()
  }, [placeFeedback])
  return (
    <Canvas
      shadows={!compactRenderer}
      dpr={[1, compactRenderer ? 1.1 : 1.25]}
      camera={{ position: [14, 12, 16], fov: 45, near: 0.05, far: 240 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => {
        if (mode !== 'build') return
        if (pointerTravelExceeds(mouseTravel.current)) return
        useBrickStore.getState().selectBrick(null)
      }}
    >
      <color attach="background" args={['#f4f2ed']} />
      <fog attach="fog" args={['#f4f2ed', 42, 90]} />
      <ambientLight intensity={1.35} />
      <hemisphereLight color="#ffffff" groundColor="#aeb8b5" intensity={1.2} />
      <directionalLight castShadow={!compactRenderer} position={[14, 22, 12]} intensity={2.3} shadow-mapSize={[compactRenderer ? 512 : 1024, compactRenderer ? 512 : 1024]} shadow-camera-left={-25} shadow-camera-right={25} shadow-camera-top={25} shadow-camera-bottom={-25} />
      {mode === 'build'
        ? <><BuildScene mouseTravel={mouseTravel.current} /><Suspense fallback={null}><PhysicsPreload /></Suspense></>
        : <Suspense fallback={null}><ExploreScene /></Suspense>}
    </Canvas>
  )
}
