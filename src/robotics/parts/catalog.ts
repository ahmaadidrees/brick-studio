import { PLATE_HEIGHT, STUD } from '../../brick/parts'
import type { BrickPart } from '../../brick/types'
import { vec3, type Vec3 } from '../model/vec'

/**
 * The first-milestone parts set (contract §3). Every part is an ordinary brick on
 * the stud grid: `part` is what the drawer, placement rules, renderer and Explore
 * see; the rest is the connection geometry the robotics model reads, expressed in
 * the part's local frame at rotation 0 (origin: footprint centre at the bottom face,
 * +Y up, world units). Shapes carry their connections: the motor's socket, the axle
 * as a separate rod, the wheel's hole, the hub's labelled sockets, the sensor's face,
 * the hinge motor's fixed housing and moving turntable.
 *
 * Heights are chosen so the standard build lines up without vertical fiddling: a
 * motor standing on a 1-plate chassis plate has its socket 4 plates up; an axle and a
 * wheel resting on the ground have their rod and hole 4 plates up.
 */
export type RoboticsDeviceKind = 'hub' | 'motor' | 'hinge-motor' | 'distance-sensor' | 'light' | 'button'
export type RoboticsPartRole = RoboticsDeviceKind | 'axle' | 'wheel' | 'seat'

export type HubPort = 'A' | 'B' | 'C' | 'D'
export const HUB_PORTS: readonly HubPort[] = ['A', 'B', 'C', 'D']

export type RoboticsPartSpec = {
  role: RoboticsPartRole
  part: BrickPart
  /** Studs on the top face (for the hinge motor these belong to the moving side). */
  studsTop: boolean
  /** Tubes under the bottom face (for the hinge motor these belong to the fixed side). */
  tubesBottom: boolean
  /** Motor output: where an axle end must touch, and which way the socket faces. */
  socket?: { point: Vec3; normal: Vec3 }
  /** Axle: a rod along `axis` through `center`, ending at ±halfLength (the grid extent). */
  axle?: { axis: Vec3; center: Vec3; halfLength: number; radius: number }
  /** Wheel: a hole along `axis` through `center`; an axle end must touch one of the two faces at ±halfThickness. */
  wheel?: { axis: Vec3; center: Vec3; halfThickness: number; radius: number }
  /** Hinge motor: the moving side turns about `axis` through `pivot`. */
  hinge?: { pivot: Vec3; axis: Vec3; turntableRadius: number; housingHeight: number }
  /** Hub ports: label, where the socket sits, which way it faces. */
  ports?: { label: HubPort; point: Vec3; normal: Vec3 }[]
  /** Sensor face: where it looks from and which way. */
  sensor?: { point: Vec3; normal: Vec3 }
}

const plates = (count: number) => count * PLATE_HEIGHT
const studs = (count: number) => count * STUD

/**
 * The robot plate (kid-UX lane W): the drawer's first robot tile, "Robot plate", and the part the
 * next step "Put the robot on a plate" arms. The studio's 6 × 8 plate, the size the Buggy stands on:
 * room for a hub and a motor on each side.
 */
export const ROBOT_PLATE_PART = 'plate_6x8'

export const ROBOTICS_PART_IDS = {
  hub: 'robo_hub',
  motor: 'robo_motor',
  axleShort: 'robo_axle_short',
  axleLong: 'robo_axle_long',
  wheel: 'robo_wheel',
  distanceSensor: 'robo_distance_sensor',
  light: 'robo_light',
  button: 'robo_button',
  hingeMotor: 'robo_hinge_motor',
  seat: 'robo_seat',
} as const

/**
 * Each part's own colour (contract §3: every part's shape shows how it connects;
 * the colour tells the parts apart before a card is read). Drawn from the studio
 * palette. Choosing a part arms it in this colour; the brush keeps the student's.
 */
export const ROBOTICS_PART_COLORS = {
  hub: '#f5eee0',
  motor: '#52636c',
  axle: '#a9b7bd',
  wheel: '#1f2a33',
  distanceSensor: '#f4ca3a',
  light: '#e7473c',
  button: '#ef8d32',
  hingeMotor: '#2eaa9d',
  seat: '#3e83d7',
} as const

export const AXLE_ROD_RADIUS = 0.09
/** Slightly more than the 4-plate hole height: on the ground a wheel lifts a 1-plate chassis clear of the plate. */
export const WHEEL_RADIUS = plates(4) + 0.04
export const WHEEL_HALF_WIDTH = 0.24
export const MOTOR_SOCKET_RADIUS = 0.3
export const HINGE_TURNTABLE_RADIUS = studs(1) - 0.08

function axlePart(id: string, name: string, lengthStuds: number, icon: string): RoboticsPartSpec {
  return {
    role: 'axle',
    part: { id, name, width: lengthStuds, depth: 1, height: 8, kind: 'brick', icon, studs: 'none', defaultColor: ROBOTICS_PART_COLORS.axle },
    studsTop: false,
    tubesBottom: false,
    axle: { axis: vec3(1, 0, 0), center: vec3(0, plates(4), 0), halfLength: studs(lengthStuds) / 2, radius: AXLE_ROD_RADIUS },
  }
}

