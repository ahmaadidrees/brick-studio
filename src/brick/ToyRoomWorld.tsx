import { ContactShadows } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, CylinderCollider } from '@react-three/rapier'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { createBrickGeometry } from './geometry'
import { BRICK_PART_MAP } from './parts'
import {
  BOOK_COUNT,
  BOOK_HALF_LENGTH,
  BOOK_HALF_WIDTH,
  BOOK_THICKNESS,
  DESK_HALF_X,
  DESK_HALF_Z,
  DESK_GUARD_HEIGHT,
  DESK_LEG_INSET,
  DESK_RIM_HEIGHT,
  DESK_RIM_WIDTH,
  DESK_SLAB_THICKNESS,
  DESK_TOP_Y,
  LAMP_BASE,
  LAMP_ELBOW,
  LAMP_SHADE,
  LAMP_SHADE_RADIUS,
  LAMP_TARGET,
  RAMP_LENGTH,
  RAMP_THICKNESS,
  RAMP_WIDTH,
  ROOM,
  TOY_PROPS,
  WINDOW,
  rulerRampPose,
  toyRoomFeatures,
  type ToyProp,
  type ToyRoomFeatures,
} from './toyRoom'
import {
  createBeamAlphaTexture,
  createCoffeeRingTexture,
  createDieTexture,
  createDustTexture,
  createFloorTexture,
  createLetterTexture,
  createPageTexture,
  createWallpaperTexture,
  createWoodTexture,
  disposeTextures,
} from './toyRoomTextures'
import { useBrickStore } from './store'

/** Warm evening room: the lamp is the only hot light, everything else is dusk. */
export const TOY_ROOM_FOG_COLOR = '#6a7181'
export const TOY_ROOM_FOG_NEAR = 48
export const TOY_ROOM_FOG_FAR = 430
const LAMP_WARM = '#ffcf94'
const WINDOW_COOL = '#b9d2ff'

const UP = new THREE.Vector3(0, 1, 0)

/** Rapier colliders take a plain XYZ euler, so bake yaw-then-pitch into one. */
function yawPitchEuler(yaw: number, pitch: number): [number, number, number] {
  const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))
  const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ')
  return [euler.x, euler.y, euler.z]
}

function vec(point: { x: number; y: number; z: number }) {
  return new THREE.Vector3(point.x, point.y, point.z)
}

