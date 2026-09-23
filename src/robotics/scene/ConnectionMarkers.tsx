import { Edges, Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useSyncExternalStore, type RefObject } from 'react'
import * as THREE from 'three'
import { draftIsValid } from '../../brick/brickRules'
import { createBrickGeometry } from '../../brick/geometry'
import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import type { BrickDraft, BrickInstance, BrickPart } from '../../brick/types'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import { brickOriginFor, type PartMap } from '../model/grid'
import { otherSideSpot, previewProblem, type OtherSideSpot, type PreviewProblem } from '../model/fixPlans'
import { looseWheelsByRobot, wheelSpins } from '../model/looseWheels'
import { deriveMechanisms, type WheelLink } from '../model/mechanism'
import { GAP_TEXT, gapMarkers, type GapMarker } from '../model/nearMiss'
import { BARE_GROUND_TEXT, motorsOnBareGround } from '../model/placementAdvice'
import type { EdgeRun, SnapPose, SnapTarget } from '../model/snap'
import { add, scale, sub, type Vec3 } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { useRoboticsStore } from '../state/roboticsStore'
import { draftSnapState, subscribeDraftSnap, type DraftSnapState } from './draftSnap'
import { useHiddenBrickIds } from './hiddenBricks'
import { sharedSnapContext } from './snapContext'
import './connectionMarkers.css'

/**
 * Magnetic connections, drawn (docs/robotics/KID-UX.md §S). While an axle, a wheel or a
 * motor is armed, every place it can connect glows: free motor sockets and loose wheels'
 * holes for an axle, free axle ends for a wheel (motors with nothing in their socket are
 * shown dimmed, and say "Put an axle in first" when the pointer comes near), and the free
 * stretches of robot plates' long sides for a motor. Each target has a ring (or, for a
 * motor, a bar with arrows pointing out over the edge) at the connector and a pad where the
 * part would sit, so it can be aimed at from any side; rings and bars never shrink below a
 * readable size when the camera is far. The snapped ghost gets a green outline, seen even
 * through the robot, and its target brightens.
 *
 * Always, in build mode: a red gap marker on every near miss (a wheel or an axle next to a
 * connector without connecting) and, next to a motor standing on the bare ground, why it
 * cannot take a wheel. Nothing here takes a pointer event or writes to the document.
 *
 * Kid-UX lane W adds: every wheel that can't spin carries a red "can't spin" mark (a ring with a
 * bar across its hub, on both faces) and a small red badge with its number in the robot panel's
 * list, for as long as it stays loose. A second motor armed for a robot with one shows a
 * motor-shaped target exactly across from the first ("the other side"), green, or red with what
 * is in the way outlined. A robot part's ghost that is red says why beside it ("Something is in
 * the way.", "No room on the plate. Try a bigger plate.") and outlines what is in the way; so
 * does a fix that could not be done (and where its part would have gone, in red).
 */
const TARGET = '#12b76a'
const TARGET_LIT = '#35f28e'
const DIM = '#7d8a90'
const GAP = '#e5383b'
/** What is in the way: outlined in orange, so it reads apart from the red ghost that can't go there. */
const WAY = '#ff8a00'

const noRaycast = () => null
const ring = new THREE.TorusGeometry(1, 0.13, 12, 40)
const unitBox = new THREE.BoxGeometry(1, 1, 1)
const chevron = (() => {
  // A flat arrow head lying on its face, pointing along +X.
  const shape = new THREE.Shape()
  shape.moveTo(0.16, 0)
  shape.lineTo(-0.1, 0.14)
  shape.lineTo(-0.03, 0)
  shape.lineTo(-0.1, -0.14)
  shape.closePath()
  const geometry = new THREE.ShapeGeometry(shape)
  geometry.rotateX(-Math.PI / 2)
  return geometry
})()
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function facing(direction: Vec3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(Z_AXIS, new THREE.Vector3(direction.x, direction.y, direction.z).normalize())
}

type Level = { base: number; swing: number; lit: number }

/**
 * Per frame: breathing opacity for a marker's materials (`lit` holds them steady and bright),
 * and how much to enlarge it so a feature `worldSize` across near `anchor` is at least
 * `pixels` on screen (1 up close, up to 3 when the camera is far).
 */
