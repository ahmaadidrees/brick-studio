import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { livePort } from '../model/control'
import type { Vec3 } from '../model/vec'
import { isDevicePart, roboticsSpec, type HubPort } from '../parts/catalog'
import { useRoboticsStore, type RoboticsModel } from '../state/roboticsStore'
import { brickObstacles, deviceCableEnd, hubPortEnd, looseCable, routeCable, routeLift, type CableEnd } from './route'

/**
 * Cables in the build scene (contract §5, the mock's Wiring board): one from every
 * plugged-in device to its hub port, routed automatically (`route.ts`) and never
 * positioned by hand. The selected device's cable is drawn bright, with both ends
 * marked: a ring where it leaves the device and an enlarged, tinted label on its port.
 * An unplugged device shows a short loose cable ending in a red plug. A stale cable
 * (its device was deleted) is kept in the document for Undo but not drawn. While a
 * nudge runs, the simulated bricks move, so their cables are left out until Reset.
 * Nothing here writes to the document, and nothing here takes a pointer event.
 */
const CABLE = '#263c51'
const CABLE_LIT = '#f3ca74'
const PLUG_RED = '#c9342e'
const CABLE_RADIUS = 0.05
const CABLE_LIT_RADIUS = 0.068

type DrawnCable = { deviceId: string; hubId: string; port: HubPort; points: Vec3[]; lit: boolean; device: CableEnd; socket: CableEnd }
type DrawnStub = { deviceId: string; points: Vec3[]; lit: boolean }
export type CableScene = { cables: DrawnCable[]; stubs: DrawnStub[] }

const noRaycast = () => null

/** Every cable and loose end the scene draws for this document, pure so it can be read back. */
export function cableScene(model: RoboticsModel, selectedId: string | null, hidden: ReadonlySet<string>): CableScene {
  const { bricks, partMap, plateSize, section } = model.input
  const byId = new Map(bricks.map((brick) => [brick.id, brick]))
  const obstacles = brickObstacles(bricks, partMap, plateSize)
  const cables: DrawnCable[] = []
  const stubs: DrawnStub[] = []
  const devices = bricks.filter((brick) => isDevicePart(brick.partId) && roboticsSpec(brick.partId)?.role !== 'hub')
  for (const device of devices) {
    if (hidden.has(device.id)) continue
    const end = deviceCableEnd(device, partMap, plateSize)
    if (!end) continue
    const lit = device.id === selectedId
    const cable = livePort(section, device.id, byId)
    const hub = cable ? byId.get(cable.hubId) as BrickInstance : null
    const socket = cable && hub && !hidden.has(hub.id) ? hubPortEnd(hub, cable.port, partMap, plateSize) : null
    if (cable && socket) cables.push({ deviceId: device.id, hubId: cable.hubId, port: cable.port, points: routeCable(end, socket, obstacles), lit, device: end, socket })
    else if (!cable) stubs.push({ deviceId: device.id, points: looseCable(end), lit })
  }
  return { cables, stubs }
}

function Tube({ points, radius, color, lit }: { points: Vec3[]; radius: number; color: string; lit: boolean }) {
  const geometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)), false, 'centripetal')
    return new THREE.TubeGeometry(curve, Math.max(24, points.length * 12), radius, 10, false)
  }, [points, radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} raycast={noRaycast} renderOrder={2} castShadow={false}>
      <meshStandardMaterial color={color} roughness={0.55} emissive={lit ? '#8a6414' : '#000000'} emissiveIntensity={lit ? 0.45 : 0} />
    </mesh>
  )
}

const sphere = new THREE.SphereGeometry(1, 16, 12)
const ring = new THREE.TorusGeometry(1, 0.28, 10, 24)

function Plug({ at, lit }: { at: Vec3; lit: boolean }) {
  return (
    <group position={[at.x, at.y, at.z]}>
      <mesh geometry={sphere} scale={lit ? 0.12 : 0.1} raycast={noRaycast}><meshStandardMaterial color={PLUG_RED} roughness={0.4} emissive={PLUG_RED} emissiveIntensity={0.3} /></mesh>
      <mesh geometry={sphere} scale={lit ? 0.15 : 0.126} raycast={noRaycast}><meshBasicMaterial color="#ffffff" side={THREE.BackSide} toneMapped={false} /></mesh>
    </group>
  )
}

