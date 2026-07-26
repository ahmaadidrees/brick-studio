import { Environment, Lightformer } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { ConvexHullCollider, CuboidCollider, RigidBody } from '@react-three/rapier'
import { createContext, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  FROZEN_AMBIENT_TIME,
  GROUND_Y,
  SKY_ISLAND,
  SKY_PALETTE,
  ambientTime,
  createBirdPaths,
  createCloudField,
  createFloatingRocks,
  getSkyIslandQuality,
  islandColliderVertices,
  resolveDistantIslands,
  resolvePropPlacements,
  resolveWaterfalls,
  skyIslandCloudLayers,
  type CloudField,
  type ResolvedWaterfall,
} from './skyIsland'
import {
  createBirdGeometry,
  createCloudPuffGeometry,
  createDistantIslandGeometry,
  createFloatingRockGeometry,
  createGrassTuftGeometry,
  createIslandMassGeometry,
  createPropColliders,
  createPropsGeometry,
  createStreamGeometry,
  createWaterfallRibbonGeometry,
} from './skyIslandMesh'
import { useBrickStore } from './store'

/**
 * Explore-mode diorama: the baseplate crowns a grassy island adrift over a sea
 * of cloud. Everything in this file is mounted only while `mode === 'explore'`,
 * so Build mode renders exactly what it always did.
 */

/** True while Explore runs on a phone-class viewport; brick materials read it. */
export const ExploreCompactContext = createContext(false)

/** Elevation 31 deg, bearing 128 deg — a late-afternoon sun raking the island. */
export const SUN_DIRECTION = new THREE.Vector3(0.675, 0.515, -0.528).normalize()
const SUN_DISTANCE = 96

/* -------------------------------------------------------------- materials */

function useAmbientClock(reducedMotion: boolean) {
  const uniform = useMemo(() => ({ value: FROZEN_AMBIENT_TIME }), [])
  useFrame((state) => {
    uniform.value = ambientTime(state.clock.elapsedTime, reducedMotion)
  })
  return uniform
}

const SWAY_CHUNK = /* glsl */ `
  float swayPhase = uTime * 1.25 + transformed.x * 0.33 + transformed.z * 0.27;
  transformed.x += sin(swayPhase) * aSway * 0.07;
  transformed.z += cos(swayPhase * 0.81) * aSway * 0.055;
  transformed.y -= abs(sin(swayPhase)) * aSway * 0.012;
`

/**
 * One matte material carries the whole diorama: land, trees, rocks, timber.
 * Colour comes from vertex colours, motion from an `aSway` weight painted into
 * canopies, grass and flags at build time.
 */
function useNatureMaterial(time: { value: number }, side: THREE.Side, roughness = 0.86) {
  const material = useMemo(() => {
    const created = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness,
      metalness: 0,
      side,
      dithering: true,
    })
    created.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = time
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSway;\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SWAY_CHUNK}`)
    }
    return created
  }, [time, side, roughness])
  useEffect(() => () => material.dispose(), [material])
  return material
}

/* ------------------------------------------------------------------- sky */

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uAbyss;
uniform vec3 uSun;
uniform vec3 uSunDirection;
varying vec3 vDirection;
void main() {
  vec3 direction = normalize(vDirection);
  float h = direction.y;
  // The camera can barely pitch up, so the blue has to arrive fast: the warm
  // band is thin and the zenith is reached well inside the visible wedge.
  vec3 color = mix(uHorizon, uSky, smoothstep(0.0, 0.11, h));
  color = mix(color, uZenith, smoothstep(0.09, 0.55, h));
  color = mix(uHaze, color, smoothstep(-0.035, 0.02, h));
  // Below the horizon the air deepens, giving the cloud sea something to sit on.
  color = mix(color, uAbyss, smoothstep(-0.02, -0.30, h));
  float toward = max(dot(direction, uSunDirection), 0.0);
  color += uSun * pow(toward, 1200.0) * 2.4;
  color += uSun * pow(toward, 34.0) * 0.5;
  color += uSun * pow(toward, 5.0) * 0.15;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

/** Gradient dome pinned to the camera, so the horizon never parallaxes. */
function SkyDome() {
  const mesh = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const geometry = useMemo(() => new THREE.SphereGeometry(SKY_ISLAND.skyDomeRadius, 32, 20), [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: new THREE.Color(SKY_PALETTE.zenith) },
          uSky: { value: new THREE.Color(SKY_PALETTE.sky) },
          uHorizon: { value: new THREE.Color(SKY_PALETTE.horizon) },
          uHaze: { value: new THREE.Color(SKY_PALETTE.haze) },
          uAbyss: { value: new THREE.Color(SKY_PALETTE.abyss) },
          uSun: { value: new THREE.Color(SKY_PALETTE.sun) },
          uSunDirection: { value: SUN_DIRECTION.clone() },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  )
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  useFrame(() => {
    if (mesh.current) mesh.current.position.copy(camera.position)
  })
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} renderOrder={-1000} />
}

/* ---------------------------------------------------------------- clouds */

const PUFF_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute float aSize;
attribute float aSeed;
attribute float aFlatten;
uniform float uTime;
uniform float uDrift;
varying vec2 vCorner;
varying float vSeed;
varying float vFog;
void main() {
  vec3 center = aCenter;
  float phase = aSeed * 6.2831;
  center.x += sin(uTime * 0.035 + phase) * uDrift;
  center.z += cos(uTime * 0.028 + phase * 1.3) * uDrift;
  center.y += sin(uTime * 0.08 + phase * 2.1) * uDrift * 0.22;
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  float pulse = 1.0 + sin(uTime * 0.24 + phase * 3.0) * 0.05;
  mv.x += position.x * aSize * pulse;
  mv.y += position.y * aSize * aFlatten * pulse;
  vCorner = position.xy;
  vSeed = aSeed;
  vFog = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`