function useMarkerFrame(materials: RefObject<(THREE.Material | null)[]>, levels: Level[], lit: boolean, anchor: Vec3, worldSize: number, pixels: number, apply: (factor: number) => void) {
  const { camera, size } = useThree()
  const point = useMemo(() => new THREE.Vector3(anchor.x, anchor.y, anchor.z), [anchor.x, anchor.y, anchor.z])
  useFrame(({ clock }) => {
    const wave = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.6)
    materials.current?.forEach((material, index) => {
      const level = levels[Math.min(index, levels.length - 1)]
      if (material && level) material.opacity = lit ? level.lit : level.base + level.swing * wave
    })
    let factor = 1
    if (camera instanceof THREE.PerspectiveCamera) {
      const perUnit = size.height / (2 * camera.position.distanceTo(point) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
      factor = Math.min(3, Math.max(1, pixels / (worldSize * perUnit)))
    }
    apply(factor)
  })
}

type Footprint = { center: Vec3; width: number; depth: number }

function footprintOf(poses: readonly SnapPose[], part: BrickPart, plateSize: number): Footprint {
  const size = rotatedSize(part, poses[0].rotation)
  const x0 = Math.min(...poses.map((pose) => pose.x))
  const x1 = Math.max(...poses.map((pose) => pose.x)) + size.width
  const z0 = Math.min(...poses.map((pose) => pose.z))
  const z1 = Math.max(...poses.map((pose) => pose.z)) + size.depth
  return {
    center: { x: ((x0 + x1) / 2 - plateSize / 2) * STUD, y: poses[0].y * PLATE_HEIGHT, z: ((z0 + z1) / 2 - plateSize / 2) * STUD },
    width: (x1 - x0) * STUD,
    depth: (z1 - z0) * STUD,
  }
}

