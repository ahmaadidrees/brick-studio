import { ArrowLeft, Gauge, PersonStanding, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useBrickStore } from '../../brick/store'
import { LIVE_ROOM_CODE_LINE } from '../code/codeViewState'
import { suspendStudioShortcuts } from '../code/studioKeys'
import { plateCurb } from '../explore/plateCurb'
import { rideProgramKey } from '../explore/rideModel'
import type { DerivedCreation } from '../model/creations'
import { readRoboticsSection } from '../model/section'
import { PROGRAM_KEYS, SEES_SOMETHING_STUDS, type ProgramKey } from '../program/types'
import type { RunObservation, RunSpace } from '../run/types'
import { createProgramRuntime } from '../runtime'
import { simBehaviorKey, useRoboticsStore } from '../state/roboticsStore'
import { useStageStore, type StageOptions, type StageSession } from '../state/stageStore'
import { driveCourse, driveFramePoints, propFramePoints } from './course'
import { DriveJoystick, type Axes } from './DriveJoystick'
import { useDriveView } from './driveViewState'
import { choosePlayProgram } from './playProgram'
import { readiness, type PlayKind } from './readiness'
import './drive.css'

/**
 * The Drive view (docs/robotics/KID-UX.md §D), loaded lazily like the Code view and shown in
 * the robotics panel's place while `useDriveView.creationId` is set. The stage fills the canvas
 * under one bar (Back to build, the robot's name, Test plate / My world, Reset); there is
 * nothing to code and no Run button to find:
 *
 * - **Drive** (a robot that can drive): the robot runs its own joystick program, or a Joystick
 *   drive program made on the fly and never saved, from the moment the stage opens. A big
 *   joystick (bottom right), the arrow keys or WASD drive it; a small readout shows its speed.
 *   The test plate has a fenced course with posts; in My world the robot rolls free among the
 *   student's own bricks, inside a curb at the plate's edge: the one a ride in Explore drives
 *   against (`explore/plateCurb.ts`), so a robot never floats past the plate on ground nobody sees.
 * - **Try it** (a gate or a signal light): its own program that reacts to its sensor, or its
 *   starter made on the fly, runs in My world; a big "Someone walks up" button sends the
 *   visitor, and the door swings or the light lights where the student can see it.
 *
 * Nothing here writes the document: the space switch is the view's own, the program is never
 * saved, and Back to build finds the construction exactly as it was. The studio's shortcuts are
 * off while it is open; a construction edit (or leaving Build) closes it, the construction being
 * the truth. A robot that is not ready says the one thing to do; a live room gets the Code
 * view's one-line refusal instead of a stage.
 */
export default function DriveView({ live = false }: { live?: boolean }) {
  const creationId = useDriveView((state) => state.creationId)
  const creation = useRoboticsStore((state) => (creationId ? state.model.creations.find((candidate) => candidate.id === creationId) ?? null : null))
  // A robot deleted while it is open (or an unknown id): back to Build.
  useEffect(() => { if (creationId && !creation) useDriveView.getState().closeDrive() }, [creationId, creation])
  if (!creation) return null
  return <DriveViewFor key={creation.id} creation={creation} live={live} />
}

const close = () => useDriveView.getState().closeDrive()

function DriveViewFor({ creation, live }: { creation: DerivedCreation; live: boolean }) {
  const status = readiness(creation)
  useStudioSetAside()
  useCloseOnConstructionEdit()
  useEscapeCloses()
  const kind: PlayKind = status.kind ?? 'drive'
  if (live) {
    return (
      <DriveCard creation={creation} kind={kind} state="live" title={creation.name} testId="robo-drive-live">
        {LIVE_ROOM_CODE_LINE}
      </DriveCard>
    )
  }
  const reason = !status.ready || !status.kind ? status.reason ?? 'Add motors to make it move, or a sensor and a light.' : tryNeedsEyes(creation, status.kind)
  if (reason || !status.kind) {
    return (
      <DriveCard creation={creation} kind={kind} state="not-ready" title={`${creation.name} is almost ready!`} testId="robo-drive-not-ready">
        {reason}
      </DriveCard>
    )
  }
  return <PlayStage creation={creation} kind={status.kind} />
}

