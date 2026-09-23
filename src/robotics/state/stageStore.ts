import { create } from 'zustand'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { lastTryKey, recordLastTry, startWatch, watchStep, type WalkWatch } from '../drive/tryOutcome'
import type { DerivedCreation } from '../model/creations'
import type { PartMap } from '../model/grid'
import { referencedDevices } from '../program/devices'
import { activeProgramOf } from '../program/programs'
import type { DeviceId, ProgramKey } from '../program/types'
import type { StageRunController } from '../run/controller'
import type { ProgramRuntime, RunObservation, RunSpace, TestProp } from '../run/types'
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
 * - `openStage(creationId, space, options)` (additive, the Drive view): `options.props` replaces
 *   `defaultProps` (a test plate course) and `options.freeBodies` leaves every body free in either
 *   space (in My world a robot built on the plate rolls off it, as a ride in Explore does). The
 *   options stay with the session, so a reset or an edit rebuilds the same stage.
 * - The walk-up test (kid lane Y): the visitor walks up to the sensor the active program reads;
 *   `triggerVisitor` first starts the program when the Code view has registered a runner
 *   (`setStageRunner`: a stage input tests the newest code, as Run would), then watches the walk
 *   (`walk`, `drive/tryOutcome.ts`) until it has a verdict, which is also kept per robot for
 *   the panel back in Build. A button part pressed on the stage starts the program the same way.
 */
export type StageGeometry = { bricks: readonly BrickInstance[]; partMap: PartMap; plateSize: number }

export type StageOptions = {
  /** The test props instead of `defaultProps`, computed on every (re)build from the creation as it runs. */
  props?: (creation: DerivedCreation, space: RunSpace, geometry: StageGeometry) => TestProp[]
  /** Every body free in either space (the creation is derived as on the test plate; My world keeps its scenery). */
  freeBodies?: boolean
}

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
  /** What `openStage` was given beyond the space (none for the Code view). */
  options?: StageOptions
}

/** Why the stage was last rebuilt without being asked to (the Code view can say "Changed · the run was reset"). */
export type StageNotice = { reason: 'edit'; nonce: number } | null

