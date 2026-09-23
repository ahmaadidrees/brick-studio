import { getBuildPlateSize } from '../../brick/buildPlate'
import { createPartMap } from '../../brick/parts'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { connectionOf, freePorts, hubPorts, isStaleCable, livePort, moveToPort, plugInto, swapPorts, unplug, type PortState, type Presence } from '../model/control'
import { creationComponent, defaultDeviceName, deviceName, type DeriveInput } from '../model/creations'
import { readRoboticsSection, writeRoboticsSection, type RoboticsSection, type WiringMode } from '../model/section'
import { isDevicePart, roboticsSpec, type HubPort } from '../parts/catalog'
import { useRoboticsStore } from '../state/roboticsStore'

/**
 * The student's wiring actions (contract §5 "Always", CP2 plan §6): unplug, plug into
 * a port, move to another port, swap two devices' ports, rename a device and set the
 * project's wiring mode. Each one is an ordinary undoable edit of the robotics section
 * with a label that reads well after "Undid:", and each says what happened in the
 * studio toast in the words of the mock's Wiring board. A wiring edit while a nudge
 * runs retires it through the watcher's behaviour key (roboticsStore.ts); a rename or
 * a mode change is not a construction edit and leaves it running.
 *
 * Every action reads the document fresh from the brick store, so it is correct even
 * when the derived model has not caught up yet, and returns false when nothing changed.
 */
type Wiring = {
  state: BrickState
  section: RoboticsSection
  input: DeriveInput
  present: Presence
  byId: Map<string, BrickInstance>
}

function wiring(): Wiring {
  const state = useBrickStore.getState()
  const section = readRoboticsSection(state.documentMetadata.robotics)
  const byId = new Map(state.bricks.map((brick) => [brick.id, brick]))
  const input: DeriveInput = { bricks: state.bricks, partMap: createPartMap(state.documentMetadata.customParts ?? []), plateSize: getBuildPlateSize(state.documentMetadata), section }
  return { state, section, input, present: byId, byId }
}

/**
 * The name of a device brick that is gone, when it can still be derived: its default
 * name read off the last copy the history holds (a deleted brick's "before"). Null when
 * the history no longer has it.
 */
export function lastKnownDeviceName(deviceId: string, state: Pick<BrickState, 'undoStack' | 'documentMetadata'> = useBrickStore.getState()): string | null {
  const section = readRoboticsSection(state.documentMetadata.robotics)
  const named = section.devices[deviceId]?.name
  if (named) return named
  for (let index = state.undoStack.length - 1; index >= 0; index -= 1) {
    const entry = state.undoStack[index]
    const copy = entry.deltas.find((delta) => delta.before?.id === deviceId)?.before ?? entry.documentBefore?.bricks.find((brick) => brick.id === deviceId)
    if (copy) return defaultDeviceName(copy, { partMap: createPartMap(state.documentMetadata.customParts ?? []), plateSize: getBuildPlateSize(state.documentMetadata) })
  }
  return null
}

function nameOf(context: Wiring, deviceId: string): string {
  const brick = context.byId.get(deviceId)
  return brick ? deviceName(context.input, brick) : context.section.devices[deviceId]?.name ?? lastKnownDeviceName(deviceId, context.state) ?? 'a part'
}

/**
 * The hub a device plugs into: the one its cable goes to while that hub is there,
 * otherwise the first hub attached to it (the same hubs assisted wiring offers).
 */
export function hubForDevice(deviceId: string, context: Pick<Wiring, 'section' | 'input' | 'present' | 'byId'> = wiring()): string | null {
  const live = livePort(context.section, deviceId, context.present)
  if (live) return live.hubId
  if (!context.byId.has(deviceId)) return null
  return creationComponent(context.input, deviceId).find((id) => roboticsSpec(context.byId.get(id)!.partId)?.role === 'hub') ?? null
}

/** The four ports of a hub as the inspector shows them, with a stale cable's last known name. */
export function portsOfHub(hubId: string, context: Wiring = wiring()): PortState[] {
  return hubPorts(context.section, hubId, context.present, (id) => lastKnownDeviceName(id, context.state))
}

function write(context: Wiring, next: RoboticsSection, label: string, toast: string): boolean {
  if (next === context.section) return false
  context.state.setRoboticsSection(writeRoboticsSection(next), label)
  // The assisted-wiring line describes a cable this edit may just have changed; the toast now speaks.
  useRoboticsStore.getState().dismissWiringNote()
  useBrickStore.setState({ toast })
  return true
}

