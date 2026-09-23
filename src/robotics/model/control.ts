import type { BrickInstance } from '../../brick/types'
import { HUB_PORTS, isDevicePart, roboticsSpec, type HubPort } from '../parts/catalog'
import type { RoboticsConnection, RoboticsSection } from './section'

/**
 * Control (contract §2, "Is it plugged in?"): a device connected by a cable to a
 * port on a hub. Cables are authored data in the section; this module reads them
 * against the bricks that exist, plans assisted wiring (contract §5), which only
 * ever adds a cable and never moves or removes one, and edits cables for the
 * student's own wiring actions (unplug, plug in, move, swap).
 *
 * The stale-cable rule (CP2 plan §1): a cable whose device brick is gone is kept, so
 * Undo of the delete brings the connection back, but its port counts as free. A
 * present device plugged into that port replaces the stale cable. "Present" is
 * whatever the caller knows exists; a caller that passes nothing treats every cable
 * as present (the rule only ever frees ports, it never invents cables).
 *
 * Every edit is pure and returns the section unchanged (the same object) when the
 * edit does not apply, so a caller can tell a no-op with `===`.
 */
export type Presence = { has(id: string): boolean }

export type PortState = {
  port: HubPort
  /** The device whose cable sits in this port, present or not. */
  deviceId: string | null
  /** True when the cable's device brick is gone (a stale cable). */
  deviceMissing: boolean
  /** A present device holds this port. False for an empty port and for a stale cable. */
  used: boolean
  /** The stale cable's device, by its last known name ("free (was Left motor)"). */
  staleName: string | null
}

const everyone: Presence = { has: () => true }

export function connectionOf(section: RoboticsSection, deviceId: string): RoboticsConnection | null {
  return section.connections.find((connection) => connection.deviceId === deviceId) ?? null
}

/** The cable in a port, present device or stale. */
export function cableInPort(section: RoboticsSection, hubId: string, port: HubPort): RoboticsConnection | null {
  return section.connections.find((connection) => connection.hubId === hubId && connection.port === port) ?? null
}

export function isStaleCable(connection: RoboticsConnection, present: Presence): boolean {
  return !present.has(connection.deviceId)
}

/**
 * Per port of a hub: the device, whether it is there, and for a stale cable the
 * device's last known name: its name in `section.devices`, else what `lastKnownName`
 * can still derive (the studio passes the default name of the deleted brick when the
 * history still has it), else "a part".
 */
export function hubPorts(section: RoboticsSection, hubId: string, present: Presence, lastKnownName?: (deviceId: string) => string | null): PortState[] {
  return HUB_PORTS.map((port) => {
    const connection = cableInPort(section, hubId, port)
    if (!connection) return { port, deviceId: null, deviceMissing: false, used: false, staleName: null }
    const missing = isStaleCable(connection, present)
    const staleName = missing ? section.devices[connection.deviceId]?.name ?? lastKnownName?.(connection.deviceId) ?? 'a part' : null
    return { port, deviceId: connection.deviceId, deviceMissing: missing, used: !missing, staleName }
  })
}

/** Ports with no cable of a present device, in A–D order. */
export function freePorts(section: RoboticsSection, hubId: string, present: Presence = everyone): HubPort[] {
  const used = new Set(section.connections.filter((connection) => connection.hubId === hubId && !isStaleCable(connection, present)).map((connection) => connection.port))
  return HUB_PORTS.filter((port) => !used.has(port))
}

export type AssistedPlan =
  | { ok: true; hubId: string; port: HubPort }
  | { ok: false; reason: 'no-hub' | 'ports-full' | 'already-wired' | 'not-a-device' | 'is-hub' }

/**
 * Assisted wiring on placement (contract §5): the first free port of a hub in the
 * same creation. Hubs are offered in the order given (the creation lists them in
 * document order). A device that already has a cable is left alone. A port held
 * only by a stale cable is free.
 */
