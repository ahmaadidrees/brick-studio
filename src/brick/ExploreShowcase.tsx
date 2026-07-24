import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EXPLORE_SHOWCASE } from './exploreLookdev'

const LOOK = EXPLORE_SHOWCASE

/**
 * Cool edge light that stays behind the build relative to the camera, so the
 * avatar and bricks always carry a crisp rim highlight while orbiting — the
 * classic product-shot trick. It only reacts to camera input (no self-driven
 * animation), so it is inert under reduced motion.
 */
const RIM_UP = new THREE.Vector3(0, 1, 0)

function CameraRimLight() {
  const light = useRef<THREE.DirectionalLight>(null)
  const away = useRef(new THREE.Vector3())

  useFrame(({ camera }) => {
    const rim = light.current
    if (!rim) return
    const direction = away.current.set(-camera.position.x, 0, -camera.position.z)
    if (direction.lengthSq() < 1e-6) direction.set(0, 0, -1)
    direction.normalize().applyAxisAngle(RIM_UP, LOOK.rim.azimuthOffset)
    // Default directional-light target sits at the origin, so positioning the
    // light past the build behind the camera's view aims it back through the scene.
    rim.position.set(direction.x * LOOK.rim.distance, LOOK.rim.height, direction.z * LOOK.rim.distance)
  })

  return <directionalLight ref={light} color={LOOK.rim.color} intensity={LOOK.rim.intensity} />
}

/** Slight ACES over-exposure while the showcase is mounted; restores on unmount. */
function ShowcaseExposure() {
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const previous = gl.toneMappingExposure
    gl.toneMappingExposure = LOOK.toneMappingExposure
    return () => {
      gl.toneMappingExposure = previous
    }
  }, [gl])

  return null
}

/**
 * Procedural studio environment: one big overhead softbox plus cool wrap
 * strips, rendered once into a PMREM cubemap. This is what gives clearcoat
 * plastic and the polished-acrylic plate their long soft reflections without
 * any network-loaded HDRI.
 */
function StudioReflections() {
  return (
    <Environment frames={1} resolution={256}>
      <color attach="background" args={['#aab4bf']} />
      <Lightformer form="rect" intensity={1.3} color="#ffffff" position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
      <Lightformer form="rect" intensity={1} color="#d9e7ff" position={[-13, 4, -7]} rotation-y={Math.PI / 2.4} scale={[18, 3.2, 1]} />
      <Lightformer form="rect" intensity={1} color="#d9e7ff" position={[13, 4, -7]} rotation-y={-Math.PI / 2.4} scale={[18, 3.2, 1]} />
      <Lightformer form="rect" intensity={0.7} color="#ffffff" position={[0, 3.5, 14]} scale={[20, 4, 1]} />
    </Environment>
  )
}

/**
 * Post chain for the crisp showcase: N8AO grounds every brick, restrained HDR
 * bloom glints the clearcoat, ACES + a punchy grade set the e-sports-clean
 * contrast, and SMAA finishes the frame with razor edges (the composer runs
 * with multisampling off — SMAA replaces MSAA on this path).
 */
function ShowcaseEffects() {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO
        halfRes
        depthAwareUpsampling
        quality="performance"
        aoRadius={LOOK.ao.radius}
        intensity={LOOK.ao.intensity}
        distanceFalloff={LOOK.ao.distanceFalloff}
      />
      <Bloom
        mipmapBlur
        intensity={LOOK.bloom.intensity}
        luminanceThreshold={LOOK.bloom.luminanceThreshold}
        luminanceSmoothing={LOOK.bloom.luminanceSmoothing}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <BrightnessContrast brightness={LOOK.grade.brightness} contrast={LOOK.grade.contrast} />
      <HueSaturation saturation={LOOK.grade.saturation} />
      <Vignette eskil={false} offset={LOOK.grade.vignetteOffset} darkness={LOOK.grade.vignetteDarkness} />
      <SMAA />
    </EffectComposer>
  )
}

/** Seamless studio cyc: matches the background color so the floor melts into the horizon. */
function StudioFloor() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]} receiveShadow>
      <circleGeometry args={[120, 48]} />
      <meshStandardMaterial color={LOOK.background} roughness={0.94} metalness={0} envMapIntensity={0.3} />
    </mesh>
  )
}

/**
 * Full "crisp showcase" environment for Explore mode. Mounted only when the
 * renderer is non-compact (see shouldUseExploreShowcase) so phones keep the
 * lightweight classic path. Contains no self-driven motion: every element is
 * static or purely camera-reactive, which keeps reduced-motion sessions calm.
 */
export function ShowcaseEnvironment() {
  return (
    <>
      <color attach="background" args={[LOOK.background]} />
      <ambientLight intensity={LOOK.ambient} />
      <hemisphereLight color={LOOK.hemisphere.sky} groundColor={LOOK.hemisphere.ground} intensity={LOOK.hemisphere.intensity} />
      <directionalLight
        castShadow
        color={LOOK.key.color}
        position={[LOOK.key.position[0], LOOK.key.position[1], LOOK.key.position[2]]}
        intensity={LOOK.key.intensity}
        shadow-mapSize={[LOOK.key.shadowMapSize, LOOK.key.shadowMapSize]}
        shadow-camera-left={-24}
        shadow-camera-right={24}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-normalBias={0.03}
      />
      <CameraRimLight />
      <StudioReflections />
      <StudioFloor />
      <ShowcaseExposure />
      <ShowcaseEffects />
    </>
  )
}