const isWirableDevice = (context: Wiring, deviceId: string) => {
  const brick = context.byId.get(deviceId)
  return Boolean(brick && isDevicePart(brick.partId) && roboticsSpec(brick.partId)?.role !== 'hub')
}

/** The stale cable a plug-in would replace, for the toast. */
function staleNote(context: Wiring, hubId: string, port: HubPort): string {
  const occupant = context.section.connections.find((connection) => connection.hubId === hubId && connection.port === port)
  return occupant && isStaleCable(occupant, context.present) ? ` The old cable from ${nameOf(context, occupant.deviceId)} is gone.` : ''
}

export function unplugDevice(deviceId: string): boolean {
  const context = wiring()
  const name = nameOf(context, deviceId)
  return write(context, unplug(context.section, deviceId), `Unplug ${name}`, `${name} is unplugged. Blocks that use it show “Not plugged in”.`)
}

/**
 * Plug a device in: into `port` when given (it must be free), otherwise the first free
 * port of its hub. With no hub, or a full hub, nothing changes and the toast says why.
 */
export function plugDeviceIn(deviceId: string, port?: HubPort): boolean {
  const context = wiring()
  if (!isWirableDevice(context, deviceId)) return false
  const name = nameOf(context, deviceId)
  const hubId = hubForDevice(deviceId, context)
  if (!hubId) {
    useBrickStore.setState({ toast: `Add a hub to plug ${name} in.` })
    return false
  }
  const target = port ?? freePorts(context.section, hubId, context.present)[0]
  if (!target) {
    useBrickStore.setState({ toast: 'The hub is full. Unplug something to free a port.' })
    return false
  }
  const note = staleNote(context, hubId, target)
  return write(context, plugInto(context.section, deviceId, hubId, target, context.present), `Plug ${name} into port ${target}`, `${name} connected to port ${target}.${note}`)
}

export function moveDeviceToPort(deviceId: string, port: HubPort): boolean {
  const context = wiring()
  const current = connectionOf(context.section, deviceId)
  if (!current || !isWirableDevice(context, deviceId)) return false
  const name = nameOf(context, deviceId)
  const note = staleNote(context, current.hubId, port)
  return write(context, moveToPort(context.section, deviceId, port, context.present), `Move ${name} to port ${port}`, `${name} moved to port ${port}. Port ${current.port} is free again.${note}`)
}

export function swapDevicePorts(a: string, b: string): boolean {
  const context = wiring()
  if (!isWirableDevice(context, a) || !isWirableDevice(context, b)) return false
  const next = swapPorts(context.section, a, b)
  if (next === context.section) return false
  const nameA = nameOf(context, a)
  const nameB = nameOf(context, b)
  const placed = (id: string, name: string) => {
    const cable = connectionOf(next, id)
    return cable ? `${name} is on port ${cable.port}` : `${name} is unplugged`
  }
  return write(context, next, `Swap ports of ${nameA} and ${nameB}`, `Swapped ports. ${placed(a, nameA)}, ${placed(b, nameB)}.`)
}

export const DEVICE_NAME_LIMIT = 40

/**
 * Rename writes `section.devices[id].name`. The name follows the device, not its port.
 * A blank name, or the name it already has, changes nothing; the default name clears
 * the entry, so the document only carries names a student chose.
 */
export function renameDevice(deviceId: string, name: string): boolean {
  const context = wiring()
  const brick = context.byId.get(deviceId)
  if (!brick || !isDevicePart(brick.partId)) return false
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, DEVICE_NAME_LIMIT)
  const before = deviceName(context.input, brick)
  if (!trimmed || trimmed === before) return false
  const devices = { ...context.section.devices }
  if (trimmed === defaultDeviceName(brick, context.input)) delete devices[deviceId]
  else devices[deviceId] = { name: trimmed }
  return write(context, { ...context.section, devices }, `Rename ${before} to ${trimmed}`, `${before} is now called ${trimmed}. Blocks that use it show the new name.`)
}

export function setWiringMode(mode: WiringMode): boolean {
  const context = wiring()
  if (context.section.settings.wiring === mode) return false
  // In a third grader's words (lane P): "assisted" is "Plug in by itself: on".
  const toast = mode === 'manual' ? 'Plug in by itself is off. New parts wait for you to plug them in.' : 'Plug in by itself is on. New parts plug into the hub.'
  return write(context, { ...context.section, settings: { ...context.section.settings, wiring: mode } }, `Plug in by itself: ${mode === 'manual' ? 'off' : 'on'}`, toast)
}
