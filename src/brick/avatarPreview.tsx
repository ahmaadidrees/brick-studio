import { Grid, OrbitControls } from '@react-three/drei'
import { Canvas, advance, useFrame, useThree } from '@react-three/fiber'
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type * as THREE from 'three'
import { BlockAvatar } from './BlockAvatar'
import { createMotionSnapshot, type MotionSnapshot } from './avatarMotion'
import { CHARACTER_JUMP_SPEED, CHARACTER_GRAVITY, CHARACTER_RUN_SPEED, CHARACTER_WALK_SPEED } from './characterController'

/**
 * Dev-only turntable for the Explore toy figure. It is not part of the app build
 * (Vite only bundles index.html); run `npm run dev` and open /avatar-preview.html
 * to watch every animation state cycle without playing through Build mode first.
 *
 * The driver below fakes exactly the MotionSnapshot fields the real character
 * controller publishes, so what you see here is what Explore renders.
 */

type Beat = { label: string; seconds: number; speed: number; jump?: boolean }

const SCRIPT: Beat[] = [
  { label: 'idle', seconds: 4.5, speed: 0 },
  { label: 'walk', seconds: 4, speed: CHARACTER_WALK_SPEED * 0.45 },
  { label: 'run', seconds: 4, speed: CHARACTER_RUN_SPEED },
  { label: 'jump (running)', seconds: 2.2, speed: CHARACTER_RUN_SPEED, jump: true },
  { label: 'idle', seconds: 2.5, speed: 0 },
  { label: 'jump (standing)', seconds: 2.2, speed: 0, jump: true },
]

const SCRIPT_LENGTH = SCRIPT.reduce((total, beat) => total + beat.seconds, 0)

function beatAt(time: number) {
  let cursor = time % SCRIPT_LENGTH
  for (const beat of SCRIPT) {
    if (cursor < beat.seconds) return { beat, elapsed: cursor }
    cursor -= beat.seconds
  }
  return { beat: SCRIPT[0], elapsed: 0 }
}

function useScriptedMotion(onLabel: (label: string) => void) {
  const snapshot = useRef<MotionSnapshot>(createMotionSnapshot({ maxSpeed: CHARACTER_WALK_SPEED }))
  const clock = useRef(0)
  const height = useRef(0)
  const verticalVelocity = useRef(0)
  const airborne = useRef(false)
  const jumpArmed = useRef(true)
  const label = useRef('')
  const yaw = useRef(0)

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    clock.current += delta
    const { beat, elapsed } = beatAt(clock.current)
    if (beat.label !== label.current) {
      label.current = beat.label
      onLabel(beat.label)
      jumpArmed.current = true
    }

    const state = snapshot.current
    const previousSpeed = state.horizontalSpeed
    const targetSpeed = beat.speed
    const speed = previousSpeed + (targetSpeed - previousSpeed) * (1 - Math.exp(-9 * delta))

    if (beat.jump && jumpArmed.current && elapsed > 0.5 && !airborne.current) {
      jumpArmed.current = false
      airborne.current = true
      verticalVelocity.current = CHARACTER_JUMP_SPEED
      state.jumpSequence += 1
    }

    if (airborne.current) {
      verticalVelocity.current = Math.max(-12, verticalVelocity.current + CHARACTER_GRAVITY * delta)
      height.current += verticalVelocity.current * delta
      if (height.current <= 0) {
        height.current = 0
        airborne.current = false
        state.impact = Math.abs(verticalVelocity.current)
        state.landSequence += 1
        verticalVelocity.current = 0
      }
    }

    // Slow orbit of the facing yaw so the silhouette is judged from every side.
    // `?f=<radians>` pins it instead, which is what you want for reading the gait.
    const pinned = new URLSearchParams(window.location.search).get('f')
    yaw.current = pinned === null ? yaw.current + delta * (speed > 0.2 ? 0.55 : 0.22) : Number(pinned)

    state.grounded = !airborne.current
    state.horizontalSpeed = speed
    state.maxSpeed = targetSpeed > CHARACTER_WALK_SPEED ? CHARACTER_RUN_SPEED : CHARACTER_WALK_SPEED
    state.verticalVelocity = airborne.current ? verticalVelocity.current : 0
    state.facingYaw = yaw.current
    state.acceleration = Math.max(-1, Math.min(1, (targetSpeed - previousSpeed) / 3))
    state.turnSignal = speed > 0.2 ? 0.35 : 0
  })

  return { snapshot, height }
}

