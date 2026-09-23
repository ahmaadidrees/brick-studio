import { BRICK_PART_MAP, rotatedSize } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import { connect } from '../model/control'
import { anchorableBrickIds, creationComponent, type DeriveInput, type DerivedCreation } from '../model/creations'
import { GATE_IDS, ROVER_IDS, SIGNAL_IDS, gateBricks, roverBricks, signalPostBricks } from '../model/fixtures'
import type { RoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS, roboticsSpec, type HubPort } from '../parts/catalog'

/**
 * Robot kits (docs/robotics/KID-UX.md §K): a whole robot that is placed like one brick and
 * arrives ready, named and plugged in, so a student starts from something that works and
 * changes it. The layouts are the spike's own builds (`model/fixtures.ts`), moved to the
 * corner of their footprint; they are placed through the studio's group ghost and every
 * brick in them is an ordinary brick afterwards.
 *
 * Every kit starts with a plain plate. It is the ghost's anchor, so the pointer holds the
 * kit by its middle, and it is the brick the studio reports as placed, so the robotics
 * watcher never treats a kit as a lone device arriving (no creation card, no second wiring).
 */
export type KitId = 'buggy' | 'gate' | 'signal-light' | 'robot-base'

export type KitCable = { deviceId: string; hubId: string; port: HubPort }

/** A device the kit names itself, when the name the studio would give it reads wrong for this kit. Template id. */
export type KitDeviceName = { deviceId: string; name: string }

export type Kit = {
  id: KitId
  /** The card's name. */
  name: string
  /** The robot's first name; the next kit of the same kind is "Buggy 2", and so on. */
  robotName: string
  /** Three words, a verb first. */
  words: string
  /** The kit at rest on the ground, its footprint's corner at 0, 0, its base plate first. Template ids. */
  bricks: readonly BrickInstance[]
  /** Every device plugged into the kit's hub: motors first, then what senses, then what shows. */
  cables: readonly KitCable[]
  /** Devices with a name of the kit's own (written as the student's names are, so they can rename them). */
  names?: readonly KitDeviceName[]
}

const partOf = (partId: string): BrickPart | undefined => roboticsSpec(partId)?.part ?? BRICK_PART_MAP[partId]

function footprintBounds(bricks: readonly BrickInstance[]) {
  let minX = Infinity
  let minZ = Infinity
  let maxX = -Infinity
  let maxZ = -Infinity
  for (const brick of bricks) {
    const part = partOf(brick.partId)
    if (!part) continue
    const size = rotatedSize(part, brick.rotation)
    minX = Math.min(minX, brick.x)
    minZ = Math.min(minZ, brick.z)
    maxX = Math.max(maxX, brick.x + size.width)
    maxZ = Math.max(maxZ, brick.z + size.depth)
  }
  return { minX, minZ, maxX, maxZ }
}

/** Studs the kit covers on the plate. */
export function kitFootprint(bricks: readonly BrickInstance[]): { width: number; depth: number } {
  const bounds = footprintBounds(bricks)
  return { width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ }
}

/**
 * A fixture as a kit: template ids, the footprint's corner at 0, 0, and each robotics part in
 * its own colour so the kit's parts look like the drawer's (`colors` repaints plain bricks).
 */
function template(kitId: KitId, fixture: readonly BrickInstance[], colors: Readonly<Record<string, string>> = {}): BrickInstance[] {
  const { minX, minZ } = footprintBounds(fixture)
  return fixture.map((brick) => ({
    ...brick,
    id: kitBrickId(kitId, brick.id),
    x: brick.x - minX,
    z: brick.z - minZ,
    color: roboticsSpec(brick.partId)?.part.defaultColor ?? colors[brick.id] ?? brick.color,
  }))
}

const kitBrickId = (kitId: KitId, fixtureId: string) => `kit:${kitId}:${fixtureId}`

