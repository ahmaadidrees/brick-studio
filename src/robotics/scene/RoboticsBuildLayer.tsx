import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { getBuildBounds } from '../../brick/bounds'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP, STUD } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { brickIdOfNode, isArmNode } from '../model/assembly'
import { deriveCandidate, type DerivedCreation } from '../model/creations'
import { brickFrame, toWorldDirection, toWorldPoint, type BrickFrame } from '../model/grid'
import { snapDraftToConnector } from '../model/snap'
import type { Vec3 } from '../model/vec'
import { MOTOR_SOCKET_RADIUS, roboticsSpec } from '../parts/catalog'
import { buildHingeHousing, buildHingeTurntable } from '../parts/geometry'
import { useRoboticsStore, type RoboticsModel, type SimState } from '../state/roboticsStore'
import Cables from '../wiring/Cables'
import type { HingeReport } from '../sim/mechanics'
import { registerDraftSnapper } from './draftSnap'
import { framePoseInFreeArea, measureCanvasInsets } from './framing'
import { useHiddenBrickIds } from './hiddenBricks'
import StageLayer from './StageLayer'

/**
 * What the robotics prototype adds to the build scene: body highlights for the
 * creation card (assembly in blue, a moving arm in coral, a locking contact in red),
 * port labels on hubs, a spinning output disc on every motor, and, while a nudge
 * runs, the creation's bodies drawn at their simulated poses (the studio hides its
 * own copies of those bricks meanwhile). Nothing here writes to the document.
 */
const BLUE = '#3565bf'
const CORAL = '#f17861'
const RED = '#d8362a'

type Highlight = { brick: BrickInstance; color: string }

function usePlateSize() {
  return useRoboticsStore((state) => state.model.input.plateSize)
}

function frameOf(brick: BrickInstance, plateSize: number): BrickFrame | null {
  const part = BRICK_PART_MAP[brick.partId]
  return part ? brickFrame(brick, part, plateSize) : null
}

