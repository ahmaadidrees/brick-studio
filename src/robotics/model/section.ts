import type { RoboticsSectionEnvelope } from '../../brick/brickDocument'
import { HUB_PORTS, type HubPort } from '../parts/catalog'

/**
 * The versioned `robotics` section of the world document (contract §10). It holds
 * only what a student authored: names, creations, cables and settings. Everything
 * structural (bodies, mechanisms, what a wheel is on) is derived from the bricks and
 * never stored, so the section can never disagree with the build.
 *
 * Version 1. Additive changes bump nothing; a breaking change bumps `version` and
 * adds a migration in `readRoboticsSection`.
 */
export const ROBOTICS_SECTION_VERSION = 1

export type WiringMode = 'assisted' | 'manual'
export type TestSpace = 'testPlate' | 'myWorld'

export type RoboticsCreation = {
  id: string
  name: string
  /**
   * The bricks the student named. Membership follows assembly and mechanism links from
   * these; the list is refreshed to the whole creation whenever the card is confirmed,
   * so removing any one part never dissolves the creation.
   */
  anchorBrickIds: string[]
  /** Where the creation runs (contract §7.5). Absent = the default for its kind. */
  testSpace?: TestSpace
}

export type RoboticsConnection = {
  /** Brick id of the device (motor, hinge motor, sensor, light, button). */
  deviceId: string
  /** Brick id of the hub. */
  hubId: string
  port: HubPort
}

export type RoboticsSection = {
  version: typeof ROBOTICS_SECTION_VERSION
  settings: { wiring: WiringMode }
  creations: RoboticsCreation[]
  /** Student-facing device names by brick id. Absent = the default name. */
  devices: Record<string, { name: string }>
  connections: RoboticsConnection[]
}

export function emptyRoboticsSection(): RoboticsSection {
  return { version: ROBOTICS_SECTION_VERSION, settings: { wiring: 'assisted' }, creations: [], devices: {}, connections: [] }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128

/**
 * Reads the section out of a document (or any envelope). Missing, foreign or
 * malformed input yields an empty section rather than an error: a robotics-less
 * document is simply a document with no creations. Malformed entries are dropped
 * individually so one bad cable does not lose every name.
 */
export function readRoboticsSection(envelope: RoboticsSectionEnvelope | undefined | null): RoboticsSection {
  const section = emptyRoboticsSection()
  if (!isRecord(envelope) || envelope.version !== ROBOTICS_SECTION_VERSION) return section
  const settings = envelope.settings
  if (isRecord(settings) && (settings.wiring === 'assisted' || settings.wiring === 'manual')) section.settings.wiring = settings.wiring
  if (Array.isArray(envelope.creations)) {
    const seen = new Set<string>()
    for (const raw of envelope.creations) {
      if (!isRecord(raw) || !isId(raw.id) || seen.has(raw.id) || typeof raw.name !== 'string') continue
      const anchorBrickIds = Array.isArray(raw.anchorBrickIds) ? raw.anchorBrickIds.filter(isId) : []
      const creation: RoboticsCreation = { id: raw.id, name: raw.name.slice(0, 60), anchorBrickIds: [...new Set(anchorBrickIds)] }
      if (raw.testSpace === 'testPlate' || raw.testSpace === 'myWorld') creation.testSpace = raw.testSpace
      seen.add(raw.id)
      section.creations.push(creation)
    }
  }
  if (isRecord(envelope.devices)) {
    for (const [brickId, raw] of Object.entries(envelope.devices)) {
      if (!isId(brickId) || !isRecord(raw) || typeof raw.name !== 'string' || !raw.name.trim()) continue
      section.devices[brickId] = { name: raw.name.slice(0, 40) }
    }
  }
  if (Array.isArray(envelope.connections)) {
    const usedPorts = new Set<string>()
    const wiredDevices = new Set<string>()
    for (const raw of envelope.connections) {
      if (!isRecord(raw) || !isId(raw.deviceId) || !isId(raw.hubId) || !(HUB_PORTS as readonly unknown[]).includes(raw.port)) continue
      const portKey = `${raw.hubId}:${String(raw.port)}`
      // A port holds one cable and a device has one cable (contract §3, §5).
      if (usedPorts.has(portKey) || wiredDevices.has(raw.deviceId)) continue
      usedPorts.add(portKey)
      wiredDevices.add(raw.deviceId)
      section.connections.push({ deviceId: raw.deviceId, hubId: raw.hubId, port: raw.port as HubPort })
    }
  }
  return section
}

/** The section as stored in the document: plain JSON, stable key order, version first. */
export function writeRoboticsSection(section: RoboticsSection): RoboticsSectionEnvelope {
  return {
    version: ROBOTICS_SECTION_VERSION,
    settings: { wiring: section.settings.wiring },
    creations: section.creations.map((creation) => ({
      id: creation.id,
      name: creation.name,
      anchorBrickIds: [...creation.anchorBrickIds],
      ...(creation.testSpace ? { testSpace: creation.testSpace } : {}),
    })),
    devices: Object.fromEntries(Object.entries(section.devices).map(([id, device]) => [id, { name: device.name }])),
    connections: section.connections.map((connection) => ({ deviceId: connection.deviceId, hubId: connection.hubId, port: connection.port })),
  }
}

/** True when the section carries nothing a student authored, so the document can omit it entirely. */
export function isEmptyRoboticsSection(section: RoboticsSection): boolean {
  return section.creations.length === 0 && section.connections.length === 0 && Object.keys(section.devices).length === 0 && section.settings.wiring === 'assisted'
}