/**
 * Try it needs something to react to: a plugged-in sensor, which the visitor walks up to. A gate
 * whose arm is ready but that has no sensor yet has nothing to try (the one thing to do, in the
 * readiness guide's words), so it gets the not-ready card rather than a button that does nothing.
 */
function tryNeedsEyes(creation: DerivedCreation, kind: PlayKind): string | null {
  if (kind !== 'try' || creation.sensors.some((sensor) => sensor.plugged)) return null
  return creation.sensors.length ? `Plug ${creation.sensors[0].name} into the hub.` : 'Add a sensor so it can see.'
}

const viewLabel = (kind: PlayKind, name: string) => `${kind === 'drive' ? 'Drive' : 'Try'} ${name}`

/** Not ready, or a live room: one card with the one thing to know, and the way back. */
function DriveCard({ creation, kind, state, title, testId, children }: { creation: DerivedCreation; kind: PlayKind; state: string; title: string; testId: string; children: ReactNode }) {
  return (
    <section className="robo-drive robo-drive-cardonly" aria-label={viewLabel(kind, creation.name)} data-kind={kind} data-state={state} data-testid="robo-drive" data-shortcut-pause="">
      <div className="robo-drive-card" role="status" data-testid={testId}>
        <strong>{title}</strong>
        <p>{children}</p>
        <BackButton />
      </div>
    </section>
  )
}

function BackButton() {
  return (
    <button type="button" className="robo-drive-back" onClick={close} data-testid="robo-drive-back">
      <ArrowLeft size={18} aria-hidden="true" />Back to build
    </button>
  )
}

/** While the view is up the builder's shortcuts are off, nothing is armed or selected and no studio message lingers. */
function useStudioSetAside() {
  useEffect(() => {
    const release = suspendStudioShortcuts()
    const brick = useBrickStore.getState()
    brick.cancelInteraction()
    brick.clearToast()
    brick.selectBrick(null)
    return release
  }, [])
}

/** A construction edit (bricks, cables, membership, run space) or leaving Build closes the view. */
function useCloseOnConstructionEdit() {
  useEffect(() => useBrickStore.subscribe((state, previous) => {
    if (state.mode !== previous.mode && state.mode !== 'build') { close(); return }
    if (state.bricks !== previous.bricks) { close(); return }
    if (state.documentMetadata !== previous.documentMetadata && simBehaviorKey(state) !== simBehaviorKey(previous)) close()
  }), [])
}

function useEscapeCloses() {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || editable(event.target)) return
      event.preventDefault()
      close()
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'
const editable = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest(EDITABLE))

/* ------------------------------------------------------------------ the stage */

/** Drive: the course on the test plate; free bodies inside the plate's curb in My world. Try it: the stage as the Code view has it. */
export function stageOptionsFor(kind: PlayKind, space: RunSpace): StageOptions | undefined {
  if (kind !== 'drive') return undefined
  return space === 'testPlate'
    ? { props: (creation, _space, geometry) => driveCourse(creation, geometry), freeBodies: true }
    : { props: (_creation, _space, geometry) => plateCurb(geometry.plateSize), freeBodies: true }
}