/** The ring at the device end of the selected cable, facing along the socket. */
function EndRing({ end }: { end: CableEnd }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(end.normal.x, end.normal.y, end.normal.z)), [end.normal.x, end.normal.y, end.normal.z])
  return (
    <mesh geometry={ring} position={[end.point.x + end.normal.x * 0.03, end.point.y + end.normal.y * 0.03, end.point.z + end.normal.z * 0.03]} quaternion={quaternion} scale={0.11} raycast={noRaycast} renderOrder={5}>
      <meshBasicMaterial color={CABLE_LIT} toneMapped={false} depthTest={false} transparent opacity={0.95} />
    </mesh>
  )
}

const litLabels = new Map<string, THREE.CanvasTexture>()
function litLabel(text: string): THREE.CanvasTexture | null {
  const cached = litLabels.get(text)
  if (cached) return cached
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = 96
  canvas.height = 96
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#fff1c2'
  context.beginPath()
  context.roundRect(2, 2, 92, 92, 20)
  context.fill()
  context.fillStyle = CABLE_LIT
  context.beginPath()
  context.roundRect(10, 10, 76, 76, 16)
  context.fill()
  context.fillStyle = '#263c51'
  context.font = '900 54px system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(text, 48, 51)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  litLabels.set(text, texture)
  return texture
}

/** The selected cable's port: its label drawn larger and tinted over the hub's own. */
function LitPort({ socket, port }: { socket: CableEnd; port: HubPort }) {
  const texture = useMemo(() => litLabel(port), [port])
  if (!texture) return null
  return (
    <sprite position={[socket.point.x + socket.normal.x * 0.2, socket.point.y + 0.04, socket.point.z + socket.normal.z * 0.2]} scale={[0.42, 0.42, 1]} renderOrder={6} raycast={noRaycast}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  )
}

export default function Cables() {
  const model = useRoboticsStore((state) => state.model)
  const hidden = useRoboticsStore((state) => state.sim?.hiddenBrickIds ?? null)
  const selectedId = useBrickStore((state) => state.selectedId)
  const scene = useMemo(() => cableScene(model, selectedId, hidden ?? new Set()), [model, selectedId, hidden])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    // Dev only: the QA harness reads back what is drawn (scripts/qa/robotics-cp2-wiring.mjs).
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    const hook = (host.__robotics = host.__robotics ?? {})
    hook.cables = () => ({
      cables: scene.cables.map((cable) => ({ deviceId: cable.deviceId, hubId: cable.hubId, port: cable.port, lit: cable.lit, lift: routeLift(cable.points), from: cable.device.point, to: cable.socket.point })),
      stubs: scene.stubs.map((stub) => ({ deviceId: stub.deviceId, lit: stub.lit, tip: stub.points[stub.points.length - 1] })),
    })
    return () => { delete hook.cables }
  }, [scene])

  return (
    <group name="robotics-cables">
      {scene.cables.map((cable) => (
        <group key={`${cable.deviceId}:${cable.hubId}:${cable.port}`}>
          <Tube points={cable.points} radius={cable.lit ? CABLE_LIT_RADIUS : CABLE_RADIUS} color={cable.lit ? CABLE_LIT : CABLE} lit={cable.lit} />
          {cable.lit && <EndRing end={cable.device} />}
          {cable.lit && <LitPort socket={cable.socket} port={cable.port} />}
        </group>
      ))}
      {scene.stubs.map((stub) => (
        <group key={`stub:${stub.deviceId}`}>
          <Tube points={stub.points} radius={stub.lit ? CABLE_LIT_RADIUS : CABLE_RADIUS} color={CABLE} lit={false} />
          <Plug at={stub.points[stub.points.length - 1]} lit={stub.lit} />
        </group>
      ))}
    </group>
  )
}
