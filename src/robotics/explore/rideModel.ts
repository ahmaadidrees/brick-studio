import { EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS, PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import { EXPLORE_SPAWN_FLOOR_GAP, EXPLORE_SPAWN_SIDE_CLEARANCE } from '../../brick/scenePhysics'
import type { DerivedCreation } from '../model/creations'
import { brickFrame, toWorldDirection, toWorldPoint, type PartMap } from '../model/grid'
import type { RoboticsSection } from '../model/section'
import { rotateByQuat, type Quat, type Vec3 } from '../model/vec'
import { compileContextFor, compileProgram } from '../program/compile'
import { activeProgramOf, programsOf } from '../program/programs'
import { STARTER_NAMES, starterFor } from '../program/starters'
import { isControllerTrigger, type ProgramIR, type ProgramKey, type RoboticsProgram } from '../program/types'
import { CURB, plateHalfWidth } from './plateCurb'

/**
 * Riding a creation in Explore (checkpoint 4, contract §7 and §9 rover): the pure part.
 * Which creations can be ridden and why not, which program a ride runs, where the seat
 * is, which key goes to the program, where a rider hops off, when a ride goes back to the
 * start and what the prompt says. Nothing here touches a store, a physics world or the document.
 */

/** The seat's pan (where the rider sits) is two plates up; its back rises at the part's +Z edge, so a rider faces -Z. */
export const SEAT_PAN_HEIGHT = 2 * PLATE_HEIGHT
const SEAT_FACING_LOCAL: Vec3 = { x: 0, y: 0, z: -1 }
/** Walking this close (studs, on the ground, to the seat's edge) shows the ride prompt… */
export const RIDE_REACH_STUDS = 5
/** …and so does standing this close to the robot itself, however high its seat (a wide rover's seat can be far from its sides; a seat on a tower is far above them). */
export const RIDE_SIDE_REACH_STUDS = 3
/** Once the Ride card is up it stays until the character is this much further away (studs): it does not blink as she steps about or jumps. */
export const RIDE_KEEP_STUDS = 2
/** Level with the robot: from this far below its base to this far above its top (world units). Not on a roof above it, not down in a pit. */
export const RIDE_LEVEL_MARGIN = 3
/** The character's capsule centre above the surface it stands on (the studio's `EXPLORE_STANDING_Y`). */
export const RIDER_STANDING_Y = EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS + EXPLORE_SPAWN_FLOOR_GAP

/* ------------------------------------------------------------------ rideability */

export type RideStatus = 'rideable' | 'no-drive-pair' | 'unplugged'

export type RideProgramSummary = {
  source: 'saved' | 'starter'
  /** The program's name, or the starter's ("Joystick drive"). */
  name: string
}

export type RideCandidate = {
  creationId: string
  name: string
  status: RideStatus
  /** Seat bricks of the creation, in build order. */
  seatIds: string[]
  /** What a ride would run; null when the creation cannot be ridden. */
  program: RideProgramSummary | null
}

export function rideStatus(creation: Pick<DerivedCreation, 'drivePair' | 'motors'> & Partial<Pick<DerivedCreation, 'driveSides'>>): RideStatus {
  const pair = creation.drivePair
  if (!pair) return 'no-drive-pair'
  // Any motor that drives (a four-wheel car's four, not only the pair).
  const driving = new Set(creation.driveSides ? [...creation.driveSides.left, ...creation.driveSides.right] : [pair.leftId, pair.rightId])
  const plugged = creation.motors.some((motor) => driving.has(motor.brickId) && motor.plugged)
  return plugged ? 'rideable' : 'unplugged'
}

/** Every saved creation with a seat, and whether it can be ridden. */
export function rideCandidates(creations: readonly DerivedCreation[], section: RoboticsSection, worldBrickIds?: ReadonlySet<string>): RideCandidate[] {
  return creations.filter((creation) => creation.saved && creation.seats.length > 0).map((creation) => {
    const status = rideStatus(creation)
    const choice = status === 'rideable' ? chooseRideProgram(section, creation, worldBrickIds) : null
    return {
      creationId: creation.id,
      name: creation.name,
      status,
      seatIds: [...creation.seats],
      program: choice ? { source: choice.source, name: choice.name } : null,
    }
  })
}

/* ------------------------------------------------------------------ the program a ride runs */

export type RideProgramChoice = {
  source: 'saved' | 'starter'
  name: string
  /** The saved program, when the ride runs one. */
  programId: string | null
  ir: ProgramIR
  /** Saved programs that read the joystick but did not compile, by name (the prompt can say why they were passed over). */
  skipped: string[]
}

export const hasControllerScript = (ir: ProgramIR) => ir.scripts.some((script) => isControllerTrigger(script.trigger))

/**
 * The controller program a ride runs (contract §1.4–1.5: the program reads the rider's
 * keys; nothing drives by itself). In order: the creation's active program when it has a
 * `when joystick moves` / `when controls update` script; else its other saved programs
 * that do, in the order they were made; else the Joystick drive starter, compiled on the
 * fly and never saved. A saved program is used only when it compiles without errors.
 * Null when the creation has no drive pair (the starter needs one).
 */
export function chooseRideProgram(section: RoboticsSection, creation: DerivedCreation, worldBrickIds?: ReadonlySet<string>): RideProgramChoice | null {
  const active = activeProgramOf(section, creation.id)
  const ordered: RoboticsProgram[] = active ? [active, ...programsOf(section, creation.id).filter((program) => program.id !== active.id)] : []
  const skipped: string[] = []
  for (const program of ordered) {
    const compiled = compileProgram(program.workspace, compileContextFor(creation, program, worldBrickIds))
    if (!hasControllerScript(compiled.ir)) {
      if (!compiled.ok && readsJoystick(program.workspace)) skipped.push(program.name)
      continue
    }
    if (!compiled.ok) { skipped.push(program.name); continue }
    return { source: 'saved', name: program.name, programId: program.id, ir: compiled.ir, skipped }
  }
  const starter = starterFor(creation, 'joystick-drive')
  if (!starter) return null
  const compiled = compileProgram(starter.workspace, compileContextFor(creation, null, worldBrickIds))
  if (!compiled.ok || !hasControllerScript(compiled.ir)) return null
  return { source: 'starter', name: STARTER_NAMES['joystick-drive'], programId: null, ir: compiled.ir, skipped }
}

/** A workspace whose text names a controller hat (so a program that fails to compile can still be recognised as one). */
function readsJoystick(workspace: unknown): boolean {
  try {
    const text = typeof workspace === 'string' ? workspace : JSON.stringify(workspace)
    return text.includes('robo_when_joystick_moves') || text.includes('robo_when_controls_update')
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ keys */

export type RideKeyboardMode = 'standard' | 'arrow-camera' | 'wasd-camera'

/**
 * The program key a movement key drives while riding. The Explore movement keys follow
 * the player's keyboard setting (WASD and arrows by default; the camera set is left
 * alone), so the keys that walked the character are the keys that drive the creation.
 * W/↑ up, S/↓ down, A/← left, D/→ right, Space space.
 */
export function rideProgramKey(event: { key?: string; code?: string }, mode: RideKeyboardMode = 'standard'): ProgramKey | null {
  const key = (event.key ?? '').toLowerCase()
  const arrows = mode !== 'arrow-camera'
  const wasd = mode !== 'wasd-camera'
  if (arrows) {
    if (key === 'arrowup') return 'up'
    if (key === 'arrowdown') return 'down'
    if (key === 'arrowleft') return 'left'
    if (key === 'arrowright') return 'right'
  }
  if (wasd) {
    if (key === 'w') return 'up'
    if (key === 's') return 'down'
    if (key === 'a') return 'left'
    if (key === 'd') return 'right'
  }
  if (key === ' ' || key === 'spacebar' || event.code === 'Space') return 'space'
  return null
}

/* ------------------------------------------------------------------ the seat */

/**
 * Where a rider sits, in the frame of the body that carries the seat. Every run-controller
 * body starts at the origin with no rotation, so body-local coordinates are world
 * coordinates at the built pose (see `sim/mechanics.ts`): a pose maps them straight on.
 */
export type SeatMount = {
  brickId: string
  /** The pan's top centre. */
  point: Vec3
  /** Which way a rider faces (horizontal unit vector). */
  facing: Vec3
  /** Half the seat's footprint, world units, for the reach test. */
  radius: number
  /** Height of the seat's back above its bottom. */
  height: number
}

export function seatMountAtBuild(brick: BrickInstance, part: BrickPart, plateSize: number): SeatMount {
  const frame = brickFrame(brick, part, plateSize)
  const size = rotatedSize(part, brick.rotation)
  return {
    brickId: brick.id,
    point: toWorldPoint(frame, { x: 0, y: SEAT_PAN_HEIGHT, z: 0 }),
    facing: toWorldDirection(frame, SEAT_FACING_LOCAL),
    radius: (Math.max(size.width, size.depth) * STUD) / 2,
    height: part.height * PLATE_HEIGHT,
  }
}

export type Pose = { position: Vec3; rotation: Quat }
export const IDENTITY_POSE: Pose = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } }

export function applyPose(pose: Pose, local: Vec3): Vec3 {
  const turned = rotateByQuat(pose.rotation, local)
  return { x: pose.position.x + turned.x, y: pose.position.y + turned.y, z: pose.position.z + turned.z }
}

/** The character's convention: facing (sin yaw, cos yaw). */
export const yawOf = (direction: { x: number; z: number }) => Math.atan2(direction.x, direction.z)

export type SeatWorld = { point: Vec3; facing: Vec3; facingYaw: number }

export function seatInWorld(seat: SeatMount, pose: Pose): SeatWorld {
  const point = applyPose(pose, seat.point)
  const facing = rotateByQuat(pose.rotation, seat.facing)
  return { point, facing, facingYaw: yawOf(facing) }
}

/** Where the character's capsule centre goes when it sits on the seat. */
export const riderPosition = (seat: SeatWorld): Vec3 => ({ x: seat.point.x, y: seat.point.y + RIDER_STANDING_Y, z: seat.point.z })

/**
 * How far the character is from a seat, studs along the ground from the seat's edge, or
 * null when it is not level with it (standing on a roof above it, or far below).
 */
export function seatReach(avatar: Vec3, seat: SeatWorld, mount: Pick<SeatMount, 'radius' | 'height'>): number | null {
  const panBottom = seat.point.y - SEAT_PAN_HEIGHT
  if (avatar.y < panBottom - 3 || avatar.y > panBottom + mount.height + 2) return null
  const along = Math.hypot(avatar.x - seat.point.x, avatar.z - seat.point.z)
  return Math.max(0, along - mount.radius) / STUD
}

/* ------------------------------------------------------------------ hopping off */

/** A creation's footprint on the ground: a rectangle with a centre, two axes and half-sizes (world units). */
export type Footprint = { center: Vec3; axisX: Vec3; axisZ: Vec3; halfX: number; halfZ: number; top: number }

/** The creation's bricks at the built pose, as a rectangle in body-local coordinates (world at build). */
export function localFootprint(bricks: readonly BrickInstance[], brickIds: readonly string[], partMap: PartMap, plateSize: number): { min: Vec3; max: Vec3 } | null {
  const ids = new Set(brickIds)
  const min = { x: Infinity, y: Infinity, z: Infinity }
  const max = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (const brick of bricks) {
    if (!ids.has(brick.id)) continue
    const part = partMap[brick.partId]
    if (!part) continue
    const origin = brickFrame(brick, part, plateSize).origin
    const size = rotatedSize(part, brick.rotation)
    min.x = Math.min(min.x, origin.x - (size.width * STUD) / 2)
    max.x = Math.max(max.x, origin.x + (size.width * STUD) / 2)
    min.z = Math.min(min.z, origin.z - (size.depth * STUD) / 2)
    max.z = Math.max(max.z, origin.z + (size.depth * STUD) / 2)
    min.y = Math.min(min.y, origin.y)
    max.y = Math.max(max.y, origin.y + part.height * PLATE_HEIGHT)
  }
  return Number.isFinite(min.x) ? { min, max } : null
}

/** A local rectangle carried by a pose (only its turn about the vertical matters on the ground). */
export function footprintInWorld(local: { min: Vec3; max: Vec3 }, pose: Pose): Footprint {
  const centerLocal = { x: (local.min.x + local.max.x) / 2, y: local.min.y, z: (local.min.z + local.max.z) / 2 }
  const flat = (v: Vec3) => { const length = Math.hypot(v.x, v.z) || 1; return { x: v.x / length, y: 0, z: v.z / length } }
  const top = applyPose(pose, { x: centerLocal.x, y: local.max.y, z: centerLocal.z }).y
  return {
    center: applyPose(pose, centerLocal),
    axisX: flat(rotateByQuat(pose.rotation, { x: 1, y: 0, z: 0 })),
    axisZ: flat(rotateByQuat(pose.rotation, { x: 0, y: 0, z: 1 })),
    halfX: (local.max.x - local.min.x) / 2,
    halfZ: (local.max.z - local.min.z) / 2,
    top,
  }
}

/** Studs along the ground from a point to the footprint's edge (0 inside it). */
export function footprintDistance(point: Vec3, footprint: Footprint): number {
  const dx = point.x - footprint.center.x
  const dz = point.z - footprint.center.z
  const u = Math.max(0, Math.abs(dx * footprint.axisX.x + dz * footprint.axisX.z) - footprint.halfX)
  const v = Math.max(0, Math.abs(dx * footprint.axisZ.x + dz * footprint.axisZ.z) - footprint.halfZ)
  return Math.hypot(u, v) / STUD
}

/**
 * How near the character is to riding: within `RIDE_REACH_STUDS` of a seat's edge, or within
 * `RIDE_SIDE_REACH_STUDS` of the robot, measured along the ground; `keep` studs more for the
 * robot whose Ride card is already up. Level with the robot, not with its seat: a seat on top of
 * a tall tower is ridden from the ground beside it (a novice tester could only reach one mid-jump).
 * The smaller of the two distances (studs), or null when neither holds. Without a footprint the
 * seat's own height decides (`seatReach`).
 */
export function rideReach(avatar: Vec3, seat: SeatWorld, mount: Pick<SeatMount, 'radius' | 'height'>, footprint: Footprint | null, keep = 0): number | null {
  if (!footprint) {
    const toSeat = seatReach(avatar, seat, mount)
    return toSeat !== null && toSeat <= RIDE_REACH_STUDS + keep ? toSeat : null
  }
  const top = Math.max(footprint.top, seat.point.y - SEAT_PAN_HEIGHT + mount.height)
  if (avatar.y < footprint.center.y - RIDE_LEVEL_MARGIN || avatar.y > top + RIDE_LEVEL_MARGIN) return null
  const toSeat = Math.max(0, Math.hypot(avatar.x - seat.point.x, avatar.z - seat.point.z) - mount.radius) / STUD
  const toSide = footprintDistance(avatar, footprint)
  if (toSeat > RIDE_REACH_STUDS + keep && toSide > RIDE_SIDE_REACH_STUDS + keep) return null
  return Math.min(toSeat, toSide)
}

/** Studs of air between the footprint's edge and the character's capsule, ring by ring. */
export const HOP_OFF_RINGS_STUDS = [0.4, 1.2, 2.4, 4]

/**
 * Where a rider might step down, best first (x and z only; the scene finds the ground
 * under each and checks it is free): beside the seat on the rider's left, then the right,
 * behind, in front, then the four corners, each ring a little further from the creation's
 * edge. The ground check is the studio's own spawn test.
 */
export function hopOffPoints(footprint: Footprint, seatFacing: Vec3): { x: number; z: number }[] {
  const facing = (() => { const length = Math.hypot(seatFacing.x, seatFacing.z); return length > 1e-6 ? { x: seatFacing.x / length, z: seatFacing.z / length } : { x: 0, z: -1 } })()
  const left = { x: facing.z, z: -facing.x }
  const right = { x: -left.x, z: -left.z }
  const back = { x: -facing.x, z: -facing.z }
  const diagonal = (a: { x: number; z: number }, b: { x: number; z: number }) => { const x = a.x + b.x; const z = a.z + b.z; const length = Math.hypot(x, z); return { x: x / length, z: z / length } }
  const directions = [left, right, back, facing, diagonal(left, back), diagonal(right, back), diagonal(left, facing), diagonal(right, facing)]
  const extent = (direction: { x: number; z: number }) => Math.abs(direction.x * footprint.axisX.x + direction.z * footprint.axisX.z) * footprint.halfX + Math.abs(direction.x * footprint.axisZ.x + direction.z * footprint.axisZ.z) * footprint.halfZ
  const clearance = EXPLORER_CAPSULE_RADIUS + EXPLORE_SPAWN_SIDE_CLEARANCE
  const points: { x: number; z: number }[] = []
  for (const ring of HOP_OFF_RINGS_STUDS) {
    for (const direction of directions) {
      const reach = extent(direction) + clearance + ring * STUD
      points.push({ x: footprint.center.x + direction.x * reach, z: footprint.center.z + direction.z * reach })
    }
  }
  return points
}

/* ------------------------------------------------------------------ back to the start */

/**
 * A ride keeps its rider. The curb (`plateCurb.ts`) keeps a ridden robot on the plate, the only
 * ground its physics world and Explore agree on; if it still ends up where there is no ground for it
 * (over the curb, or falling), or lies tipped over and cannot drive, the store puts it back where it
 * was built with the rider still on the seat. These are the only reasons.
 */
export type RideTrouble = 'past-the-curb' | 'fell' | 'tipped'

/** The seat this far (studs) past the curb's outside face: the robot got over the curb. */
export const PAST_CURB_STUDS = 1
/** The seat below this height (world units; the plate's top is 0): the robot fell. */
export const FALLEN_Y = -3
/** The robot's up direction lower than this (1 upright, 0 on its side)… */
export const TIPPED_UP = 0.35
/** …for this long (seconds): it tipped over. */
export const TIPPED_SECONDS = 1.5

/** How far the seat may go from the plate's middle along x or z before it is past the curb (world units). */
export const rideLimit = (plateSize: number) => plateHalfWidth(plateSize) + (CURB.thicknessStuds + PAST_CURB_STUDS) * STUD

/** Whether a body turned by `rotation` lies tipped over. */
export const isTipped = (rotation: Quat) => rotateByQuat(rotation, { x: 0, y: 1, z: 0 }).y < TIPPED_UP

/** Why the ridden robot must go back to the start now, or null. `tippedSeconds`: how long it has been tipped over. */
export function rideTrouble(seat: Vec3, plateSize: number, tippedSeconds: number): RideTrouble | null {
  if (seat.y < FALLEN_Y) return 'fell'
  const limit = rideLimit(plateSize)
  if (Math.abs(seat.x) > limit || Math.abs(seat.z) > limit) return 'past-the-curb'
  if (tippedSeconds >= TIPPED_SECONDS) return 'tipped'
  return null
}

/** The one line a rider sees when the ride goes back to the start. */
export const BACK_TO_START = 'Back to the start!'

/* ------------------------------------------------------------------ the prompt */

export type RidePromptInput = {
  active: boolean
  liveRoom: boolean
  riding: { name: string; program: RideProgramSummary | null; stopped: boolean } | null
  dismounting: boolean
  near: RideCandidate | null
  notice: string | null
  /** A touch screen: the stick drives, and there is no E key. */
  touch?: boolean
  /** The Explore keyboard setting (which keys walk, and so which keys drive). */
  keys?: RideKeyboardMode
}

export type RidePrompt = {
  state: 'ride' | 'riding' | 'blocked' | 'notice'
  label: string
  detail: string | null
  /** The student's own saved program that drives it, in their words; null for the one made on the fly (never named). */
  code: string | null
  /** The key hint and the button beside it: "Press E to ride Buggy" · Ride. */
  action: { key: 'E'; phrase: string; button: string } | null
}

/**
 * The words (docs/robotics/KID-UX.md copy guide): short lines a third grader reads, the keys they
 * press, and a program named only when it is their own code. The Joystick drive program made on the
 * fly is how riding works, not something to read about.
 */
export const RIDE_WORDS = Object.freeze({
  driveTouch: 'Drive with the stick.',
  driveKeys: { standard: 'Drive with the arrow keys or WASD.', 'arrow-camera': 'Drive with the WASD keys.', 'wasd-camera': 'Drive with the arrow keys.' } as Record<RideKeyboardMode, string>,
  stopped: 'Your code stopped. Hop off and fix it in Code.',
  usingCode: (name: string) => `Using your code: ${name}`,
  drivesWithCode: (name: string) => `Drives with your code: ${name}`,
  noDriveMotors: 'Add a motor on each side to drive it.',
  unplugged: 'Plug its motors into the hub to ride it.',
  liveRoom: 'Riding is off in a shared world for now.',
})

/** Pure: what the ride prompt says. Null shows nothing. */
export function ridePrompt(input: RidePromptInput): RidePrompt | null {
  if (!input.active) return null
  if (input.riding) {
    const program = input.riding.program
    const drive = input.touch ? RIDE_WORDS.driveTouch : RIDE_WORDS.driveKeys[input.keys ?? 'standard']
    return {
      state: 'riding',
      label: input.dismounting ? `Hopping off ${input.riding.name}…` : `Riding ${input.riding.name}`,
      // "Back to the start!" takes the line for a few seconds; a stopped program says what to do.
      detail: input.notice ?? (input.riding.stopped ? RIDE_WORDS.stopped : drive),
      code: program?.source === 'saved' ? RIDE_WORDS.usingCode(program.name) : null,
      action: input.dismounting ? null : { key: 'E', phrase: 'hop off', button: 'Hop off' },
    }
  }
  const near = nearPrompt(input)
  // A notice (the build changed and the robots went back) takes the detail line for a few seconds.
  if (input.notice) return near ? { ...near, detail: input.notice } : { state: 'notice', label: input.notice, detail: null, code: null, action: null }
  return near
}

function nearPrompt(input: RidePromptInput): RidePrompt | null {
  const near = input.near
  if (!near) return null
  const blocked = (detail: string): RidePrompt => ({ state: 'blocked', label: near.name, detail, code: null, action: null })
  if (input.liveRoom) return blocked(RIDE_WORDS.liveRoom)
  if (near.status === 'no-drive-pair') return blocked(RIDE_WORDS.noDriveMotors)
  if (near.status === 'unplugged') return blocked(RIDE_WORDS.unplugged)
  const program = near.program
  return {
    state: 'ride',
    label: near.name,
    detail: program?.source === 'saved' ? RIDE_WORDS.drivesWithCode(program.name) : null,
    code: null,
    action: { key: 'E', phrase: `ride ${near.name}`, button: 'Ride' },
  }
}
