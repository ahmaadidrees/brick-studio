import { create } from 'zustand'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import type { DerivedCreation } from '../model/creations'
import type { DeviceId, ProgramKey } from '../program/types'
import type { StageRunController } from '../run/controller'
import type { ProgramRuntime, RunObservation, RunSpace } from '../run/types'
import type { RapierModule } from '../sim/colliders'
import { computeModel, simBehaviorKey, useRoboticsStore } from './roboticsStore'

/**
 * The stage (CP2-PLAN §4, §7): one run controller for one creation in one space, and
 * the seam the Code view builds on. Nothing here is persisted and nothing writes the
 * document. The scene (`scene/StageLayer.tsx`) advances the controller every frame
 * and publishes `stageObservation` at about 10 Hz for React.
 *
 * - `openStage(creationId, space?)` builds a controller from the document as it is now
 *   (the space defaults to the creation's run space). Starting is async the first time
 *   (Rapier's import); a newer open, a close or an edit cancels one still in flight.
 * - `runOnStage(runtime)` starts a fresh program from the current pose; `stopStage()`
 *   brakes every motor and keeps the pose; `resetStage()` disposes and rebuilds at the
 *   built pose; `closeStage()` disposes.
 * - An edit of the construction, or any change of its behaviour key (cables, membership,
 *   run space, plate, parts), resets an open stage at the new built pose — the construction
 *   is the truth — or closes it when the creation is gone; leaving build mode closes it.
 *   Program and name edits do neither.
 */
export type StageSession = {
  creationId: string
  space: RunSpace
  /** False when the space came from the creation's own run space (a reset then follows it if it changes). */
  spaceChosen: boolean
  controller: StageRunController
  creation: DerivedCreation
  plateSize: number
  /** The bricks reference the controller was built from. */
  bricks: BrickInstance[]
  behaviorKey: string
  /** Increments on every (re)build, so a scene can remount cleanly. */
  generation: number
}

/** Why the stage was last rebuilt without being asked to (the Code view can say "Changed · the run was reset"). */
export type StageNotice = { reason: 'edit'; nonce: number } | null

export type StageState = {
  stage: StageSession | null
  stageLoading: boolean
  /** The controller's observation, throttled (~10 Hz while the scene runs; immediately after every stage action). */
  stageObservation: RunObservation | null
  stageNotice: StageNotice
  openStage: (creationId: string, space?: RunSpace) => Promise<void>
  runOnStage: (runtime: ProgramRuntime | null) => void
  stopStage: () => void
  resetStage: () => void
  closeStage: () => void
  triggerVisitor: () => void
  setStageKey: (key: ProgramKey, down: boolean) => void
  setStageJoystick: (up: number, right: number) => void
  setStageButton: (deviceId: DeviceId, down: boolean) => void
  /** The scene's throttled publish. */
  publishStageObservation: (observation: RunObservation) => void
}

/** Rapier (wasm) and the run code load on the first open, like the nudge's `startSim`; later rebuilds are synchronous. */
type StageModules = { rapier: RapierModule; run: typeof import('../run/controller') }
let modules: StageModules | null = null
async function loadModules(): Promise<StageModules> {
  if (modules) return modules
  const rapier = await import('@dimforge/rapier3d-compat')
  await rapier.init()
  const run = await import('../run/controller')
  modules = { rapier, run }
  return modules
}

/** Every open, reset and close advances this; an open that finds it moved on after an await was cancelled. */
let stageGeneration = 0
let pendingOpen: { creationId: string; space: RunSpace | undefined } | null = null

function build(creationId: string, space: RunSpace | undefined, { rapier, run }: StageModules): StageSession | null {
  const brickState = useBrickStore.getState()
  const model = computeModel(brickState)
  const saved = model.creations.find((creation) => creation.id === creationId)
  if (!saved) return null
  const resolved = space ?? saved.testSpace
  const creation = run.deriveCreationForSpace(model.input, creationId, resolved)
  if (!creation) return null
  const controller = run.createRunController({ rapier, bricks: brickState.bricks, partMap: model.input.partMap, plateSize: model.input.plateSize, creation, space: resolved })
  return { creationId, space: resolved, spaceChosen: space !== undefined, controller, creation, plateSize: model.input.plateSize, bricks: brickState.bricks, behaviorKey: simBehaviorKey(brickState), generation: stageGeneration }
}

