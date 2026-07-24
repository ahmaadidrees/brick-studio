import { Environment, Lightformer, Sky } from '@react-three/drei'
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  N8AO,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { ToneMappingMode } from 'postprocessing'
import { createContext, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import {
  GOLDEN_HOUR,
  createDustMoteField,
  getGoldenHourQuality,
  goldenSunDirection,
  goldenSunPosition,
} from './goldenHour'
import { useBrickStore } from './store'

/**
 * True while the explore renderer runs on a compact (phone-class) viewport.
 * Explore-mode materials read this to choose between clearcoat plastic and a
 * cheaper standard material. Build mode never consumes it.
 */
export const ExploreCompactContext = createContext(false)

const SUN_DIRECTION = goldenSunDirection()
const SUN_LIGHT_POSITION = goldenSunPosition(46)
const RIM_LIGHT_POSITION: [number, number, number] = [
  -SUN_DIRECTION[0] * 30,
  14,
  -SUN_DIRECTION[2] * 30,
]

/** Shadow frustum wide enough for the long low-sun shadows to land on the ground. */
const SHADOW_EXTENT = 46

const DOME_VERTEX_SHADER = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const DOME_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uHorizonColor;
uniform vec3 uZenithColor;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;
uniform float uHazeBand;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  float horizonBlend = pow(clamp(1.0 - direction.y, 0.0, 1.0), 2.6);
  vec3 color = mix(uZenithColor, uHorizonColor, horizonBlend);
  float toward = max(dot(direction, uSunDirection), 0.0);
  color += uSunColor * pow(toward, 48.0) * 1.1;
  color += uSunColor * pow(toward, 6.0) * 0.2;
  // Haze-band mode: opaque below the horizon, fading out above so the real
  // scattering sky shows through. Full-dome mode stays opaque everywhere.
  float alpha = mix(1.0, 1.0 - smoothstep(0.0, 0.14, direction.y), uHazeBand);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * Cheap gradient dome with a warm sun glow. Compact devices use it as the
 * whole sky; desktop mounts it as a translucent haze band that hides the
 * scattering sky's dark below-horizon zone and melts it into the fog.
 */
function GradientSkyDome({ hazeBand = false }: { hazeBand?: boolean }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uHorizonColor: { value: new THREE.Color(GOLDEN_HOUR.fogColor) },
          uZenithColor: { value: new THREE.Color(GOLDEN_HOUR.zenithColor) },
          uSunColor: { value: new THREE.Color(GOLDEN_HOUR.sunColor) },
          uSunDirection: { value: new THREE.Vector3(...SUN_DIRECTION) },
          uHazeBand: { value: hazeBand ? 1 : 0 },
        },
        vertexShader: DOME_VERTEX_SHADER,
        fragmentShader: DOME_FRAGMENT_SHADER,
        side: THREE.BackSide,
        depthWrite: false,
        transparent: hazeBand,
        fog: false,
      }),
    [hazeBand],
  )
  const geometry = useMemo(() => new THREE.SphereGeometry(190, 28, 18), [])

  useEffect(
    () => () => {
      material.dispose()
      geometry.dispose()
    },
    [material, geometry],
  )

  return <mesh geometry={geometry} material={material} frustumCulled={false} />
}

const MOTE_VERTEX_SHADER = /* glsl */ `
attribute float aSeed;
attribute float aScale;
uniform float uTime;
uniform float uSize;
varying float vFade;
void main() {
  vec3 offset = position;
  float phase = aSeed * 6.28318;
  offset.x += sin(uTime * (0.05 + aSeed * 0.06) + phase) * 1.35;
  offset.y += sin(uTime * (0.03 + aSeed * 0.04) + phase * 1.7) * 0.85;
  offset.z += cos(uTime * (0.06 + aSeed * 0.05) + phase * 2.3) * 1.35;
  vec4 mvPosition = modelViewMatrix * vec4(offset, 1.0);
  vFade = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * (0.5 + aSeed * 0.8) + phase * 3.0));
  gl_PointSize = clamp(uSize * aScale * (16.0 / -mvPosition.z), 1.0, 30.0);
  gl_Position = projectionMatrix * mvPosition;
}
`

const MOTE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vFade;
void main() {
  float distanceToCenter = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.08, distanceToCenter) * vFade * uOpacity;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/**
 * Floating dust motes catching the low sun. Pure GPU drift (one time uniform),
 * additive, depth-tested so builds occlude them. Mounted only when the quality
 * ladder allows motion: never on compact renderers, never with reduced motion.
 */
function DustMotes() {
  const field = useMemo(() => createDustMoteField(), [])
  const geometry = useMemo(() => {
    const points = new THREE.BufferGeometry()
    points.setAttribute('position', new THREE.BufferAttribute(field.positions, 3))
    points.setAttribute('aSeed', new THREE.BufferAttribute(field.seeds, 1))
    points.setAttribute('aScale', new THREE.BufferAttribute(field.scales, 1))
    points.computeBoundingSphere()
    return points
  }, [field])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: 5.5 },
          uColor: { value: new THREE.Color(GOLDEN_HOUR.dustColor) },
          uOpacity: { value: 0.4 },
        },
        vertexShader: MOTE_VERTEX_SHADER,
        fragmentShader: MOTE_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame(({ clock, gl }) => {
    material.uniforms.uTime.value = clock.elapsedTime
    material.uniforms.uSize.value = 5.5 * gl.getPixelRatio()
  })

  return <points geometry={geometry} material={material} />
}