const PUFF_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uOpacity;
varying vec2 vCorner;
varying float vSeed;
varying float vFog;
void main() {
  float d = length(vCorner);
  float angle = atan(vCorner.y, vCorner.x);
  // Two lobe harmonics give each puff its own bulging outline; the edge stays
  // firm rather than feathering, so a bank of them reads as shapes not haze.
  float lobes = 0.8
    + 0.14 * sin(angle * 3.0 + vSeed * 21.0)
    + 0.08 * sin(angle * 5.0 - vSeed * 13.0);
  float alpha = 1.0 - smoothstep(lobes * 0.72, lobes, d);
  if (alpha <= 0.004) discard;
  vec3 color = mix(uBottom, uTop, smoothstep(-0.9, 0.35, vCorner.y));
  // Darken the outer shell so overlapping puffs keep their silhouettes.
  color *= mix(1.0, 0.88, smoothstep(lobes * 0.5, lobes, d));
  color = mix(color, uFogColor, smoothstep(uFogNear, uFogFar, vFog));
  gl_FragColor = vec4(color, alpha * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function usePuffMaterial(
  time: { value: number },
  options: { top: string; bottom: string; opacity: number; drift: number },
) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: time,
          uTop: { value: new THREE.Color(options.top) },
          uBottom: { value: new THREE.Color(options.bottom) },
          uFogColor: { value: new THREE.Color(SKY_PALETTE.cloudHaze) },
          uFogNear: { value: SKY_ISLAND.fogNear * 1.4 },
          uFogFar: { value: SKY_ISLAND.fogFar * 1.6 },
          uOpacity: { value: options.opacity },
          uDrift: { value: options.drift },
        },
        vertexShader: PUFF_VERTEX,
        fragmentShader: PUFF_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [time, options.top, options.bottom, options.opacity, options.drift],
  )
  useEffect(() => () => material.dispose(), [material])
  return material
}

function PuffCloud({
  field,
  material,
  position,
  renderOrder,
}: {
  field: CloudField
  material: THREE.Material
  position?: [number, number, number]
  renderOrder?: number
}) {
  const geometry = useMemo(() => createCloudPuffGeometry(field), [field])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (field.count === 0) return null
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      frustumCulled={false}
      renderOrder={renderOrder ?? 10}
    />
  )
}

/* ------------------------------------------------------------ waterfalls */