/** A cylinder spanning two world points — the lamp's arm segments. */
function Strut({
  from,
  to,
  radius,
  segments,
  color,
  metalness = 0.55,
  roughness = 0.4,
}: {
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
  radius: number
  segments: number
  color: string
  metalness?: number
  roughness?: number
}) {
  const pose = useMemo(() => {
    const start = vec(from)
    const end = vec(to)
    const direction = end.clone().sub(start)
    return {
      position: start.clone().add(end).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize()),
      length: direction.length(),
    }
  }, [from, to])

  return (
    <mesh position={pose.position} quaternion={pose.quaternion} castShadow>
      <cylinderGeometry args={[radius, radius, pose.length, segments]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

/* -------------------------------------------------------------------------- */
/* Room                                                                        */
/* -------------------------------------------------------------------------- */

function RoomShell({ features }: { features: ToyRoomFeatures }) {
  const textures = useMemo(() => ({
    wallpaper: createWallpaperTexture(features.woodTextureSize),
    floor: createFloorTexture(256),
  }), [features.woodTextureSize])

  useEffect(() => () => disposeTextures([textures.wallpaper, textures.floor]), [textures])

  useEffect(() => {
    textures.wallpaper.repeat.set(7, 4)
    textures.floor.repeat.set(6, 6)
  }, [textures])

  const wallHeight = ROOM.ceilingY - ROOM.floorY
  const wallCenterY = (ROOM.ceilingY + ROOM.floorY) / 2
  // Walls overlap by a few units at each corner so no seam can leak the background.
  const width = ROOM.rightWallX - ROOM.leftWallX + 16
  const depth = ROOM.farWallZ - ROOM.backWallZ + 16
  const centerX = (ROOM.rightWallX + ROOM.leftWallX) / 2
  const centerZ = (ROOM.farWallZ + ROOM.backWallZ) / 2

  return (
    <group>
      {/* Back wall */}
      <mesh position={[centerX, wallCenterY, ROOM.backWallZ]} receiveShadow>
        <planeGeometry args={[width, wallHeight]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.96} />
      </mesh>
      {/* Left wall */}
      <mesh position={[ROOM.leftWallX, wallCenterY, centerZ]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, wallHeight]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.96} />
      </mesh>
      {/* Far walls close the room off behind the haze. */}
      <mesh position={[centerX, wallCenterY, ROOM.farWallZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[width, wallHeight]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.98} />
      </mesh>
      <mesh position={[ROOM.rightWallX, wallCenterY, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[depth, wallHeight]} />
        <meshStandardMaterial map={textures.wallpaper} roughness={0.98} />
      </mesh>
      {/* Skirting board grounds the walls. */}
      <mesh position={[centerX, ROOM.floorY + 5, ROOM.backWallZ + 1]}>
        <boxGeometry args={[width, 10, 2]} />
        <meshStandardMaterial color="#e6e2d6" roughness={0.7} />
      </mesh>
      <mesh position={[ROOM.leftWallX + 1, ROOM.floorY + 5, centerZ]}>
        <boxGeometry args={[2, 10, depth]} />
        <meshStandardMaterial color="#e6e2d6" roughness={0.7} />
      </mesh>
      {/* Floor, far below the table edge. */}
      <mesh position={[centerX, ROOM.floorY, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial map={textures.floor} roughness={0.85} />
      </mesh>
      <mesh position={[80, ROOM.floorY + 0.4, 105]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[92, 40]} />
        <meshStandardMaterial color="#8d5c63" roughness={1} />
      </mesh>
      <mesh position={[80, ROOM.floorY + 0.6, 105]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[70, 81, 40]} />
        <meshStandardMaterial color="#c98f7d" roughness={1} />
      </mesh>
      {features.distantFurniture && <DistantFurniture />}
    </group>
  )
}

/**
 * Simple massing on the bedroom floor, far below the table. Everything is kept
 * clear of the table's sight lines: the payoff is looking *down* over the rail
 * at a room you are far too small to reach, not a wall of furniture at eye level.
 */
function DistantFurniture() {
  return (
    <group>
      {/* Bed in the far corner */}
      <mesh position={[148, ROOM.floorY + 13, 118]}>
        <boxGeometry args={[112, 26, 176]} />
        <meshStandardMaterial color="#9c8770" roughness={0.9} />
      </mesh>
      <mesh position={[148, ROOM.floorY + 32, 126]}>
        <boxGeometry args={[108, 14, 158]} />
        <meshStandardMaterial color="#78a0b8" roughness={1} />
      </mesh>
      <mesh position={[148, ROOM.floorY + 40, 56]}>
        <boxGeometry args={[74, 22, 32]} />
        <meshStandardMaterial color="#efe9dc" roughness={1} />
      </mesh>
      <mesh position={[148, ROOM.floorY + 34, 34]}>
        <boxGeometry args={[112, 68, 8]} />
        <meshStandardMaterial color="#8d7660" roughness={0.9} />
      </mesh>
      {/* Bookshelf in the far corner, low enough not to loom over the table */}
      <mesh position={[54, ROOM.floorY + 30, 176]}>
        <boxGeometry args={[92, 60, 24]} />
        <meshStandardMaterial color="#93795c" roughness={0.9} />
      </mesh>
      {[0, 1].map((shelf) => (
        <mesh key={shelf} position={[54, ROOM.floorY + 16 + shelf * 30, 174]}>
          <boxGeometry args={[82, 18, 18]} />
          <meshStandardMaterial color={['#bf6650', '#4f8f80'][shelf]} roughness={1} />
        </mesh>
      ))}
      {/* Toy chest */}
      <mesh position={[-24, ROOM.floorY + 21, 132]}>
        <boxGeometry args={[70, 42, 48]} />
        <meshStandardMaterial color="#5f93ba" roughness={0.85} />
      </mesh>
      <mesh position={[-24, ROOM.floorY + 44, 132]}>
        <boxGeometry args={[74, 6, 52]} />
        <meshStandardMaterial color="#4b7c9e" roughness={0.85} />
      </mesh>
      {/* A ball and a wooden block left out on the rug */}
      <mesh position={[62, ROOM.floorY + 12, 92]}>
        <sphereGeometry args={[12, 16, 12]} />
        <meshStandardMaterial color="#e05a4c" roughness={0.5} />
      </mesh>
      <mesh position={[22, ROOM.floorY + 7, 122]} rotation={[0, 0.6, 0]}>
        <boxGeometry args={[14, 14, 14]} />
        <meshStandardMaterial color="#eddcb6" roughness={0.85} />
      </mesh>
    </group>
  )
}

/** The window is a lit panel on the wall — the motivated source of the cool fill. */
function RoomWindow() {
  return (
    <group position={[WINDOW.x, WINDOW.centerY, WINDOW.centerZ]} rotation={[0, Math.PI / 2, 0]}>
      <mesh position={[0, 0, 0.4]}>
        <planeGeometry args={[WINDOW.halfWidth * 2, WINDOW.halfHeight * 2]} />
        <meshBasicMaterial color="#e9f2ff" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.9]}>
        <planeGeometry args={[WINDOW.halfWidth * 2.6, WINDOW.halfHeight * 2.5]} />
        <meshBasicMaterial color={WINDOW_COOL} transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Frame and glazing bars */}
      <mesh position={[0, 0, 0.6]}>
        <boxGeometry args={[1.6, WINDOW.halfHeight * 2, 1.2]} />
        <meshStandardMaterial color="#f3efe6" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.6]}>
        <boxGeometry args={[WINDOW.halfWidth * 2, 1.6, 1.2]} />
        <meshStandardMaterial color="#f3efe6" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.2]}>
        <boxGeometry args={[WINDOW.halfWidth * 2 + 7, WINDOW.halfHeight * 2 + 7, 1.6]} />
        <meshStandardMaterial color="#efe9dc" roughness={0.65} />
      </mesh>
      <mesh position={[0, -WINDOW.halfHeight - 5, 1.6]}>
        <boxGeometry args={[WINDOW.halfWidth * 2 + 12, 2.4, 5]} />
        <meshStandardMaterial color="#efe9dc" roughness={0.65} />
      </mesh>
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* Table                                                                       */
/* -------------------------------------------------------------------------- */

