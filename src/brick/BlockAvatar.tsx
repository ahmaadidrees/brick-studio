import { useFrame } from '@react-three/fiber'
import { memo, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  createAvatarAnimationRuntime,
  stepAvatarAnimation,
  type MotionSnapshotRef,
} from './avatarMotion'

export type BlockAvatarProps = {
  motion: MotionSnapshotRef
  reducedMotion?: boolean
  /** Matches the current 0.72 m tall Explore capsule by default. */
  scale?: number
}

type AvatarAssets = {
  geometry: THREE.BoxGeometry
  torso: THREE.MeshPhysicalMaterial
  skin: THREE.MeshPhysicalMaterial
  pants: THREE.MeshPhysicalMaterial
  shoes: THREE.MeshPhysicalMaterial
  accent: THREE.MeshPhysicalMaterial
}

/**
 * Toy-plastic PBR finish for the explore avatar (its only consumer). A light
 * clearcoat over a dozen tiny boxes costs next to nothing and lets the figure
 * catch the golden-hour key and rim light like molded plastic.
 */
function createAvatarAssets(): AvatarAssets {
  return {
    geometry: new THREE.BoxGeometry(1, 1, 1),
    torso: new THREE.MeshPhysicalMaterial({ color: '#ef6f54', roughness: 0.38, clearcoat: 0.65, clearcoatRoughness: 0.3, envMapIntensity: 0.8 }),
    skin: new THREE.MeshPhysicalMaterial({ color: '#f2c37f', roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.38, envMapIntensity: 0.7 }),
    pants: new THREE.MeshPhysicalMaterial({ color: '#356c89', roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.32, envMapIntensity: 0.75 }),
    shoes: new THREE.MeshPhysicalMaterial({ color: '#263e4b', roughness: 0.52, clearcoat: 0.5, clearcoatRoughness: 0.34, envMapIntensity: 0.7 }),
    accent: new THREE.MeshPhysicalMaterial({ color: '#f4d35e', roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.26, envMapIntensity: 0.85 }),
  }
}

function disposeAvatarAssets(assets: AvatarAssets) {
  assets.geometry.dispose()
  assets.torso.dispose()
  assets.skin.dispose()
  assets.pants.dispose()
  assets.shoes.dispose()
  assets.accent.dispose()
}

/**
 * Allocation-free procedural visual. Its flip wrapper is below the physics-follow
 * and facing wrappers, so animation can never rotate the owning rigid body. The
 * physics-follow wrapper is a deliberate isolation seam for a future model swap.
 */
export const BlockAvatar = memo(function BlockAvatar({
  motion,
  reducedMotion = false,
  scale = 0.36,
}: BlockAvatarProps) {
  const physicsFollow = useRef<THREE.Group>(null)
  const facing = useRef<THREE.Group>(null)
  const lean = useRef<THREE.Group>(null)
  const squash = useRef<THREE.Group>(null)
  const flip = useRef<THREE.Group>(null)
  const head = useRef<THREE.Group>(null)
  const leftShoulder = useRef<THREE.Group>(null)
  const rightShoulder = useRef<THREE.Group>(null)
  const leftHip = useRef<THREE.Group>(null)
  const rightHip = useRef<THREE.Group>(null)
  const runtime = useRef(createAvatarAnimationRuntime(motion.current))
  const assets = useMemo(createAvatarAssets, [])

  useEffect(() => () => disposeAvatarAssets(assets), [assets])

  useFrame((_, frameDelta) => {
    const pose = stepAvatarAnimation(runtime.current, motion.current, frameDelta, reducedMotion)
    if (facing.current) facing.current.rotation.y = pose.facingYaw
    if (lean.current) {
      lean.current.rotation.x = pose.bodyPitch
      lean.current.rotation.z = pose.bodyRoll
    }
    if (squash.current) {
      squash.current.position.y = pose.bodyY
      squash.current.scale.set(pose.bodyScaleXZ, pose.bodyScaleY, pose.bodyScaleXZ)
    }
    if (flip.current) flip.current.rotation.x = pose.flipRotationX
    if (head.current) {
      head.current.rotation.x = pose.headPitch
      head.current.rotation.z = pose.headRoll
    }
    if (leftShoulder.current) leftShoulder.current.rotation.x = pose.leftArmPitch
    if (rightShoulder.current) rightShoulder.current.rotation.x = pose.rightArmPitch
    if (leftHip.current) leftHip.current.rotation.x = pose.leftLegPitch
    if (rightHip.current) rightHip.current.rotation.x = pose.rightLegPitch
  })

  const { geometry, torso, skin, pants, shoes, accent } = assets
  return (
    <group ref={physicsFollow} scale={scale}>
      <group ref={facing}>
        <group ref={lean}>
          <group ref={squash}>
            <group ref={flip}>
              <mesh geometry={geometry} material={torso} scale={[0.7, 0.7, 0.42]} position={[0, 0.12, 0]} castShadow />
              <mesh geometry={geometry} material={accent} scale={[0.36, 0.12, 0.025]} position={[0, 0.12, 0.222]} castShadow />

              <group ref={head} position={[0, 0.79, 0]}>
                <mesh geometry={geometry} material={skin} scale={[0.62, 0.54, 0.5]} castShadow />
                <mesh geometry={geometry} material={shoes} scale={[0.08, 0.07, 0.025]} position={[-0.14, 0.06, 0.263]} />
                <mesh geometry={geometry} material={shoes} scale={[0.08, 0.07, 0.025]} position={[0.14, 0.06, 0.263]} />
              </group>

              <group ref={leftShoulder} position={[-0.44, 0.39, 0]}>
                <mesh geometry={geometry} material={torso} scale={[0.2, 0.48, 0.22]} position={[0, -0.24, 0]} castShadow />
                <mesh geometry={geometry} material={skin} scale={[0.18, 0.18, 0.2]} position={[0, -0.55, 0]} castShadow />
              </group>
              <group ref={rightShoulder} position={[0.44, 0.39, 0]}>
                <mesh geometry={geometry} material={torso} scale={[0.2, 0.48, 0.22]} position={[0, -0.24, 0]} castShadow />
                <mesh geometry={geometry} material={skin} scale={[0.18, 0.18, 0.2]} position={[0, -0.55, 0]} castShadow />
              </group>

              <group ref={leftHip} position={[-0.19, -0.23, 0]}>
                <mesh geometry={geometry} material={pants} scale={[0.25, 0.58, 0.25]} position={[0, -0.29, 0]} castShadow />
                <mesh geometry={geometry} material={shoes} scale={[0.27, 0.17, 0.38]} position={[0, -0.64, 0.065]} castShadow />
              </group>
              <group ref={rightHip} position={[0.19, -0.23, 0]}>
                <mesh geometry={geometry} material={pants} scale={[0.25, 0.58, 0.25]} position={[0, -0.29, 0]} castShadow />
                <mesh geometry={geometry} material={shoes} scale={[0.27, 0.17, 0.38]} position={[0, -0.64, 0.065]} castShadow />
              </group>
            </group>
          </group>
        </group>
      </group>
    </group>
  )
})