/** Where the part would sit, as a soft pad on whatever it would rest on (above the studs so it reads from any angle). */
function Pad({ footprint, color, materialRef, inset = 0.1 }: { footprint: Footprint; color: string; materialRef: (material: THREE.MeshBasicMaterial | null) => void; inset?: number }) {
  return (
    <mesh geometry={unitBox} position={[footprint.center.x, footprint.center.y + 0.13, footprint.center.z]} scale={[Math.max(0.1, footprint.width - inset * 2), 0.02, Math.max(0.1, footprint.depth - inset * 2)]} raycast={noRaycast} renderOrder={4}>
      <meshBasicMaterial ref={materialRef} color={color} transparent opacity={0.3} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** Ring, see-through ring, pad. */
const CONNECTOR_LEVELS: Level[] = [{ base: 0.6, swing: 0.4, lit: 1 }, { base: 0.3, swing: 0.25, lit: 0.75 }, { base: 0.3, swing: 0.25, lit: 0.65 }]

/** A socket, a wheel hole or an axle end the armed part can connect to: a ring facing out of it, and a pad where the part would sit. */
function ConnectorTarget({ target, part, plateSize, lit }: { target: SnapTarget; part: BrickPart; plateSize: number; lit: boolean }) {
  const materials = useRef<(THREE.Material | null)[]>([])
  const group = useRef<THREE.Group>(null)
  const radius = (target.kind === 'wheel-hole' ? 0.2 : target.kind === 'axle-end' ? 0.3 : 0.36) * (lit ? 1.18 : 1)
  useMarkerFrame(materials, CONNECTOR_LEVELS, lit, target.point, radius, 14, (factor) => group.current?.scale.setScalar(radius * factor))
  const quaternion = useMemo(() => facing(target.outward), [target.outward])
  const position = add(target.point, scale(target.outward, 0.05))
  const footprint = useMemo(() => footprintOf([target.pose], part, plateSize), [target.pose, part, plateSize])
  return (
    <group>
      <group ref={group} position={[position.x, position.y, position.z]} quaternion={quaternion} scale={radius}>
        <mesh geometry={ring} raycast={noRaycast} renderOrder={5}>
          <meshBasicMaterial ref={(material) => { materials.current[0] = material }} color={lit ? TARGET_LIT : TARGET} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh geometry={ring} raycast={noRaycast} renderOrder={6}>
          <meshBasicMaterial ref={(material) => { materials.current[1] = material }} color={TARGET} transparent opacity={0.3} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      <Pad footprint={footprint} color={lit ? TARGET_LIT : TARGET} materialRef={(material) => { materials.current[2] = material }} />
    </group>
  )
}

/** Bar, arrows, pad. */
const EDGE_LEVELS: Level[] = [{ base: 0.55, swing: 0.4, lit: 1 }, { base: 0.55, swing: 0.4, lit: 1 }, { base: 0.22, swing: 0.2, lit: 0.5 }]

/**
 * A free stretch of a plate edge where a motor fits: a glowing bar on the edge, arrows
 * pointing out over it (the way the motor's socket will face), and a pad over the spots.
 */
function EdgeTarget({ run, part, plateSize, lit }: { run: EdgeRun; part: BrickPart; plateSize: number; lit: boolean }) {
  const materials = useRef<(THREE.Material | null)[]>([])
  const bar = useRef<THREE.Mesh>(null)
  const arrows = useRef<(THREE.Mesh | null)[]>([])
  const along = sub(run.to, run.from)
  const length = Math.hypot(along.x, along.z)
  const yaw = Math.atan2(-along.z, along.x)
  const width = 0.2
  const middle = add(run.from, scale(along, 0.5))
  const arrowYaw = Math.atan2(-run.outward.z, run.outward.x)
  const count = Math.max(1, Math.round(length / (STUD * 2)))
  const footprint = useMemo(() => footprintOf(run.poses, part, plateSize), [run.poses, part, plateSize])
  useMarkerFrame(materials, EDGE_LEVELS, lit, middle, width, 7, (factor) => {
    // Thicker, never longer: the bar still spans exactly the free stretch.
    const inward = scale(run.outward, (-width * factor) / 2)
    bar.current?.position.set(middle.x + inward.x, middle.y + 0.13, middle.z + inward.z)
    bar.current?.scale.set(length, 0.06 * factor, width * factor)
    arrows.current.forEach((arrow) => arrow?.scale.setScalar((lit ? 1.3 : 1.1) * factor))
  })
  const color = lit ? TARGET_LIT : TARGET
  return (
    <group>
      <mesh ref={bar} geometry={unitBox} rotation={[0, yaw, 0]} raycast={noRaycast} renderOrder={5}>
        <meshBasicMaterial ref={(material) => { materials.current[0] = material }} color={color} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </mesh>
      {Array.from({ length: count }, (_, index) => {
        const at = add(add(run.from, scale(along, (index + 0.5) / count)), scale(run.outward, 0.3))
        return (
          <mesh key={index} ref={(mesh) => { arrows.current[index] = mesh }} geometry={chevron} position={[at.x, at.y + 0.02, at.z]} rotation={[0, arrowYaw, 0]} raycast={noRaycast} renderOrder={5}>
            <meshBasicMaterial ref={(material) => { materials.current[1] = material }} color={color} transparent opacity={0.8} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
          </mesh>
        )
      })}
      <Pad footprint={footprint} color={color} materialRef={(material) => { materials.current[2] = material }} inset={0.14} />
    </group>
  )
}

/** A motor with nothing in its socket while a wheel is armed: dimmed, it needs an axle first. */
function DimSocket({ at, direction }: { at: Vec3; direction: Vec3 }) {
  const mesh = useRef<THREE.Mesh>(null)
  const none = useRef<(THREE.Material | null)[]>([])
  useMarkerFrame(none, [], false, at, 0.36, 12, (factor) => mesh.current?.scale.setScalar(0.36 * factor))
  const quaternion = useMemo(() => facing(direction), [direction])
  const position = add(at, scale(direction, 0.05))
  return (
    <mesh ref={mesh} geometry={ring} position={[position.x, position.y, position.z]} quaternion={quaternion} scale={0.36} raycast={noRaycast} renderOrder={5}>
      <meshBasicMaterial color={DIM} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/** The snapped ghost: a green outline over the studio's own ghost and a green glow seen even through the robot. */
function SnappedGhost({ draft, part, plateSize }: { draft: BrickDraft; part: BrickPart; plateSize: number }) {
  const geometry = useMemo(() => createBrickGeometry(part), [part])
  useEffect(() => () => geometry.dispose(), [geometry])
  const origin = brickOriginFor(draft, part, plateSize)
  return (
    <group position={[origin.x, origin.y, origin.z]} rotation={[0, (draft.rotation * Math.PI) / 2, 0]}>
      <mesh geometry={geometry} scale={1.07} raycast={noRaycast} renderOrder={7}>
        <meshBasicMaterial color={TARGET_LIT} transparent opacity={0.26} depthTest={false} depthWrite={false} toneMapped={false} />
        <Edges scale={1} color={TARGET_LIT} lineWidth={3} threshold={20} renderOrder={8} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Label({ at, text, tone, emphasis = false }: { at: Vec3; text: string; tone: 'gap' | 'advice' | 'done'; emphasis?: boolean }) {
  return (
    <Html position={[at.x, at.y, at.z]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`robotics-connect-label is-${tone}${emphasis ? ' is-emphasis' : ''}`} data-testid={`robotics-connect-label-${tone}`}>{text}</div>
    </Html>
  )
}

const GAP_LEVELS: Level[] = [{ base: 0.6, swing: 0.4, lit: 1 }, { base: 0.3, swing: 0.2, lit: 0.5 }, { base: 0.7, swing: 0.3, lit: 1 }]

/** A near miss: a red ring on the loose part's connector and a red bar across the gap. */
function GapMark({ marker }: { marker: GapMarker }) {
  const materials = useRef<(THREE.Material | null)[]>([])
  const group = useRef<THREE.Group>(null)
  useMarkerFrame(materials, GAP_LEVELS, false, marker.at, 0.3, 14, (factor) => group.current?.scale.setScalar(0.3 * factor))
  const quaternion = useMemo(() => facing(marker.axis), [marker.axis])
  const gap = sub(marker.to, marker.at)
  const length = Math.hypot(gap.x, gap.y, gap.z)
  const mid = add(marker.at, scale(gap, 0.5))
  const lineQuaternion = length > 1e-6 ? facing(gap) : new THREE.Quaternion()
  return (
    <group>
      <group ref={group} position={[marker.at.x, marker.at.y, marker.at.z]} quaternion={quaternion} scale={0.3}>
        <mesh geometry={ring} raycast={noRaycast} renderOrder={5}>
          <meshBasicMaterial ref={(material) => { materials.current[0] = material }} color={GAP} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh geometry={ring} raycast={noRaycast} renderOrder={6}>
          <meshBasicMaterial ref={(material) => { materials.current[1] = material }} color={GAP} transparent opacity={0.3} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
      {length > 0.02 && (
        <mesh geometry={unitBox} position={[mid.x, mid.y, mid.z]} quaternion={lineQuaternion} scale={[0.07, 0.07, length]} raycast={noRaycast} renderOrder={5}>
          <meshBasicMaterial ref={(material) => { materials.current[2] = material }} color={GAP} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

/** A wheel that can't spin: on each face, a red ring round its hub with a bar across it. */
function CantSpinMark({ wheel }: { wheel: WheelLink }) {
  const materials = useRef<(THREE.Material | null)[]>([])
  const groups = useRef<(THREE.Group | null)[]>([])
  const size = 0.42
  useMarkerFrame(materials, CANT_SPIN_LEVELS, false, wheel.center, size, 16, (factor) => groups.current.forEach((group) => group?.scale.setScalar(size * Math.min(factor, 1.6))))
  const faces = [1, -1].map((sign) => ({ sign, at: add(wheel.center, scale(wheel.axis, sign * (wheel.halfThickness + 0.03))), facing: facing(scale(wheel.axis, sign)) }))
  return (
    <>
      {faces.map(({ sign, at, facing: quaternion }) => (
        <group key={sign} ref={(group) => { groups.current[sign > 0 ? 0 : 1] = group }} position={[at.x, at.y, at.z]} quaternion={quaternion} scale={size}>
          <mesh geometry={ring} raycast={noRaycast} renderOrder={5}>
            <meshBasicMaterial ref={(material) => { materials.current[sign > 0 ? 0 : 2] = material }} color={GAP} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh geometry={unitBox} rotation={[0, 0, Math.PI / 4]} scale={[0.16, 2.1, 0.04]} raycast={noRaycast} renderOrder={5}>
            <meshBasicMaterial ref={(material) => { materials.current[sign > 0 ? 1 : 3] = material }} color={GAP} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
const CANT_SPIN_LEVELS: Level[] = [{ base: 0.65, swing: 0.3, lit: 1 }]

/** The number the robot panel gives a loose wheel, in a small red badge above it (so "Fix wheel 2" can be found). */
function WheelBadge({ at, number }: { at: Vec3; number: number | null }) {
  return (
    <Html position={[at.x, at.y, at.z]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div className="robotics-cant-spin-badge" data-testid="robotics-cant-spin-badge" aria-hidden="true">{number ?? '!'}</div>
    </Html>
  )
}

/** A brick outlined (what is in the way), seen through whatever stands in front of it. */
function BrickOutline({ brick, part, plateSize, color }: { brick: BrickInstance; part: BrickPart | undefined; plateSize: number; color: string }) {
  const geometry = useMemo(() => (part ? createBrickGeometry(part) : null), [part])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!part || !geometry) return null
  const origin = brickOriginFor(brick, part, plateSize)
  return (
    <group position={[origin.x, origin.y, origin.z]} rotation={[0, (brick.rotation * Math.PI) / 2, 0]}>
      <mesh geometry={geometry} scale={1.05} raycast={noRaycast} renderOrder={7}>
        <meshBasicMaterial color={color} transparent opacity={0.22} depthTest={false} depthWrite={false} toneMapped={false} />
        <Edges scale={1} color={color} lineWidth={3} threshold={20} renderOrder={8} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** A part drawn where it would go: green where it fits (the other side), red where it can't. */
function PartGhost({ part, pose, plateSize, color, opacity = 0.3 }: { part: BrickPart | undefined; pose: SnapPose; plateSize: number; color: string; opacity?: number }) {
  const geometry = useMemo(() => (part ? createBrickGeometry(part) : null), [part])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!part || !geometry) return null
  const origin = brickOriginFor({ ...pose }, part, plateSize)
  return (
    <group position={[origin.x, origin.y, origin.z]} rotation={[0, (pose.rotation * Math.PI) / 2, 0]}>
      <mesh geometry={geometry} scale={1.02} raycast={noRaycast} renderOrder={6}>
        <meshBasicMaterial color={color} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
        <Edges scale={1} color={color} lineWidth={3} threshold={20} renderOrder={8} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Where the second motor goes: a motor-shaped target across from the first, breathing green; red when there is no room. */
function OtherSideTarget({ spot, part, plateSize, lit }: { spot: OtherSideSpot; part: BrickPart | undefined; plateSize: number; lit: boolean }) {
  const color = spot.free ? (lit ? TARGET_LIT : TARGET) : GAP
  return <PartGhost part={part} pose={spot.pose} plateSize={plateSize} color={color} opacity={spot.free ? (lit ? 0.45 : 0.32) : 0.28} />
}

export const HINT_TEXT: Record<string, string> = { 'needs-axle': 'Put an axle in first', 'motor-on-ground': 'Put the motor on a plate first' }

type Summary = {
  armed: string | null
  targets: { key: string; kind: string; brickId: string }[]
  runs: { key: string; poses: SnapPose[] }[]
  dimSockets: string[]
  snappedKey: string | null
  ghostSnapped: boolean
  hint: string | null
  gaps: { key: string; brickId: string; text: string }[]
  labels: { brickId: string; text: string; tone: string; emphasis: boolean }[]
  /** Wheels showing the red "can't spin" mark (or, near an axle end, the gap marker), with their badge numbers. */
  cantSpin: { brickId: string; number: number | null; mark: 'ring' | 'gap' }[]
  /** The second motor's target for a robot with one motor, while a motor is armed. */
  otherSide: { motorId: string; pose: SnapPose; free: boolean; mirrored: boolean; blockers: string[] }[]
  /** Why the robot part's ghost is red here, and what is outlined. */
  preview: PreviewProblem | null
  /** Every brick outlined as in the way (red ghost, other side, a fix that could not be done). */
  outlined: string[]
}
let summary: Summary = { armed: null, targets: [], runs: [], dimSockets: [], snappedKey: null, ghostSnapped: false, hint: null, gaps: [], labels: [], cantSpin: [], otherSide: [], preview: null, outlined: [] }

const topOf = (brick: Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>, partMap: PartMap, plateSize: number, lift: number): Vec3 | null => {
  const part = partMap[brick.partId]
  if (!part) return null
  const origin = brickOriginFor(brick, part, plateSize)
  return { x: origin.x, y: origin.y + part.height * PLATE_HEIGHT + lift, z: origin.z }
}

type PartLabel = { brickId: string; at: Vec3; text: string; tone: 'gap' | 'advice' | 'done'; emphasis: boolean }

export default function ConnectionMarkers() {
  const mode = useBrickStore((state) => state.mode)
  const draft = useBrickStore((state) => state.draft)
  const bricks = useBrickStore((state) => state.bricks)
  const movingId = useBrickStore((state) => state.movingId)
  const groupMove = useBrickStore((state) => (state.movingSelection?.originals.length ?? 0) > 1)
  const model = useRoboticsStore((state) => state.model)
  const running = useRoboticsStore((state) => state.sim !== null || state.simLoading)
  const note = useRoboticsStore((state) => state.wiringNote)
  const coding = useCodeView((state) => state.creationId !== null)
  const driving = useDriveView((state) => state.creationId !== null)
  const hidden = useHiddenBrickIds()
  const snapState: DraftSnapState = useSyncExternalStore(subscribeDraftSnap, draftSnapState)
  const { partMap, plateSize } = model.input
  const active = mode === 'build' && !running && !coding && !driving

  const visible = useMemo(() => (hidden ? bricks.filter((brick) => !hidden.has(brick.id)) : bricks), [bricks, hidden])
  const others = useMemo(() => (movingId ? bricks.filter((brick) => brick.id !== movingId) : bricks), [bricks, movingId])
  const byId = useMemo(() => new Map(bricks.map((brick) => [brick.id, brick])), [bricks])

  // What the armed part can connect to: the same context the snapper answers from.
  const armedPartId = active && draft && !groupMove ? draft.partId : null
  const armedRole = armedPartId ? roboticsSpec(armedPartId)?.role : undefined
  const armedPart = armedPartId ? partMap[armedPartId] : undefined
  const context = useMemo(() => (armedRole === 'axle' || armedRole === 'wheel' || armedRole === 'motor' ? sharedSnapContext(others, partMap, plateSize) : null), [armedRole, others, partMap, plateSize])
  const targets = useMemo(() => (context && armedPartId && armedRole !== 'motor' ? context.connectorTargets(armedPartId).filter((target) => !target.blocked) : []), [context, armedPartId, armedRole])
  // A second motor for a robot with one: the spot across from the first, shown instead of the plate's edge bars.
  const otherSides = useMemo(() => (armedRole === 'motor' ? model.creations.map((creation) => otherSideSpot({ bricks: others, partMap, plateSize }, creation)).filter((spot): spot is OtherSideSpot => spot !== null) : []), [armedRole, model.creations, others, partMap, plateSize])
  const runs = useMemo(() => {
    if (!context || !armedPartId || armedRole !== 'motor') return []
    const shown = new Set(otherSides.map((spot) => spot.plateId))
    return context.motorEdgeRuns(armedPartId).filter((run) => !shown.has(run.plateId))
  }, [context, armedPartId, armedRole, otherSides])
  const dimSockets = useMemo(() => (context && armedRole === 'wheel' ? context.mechanisms().motors.filter((motor) => !motor.axleId) : []), [context, armedRole])

  const snap = snapState.snap
  const snappedHere = Boolean(draft && snap && armedPartId && snap.partId === draft.partId && snap.pose.x === draft.x && snap.pose.y === draft.y && snap.pose.z === draft.z && snap.pose.rotation === draft.rotation)
  const snappedKey = snappedHere ? snap!.targetKey : null
  const ghostSnapped = Boolean(snappedHere && draft && armedPart && draftIsValid(draft, others as BrickInstance[], null, partMap, plateSize))
  const hint = armedPartId && snapState.hint?.partId === armedPartId && !snappedHere ? snapState.hint : null
  // A robot part's ghost that is red says why, beside it, and outlines what is in the way.
  const preview = useMemo(() => (draft && armedPartId ? previewProblem({ bricks: others, partMap, plateSize }, draft, null, snappedHere ? snap?.kind ?? null : null) : null), [draft, armedPartId, others, partMap, plateSize, snappedHere, snap])

  // Always in build mode: near misses (not on a part being moved), motors on the bare ground, and the part the latest advice line is about.
  const gaps = useMemo(() => (active ? gapMarkers(visible, partMap, plateSize).filter((marker) => marker.brickId !== movingId) : []), [active, visible, partMap, plateSize, movingId])
  const grounded = useMemo(() => new Set(active ? motorsOnBareGround(visible) : []), [active, visible])
  // Every wheel that can't spin: its red mark (a near miss keeps its gap marker instead) and its number in the robot's list.
  const cantSpin = useMemo(() => {
    if (!active) return []
    const mechanisms = deriveMechanisms(visible, partMap, plateSize)
    const numbers = new Map<string, number>()
    for (const ids of looseWheelsByRobot({ ...model.input, bricks: visible }, model.creations, mechanisms).values()) ids.forEach((id, index) => { if (ids.length > 1) numbers.set(id, index + 1) })
    const gapped = new Set(gaps.filter((marker) => marker.kind === 'wheel-axle').map((marker) => marker.brickId))
    return wheelSpins(mechanisms).filter((wheel) => !wheel.spins && wheel.wheelId !== movingId).map((wheel) => ({ link: mechanisms.wheelById.get(wheel.wheelId)!, number: numbers.get(wheel.wheelId) ?? null, mark: gapped.has(wheel.wheelId) ? 'gap' as const : 'ring' as const }))
  }, [active, visible, partMap, plateSize, model, gaps, movingId])
  const labels = useMemo(() => {
    if (!active) return []
    const list: PartLabel[] = []
    for (const brick of visible) {
      const advice = grounded.has(brick.id) ? BARE_GROUND_TEXT : note?.brickId === brick.id ? note.text : null
      const at = advice ? topOf(brick, partMap, plateSize, 0.42) : null
      // A hint about a motor that already says why (on the bare ground) makes that line stand out instead of adding another.
      if (advice && at) list.push({ brickId: brick.id, at, text: advice, tone: note?.brickId === brick.id && note.tone === 'done' && !grounded.has(brick.id) ? 'done' : 'advice', emphasis: hint?.brickId === brick.id })
    }
    if (hint && !list.some((label) => label.brickId === hint.brickId)) list.push({ brickId: hint.brickId, at: { x: hint.point.x, y: hint.point.y + 0.5, z: hint.point.z }, text: HINT_TEXT[hint.kind] ?? '', tone: 'advice', emphasis: true })
    for (const marker of gaps) {
      // The motor's own line already says it is too low; the red ring shows where.
      if (marker.text === GAP_TEXT.motorTooLow && grounded.has(marker.targetId)) continue
      if (list.some((label) => label.brickId === marker.brickId)) continue
      list.push({ brickId: marker.brickId, at: { x: marker.at.x, y: marker.at.y + 0.55, z: marker.at.z }, text: marker.text, tone: 'gap', emphasis: false })
    }
    // The red ghost's reason, above it.
    const ghostTop = draft && preview ? topOf(draft, partMap, plateSize, 0.5) : null
    if (ghostTop && preview) list.push({ brickId: 'ghost', at: ghostTop, text: preview.text, tone: 'gap', emphasis: false })
    // The other side with no room: why, above where the motor would go (only while the ghost is not already saying it).
    for (const spot of otherSides) {
      if (spot.free || (ghostTop && preview)) continue
      const at = topOf({ partId: 'robo_motor', ...spot.pose }, partMap, plateSize, 0.5)
      if (at) list.push({ brickId: `other-side:${spot.motorId}`, at, text: 'No room for a motor here. Try a bigger plate.', tone: 'gap', emphasis: false })
    }
    return list
  }, [active, visible, grounded, note, hint, gaps, partMap, plateSize, draft, preview, otherSides])
  // What is in the way: of the red ghost, of the other side, of a fix that could not be done.
  const outlined = useMemo(() => {
    if (!active) return []
    const ids = new Set<string>([...(preview?.blockers ?? []), ...otherSides.filter((spot) => !spot.free).flatMap((spot) => spot.blockers), ...(note?.blockers ?? [])])
    return [...ids].map((id) => byId.get(id)).filter((brick): brick is BrickInstance => Boolean(brick) && !hidden?.has(brick!.id))
  }, [active, preview, otherSides, note, byId, hidden])

  useEffect(() => {
    summary = {
      armed: armedPartId,
      targets: targets.map((target) => ({ key: target.key, kind: target.kind, brickId: target.brickId })),
      runs: runs.map((run) => ({ key: run.key, poses: run.poses })),
      dimSockets: dimSockets.map((motor) => motor.motorId),
      snappedKey,
      ghostSnapped,
      hint: hint ? HINT_TEXT[hint.kind] ?? null : null,
      gaps: gaps.map((gap) => ({ key: gap.key, brickId: gap.brickId, text: gap.text })),
      labels: labels.map((label) => ({ brickId: label.brickId, text: label.text, tone: label.tone, emphasis: label.emphasis })),
      cantSpin: cantSpin.map((wheel) => ({ brickId: wheel.link.wheelId, number: wheel.number, mark: wheel.mark })),
      otherSide: otherSides.map((spot) => ({ motorId: spot.motorId, pose: spot.pose, free: spot.free, mirrored: spot.mirrored, blockers: spot.blockers })),
      preview,
      outlined: outlined.map((brick) => brick.id),
    }
  })

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    const hook = (host.__robotics = host.__robotics ?? {})
    hook.connections = () => summary
    return () => { delete hook.connections }
  }, [])

  if (!active) return null
  const motorPart = partMap.robo_motor
  const noteGhost = note?.ghost ?? null
  return (
    <>
      {armedPart && targets.map((target) => <ConnectorTarget key={target.key} target={target} part={armedPart} plateSize={plateSize} lit={target.key === snappedKey} />)}
      {armedPart && runs.map((run) => <EdgeTarget key={`${run.key}:${run.poses[0].x},${run.poses[0].z}`} run={run} part={armedPart} plateSize={plateSize} lit={run.key === snappedKey && run.poses.some((pose) => pose.x === draft?.x && pose.z === draft?.z)} />)}
      {otherSides.map((spot) => <OtherSideTarget key={spot.motorId} spot={spot} part={motorPart} plateSize={plateSize} lit={Boolean(draft && spot.free && draft.x === spot.pose.x && draft.y === spot.pose.y && draft.z === spot.pose.z && draft.rotation === spot.pose.rotation)} />)}
      {dimSockets.map((motor) => <DimSocket key={motor.motorId} at={motor.socket.point} direction={motor.socket.normal} />)}
      {ghostSnapped && draft && armedPart && <SnappedGhost draft={draft} part={armedPart} plateSize={plateSize} />}
      {gaps.map((marker) => <GapMark key={marker.key} marker={marker} />)}
      {cantSpin.map((wheel) => (
        <group key={wheel.link.wheelId}>
          {wheel.mark === 'ring' && <CantSpinMark wheel={wheel.link} />}
          <WheelBadge at={{ x: wheel.link.center.x, y: wheel.link.center.y + wheel.link.radius + 0.22, z: wheel.link.center.z }} number={wheel.number} />
        </group>
      ))}
      {outlined.map((brick) => <BrickOutline key={`way:${brick.id}`} brick={brick} part={partMap[brick.partId]} plateSize={plateSize} color={WAY} />)}
      {noteGhost && <PartGhost part={partMap[noteGhost.partId]} pose={noteGhost.pose} plateSize={plateSize} color={GAP} opacity={0.25} />}
      {labels.map((label) => <Label key={`${label.tone}:${label.brickId}`} at={label.at} text={label.text} tone={label.tone} emphasis={label.emphasis} />)}
    </>
  )
}
