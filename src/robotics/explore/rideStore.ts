import { create } from 'zustand'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { STUD } from '../../brick/parts'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import type { DerivedCreation } from '../model/creations'
import type { Vec3 } from '../model/vec'
import type { ProgramKey } from '../program/types'
import { PROGRAM_KEYS } from '../program/types'
import { createRunController, deriveCreationForSpace, type StageRunController } from '../run/controller'
import { createProgramRuntime } from '../runtime'
import { setHiddenBrickIds } from '../scene/hiddenBricks'
import type { RapierModule } from '../sim/colliders'
import { computeModel, simBehaviorKey } from '../state/roboticsStore'
import type { HopOffRange } from './hopOff'
import type { RideAvatarBody, RideAvatarFrame } from './rideBridge'
import {
  IDENTITY_POSE, chooseRideProgram, footprintInWorld, hopOffPoints, localFootprint, rideCandidates, rideReach, riderPosition, seatInWorld, seatMountAtBuild, yawOf,
  type Footprint, type Pose, type RideCandidate, type RideProgramChoice, type SeatMount, type SeatWorld,
} from './rideModel'

/**
 * Riding in Explore (checkpoint 4): the state machine and the live creations.
 *
 *   walking ──ride──▶ riding ──hop off──▶ dismounting ──free ground found──▶ walking
 *      ▲                 │                                                     │
 *      └── leave Explore (every creation back to its authored pose) ◀──────────┘
 *
 * - `enter(rapier)` when the Explore scene mounts: the candidates (saved creations with a
 *   seat) are read from the document. `leave()` when it unmounts disposes every live
 *   creation, so leaving Explore returns every creation to its authored pose.
 * - `ride(id)` builds the creation's run controller in My world (world bricks are static
 *   scenery; the creation's own bodies are free, so a rover built on the plate can roll),
 *   picks its controller program (`chooseRideProgram`) and runs it. The rider's keys and
 *   the touch stick feed the program's input, never the character.
 * - `hopOff()` stops the program (every motor brakes) and waits for the creation to stop;
 *   then the scene finds free ground beside it and the character is put down there. The
 *   creation stays where it stopped, simulated until it settles, for the rest of the visit.
 * - An edit of the construction while anything is live (Undo in Explore, for example)
 *   retires every live creation: the construction is the truth.
 *
 * Nothing here writes the document or its history. The live controllers are kept outside
 * zustand (they change every frame); the store holds what React draws from.
 */
export type RidePhase = 'walking' | 'riding' | 'dismounting'

export type RideNotice = { text: string; nonce: number }

export type ExploreRideState = {
  /** An Explore scene is mounted and riding is set up. */
  active: boolean
  /** Explore in a live room: riding is unavailable (contract §8). */
  liveRoom: boolean
  candidates: RideCandidate[]
  /** The candidate whose seat the character is near (walking only). */
  nearestId: string | null
  riding: string | null
  phase: RidePhase
  /** Creations simulated now (ridden, stopping or parked), in the order they went live. The scene draws these. */
  liveIds: string[]
  /** The ridden creation's program has stopped (a runtime error). */
  programStopped: boolean
  notice: RideNotice | null
  enter: (rapier: RapierModule) => void
  leave: () => void
  setLiveRoom: (liveRoom: boolean) => void
  /** Ride the given creation, or the one the character is near. */
  ride: (creationId?: string) => boolean
  hopOff: () => void
  /** The E key and the prompt's button: hop off while riding, else ride what is near. True when it did something. */
  pressRideKey: () => boolean
  setRideKey: (key: ProgramKey, down: boolean) => void
  releaseRideKeys: () => void
}

export type LiveRide = {
  creationId: string
  name: string
  controller: StageRunController
  /** Derived with free bodies (a rover built on the plate is not anchored to it). */
  creation: DerivedCreation
  /** The bricks and plate the controller was built from (the scene draws and mirrors these). */
  bricks: readonly BrickInstance[]
  plateSize: number
  seat: SeatMount
  seatBodyId: string
  /** The creation's bricks at the built pose, body-local. */
  footprint: { min: Vec3; max: Vec3 }
  program: RideProgramChoice | null
  /** Seconds it has been still since it was left parked. */
  settled: number
  /** Parked and still: the scene stops advancing it. */
  frozen: boolean
  /** Distinguishes a rebuilt ride of the same creation (the scene remounts its bodies). */
  generation: number
}

