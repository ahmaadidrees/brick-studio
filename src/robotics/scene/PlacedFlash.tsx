import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { usePlacedFlash } from '../guide/oneShot'
import { brickFrame } from '../model/grid'
import { useRoboticsStore } from '../state/roboticsStore'

/** How long the glow lasts, and how many times it pulses in that time. */
const FLASH_SECONDS = 1.2
const PULSES = 2

/**
 * A part placed from a next step or an idea glows twice (lane P, `guide/oneShot.ts`): the brush
 * was put down, so this is how the student sees it landed. Drawn over the brick, never written.
 */
export default function PlacedFlash() {
  const flash = usePlacedFlash((state) => state.flash)
  const brick = useBrickStore((state) => (flash ? state.bricks.find((candidate) => candidate.id === flash.brickId) ?? null : null))
  const plateSize = useRoboticsStore((state) => state.model.input.plateSize)
  const part = brick ? BRICK_PART_MAP[brick.partId] : undefined
  const geometry = useMemo(() => (part ? createBrickGeometry(part) : null), [part])
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const elapsed = useRef(0)
  const reduced = useBrickStore((state) => state.reducedMotion)

  useEffect(() => {
    elapsed.current = 0
    if (!flash) return
    const timer = window.setTimeout(() => usePlacedFlash.getState().clear(), FLASH_SECONDS * 1000 + 100)
    return () => window.clearTimeout(timer)
  }, [flash])

  useFrame((_, delta) => {
    if (!material.current) return
    elapsed.current += delta
    const progress = Math.min(1, elapsed.current / FLASH_SECONDS)
    // Reduced motion: one steady glow that fades, no pulsing.
    const wave = reduced ? 1 : 0.5 - 0.5 * Math.cos(progress * PULSES * 2 * Math.PI)
    material.current.opacity = 0.55 * wave * (1 - progress * 0.6)
  })

  if (!flash || !brick || !part || !geometry) return null
  const frame = brickFrame(brick, part, plateSize)
  return (
    <mesh geometry={geometry} position={[frame.origin.x, frame.origin.y, frame.origin.z]} rotation={[0, (brick.rotation * Math.PI) / 2, 0]} scale={1.08} renderOrder={5} raycast={() => null}>
      <meshBasicMaterial ref={material} color="#ffe066" transparent opacity={0} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