export function planAssistedConnection(section: RoboticsSection, device: BrickInstance, hubIds: readonly string[], present: Presence = everyone): AssistedPlan {
  if (!isDevicePart(device.partId)) return { ok: false, reason: 'not-a-device' }
  if (roboticsSpec(device.partId)?.role === 'hub') return { ok: false, reason: 'is-hub' }
  if (connectionOf(section, device.id)) return { ok: false, reason: 'already-wired' }
  if (hubIds.length === 0) return { ok: false, reason: 'no-hub' }
  for (const hubId of hubIds) {
    const [port] = freePorts(section, hubId, present)
    if (port) return { ok: true, hubId, port }
  }
  return { ok: false, reason: 'ports-full' }
}

/**
 * Pure: adds the cable, replacing any earlier cable of this device (a device holds one
 * cable) and whatever cable was in that port. Callers that must not take a port from a
 * present device use `plugInto`, which checks first.
 */
export function connect(section: RoboticsSection, deviceId: string, hubId: string, port: HubPort): RoboticsSection {
  const kept = section.connections.filter((connection) => connection.deviceId !== deviceId && !(connection.hubId === hubId && connection.port === port))
  return { ...section, connections: [...kept, { deviceId, hubId, port }] }
}

export function disconnect(section: RoboticsSection, deviceId: string): RoboticsSection {
  return { ...section, connections: section.connections.filter((connection) => connection.deviceId !== deviceId) }
}

/** Unplug: the device's cable is removed. A device with no cable is a no-op. */
export function unplug(section: RoboticsSection, deviceId: string): RoboticsSection {
  return connectionOf(section, deviceId) ? disconnect(section, deviceId) : section
}

/**
 * Plug a device into a port. The port must be free under the stale-cable rule: a
 * port held by another present device is refused (swap instead); a stale cable in
 * it is dropped. A device already plugged elsewhere leaves its old port. Plugging a
 * device into the port it already holds is a no-op.
 */
export function plugInto(section: RoboticsSection, deviceId: string, hubId: string, port: HubPort, present: Presence = everyone): RoboticsSection {
  const occupant = cableInPort(section, hubId, port)
  if (occupant?.deviceId === deviceId) return section
  if (occupant && !isStaleCable(occupant, present)) return section
  return connect(section, deviceId, hubId, port)
}

/** Move a plugged device to another free port on the same hub. An unplugged device, or a port a present device holds, is a no-op. */
export function moveToPort(section: RoboticsSection, deviceId: string, port: HubPort, present: Presence = everyone): RoboticsSection {
  const current = connectionOf(section, deviceId)
  if (!current || current.port === port) return section
  return plugInto(section, deviceId, current.hubId, port, present)
}

/**
 * Swap two devices' ports. Both plugged: each takes the other's port (cables keep their
 * places in the list, so the document changes only where it must). One plugged: the
 * other takes its port and the first is left unplugged, which is what exchanging a
 * port for no port means. Neither plugged, or the same device: a no-op.
 */
export function swapPorts(section: RoboticsSection, a: string, b: string): RoboticsSection {
  if (a === b) return section
  const cableA = connectionOf(section, a)
  const cableB = connectionOf(section, b)
  if (!cableA && !cableB) return section
  if (cableA && cableB) {
    if (cableA.hubId === cableB.hubId && cableA.port === cableB.port) return section
    return {
      ...section,
      connections: section.connections.map((connection) => {
        if (connection === cableA) return { deviceId: a, hubId: cableB.hubId, port: cableB.port }
        if (connection === cableB) return { deviceId: b, hubId: cableA.hubId, port: cableA.port }
        return connection
      }),
    }
  }
  const [holder, taker] = cableA ? [cableA, b] : [cableB!, a]
  return { ...section, connections: section.connections.map((connection) => (connection === holder ? { deviceId: taker, hubId: holder.hubId, port: holder.port } : connection)) }
}

/** A device's live port: its cable, when the hub it goes to is present. */
export function livePort(section: RoboticsSection, deviceId: string, present: Presence): RoboticsConnection | null {
  const connection = connectionOf(section, deviceId)
  return connection && present.has(connection.hubId) ? connection : null
}
