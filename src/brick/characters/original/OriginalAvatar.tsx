import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createAvatarAnimationRuntime, stepAvatarAnimation } from '../../avatarMotion'
import { EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS } from '../../parts'
import type { CharacterVisualProps } from '../types'
import type { OriginalCharacterId } from './descriptors'
import { cloneOriginalVisual, ORIGINAL_MODEL_URLS } from './model'

const EMPTY_PALETTE = {}
const X_AXIS = new THREE.Vector3(1, 0, 0)
const GROUND = -(EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS)

export function OriginalAvatar({ id, motion, reducedMotion = false, compact = false, scale = 0.36, palette = EMPTY_PALETTE }: CharacterVisualProps & { id: OriginalCharacterId }) {
  const { scene } = useGLTF(ORIGINAL_MODEL_URLS[id], false, false)
  const visual = useMemo(() => cloneOriginalVisual(scene, id, palette, !compact), [scene, id, palette, compact])
  const runtime = useRef(createAvatarAnimationRuntime(motion.current))
  const facing = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  useEffect(() => () => visual.materials.forEach((material) => material.dispose()), [visual])
  useFrame((_, delta) => {
    const pose = stepAvatarAnimation(runtime.current, motion.current, delta, reducedMotion)
    if (facing.current) facing.current.rotation.y = pose.facingYaw
    if (body.current) {
      body.current.position.y = pose.bodyY
      body.current.rotation.set(pose.bodyPitch + pose.flipRotationX, 0, pose.bodyRoll)
      body.current.scale.set(pose.bodyScaleXZ, pose.bodyScaleY, pose.bodyScaleXZ)
    }
    const pitches = [pose.headPitch, pose.leftArmPitch, pose.rightArmPitch, pose.leftLegPitch, pose.rightLegPitch]
    visual.pivots.forEach((pivot, index) => {
      if (pivot) pivot.object.quaternion.copy(pivot.bind).multiply(rotation.setFromAxisAngle(X_AXIS, pitches[index]))
    })
  }, -0.5)
  return <group ref={facing}>
    <group ref={body}>
      <group position-y={GROUND} scale={scale * 2}>
        <primitive object={visual.scene} dispose={null} />
      </group>
    </group>
  </group>
}