const cable = (kitId: KitId, deviceId: string, hubId: string, port: HubPort): KitCable => ({ deviceId: kitBrickId(kitId, deviceId), hubId: kitBrickId(kitId, hubId), port })

const brick = (id: string, partId: string, x: number, y: number, z: number, color: string): BrickInstance => ({ id, partId, x, y, z, rotation: 0, color })

/** The Gate's posts and lintel in the studio's red, so the frame reads as a gate, not a wall. */
const GATE_FRAME_COLORS: Readonly<Record<string, string>> = Object.fromEntries(
  [GATE_IDS.leftPost, GATE_IDS.leftPostTop, GATE_IDS.rightPost, GATE_IDS.rightPostTop, GATE_IDS.lintel].map((id) => [id, '#e7473c']),
)

/**
 * The Gate kit: the spike's gate with its sensor turned round on the hub, so it looks out of the gate's
 * front, the way people come (kid lane Y). Whoever walks up stands in open ground in front of the gate,
 * in full view of the camera, the sensor sees them, and the door behind swings open for them. A sensor
 * facing the viewer would be called "Back sensor", so the kit names it for what it does ("Door sensor").
 */
function gateKitFixture(): BrickInstance[] {
  // A 2 × 1 turned a half turn keeps its studs: same cells on the hub, eyes on the other face.
  return gateBricks().map((candidate) => (candidate.id === GATE_IDS.sensor ? { ...candidate, rotation: 2 } : candidate))
}

/** The Gate kit's sensor, as the student meets it. */
export const GATE_KIT_SENSOR_NAME = 'Door sensor'

/** The signal post stands on a 4 × 6 plate, one stud in from its front and back edges. */
function signalLightFixture(): BrickInstance[] {
  const [hub, sensor, light] = signalPostBricks()
  return [
    brick('signal-plate', 'plate_4x6', hub.x, 0, hub.z - 1, '#3e83d7'),
    { ...hub, y: hub.y + 1 },
    { ...sensor, y: sensor.y + 1 },
    { ...light, y: light.y + 1 },
  ]
}

/** A plate and a hub where the Buggy has its hub, leaving the plate's back half for a motor on each side. */
function robotBaseFixture(): BrickInstance[] {
  const [plate, hub] = roverBricks()
  return [plate, hub]
}

export const KITS: readonly Kit[] = [
  {
    id: 'buggy',
    name: 'Buggy',
    robotName: 'Buggy',
    words: 'Drive it around',
    bricks: template('buggy', roverBricks()),
    cables: [
      cable('buggy', ROVER_IDS.leftMotor, ROVER_IDS.hub, 'A'),
      cable('buggy', ROVER_IDS.rightMotor, ROVER_IDS.hub, 'B'),
      cable('buggy', ROVER_IDS.sensor, ROVER_IDS.hub, 'C'),
    ],
  },
  {
    id: 'gate',
    name: 'Gate',
    robotName: 'Gate',
    words: 'Swing it open',
    bricks: template('gate', gateKitFixture(), GATE_FRAME_COLORS),
    cables: [
      cable('gate', GATE_IDS.hinge, GATE_IDS.hub, 'A'),
      cable('gate', GATE_IDS.sensor, GATE_IDS.hub, 'B'),
    ],
    names: [{ deviceId: kitBrickId('gate', GATE_IDS.sensor), name: GATE_KIT_SENSOR_NAME }],
  },
  {
    id: 'signal-light',
    name: 'Signal light',
    robotName: 'Signal light',
    words: 'Light it up',
    bricks: template('signal-light', signalLightFixture()),
    cables: [
      cable('signal-light', SIGNAL_IDS.sensor, SIGNAL_IDS.hub, 'A'),
      cable('signal-light', SIGNAL_IDS.light, SIGNAL_IDS.hub, 'B'),
    ],
  },
  {
    id: 'robot-base',
    name: 'Robot base',
    // The student builds their own robot on it, so it is named for them, not for the plate.
    robotName: 'My robot',
    words: 'Build your own',
    bricks: template('robot-base', robotBaseFixture()),
    cables: [],
  },
]