export type StageState = {
  stage: StageSession | null
  stageLoading: boolean
  /** The controller's observation, throttled (~10 Hz while the scene runs; immediately after every stage action). */
  stageObservation: RunObservation | null
  stageNotice: StageNotice
  /** The walk-up in progress or the last one's verdict, on this stage (cleared by Run, Reset, a rebuild and close). */
  walk: WalkWatch | null
  openStage: (creationId: string, space?: RunSpace, options?: StageOptions) => Promise<void>
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
let pendingOpen: { creationId: string; space: RunSpace | undefined; options: StageOptions | undefined } | null = null

function build(creationId: string, space: RunSpace | undefined, { rapier, run }: StageModules, options?: StageOptions): StageSession | null {
  const brickState = useBrickStore.getState()
  const model = computeModel(brickState)
  const saved = model.creations.find((creation) => creation.id === creationId)
  if (!saved) return null
  const resolved = space ?? saved.testSpace
  const creation = run.deriveCreationForSpace(model.input, creationId, options?.freeBodies ? 'testPlate' : resolved)
  if (!creation) return null
  const geometry: StageGeometry = { bricks: brickState.bricks, partMap: model.input.partMap, plateSize: model.input.plateSize }
  const props = options?.props ? options.props(creation, resolved, geometry) : undefined
  const controller = run.createRunController({ rapier, ...geometry, creation, space: resolved, props, walkSensorId: programSensor(model.section, creation) })
  return { creationId, space: resolved, spaceChosen: space !== undefined, controller, creation, plateSize: model.input.plateSize, bricks: brickState.bricks, behaviorKey: simBehaviorKey(brickState), generation: stageGeneration, ...(options ? { options } : {}) }
}

/** Rebuilds the open stage synchronously at the built pose (Rapier is loaded once a stage has opened). */
function rebuild(notice: StageNotice) {
  const current = useStageStore.getState().stage
  if (!current || !modules) return
  stageGeneration += 1
  current.controller.dispose()
  const next = build(current.creationId, current.spaceChosen ? current.space : undefined, modules, current.options)
  useStageStore.setState({ stage: next, stageLoading: false, stageObservation: next ? next.controller.observe() : null, stageNotice: next ? notice : null, walk: null })
}

/** The first of the creation's sensors the active program names: the one "Someone walks up" walks up to. */
function programSensor(section: ReturnType<typeof computeModel>['section'], creation: DerivedCreation): DeviceId | null {
  const program = activeProgramOf(section, creation.id)
  if (!program) return null
  const own = new Set(creation.sensors.map((sensor) => sensor.brickId))
  return referencedDevices(program.workspace).find((reference) => reference.kind === 'sensor' && own.has(reference.deviceId))?.deviceId ?? null
}

/**
 * The Code view's "run the newest code" (kid lane Y): while it is registered for the stage's robot,
 * a stage input first makes sure the program running is the newest one (starting it as Run would);
 * it answers false when the code cannot run (the Code view says why), and the input is dropped.
 */
export type StageRunner = { creationId: string; ensureRunning: () => boolean }
let stageRunner: StageRunner | null = null

export function setStageRunner(runner: StageRunner | null) {
  stageRunner = runner
}

/** Before a stage input: the newest program is running (true), or it cannot run (false). Without a runner, true. */
export function ensureStageRunning(): boolean {
  const stage = useStageStore.getState().stage
  if (!stage) return false
  return stageRunner && stageRunner.creationId === stage.creationId ? stageRunner.ensureRunning() : true
}

/** A walk-up watch after an observation; its first verdict is kept for the robot's panel in Build. */
function followWalk(walk: WalkWatch | null, stage: StageSession | null, observation: RunObservation): WalkWatch | null {
  if (!walk || !stage || walk.creationId !== stage.creationId) return walk
  const next = watchStep(walk, stage.creation, observation)
  if (next.verdict && !walk.verdict) {
    const brickState = useBrickStore.getState()
    recordLastTry(stage.creationId, { verdict: next.verdict, target: next.target, bricks: brickState.bricks, key: lastTryKey(brickState, stage.creationId) })
  }
  return next
}

export const useStageStore = create<StageState>((set, get) => {
  const publish = () => {
    const stage = get().stage
    const observation = stage ? stage.controller.observe() : null
    set({ stageObservation: observation, ...(observation ? { walk: followWalk(get().walk, stage, observation) } : {}) })
  }

  return {
    stage: null,
    stageLoading: false,
    stageObservation: null,
    stageNotice: null,
    walk: null,

    openStage: async (creationId, space, options) => {
      installStageWatcher()
      get().closeStage()
      // The nudge and the stage never share the scene.
      useRoboticsStore.getState().resetSim()
      const token = stageGeneration
      const cancelled = () => token !== stageGeneration
      pendingOpen = { creationId, space, options }
      set({ stageLoading: true })
      try {
        const loaded = await loadModules()
        if (cancelled()) return
        // From here nothing yields: the stage is built from the document as it is now.
        const session = build(creationId, space, loaded, options)
        set({ stage: session, stageObservation: session ? session.controller.observe() : null, stageNotice: null, walk: null })
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
      // A fresh run: what the last walk-up said was about the program before it.
      set({ stageNotice: null, walk: null })
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
      if (stage || stageLoading || get().walk) set({ stage: null, stageLoading: false, stageObservation: null, stageNotice: null, walk: null })
    },
    triggerVisitor: () => {
      if (!get().stage || !ensureStageRunning()) return
      const stage = get().stage!
      const observation = stage.controller.observe()
      // A new walk from the start is a new test; turning back one that is still walking keeps its watch.
      if (!get().walk || observation.visitorPhase === 'away' || !observation.visitorPhase) {
        const visitor = stage.controller.props.find((prop) => prop.kind === 'visitor')
        set({ walk: startWatch(stage.creation, observation, visitor?.kind === 'visitor' ? visitor.sensorId ?? stage.creation.sensors[0]?.brickId ?? null : null) })
      }
      stage.controller.triggerVisitor()
      publish()
    },
    setStageKey: (key, down) => get().stage?.controller.setKey(key, down),
    setStageJoystick: (up, right) => get().stage?.controller.setJoystick(up, right),
    setStageButton: (deviceId, down) => {
      // A button pressed on the stage is a stage input: the Code view starts the newest code first.
      if (down && !ensureStageRunning()) return
      get().stage?.controller.setButton(deviceId, down)
    },
    publishStageObservation: (observation) => set((state) => ({ stageObservation: observation, walk: followWalk(state.walk, state.stage, observation) })),
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
    if (pending) void stageState.openStage(pending.creationId, pending.space, pending.options)
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

/** For tests: close any stage (the watcher stays installed) and forget the Code view's runner. */
export function resetStageStoreForTests() {
  useStageStore.getState().closeStage()
  stageRunner = null
}
