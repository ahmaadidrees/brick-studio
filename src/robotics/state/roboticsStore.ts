import { create } from 'zustand'
import { getBuildPlateSize } from '../../brick/buildPlate'
import { createPartMap } from '../../brick/parts'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { connect, planAssistedConnection } from '../model/control'
import { anchorableBrickIds, creationComponent, defaultCreationName, deriveCreations, deviceName, type DeriveInput, type DerivedCreation } from '../model/creations'
import { readRoboticsSection, writeRoboticsSection, type RoboticsSection, type TestSpace } from '../model/section'
import { isDevicePart, roboticsSpec } from '../parts/catalog'
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

export type WiringNote = { text: string; undoable: boolean; nonce: number }

export type SimState = {
  creationId: string
  mechanics: Mechanics
  hiddenBrickIds: ReadonlySet<string>
  /** The bricks reference the simulation was built from; any edit retires it. */
  bricks: BrickInstance[]
}

export type RoboticsState = {
  model: RoboticsModel
  card: CardState | null
  wiringNote: WiringNote | null
  sim: SimState | null
  simLoading: boolean
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
  dismissWiringNote: () => void
  undoWiring: () => void
  startSim: (creationId: string) => Promise<void>
  nudgeMotor: (motorId: string, power: number) => void
  nudgeHinge: (hingeId: string, degrees: number) => void
  driveForward: (creationId: string, power: number) => void
  stopAll: () => void
  resetSim: () => void
  publishSimReports: (contacts: ContactReport[], hingeReports: Record<string, HingeReport>, motorAngles: Record<string, number>) => void
}

const WIRING_LABEL_PREFIX = 'Connect '

function computeModel(state: Pick<BrickState, 'bricks' | 'documentMetadata'>): RoboticsModel {
  const section = readRoboticsSection(state.documentMetadata.robotics)
  const input: DeriveInput = { bricks: state.bricks, partMap: createPartMap(state.documentMetadata.customParts ?? []), plateSize: getBuildPlateSize(state.documentMetadata), section }
  return { input, section, creations: deriveCreations(input) }
}

function writeSection(section: RoboticsSection, label: string) {
  useBrickStore.getState().setRoboticsSection(writeRoboticsSection(section), label)
}

