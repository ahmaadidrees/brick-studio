import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { createBrickGeometry } from '../../brick/geometry'
import { BRICK_PART_MAP, PLATE_HEIGHT, STUD } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { brickIdOfNode, isArmNode } from '../model/assembly'
import { brickFrame, toWorldDirection, toWorldPoint } from '../model/grid'
import type { Vec3 } from '../model/vec'
import { MOTOR_SOCKET_RADIUS, roboticsSpec } from '../parts/catalog'
import { buildHingeHousing, buildHingeTurntable } from '../parts/geometry'
import { PROGRAM_KEYS, type LightColor } from '../program/types'
import { programKeyFromEvent } from '../run/input'
import type { RunController, RunObservation, TestProp } from '../run/types'
import { useStageStore, type StageSession } from '../state/stageStore'
import { setHiddenBrickIds } from './hiddenBricks'

/**
 * The stage (CP2-PLAN §4): while a stage is open, this draws the creation at the run
 * controller's poses, the test props (a brick wall; a visitor that reads as a figure),
 * each distance sensor's beam (a thin line to what it hits, coral when it hits), lit
 * lights in their colour, and the coral highlight on an arm's contacts (and, for an arm
 * built into the frame, on the joint that locks it). A click on a button part presses
 * it. The controller is advanced here with real frame time (its clock takes whole fixed
 * steps and drops stalls), and its observation is published to the store at about 10 Hz.
 * While mounted, the studio hides the creation's bricks (My world) or every brick (the
 * test plate). Arrow keys and space go to the program while it runs, never to the studio.
 */
const CORAL = '#f17861'
const BEAM_IDLE = '#f4ca3a'
const BEAM_HIT = '#e7473c'
const PUBLISH_SECONDS = 0.1
export const LIGHT_HEX: Record<LightColor, string> = {
  red: '#ff3b30', orange: '#ff9500', yellow: '#ffd60a', green: '#34c759', blue: '#0a84ff', purple: '#bf5af2', white: '#ffffff',
}

export default function StageLayer() {
  const stage = useStageStore((state) => state.stage)
  if (!stage) return null
  return <StageScene key={stage.generation} session={stage} />
}

/* ------------------------------------------------------------------ geometry */

const hingeGeometries = new Map<string, THREE.BufferGeometry>()
function brickGeometry(brick: BrickInstance, node: string): THREE.BufferGeometry | null {
  const part = BRICK_PART_MAP[brick.partId]
  if (!part) return null
  if (!roboticsSpec(brick.partId)?.hinge) return createBrickGeometry(part)
  const key = `${part.id}:${isArmNode(node) ? 'arm' : 'housing'}`
  let geometry = hingeGeometries.get(key)
  if (!geometry) {
    geometry = isArmNode(node) ? buildHingeTurntable(part) : buildHingeHousing(part)
    hingeGeometries.set(key, geometry)
  }
  return geometry
}

function brickPlacement(brick: BrickInstance, plateSize: number) {
  const part = BRICK_PART_MAP[brick.partId]
  if (!part) return null
  const origin = brickFrame(brick, part, plateSize).origin
  return { position: [origin.x, origin.y, origin.z] as [number, number, number], rotation: [0, (brick.rotation * Math.PI) / 2, 0] as [number, number, number] }
}

const discGeometry = (() => {
  const disc = new THREE.CylinderGeometry(MOTOR_SOCKET_RADIUS - 0.07, MOTOR_SOCKET_RADIUS - 0.07, 0.07, 20)
  disc.rotateZ(-Math.PI / 2)
  return disc
})()
const notchGeometry = new THREE.BoxGeometry(0.05, 0.12, 0.06)
const beamGeometry = (() => {
  const beam = new THREE.CylinderGeometry(0.028, 0.028, 1, 8, 1, true)
  beam.translate(0, 0.5, 0)
  return beam
})()
const beamDotGeometry = new THREE.SphereGeometry(0.09, 12, 8)
const Y_UP = new THREE.Vector3(0, 1, 0)