/** What the scene hands the store each frame. */
export type RideEnvironment = {
  /** The on-screen stick: x right, z forward, -1..1. */
  touchMove: { x: number; z: number }
  /** Free ground for the character among these points, within `range` (the scene asks its physics world), or null. */
  findPlacement: (points: { x: number; z: number }[], range: HopOffRange) => Vec3 | null
}

/** Hop off: at least this long on the seat (the braking creation settles and the world catches up)… */
export const DISMOUNT_MIN_SECONDS = 0.12
/** …and no longer than this, even if it is still rolling. */
export const DISMOUNT_MAX_SECONDS = 0.9
/** A creation slower than this (world units per second) has stopped. */
export const STOPPED_SPEED = 0.25
/** A ride starts with the follow camera at least this steep (radians), so the rider shows over the seat's back. */
export const RIDE_CAMERA_PITCH = 0.8
/** …and at least this far back (world units), so the road ahead shows over the creation instead of its hub. */
export const RIDE_CAMERA_DISTANCE = 9.5
const SETTLE_SPEED = 0.02
const SETTLE_SECONDS = 0.6
const NOTICE_SECONDS = 5

const live = new Map<string, LiveRide>()
const seatMounts = new Map<string, SeatMount[]>()
/** Each candidate's bricks at the built pose, body-local (for the reach test while it is not live). */
const builtFootprints = new Map<string, { min: Vec3; max: Vec3 }>()
let rapierModule: RapierModule | null = null
let dismount: { creationId: string; elapsed: number; waitForStop: boolean } | null = null
let placement: RideAvatarFrame | null = null
let lastSeat: RideAvatarFrame | null = null
let lastAvatar: Vec3 | null = null
let avatarHandle: number | null = null
let unsubscribe: (() => void) | null = null
let noticeNonce = 0
let rideGeneration = 0
let noticeTimer: ReturnType<typeof setTimeout> | null = null

const INITIAL = { active: false, liveRoom: false, candidates: [] as RideCandidate[], nearestId: null, riding: null, phase: 'walking' as RidePhase, liveIds: [] as string[], programStopped: false, notice: null }

export const liveRide = (creationId: string): LiveRide | null => live.get(creationId) ?? null
export const liveRides = (): LiveRide[] => [...live.values()]
export const lastAvatarPosition = (): Vec3 | null => (lastAvatar ? { ...lastAvatar } : null)
export const riderBodyHandle = (): number | null => avatarHandle

function poseOf(ride: LiveRide, bodyId = ride.seatBodyId): Pose {
  return ride.controller.poses().get(bodyId) ?? IDENTITY_POSE
}

export function seatOf(ride: LiveRide): SeatWorld {
  return seatInWorld(ride.seat, poseOf(ride))
}

export function footprintOf(ride: LiveRide): Footprint {
  return footprintInWorld(ride.footprint, poseOf(ride))
}

function speedOf(ride: LiveRide): number {
  const velocity = ride.controller.mechanics.bodyVelocity(ride.seatBodyId)
  return velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : 0
}

function syncHidden() {
  const ids = new Set<string>()
  for (const ride of live.values()) for (const id of ride.controller.hiddenBrickIds) ids.add(id)
  setHiddenBrickIds(ids.size ? ids : null)
}

function releaseKeys(ride: LiveRide | null | undefined) {
  if (!ride) return
  for (const key of PROGRAM_KEYS) ride.controller.setKey(key, false)
  ride.controller.setJoystick(0, 0)
}

function worldBrickIds(state: Pick<BrickState, 'bricks'>) {
  return new Set(state.bricks.map((brick) => brick.id))
}

/** Reads the candidates and their seats from the document as it is now. */
function refreshCandidates() {
  const brickState = useBrickStore.getState()
  const model = computeModel(brickState)
  const candidates = rideCandidates(model.creations, model.section, worldBrickIds(brickState))
  seatMounts.clear()
  builtFootprints.clear()
  const byId = new Map(brickState.bricks.map((brick) => [brick.id, brick]))
  for (const candidate of candidates) {
    const creation = model.creations.find((entry) => entry.id === candidate.creationId)
    const footprint = creation ? localFootprint(brickState.bricks, creation.brickIds, model.input.partMap, model.input.plateSize) : null
    if (footprint) builtFootprints.set(candidate.creationId, footprint)
    const mounts: SeatMount[] = []
    for (const seatId of candidate.seatIds) {
      const brick = byId.get(seatId)
      const part = brick ? model.input.partMap[brick.partId] : undefined
      if (brick && part) mounts.push(seatMountAtBuild(brick, part, model.input.plateSize))
    }
    seatMounts.set(candidate.creationId, mounts)
  }
  const nearestId = useExploreRideStore.getState().nearestId
  useExploreRideStore.setState({ candidates, nearestId: nearestId && candidates.some((candidate) => candidate.creationId === nearestId) ? nearestId : null })
}

