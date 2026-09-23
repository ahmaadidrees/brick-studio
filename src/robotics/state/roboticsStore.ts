import { create } from 'zustand'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { createPartMap } from '../../brick/parts'
import { registerRoboticsHistoryMerge, useBrickStore, type BrickHistoryEntry, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { connect, planAssistedConnection } from '../model/control'
import { anchorableBrickIds, creationComponent, defaultCreationName, deriveCreations, deviceName, type DeriveInput, type DerivedCreation } from '../model/creations'
import { readRoboticsSection, writeRoboticsSection, type RoboticsConnection, type RoboticsSection, type TestSpace } from '../model/section'
import { isDevicePart, roboticsSpec } from '../parts/catalog'
import { mergeRoboticsHistory } from '../program/programs'
import { overlappingBricks } from '../model/blocked'
import { lastDraftSnap } from '../scene/draftSnap'
import { setHiddenBrickIds } from '../scene/hiddenBricks'
import type { ContactReport, HingeReport, Mechanics } from '../sim/mechanics'

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
}

export type WiringNote = {
  text: string
  undoable: boolean
  nonce: number
  /** The history entry the line's wiring wrote, so Undo can tell whether it is still the latest edit. */
  entry: BrickHistoryEntry | null
  /** The cables that entry added, exactly as written, so Undo can remove them and nothing else. */
  added: RoboticsConnection[]
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
export type FrameRequest = { brickIds: string[]; nonce: number }

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
  closeCard: () => void
  confirmCard: (name: string, thenCode: boolean) => void
  renameCreation: (creationId: string, name: string) => void
  setTestSpace: (creationId: string, space: TestSpace) => void
  requestFrame: (brickIds: string[]) => void
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
}

const WIRING_LABEL_PREFIX = 'Connect '

function computeModel(state: Pick<BrickState, 'bricks' | 'documentMetadata'>): RoboticsModel {
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
    if (!brick || !isDevicePart(brick.partId)) return
    let model = computeModel(brickState)
    const component = creationComponent(model.input, brick.id)
    const existing = model.creations.find((creation) => creation.brickIds.some((id) => component.includes(id))) ?? null
    const spec = roboticsSpec(brick.partId)!

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
        } else if (plan.reason === 'no-hub') refusal = `${deviceName(model.input, device)} placed unpowered · add a hub to plug it in`
        else if (plan.reason === 'ports-full') refusal = `Ports A–D are full. Unplug something to plug in ${deviceName(model.input, device)}`
      }
    } else if (spec.role !== 'hub') refusal = `${deviceName(model.input, brick)} placed · plug it into a port in its panel`
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
      set({ wiringNote: { text: refusal, undoable: false, nonce: Date.now(), entry: null, added: [] } })
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
    if (id) {
      section = { ...section, creations: section.creations.map((creation) => (creation.id === id ? { ...creation, name: trimmed, anchorBrickIds: [...new Set([...creation.anchorBrickIds, ...anchorableBrickIds(model.input, card.anchorBrickIds)])] } : creation)) }
      writeSection(section, 'Rename creation')
    } else {
      id = creationId()
      section = { ...section, creations: [...section.creations, { id, name: trimmed, anchorBrickIds: anchorableBrickIds(model.input, card.anchorBrickIds) }] }
      writeSection(section, `Name creation ${trimmed}`)
    }
    set({ card: null, model: computeModel(useBrickStore.getState()) })
    if (thenCode) useBrickStore.setState({ toast: `${trimmed} is ready to code. The Code view arrives in checkpoint 2.` })
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

  requestFrame: (brickIds) => set((state) => ({ frameRequest: { brickIds: [...brickIds], nonce: (state.frameRequest?.nonce ?? 0) + 1 } })),

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
    const reversed = new Set(creation.drivePair.reversedIds)
    for (const motorId of [creation.drivePair.leftId, creation.drivePair.rightId]) sim.mechanics.setMotorPower(motorId, reversed.has(motorId) ? -power : power)
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
    if (!draft || !snap || snap.partId !== draft.partId || snap.pose.x !== draft.x || snap.pose.y !== draft.y || snap.pose.z !== draft.z || snap.pose.rotation !== draft.rotation) return
    const { input } = computeModel(brickState)
    const others = brickState.movingId ? brickState.bricks.filter((brick) => brick.id !== brickState.movingId) : brickState.bricks
    const target = others.find((brick) => brick.id === snap.hitBrickId)
    const blockers = overlappingBricks(draft, others, input.partMap)
    if (!target || !blockers.length) return
    const nameOf = (brick: BrickInstance) => (isDevicePart(brick.partId) ? deviceName(input, brick) : input.partMap[brick.partId]?.name ?? 'a brick')
    const spec = roboticsSpec(draft.partId)
    const fits = spec?.axle ? (roboticsSpec(target.partId)?.socket ? `fits ${nameOf(target)}'s socket` : `fits through the ${nameOf(target)}`) : `fits the axle end`
    const what = spec?.axle ? 'The axle' : 'The wheel'
    const fix = roboticsSpec(target.partId)?.socket ? ' Turn or move the motor so its socket faces open space.' : ' Move it so the end has open space.'
    useBrickStore.setState({ toast: `${what} ${fits}, but there it would overlap ${blockers.slice(0, 2).map(nameOf).join(' and ')}.${fix}` })
  },
}))

let watcherInstalled = false

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
    if (state.blockedNonce !== previous.blockedNonce) robotics.explainBlockedPlacement()
    if (state.mode !== previous.mode && state.mode !== 'build') robotics.resetSim()
  })
}

/** For tests: forget the watcher so a fresh store can install it again. */
export function resetRoboticsWatcherForTests() {
  watcherInstalled = false
}
