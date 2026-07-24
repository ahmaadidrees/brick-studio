import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  Bloom,
  DepthOfField,
  EffectComposer,
  HueSaturation,
  N8AO,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  EXPLORE_BACKDROP_COLOR,
  EXPLORE_CONTACT_SHADOW_COLOR,
  EXPLORE_FLOOR_COLOR,
  EXPLORE_FOG_FAR,
  EXPLORE_FOG_NEAR,
  EXPLORE_KEY_LIGHT_COLOR,
  EXPLORE_RIM_LIGHT_COLOR,
  exploreLookdevFeatures,
} from './lookdev'
import { GRID_SIZE, STUD } from './parts'
import { useBrickStore } from './store'

const gridWorldSize = GRID_SIZE * STUD

/**
 * Soft studio environment rendered once into a cubemap: a warm overhead
 * softbox, a cool side fill, a warm bounce card, and a floor bounce, all inside
 * a dim warm dome. No network fetches — everything is generated locally.
 */
function StudioEnvironment({ compactRenderer }: { compactRenderer: boolean }) {
  return (
    <Environment resolution={compactRenderer ? 64 : 256} frames={1} environmentIntensity={1}>
      <mesh scale={100}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshBasicMaterial color="#8d867a" side={THREE.BackSide} />
      </mesh>
      <Lightformer form="rect" color="#fff3e2" intensity={2.75} position={[0, 8, 3.5]} scale={[10, 7, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" color="#dce8f7" intensity={1.05} position={[-8, 3.5, -5]} scale={[7, 4, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" color="#ffe4c2" intensity={0.85} position={[8, 2.5, 4]} scale={[6, 3, 1]} target={[0, 0, 0]} />
      <Lightformer form="circle" color="#fff8ec" intensity={0.55} position={[0, -6, 0]} scale={[9, 9, 1]} target={[0, 0, 0]} />
    </Environment>
  )
}

/**
 * The seamless paper sweep the toy sits on. Visual only — the matching walkable
 * collider lives in the explore physics scene.
 */
function StudioSweepFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.181, 0]} receiveShadow>
      <circleGeometry args={[220, 48]} />
      <meshStandardMaterial color={EXPLORE_FLOOR_COLOR} roughness={0.96} metalness={0} />
    </mesh>
  )
}

const DUST_COUNT = 110
const DUST_MIN_Y = 0.2
const DUST_SPAN_Y = 7.4

type DustSeeds = {
  base: Float32Array
  speed: Float32Array
  phase: Float32Array
}

function createDustSeeds(): DustSeeds {
  const base = new Float32Array(DUST_COUNT * 3)
  const speed = new Float32Array(DUST_COUNT)
  const phase = new Float32Array(DUST_COUNT)
  for (let index = 0; index < DUST_COUNT; index += 1) {
    base[index * 3] = (Math.random() * 2 - 1) * 14
    base[index * 3 + 1] = DUST_MIN_Y + Math.random() * DUST_SPAN_Y
    base[index * 3 + 2] = (Math.random() * 2 - 1) * 14
    speed[index] = 0.05 + Math.random() * 0.09
    phase[index] = Math.random() * Math.PI * 2
  }
  return { base, speed, phase }
}

