import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  PLATE_HALF_EXTENT,
  VALLEY_CAMERA_FAR,
  VALLEY_FOG_FAR,
  VALLEY_FOG_NEAR,
  VALLEY_GROUND_COLLIDER_CENTRE_Y,
  VALLEY_GROUND_COLLIDER_HALF_EXTENT,
  VALLEY_GROUND_COLLIDER_THICKNESS,
  VALLEY_GROUND_Y,
  VALLEY_HORIZON_COLOR,
  VALLEY_SKY_MID_COLOR,
  VALLEY_SKY_RADIUS,
  VALLEY_SKY_ZENITH_COLOR,
  VALLEY_SUN_COLOR,
  VALLEY_SUN_DIRECTION,
  buildValleyBandGeometries,
  buildValleyCloudGeometry,
  buildValleyColliders,
  buildValleyGroundGeometry,
  buildValleyWaterGeometry,
  createValleyLayout,
  valleyGroundUnderlayExtent,
  type ValleyCloud,
  type ValleyQuality,
} from './brickValley'
import { useBrickStore } from './store'

const CLOUD_WRAP = 210

type ShaderPatch = (shader: { vertexShader: string; uniforms: Record<string, unknown> }) => void

/**
 * Foliage sway. The merged landscape is one draw call, so per-tree motion has to
 * happen in the vertex shader: `aWind` (baked in brickValley) is the per-vertex
 * permission slip, and a single uniform switches the whole thing off for
 * reduced motion.
 */