function PlayTable({ features }: { features: ToyRoomFeatures }) {
  const wood = useMemo(() => createWoodTexture(features.woodTextureSize), [features.woodTextureSize])
  useEffect(() => {
    wood.repeat.set(3.2, 2.4)
    return () => wood.dispose()
  }, [wood])

  const rails: { position: [number, number, number]; size: [number, number] }[] = [
    { position: [0, 0, DESK_HALF_Z - DESK_RIM_WIDTH / 2], size: [DESK_HALF_X * 2, DESK_RIM_WIDTH] },
    { position: [0, 0, -DESK_HALF_Z + DESK_RIM_WIDTH / 2], size: [DESK_HALF_X * 2, DESK_RIM_WIDTH] },
    { position: [DESK_HALF_X - DESK_RIM_WIDTH / 2, 0, 0], size: [DESK_RIM_WIDTH, DESK_HALF_Z * 2] },
    { position: [-DESK_HALF_X + DESK_RIM_WIDTH / 2, 0, 0], size: [DESK_RIM_WIDTH, DESK_HALF_Z * 2] },
  ]

  const legX = DESK_HALF_X - DESK_LEG_INSET
  const legZ = DESK_HALF_Z - DESK_LEG_INSET
  const legHeight = DESK_TOP_Y - DESK_SLAB_THICKNESS - ROOM.floorY

  return (
    <group>
      {/* Varnished top — the walkable surface the plate rests on. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, DESK_TOP_Y, 0]} receiveShadow>
        <planeGeometry args={[DESK_HALF_X * 2, DESK_HALF_Z * 2]} />
        {features.clearcoat
          ? <meshPhysicalMaterial map={wood} roughness={0.46} metalness={0} clearcoat={0.35} clearcoatRoughness={0.42} />
          : <meshStandardMaterial map={wood} roughness={0.58} metalness={0} />}
      </mesh>
      {/* Slab body */}
      <mesh position={[0, DESK_TOP_Y - 0.02 - DESK_SLAB_THICKNESS / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[DESK_HALF_X * 2, DESK_SLAB_THICKNESS, DESK_HALF_Z * 2]} />
        <meshStandardMaterial color="#9c6a3c" roughness={0.72} />
      </mesh>
      {/* Low bull-nosed rail: a visible barrier you can also hop onto for the view. */}
      {rails.map((rail, index) => {
        const lengthwise = rail.size[0] > rail.size[1]
        return (
          <group key={index} position={[rail.position[0], 0, rail.position[2]]}>
            <mesh position={[0, DESK_TOP_Y + DESK_RIM_HEIGHT / 2 - 0.5, 0]} castShadow receiveShadow>
              <boxGeometry args={[rail.size[0], DESK_RIM_HEIGHT + 1, rail.size[1]]} />
              <meshStandardMaterial color="#a8713f" roughness={0.6} />
            </mesh>
            <mesh
              position={[
                lengthwise ? 0 : (rail.position[0] > 0 ? 0.42 : -0.42),
                DESK_TOP_Y + DESK_RIM_HEIGHT - 0.34,
                lengthwise ? (rail.position[2] > 0 ? 0.42 : -0.42) : 0,
              ]}
              rotation={lengthwise ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0]}
              castShadow
            >
              <cylinderGeometry args={[0.36, 0.36, Math.max(rail.size[0], rail.size[1]), Math.max(8, features.roundSegments / 2)]} />
              <meshStandardMaterial color="#bb8149" roughness={0.5} />
            </mesh>
          </group>
        )
      })}
      {/* Legs, seen when you peer over the rail. */}
      {[[legX, legZ], [-legX, legZ], [legX, -legZ], [-legX, -legZ]].map(([x, z], index) => (
        <mesh key={index} position={[x, DESK_TOP_Y - DESK_SLAB_THICKNESS - legHeight / 2, z]}>
          <boxGeometry args={[7, legHeight, 7]} />
          <meshStandardMaterial color="#8a5d33" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* Hero props                                                                  */
/* -------------------------------------------------------------------------- */

/** Hero prop 1: the swing-arm lamp that lights the whole diorama. */
function DeskLamp({ features }: { features: ToyRoomFeatures }) {
  const shadeQuaternion = useMemo(() => {
    const direction = vec(LAMP_TARGET).sub(vec(LAMP_SHADE)).normalize()
    return new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().negate())
  }, [])
  const segments = features.roundSegments

  return (
    <group>
      <mesh position={[LAMP_BASE.x, LAMP_BASE.y + 0.7, LAMP_BASE.z]} castShadow receiveShadow>
        <cylinderGeometry args={[7.2, 7.5, 1.4, segments]} />
        <meshStandardMaterial color="#2f8a95" metalness={0.3} roughness={0.36} />
      </mesh>
      <mesh position={[LAMP_BASE.x, LAMP_BASE.y + 1.7, LAMP_BASE.z]} castShadow>
        <cylinderGeometry args={[3.2, 4.6, 1.2, segments]} />
        <meshStandardMaterial color="#e9e2d0" metalness={0.2} roughness={0.4} />
      </mesh>
      <Strut from={{ ...LAMP_BASE, y: LAMP_BASE.y + 2 }} to={LAMP_ELBOW} radius={0.62} segments={Math.max(8, segments / 2)} color="#d9d2bf" metalness={0.35} roughness={0.36} />
      <mesh position={[LAMP_ELBOW.x, LAMP_ELBOW.y, LAMP_ELBOW.z]} castShadow>
        <sphereGeometry args={[1.15, segments / 2, segments / 3]} />
        <meshStandardMaterial color="#2f8a95" metalness={0.4} roughness={0.32} />
      </mesh>
      <Strut from={LAMP_ELBOW} to={{ ...LAMP_SHADE, y: LAMP_SHADE.y + 2.4 }} radius={0.55} segments={Math.max(8, segments / 2)} color="#d9d2bf" metalness={0.35} roughness={0.36} />

      <group position={[LAMP_SHADE.x, LAMP_SHADE.y, LAMP_SHADE.z]} quaternion={shadeQuaternion}>
        {/* Painted outside */}
        <mesh position={[0, 3.5, 0]} castShadow>
          <cylinderGeometry args={[2.6, LAMP_SHADE_RADIUS, 7, segments, 1, true]} />
          <meshStandardMaterial color="#35a0ad" emissive="#0e3a40" emissiveIntensity={0.5} metalness={0.25} roughness={0.38} side={THREE.FrontSide} />
        </mesh>
        {/* Hot enamel inside */}
        <mesh position={[0, 3.5, 0]}>
          <cylinderGeometry args={[2.5, LAMP_SHADE_RADIUS - 0.12, 6.9, segments, 1, true]} />
          <meshStandardMaterial color="#fff1d6" emissive={LAMP_WARM} emissiveIntensity={1.5} roughness={0.85} side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, 7, 0]} castShadow>
          <sphereGeometry args={[2.7, segments, segments / 2, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#35a0ad" emissive="#0e3a40" emissiveIntensity={0.5} metalness={0.25} roughness={0.38} />
        </mesh>
        {/* Bulb */}
        <mesh position={[0, 2.6, 0]}>
          <sphereGeometry args={[1.9, segments / 2, segments / 3]} />
          <meshBasicMaterial color="#fff6e2" toneMapped={false} />
        </mesh>
      </group>
    </group>
  )
}

/** Hero prop 2: the book cliff, with a ruler leaned against it as the way up. */
function BookStack({ features }: { features: ToyRoomFeatures }) {
  const page = useMemo(() => createPageTexture(), [])
  useEffect(() => {
    page.repeat.set(1, 3)
    return () => page.dispose()
  }, [page])

  const books = TOY_PROPS.filter((prop) => prop.kind === 'book')

  return (
    <group>
      {books.map((book) => {
        const [halfLength, halfWidth] = book.half
        const lift = DESK_TOP_Y + (book.lift ?? 0)
        return (
          <group key={book.id} position={[book.x, lift, book.z]} rotation={[0, book.rotation, 0]}>
            {/* Page block */}
            <mesh position={[0, BOOK_THICKNESS / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[halfLength * 2 - 0.7, BOOK_THICKNESS - 0.7, halfWidth * 2 - 0.7]} />
              <meshStandardMaterial map={page} color="#fbf3e0" roughness={0.94} />
            </mesh>
            {/* Boards */}
            <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
              <boxGeometry args={[halfLength * 2, 0.36, halfWidth * 2]} />
              <meshStandardMaterial color={book.color} roughness={0.66} />
            </mesh>
            <mesh position={[0, BOOK_THICKNESS - 0.18, 0]} castShadow receiveShadow>
              <boxGeometry args={[halfLength * 2, 0.36, halfWidth * 2]} />
              <meshStandardMaterial color={book.color} roughness={0.66} />
            </mesh>
            {/* Spine */}
            <mesh position={[-halfLength + 0.3, BOOK_THICKNESS / 2, 0]} castShadow>
              <boxGeometry args={[0.62, BOOK_THICKNESS, halfWidth * 2]} />
              <meshStandardMaterial color={book.color} roughness={0.6} />
            </mesh>
            <mesh position={[-halfLength + 0.28, BOOK_THICKNESS / 2, 0]}>
              <boxGeometry args={[0.66, 0.5, halfWidth * 1.1]} />
              <meshStandardMaterial color="#dfb35c" metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[0, BOOK_THICKNESS + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[halfLength * 1.1, halfWidth * 0.34]} />
              <meshStandardMaterial color="#e8c877" roughness={0.5} metalness={0.35} />
            </mesh>
          </group>
        )
      })}
      <RulerRamp features={features} />
    </group>
  )
}

function RulerRamp({ features }: { features: ToyRoomFeatures }) {
  const pose = useMemo(rulerRampPose, [])
  const rotation = useMemo(() => yawPitchEuler(pose.rotation, pose.pitch), [pose])
  const ticks = useMemo(() => Array.from({ length: 12 }, (_, index) => index), [])

  return (
    <group position={[pose.x, DESK_TOP_Y + pose.y, pose.z]} rotation={rotation}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[RAMP_WIDTH, RAMP_THICKNESS, RAMP_LENGTH]} />
        <meshStandardMaterial color="#e0b878" roughness={0.55} />
      </mesh>
      {/* Ruler markings so the plank reads as a ruler even from the camera boom. */}
      {features.clearcoat && ticks.map((index) => (
        <mesh key={index} position={[RAMP_WIDTH / 2 - 0.55, RAMP_THICKNESS / 2 + 0.005, -RAMP_LENGTH / 2 + 1 + index * 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[index % 2 === 0 ? 1 : 0.6, 0.14]} />
          <meshBasicMaterial color="#4a3722" />
        </mesh>
      ))}
    </group>
  )
}

/** Hero prop 3: the mug, a ceramic tower next to a minifig. */
function Mug({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  const profile = useMemo(() => [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(3.6, 0),
    new THREE.Vector2(4.2, 0.7),
    new THREE.Vector2(4.3, 8.6),
    new THREE.Vector2(4.35, 9.3),
    new THREE.Vector2(4.05, 9.5),
    new THREE.Vector2(3.8, 9.2),
    new THREE.Vector2(3.78, 1.2),
    new THREE.Vector2(0, 1.2),
  ], [])

  return (
    <group position={[prop.x, DESK_TOP_Y, prop.z]} rotation={[0, prop.rotation, 0]}>
      <mesh castShadow receiveShadow>
        <latheGeometry args={[profile, features.roundSegments]} />
        {features.clearcoat
          ? <meshPhysicalMaterial color="#f0ece2" roughness={0.22} clearcoat={0.7} clearcoatRoughness={0.14} metalness={0} />
          : <meshStandardMaterial color="#f0ece2" roughness={0.35} />}
      </mesh>
      <mesh position={[4.1, 5.2, 0]} rotation={[0, Math.PI / 2, -0.15]} castShadow>
        <torusGeometry args={[2.4, 0.62, features.roundSegments / 3, features.roundSegments, Math.PI * 1.35]} />
        <meshStandardMaterial color="#f0ece2" roughness={0.3} />
      </mesh>
      {/* Painted band */}
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[4.33, 4.33, 2.2, features.roundSegments, 1, true]} />
        <meshStandardMaterial color="#3d7f8c" roughness={0.35} side={THREE.DoubleSide} />
      </mesh>
      {/* Cold coffee */}
      <mesh position={[0, 7.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.75, features.roundSegments]} />
        <meshStandardMaterial color="#3a2113" roughness={0.16} metalness={0.1} />
      </mesh>
    </group>
  )
}

/** Hero prop 4: a jumbo pencil, a fallen log at minifig scale. */
function Pencil({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  const segments = Math.max(6, Math.round(features.roundSegments / 2))
  return (
    <group position={[prop.x, DESK_TOP_Y + 0.5, prop.z]} rotation={[0, prop.rotation, 0]}>
      <group rotation={[Math.PI / 2, 0, Math.PI / 6]}>
        {/* Barrel */}
        <mesh position={[0, 0, 3.2]} castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.55, 19.6, 6]} />
          <meshStandardMaterial color="#f0b52a" roughness={0.42} />
        </mesh>
        {/* Sharpened cone and graphite */}
        <mesh position={[0, 0, -8.9]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.55, 2.6, 6]} />
          <meshStandardMaterial color="#e5cfa4" roughness={0.72} />
        </mesh>
        <mesh position={[0, 0, -10.6]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.2, 0.9, 8]} />
          <meshStandardMaterial color="#2b2b30" roughness={0.5} metalness={0.15} />
        </mesh>
        {/* Ferrule and eraser */}
        <mesh position={[0, 0, 13.75]} castShadow>
          <cylinderGeometry args={[0.58, 0.58, 1.5, segments]} />
          <meshStandardMaterial color="#b9bcc0" metalness={0.85} roughness={0.28} />
        </mesh>
        <mesh position={[0, 0, 13.4]}>
          <cylinderGeometry args={[0.6, 0.6, 0.18, segments]} />
          <meshStandardMaterial color="#8f9398" metalness={0.85} roughness={0.32} />
        </mesh>
        <mesh position={[0, 0, 15.2]} castShadow>
          <cylinderGeometry args={[0.54, 0.56, 1.5, segments]} />
          <meshStandardMaterial color="#e8909a" roughness={0.86} />
        </mesh>
      </group>
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* Set dressing                                                                */
/* -------------------------------------------------------------------------- */

function GiantBrick({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  const part = BRICK_PART_MAP[prop.variant ?? 'brick_2x4']
  const geometry = useMemo(() => createBrickGeometry(part), [part])
  const scale = prop.scale ?? 5
  return (
    <mesh
      geometry={geometry}
      position={[prop.x, DESK_TOP_Y, prop.z]}
      rotation={[0, prop.rotation, 0]}
      scale={scale}
      castShadow
      receiveShadow
    >
      {features.clearcoat
        ? <meshPhysicalMaterial color={prop.color} roughness={0.34} metalness={0} clearcoat={0.85} clearcoatRoughness={0.13} />
        : <meshStandardMaterial color={prop.color} roughness={0.46} metalness={0.02} />}
    </mesh>
  )
}

function Crayon({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  const segments = Math.max(8, Math.round(features.roundSegments / 2))
  return (
    <group position={[prop.x, DESK_TOP_Y + 0.55, prop.z]} rotation={[0, prop.rotation, 0]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.55, 0.55, 9.4, segments]} />
          <meshStandardMaterial color={prop.color} roughness={0.72} />
        </mesh>
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 6.4, segments]} />
          <meshStandardMaterial color={prop.color} roughness={0.9} />
        </mesh>
        <mesh position={[0, 3.2, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.3, segments]} />
          <meshStandardMaterial color="#f6f1e6" roughness={0.9} />
        </mesh>
        <mesh position={[0, -3.2, 0]}>
          <cylinderGeometry args={[0.6, 0.6, 0.3, segments]} />
          <meshStandardMaterial color="#f6f1e6" roughness={0.9} />
        </mesh>
        <mesh position={[0, 5.5, 0]} castShadow>
          <coneGeometry args={[0.55, 1.6, segments]} />
          <meshStandardMaterial color={prop.color} roughness={0.6} />
        </mesh>
      </group>
    </group>
  )
}

function Paintbrush({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  const segments = Math.max(8, Math.round(features.roundSegments / 2))
  return (
    <group position={[prop.x, DESK_TOP_Y + 0.62, prop.z]} rotation={[0, prop.rotation, 0]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, -4.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.42, 0.62, 11, segments]} />
          <meshStandardMaterial color="#c14b3f" roughness={0.42} />
        </mesh>
        <mesh position={[0, 2, 0]} castShadow>
          <cylinderGeometry args={[0.62, 0.55, 2.6, segments]} />
          <meshStandardMaterial color="#c3c7cb" metalness={0.85} roughness={0.25} />
        </mesh>
        <mesh position={[0, 5.2, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.72, 4, segments]} />
          <meshStandardMaterial color="#8d6a3f" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}

function AlphabetBlock({ prop }: { prop: ToyProp }) {
  const texture = useMemo(() => createLetterTexture(prop.variant ?? 'A'), [prop.variant])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={[prop.x, DESK_TOP_Y + 1.8, prop.z]} rotation={[0, prop.rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[3.6, 3.6, 3.6]} />
      <meshStandardMaterial map={texture} roughness={0.78} />
    </mesh>
  )
}

function Die({ prop }: { prop: ToyProp }) {
  const texture = useMemo(() => createDieTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={[prop.x, DESK_TOP_Y + 1.1, prop.z]} rotation={[0, prop.rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[2.2, 2.2, 2.2]} />
      <meshStandardMaterial map={texture} roughness={0.34} />
    </mesh>
  )
}

function Eraser({ prop }: { prop: ToyProp }) {
  return (
    <group position={[prop.x, DESK_TOP_Y, prop.z]} rotation={[0, prop.rotation, 0]}>
      <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 1.6, 3]} />
        <meshStandardMaterial color="#e46e86" roughness={0.9} />
      </mesh>
      {/* Cardboard sleeve, hugging the block rather than sitting proud of it. */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[3.2, 1.64, 3.06]} />
        <meshStandardMaterial color="#f6ecd6" roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[2.4, 1.66, 3.08]} />
        <meshStandardMaterial color="#4d7fb0" roughness={0.86} />
      </mesh>
    </group>
  )
}

function Marble({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  return (
    <group position={[prop.x, DESK_TOP_Y + 1.3, prop.z]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[1.3, features.roundSegments, features.roundSegments / 2]} />
        {features.clearcoat
          ? <meshPhysicalMaterial color="#8fd6e8" roughness={0.05} clearcoat={1} clearcoatRoughness={0.04} metalness={0.05} />
          : <meshStandardMaterial color="#8fd6e8" roughness={0.14} metalness={0.05} />}
      </mesh>
      <mesh rotation={[0.4, 0.3, 0.9]}>
        <torusGeometry args={[0.78, 0.3, 6, features.roundSegments / 2]} />
        <meshStandardMaterial color="#f2f6f8" roughness={0.2} />
      </mesh>
    </group>
  )
}

function Ball({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  return (
    <group position={[prop.x, DESK_TOP_Y + 2.6, prop.z]} rotation={[0.5, 0.2, 0.3]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[2.6, features.roundSegments, features.roundSegments / 2]} />
        {features.clearcoat
          ? <meshPhysicalMaterial color="#f4f0e6" roughness={0.3} clearcoat={0.7} clearcoatRoughness={0.2} />
          : <meshStandardMaterial color="#f4f0e6" roughness={0.42} />}
      </mesh>
      <mesh>
        <torusGeometry args={[2.45, 0.62, 8, features.roundSegments]} />
        <meshStandardMaterial color="#d8483d" roughness={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.45, 0.45, 8, features.roundSegments]} />
        <meshStandardMaterial color="#3f7fd0" roughness={0.4} />
      </mesh>
    </group>
  )
}

function StickyNote({ prop }: { prop: ToyProp }) {
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(8.4, 8.4, 6, 6)
    const position = plane.getAttribute('position') as THREE.BufferAttribute
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index)
      const curl = Math.max(0, (y + 4.2) / 8.4 - 0.55)
      position.setZ(index, curl * curl * 9)
    }
    plane.computeVertexNormals()
    return plane
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[prop.x, DESK_TOP_Y + 0.06, prop.z]} rotation={[-Math.PI / 2, 0, prop.rotation]} receiveShadow castShadow>
      <meshStandardMaterial color="#f2e05c" roughness={0.94} side={THREE.DoubleSide} />
    </mesh>
  )
}