function createDustTexture() {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    gradient.addColorStop(0, 'rgba(255, 250, 240, 1)')
    gradient.addColorStop(0.5, 'rgba(255, 250, 240, 0.4)')
    gradient.addColorStop(1, 'rgba(255, 250, 240, 0)')
    context.fillStyle = gradient
    context.fillRect(0, 0, size, size)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/**
 * Macro-photo dust drifting in the key light. Mounted only when the lookdev
 * ladder allows it (non-compact renderer, reduced motion off), so it never adds
 * motion for users who asked for less of it.
 */
function DustMotes() {
  const points = useRef<THREE.Points>(null)
  const seeds = useMemo(createDustSeeds, [])
  const assets = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(seeds.base.slice(), 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, DUST_MIN_Y + DUST_SPAN_Y / 2, 0), 22)
    const texture = createDustTexture()
    const material = new THREE.PointsMaterial({
      size: 0.055,
      map: texture,
      alphaMap: texture,
      transparent: true,
      opacity: 0.3,
      color: '#fff6e6',
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    return { geometry, material, texture }
  }, [seeds])

  useEffect(() => () => {
    assets.geometry.dispose()
    assets.material.dispose()
    assets.texture.dispose()
  }, [assets])

  useFrame((state) => {
    const geometry = points.current?.geometry
    if (!geometry) return
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
    const positions = attribute.array as Float32Array
    const time = state.clock.elapsedTime
    for (let index = 0; index < DUST_COUNT; index += 1) {
      const phase = seeds.phase[index]
      positions[index * 3] = seeds.base[index * 3] + Math.sin(time * 0.16 + phase) * 0.45
      positions[index * 3 + 1] = DUST_MIN_Y
        + ((seeds.base[index * 3 + 1] - DUST_MIN_Y + time * seeds.speed[index]) % DUST_SPAN_Y)
      positions[index * 3 + 2] = seeds.base[index * 3 + 2] + Math.cos(time * 0.13 + phase) * 0.45
    }
    attribute.needsUpdate = true
  })

  return <points ref={points} geometry={assets.geometry} material={assets.material} frustumCulled={false} />
}

/**
 * The macro-photo grade: crevice AO for studs, a shallow depth-of-field hint
 * toward the horizon, restrained bloom on plastic highlights, a soft vignette,
 * and an explicit ACES filmic pass (the composer bypasses renderer tone
 * mapping while mounted and restores it for Build mode on unmount).
 */
function ExploreEffects() {
  return (
    <EffectComposer multisampling={4}>
      <N8AO aoRadius={0.5} distanceFalloff={1} intensity={2.2} quality="medium" color="#2c2117" />
      <DepthOfField worldFocusDistance={6.5} worldFocusRange={34} bokehScale={1.5} />
      <Bloom mipmapBlur luminanceThreshold={1} luminanceSmoothing={0.25} intensity={0.5} />
      <HueSaturation saturation={0.08} />
      <Vignette eskil={false} offset={0.3} darkness={0.45} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

/**
 * Explore-mode "toy photography" stage: warm seamless backdrop, soft studio
 * lighting, grounded shadows, and the graded post chain. Rendered instead of
 * (never alongside) the Build-mode light rig, so the Build look is untouched.
 */
export function ExploreEnvironment({ compactRenderer }: { compactRenderer: boolean }) {
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const features = exploreLookdevFeatures(compactRenderer, reducedMotion)
  return (
    <>
      <color attach="background" args={[EXPLORE_BACKDROP_COLOR]} />
      <fog attach="fog" args={[EXPLORE_BACKDROP_COLOR, EXPLORE_FOG_NEAR, EXPLORE_FOG_FAR]} />
      <StudioEnvironment compactRenderer={compactRenderer} />
      <directionalLight
        color={EXPLORE_KEY_LIGHT_COLOR}
        intensity={2.1}
        position={[13, 19, 9]}
        castShadow={!compactRenderer}
        shadow-mapSize={[features.shadowMapSize, features.shadowMapSize]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={2}
        shadow-camera-far={60}
        shadow-bias={-0.0001}
        shadow-normalBias={0.03}
      />
      <directionalLight color={EXPLORE_RIM_LIGHT_COLOR} intensity={0.55} position={[-10, 8, -12]} />
      <StudioSweepFloor />
      {features.contactShadows && (
        <ContactShadows
          position={[0, -0.175, 0]}
          scale={gridWorldSize + 17}
          far={12}
          blur={2.6}
          opacity={0.42}
          resolution={512}
          color={EXPLORE_CONTACT_SHADOW_COLOR}
        />
      )}
      {features.dustMotes && <DustMotes />}
      {features.postprocessing && <ExploreEffects />}
    </>
  )
}
