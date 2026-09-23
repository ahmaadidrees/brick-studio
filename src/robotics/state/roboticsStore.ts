import { create } from 'zustand'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { PLATE_HEIGHT, STUD, createPartMap, rotatedSize } from '../../brick/parts'
import { registerRoboticsHistoryMerge, useBrickStore, type BrickHistoryEntry, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { connect, planAssistedConnection } from '../model/control'
import { anchorableBrickIds, creationComponent, defaultCreationName, deriveCreations, deviceName, facesShortEnd, type DeriveInput, type DerivedCreation } from '../model/creations'
import { readRoboticsSection, writeRoboticsSection, type RoboticsConnection, type RoboticsSection, type TestSpace } from '../model/section'
import { isDevicePart, roboticsSpec } from '../parts/catalog'
import { mergeRoboticsHistory } from '../program/programs'
import { overlappingBricks } from '../model/blocked'
import { brickOriginFor } from '../model/grid'
import { ADD_A_MOTOR, MOTORS_GO_ON_THE_SIDES, planMotorToSide, planWheelFix, previewProblem, wheelProblemText } from '../model/fixPlans'
import { wheelSpins } from '../model/looseWheels'
import { deriveMechanisms } from '../model/mechanism'
import { NEAR_MISS_REACH_STUDS } from '../model/nearMiss'
import { placementAdvice } from '../model/placementAdvice'
import type { SnapPose } from '../model/snap'
import { socketOf, socketRoomOf } from '../model/socketRoom'
import { sideStepText } from '../drive/readiness'
import type { Vec3 } from '../model/vec'
import { lastDraftSnap, snapDraft } from '../scene/draftSnap'
import { sharedSnapContext } from '../scene/snapContext'
import { setHiddenBrickIds } from '../scene/hiddenBricks'
import type { ContactReport, HingeReport, Mechanics } from '../sim/mechanics'
import { useCodeView } from '../code/codeViewState'

/**
 * Robotics UI state beside the brick store. The document (bricks + the robotics
 * section) stays in the brick store, where autosave, undo and sharing already
 * live; this store holds what is derived from it and what is transient: the
 * derived model, the open card, the last assisted-wiring line and the running
 * mechanics nudge. Nothing here is persisted.
 */
export type RoboticsModel = {
  input: DeriveInput
  section: RoboticsSection
  creations: DerivedCreation[]
}

export type CardState = {
  /** Bricks of the component the card describes (a candidate until confirmed). */
  anchorBrickIds: string[]
  creationId: string | null
  suggestedName: string
  placedBrickId: string
  /**
   * A brick attached two creations (contract §4: "attaching them with a brick reopens the
   * card for the union"). `creationId` is the one that keeps its id; these join it on
   * either button. Their names, for the card's title.
   */
  joining?: { creationIds: string[]; names: string[] }
}

export type WiringNote = {
  text: string
  undoable: boolean
  nonce: number
  /** The history entry the line's wiring wrote, so Undo can tell whether it is still the latest edit. */
  entry: BrickHistoryEntry | null
  /** The cables that entry added, exactly as written, so Undo can remove them and nothing else. */
  added: RoboticsConnection[]
  /** The part the line is about when it is advice (not attached, bare ground), so the scene says it next to the part too. */
  brickId?: string
  /** One tap that fixes what the line is about ("Add a motor for it", "Put it on Buggy"); `guide/fixes.ts` runs it. */
  action?: NoteAction
  /** What is in the way of that fix, outlined in the scene. */
  blockers?: string[]
  /** Where the missing part would go, drawn red in the scene. */
  ghost?: { partId: string; pose: SnapPose } | null
  /** `done`: the line says a fix worked ("The wheel can spin now!"), shown in green beside the part. */
  tone?: 'done'
}

/** The one-tap fixes a line can offer (kid-UX lane W). Every one is a single Undo. */
export type NoteAction =
  | { kind: 'fix-wheel'; brickId: string; label: string }
  | { kind: 'put-on'; brickId: string; creationId: string; label: string }
  | { kind: 'motor-to-side'; brickId: string; label: string }
  | { kind: 'arm-plate'; label: string }

/** The button that arms the robot plate (`ROBOT_PLATE_PART`) when a fix needs a plate first. */
export const PUT_A_PLATE_DOWN = 'Put a plate down'

/**
 * Advice the fixes themselves set off (a wheel moved onto its axle is placed, a motor added for it
 * is placed): while a fix runs, placements wire and name as always but say nothing of their own;
 * the fix says what it did.
 */
let adviceMuted = 0
export function withAdviceMuted<T>(run: () => T): T {
  adviceMuted += 1
  try { return run() } finally { adviceMuted -= 1 }
}

export type SimState = {
  creationId: string
  mechanics: Mechanics
  hiddenBrickIds: ReadonlySet<string>
  /** The bricks reference the simulation was built from; any brick edit retires it. */
  bricks: BrickInstance[]
  /** Everything else the simulation was built from (cables, membership, run space, plate, parts); see `simBehaviorKey`. */
  behaviorKey: string
}

/** Asks the scene to frame these bricks inside the free canvas area (the layer measures the panels). */
export type FrameRequest = {
  brickIds: string[]
  nonce: number
  /** Extra world points to keep in view (where a creation is about to drive). */
  points?: Vec3[]
  /** Frame the bricks alone, filling most of the free area (a kit just placed, back to build; lane P). */
  snug?: boolean
}

export type RoboticsState = {
  model: RoboticsModel
  card: CardState | null
  wiringNote: WiringNote | null
  sim: SimState | null
  simLoading: boolean
  frameRequest: FrameRequest | null
  contacts: ContactReport[]
  hingeReports: Record<string, HingeReport>
  motorAngles: Record<string, number>
  refreshModel: () => void
  handlePlacement: (brickId: string) => void
  openCardFor: (creationId: string) => void
  /** A placement attached two or more creations: the card for their union (the first keeps its id). */
  openJoinCard: (creations: DerivedCreation[], component: string[], placedBrickId: string) => void
  closeCard: () => void
  confirmCard: (name: string, thenCode: boolean) => void
  renameCreation: (creationId: string, name: string) => void
  setTestSpace: (creationId: string, space: TestSpace) => void
  requestFrame: (brickIds: string[], points?: Vec3[], options?: { snug?: boolean }) => void
  dismissWiringNote: () => void
  undoWiring: () => void
  startSim: (creationId: string) => Promise<void>
  nudgeMotor: (motorId: string, power: number) => void
  nudgeHinge: (hingeId: string, degrees: number) => void
  driveForward: (creationId: string, power: number) => void
  stopAll: () => void
  resetSim: () => void
  publishSimReports: (contacts: ContactReport[], hingeReports: Record<string, HingeReport>, motorAngles: Record<string, number>) => void
  /** A placement was refused: when the ghost was snapped to a connector, name what is in the way. */
  explainBlockedPlacement: () => void
  /** A wheel that can't spin: the line on it, with the one tap that makes it spin. */
  adviseWheel: (wheelId: string) => void
  /** A motor whose socket is over its plate: "Motors go on the sides…", with the one tap that moves it there. */
  adviseMotorSide: (motorId: string, robotBrickIds?: readonly string[]) => void
  /** Drops the line once what it is about is fixed some other way (the wheel spins, the part is on, the motor faces out). */
  settleWiringNote: () => void
  /**
   * On a touch screen (no pointer to follow), a motor ghost resting on a robot's hub or another of its
   * parts (armed where the camera looks, or re-armed on top of the motor just placed) goes to a side of
   * that robot's plate, as a tap there would take it: a drive motor is never offered on top of the hub
   * (kid-UX lane W, Sam on the iPad). With a mouse the ghost follows the pointer, which does the same.
   */
  settleMotorGhost: () => void
}

const WIRING_LABEL_PREFIX = 'Connect '

/** Studs a nudge is framed for, ahead of and behind a creation that can drive (a 40 % nudge rolls about 8 in 2.6 s). */
const NUDGE_TRAVEL_STUDS = 9

function travelPoints(input: DeriveInput, creation: DerivedCreation): Vec3[] {
  const forward = creation.drivePair?.forward
  if (!forward) return []
  const bricks = input.bricks.filter((brick) => creation.brickIds.includes(brick.id))
  if (!bricks.length) return []
  const origins = bricks.map((brick) => brickOriginFor(brick, input.partMap[brick.partId], input.plateSize))
  const center = { x: origins.reduce((sum, point) => sum + point.x, 0) / origins.length, y: 0, z: origins.reduce((sum, point) => sum + point.z, 0) / origins.length }
  const reach = NUDGE_TRAVEL_STUDS * STUD
  return [1, -1].map((sign) => ({ x: center.x + forward.x * reach * sign, y: 0, z: center.z + forward.z * reach * sign }))
}

export function computeModel(state: Pick<BrickState, 'bricks' | 'documentMetadata'>): RoboticsModel {
  const section = readRoboticsSection(state.documentMetadata.robotics)
  const input: DeriveInput = { bricks: state.bricks, partMap: createPartMap(state.documentMetadata.customParts ?? []), plateSize: getBuildPlateSize(state.documentMetadata), section }
  return { input, section, creations: deriveCreations(input) }
}

/**
 * What a running simulation depends on besides the bricks: cables (which motors are
 * powered), creation membership and run space (which bodies exist and which are
 * anchored), the plate and the part shapes. Names are left out on purpose: renaming
 * a creation or a device while a nudge runs is not an edit of the construction.
 */
export function simBehaviorKey(state: Pick<BrickState, 'documentMetadata'>): string {
  const section = readRoboticsSection(state.documentMetadata.robotics)
  return JSON.stringify({
    plateSize: getBuildPlateSize(state.documentMetadata),
    customParts: state.documentMetadata.customParts ?? [],
    creations: section.creations.map((creation) => [creation.id, creation.anchorBrickIds, creation.testSpace ?? null]),
    connections: section.connections,
  })
}

function writeSection(section: RoboticsSection, label: string) {
  useBrickStore.getState().setRoboticsSection(writeRoboticsSection(section), label)
}

const sameCable = (a: RoboticsConnection, b: RoboticsConnection) => a.deviceId === b.deviceId && a.hubId === b.hubId && a.port === b.port

const creationId = () => `creation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

/**
 * Every `startSim` and `resetSim` advances this; a start that finds the generation
 * moved on after one of its awaits was cancelled (Reset, a construction edit, a
 * scene exit or a newer start) and must publish nothing.
 */
let simGeneration = 0

export const useRoboticsStore = create<RoboticsState>((set, get) => ({
  model: computeModel(useBrickStore.getState()),
  card: null,
  wiringNote: null,
  sim: null,
  simLoading: false,
  frameRequest: null,
  contacts: [],
  hingeReports: {},
  motorAngles: {},

  refreshModel: () => set({ model: computeModel(useBrickStore.getState()) }),

  /**
   * A robotics device was just placed (contract §4, §5). Assisted wiring connects it
   * to a hub in its component. The first device on bricks that are not a creation
   * opens the creation card for that component and frames it; a device joining a
   * saved creation does not reopen the card — the wiring line reports the cable and
   * the creation panel already lists the part — so naming never interrupts building.
   */
  handlePlacement: (brickId) => {
    const brickState = useBrickStore.getState()
    const brick = brickState.bricks.find((candidate) => candidate.id === brickId)
    if (!brick) return
    let model = computeModel(brickState)
    const component = creationComponent(model.input, brick.id)
    // Every saved creation this brick's component now reaches. Two or more: the brick joined them.
    const reached = model.creations.filter((creation) => creation.brickIds.some((id) => component.includes(id)))
    const joining = reached.length > 1
    if (!isDevicePart(brick.partId)) {
      const role = roboticsSpec(brick.partId)?.role
      if (joining) get().openJoinCard(reached, component, brick.id)
      // A wheel that can't spin says so the moment it lands, with the one tap that fixes it (kid-UX lane W).
      else if (!adviceMuted && role === 'wheel') get().adviseWheel(brick.id)
      // A seat beside a robot but not on it: "This seat isn't on Buggy yet." [Put it on top] (Ava).
      else if (!adviceMuted && role === 'seat' && !reached.length) {
        const pending = get().card
        const robots = pending && !pending.creationId ? [...model.creations, { id: 'candidate', name: pending.suggestedName, brickIds: pending.anchorBrickIds }] : model.creations
        const advice = placementAdvice(model.input, robots, brick.id, component)
        if (advice?.kind === 'not-attached') {
          const action: NoteAction | null = advice.fix?.ok ? { kind: 'put-on', brickId: brick.id, creationId: advice.creationId, label: advice.fix.label } : null
          set({ wiringNote: { text: advice.text, undoable: false, nonce: Date.now(), entry: null, added: [], brickId: brick.id, ...(action ? { action } : {}), ...(advice.fix && !advice.fix.ok ? { blockers: advice.fix.blockers } : {}) } })
        }
      }
      return
    }
    const existing = joining ? null : reached[0] ?? null
    const spec = roboticsSpec(brick.partId)!
    // A device beside a robot but not on it says so and starts no second robot; a motor on the
    // bare ground says why it cannot take a wheel (docs/robotics/KID-UX.md §S).
    const pending = get().card
    const robots = pending && !pending.creationId ? [...model.creations, { id: 'candidate', name: pending.suggestedName, brickIds: pending.anchorBrickIds }] : model.creations
    const advice = existing || joining ? null : placementAdvice(model.input, robots, brick.id, component)
    if (advice?.kind === 'not-attached') {
      if (!adviceMuted) {
        // "This motor isn't on Buggy yet." and one tap puts it on (kid-UX lane W).
        const fix = advice.fix
        const action: NoteAction | null = fix?.ok ? { kind: 'put-on', brickId: brick.id, creationId: advice.creationId, label: fix.label } : advice.needsPlate ? { kind: 'arm-plate', label: PUT_A_PLATE_DOWN } : null
        set({ wiringNote: { text: advice.text, undoable: false, nonce: Date.now(), entry: null, added: [], brickId: brick.id, ...(action ? { action } : {}), ...(fix && !fix.ok ? { blockers: fix.blockers } : {}) } })
      }
      return
    }

    let section = model.section
    const lines: string[] = []
    const added: RoboticsConnection[] = []
    let refusal: string | null = null
    if (section.settings.wiring === 'assisted') {
      const componentBricks = component.map((id) => brickState.bricks.find((candidate) => candidate.id === id)!)
      const hubIds = componentBricks.filter((candidate) => roboticsSpec(candidate.partId)?.role === 'hub').map((candidate) => candidate.id)
      // A hub arriving powers the parts already waiting for it; any other device asks the hub for a port.
      const devices = spec.role === 'hub'
        ? componentBricks.filter((candidate) => candidate.id !== brick.id && isDevicePart(candidate.partId) && roboticsSpec(candidate.partId)?.role !== 'hub')
        : [brick]
      for (const device of devices) {
        const plan = planAssistedConnection(section, device, hubIds, new Set(brickState.bricks.map((candidate) => candidate.id)))
        if (plan.ok) {
          section = connect(section, device.id, plan.hubId, plan.port)
          added.push({ deviceId: device.id, hubId: plan.hubId, port: plan.port })
          lines.push(`${deviceName(model.input, device)} connected to port ${plan.port}`)
        } else if (plan.reason === 'no-hub') refusal = `${deviceName(model.input, device)} needs a hub. Add a hub to plug it in.`
        else if (plan.reason === 'ports-full') refusal = `The hub is full. Unplug something to plug in ${deviceName(model.input, device)}.`
      }
    } else if (spec.role !== 'hub') refusal = `${deviceName(model.input, brick)} isn't plugged in yet. Pick it to plug it in.`
    if (lines.length) {
      if (existing) {
        // The same write refreshes the creation's anchors to its whole component (section.ts:
        // removing any one part later never dissolves it). No extra history entry for that.
        const record = section.creations.find((creation) => creation.id === existing.id)
        if (record) {
          const anchors = [...new Set([...record.anchorBrickIds, ...anchorableBrickIds(model.input, component)])]
          section = { ...section, creations: section.creations.map((creation) => (creation.id === existing.id ? { ...creation, anchorBrickIds: anchors } : creation)) }
        }
      }
      writeSection(section, `${WIRING_LABEL_PREFIX}${lines.length === 1 ? lines[0] : `${lines.length} parts`}`)
      model = computeModel(useBrickStore.getState())
      set({ wiringNote: { text: lines.join(' · '), undoable: true, nonce: Date.now(), entry: useBrickStore.getState().undoStack.at(-1) ?? null, added } })
    } else if (refusal) {
      set({ wiringNote: { text: advice?.text ?? refusal, undoable: false, nonce: Date.now(), entry: null, added: [], ...(advice ? { brickId: brick.id } : {}) } })
    }
    // A motor away from the sides of its plate: its socket is over the plate, so no axle can go in (kid-UX lane W).
    if (spec.role === 'motor' && !adviceMuted) get().adviseMotorSide(brick.id, component)

    if (joining) {
      set({ model })
      get().openJoinCard(reached, component, brick.id)
      return
    }
    if (existing) {
      set({ model })
      return
    }
    const candidate = deriveCreations({ ...model.input, section: { ...model.section, creations: [{ id: 'candidate', name: '', anchorBrickIds: component }] } })[0]
    const suggestedName = defaultCreationName(candidate.kind, model.section.creations.map((creation) => creation.name))
    set({ model, card: { anchorBrickIds: component, creationId: null, suggestedName, placedBrickId: brick.id } })
    get().requestFrame(component)
  },

  openJoinCard: (creations, component, placedBrickId) => {
    const [keeper, ...others] = creations
    set({ card: { anchorBrickIds: component, creationId: keeper.id, suggestedName: keeper.name, placedBrickId, joining: { creationIds: others.map((creation) => creation.id), names: creations.map((creation) => creation.name) } } })
    get().requestFrame(component)
  },

  openCardFor: (id) => {
    const creation = get().model.creations.find((candidate) => candidate.id === id)
    if (!creation) return
    set({ card: { anchorBrickIds: creation.brickIds, creationId: creation.id, suggestedName: creation.name, placedBrickId: creation.brickIds[0] ?? '' } })
    get().requestFrame(creation.brickIds)
  },
  closeCard: () => set({ card: null }),

  confirmCard: (name, thenCode) => {
    const { card, model } = get()
    if (!card) return
    const trimmed = name.trim() || card.suggestedName
    let section = model.section
    let id = card.creationId
    if (id && card.joining) {
      // One creation from here on: the keeper takes every anchor and every program; the others' records go.
      const keeperId = id
      const joined = new Set(card.joining.creationIds)
      const records = section.creations.filter((creation) => creation.id === keeperId || joined.has(creation.id))
      const anchors = [...new Set([...records.flatMap((creation) => creation.anchorBrickIds), ...anchorableBrickIds(model.input, card.anchorBrickIds)])]
      const keeperRecord = records.find((creation) => creation.id === keeperId)
      const activeProgramId = keeperRecord?.activeProgramId ?? records.find((creation) => creation.activeProgramId)?.activeProgramId
      section = {
        ...section,
        creations: section.creations
          .filter((creation) => !joined.has(creation.id))
          .map((creation) => (creation.id === keeperId ? { ...creation, name: trimmed, anchorBrickIds: anchors, ...(activeProgramId ? { activeProgramId } : {}) } : creation)),
        programs: section.programs.map((program) => (joined.has(program.creationId) ? { ...program, creationId: keeperId } : program)),
      }
      writeSection(section, `Join ${card.joining.names.join(' and ')}`)
    } else if (id) {
      section = { ...section, creations: section.creations.map((creation) => (creation.id === id ? { ...creation, name: trimmed, anchorBrickIds: [...new Set([...creation.anchorBrickIds, ...anchorableBrickIds(model.input, card.anchorBrickIds)])] } : creation)) }
      writeSection(section, 'Rename creation')
    } else {
      id = creationId()
      section = { ...section, creations: [...section.creations, { id, name: trimmed, anchorBrickIds: anchorableBrickIds(model.input, card.anchorBrickIds) }] }
      writeSection(section, `Name creation ${trimmed}`)
    }
    set({ card: null, model: computeModel(useBrickStore.getState()) })
    if (thenCode) useCodeView.getState().openCode(id)
  },

  renameCreation: (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const { section } = get().model
    writeSection({ ...section, creations: section.creations.map((creation) => (creation.id === id ? { ...creation, name: trimmed } : creation)) }, 'Rename creation')
  },

  setTestSpace: (id, space) => {
    const { section } = get().model
    // Stop and discard the run before the edit lands; the watcher would retire it anyway.
    get().resetSim()
    writeSection({ ...section, creations: section.creations.map((creation) => (creation.id === id ? { ...creation, testSpace: space } : creation)) }, `Run ${space === 'testPlate' ? 'on the test plate' : 'in my world'}`)
  },

  requestFrame: (brickIds, points, options) => set((state) => ({ frameRequest: { brickIds: [...brickIds], nonce: (state.frameRequest?.nonce ?? 0) + 1, ...(points?.length ? { points: points.map((point) => ({ ...point })) } : {}), ...(options?.snug ? { snug: true } : {}) } })),

  dismissWiringNote: () => set({ wiringNote: null }),

  /**
   * Undo on the wiring line removes the cables that line added and nothing else. While
   * the wiring is still the latest edit that is a plain history undo (the cable comes
   * back with Redo). Once something else was recorded on top — a rename, a move, the
   * card confirming the creation — undoing history would take that edit too, so the
   * cables are unplugged as a fresh edit instead, matched exactly as they were written.
   */
  undoWiring: () => {
    const note = get().wiringNote
    set({ wiringNote: null })
    if (!note?.undoable) return
    const brickState = useBrickStore.getState()
    if (note.entry && brickState.undoStack.at(-1) === note.entry) {
      brickState.undo()
      return
    }
    const section = readRoboticsSection(brickState.documentMetadata.robotics)
    const stillThere = note.added.filter((cable) => section.connections.some((connection) => sameCable(connection, cable)))
    if (!stillThere.length) return
    const names = stillThere.map((cable) => {
      const device = brickState.bricks.find((candidate) => candidate.id === cable.deviceId)
      return device ? deviceName(get().model.input, device) : 'a part'
    })
    writeSection({ ...section, connections: section.connections.filter((connection) => !stillThere.some((cable) => sameCable(connection, cable))) }, `Unplug ${names.length === 1 ? names[0] : `${names.length} parts`}`)
  },

  startSim: async (id) => {
    get().resetSim()
    const token = simGeneration
    const cancelled = () => token !== simGeneration
    set({ simLoading: true })
    try {
      const rapier = await import('@dimforge/rapier3d-compat')
      if (cancelled()) return
      await rapier.init()
      if (cancelled()) return
      const { createMechanics } = await import('../sim/mechanics')
      if (cancelled()) return
      // From here nothing yields: the simulation is built from the document as it is now and published in the same tick.
      const brickState = useBrickStore.getState()
      const model = computeModel(brickState)
      const creation = model.creations.find((candidate) => candidate.id === id)
      if (!creation) return
      const mechanics = createMechanics({ rapier, bricks: brickState.bricks, partMap: model.input.partMap, plateSize: model.input.plateSize, creation })
      setHiddenBrickIds(mechanics.simulatedBrickIds)
      set({ sim: { creationId: id, mechanics, hiddenBrickIds: mechanics.simulatedBrickIds, bricks: brickState.bricks, behaviorKey: simBehaviorKey(brickState) }, model, contacts: [], hingeReports: {}, motorAngles: {} })
      // A creation that can drive gets framed with room ahead and behind, so it never rolls under a panel.
      if (creation.drivePair) get().requestFrame(creation.brickIds, travelPoints(model.input, creation))
    } finally {
      // A cancelled or superseded start no longer owns the loading flag.
      if (!cancelled()) set({ simLoading: false })
    }
  },
  nudgeMotor: (motorId, power) => {
    const { sim } = get()
    if (!sim) return
    if (!sim.mechanics.setMotorPower(motorId, power)) useBrickStore.setState({ toast: 'That motor is not plugged in, so nothing happens.' })
  },
  nudgeHinge: (hingeId, degrees) => {
    const { sim, model } = get()
    if (!sim) return
    if (!sim.mechanics.setHingeTarget(hingeId, degrees)) {
      const hinge = model.creations.flatMap((creation) => creation.hinges).find((candidate) => candidate.brickId === hingeId)
      useBrickStore.setState({ toast: hinge?.locked ? 'The arm is built into the frame, so it cannot swing.' : 'That hinge motor is not plugged in, so nothing happens.' })
    }
  },
  driveForward: (id, power) => {
    const { sim, model } = get()
    const creation = model.creations.find((candidate) => candidate.id === id)
    if (!sim || !creation?.drivePair) return
    // Every motor that drives (a four-wheel car's four), each flipped when it faces the other way.
    const sides = creation.driveSides ?? { left: [creation.drivePair.leftId], right: [creation.drivePair.rightId], reversedIds: creation.drivePair.reversedIds }
    const reversed = new Set(sides.reversedIds)
    for (const motorId of [...sides.left, ...sides.right]) sim.mechanics.setMotorPower(motorId, reversed.has(motorId) ? -power : power)
  },
  stopAll: () => get().sim?.mechanics.stopAll(),
  /** Discards the running simulation and cancels any start still in flight. The document is untouched. */
  resetSim: () => {
    simGeneration += 1
    const { sim, simLoading } = get()
    if (sim) sim.mechanics.dispose()
    setHiddenBrickIds(null)
    if (sim || simLoading) set({ sim: null, simLoading: false, contacts: [], hingeReports: {}, motorAngles: {} })
  },
  publishSimReports: (contacts, hingeReports, motorAngles) => set({ contacts, hingeReports, motorAngles }),

  explainBlockedPlacement: () => {
    const brickState = useBrickStore.getState()
    const draft = brickState.draft
    const snap = lastDraftSnap()
    const { input } = computeModel(brickState)
    const others = brickState.movingId ? brickState.bricks.filter((brick) => brick.id !== brickState.movingId) : brickState.bricks
    if (!draft || !snap || snap.partId !== draft.partId || snap.pose.x !== draft.x || snap.pose.y !== draft.y || snap.pose.z !== draft.z || snap.pose.rotation !== draft.rotation) {
      // Not at a connector: a robot part's refusal says the same few words as the red ghost (kid-UX lane W).
      const problem = draft && (brickState.movingSelection?.originals.length ?? 1) <= 1 ? previewProblem({ ...input, bricks: others }, draft, null) : null
      if (problem) useBrickStore.setState({ toast: problem.text })
      return
    }
    const target = others.find((brick) => brick.id === snap.targetBrickId)
    const blockers = overlappingBricks(draft, others, input.partMap)
    if (!target || !blockers.length) return
    const nameOf = (brick: BrickInstance) => (isDevicePart(brick.partId) ? deviceName(input, brick) : input.partMap[brick.partId]?.name ?? 'a brick')
    const spec = roboticsSpec(draft.partId)
    if (spec?.socket) {
      // A motor snapped onto a plate's side with no room left there: the same words as the red ghost's line.
      const problem = previewProblem({ ...input, bricks: others }, draft, null, snap.kind)
      const named = `${blockers.slice(0, 2).map(nameOf).join(' and ')} ${blockers.length > 1 ? 'are' : 'is'} in the way.`
      useBrickStore.setState({ toast: problem?.text === 'A wheel is in the way.' ? problem.text : `No room on the plate. ${named}` })
      return
    }
    const what = spec?.axle ? 'The axle' : 'The wheel'
    const fix = roboticsSpec(target.partId)?.socket ? ' Turn or move the motor so its socket faces open space.' : ' Move it so the end has open space.'
    useBrickStore.setState({ toast: `${what} can't go there. ${blockers.slice(0, 2).map(nameOf).join(' and ')} ${blockers.length > 1 ? 'are' : 'is'} in the way.${fix}` })
  },

  adviseWheel: (wheelId) => {
    const { input } = computeModel(useBrickStore.getState())
    const mechanisms = deriveMechanisms(input.bricks, input.partMap, input.plateSize)
    const spin = wheelSpins(mechanisms).find((wheel) => wheel.wheelId === wheelId)
    if (!spin || spin.spins) return
    const fix = planWheelFix(input, wheelId, mechanisms)
    // With no room the button still says what it would do; pressing it says why not and outlines what is in the way.
    const action: NoteAction = fix.ok ? { kind: 'fix-wheel', brickId: wheelId, label: fix.label } : fix.reason === 'no-plate' ? { kind: 'arm-plate', label: PUT_A_PLATE_DOWN } : { kind: 'fix-wheel', brickId: wheelId, label: ADD_A_MOTOR }
    set({ wiringNote: { text: wheelProblemText(mechanisms, wheelId, NEAR_MISS_REACH_STUDS * STUD), undoable: false, nonce: Date.now(), entry: null, added: [], brickId: wheelId, action } })
  },

  adviseMotorSide: (motorId, robotBrickIds) => {
    const { input } = computeModel(useBrickStore.getState())
    const motor = input.bricks.find((brick) => brick.id === motorId)
    const socket = motor ? socketOf(motor, input.partMap, input.plateSize) : null
    if (!motor || !socket) return
    // In the middle of the plate or on the hub it moves; turned around, or facing the front or the back, it turns.
    const room = socketRoomOf(motor, input.bricks, input.partMap, input.plateSize)
    const crossways = room === 'open' && facesShortEnd(motor, socket.normal, input)
    if (room !== 'covered' && room !== 'high' && room !== 'facing-in' && !crossways) return
    const text = room === 'covered' || room === 'high' ? MOTORS_GO_ON_THE_SIDES : sideStepText({ name: deviceName(input, motor), socketRoom: room, crossways })
    const fix = planMotorToSide(input, motorId, robotBrickIds ? { brickIds: [...robotBrickIds] } : null)
    if (fix.ok) set({ wiringNote: { text, undoable: false, nonce: Date.now(), entry: null, added: [], brickId: motorId, action: { kind: 'motor-to-side', brickId: motorId, label: fix.label } } })
    else if (fix.reason !== 'nothing') set({ wiringNote: { text: `${text} ${fix.text}`, undoable: false, nonce: Date.now(), entry: null, added: [], brickId: motorId, blockers: fix.blockers } })
  },

  settleMotorGhost: () => {
    const brickState = useBrickStore.getState()
    const draft = brickState.draft
    if (!draft || brickState.mode !== 'build' || roboticsSpec(draft.partId)?.role !== 'motor' || (brickState.movingSelection?.originals.length ?? 0) > 1) return
    if (!noHover()) return
    const { partMap, plateSize } = get().model.input
    const part = partMap[draft.partId]
    if (!part) return
    const others = brickState.movingId ? brickState.bricks.filter((brick) => brick.id !== brickState.movingId) : brickState.bricks
    const size = rotatedSize(part, draft.rotation)
    const own = { x0: draft.x, x1: draft.x + size.width, z0: draft.z, z1: draft.z + size.depth }
    // The part it rests on: not a plate (a plate is a motor's place), but a robot's hub, motor or brick.
    const under = others.find((brick) => {
      const brickPart = partMap[brick.partId]
      if (!brickPart || brickPart.kind === 'plate' || brick.y + brickPart.height !== draft.y) return false
      const rect = { x0: brick.x, x1: brick.x + rotatedSize(brickPart, brick.rotation).width, z0: brick.z, z1: brick.z + rotatedSize(brickPart, brick.rotation).depth }
      return own.x0 < rect.x1 && rect.x0 < own.x1 && own.z0 < rect.z1 && rect.z0 < own.z1
    })
    if (!under || !sharedSnapContext(others, partMap, plateSize).robotPlateOf(under.id)) return
    const at = { x: (draft.x + size.width / 2 - plateSize / 2) * STUD, y: draft.y * PLATE_HEIGHT, z: (draft.z + size.depth / 2 - plateSize / 2) * STUD }
    const snapped = snapDraft(draft, under, at, others, plateSize)
    if (!snapped) return
    for (let turn = 0; turn < 4 && useBrickStore.getState().draft?.rotation !== snapped.rotation; turn += 1) useBrickStore.getState().rotate()
    useBrickStore.getState().setDraftPosition(snapped.x, snapped.y, snapped.z)
  },

  settleWiringNote: () => {
    const note = get().wiringNote
    const action = note?.action
    if (!note || !action) return
    if (action.kind === 'arm-plate') {
      // A wheel that needed a plate first: once there is one, its line offers the motor instead.
      const wheel = note.brickId ? get().model.input.bricks.find((brick) => brick.id === note.brickId) : null
      if (wheel && roboticsSpec(wheel.partId)?.role === 'wheel') get().adviseWheel(wheel.id)
      return
    }
    const { input, creations } = get().model
    const brick = input.bricks.find((candidate) => candidate.id === action.brickId)
    if (!brick) { set({ wiringNote: null }); return }
    let settled = false
    if (action.kind === 'fix-wheel') settled = wheelSpins(deriveMechanisms(input.bricks, input.partMap, input.plateSize)).some((wheel) => wheel.wheelId === brick.id && wheel.spins)
    else if (action.kind === 'put-on') settled = creations.some((creation) => creation.brickIds.includes(brick.id))
    else if (action.kind === 'motor-to-side') {
      const socket = socketOf(brick, input.partMap, input.plateSize)
      settled = socketRoomOf(brick, input.bricks, input.partMap, input.plateSize) === 'open' && Boolean(socket) && !facesShortEnd(brick, socket!.normal, input)
    }
    if (settled) set({ wiringNote: null })
  },
}))