/** Rebuilds the open stage synchronously at the built pose (Rapier is loaded once a stage has opened). */
function rebuild(notice: StageNotice) {
  const current = useStageStore.getState().stage
  if (!current || !modules) return
  stageGeneration += 1
  current.controller.dispose()
  const next = build(current.creationId, current.spaceChosen ? current.space : undefined, modules)
  useStageStore.setState({ stage: next, stageLoading: false, stageObservation: next ? next.controller.observe() : null, stageNotice: next ? notice : null })
}

export const useStageStore = create<StageState>((set, get) => {
  const publish = () => {
    const stage = get().stage
    set({ stageObservation: stage ? stage.controller.observe() : null })
  }

  return {
    stage: null,
    stageLoading: false,
    stageObservation: null,
    stageNotice: null,

    openStage: async (creationId, space) => {
      installStageWatcher()
      get().closeStage()
      // The nudge and the stage never share the scene.
      useRoboticsStore.getState().resetSim()
      const token = stageGeneration
      const cancelled = () => token !== stageGeneration
      pendingOpen = { creationId, space }
      set({ stageLoading: true })
      try {
        const loaded = await loadModules()
        if (cancelled()) return
        // From here nothing yields: the stage is built from the document as it is now.
        const session = build(creationId, space, loaded)
        set({ stage: session, stageObservation: session ? session.controller.observe() : null, stageNotice: null })
      } finally {
        if (!cancelled()) {
          pendingOpen = null
          set({ stageLoading: false })
        }
      }
    },
    runOnStage: (runtime) => {
      const stage = get().stage
      if (!stage) return
      stage.controller.run(runtime)
      set({ stageNotice: null })
      publish()
    },
    stopStage: () => {
      get().stage?.controller.stop()
      publish()
    },
    resetStage: () => rebuild(null),
    closeStage: () => {
      stageGeneration += 1
      pendingOpen = null
      const { stage, stageLoading } = get()
      stage?.controller.dispose()
      if (stage || stageLoading) set({ stage: null, stageLoading: false, stageObservation: null, stageNotice: null })
    },
    triggerVisitor: () => {
      get().stage?.controller.triggerVisitor()
      publish()
    },
    setStageKey: (key, down) => get().stage?.controller.setKey(key, down),
    setStageJoystick: (up, right) => get().stage?.controller.setJoystick(up, right),
    setStageButton: (deviceId, down) => {
      get().stage?.controller.setButton(deviceId, down)
    },
    publishStageObservation: (observation) => set({ stageObservation: observation }),
  }
})

let editNonce = 0

/** Called with each brick-store change while a stage is open or opening. */
function onDocumentChange(state: BrickState, previous: BrickState) {
  const stageState = useStageStore.getState()
  if (!stageState.stage && !stageState.stageLoading) return
  if (state.mode !== previous.mode && state.mode !== 'build') {
    stageState.closeStage()
    return
  }
  const bricksChanged = state.bricks !== previous.bricks
  if (!bricksChanged && state.documentMetadata === previous.documentMetadata) return
  const baseline = stageState.stage ? stageState.stage.behaviorKey : simBehaviorKey(previous)
  if (!bricksChanged && simBehaviorKey(state) === baseline) return
  if (!stageState.stage) {
    // Still opening: start again from the edited document (the generation token cancels the old start).
    const pending = pendingOpen
    if (pending) void stageState.openStage(pending.creationId, pending.space)
    return
  }
  if (!computeModel(state).creations.some((creation) => creation.id === stageState.stage!.creationId)) stageState.closeStage()
  else rebuild({ reason: 'edit', nonce: ++editNonce })
}

let watcherInstalled = false
/** Installed on the first `openStage`; idempotent. */
export function installStageWatcher() {
  if (watcherInstalled) return
  watcherInstalled = true
  useBrickStore.subscribe(onDocumentChange)
}

/** For tests: close any stage (the watcher stays installed). */
export function resetStageStoreForTests() {
  useStageStore.getState().closeStage()
}