function CoffeeRing({ prop }: { prop: ToyProp }) {
  const texture = useMemo(() => createCoffeeRingTexture(), [])
  useEffect(() => () => texture.dispose(), [texture])
  return (
    <mesh position={[prop.x, DESK_TOP_Y + 0.012, prop.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[prop.half[0] * 2, prop.half[1] * 2]} />
      <meshBasicMaterial map={texture} transparent opacity={0.75} depthWrite={false} />
    </mesh>
  )
}

function LampCord({ prop, features }: { prop: ToyProp; features: ToyRoomFeatures }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(LAMP_BASE.x - 6, DESK_TOP_Y + 0.5, LAMP_BASE.z - 2),
      new THREE.Vector3(prop.x + 3, DESK_TOP_Y + 0.4, prop.z + 2),
      new THREE.Vector3(prop.x - 3, DESK_TOP_Y + 0.4, prop.z - 3),
      new THREE.Vector3(prop.x - 6, DESK_TOP_Y + 0.4, prop.z - 6),
      new THREE.Vector3(-DESK_HALF_X + 3, DESK_TOP_Y + 0.4, prop.z - 7),
    ])
    return new THREE.TubeGeometry(curve, features.clearcoat ? 48 : 18, 0.4, features.clearcoat ? 8 : 5, false)
  }, [prop.x, prop.z, features.clearcoat])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#2e3238" roughness={0.62} />
    </mesh>
  )
}

