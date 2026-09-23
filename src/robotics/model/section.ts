import type { RoboticsSectionEnvelope } from '../../brick/brickDocument'
import { HUB_PORTS, type HubPort } from '../parts/catalog'
import { PROGRAM_LIMITS, type RoboticsProgram } from '../program/types'

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
  /** The program the Code view opens (one of this creation's `programs`). Absent = its first program. */
  activeProgramId?: string
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
  /**
   * Block programs, each owned by one creation (CP2-PLAN §3). Additive to version 1: a
   * section without programs is written without the key, byte for byte as before.
   */
  programs: RoboticsProgram[]
}

export function emptyRoboticsSection(): RoboticsSection {
  return { version: ROBOTICS_SECTION_VERSION, settings: { wiring: 'assisted' }, creations: [], devices: {}, connections: [], programs: [] }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128

const utf8Bytes = (text: string) => (typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length)

/** A deep copy of a JSON value within `maxBytes`, or null when it is not plain JSON or too big. */
function jsonCopy(value: unknown, maxBytes: number): unknown {
  let text: string | undefined
  try {
    text = JSON.stringify(value)
  } catch {
    return null
  }
  if (typeof text !== 'string' || utf8Bytes(text) > maxBytes) return null
  return JSON.parse(text) as unknown
}

/**
 * The section is read on every document change, and a workspace can be 200 KB, so a
 * program is validated once per stored object (envelopes are never mutated in place;
 * every write makes new ones). Callers get a fresh record; the workspace itself is
 * shared and must be treated as read-only.
 */
const programCache = new WeakMap<object, RoboticsProgram | null>()

function readProgram(raw: unknown): RoboticsProgram | null {
  if (!isRecord(raw)) return null
  if (!programCache.has(raw)) programCache.set(raw, validateProgram(raw))
  const program = programCache.get(raw)
  return program ? { ...program, deviceNames: { ...program.deviceNames } } : null
}

function validateProgram(raw: Record<string, unknown>): RoboticsProgram | null {
  if (!isId(raw.id) || !isId(raw.creationId)) return null
  // Blockly saves an empty workspace as `{}`; anything that is not an object is not a workspace.
  if (!isRecord(raw.workspace)) return null
  const workspace = jsonCopy(raw.workspace, PROGRAM_LIMITS.maxWorkspaceBytes)
  if (!isRecord(workspace)) return null
  const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, PROGRAM_LIMITS.maxNameLength) : ''
  const deviceNames: Record<string, string> = {}
  if (isRecord(raw.deviceNames)) {
    for (const [deviceId, deviceName] of Object.entries(raw.deviceNames)) {
      if (isId(deviceId) && typeof deviceName === 'string' && deviceName.trim()) deviceNames[deviceId] = deviceName.slice(0, 40)
    }
  }
  const revision = typeof raw.revision === 'number' && Number.isSafeInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0
  const program: RoboticsProgram = { id: raw.id, creationId: raw.creationId, name: name || 'Program', workspace, deviceNames, revision }
  if (isId(raw.starter) && raw.starter.length <= 64) program.starter = raw.starter
  return program
}

/**
 * Programs out of a section envelope, each read defensively and dropped alone when
 * malformed; duplicate ids and programs past `PROGRAM_LIMITS.maxProgramsPerCreation` for
 * one creation are dropped too. With `creationIds`, programs of any other creation are
 * dropped (what `readRoboticsSection` does); `null` keeps them, for the history merge.
 */
export function readRoboticsPrograms(envelope: RoboticsSectionEnvelope | undefined | null, creationIds: ReadonlySet<string> | null): RoboticsProgram[] {
  if (!isRecord(envelope) || envelope.version !== ROBOTICS_SECTION_VERSION || !Array.isArray(envelope.programs)) return []
  const programs: RoboticsProgram[] = []
  const seen = new Set<string>()
  const perCreation = new Map<string, number>()
  for (const raw of envelope.programs) {
    const program = readProgram(raw)
    if (!program || seen.has(program.id)) continue
    if (creationIds && !creationIds.has(program.creationId)) continue
    const count = perCreation.get(program.creationId) ?? 0
    if (count >= PROGRAM_LIMITS.maxProgramsPerCreation) continue
    perCreation.set(program.creationId, count + 1)
    seen.add(program.id)
    programs.push(program)
  }
  return programs
}

function writeProgram(program: RoboticsProgram): Record<string, unknown> {
  return {
    id: program.id,
    creationId: program.creationId,
    name: program.name,
    ...(program.starter ? { starter: program.starter } : {}),
    revision: program.revision,
    deviceNames: Object.fromEntries(Object.keys(program.deviceNames).sort().map((deviceId) => [deviceId, program.deviceNames[deviceId]])),
    workspace: JSON.parse(JSON.stringify(program.workspace ?? {})) as unknown,
  }
}

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
      if (isId(raw.activeProgramId)) creation.activeProgramId = raw.activeProgramId
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
  section.programs = readRoboticsPrograms(envelope, new Set(section.creations.map((creation) => creation.id)))
  // An active program must be one of the creation's own.
  for (const creation of section.creations) {
    if (creation.activeProgramId && !section.programs.some((program) => program.id === creation.activeProgramId && program.creationId === creation.id)) delete creation.activeProgramId
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
      ...(creation.activeProgramId ? { activeProgramId: creation.activeProgramId } : {}),
    })),
    devices: Object.fromEntries(Object.entries(section.devices).map(([id, device]) => [id, { name: device.name }])),
    connections: section.connections.map((connection) => ({ deviceId: connection.deviceId, hubId: connection.hubId, port: connection.port })),
    // Omitted when empty so a document without programs is written exactly as before.
    ...(section.programs?.length ? { programs: section.programs.map(writeProgram) } : {}),
  }
}

/** True when the section carries nothing a student authored, so the document can omit it entirely. */
export function isEmptyRoboticsSection(section: RoboticsSection): boolean {
  return section.creations.length === 0 && section.connections.length === 0 && Object.keys(section.devices).length === 0 && (section.programs?.length ?? 0) === 0 && section.settings.wiring === 'assisted'
}