export function kitById(id: KitId): Kit {
  return KITS.find((kit) => kit.id === id)!
}

/** The template brick that is the kit's hub (the one every cable goes to). */
export function kitHubId(kit: Kit): string | null {
  return kit.bricks.find((candidate) => candidate.partId === ROBOTICS_PART_IDS.hub)?.id ?? null
}

/**
 * The kit moved so its footprint is centred on `center` (stud-grid x, z), kept inside a plate of
 * `plateSize` studs. Same rounding as a brick armed at the view target.
 */
export function kitAt(kit: Kit, center: { x: number; z: number }, plateSize: number): BrickInstance[] {
  const { width, depth } = kitFootprint(kit.bricks)
  const x = Math.max(0, Math.min(plateSize - width, Math.floor(center.x - width / 2)))
  const z = Math.max(0, Math.min(plateSize - depth, Math.floor(center.z - depth / 2)))
  return kit.bricks.map((candidate) => ({ ...candidate, x: candidate.x + x, z: candidate.z + z }))
}

/** "Buggy", then "Buggy 2", "Buggy 3"… Names already taken are compared without case. */
export function uniqueRobotName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((name) => name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  let counter = 2
  while (taken.has(`${base} ${counter}`.toLowerCase())) counter += 1
  return `${base} ${counter}`
}

export type KitPlacement = {
  section: RoboticsSection
  /** The robot the kit is now: a new record, or the one saved robot it was built onto. Null when it joined several. */
  creationId: string | null
  name: string
  /** The saved robots the placed kit touches (a kit built onto a robot becomes part of it). */
  joined: DerivedCreation[]
}

/**
 * The robotics section once a kit has been placed as the bricks `placedIds` (in the kit's own
 * order). Pure. The kit's cables go in as authored; the kit becomes a new robot with a unique
 * name, anchored on everything it is attached to. A kit placed so that it touches one saved
 * robot joins it (membership follows studs, contract §4); touching several, only its cables are
 * written and the join card, which the studio opens for such a placement, names the result.
 */
export function placeKitInSection(model: { input: DeriveInput; section: RoboticsSection; creations: readonly DerivedCreation[] }, kit: Kit, placedIds: readonly string[], newCreationId: string): KitPlacement {
  const placedId = (templateId: string) => placedIds[kit.bricks.findIndex((candidate) => candidate.id === templateId)]
  let section = model.section
  for (const wire of kit.cables) section = connect(section, placedId(wire.deviceId), placedId(wire.hubId), wire.port)
  // The kit's own device names, stored the way a student's renames are.
  if (kit.names?.length) section = { ...section, devices: { ...section.devices, ...Object.fromEntries(kit.names.map((entry) => [placedId(entry.deviceId), { name: entry.name }])) } }
  const component = creationComponent(model.input, placedIds[0])
  const joined = model.creations.filter((creation) => creation.brickIds.some((id) => component.includes(id)))
  const anchors = anchorableBrickIds(model.input, component)
  if (joined.length === 0) {
    const name = uniqueRobotName(kit.robotName, section.creations.map((creation) => creation.name))
    section = { ...section, creations: [...section.creations, { id: newCreationId, name, anchorBrickIds: anchors }] }
    return { section, creationId: newCreationId, name, joined }
  }
  if (joined.length === 1) {
    const [keeper] = joined
    section = { ...section, creations: section.creations.map((creation) => (creation.id === keeper.id ? { ...creation, anchorBrickIds: [...new Set([...creation.anchorBrickIds, ...anchors])] } : creation)) }
    return { section, creationId: keeper.id, name: keeper.name, joined }
  }
  return { section, creationId: null, name: kit.robotName, joined }
}