function PlayStage({ creation, kind }: { creation: DerivedCreation; kind: PlayKind }) {
  const [space, setSpace] = useState<RunSpace>(kind === 'drive' ? creation.testSpace : 'myWorld')
  const stage = useStageStore((state) => (state.stage?.creationId === creation.id ? state.stage : null))
  const observation = useStageStore((state) => (state.stage?.creationId === creation.id ? state.stageObservation : null))
  const loading = useStageStore((state) => state.stageLoading)
  const [problem, setProblem] = useState<string | null>(null)

  // Open (and after a switch, reopen) the stage in the chosen space; leaving closes it and the run is discarded.
  useEffect(() => {
    void useStageStore.getState().openStage(creation.id, space, stageOptionsFor(kind, space))
    return () => useStageStore.getState().closeStage()
  }, [creation.id, space, kind])

  // Every fresh stage (opened, reset, switched) is framed and starts its program at once.
  useEffect(() => {
    if (!stage) return
    frameStage(stage, kind)
    if (stage.controller.phase !== 'ready') return
    const brick = useBrickStore.getState()
    const choice = choosePlayProgram(kind, readRoboticsSection(brick.documentMetadata.robotics), stage.creation, new Set(brick.bricks.map((entry) => entry.id)))
    if (!choice) { setProblem(kind === 'drive' ? 'This robot can’t drive yet. Back to build to finish it.' : 'This robot has nothing to try yet. Back to build to finish it.'); return }
    setProblem(null)
    useStageStore.getState().runOnStage(createProgramRuntime(choice.ir, { fixedStep: stage.controller.mechanics.fixedStep }))
  }, [stage, kind])

  const ready = Boolean(stage) && !loading
  return (
    <section className="robo-drive" aria-label={viewLabel(kind, creation.name)} data-kind={kind} data-state={ready ? 'play' : 'loading'} data-space={space} data-testid="robo-drive" data-shortcut-pause="">
      <header className="robo-drive-bar">
        <BackButton />
        <strong className="robo-drive-name" title={creation.name}>{creation.name}</strong>
        <span className="robo-drive-spacer" />
        {kind === 'drive' && (
          <div className="robo-drive-seg" role="group" aria-label="Where to drive">
            <button type="button" className={space === 'testPlate' ? 'on' : ''} aria-pressed={space === 'testPlate'} onClick={() => setSpace('testPlate')}>Test plate</button>
            <button type="button" className={space === 'myWorld' ? 'on' : ''} aria-pressed={space === 'myWorld'} onClick={() => setSpace('myWorld')}>My world</button>
          </div>
        )}
        <button type="button" className="robo-drive-button" onClick={() => useStageStore.getState().resetStage()} disabled={!ready} title="Put it back where it started" data-testid="robo-drive-reset">
          <RotateCcw size={17} aria-hidden="true" />Reset
        </button>
      </header>
      {!ready && <p className="robo-drive-loading" role="status">Getting ready…</p>}
      {problem && <p className="robo-drive-problem" role="alert" data-testid="robo-drive-problem">{problem}</p>}
      {kind === 'drive'
        ? <DriveFoot observation={observation} active={ready} />
        : <TryFoot creation={creation} stage={stage} observation={observation} />}
    </section>
  )
}

/** The robot and what surrounds it, framed in the part of the canvas the bar and the controls leave free. */
function frameStage(stage: StageSession, kind: PlayKind) {
  const robotics = useRoboticsStore.getState()
  const points = kind === 'drive' ? driveFramePoints(stage.creation, robotics.model.input, stage.space) : propFramePoints(stage.controller.props)
  robotics.requestFrame(stage.creation.brickIds, points)
}

/* ------------------------------------------------------------------ Drive */

export const keyAxes = (held: ReadonlySet<ProgramKey>): Axes => ({
  up: (held.has('up') ? 100 : 0) - (held.has('down') ? 100 : 0),
  right: (held.has('right') ? 100 : 0) - (held.has('left') ? 100 : 0),
})

/**
 * The arrow keys, WASD and Space go to the program, never to the studio or the page (which
 * would scroll). Captured on the window so they work wherever focus is, except in a text field.
 * Returns the keys held, so the joystick can lean the way they push.
 */
function useDriveKeys(): ReadonlySet<ProgramKey> {
  const [held, setHeld] = useState<ReadonlySet<ProgramKey>>(() => new Set())
  useEffect(() => {
    const update = (key: ProgramKey, down: boolean) => setHeld((current) => {
      if (current.has(key) === down) return current
      const next = new Set(current)
      if (down) next.add(key)
      else next.delete(key)
      return next
    })
    const down = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || editable(event.target)) return
      const key = rideProgramKey(event)
      if (!key) return
      event.preventDefault()
      event.stopPropagation()
      useStageStore.getState().setStageKey(key, true)
      update(key, true)
    }
    const up = (event: KeyboardEvent) => {
      const key = rideProgramKey(event)
      if (!key) return
      useStageStore.getState().setStageKey(key, false)
      update(key, false)
    }
    const release = () => {
      for (const key of PROGRAM_KEYS) useStageStore.getState().setStageKey(key, false)
      setHeld(new Set())
    }
    const visibility = () => { if (document.visibilityState !== 'visible') release() }
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', release)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', release)
      document.removeEventListener('visibilitychange', visibility)
      release()
    }
  }, [])
  return held
}