function useValleyWind(reducedMotion: boolean): ShaderPatch {
  const uniforms = useRef({ time: { value: 0 }, strength: { value: 0 } })

  useEffect(() => {
    uniforms.current.strength.value = reducedMotion ? 0 : 1
  }, [reducedMotion])

  useFrame((_, delta) => {
    if (reducedMotion) return
    uniforms.current.time.value += delta
  })

  return useCallback<ShaderPatch>((shader) => {
    shader.uniforms.uValleyTime = uniforms.current.time
    shader.uniforms.uValleyWind = uniforms.current.strength
    shader.vertexShader = `attribute float aWind;
uniform float uValleyTime;
uniform float uValleyWind;
${shader.vertexShader}`.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  float valleyWind = aWind * uValleyWind;
  if (valleyWind > 0.0) {
    float valleyPhase = uValleyTime * 1.5 + transformed.x * 0.31 + transformed.z * 0.27;
    transformed.x += sin(valleyPhase) * valleyWind;
    transformed.z += cos(valleyPhase * 0.77) * valleyWind * 0.65;
  }`,
    )
  }, [])
}

function createBandMaterial(band: 'near' | 'mid' | 'far', quality: ValleyQuality, patch: ShaderPatch) {
  const shared = { vertexColors: true, dithering: true }
  let material: THREE.Material
  if (band === 'far') {
    // Distant ridges need silhouette and haze, not specular — Lambert is the
    // cheapest thing that still takes the key light.
    material = new THREE.MeshLambertMaterial({ ...shared })
  } else if (band === 'near' && quality === 'full') {
    material = new THREE.MeshPhysicalMaterial({
      ...shared,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.72,
      clearcoatRoughness: 0.24,
    })
  } else {
    material = new THREE.MeshStandardMaterial({ ...shared, roughness: 0.62, metalness: 0 })
  }
  material.onBeforeCompile = patch as THREE.Material['onBeforeCompile']
  // Without a distinct cache key three would hand this material the program it
  // compiled for an unpatched material of the same type.
  material.customProgramCacheKey = () => `brick-valley-${band}-${quality}`
  return material
}

/**
 * Sky dome. Static at the origin rather than pinned to the camera: at this
 * radius the few dozen units a kid can walk are invisible, and skipping the
 * per-frame follow keeps the explore frame budget for the character.
 */
function ValleySky() {
  const material = useMemo(() => {
    const sun = new THREE.Vector3(...VALLEY_SUN_DIRECTION).normalize()
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Color(VALLEY_SKY_ZENITH_COLOR) },
        uMid: { value: new THREE.Color(VALLEY_SKY_MID_COLOR) },
        uHorizon: { value: new THREE.Color(VALLEY_HORIZON_COLOR) },
        uSunColor: { value: new THREE.Color(VALLEY_SUN_COLOR) },
        uSunDirection: { value: sun },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDirection;
        varying vec3 vDirection;
        // No <*_pars_fragment> includes here: WebGLProgram already prepends the
        // tone-mapping and colour-space helpers to every fragment shader, and a
        // second copy fails to compile. The sky must run through both so it ends
        // up in exactly the same space as the fog it has to meet at the horizon.
        void main() {
          vec3 direction = normalize(vDirection);
          float height = direction.y;
          vec3 sky = mix(uHorizon, uMid, smoothstep(-0.02, 0.34, height));
          sky = mix(sky, uZenith, smoothstep(0.26, 0.92, height));
          float sun = max(dot(direction, uSunDirection), 0.0);
          sky += uSunColor * pow(sun, 320.0) * 1.6;
          sky += uSunColor * pow(sun, 7.0) * 0.2;
          sky = mix(sky, uHorizon, smoothstep(0.0, -0.14, height));
          gl_FragColor = vec4(sky, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
  }, [])

  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[VALLEY_SKY_RADIUS, 32, 18]} />
    </mesh>
  )
}

/**
 * Background and fog are assigned imperatively so that swapping modes can never
 * leave the scene with a half-applied atmosphere: declarative `attach` children
 * restore whatever they replaced when they unmount, which fights a sibling that
 * is attaching in the same commit. Build's values are reproduced exactly.
 */
export function SceneAtmosphere({ explore }: { explore: boolean }) {
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useLayoutEffect(() => {
    const background = new THREE.Color(explore ? VALLEY_HORIZON_COLOR : '#f4f2ed')
    const fog = explore
      ? new THREE.Fog(VALLEY_HORIZON_COLOR, VALLEY_FOG_NEAR, VALLEY_FOG_FAR)
      : new THREE.Fog('#f4f2ed', 42, 90)
    scene.background = background
    scene.fog = fog
    return () => {
      scene.background = null
      scene.fog = null
    }
  }, [explore, scene])

  useLayoutEffect(() => {
    if (!explore || !(camera instanceof THREE.PerspectiveCamera)) return
    const previousFar = camera.far
    camera.far = VALLEY_CAMERA_FAR
    camera.updateProjectionMatrix()
    return () => {
      camera.far = previousFar
      camera.updateProjectionMatrix()
    }
  }, [camera, explore])

  return null
}

/**
 * Three-point rig: a warm key that carries the shadows, a cool sky fill, and a
 * low bounce standing in for light coming back off the meadow. The key's shadow
 * frustum rides the camera so a kid keeps a crisp shadow anywhere in the valley
 * instead of only over the plate.
 */
function ValleyLights({ quality }: { quality: ValleyQuality }) {
  const compact = quality === 'compact'
  const key = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const focus = useRef(new THREE.Vector3())
  const forward = useRef(new THREE.Vector3())
  const sun = useMemo(() => new THREE.Vector3(...VALLEY_SUN_DIRECTION).normalize(), [])

  useFrame((state) => {
    const light = key.current
    if (!light) return
    state.camera.getWorldDirection(forward.current)
    focus.current.copy(state.camera.position).addScaledVector(forward.current, 9)
    focus.current.y = 0
    // Snapping keeps the shadow texels from crawling as the camera glides.
    focus.current.x = Math.round(focus.current.x * 2) / 2
    focus.current.z = Math.round(focus.current.z * 2) / 2
    target.position.copy(focus.current)
    target.updateMatrixWorld()
    light.position.copy(focus.current).addScaledVector(sun, 48)
  })

  return (
    <>
      <primitive object={target} />
      <hemisphereLight color="#d7efff" groundColor="#5f8f43" intensity={compact ? 1.5 : 1.05} />
      <ambientLight color="#ffffff" intensity={compact ? 0.5 : 0.32} />
      <directionalLight
        ref={key}
        target={target}
        color="#fff3da"
        intensity={compact ? 2.4 : 2.75}
        castShadow={!compact}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-bias={-0.0006}
        shadow-normalBias={0.03}
      />
      <directionalLight color="#a8d0ff" intensity={0.6} position={[-38, 26, -30]} />
      <directionalLight color="#ffd9a4" intensity={0.34} position={[10, 6, -46]} />
    </>
  )
}

/** Offline studio light: no network fetch, just emissive cards rendered once. */
function ValleyEnvironment() {
  return (
    <Environment frames={1} resolution={96} environmentIntensity={0.34}>
      <Lightformer form="rect" intensity={2.4} color="#fff6e2" scale={[60, 24, 1]} position={[24, 34, 18]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.1} color="#bfe2ff" scale={[70, 30, 1]} position={[-32, 22, -24]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.7} color="#9ad46a" scale={[90, 90, 1]} position={[0, -30, 0]} rotation={[-Math.PI / 2, 0, 0]} />
    </Environment>
  )
}

function ValleyClouds({ clouds, quality, reducedMotion }: { clouds: ValleyCloud[]; quality: ValleyQuality; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null)
  const geometries = useMemo(() => clouds.map((cloud) => buildValleyCloudGeometry(cloud, quality)), [clouds, quality])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, fog: true }),
    [],
  )

  useEffect(() => () => {
    material.dispose()
    for (const geometry of geometries) geometry.dispose()
  }, [geometries, material])

  useFrame((_, delta) => {
    if (reducedMotion || !group.current) return
    for (const [index, child] of group.current.children.entries()) {
      const cloud = clouds[index]
      if (!cloud) continue
      child.position.x += cloud.drift * delta
      if (child.position.x > CLOUD_WRAP) child.position.x -= CLOUD_WRAP * 2
    }
  })

  return (
    <group ref={group}>
      {clouds.map((cloud, index) => (
        <mesh
          key={index}
          geometry={geometries[index]}
          material={material}
          position={[cloud.x, cloud.y, cloud.z]}
          frustumCulled={false}
        />
      ))}
    </group>
  )
}

function ValleyWater({ geometry, reducedMotion }: { geometry: THREE.BufferGeometry | null; reducedMotion: boolean }) {
  const mesh = useRef<THREE.Mesh>(null)
  const elapsed = useRef(0)
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.78,
        roughness: 0.12,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
    [],
  )

  useEffect(() => () => material.dispose(), [material])

  useFrame((_, delta) => {
    if (reducedMotion || !mesh.current) return
    elapsed.current += delta
    mesh.current.position.y = Math.sin(elapsed.current * 0.9) * 0.035
  })

  if (!geometry) return null
  return <mesh ref={mesh} geometry={geometry} material={material} receiveShadow />
}

/**
 * The diorama itself. Everything static merges into three geometries (one per
 * distance band) so the whole valley costs three draw calls, and the palette is
 * baked per-vertex — saturated at the plate, pastel at the ridge — which is what
 * makes it read as landscape rather than as scattered props.
 */
export function BrickValley({ compact }: { compact: boolean }) {
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const quality: ValleyQuality = compact ? 'compact' : 'full'
  const windPatch = useValleyWind(reducedMotion)

  const layout = useMemo(() => createValleyLayout({ quality }), [quality])
  const bands = useMemo(() => buildValleyBandGeometries(layout), [layout])
  const ground = useMemo(() => buildValleyGroundGeometry(quality), [quality])
  const water = useMemo(() => buildValleyWaterGeometry(layout), [layout])
  const colliders = useMemo(() => buildValleyColliders(layout), [layout])
  const underlayExtent = valleyGroundUnderlayExtent(quality)

  const materials = useMemo(
    () => ({
      near: createBandMaterial('near', quality, windPatch),
      mid: createBandMaterial('mid', quality, windPatch),
      far: createBandMaterial('far', quality, windPatch),
      ground: createBandMaterial('mid', quality, windPatch),
    }),
    [quality, windPatch],
  )

  useEffect(() => () => {
    for (const material of Object.values(materials)) material.dispose()
  }, [materials])

  useEffect(() => () => {
    ground.dispose()
    water?.dispose()
    for (const geometry of Object.values(bands)) geometry?.dispose()
  }, [bands, ground, water])

  return (
    <>
      <ValleySky />
      <ValleyLights quality={quality} />
      {!compact && <ValleyEnvironment />}

      <mesh geometry={ground} material={materials.ground} receiveShadow frustumCulled={false} />
      {/* Backs the seams between the ground plates so they read as gaps, not holes. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, VALLEY_GROUND_Y - 0.9, 0]}>
        <planeGeometry args={[underlayExtent, underlayExtent]} />
        <meshBasicMaterial color="#3f6b2c" />
      </mesh>

      {bands.far && <mesh geometry={bands.far} material={materials.far} frustumCulled={false} />}
      {bands.mid && <mesh geometry={bands.mid} material={materials.mid} receiveShadow frustumCulled={false} />}
      {bands.near && <mesh geometry={bands.near} material={materials.near} castShadow receiveShadow frustumCulled={false} />}

      <ValleyWater geometry={water} reducedMotion={reducedMotion} />
      <ValleyClouds clouds={layout.clouds} quality={quality} reducedMotion={reducedMotion} />

      {/* Shadow maps are off on the compact ladder, so the plate gets a baked
          contact pool instead of floating on the meadow. */}
      {compact && (
        <ContactShadows
          frames={1}
          position={[0, VALLEY_GROUND_Y + 0.01, 0]}
          scale={PLATE_HALF_EXTENT * 2.6}
          resolution={256}
          blur={2.4}
          opacity={0.5}
          far={6}
          color="#2c4a1c"
        />
      )}

      <RigidBody type="fixed" colliders={false}>
        {/* Plate-level floor: stepping off the plate is a 0.18 drop and stepping
            back on is inside the controller's 0.22 autostep. */}
        <CuboidCollider
          args={[
            VALLEY_GROUND_COLLIDER_HALF_EXTENT,
            VALLEY_GROUND_COLLIDER_THICKNESS,
            VALLEY_GROUND_COLLIDER_HALF_EXTENT,
          ]}
          position={[0, VALLEY_GROUND_COLLIDER_CENTRE_Y, 0]}
        />
        {colliders.map((collider, index) => (
          <CuboidCollider
            key={index}
            args={collider.halfExtents}
            position={collider.position}
            rotation={[0, collider.yaw, 0]}
          />
        ))}
      </RigidBody>
    </>
  )
}