/** Seats of a candidate where they are now, with its footprint: on the live creation, else at the built pose. */
function seatsNow(creationId: string): { mount: SeatMount; world: SeatWorld; footprint: Footprint | null }[] {
  const ride = live.get(creationId)
  if (ride) return [{ mount: ride.seat, world: seatOf(ride), footprint: footprintOf(ride) }]
  const built = builtFootprints.get(creationId)
  const footprint = built ? footprintInWorld(built, IDENTITY_POSE) : null
  return (seatMounts.get(creationId) ?? []).map((mount) => ({ mount, world: seatInWorld(mount, IDENTITY_POSE), footprint }))
}

function updateNearest(avatar: Vec3) {
  const state = useExploreRideStore.getState()
  if (state.phase !== 'walking') return
  let best: { id: string; reach: number } | null = null
  for (const candidate of state.candidates) {
    for (const seat of seatsNow(candidate.creationId)) {
      const reach = rideReach(avatar, seat.world, seat.mount, seat.footprint)
      if (reach === null) continue
      if (!best || reach < best.reach) best = { id: candidate.creationId, reach }
    }
  }
  const id = best?.id ?? null
  if (id !== state.nearestId) useExploreRideStore.setState({ nearestId: id })
}

function showNotice(text: string) {
  noticeNonce += 1
  const nonce = noticeNonce
  useExploreRideStore.setState({ notice: { text, nonce } })
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    if (useExploreRideStore.getState().notice?.nonce === nonce) useExploreRideStore.setState({ notice: null })
  }, NOTICE_SECONDS * 1000)
}

function buildRide(creationId: string, avatar: Vec3 | null): LiveRide | null {
  if (!rapierModule) return null
  const brickState = useBrickStore.getState()
  const model = computeModel(brickState)
  const creation = deriveCreationForSpace(model.input, creationId, 'testPlate')
  if (!creation || !creation.seats.length) return null
  // The seat nearest the character (a creation may have more than one).
  const mounts = seatMounts.get(creationId) ?? []
  const seat = [...mounts].sort((a, b) => (avatar ? Math.hypot(a.point.x - avatar.x, a.point.z - avatar.z) - Math.hypot(b.point.x - avatar.x, b.point.z - avatar.z) : 0))[0]
    ?? (() => {
      const brick = brickState.bricks.find((candidate) => candidate.id === creation.seats[0])
      const part = brick ? model.input.partMap[brick.partId] : undefined
      return brick && part ? seatMountAtBuild(brick, part, model.input.plateSize) : null
    })()
  const footprint = localFootprint(brickState.bricks, creation.brickIds, model.input.partMap, model.input.plateSize)
  if (!seat || !footprint) return null
  const controller = createRunController({ rapier: rapierModule, bricks: brickState.bricks, partMap: model.input.partMap, plateSize: model.input.plateSize, creation, space: 'myWorld', props: [] })
  const seatBodyId = controller.bodyOfBrick(seat.brickId)
  if (!seatBodyId) {
    controller.dispose()
    return null
  }
  return { creationId, name: creation.name, controller, creation, bricks: brickState.bricks, plateSize: model.input.plateSize, seat, seatBodyId, footprint, program: null, settled: 0, frozen: false, generation: ++rideGeneration }
}

/** Every live creation goes back to its authored pose (the rider, if any, is put down beside where it was built). */
function retire(reason: string | null, ids: readonly string[] = [...live.keys()]) {
  const state = useExploreRideStore.getState()
  const riding = state.riding
  for (const id of ids) {
    live.get(id)?.controller.dispose()
    live.delete(id)
  }
  const patch: Partial<ExploreRideState> = { liveIds: [...live.keys()] }
  if (riding && ids.includes(riding)) {
    dismount = { creationId: riding, elapsed: 0, waitForStop: false }
    patch.phase = 'dismounting'
    patch.programStopped = false
  }
  useExploreRideStore.setState(patch)
  syncHidden()
  if (reason) showNotice(reason)
}