function ToyProps({ features }: { features: ToyRoomFeatures }) {
  return (
    <group>
      {TOY_PROPS.map((prop) => {
        switch (prop.kind) {
          case 'lamp': return <DeskLamp key={prop.id} features={features} />
          case 'cord': return <LampCord key={prop.id} prop={prop} features={features} />
          case 'book': return null
          case 'ruler-ramp': return null
          case 'mug': return <Mug key={prop.id} prop={prop} features={features} />
          case 'coffee-ring': return <CoffeeRing key={prop.id} prop={prop} />
          case 'pencil': return <Pencil key={prop.id} prop={prop} features={features} />
          case 'giant-brick': return <GiantBrick key={prop.id} prop={prop} features={features} />
          case 'eraser': return <Eraser key={prop.id} prop={prop} />
          case 'crayon': return <Crayon key={prop.id} prop={prop} features={features} />
          case 'paintbrush': return <Paintbrush key={prop.id} prop={prop} features={features} />
          case 'alphabet-block': return <AlphabetBlock key={prop.id} prop={prop} />
          case 'marble': return <Marble key={prop.id} prop={prop} features={features} />
          case 'die': return <Die key={prop.id} prop={prop} />
          case 'sticky-note': return <StickyNote key={prop.id} prop={prop} />
          case 'ball': return <Ball key={prop.id} prop={prop} features={features} />
          default: return null
        }
      })}
      <BookStack features={features} />
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/* Atmosphere                                                                  */
/* -------------------------------------------------------------------------- */

/** The visible cone of lamp light. Static geometry — no motion to reduce. */
function LightBeam({ features }: { features: ToyRoomFeatures }) {
  const alpha = useMemo(() => createBeamAlphaTexture(), [])
  useEffect(() => () => alpha.dispose(), [alpha])

  const pose = useMemo(() => {
    const shade = vec(LAMP_SHADE)
    const target = vec(LAMP_TARGET)
    const direction = target.clone().sub(shade)
    const length = direction.length() * 0.95
    return {
      position: shade.clone().addScaledVector(direction.clone().normalize(), length / 2),
      quaternion: new THREE.Quaternion().setFromUnitVectors(UP, direction.clone().normalize().negate()),
      length,
    }
  }, [])

  return (
    <mesh position={pose.position} quaternion={pose.quaternion} renderOrder={2}>
      <cylinderGeometry args={[LAMP_SHADE_RADIUS * 0.9, LAMP_SHADE_RADIUS + pose.length * 0.42, pose.length, features.roundSegments, 1, true]} />
      <meshBasicMaterial
        color={LAMP_WARM}
        alphaMap={alpha}
        transparent
        opacity={0.45}
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
        fog={false}
      />
    </mesh>
  )
}

/** Dust drifting in the lamp beam — the one piece of added ambient motion. */
function DustMotes({ features }: { features: ToyRoomFeatures }) {
  const points = useRef<THREE.Points>(null)
  const count = features.dustCount

  const seeds = useMemo(() => {
    const shade = vec(LAMP_SHADE)
    const axis = vec(LAMP_TARGET).sub(shade)
    const span = axis.length()
    const forward = axis.clone().normalize()
    const right = new THREE.Vector3().crossVectors(forward, UP).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    const base = new Float32Array(count * 3)
    const drift = new Float32Array(count * 2)
    const travel = new Float32Array(count)
    for (let index = 0; index < count; index += 1) {
      const t = 0.05 + Math.random() * 0.95
      const radius = (LAMP_SHADE_RADIUS + t * span * 0.44) * Math.sqrt(Math.random())
      const angle = Math.random() * Math.PI * 2
      const point = shade.clone()
        .addScaledVector(forward, t * span)
        .addScaledVector(right, Math.cos(angle) * radius)
        .addScaledVector(up, Math.sin(angle) * radius)
      base[index * 3] = point.x
      base[index * 3 + 1] = point.y
      base[index * 3 + 2] = point.z
      drift[index * 2] = Math.random() * Math.PI * 2
      drift[index * 2 + 1] = 0.1 + Math.random() * 0.2
      travel[index] = 0.05 + Math.random() * 0.12
    }
    return { base, drift, travel }
  }, [count])

  const assets = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(seeds.base.slice(), 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(LAMP_SHADE.x / 2, LAMP_SHADE.y / 2, LAMP_SHADE.z / 2), 60)
    const texture = createDustTexture()
    const material = new THREE.PointsMaterial({
      size: 0.4,
      map: texture,
      alphaMap: texture,
      transparent: true,
      opacity: 0.75,
      color: '#fff0d4',
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      toneMapped: false,
      fog: false,
    })
    return { geometry, material, texture }
  }, [seeds])

  useEffect(() => () => {
    assets.geometry.dispose()
    assets.material.dispose()
    assets.texture.dispose()
  }, [assets])

  useFrame((state) => {
    if (!features.animateDust) return
    const geometry = points.current?.geometry
    if (!geometry) return
    const attribute = geometry.getAttribute('position') as THREE.BufferAttribute
    const array = attribute.array as Float32Array
    const time = state.clock.elapsedTime
    for (let index = 0; index < count; index += 1) {
      const phase = seeds.drift[index * 2]
      const amplitude = seeds.drift[index * 2 + 1] * 6
      array[index * 3] = seeds.base[index * 3] + Math.sin(time * 0.12 + phase) * amplitude
      array[index * 3 + 1] = seeds.base[index * 3 + 1]
        + Math.sin(time * 0.19 + phase * 1.7) * amplitude * 0.5
        - ((time * seeds.travel[index]) % 12)
      array[index * 3 + 2] = seeds.base[index * 3 + 2] + Math.cos(time * 0.1 + phase) * amplitude
    }
    attribute.needsUpdate = true
  })

  return <points ref={points} geometry={assets.geometry} material={assets.material} frustumCulled={false} />
}