/**
 * Warm ground that stretches to the fog line so long shadows have somewhere to
 * land. Purely visual; explore physics still ends at the plate edge.
 */
function GoldenGround() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.19, 0]} receiveShadow>
      <circleGeometry args={[200, 48]} />
      <meshStandardMaterial color={GOLDEN_HOUR.groundColor} roughness={0.96} metalness={0} />
    </mesh>
  )
}

/**
 * One-time baked environment so clearcoat plastic has a warm sun card and a
 * cool sky band to reflect. No network fetches; everything is procedural.
 */
function GoldenEnvironment() {
  return (
    <Environment frames={1} resolution={256} background={false}>
      <color attach="background" args={['#59636f']} />
      <Lightformer
        form="rect"
        intensity={4}
        color={GOLDEN_HOUR.sunColor}
        position={goldenSunPosition(9)}
        target={[0, 0, 0]}
        scale={[6, 4, 1]}
      />
      <Lightformer
        form="rect"
        intensity={0.9}
        color={GOLDEN_HOUR.skyFillColor}
        rotation-x={Math.PI / 2}
        position={[0, 8, 0]}
        scale={[14, 14, 1]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color={GOLDEN_HOUR.groundBounceColor}
        rotation-x={-Math.PI / 2}
        position={[0, -8, 0]}
        scale={[14, 14, 1]}
      />
    </Environment>
  )
}

/**
 * Post chain: grounded AO, gentle bloom, vignette, filmic tone map, then a
 * small saturation lift. Ordering matters: HueSaturation must run AFTER
 * ToneMapping — applied to HDR input it pushes saturated brick colors out of
 * gamut (negative channels) and ACES then clips them to black.
 */
function GoldenHourPost() {
  return (
    <EffectComposer multisampling={4} enableNormalPass={false}>
      <N8AO halfRes quality="medium" aoRadius={1.1} intensity={2.2} distanceFalloff={1} color="#3d2c1e" />
      <Bloom mipmapBlur intensity={0.38} luminanceThreshold={1.15} luminanceSmoothing={0.25} radius={0.7} />
      <Vignette eskil={false} offset={0.24} darkness={0.45} />
      <BrightnessContrast brightness={0.005} contrast={0.08} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <HueSaturation saturation={0.12} />
    </EffectComposer>
  )
}

export type GoldenHourLookProps = {
  compact: boolean
}

/**
 * The complete golden-hour rig for Explore mode: late-afternoon sun, cool sky
 * fill, haze, sky, ground, baked reflections, dust, and the graded post chain.
 * Unmounting restores every renderer default, so Build mode is untouched.
 */
export function GoldenHourLook({ compact }: GoldenHourLookProps) {
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const quality = getGoldenHourQuality(compact, reducedMotion)

  return (
    <>
      <color attach="background" args={[GOLDEN_HOUR.backgroundColor]} />
      <fog attach="fog" args={[GOLDEN_HOUR.fogColor, GOLDEN_HOUR.fogNear, GOLDEN_HOUR.fogFar]} />

      <ambientLight color={GOLDEN_HOUR.ambientColor} intensity={GOLDEN_HOUR.ambientIntensity} />
      <hemisphereLight
        color={GOLDEN_HOUR.skyFillColor}
        groundColor={GOLDEN_HOUR.groundBounceColor}
        intensity={GOLDEN_HOUR.hemisphereIntensity}
      />
      <directionalLight
        color={GOLDEN_HOUR.sunColor}
        intensity={GOLDEN_HOUR.sunIntensity}
        position={SUN_LIGHT_POSITION}
        castShadow={!compact}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-camera-left={-SHADOW_EXTENT}
        shadow-camera-right={SHADOW_EXTENT}
        shadow-camera-top={SHADOW_EXTENT}
        shadow-camera-bottom={-SHADOW_EXTENT}
        shadow-camera-near={2}
        shadow-camera-far={120}
        shadow-bias={-0.00015}
        shadow-normalBias={0.14}
      />
      <directionalLight color={GOLDEN_HOUR.rimColor} intensity={GOLDEN_HOUR.rimIntensity} position={RIM_LIGHT_POSITION} />
      {quality.scatteringSky ? (
        <>
          <Sky
            distance={200}
            sunPosition={SUN_DIRECTION}
            turbidity={4.5}
            rayleigh={3}
            mieCoefficient={0.012}
            mieDirectionalG={0.85}
          />
          <GradientSkyDome hazeBand />
        </>
      ) : (
        <GradientSkyDome />
      )}
      <GoldenGround />
      {quality.environmentMap && <GoldenEnvironment />}
      {quality.dustMotes && <DustMotes />}
      {quality.postProcessing && <GoldenHourPost />}
    </>
  )
}
