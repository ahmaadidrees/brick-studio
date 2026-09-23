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
 */
const TARGET = '#12b76a'
const TARGET_LIT = '#35f28e'
const DIM = '#7d8a90'
const GAP = '#e5383b'

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

function Label({ at, text, tone, emphasis = false }: { at: Vec3; text: string; tone: 'gap' | 'advice'; emphasis?: boolean }) {
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
}
let summary: Summary = { armed: null, targets: [], runs: [], dimSockets: [], snappedKey: null, ghostSnapped: false, hint: null, gaps: [], labels: [] }

const topOf = (brick: BrickInstance, partMap: PartMap, plateSize: number, lift: number): Vec3 | null => {
  const part = partMap[brick.partId]
  if (!part) return null
  const origin = brickOriginFor(brick, part, plateSize)
  return { x: origin.x, y: origin.y + part.height * PLATE_HEIGHT + lift, z: origin.z }
}

type PartLabel = { brickId: string; at: Vec3; text: string; tone: 'gap' | 'advice'; emphasis: boolean }

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

  // What the armed part can connect to: the same context the snapper answers from.
  const armedPartId = active && draft && !groupMove ? draft.partId : null
  const armedRole = armedPartId ? roboticsSpec(armedPartId)?.role : undefined
  const armedPart = armedPartId ? partMap[armedPartId] : undefined
  const context = useMemo(() => (armedRole === 'axle' || armedRole === 'wheel' || armedRole === 'motor' ? sharedSnapContext(others, partMap, plateSize) : null), [armedRole, others, partMap, plateSize])
  const targets = useMemo(() => (context && armedPartId && armedRole !== 'motor' ? context.connectorTargets(armedPartId).filter((target) => !target.blocked) : []), [context, armedPartId, armedRole])
  const runs = useMemo(() => (context && armedPartId && armedRole === 'motor' ? context.motorEdgeRuns(armedPartId) : []), [context, armedPartId, armedRole])
  const dimSockets = useMemo(() => (context && armedRole === 'wheel' ? context.mechanisms().motors.filter((motor) => !motor.axleId) : []), [context, armedRole])

  const snap = snapState.snap
  const snappedHere = Boolean(draft && snap && armedPartId && snap.partId === draft.partId && snap.pose.x === draft.x && snap.pose.y === draft.y && snap.pose.z === draft.z && snap.pose.rotation === draft.rotation)
  const snappedKey = snappedHere ? snap!.targetKey : null
  const ghostSnapped = Boolean(snappedHere && draft && armedPart && draftIsValid(draft, others as BrickInstance[], null, partMap, plateSize))
  const hint = armedPartId && snapState.hint?.partId === armedPartId && !snappedHere ? snapState.hint : null

  // Always in build mode: near misses (not on a part being moved), motors on the bare ground, and the part the latest advice line is about.
  const gaps = useMemo(() => (active ? gapMarkers(visible, partMap, plateSize).filter((marker) => marker.brickId !== movingId) : []), [active, visible, partMap, plateSize, movingId])
  const grounded = useMemo(() => new Set(active ? motorsOnBareGround(visible) : []), [active, visible])
  const labels = useMemo(() => {
    if (!active) return []
    const list: PartLabel[] = []
    for (const brick of visible) {
      const advice = grounded.has(brick.id) ? BARE_GROUND_TEXT : note?.brickId === brick.id ? note.text : null
      const at = advice ? topOf(brick, partMap, plateSize, 0.42) : null
      // A hint about a motor that already says why (on the bare ground) makes that line stand out instead of adding another.
      if (advice && at) list.push({ brickId: brick.id, at, text: advice, tone: 'advice', emphasis: hint?.brickId === brick.id })
    }
    if (hint && !list.some((label) => label.brickId === hint.brickId)) list.push({ brickId: hint.brickId, at: { x: hint.point.x, y: hint.point.y + 0.5, z: hint.point.z }, text: HINT_TEXT[hint.kind] ?? '', tone: 'advice', emphasis: true })
    for (const marker of gaps) {
      // The motor's own line already says it is too low; the red ring shows where.
      if (marker.text === GAP_TEXT.motorTooLow && grounded.has(marker.targetId)) continue
      list.push({ brickId: marker.brickId, at: { x: marker.at.x, y: marker.at.y + 0.55, z: marker.at.z }, text: marker.text, tone: 'gap', emphasis: false })
    }
    return list
  }, [active, visible, grounded, note, hint, gaps, partMap, plateSize])

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
  return (
    <>
      {armedPart && targets.map((target) => <ConnectorTarget key={target.key} target={target} part={armedPart} plateSize={plateSize} lit={target.key === snappedKey} />)}
      {armedPart && runs.map((run) => <EdgeTarget key={`${run.key}:${run.poses[0].x},${run.poses[0].z}`} run={run} part={armedPart} plateSize={plateSize} lit={run.key === snappedKey && run.poses.some((pose) => pose.x === draft?.x && pose.z === draft?.z)} />)}
      {dimSockets.map((motor) => <DimSocket key={motor.motorId} at={motor.socket.point} direction={motor.socket.normal} />)}
      {ghostSnapped && draft && armedPart && <SnappedGhost draft={draft} part={armedPart} plateSize={plateSize} />}
      {gaps.map((marker) => <GapMark key={marker.key} marker={marker} />)}
      {labels.map((label) => <Label key={`${label.tone}:${label.brickId}`} at={label.at} text={label.text} tone={label.tone} emphasis={label.emphasis} />)}
    </>
  )
}