/**
 * The lighting rig: a warm key raking down the lamp's own axis (this one casts
 * the shadows), the lamp's falloff pool, a cool window fill, and a dim room
 * bounce. Everything is motivated by something you can see in the room.
 */
function ToyRoomLights({ features }: { features: ToyRoomFeatures }) {
  const spotTarget = useMemo(() => {
    const object = new THREE.Object3D()
    object.position.set(LAMP_TARGET.x, LAMP_TARGET.y, LAMP_TARGET.z)
    return object
  }, [])
  const keyPosition = useMemo(() => {
    const shade = vec(LAMP_SHADE)
    const direction = shade.clone().sub(vec(LAMP_TARGET)).normalize()
    return vec(LAMP_TARGET).addScaledVector(direction, 120)
  }, [])

  return (
    <>
      <primitive object={spotTarget} />
      <ambientLight color="#8b9fbe" intensity={0.64} />
      <hemisphereLight color="#a9c0e2" groundColor="#a9743d" intensity={0.66} />
      {/* Warm key — the lamp's direction, but directional so the shadow map stays crisp. */}
      <directionalLight
        color={LAMP_WARM}
        intensity={1.65}
        position={keyPosition}
        castShadow
        shadow-mapSize={[features.shadowMapSize, features.shadowMapSize]}
        shadow-camera-left={-118}
        shadow-camera-right={118}
        shadow-camera-top={118}
        shadow-camera-bottom={-118}
        shadow-camera-near={10}
        shadow-camera-far={260}
        shadow-bias={-0.0004}
        shadow-normalBias={0.06}
      />
      {/* The pool: same origin as the shade, decaying so the table falls into dusk. */}
      <spotLight
        color={LAMP_WARM}
        position={[LAMP_SHADE.x, LAMP_SHADE.y, LAMP_SHADE.z]}
        target={spotTarget}
        intensity={3400}
        distance={190}
        decay={2}
        angle={1.02}
        penumbra={0.86}
      />
      {/* Cool window fill from the wall you can see it on. */}
      <directionalLight color={WINDOW_COOL} intensity={0.95} position={[-190, 78, 40]} />
      {/* Dim room bounce so the far walls and floor do not go to mud. */}
      <directionalLight color="#8ea2c6" intensity={0.7} position={[70, 40, 150]} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Colliders                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything the explorer can bump into. The table top is a single slab whose
 * surface sits exactly one plate-thickness below the plate, so stepping off is a
 * small drop and stepping back on is an autostep.
 */
export function ToyRoomColliders() {
  const ramp = useMemo(rulerRampPose, [])
  const rampRotation = useMemo(() => yawPitchEuler(ramp.rotation, ramp.pitch), [ramp])

  return (
    <>
      <CuboidCollider args={[DESK_HALF_X, 2, DESK_HALF_Z]} position={[0, DESK_TOP_Y - 2, 0]} friction={0.7} />
      {/* The rail itself is solid and standable. */}
      <CuboidCollider args={[DESK_HALF_X, DESK_RIM_HEIGHT / 2, DESK_RIM_WIDTH / 2]} position={[0, DESK_TOP_Y + DESK_RIM_HEIGHT / 2, DESK_HALF_Z - DESK_RIM_WIDTH / 2]} />
      <CuboidCollider args={[DESK_HALF_X, DESK_RIM_HEIGHT / 2, DESK_RIM_WIDTH / 2]} position={[0, DESK_TOP_Y + DESK_RIM_HEIGHT / 2, -DESK_HALF_Z + DESK_RIM_WIDTH / 2]} />
      <CuboidCollider args={[DESK_RIM_WIDTH / 2, DESK_RIM_HEIGHT / 2, DESK_HALF_Z]} position={[DESK_HALF_X - DESK_RIM_WIDTH / 2, DESK_TOP_Y + DESK_RIM_HEIGHT / 2, 0]} />
      <CuboidCollider args={[DESK_RIM_WIDTH / 2, DESK_RIM_HEIGHT / 2, DESK_HALF_Z]} position={[-DESK_HALF_X + DESK_RIM_WIDTH / 2, DESK_TOP_Y + DESK_RIM_HEIGHT / 2, 0]} />
      {/* Invisible guard just outside the rail so a jump onto it can never end in a fall. */}
      <CuboidCollider args={[DESK_HALF_X + 1, DESK_GUARD_HEIGHT / 2, 0.5]} position={[0, DESK_TOP_Y + DESK_GUARD_HEIGHT / 2, DESK_HALF_Z + 0.5]} />
      <CuboidCollider args={[DESK_HALF_X + 1, DESK_GUARD_HEIGHT / 2, 0.5]} position={[0, DESK_TOP_Y + DESK_GUARD_HEIGHT / 2, -DESK_HALF_Z - 0.5]} />
      <CuboidCollider args={[0.5, DESK_GUARD_HEIGHT / 2, DESK_HALF_Z + 1]} position={[DESK_HALF_X + 0.5, DESK_TOP_Y + DESK_GUARD_HEIGHT / 2, 0]} />
      <CuboidCollider args={[0.5, DESK_GUARD_HEIGHT / 2, DESK_HALF_Z + 1]} position={[-DESK_HALF_X - 0.5, DESK_TOP_Y + DESK_GUARD_HEIGHT / 2, 0]} />

      {TOY_PROPS.map((prop) => {
        const rotation: [number, number, number] = [0, prop.rotation, 0]
        switch (prop.kind) {
          case 'lamp':
            return <CylinderCollider key={prop.id} args={[1.6, 7.5]} position={[prop.x, DESK_TOP_Y + 1.6, prop.z]} />
          case 'book':
            return (
              <CuboidCollider
                key={prop.id}
                args={[prop.half[0], BOOK_THICKNESS / 2, prop.half[1]]}
                position={[prop.x, DESK_TOP_Y + (prop.lift ?? 0) + BOOK_THICKNESS / 2, prop.z]}
                rotation={rotation}
              />
            )
          case 'ruler-ramp':
            return (
              <CuboidCollider
                key={prop.id}
                args={[RAMP_WIDTH / 2, RAMP_THICKNESS / 2, RAMP_LENGTH / 2]}
                position={[ramp.x, DESK_TOP_Y + ramp.y, ramp.z]}
                rotation={rampRotation}
                friction={0.9}
              />
            )
          case 'mug':
            return <CylinderCollider key={prop.id} args={[4.75, 4.35]} position={[prop.x, DESK_TOP_Y + 4.75, prop.z]} />
          case 'pencil':
            return <CuboidCollider key={prop.id} args={[0.56, 0.5, 13]} position={[prop.x, DESK_TOP_Y + 0.5, prop.z]} rotation={rotation} />
          case 'giant-brick':
            return (
              <CuboidCollider
                key={prop.id}
                args={[prop.half[0], (prop.scale ?? 5) * 0.32, prop.half[1]]}
                position={[prop.x, DESK_TOP_Y + (prop.scale ?? 5) * 0.32, prop.z]}
                rotation={rotation}
              />
            )
          case 'eraser':
            return <CuboidCollider key={prop.id} args={[3, 0.8, 1.5]} position={[prop.x, DESK_TOP_Y + 0.8, prop.z]} rotation={rotation} />
          case 'crayon':
            return <CuboidCollider key={prop.id} args={[0.6, 0.55, 5.5]} position={[prop.x, DESK_TOP_Y + 0.55, prop.z]} rotation={rotation} />
          case 'paintbrush':
            return <CuboidCollider key={prop.id} args={[0.65, 0.62, 10]} position={[prop.x, DESK_TOP_Y + 0.62, prop.z]} rotation={rotation} />
          case 'alphabet-block':
            return <CuboidCollider key={prop.id} args={[1.8, 1.8, 1.8]} position={[prop.x, DESK_TOP_Y + 1.8, prop.z]} rotation={rotation} />
          case 'die':
            return <CuboidCollider key={prop.id} args={[1.1, 1.1, 1.1]} position={[prop.x, DESK_TOP_Y + 1.1, prop.z]} rotation={rotation} />
          case 'marble':
            return <CylinderCollider key={prop.id} args={[1.3, 1.3]} position={[prop.x, DESK_TOP_Y + 1.3, prop.z]} />
          case 'ball':
            return <CylinderCollider key={prop.id} args={[2.6, 2.6]} position={[prop.x, DESK_TOP_Y + 2.6, prop.z]} />
          default:
            return null
        }
      })}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Entry points                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Background and fog. Must render as a direct child of the Canvas so `attach`
 * lands on the scene rather than on a nested group.
 */
export function ToyRoomAtmosphere() {
  return (
    <>
      <color attach="background" args={[TOY_ROOM_FOG_COLOR]} />
      <fog attach="fog" args={[TOY_ROOM_FOG_COLOR, TOY_ROOM_FOG_NEAR, TOY_ROOM_FOG_FAR]} />
    </>
  )
}

export function useToyRoomFeatures(compactRenderer: boolean) {
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  return useMemo(() => toyRoomFeatures(compactRenderer, reducedMotion), [compactRenderer, reducedMotion])
}

/** The whole diorama: room, table, lighting rig, props and dust. */
export function ToyRoomWorld({ features }: { features: ToyRoomFeatures }) {
  return (
    <group>
      <ToyRoomLights features={features} />
      <RoomShell features={features} />
      <RoomWindow />
      <PlayTable features={features} />
      <ToyProps features={features} />
      {features.lightBeam && <LightBeam features={features} />}
      <DustMotes features={features} />
      <ContactShadows
        position={[0, DESK_TOP_Y + 0.02, 0]}
        scale={[DESK_HALF_X * 2 - 3, DESK_HALF_Z * 2 - 3]}
        far={16}
        blur={2.4}
        opacity={0.55}
        frames={features.contactShadowFrames}
        resolution={features.contactShadowResolution}
        color="#2a1c10"
      />
    </group>
  )
}
