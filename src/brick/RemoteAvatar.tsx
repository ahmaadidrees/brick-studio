import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { createMotionSnapshot } from './avatarMotion'
import type { RemoteRaceAvatar } from './BrickStudioScene'
import { RuntimeCharacterAvatar } from './runtimeContent/character'

export function RemoteAvatar({ avatar, compact }: { avatar: RemoteRaceAvatar; compact: boolean }) {
  const group = useRef<THREE.Group>(null)
  // Only the frame loop owns the rendered position after mounting. Binding the
  // latest packet here makes R3F snap the group before interpolation can run.
  const [initialPosition] = useState(() => [...avatar.position] as [number, number, number])
  const target = useRef(new THREE.Vector3(...avatar.position))
  const palette = useMemo(
    () => avatar.palette && Object.keys(avatar.palette).length
      ? avatar.palette
      : { primary: avatar.color },
    [avatar.color, avatar.palette],
  )
  const motion = useRef(createMotionSnapshot({
    grounded: avatar.grounded,
    facingYaw: avatar.facingYaw,
    horizontalSpeed: avatar.horizontalSpeed,
    maxSpeed: 4,
  }))

  useLayoutEffect(() => {
    target.current.set(...avatar.position)
    motion.current.grounded = avatar.grounded
    // Character animators already interpolate yaw along the shortest arc.
    motion.current.facingYaw = avatar.facingYaw
    motion.current.horizontalSpeed = avatar.horizontalSpeed
  }, [avatar])

  useFrame((_, delta) => {
    if (!group.current) return
    if (delta > 0.5 || group.current.position.distanceToSquared(target.current) < 0.000001) {
      // Resume at the latest known position after a suspended tab, and settle
      // exactly when idle instead of accumulating an imperceptible trailing gap.
      group.current.position.copy(target.current)
    } else if (Number.isFinite(delta) && delta > 0) {
      group.current.position.lerp(target.current, 1 - Math.exp(-14 * Math.min(delta, 0.05)))
    }
  })

  return (
    <group ref={group} position={initialPosition}>
      <RuntimeCharacterAvatar
        characterId={avatar.characterId ?? 'classic'}
        motion={motion}
        palette={palette}
        compact={compact}
      />
    </group>
  )
}