function DriveFoot({ observation, active }: { observation: RunObservation | null; active: boolean }) {
  const held = useDriveKeys()
  const hintId = useId()
  const onJoystick = useCallback((up: number, right: number) => useStageStore.getState().setStageJoystick(up, right), [])
  const speed = observation ? Math.abs(observation.speedStudsPerSecond) : 0
  // Everything for driving sits in one corner, so the course has the rest of the canvas.
  return (
    <div className="robo-drive-side">
      <div className="robo-drive-speed" data-testid="robo-drive-speed">
        <Gauge size={20} aria-hidden="true" />
        <small>Speed</small>
        <strong>{speed.toFixed(1)}</strong>
        <span>studs a second</span>
      </div>
      <p className="robo-drive-hint" id={hintId} data-testid="robo-drive-hint">Drag the joystick or use the arrow keys</p>
      <div className={`robo-drive-stick${active ? '' : ' waiting'}`}>
        <DriveJoystick onChange={onJoystick} keyAxes={keyAxes(held)} describedBy={hintId} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ Try it */

export type TryResult = { id: string; label: string; value: string; tone: 'on' | 'off'; swatch?: string }

const SWATCH: Record<string, string> = { red: '#ff3b30', orange: '#ff9500', yellow: '#ffd60a', green: '#34c759', blue: '#0a84ff', purple: '#bf5af2', white: '#ffffff' }
/** An arm this far from where it was built reads as open. */
const OPEN_DEGREES = 20

/** What a student watches for, in words: does the sensor see something, is the arm open, is the light on. */
export function tryResults(creation: DerivedCreation, observation: RunObservation | null): TryResult[] {
  const results: TryResult[] = []
  for (const sensor of creation.sensors) {
    if (!sensor.plugged) continue
    const reading = observation?.sensors[sensor.brickId]
    const sees = Boolean(reading?.hit && reading.distanceStuds < SEES_SOMETHING_STUDS)
    results.push({ id: sensor.brickId, label: sensor.name, value: sees ? 'sees something' : 'sees nothing', tone: sees ? 'on' : 'off' })
  }
  for (const hinge of creation.hinges) {
    if (!hinge.plugged) continue
    const angle = observation?.motors[hinge.brickId]?.positionDegrees ?? 0
    const open = Math.abs(angle) >= OPEN_DEGREES
    results.push({ id: hinge.brickId, label: hinge.name, value: open ? 'open' : 'closed', tone: open ? 'on' : 'off' })
  }
  for (const light of creation.lights) {
    if (!light.plugged) continue
    const color = observation?.lights[light.brickId] ?? null
    results.push({ id: light.brickId, label: light.name, value: color ?? 'off', tone: color ? 'on' : 'off', ...(color ? { swatch: SWATCH[color] } : {}) })
  }
  return results
}

function TryFoot({ creation, stage, observation }: { creation: DerivedCreation; stage: StageSession | null; observation: RunObservation | null }) {
  const hasVisitor = Boolean(stage?.controller.props.some((prop) => prop.kind === 'visitor'))
  const walking = observation?.visitorPhase === 'arriving' || observation?.visitorPhase === 'here' || observation?.visitorPhase === 'leaving'
  const results = useMemo(() => tryResults(creation, observation), [creation, observation])
  const hintId = useId()
  return (
    <>
      <footer className="robo-drive-foot">
        <ul className="robo-drive-results" aria-label="What it does" data-testid="robo-drive-results">
          {results.map((result) => (
            <li key={result.id} className={result.tone} data-result={result.id}>
              <small>{result.label}</small>
              <strong>{result.swatch && <span className="robo-drive-swatch" style={{ background: result.swatch }} aria-hidden="true" />}{result.value}</strong>
            </li>
          ))}
        </ul>
      </footer>
      <div className="robo-drive-side">
        <p className="robo-drive-hint" id={hintId} data-testid="robo-drive-hint">Press the big button. Watch what happens.</p>
        <button
          type="button"
          className="robo-drive-visitor"
          onClick={() => useStageStore.getState().triggerVisitor()}
          disabled={!hasVisitor || walking}
          aria-describedby={hintId}
          data-testid="robo-drive-visitor"
        >
          <PersonStanding size={30} aria-hidden="true" />Someone walks up
        </button>
      </div>
    </>
  )
}
