import type { BrickInstance } from '../../brick/types'
import { HUB_PORTS, isDevicePart, roboticsSpec, type HubPort } from '../parts/catalog'
import type { RoboticsConnection, RoboticsSection } from './section'

/**
 * Control (contract §2, "Is it plugged in?"): a device connected by a cable to a
 * port on a hub. Cables are authored data in the section; this module reads them
 * against the bricks that exist and plans assisted wiring (contract §5), which only
 * ever adds a cable and never moves or removes one.
 */
export type PortState = { port: HubPort; deviceId: string | null; deviceMissing: boolean }

export function connectionOf(section: RoboticsSection, deviceId: string): RoboticsConnection | null {
  return section.connections.find((connection) => connection.deviceId === deviceId) ?? null
}

export function hubPorts(section: RoboticsSection, hubId: string, bricksById: ReadonlyMap<string, BrickInstance>): PortState[] {
  return HUB_PORTS.map((port) => {
    const connection = section.connections.find((candidate) => candidate.hubId === hubId && candidate.port === port)
    return { port, deviceId: connection?.deviceId ?? null, deviceMissing: connection ? !bricksById.has(connection.deviceId) : false }
  })
}

export function freePorts(section: RoboticsSection, hubId: string): HubPort[] {
  const used = new Set(section.connections.filter((connection) => connection.hubId === hubId).map((connection) => connection.port))
  return HUB_PORTS.filter((port) => !used.has(port))
}

export type AssistedPlan =
  | { ok: true; hubId: string; port: HubPort }
  | { ok: false; reason: 'no-hub' | 'ports-full' | 'already-wired' | 'not-a-device' | 'is-hub' }

/**
 * Assisted wiring on placement (contract §5): the first free port of a hub in the
 * same creation. Hubs are offered in the order given (the creation lists them in
 * document order). A device that already has a cable is left alone.
 */
export function planAssistedConnection(section: RoboticsSection, device: BrickInstance, hubIds: readonly string[]): AssistedPlan {
  if (!isDevicePart(device.partId)) return { ok: false, reason: 'not-a-device' }
  if (roboticsSpec(device.partId)?.role === 'hub') return { ok: false, reason: 'is-hub' }
  if (connectionOf(section, device.id)) return { ok: false, reason: 'already-wired' }
  if (hubIds.length === 0) return { ok: false, reason: 'no-hub' }
  for (const hubId of hubIds) {
    const [port] = freePorts(section, hubId)
    if (port) return { ok: true, hubId, port }
  }
  return { ok: false, reason: 'ports-full' }
}

/** Pure: adds the cable, replacing any earlier cable of this device (a device holds one cable). */
export function connect(section: RoboticsSection, deviceId: string, hubId: string, port: HubPort): RoboticsSection {
  const kept = section.connections.filter((connection) => connection.deviceId !== deviceId && !(connection.hubId === hubId && connection.port === port))
  return { ...section, connections: [...kept, { deviceId, hubId, port }] }
}

export function disconnect(section: RoboticsSection, deviceId: string): RoboticsSection {
  return { ...section, connections: section.connections.filter((connection) => connection.deviceId !== deviceId) }
}