/** Where the character hops off to: beside the creation where it is now, or where it was built when it went back. */
function dismountTarget(creationId: string): { footprint: Footprint; facing: Vec3; seatY: number } | null {
  const ride = live.get(creationId)
  if (ride) { const seat = seatOf(ride); return { footprint: footprintOf(ride), facing: seat.facing, seatY: seat.point.y } }
  const brickState = useBrickStore.getState()
  const model = computeModel(brickState)
  const creation = model.creations.find((candidate) => candidate.id === creationId)
  const mount = seatMounts.get(creationId)?.[0]
  const local = creation ? localFootprint(brickState.bricks, creation.brickIds, model.input.partMap, model.input.plateSize) : null
  if (!local) return null
  const footprint = footprintInWorld(local, IDENTITY_POSE)
  return { footprint, facing: mount?.facing ?? { x: 0, y: 0, z: -1 }, seatY: mount?.point.y ?? footprint.top }
}

function onDocumentChange(state: BrickState, previous: BrickState) {
  const ride = useExploreRideStore.getState()
  if (!ride.active) return
  if (state.exploreRespawnNonce !== previous.exploreRespawnNonce && ride.phase !== 'walking') {
    // Respawn while riding: the character is put somewhere safe by the studio; the creation stays parked.
    const current = ride.riding ? live.get(ride.riding) : null
    current?.controller.stop()
    releaseKeys(current)
    dismount = null
    useExploreRideStore.setState({ phase: 'walking', riding: null, programStopped: false })
  }
  const bricksChanged = state.bricks !== previous.bricks
  if (!bricksChanged && state.documentMetadata === previous.documentMetadata) return
  if (live.size && (bricksChanged || simBehaviorKey(state) !== simBehaviorKey(previous))) retire('The build changed, so every creation went back to where it was built.')
  refreshCandidates()
}

export const useExploreRideStore = create<ExploreRideState>((set, get) => ({
  ...INITIAL,

  enter: (rapier) => {
    rapierModule = rapier
    if (get().active) return
    set({ ...INITIAL, active: true, liveRoom: get().liveRoom })
    refreshCandidates()
    unsubscribe?.()
    unsubscribe = useBrickStore.subscribe(onDocumentChange)
  },

  leave: () => {
    for (const ride of live.values()) ride.controller.dispose()
    live.clear()
    seatMounts.clear()
    builtFootprints.clear()
    dismount = null
    placement = null
    lastSeat = null
    lastAvatar = null
    avatarHandle = null
    unsubscribe?.()
    unsubscribe = null
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = null
    setHiddenBrickIds(null)
    set({ ...INITIAL, liveRoom: get().liveRoom })
  },

  setLiveRoom: (liveRoom) => {
    if (liveRoom === get().liveRoom) return
    set({ liveRoom })
    if (liveRoom && get().phase === 'riding') get().hopOff()
  },

  ride: (creationId) => {
    const state = get()
    const id = creationId ?? state.nearestId
    if (!state.active || state.liveRoom || state.phase !== 'walking' || !id) return false
    const candidate = state.candidates.find((entry) => entry.creationId === id)
    if (!candidate || candidate.status !== 'rideable') return false
    let ride = live.get(id)
    if (!ride) {
      const built = buildRide(id, lastAvatar)
      if (!built) return false
      ride = built
      live.set(id, ride)
    }
    const brickState = useBrickStore.getState()
    const choice = chooseRideProgram(computeModel(brickState).section, ride.creation, worldBrickIds(brickState))
    if (!choice) return false
    releaseKeys(ride)
    ride.controller.run(createProgramRuntime(choice.ir, { fixedStep: ride.controller.mechanics.fixedStep }))
    ride.program = choice
    ride.frozen = false
    ride.settled = 0
    dismount = null
    placement = null
    set({ riding: id, phase: 'riding', nearestId: null, liveIds: [...live.keys()], programStopped: false, notice: null })
    syncHidden()
    if (brickState.touchPitch < RIDE_CAMERA_PITCH) useBrickStore.setState({ touchPitch: RIDE_CAMERA_PITCH })
    if (brickState.touchCameraDistance < RIDE_CAMERA_DISTANCE) brickState.setTouchCameraDistance(RIDE_CAMERA_DISTANCE)
    return true
  },

  hopOff: () => {
    const state = get()
    if (state.phase !== 'riding' || !state.riding) return
    const ride = live.get(state.riding)
    ride?.controller.stop()
    releaseKeys(ride)
    dismount = { creationId: state.riding, elapsed: 0, waitForStop: true }
    set({ phase: 'dismounting' })
  },

  pressRideKey: () => {
    const state = get()
    if (!state.active) return false
    if (state.phase === 'riding') { get().hopOff(); return true }
    if (state.phase === 'dismounting') return true
    if (!state.nearestId) return false
    get().ride(state.nearestId)
    return true
  },

  setRideKey: (key, down) => {
    const riding = get().riding
    if (riding && get().phase === 'riding') live.get(riding)?.controller.setKey(key, down)
    else if (!down) for (const ride of live.values()) ride.controller.setKey(key, false)
  },

  releaseRideKeys: () => {
    for (const ride of live.values()) releaseKeys(ride)
  },
}))