export const ROBOTICS_PART_SPECS: readonly RoboticsPartSpec[] = [
  {
    role: 'hub',
    part: { id: ROBOTICS_PART_IDS.hub, name: 'Hub', width: 4, depth: 4, height: 6, kind: 'brick', icon: 'Hub', defaultColor: ROBOTICS_PART_COLORS.hub },
    studsTop: true,
    tubesBottom: true,
    ports: [
      { label: 'A', point: vec3(-studs(2), plates(3), -studs(1)), normal: vec3(-1, 0, 0) },
      { label: 'B', point: vec3(-studs(2), plates(3), studs(1)), normal: vec3(-1, 0, 0) },
      { label: 'C', point: vec3(studs(2), plates(3), -studs(1)), normal: vec3(1, 0, 0) },
      { label: 'D', point: vec3(studs(2), plates(3), studs(1)), normal: vec3(1, 0, 0) },
    ],
  },
  {
    role: 'motor',
    part: { id: ROBOTICS_PART_IDS.motor, name: 'Motor', width: 3, depth: 3, height: 6, kind: 'brick', icon: 'M', defaultColor: ROBOTICS_PART_COLORS.motor },
    studsTop: true,
    tubesBottom: true,
    socket: { point: vec3(studs(1.5), plates(3), 0), normal: vec3(1, 0, 0) },
  },
  axlePart(ROBOTICS_PART_IDS.axleShort, 'Short axle', 2, '—'),
  axlePart(ROBOTICS_PART_IDS.axleLong, 'Long axle', 4, '——'),
  {
    role: 'wheel',
    part: { id: ROBOTICS_PART_IDS.wheel, name: 'Wheel', width: 1, depth: 3, height: 8, kind: 'brick', icon: '◎', studs: 'none', defaultColor: ROBOTICS_PART_COLORS.wheel },
    studsTop: false,
    tubesBottom: false,
    wheel: { axis: vec3(1, 0, 0), center: vec3(0, plates(4), 0), halfThickness: studs(0.5), radius: WHEEL_RADIUS },
  },
  {
    role: 'distance-sensor',
    // The eyes face -Z; the drawer camera looks at +X/+Y/+Z, so the thumbnail is turned to show them.
    part: { id: ROBOTICS_PART_IDS.distanceSensor, name: 'Distance sensor', width: 2, depth: 1, height: 3, kind: 'brick', icon: '◉◉', defaultColor: ROBOTICS_PART_COLORS.distanceSensor, thumbnailTurn: 2 },
    studsTop: true,
    tubesBottom: true,
    sensor: { point: vec3(0, plates(1.5), -studs(0.5)), normal: vec3(0, 0, -1) },
  },
  {
    role: 'light',
    part: { id: ROBOTICS_PART_IDS.light, name: 'Light', width: 1, depth: 1, height: 3, kind: 'brick', icon: '☀', studs: 'none', defaultColor: ROBOTICS_PART_COLORS.light },
    studsTop: false,
    tubesBottom: true,
  },
  {
    role: 'button',
    part: { id: ROBOTICS_PART_IDS.button, name: 'Button', width: 2, depth: 2, height: 3, kind: 'brick', icon: '⏺', studs: 'none', defaultColor: ROBOTICS_PART_COLORS.button },
    studsTop: false,
    tubesBottom: true,
  },
  {
    role: 'hinge-motor',
    part: { id: ROBOTICS_PART_IDS.hingeMotor, name: 'Hinge motor', width: 2, depth: 2, height: 6, kind: 'brick', icon: '↻', studs: 'full', defaultColor: ROBOTICS_PART_COLORS.hingeMotor },
    studsTop: true,
    tubesBottom: true,
    hinge: { pivot: vec3(0, plates(4), 0), axis: vec3(0, 1, 0), turntableRadius: HINGE_TURNTABLE_RADIUS, housingHeight: plates(4) },
  },
  {
    role: 'seat',
    part: { id: ROBOTICS_PART_IDS.seat, name: 'Seat', width: 2, depth: 2, height: 6, kind: 'brick', icon: '⺁', studs: 'none', defaultColor: ROBOTICS_PART_COLORS.seat },
    studsTop: false,
    tubesBottom: true,
  },
]

export const ROBOTICS_PARTS: readonly BrickPart[] = ROBOTICS_PART_SPECS.map((spec) => spec.part)

const SPEC_BY_ID: ReadonlyMap<string, RoboticsPartSpec> = new Map(ROBOTICS_PART_SPECS.map((spec) => [spec.part.id, spec]))

export const roboticsSpec = (partId: string): RoboticsPartSpec | null => SPEC_BY_ID.get(partId) ?? null
export const isRoboticsPart = (partId: string): boolean => SPEC_BY_ID.has(partId)

export const DEVICE_ROLES: readonly RoboticsDeviceKind[] = ['hub', 'motor', 'hinge-motor', 'distance-sensor', 'light', 'button']
export function isDeviceRole(role: RoboticsPartRole): role is RoboticsDeviceKind {
  return (DEVICE_ROLES as readonly string[]).includes(role)
}
export const isDevicePart = (partId: string): boolean => {
  const spec = roboticsSpec(partId)
  return spec !== null && isDeviceRole(spec.role)
}

export const ROLE_LABELS: Record<RoboticsPartRole, string> = {
  hub: 'hub',
  motor: 'motor',
  'hinge-motor': 'hinge motor',
  'distance-sensor': 'distance sensor',
  light: 'light',
  button: 'button',
  axle: 'axle',
  wheel: 'wheel',
  seat: 'seat',
}