const creationId = () => `creation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export const useRoboticsStore = create<RoboticsState>((set, get) => ({
  model: computeModel(useBrickStore.getState()),
  card: null,
  wiringNote: null,
  sim: null,
  simLoading: false,
  contacts: [],
  hingeReports: {},
  motorAngles: {},

  refreshModel: () => set({ model: computeModel(useBrickStore.getState()) }),

  /**
   * A robotics device was just placed (contract §4, §5). Assisted wiring connects it
   * to a hub in its component; the first device on bricks that are not a creation
   * opens the creation card for that component.
   */
  handlePlacement: (brickId) => {
    const brickState = useBrickStore.getState()
    const brick = brickState.bricks.find((candidate) => candidate.id === brickId)
    if (!brick || !isDevicePart(brick.partId)) return
    let model = computeModel(brickState)
    const component = creationComponent(model.input, brick.id)
    const existing = model.creations.find((creation) => creation.brickIds.some((id) => component.includes(id))) ?? null
    const spec = roboticsSpec(brick.partId)!

    if (model.section.settings.wiring === 'assisted') {
      const componentBricks = component.map((id) => brickState.bricks.find((candidate) => candidate.id === id)!)
      const hubIds = componentBricks.filter((candidate) => roboticsSpec(candidate.partId)?.role === 'hub').map((candidate) => candidate.id)
      let section = model.section
      const lines: string[] = []
      // A hub arriving powers the parts already waiting for it; any other device asks the hub for a port.
      const devices = spec.role === 'hub'
        ? componentBricks.filter((candidate) => candidate.id !== brick.id && isDevicePart(candidate.partId) && roboticsSpec(candidate.partId)?.role !== 'hub')
        : [brick]
      let refusal: string | null = null
      for (const device of devices) {
        const plan = planAssistedConnection(section, device, hubIds)
        if (plan.ok) {
          section = connect(section, device.id, plan.hubId, plan.port)
          lines.push(`${deviceName(model.input, device)} connected to port ${plan.port}`)
        } else if (plan.reason === 'no-hub') refusal = `${deviceName(model.input, device)} placed unpowered · add a hub to plug it in`
        else if (plan.reason === 'ports-full') refusal = `Ports A–D are full. Unplug something to plug in ${deviceName(model.input, device)}`
      }
      if (lines.length) {
        writeSection(section, `${WIRING_LABEL_PREFIX}${lines.length === 1 ? lines[0] : `${lines.length} parts`}`)
        model = computeModel(useBrickStore.getState())
        set({ wiringNote: { text: lines.join(' · '), undoable: true, nonce: Date.now() } })
      } else if (refusal) {
        set({ wiringNote: { text: refusal, undoable: false, nonce: Date.now() } })
      }
    }

    if (existing) {
      set({ model, card: { anchorBrickIds: existing.brickIds, creationId: existing.id, suggestedName: existing.name, placedBrickId: brick.id } })
      return
    }
    const candidate = deriveCreations({ ...model.input, section: { ...model.section, creations: [{ id: 'candidate', name: '', anchorBrickIds: component }] } })[0]
    const suggestedName = defaultCreationName(candidate.kind, model.section.creations.map((creation) => creation.name))
    set({ model, card: { anchorBrickIds: component, creationId: null, suggestedName, placedBrickId: brick.id } })
  },

  openCardFor: (id) => {
    const creation = get().model.creations.find((candidate) => candidate.id === id)
    if (!creation) return
    set({ card: { anchorBrickIds: creation.brickIds, creationId: creation.id, suggestedName: creation.name, placedBrickId: creation.brickIds[0] ?? '' } })
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
    get().resetSim()
    writeSection({ ...section, creations: section.creations.map((creation) => (creation.id === id ? { ...creation, testSpace: space } : creation)) }, `Run ${space === 'testPlate' ? 'on the test plate' : 'in my world'}`)
  },

  dismissWiringNote: () => set({ wiringNote: null }),
  undoWiring: () => {
    const state = useBrickStore.getState()
    const top = state.undoStack.at(-1)
    if (top?.label.startsWith(WIRING_LABEL_PREFIX)) state.undo()
    set({ wiringNote: null })
  },

  startSim: async (id) => {
    get().resetSim()
    set({ simLoading: true })
    try {
      const rapier = await import('@dimforge/rapier3d-compat')
      await rapier.init()
      const brickState = useBrickStore.getState()
      const model = computeModel(brickState)
      const creation = model.creations.find((candidate) => candidate.id === id)
      if (!creation) return
      const { createMechanics } = await import('../sim/mechanics')
      const mechanics = createMechanics({ rapier, bricks: brickState.bricks, partMap: model.input.partMap, plateSize: model.input.plateSize, creation })
      setHiddenBrickIds(mechanics.simulatedBrickIds)
      set({ sim: { creationId: id, mechanics, hiddenBrickIds: mechanics.simulatedBrickIds, bricks: brickState.bricks }, model, contacts: [], hingeReports: {}, motorAngles: {} })
    } finally {
      set({ simLoading: false })
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
  resetSim: () => {
    const { sim } = get()
    if (!sim) return
    sim.mechanics.dispose()
    setHiddenBrickIds(null)
    set({ sim: null, contacts: [], hingeReports: {}, motorAngles: {} })
  },
  publishSimReports: (contacts, hingeReports, motorAngles) => set({ contacts, hingeReports, motorAngles }),
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
  useBrickStore.subscribe((state, previous) => {
    const robotics = useRoboticsStore.getState()
    if (state.bricks !== previous.bricks || state.documentMetadata !== previous.documentMetadata) {
      robotics.refreshModel()
      // An edit while a nudge runs retires the nudge: the construction, never the simulation, is the truth.
      if (robotics.sim && state.bricks !== robotics.sim.bricks) robotics.resetSim()
      if (robotics.card && !robotics.card.creationId && !robotics.card.anchorBrickIds.every((id) => state.bricks.some((brick) => brick.id === id))) robotics.closeCard()
    }
    if (state.placeFeedback && state.placeFeedback !== previous.placeFeedback) robotics.handlePlacement(state.placeFeedback.id)
    if (state.mode !== previous.mode && state.mode !== 'build') robotics.resetSim()
  })
}

/** For tests: forget the watcher so a fresh store can install it again. */
export function resetRoboticsWatcherForTests() {
  watcherInstalled = false
}