function BrickShell({ brick, color, opacity = 0.32, scale = 1.04, plateSize }: { brick: BrickInstance; color: string; opacity?: number; scale?: number; plateSize: number }) {
  const part = BRICK_PART_MAP[brick.partId]
  const geometry = useMemo(() => (part ? createBrickGeometry(part) : null), [part])
  const frame = frameOf(brick, plateSize)
  if (!geometry || !frame) return null
  return (
    <mesh geometry={geometry} position={[frame.origin.x, frame.origin.y, frame.origin.z]} rotation={[0, (brick.rotation * Math.PI) / 2, 0]} scale={scale} renderOrder={3}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function highlightsFor(model: RoboticsModel, creation: DerivedCreation | null, extraRed: Set<string>, coralContacts: Set<string>): Highlight[] {
  const byId = new Map(model.input.bricks.map((brick) => [brick.id, brick]))
  const result: Highlight[] = []
  if (creation) {
    const arm = new Set(creation.hinges.flatMap((hinge) => hinge.armBrickIds))
    const red = new Set(creation.hinges.flatMap((hinge) => hinge.bridging.flatMap((joint) => [joint.lowerBrickId, joint.upperBrickId].filter((id): id is string => Boolean(id)))))
    for (const id of creation.brickIds) {
      const brick = byId.get(id)
      if (!brick) continue
      result.push({ brick, color: red.has(id) ? RED : arm.has(id) ? CORAL : BLUE })
    }
  }
  for (const id of extraRed) { const brick = byId.get(id); if (brick && !result.some((entry) => entry.brick.id === id)) result.push({ brick, color: RED }) }
  for (const id of coralContacts) { const brick = byId.get(id); if (brick) result.push({ brick, color: CORAL }) }
  return result
}

const labelTextures = new Map<string, THREE.CanvasTexture>()
function labelTexture(text: string): THREE.CanvasTexture | null {
  const cached = labelTextures.get(text)
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#1f2a33'
  context.beginPath()
  context.roundRect(4, 4, 56, 56, 12)
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = '900 38px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 32, 34)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  labelTextures.set(text, texture)
  return texture
}

function PortLabel({ text, position }: { text: string; position: Vec3 }) {
  const texture = useMemo(() => labelTexture(text), [text])
  if (!texture) return null
  return (
    <sprite position={[position.x, position.y, position.z]} scale={[0.26, 0.26, 1]} renderOrder={4}>
      <spriteMaterial map={texture} transparent depthTest depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

function HubPortLabels({ bricks, plateSize }: { bricks: readonly BrickInstance[]; plateSize: number }) {
  return (
    <>
      {bricks.flatMap((brick) => {
        const spec = roboticsSpec(brick.partId)
        const frame = spec?.ports ? frameOf(brick, plateSize) : null
        if (!spec?.ports || !frame) return []
        return spec.ports.map((port) => {
          const point = toWorldPoint(frame, port.point)
          const normal = toWorldDirection(frame, port.normal)
          return <PortLabel key={`${brick.id}:${port.label}`} text={port.label} position={{ x: point.x + normal.x * 0.16, y: point.y + 0.02, z: point.z + normal.z * 0.16 }} />
        })
      })}
    </>
  )
}

const discGeometry = (() => {
  const disc = new THREE.CylinderGeometry(MOTOR_SOCKET_RADIUS - 0.07, MOTOR_SOCKET_RADIUS - 0.07, 0.07, 20)
  disc.rotateZ(-Math.PI / 2)
  return disc
})()
const notchGeometry = new THREE.BoxGeometry(0.05, 0.12, 0.06)

/** The motor's output, drawn in the socket ring; it turns with the output angle. */
function MotorOutputDisc({ point, normal, register }: { point: Vec3; normal: Vec3; register?: (group: THREE.Group | null) => void }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(normal.x, normal.y, normal.z)), [normal.x, normal.y, normal.z])
  return (
    <group position={[point.x + normal.x * 0.04, point.y + normal.y * 0.04, point.z + normal.z * 0.04]} quaternion={quaternion}>
      <group ref={register}>
        <mesh geometry={discGeometry}><meshStandardMaterial color="#1f2a33" roughness={0.5} /></mesh>
        <mesh geometry={notchGeometry} position={[0.04, MOTOR_SOCKET_RADIUS - 0.16, 0]}><meshStandardMaterial color="#f4ca3a" roughness={0.5} /></mesh>
      </group>
    </group>
  )
}

function StaticMotorOutputs({ bricks, plateSize }: { bricks: readonly BrickInstance[]; plateSize: number }) {
  return (
    <>
      {bricks.flatMap((brick) => {
        const spec = roboticsSpec(brick.partId)
        const frame = spec?.socket ? frameOf(brick, plateSize) : null
        if (!spec?.socket || !frame) return []
        return [<MotorOutputDisc key={brick.id} point={toWorldPoint(frame, spec.socket.point)} normal={toWorldDirection(frame, spec.socket.normal)} />]
      })}
    </>
  )
}

function SimBrick({ brick, plateSize, node, highlight }: { brick: BrickInstance; plateSize: number; node: string; highlight: string | null }) {
  const part = BRICK_PART_MAP[brick.partId]
  const spec = roboticsSpec(brick.partId)
  const geometry = useMemo(() => {
    if (!part) return null
    if (spec?.hinge) return isArmNode(node) ? buildHingeTurntable(part) : buildHingeHousing(part)
    return createBrickGeometry(part)
  }, [part, spec, node])
  const frame = frameOf(brick, plateSize)
  if (!geometry || !frame) return null
  const position: [number, number, number] = [frame.origin.x, frame.origin.y, frame.origin.z]
  const rotation: [number, number, number] = [0, (brick.rotation * Math.PI) / 2, 0]
  return (
    <>
      <mesh geometry={geometry} position={position} rotation={rotation} castShadow receiveShadow>
        <meshStandardMaterial color={brick.color} roughness={0.58} metalness={0.02} />
      </mesh>
      {highlight && (
        <mesh geometry={geometry} position={position} rotation={rotation} scale={1.04} renderOrder={3}>
          <meshBasicMaterial color={highlight} transparent opacity={0.4} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </>
  )
}

function SimBodies({ sim, model, creation }: { sim: SimState; model: RoboticsModel; creation: DerivedCreation }) {
  const plateSize = model.input.plateSize
  const groups = useRef(new Map<string, THREE.Group>())
  const discs = useRef(new Map<string, THREE.Group>())
  const frame = useRef(0)
  const publish = useRoboticsStore((state) => state.publishSimReports)
  const contacts = useRoboticsStore((state) => state.contacts)
  const contactIds = useMemo(() => new Set(contacts.flatMap((contact) => [contact.brickId, contact.otherBrickId].filter((id): id is string => Boolean(id)))), [contacts])
  const byId = useMemo(() => new Map(model.input.bricks.map((brick) => [brick.id, brick])), [model.input.bricks])
  const motorFrames = useMemo(() => creation.motors.map((motor) => {
    const brick = byId.get(motor.brickId)!
    const spec = roboticsSpec(brick.partId)!
    const frameOfMotor = frameOf(brick, plateSize)!
    return { motor, point: toWorldPoint(frameOfMotor, spec.socket!.point), normal: toWorldDirection(frameOfMotor, spec.socket!.normal), bodyId: sim.mechanics.bodyOfBrick(motor.brickId) }
  }), [creation.motors, byId, plateSize, sim])

  useFrame((_, delta) => {
    // The mechanics clock owns the backlog policy (fixed steps, stalls dropped past 0.1 s); pass real frame time.
    sim.mechanics.step(delta)
    const poses = sim.mechanics.poses()
    for (const [id, group] of groups.current) {
      const pose = poses.get(id)
      if (!pose) continue
      group.position.set(pose.position.x, pose.position.y, pose.position.z)
      group.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w)
    }
    for (const [motorId, group] of discs.current) group.rotation.x = sim.mechanics.motorOutputAngle(motorId)
    frame.current += 1
    if (frame.current % 6 === 0) {
      const hingeReports: Record<string, HingeReport> = {}
      for (const hinge of creation.hinges) { const report = sim.mechanics.hingeReport(hinge.brickId); if (report) hingeReports[hinge.brickId] = report }
      const motorAngles: Record<string, number> = {}
      for (const motor of creation.motors) motorAngles[motor.brickId] = sim.mechanics.motorOutputAngle(motor.brickId)
      publish(sim.mechanics.contacts(), hingeReports, motorAngles)
    }
  })

  return (
    <>
      {creation.bodies.map((body) => (
        <group key={body.id} ref={(group) => { if (group) groups.current.set(body.id, group); else groups.current.delete(body.id) }}>
          {body.nodes.map((node) => {
            const brick = byId.get(brickIdOfNode(node)!)
            return brick ? <SimBrick key={node} brick={brick} plateSize={plateSize} node={node} highlight={contactIds.has(brick.id) ? CORAL : null} /> : null
          })}
          {motorFrames.filter((entry) => entry.bodyId === body.id).map((entry) => (
            <MotorOutputDisc key={entry.motor.brickId} point={entry.point} normal={entry.normal} register={(group) => { if (group) discs.current.set(entry.motor.brickId, group); else discs.current.delete(entry.motor.brickId) }} />
          ))}
        </group>
      ))}
      {[...contactIds].filter((id) => !sim.hiddenBrickIds.has(id)).map((id) => { const brick = byId.get(id); return brick ? <BrickShell key={`contact-${id}`} brick={brick} color={CORAL} plateSize={plateSize} /> : null })}
    </>
  )
}

/** While the layer is mounted, the studio's ghost snaps onto connectors (`draftSnap.ts`, `model/snap.ts`). */
function ConnectorSnapping() {
  useEffect(() => {
    registerDraftSnapper((draft, hitBrick, hitPoint, bricks, plateSize) => snapDraftToConnector({ draft, hitBrick, hitPoint, bricks, partMap: useRoboticsStore.getState().model.input.partMap, plateSize }))
    return () => registerDraftSnapper(null)
  }, [])
  return null
}

/**
 * Answers the store's frame requests: the creation's bricks framed inside the part of
 * the canvas the drawer, the card and the command strip leave free (`framing.ts`).
 * Measured a frame later so the card that opened with the request has laid out.
 */
function CreationFraming() {
  const request = useRoboticsStore((state) => state.frameRequest)
  const { camera, controls, gl } = useThree()
  useEffect(() => {
    if (!request) return
    const handle = requestAnimationFrame(() => {
      const state = useBrickStore.getState()
      const ids = new Set(request.brickIds)
      const bricks = state.bricks.filter((brick) => ids.has(brick.id))
      if (!bricks.length || !(camera instanceof THREE.PerspectiveCamera)) return
      const plateSize = getBuildPlateSize(state.documentMetadata)
      const canvas = gl.domElement
      const viewport = { width: canvas.clientWidth || 1, height: canvas.clientHeight || 1 }
      const pose = framePoseInFreeArea(getBuildBounds(bricks, plateSize), camera.fov, viewport, measureCanvasInsets(canvas))
      camera.position.set(pose.position.x, pose.position.y, pose.position.z)
      const orbit = controls as OrbitControlsImpl | null
      if (orbit?.target) {
        orbit.target.set(pose.target.x, pose.target.y, pose.target.z)
        orbit.update()
      } else camera.lookAt(pose.target.x, pose.target.y, pose.target.z)
      state.setViewTarget(pose.target.x / STUD + plateSize / 2, pose.target.z / STUD + plateSize / 2)
    })
    return () => cancelAnimationFrame(handle)
  }, [request, camera, controls, gl])
  return null
}

/** Dev only: lets the QA harness aim a real pointer at a connector by projecting world points to the page. */
function DevProjector() {
  const { camera, gl } = useThree()
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    const hook = (host.__robotics = host.__robotics ?? {})
    hook.project = (point: Vec3) => {
      const projected = new THREE.Vector3(point.x, point.y, point.z).project(camera)
      const rect = gl.domElement.getBoundingClientRect()
      return { x: rect.left + ((projected.x + 1) / 2) * rect.width, y: rect.top + ((1 - projected.y) / 2) * rect.height, inFront: projected.z < 1 }
    }
    hook.canvasRect = () => { const rect = gl.domElement.getBoundingClientRect(); return { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }
    hook.insets = () => measureCanvasInsets(gl.domElement)
    return () => { delete hook.project; delete hook.canvasRect; delete hook.insets }
  }, [camera, gl])
  return null
}

export default function RoboticsBuildLayer() {
  const model = useRoboticsStore((state) => state.model)
  const card = useRoboticsStore((state) => state.card)
  const sim = useRoboticsStore((state) => state.sim)
  const selectedId = useBrickStore((state) => state.selectedId)
  const plateSize = usePlateSize()
  const resetSim = useRoboticsStore((state) => state.resetSim)
  useEffect(() => () => { resetSim() }, [resetSim])

  const cardCreation = useMemo(() => {
    if (!card) return null
    if (card.creationId) return model.creations.find((creation) => creation.id === card.creationId) ?? null
    return deriveCandidate(model.input, card.anchorBrickIds, card.suggestedName)
  }, [card, model])
  const focused = useMemo(() => {
    if (sim) return model.creations.find((creation) => creation.id === sim.creationId) ?? null
    if (selectedId) return model.creations.find((creation) => creation.brickIds.includes(selectedId)) ?? null
    return null
  }, [model, selectedId, sim])
  const lockedRed = useMemo(() => new Set((cardCreation ?? focused)?.hinges.flatMap((hinge) => hinge.bridging.flatMap((joint) => [joint.lowerBrickId, joint.upperBrickId].filter((id): id is string => Boolean(id)))) ?? []), [cardCreation, focused])
  const highlights = useMemo(() => highlightsFor(model, cardCreation, lockedRed, new Set()), [model, cardCreation, lockedRed])
  const simCreation = sim ? model.creations.find((creation) => creation.id === sim.creationId) ?? null : null
  // Whatever a nudge or the stage draws itself, the build overlays leave alone.
  const hidden = useHiddenBrickIds()
  const visible = hidden ? model.input.bricks.filter((brick) => !hidden.has(brick.id)) : model.input.bricks

  return (
    <>
      <ConnectorSnapping />
      <CreationFraming />
      <DevProjector />
      {highlights.filter((entry) => !hidden?.has(entry.brick.id)).map((entry) => <BrickShell key={entry.brick.id} brick={entry.brick} color={entry.color} plateSize={plateSize} />)}
      <HubPortLabels bricks={visible} plateSize={plateSize} />
      <StaticMotorOutputs bricks={visible} plateSize={plateSize} />
      <Cables />
      {sim && simCreation && <SimBodies sim={sim} model={model} creation={simCreation} />}
      <StageLayer />
    </>
  )
}