/**
 * One frame of every live creation (the scene calls this before the character moves):
 * advance the controllers with frame time, feed the touch stick to the ridden one, bring
 * back a ride that left the plate, let parked ones settle, and finish a hop-off.
 */
export function advanceRides(delta: number, environment: RideEnvironment) {
  const state = useExploreRideStore.getState()
  if (!state.active) return
  const riding = state.phase === 'riding' && state.riding ? live.get(state.riding) ?? null : null
  if (riding) riding.controller.setJoystick(environment.touchMove.z * 100, environment.touchMove.x * 100)
  for (const ride of live.values()) {
    if (ride.frozen) continue
    ride.controller.advance(delta)
    if (ride === riding || dismount?.creationId === ride.creationId) continue
    ride.settled = speedOf(ride) < SETTLE_SPEED ? ride.settled + delta : 0
    if (ride.settled >= SETTLE_SECONDS) ride.frozen = true
  }
  if (riding) {
    const stopped = riding.controller.phase === 'stopped'
    if (stopped !== state.programStopped) useExploreRideStore.setState({ programStopped: stopped })
    const seat = seatOf(riding)
    const half = plateHalf() + 2 * STUD
    if (Math.abs(seat.point.x) > half || Math.abs(seat.point.z) > half || seat.point.y < -3) {
      retire(`${riding.name} left the plate, so it went back to where you built it.`, [riding.creationId])
    }
  }
  if (dismount) finishDismount(delta, environment)
}

const plateHalf = () => (getBuildPlateSize(useBrickStore.getState().documentMetadata) * STUD) / 2

function finishDismount(delta: number, environment: RideEnvironment) {
  const current = dismount
  if (!current) return
  current.elapsed += delta
  const ride = live.get(current.creationId)
  const still = !ride || speedOf(ride) < STOPPED_SPEED
  if (current.elapsed < DISMOUNT_MIN_SECONDS || (current.waitForStop && !still && current.elapsed < DISMOUNT_MAX_SECONDS)) return
  dismount = null
  const target = dismountTarget(current.creationId)
  const range = target && { fromY: Math.max(target.footprint.top, target.seatY) + 2, minGround: target.footprint.center.y - 3, maxGround: target.seatY }
  const found = target && range ? environment.findPlacement(hopOffPoints(target.footprint, target.facing), range) : null
  if (found) {
    const center = target!.footprint.center
    placement = { mode: 'place', position: found, facingYaw: yawOf({ x: center.x - found.x, z: center.z - found.z }) }
  } else {
    placement = null
    useBrickStore.getState().requestRespawn()
  }
  if (ride) { ride.settled = 0; ride.frozen = false }
  useExploreRideStore.setState({ phase: 'walking', riding: null, programStopped: false })
}

/**
 * The character's side of the bridge (`rideBridge.ts`): records where the character is,
 * updates which seat is near, and says whether to sit, to be put down, or to walk.
 */
export function rideAvatarFrame(avatar: RideAvatarBody): RideAvatarFrame | null {
  const state = useExploreRideStore.getState()
  if (!state.active) return null
  const at = avatar.translation()
  lastAvatar = { x: at.x, y: at.y, z: at.z }
  avatarHandle = avatar.handle
  if (placement) {
    const next = placement
    placement = null
    lastSeat = null
    updateNearest(next.position)
    return next
  }
  if (state.phase === 'walking') {
    updateNearest(lastAvatar)
    return null
  }
  const ride = state.riding ? live.get(state.riding) : null
  if (ride) {
    const seat = seatOf(ride)
    lastSeat = { mode: 'seat', position: riderPosition(seat), facingYaw: seat.facingYaw }
  }
  return lastSeat
}

/** For tests: the store and the module state back to nothing. */
export function resetExploreRideForTests() {
  useExploreRideStore.getState().leave()
  useExploreRideStore.setState({ liveRoom: false })
  rapierModule = null
}