const FALL_VERTEX = /* glsl */ `
attribute float aPhase;
varying vec2 vUv;
varying float vPhase;
void main() {
  vUv = uv;
  vPhase = aPhase;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FALL_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uWater;
uniform vec3 uDeep;
uniform vec3 uFoam;
varying vec2 vUv;
varying float vPhase;
void main() {
  float v = 1.0 - vUv.y;
  float flow = uTime * 0.9 + vPhase;
  float s1 = fract(vUv.y * 4.5 - flow * 0.85 + sin(vUv.x * 11.0) * 0.05);
  float s2 = fract(vUv.y * 8.5 - flow * 1.35 + sin(vUv.x * 19.0 + 1.7) * 0.04);
  float s3 = fract(vUv.y * 16.0 - flow * 1.95 + sin(vUv.x * 7.0 - 0.6) * 0.07);
  float streak =
    smoothstep(0.62, 1.0, s1) * 0.55
    + smoothstep(0.74, 1.0, s2) * 0.3
    + smoothstep(0.86, 1.0, s3) * 0.2;
  // Glassy blue at the lip, whipping into white strands as it breaks up.
  vec3 color = mix(uDeep, uWater, clamp(0.25 + v * 0.75, 0.0, 1.0));
  color = mix(color, uFoam, clamp(streak * 0.85, 0.0, 1.0));
  float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
  float alpha = edge * mix(0.66, 0.03, smoothstep(0.22, 1.0, v));
  alpha *= 1.0 - v * 0.8 * (1.0 - streak);
  alpha += streak * edge * 0.3 * (1.0 - smoothstep(0.55, 1.0, v));
  if (alpha <= 0.01) discard;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function Waterfall({
  fall,
  time,
  mistPuffs,
  waterMaterial,
}: {
  fall: ResolvedWaterfall
  time: { value: number }
  mistPuffs: number
  waterMaterial: THREE.Material
}) {
  const ribbon = useMemo(() => createWaterfallRibbonGeometry(fall), [fall])
  const stream = useMemo(() => createStreamGeometry(fall), [fall])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: time,
          uWater: { value: new THREE.Color(SKY_PALETTE.water) },
          uDeep: { value: new THREE.Color(SKY_PALETTE.waterDeep) },
          uFoam: { value: new THREE.Color(SKY_PALETTE.foam) },
        },
        vertexShader: FALL_VERTEX,
        fragmentShader: FALL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [time],
  )
  const mistField = useMemo(
    () =>
      createCloudField([
        {
          count: mistPuffs,
          innerRadius: 0,
          outerRadius: fall.bottomWidth * 0.6,
          minY: -1.4,
          maxY: 1.4,
          minSize: 0.85,
          maxSize: 1.9,
          flatten: 0.85,
          seed: Math.round(fall.angleDeg * 7 + 13),
        },
      ]),
    [mistPuffs, fall.bottomWidth, fall.angleDeg],
  )
  const mistMaterial = usePuffMaterial(time, {
    top: '#ffffff',
    bottom: '#cfe6f5',
    opacity: 0.34,
    drift: 0.7,
  })
  useEffect(() => () => { ribbon.dispose(); stream.dispose(); material.dispose() }, [ribbon, stream, material])

  const outward = new THREE.Vector2(Math.cos(fall.theta), Math.sin(fall.theta))
  return (
    <group>
      <mesh geometry={stream} material={waterMaterial} renderOrder={2} />
      <mesh
        geometry={ribbon}
        material={material}
        position={[fall.lipX, GROUND_Y + 0.02, fall.lipZ]}
        rotation={[0, fall.yaw, 0]}
        renderOrder={3}
      />
      {/* Spring pool feeding the fall. */}
      <mesh position={[fall.poolX, GROUND_Y + 0.015, fall.poolZ]} rotation={[-Math.PI / 2, 0, 0]} material={waterMaterial}>
        <circleGeometry args={[fall.poolRadius, 18]} />
      </mesh>
      <PuffCloud
        field={mistField}
        material={mistMaterial}
        position={[
          fall.lipX + outward.x * fall.bow,
          GROUND_Y - fall.height + 1.2,
          fall.lipZ + outward.y * fall.bow,
        ]}
        renderOrder={12}
      />
      <PuffCloud
        field={mistField}
        material={mistMaterial}
        position={[fall.lipX + outward.x * 0.6, GROUND_Y - 1.1, fall.lipZ + outward.y * 0.6]}
        renderOrder={11}
      />
    </group>
  )
}

/* ---------------------------------------------------------- ambient life */

function FloatingRocks({ count, time }: { count: number; time: { value: number } }) {
  const rocks = useMemo(() => createFloatingRocks(count), [count])
  const geometries = useMemo(
    () => rocks.map((rock, index) => createFloatingRockGeometry(rock.radius, 300 + index * 17)),
    [rocks],
  )
  const group = useRef<THREE.Group>(null)
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  useFrame(() => {
    const node = group.current
    if (!node) return
    node.children.forEach((child, index) => {
      const rock = rocks[index]
      if (!rock) return
      const t = time.value * (0.16 + rock.seed * 0.1) + rock.seed * 8
      child.position.y = rock.y + Math.sin(t) * 1.1
      child.rotation.y = t * 0.25
      child.rotation.z = Math.sin(t * 0.6) * 0.08
    })
  })
  if (count <= 0) return null
  return (
    <group ref={group}>
      {rocks.map((rock, index) => (
        <mesh
          key={`rock-${index}`}
          geometry={geometries[index]}
          position={[rock.x, rock.y, rock.z]}
          castShadow={false}
          receiveShadow
        >
          <meshStandardMaterial vertexColors roughness={0.9} metalness={0} />
        </mesh>
      ))}
    </group>
  )
}

function Birds({ count, time }: { count: number; time: { value: number } }) {
  const paths = useMemo(() => createBirdPaths(count), [count])
  const geometry = useMemo(() => createBirdGeometry(), [])
  const group = useRef<THREE.Group>(null)
  useEffect(() => () => geometry.dispose(), [geometry])
  useFrame(() => {
    const node = group.current
    if (!node) return
    node.children.forEach((child, index) => {
      const path = paths[index]
      if (!path) return
      const angle = path.phase + time.value * path.speed
      child.position.set(
        Math.cos(angle) * path.radius,
        path.height + Math.sin(angle * 2.4) * 2.5,
        Math.sin(angle) * path.radius,
      )
      child.rotation.set(0, -angle + Math.PI / 2, path.bank)
    })
  })
  if (count <= 0) return null
  return (
    <group ref={group}>
      {paths.map((path, index) => (
        <mesh key={`bird-${index}`} geometry={geometry} scale={1.7}>
          <meshBasicMaterial color="#3d4d63" side={THREE.DoubleSide} fog />
        </mesh>
      ))}
    </group>
  )
}

/* --------------------------------------------------------- distant world */

function DistantIslands({ count, time }: { count: number; time: { value: number } }) {
  const islands = useMemo(() => resolveDistantIslands(count), [count])
  const geometries = useMemo(
    () => islands.map((island) => createDistantIslandGeometry(island.radius, island.seed)),
    [islands],
  )
  const material = useNatureMaterial(time, THREE.FrontSide, 0.95)
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries])
  return (
    <group>
      {islands.map((island, index) => (
        <group key={island.id} position={[island.x, island.y, island.z]} rotation={[0, island.yaw, 0]}>
          <mesh geometry={geometries[index]} material={material} />
          {island.hasFall && (
            <mesh position={[0, -island.radius * 0.1, island.radius * 0.55]}>
              <planeGeometry args={[island.radius * 0.22, island.radius * 0.9]} />
              <meshBasicMaterial color={SKY_PALETTE.foam} transparent opacity={0.55} side={THREE.DoubleSide} fog />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

/* ---------------------------------------------------------------- lights */

/**
 * Explore lighting rig. Mounted in place of the neutral Build studio rig, so
 * Build mode keeps its original lights untouched.
 */
export function SkyIslandRig({ compact }: { compact: boolean }) {
  const quality = useMemo(() => getSkyIslandQuality(compact), [compact])
  const sun = useMemo(() => SUN_DIRECTION.clone().multiplyScalar(SUN_DISTANCE), [])
  return (
    <>
      <color attach="background" args={[SKY_PALETTE.haze]} />
      <fog attach="fog" args={[SKY_PALETTE.haze, SKY_ISLAND.fogNear, SKY_ISLAND.fogFar]} />
      <SkyDome />
      {/* Without the Lightformer environment the compact tier has no image-based
          fill, so its analytic fill lights are raised to match. */}
      <hemisphereLight color="#bcd9ff" groundColor="#5d8047" intensity={compact ? 0.9 : 0.52} />
      <ambientLight color="#8ab0e0" intensity={compact ? 0.62 : 0.2} />
      <directionalLight
        castShadow={!compact}
        color="#fff0d2"
        intensity={2.15}
        position={[sun.x, sun.y, sun.z]}
        shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]}
        shadow-bias={-0.0009}
        shadow-normalBias={0.035}
        shadow-camera-near={20}
        shadow-camera-far={200}
        shadow-camera-left={-46}
        shadow-camera-right={46}
        shadow-camera-top={46}
        shadow-camera-bottom={-46}
      />
      {/* Cool bounce off the cloud sea, keeping undersides from going black. */}
      <directionalLight color="#7fb0ea" intensity={compact ? 0.95 : 0.42} position={[-sun.x * 0.6, -34, -sun.z * 0.6]} />
      {/* Sky-side rim so silhouettes separate from the backdrop. */}
      <directionalLight color="#dbeaff" intensity={0.34} position={[-sun.x, 30, -sun.z]} />
      {quality.useEnvironment && (
        <Environment frames={1} resolution={128}>
          <color attach="background" args={[SKY_PALETTE.sky]} />
          <Lightformer form="rect" intensity={5} color="#fff1d4" scale={[24, 24, 1]} position={[14, 12, -11]} target={[0, 0, 0]} />
          <Lightformer form="circle" intensity={2.2} color="#bcdcff" scale={[40, 40, 1]} position={[0, 26, 0]} rotation={[-Math.PI / 2, 0, 0]} />
          <Lightformer form="rect" intensity={1.3} color="#eef6ff" scale={[40, 20, 1]} position={[0, -18, 0]} rotation={[Math.PI / 2, 0, 0]} />
        </Environment>
      )}
    </>
  )
}

/* ----------------------------------------------------------------- world */

/**
 * Island body, dressing, water and colliders. Mounts inside `<Physics>` so the
 * grass shelf is a real walkable surface: its top sits one plate-thickness
 * below the baseplate, inside the character controller's 0.22 autostep.
 */
export function SkyIslandWorld({ compact }: { compact: boolean }) {
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const quality = useMemo(() => getSkyIslandQuality(compact), [compact])
  const time = useAmbientClock(reducedMotion)

  const props = useMemo(() => resolvePropPlacements(compact), [compact])
  const waterfalls = useMemo(() => resolveWaterfalls(compact), [compact])
  const massGeometry = useMemo(
    () => createIslandMassGeometry(quality.outlineSegments, quality.useRockSpurs),
    [quality.outlineSegments, quality.useRockSpurs],
  )
  const propsGeometry = useMemo(() => createPropsGeometry(props, quality.treeSegments), [props, quality.treeSegments])
  const tuftGeometry = useMemo(
    () => createGrassTuftGeometry(quality.grassTufts, props),
    [quality.grassTufts, props],
  )
  const colliderVertices = useMemo(() => islandColliderVertices(), [])
  const propColliders = useMemo(() => createPropColliders(props), [props])
  const cloudField = useMemo(() => createCloudField(skyIslandCloudLayers(quality)), [quality])

  const natureMaterial = useNatureMaterial(time, THREE.FrontSide)
  const tuftMaterial = useNatureMaterial(time, THREE.DoubleSide, 0.92)
  const cloudMaterial = usePuffMaterial(time, {
    top: SKY_PALETTE.cloudLit,
    bottom: SKY_PALETTE.cloudShade,
    opacity: 0.97,
    drift: 4.2,
  })
  const waterMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: SKY_PALETTE.water,
        roughness: 0.08,
        metalness: 0.1,
        transparent: true,
        opacity: 0.86,
        envMapIntensity: 1.4,
        side: THREE.DoubleSide,
      }),
    [],
  )

  useEffect(() => () => {
    massGeometry.dispose()
    propsGeometry.dispose()
    tuftGeometry?.dispose()
    waterMaterial.dispose()
  }, [massGeometry, propsGeometry, tuftGeometry, waterMaterial])

  return (
    <group>
      <RigidBody type="fixed" colliders={false}>
        <ConvexHullCollider args={[colliderVertices]} />
        {propColliders.map((collider, index) => (
          <CuboidCollider
            key={`prop-collider-${index}`}
            args={collider.halfExtents}
            position={collider.position}
            rotation={collider.rotation}
          />
        ))}
      </RigidBody>

      <mesh geometry={massGeometry} material={natureMaterial} receiveShadow castShadow={false} />
      <mesh geometry={propsGeometry} material={natureMaterial} castShadow receiveShadow />
      {tuftGeometry && <mesh geometry={tuftGeometry} material={tuftMaterial} receiveShadow />}

      {waterfalls.map((fall) => (
        <Waterfall key={fall.id} fall={fall} time={time} mistPuffs={quality.mistPuffs} waterMaterial={waterMaterial} />
      ))}

      <DistantIslands count={quality.distantIslands} time={time} />
      <FloatingRocks count={quality.floatingRocks} time={time} />
      <Birds count={quality.birds} time={time} />
      <PuffCloud field={cloudField} material={cloudMaterial} />
    </group>
  )
}