function PreviewFigure({ reducedMotion, compact, onLabel }: { reducedMotion: boolean; compact: boolean; onLabel: (label: string) => void }) {
  const { snapshot, height } = useScriptedMotion(onLabel)
  const lift = useRef<THREE.Group>(null)

  useFrame(() => {
    if (lift.current) lift.current.position.y = 0.36 + height.current
  })

  return (
    <group ref={lift} position={[0, 0.36, 0]}>
      <BlockAvatar motion={snapshot} reducedMotion={reducedMotion} compact={compact} />
    </group>
  )
}

/** `?d=` sets the start camera distance and `?y=` its height, for close inspection. */
function readCameraStart() {
  const params = new URLSearchParams(window.location.search)
  const distance = Number(params.get('d') ?? 2.2)
  const height = Number(params.get('y') ?? 0.55)
  const angle = Number(params.get('a') ?? 0.72)
  return [Math.sin(angle) * distance, height, Math.cos(angle) * distance] as [number, number, number]
}

/**
 * Manual frame pump. Headless/backgrounded tabs stop requestAnimationFrame
 * entirely, so `window.stepAvatarFrames(n)` drives exactly n fixed-step frames
 * and lets a screenshot land on a chosen point of the animation.
 */
function ManualFrameStepper() {
  const clock = useThree((state) => state.clock)
  useEffect(() => {
    window.stepAvatarFrames = (count = 1, step = 1 / 60) => {
      for (let frame = 0; frame < count; frame += 1) {
        clock.oldTime = performance.now() - step * 1000
        advance(performance.now())
      }
    }
    return () => { delete window.stepAvatarFrames }
  }, [clock])
  return null
}

function Preview() {
  const [reducedMotion, setReducedMotion] = useState(false)
  const [compact, setCompact] = useState(false)
  const [label, setLabel] = useState('idle')
  const cameraStart = useMemo(readCameraStart, [])
  const style = useMemo(() => ({
    position: 'absolute' as const,
    left: 16,
    top: 16,
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    font: '600 14px system-ui, sans-serif',
    color: '#25303a',
    background: 'rgba(255,255,255,0.82)',
    padding: '10px 14px',
    borderRadius: 10,
  }), [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f4f2ed' }}>
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: cameraStart, fov: 40, near: 0.05, far: 60 }}>
        <color attach="background" args={['#f4f2ed']} />
        <ambientLight intensity={1.35} />
        <hemisphereLight color="#ffffff" groundColor="#aeb8b5" intensity={1.2} />
        <directionalLight castShadow position={[3, 5, 3]} intensity={2.3} shadow-mapSize={[1024, 1024]} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[20, 20]} />
          <meshStandardMaterial color="#dfe3df" roughness={0.9} />
        </mesh>
        <Grid args={[20, 20]} cellSize={0.36} sectionSize={1.8} cellColor="#c8ccc6" sectionColor="#a9b0a8" fadeDistance={9} infiniteGrid position={[0, 0.001, 0]} />
        <ManualFrameStepper />
        <PreviewFigure reducedMotion={reducedMotion} compact={compact} onLabel={setLabel} />
        <OrbitControls target={[0, 0.36, 0]} enablePan={false} minDistance={0.6} maxDistance={6} />
      </Canvas>
      <div style={style}>
        <span data-testid="beat">beat: {label}</span>
        <label><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.target.checked)} /> reduced motion</label>
        <label><input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} /> compact tier</label>
      </div>
    </div>
  )
}

declare global {
  interface Window {
    __avatarPreviewRoot?: ReturnType<typeof createRoot>
    stepAvatarFrames?: (count?: number, step?: number) => void
  }
}

// Hot reloads re-run this module, and a second createRoot on the same container
// leaves a stale canvas stacked under the live one. Reuse the first root.
const container = document.getElementById('avatar-preview')
if (container) {
  const root = window.__avatarPreviewRoot ?? createRoot(container)
  window.__avatarPreviewRoot = root
  root.render(<StrictMode><Preview /></StrictMode>)
}