let watcherInstalled = false
let ghostCheckQueued = false

/** A touch screen: nothing hovers, so a ghost stays where it was put until a tap moves it. */
const noHover = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(hover: none)').matches)

/**
 * Keeps the derived model in step with the document and reacts to placements.
 * Installed once by the panel; placements are recognised by the brick store's
 * `placeFeedback` nonce, which only a real placement advances (undo, redo, import
 * and restore do not), so a device coming back through Undo is not re-wired.
 */
export function installRoboticsWatcher() {
  if (watcherInstalled) return
  watcherInstalled = true
  // Studio Undo/Redo restores construction and cables but never reverts programs (CP2-PLAN §1).
  registerRoboticsHistoryMerge(mergeRoboticsHistory)
  useBrickStore.subscribe((state, previous) => {
    const robotics = useRoboticsStore.getState()
    const bricksChanged = state.bricks !== previous.bricks
    if (bricksChanged || state.documentMetadata !== previous.documentMetadata) {
      robotics.refreshModel()
      // A line about a part that is gone (Undo, Delete) no longer applies; nor does a fix for something already fixed.
      if (robotics.wiringNote?.brickId && !state.bricks.some((brick) => brick.id === robotics.wiringNote?.brickId)) robotics.dismissWiringNote()
      else useRoboticsStore.getState().settleWiringNote()
      // An edit while a nudge runs, or is still starting, retires it: the construction, never
      // the simulation, is the truth. A change that leaves the behaviour key alone (a rename)
      // is not such an edit.
      if (robotics.sim || robotics.simLoading) {
        const baseline = robotics.sim ? robotics.sim.behaviorKey : simBehaviorKey(previous)
        if (bricksChanged || simBehaviorKey(state) !== baseline) robotics.resetSim()
      }
      if (robotics.card && !robotics.card.creationId && !robotics.card.anchorBrickIds.every((id) => state.bricks.some((brick) => brick.id === id))) robotics.closeCard()
    }
    if (state.placeFeedback && state.placeFeedback !== previous.placeFeedback) robotics.handlePlacement(state.placeFeedback.id)
    // Checked once the studio's own action is done (a part armed and turned and moved in one go is judged where it ends up).
    if (state.draft && state.draft !== previous.draft && !ghostCheckQueued) {
      ghostCheckQueued = true
      queueMicrotask(() => {
        ghostCheckQueued = false
        useRoboticsStore.getState().settleMotorGhost()
      })
    }
    if (state.blockedNonce !== previous.blockedNonce) robotics.explainBlockedPlacement()
    if (state.mode !== previous.mode && state.mode !== 'build') robotics.resetSim()
  })
}

/** For tests: forget the watcher so a fresh store can install it again. */
export function resetRoboticsWatcherForTests() {
  watcherInstalled = false
}