let wallTexture: THREE.CanvasTexture | null = null
/** Two courses of running-bond bricks: one tile is 2 bricks (4 studs each) wide and 2 courses (3 plates each) tall. */
function brickWallTexture(): THREE.CanvasTexture | null {
  if (wallTexture) return wallTexture
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#9d8f7c'
  context.fillRect(0, 0, 256, 128)
  const brick = (x: number, y: number, width: number) => {
    context.fillStyle = '#d8ccb8'
    context.fillRect(x + 3, y + 3, width - 6, 58)
    context.fillStyle = 'rgba(255,255,255,0.18)'
    context.fillRect(x + 3, y + 3, width - 6, 8)
  }
  brick(0, 0, 128)
  brick(128, 0, 128)
  brick(-64, 64, 128)
  brick(64, 64, 128)
  brick(192, 64, 128)
  wallTexture = new THREE.CanvasTexture(canvas)
  wallTexture.colorSpace = THREE.SRGBColorSpace
  wallTexture.wrapS = THREE.RepeatWrapping
  wallTexture.wrapT = THREE.RepeatWrapping
  return wallTexture
}

/* ------------------------------------------------------------------ pieces */

type LightHandle = { material: THREE.MeshStandardMaterial; glow: THREE.Mesh; base: string }

function StageBrick({ brick, node, plateSize, highlighted, onLight, button }: {
  brick: BrickInstance
  node: string
  plateSize: number
  highlighted: boolean
  onLight?: (handle: LightHandle | null) => void
  button?: { press: (down: boolean) => void }
}) {
  const geometry = brickGeometry(brick, node)
  const placement = brickPlacement(brick, plateSize)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const glow = useRef<THREE.Mesh>(null)
  useEffect(() => {
    if (!onLight) return
    if (material.current && glow.current) onLight({ material: material.current, glow: glow.current, base: brick.color })
    return () => onLight(null)
  }, [onLight, brick.color])
  if (!geometry || !placement) return null
  const handlers = button
    ? {
        onPointerDown: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); button.press(true) },
        onPointerUp: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); button.press(false) },
        onPointerLeave: () => button.press(false),
        onClick: (event: ThreeEvent<MouseEvent>) => event.stopPropagation(),
        onPointerOver: () => { document.body.style.cursor = 'pointer' },
        onPointerOut: () => { document.body.style.cursor = '' },
      }
    : {}
  return (
    <group position={placement.position} rotation={placement.rotation}>
      <mesh geometry={geometry} castShadow receiveShadow userData={{ stageBrickId: brick.id }} {...handlers}>
        <meshStandardMaterial ref={material} color={brick.color} roughness={0.58} metalness={0.02} />
      </mesh>
      {onLight && (
        <mesh ref={glow} geometry={geometry} scale={1.3} visible={false} renderOrder={4}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      {highlighted && (
        <mesh geometry={geometry} scale={1.04} renderOrder={3}>
          <meshBasicMaterial color={CORAL} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
    </group>
  )
}

function MotorDisc({ point, normal, register }: { point: Vec3; normal: Vec3; register: (group: THREE.Group | null) => void }) {
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

type BeamHandle = { group: THREE.Group; line: THREE.Mesh; dot: THREE.Mesh; material: THREE.MeshBasicMaterial; dotMaterial: THREE.MeshBasicMaterial }

function Beam({ register }: { register: (handle: BeamHandle | null) => void }) {
  const group = useRef<THREE.Group>(null)
  const line = useRef<THREE.Mesh>(null)
  const dot = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const dotMaterial = useRef<THREE.MeshBasicMaterial>(null)
  useEffect(() => {
    if (group.current && line.current && dot.current && material.current && dotMaterial.current) register({ group: group.current, line: line.current, dot: dot.current, material: material.current, dotMaterial: dotMaterial.current })
    return () => register(null)
  }, [register])
  return (
    <group ref={group} visible={false}>
      <mesh ref={line} geometry={beamGeometry} renderOrder={5}>
        <meshBasicMaterial ref={material} color={BEAM_IDLE} transparent opacity={0.7} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={dot} geometry={beamDotGeometry} renderOrder={5}>
        <meshBasicMaterial ref={dotMaterial} color={BEAM_HIT} transparent opacity={0.95} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Wall({ prop, register }: { prop: Extract<TestProp, { kind: 'wall' }>; register: (group: THREE.Group | null) => void }) {
  const texture = useMemo(() => {
    const base = brickWallTexture()
    if (!base) return null
    const tile = base.clone()
    const along = Math.max(prop.size.x, prop.size.z)
    tile.repeat.set(along / (8 * STUD), prop.size.y / (6 * PLATE_HEIGHT))
    tile.needsUpdate = true
    return tile
  }, [prop.size.x, prop.size.y, prop.size.z])
  return (
    <group ref={register} position={[prop.center.x, prop.center.y, prop.center.z]}>
      <mesh castShadow receiveShadow userData={{ stagePropId: prop.id }}>
        <boxGeometry args={[prop.size.x, prop.size.y, prop.size.z]} />
        <meshStandardMaterial color="#ffffff" map={texture ?? undefined} roughness={0.85} />
      </mesh>
      <mesh position={[0, prop.size.y / 2 + 0.03, 0]} castShadow>
        <boxGeometry args={[prop.size.x + 0.04, 0.06, prop.size.z + 0.04]} />
        <meshStandardMaterial color="#8a7c69" roughness={0.9} />
      </mesh>
    </group>
  )
}

type FigureHandle = { root: THREE.Group; body: THREE.Group; leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group }

/** A simple minifigure-like walker sized to the visitor's box: legs, torso, arms and a round head, facing +Z locally. */
function Visitor({ prop, register }: { prop: Extract<TestProp, { kind: 'visitor' }>; register: (handle: FigureHandle | null) => void }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const leftLeg = useRef<THREE.Group>(null)
  const rightLeg = useRef<THREE.Group>(null)
  const leftArm = useRef<THREE.Group>(null)
  const rightArm = useRef<THREE.Group>(null)
  useEffect(() => {
    if (root.current && body.current && leftLeg.current && rightLeg.current && leftArm.current && rightArm.current) register({ root: root.current, body: body.current, leftLeg: leftLeg.current, rightLeg: rightLeg.current, leftArm: leftArm.current, rightArm: rightArm.current })
    return () => register(null)
  }, [register])
  const height = prop.size.y
  const width = Math.max(prop.size.x, prop.size.z)
  const depth = Math.min(prop.size.x, prop.size.z)
  const legHeight = height * 0.4
  const torsoHeight = height * 0.34
  const headRadius = Math.min(width * 0.26, height * 0.11)
  const bottom = -height / 2
  const start = prop.path[0] ?? { x: 0, y: 0, z: 0 }
  return (
    <group ref={root} position={[start.x, start.y, start.z]}>
      <group ref={body}>
        {[[-1, leftLeg], [1, rightLeg]].map(([side, ref]) => (
          <group key={String(side)} ref={ref as RefObject<THREE.Group>} position={[(side as number) * width * 0.2, bottom + legHeight, 0]}>
            <mesh position={[0, -legHeight / 2, 0]} castShadow>
              <boxGeometry args={[width * 0.36, legHeight, depth * 0.8]} />
              <meshStandardMaterial color="#2f3b52" roughness={0.7} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, bottom + legHeight + torsoHeight / 2, 0]} castShadow>
          <boxGeometry args={[width * 0.8, torsoHeight, depth * 0.85]} />
          <meshStandardMaterial color="#ef8d32" roughness={0.6} />
        </mesh>
        {[[-1, leftArm], [1, rightArm]].map(([side, ref]) => (
          <group key={`arm${String(side)}`} ref={ref as RefObject<THREE.Group>} position={[(side as number) * width * 0.5, bottom + legHeight + torsoHeight * 0.92, 0]}>
            <mesh position={[0, -torsoHeight * 0.45, 0]} castShadow>
              <boxGeometry args={[width * 0.18, torsoHeight * 0.9, depth * 0.55]} />
              <meshStandardMaterial color="#ef8d32" roughness={0.6} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, bottom + legHeight + torsoHeight + headRadius * 1.05, 0]} castShadow>
          <cylinderGeometry args={[headRadius, headRadius, headRadius * 2.1, 20]} />
          <meshStandardMaterial color="#f4ca3a" roughness={0.45} />
        </mesh>
        <mesh position={[0, bottom + legHeight + torsoHeight + headRadius * 2.35, 0]}>
          <cylinderGeometry args={[headRadius * 0.45, headRadius * 0.45, headRadius * 0.4, 16]} />
          <meshStandardMaterial color="#f4ca3a" roughness={0.45} />
        </mesh>
        {/* Eyes, so the figure has a front. */}
        {[-1, 1].map((side) => (
          <mesh key={`eye${side}`} position={[side * headRadius * 0.38, bottom + legHeight + torsoHeight + headRadius * 1.25, headRadius * 0.98]}>
            <sphereGeometry args={[headRadius * 0.12, 8, 6]} />
            <meshBasicMaterial color="#1f2a33" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

function BuiltPoseShell({ brick, plateSize }: { brick: BrickInstance; plateSize: number }) {
  const geometry = brickGeometry(brick, brick.id)
  const placement = brickPlacement(brick, plateSize)
  if (!geometry || !placement) return null
  return (
    <mesh geometry={geometry} position={placement.position} rotation={placement.rotation} scale={1.04} renderOrder={3}>
      <meshBasicMaterial color={CORAL} transparent opacity={0.4} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

/* ------------------------------------------------------------------ input */

const EDITABLE = 'input, textarea, select, [contenteditable="true"], .blocklyWidgetDiv, .blocklyDropDownDiv'

/** While the program runs, arrow keys and space are the program's: the studio does not see them. */
function useStageKeys(controller: RunController) {
  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(EDITABLE))
    const down = (event: KeyboardEvent) => {
      const key = programKeyFromEvent(event)
      if (!key || controller.phase !== 'running' || editable(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      event.preventDefault()
      event.stopPropagation()
      controller.setKey(key, true)
    }
    const up = (event: KeyboardEvent) => {
      const key = programKeyFromEvent(event)
      if (!key) return
      controller.setKey(key, false)
      if (controller.phase === 'running' && !editable(event.target)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const release = () => { for (const key of PROGRAM_KEYS) controller.setKey(key, false); controller.setJoystick(0, 0) }
    const visibility = () => { if (document.visibilityState !== 'visible') release() }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
      release()
    }
  }, [controller])
}

/* ------------------------------------------------------------------ scene */

const contactKeyOf = (observation: RunObservation | null) =>
  observation ? [...new Set(observation.contacts.flatMap((contact) => [contact.brickId, contact.otherBrickId].filter((id): id is string => Boolean(id))))].sort().join('|') : ''

const scratch = { from: new THREE.Vector3(), to: new THREE.Vector3(), direction: new THREE.Vector3() }

function StageScene({ session }: { session: StageSession }) {
  const { controller, creation, plateSize, bricks } = session
  const byId = useMemo(() => new Map(bricks.map((brick) => [brick.id, brick])), [bricks])
  const groups = useRef(new Map<string, THREE.Group>())
  const discs = useRef(new Map<string, THREE.Group>())
  const props = useRef(new Map<string, THREE.Group>())
  const figures = useRef(new Map<string, FigureHandle & { last: THREE.Vector3 | null; yaw: number; stride: number }>())
  const beams = useRef(new Map<string, BeamHandle>())
  const lights = useRef(new Map<string, LightHandle>())
  const publish = useStageStore((state) => state.publishStageObservation)
  const setButton = useStageStore((state) => state.setStageButton)
  const contactKey = useStageStore((state) => contactKeyOf(state.stageObservation))
  const contactIds = useMemo(() => new Set(contactKey ? contactKey.split('|') : []), [contactKey])
  const sincePublish = useRef(0)

  useEffect(() => {
    setHiddenBrickIds(controller.hiddenBrickIds)
    return () => setHiddenBrickIds(null)
  }, [controller])
  useStageKeys(controller)

  const lightIds = useMemo(() => new Set(creation.lights.map((light) => light.brickId)), [creation.lights])
  const buttonIds = useMemo(() => new Set(creation.buttons.map((button) => button.brickId)), [creation.buttons])
  const motorFrames = useMemo(() => creation.motors.flatMap((motor) => {
    const brick = byId.get(motor.brickId)
    const part = brick ? BRICK_PART_MAP[brick.partId] : undefined
    const spec = brick ? roboticsSpec(brick.partId) : null
    if (!brick || !part || !spec?.socket) return []
    const frame = brickFrame(brick, part, plateSize)
    return [{ id: motor.brickId, point: toWorldPoint(frame, spec.socket.point), normal: toWorldDirection(frame, spec.socket.normal), bodyId: controller.bodyOfBrick(motor.brickId) }]
  }), [creation.motors, byId, plateSize, controller])
  const lightRegister = useMemo(() => new Map(creation.lights.map((light) => [light.brickId, (handle: LightHandle | null) => { if (handle) lights.current.set(light.brickId, handle); else lights.current.delete(light.brickId) }])), [creation.lights])
  const buttonPress = useMemo(() => new Map(creation.buttons.map((button) => [button.brickId, { press: (down: boolean) => setButton(button.brickId, down) }])), [creation.buttons, setButton])
  const sensorIds = useMemo(() => creation.sensors.map((sensor) => sensor.brickId), [creation.sensors])
  const beamRegister = useMemo(() => new Map(sensorIds.map((id) => [id, (handle: BeamHandle | null) => { if (handle) beams.current.set(id, handle); else beams.current.delete(id) }])), [sensorIds])
  const figureRegister = useMemo(() => new Map(controller.props.map((prop) => [prop.id, (handle: FigureHandle | null) => {
    if (!handle) { figures.current.delete(prop.id); return }
    const facing = prop.kind === 'visitor' ? prop.facing : undefined
    figures.current.set(prop.id, { ...handle, last: null, yaw: facing ? Math.atan2(facing.x, facing.z) : 0, stride: 0 })
  }])), [controller.props])

  useFrame((_, delta) => {
    controller.advance(delta)
    const poses = controller.poses()
    for (const [id, group] of groups.current) {
      const pose = poses.get(id)
      if (!pose) continue
      group.position.set(pose.position.x, pose.position.y, pose.position.z)
      group.quaternion.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w)
    }
    for (const [motorId, group] of discs.current) group.rotation.x = controller.mechanics.motorOutputAngle(motorId)
    const observation = controller.observe()

    const propPoses = controller.propPoses()
    for (const [id, group] of props.current) {
      const pose = propPoses.get(id)
      if (pose) group.position.set(pose.position.x, pose.position.y, pose.position.z)
    }
    for (const prop of controller.props) {
      if (prop.kind !== 'visitor') continue
      const figure = figures.current.get(prop.id)
      const pose = propPoses.get(prop.id)
      if (!figure || !pose) continue
      const now = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z)
      figure.root.position.copy(now)
      const moved = figure.last ? Math.hypot(now.x - figure.last.x, now.z - figure.last.z) : 0
      let targetYaw = figure.yaw
      if (figure.last && moved > 1e-4) targetYaw = Math.atan2(now.x - figure.last.x, now.z - figure.last.z)
      else if (observation.visitorPhase === 'here' && prop.facing) targetYaw = Math.atan2(prop.facing.x, prop.facing.z)
      let turn = targetYaw - figure.yaw
      while (turn > Math.PI) turn -= 2 * Math.PI
      while (turn < -Math.PI) turn += 2 * Math.PI
      figure.yaw += turn * Math.min(1, delta * 10)
      figure.root.rotation.y = figure.yaw
      figure.stride = moved > 1e-4 ? figure.stride + moved * 5 : figure.stride * 0.8
      const swing = moved > 1e-4 ? Math.sin(figure.stride) * 0.5 : 0
      figure.leftLeg.rotation.x = swing
      figure.rightLeg.rotation.x = -swing
      figure.leftArm.rotation.x = -swing * 0.8
      figure.rightArm.rotation.x = swing * 0.8
      figure.last = now
    }

    for (const id of sensorIds) {
      const handle = beams.current.get(id)
      if (!handle) continue
      const beam = observation.beams.find((candidate) => candidate.deviceId === id)
      if (!beam) { handle.group.visible = false; continue }
      scratch.from.set(beam.from.x, beam.from.y, beam.from.z)
      scratch.to.set(beam.to.x, beam.to.y, beam.to.z)
      scratch.direction.subVectors(scratch.to, scratch.from)
      const length = Math.max(1e-3, scratch.direction.length())
      handle.group.visible = true
      handle.line.position.copy(scratch.from)
      handle.line.quaternion.setFromUnitVectors(Y_UP, scratch.direction.normalize())
      handle.line.scale.set(beam.hit ? 1.4 : 1, length, beam.hit ? 1.4 : 1)
      handle.material.color.set(beam.hit ? BEAM_HIT : BEAM_IDLE)
      handle.material.opacity = beam.hit ? 0.9 : 0.55
      handle.dot.visible = beam.hit
      handle.dot.position.copy(scratch.to)
    }

    for (const [id, handle] of lights.current) {
      const color = observation.lights[id] ?? null
      if (color) {
        handle.material.color.set(LIGHT_HEX[color])
        handle.material.emissive.set(LIGHT_HEX[color])
        handle.material.emissiveIntensity = 0.7
        ;(handle.glow.material as THREE.MeshBasicMaterial).color.set(LIGHT_HEX[color])
        handle.glow.visible = true
      } else {
        handle.material.color.set(handle.base)
        handle.material.emissive.set('#000000')
        handle.material.emissiveIntensity = 0
        handle.glow.visible = false
      }
    }

    sincePublish.current += delta
    if (sincePublish.current >= PUBLISH_SECONDS) {
      sincePublish.current = 0
      publish(observation)
    }
  })

  const drawn = controller.simulatedBrickIds
  return (
    <group name="robotics-stage">
      {creation.bodies.map((body) => (
        <group key={body.id} ref={(group) => { if (group) groups.current.set(body.id, group); else groups.current.delete(body.id) }}>
          {body.nodes.map((node) => {
            const brick = byId.get(brickIdOfNode(node)!)
            if (!brick) return null
            return (
              <StageBrick
                key={node}
                brick={brick}
                node={node}
                plateSize={plateSize}
                highlighted={contactIds.has(brick.id)}
                onLight={lightIds.has(brick.id) && !isArmNode(node) ? lightRegister.get(brick.id) : undefined}
                button={buttonIds.has(brick.id) && !isArmNode(node) ? buttonPress.get(brick.id) : undefined}
              />
            )
          })}
          {motorFrames.filter((entry) => entry.bodyId === body.id).map((entry) => (
            <MotorDisc key={entry.id} point={entry.point} normal={entry.normal} register={(group) => { if (group) discs.current.set(entry.id, group); else discs.current.delete(entry.id) }} />
          ))}
        </group>
      ))}
      {controller.props.map((prop) => prop.kind === 'wall'
        ? <Wall key={prop.id} prop={prop} register={(group) => { if (group) props.current.set(prop.id, group); else props.current.delete(prop.id) }} />
        : <Visitor key={prop.id} prop={prop} register={figureRegister.get(prop.id)!} />)}
      {sensorIds.map((id) => <Beam key={id} register={beamRegister.get(id)!} />)}
      {[...contactIds].filter((id) => !drawn.has(id) && !controller.hiddenBrickIds.has(id)).map((id) => { const brick = byId.get(id); return brick ? <BuiltPoseShell key={`contact-${id}`} brick={brick} plateSize={plateSize} /> : null })}
    </group>
  )
}
