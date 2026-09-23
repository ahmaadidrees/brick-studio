import { useMemo } from 'react'
import { create } from 'zustand'
import { useBrickStore, type BrickState } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import type { DerivedCreation } from '../model/creations'
import { readRoboticsSection } from '../model/section'
import { activeProgramOf } from '../program/programs'
import { SEES_SOMETHING_STUDS, type DeviceId, type LightColor } from '../program/types'
import type { RunObservation } from '../run/types'
import { simBehaviorKey } from '../state/roboticsStore'

/**
 * What happened when someone walked up (kid lane Y): every walk-up ends in one short line
 * that says it worked or why it did not, in a third grader's words, on the Try it stage, on
 * the Code view's stage, and (for the last try) in the robot's panel back in Build.
 *
 * `startWatch` is taken when the visitor is sent; `watchStep` follows the stage's observation
 * (the scene publishes it about ten times a second) and decides: it worked as soon as the
 * sensor has seen the visitor and the gate is open or the light is on; otherwise, when the
 * visitor turns to walk away, why not. Pure; the stage store holds the watch.
 */

/** An arm this far from where it was built reads as open (the Try it chips, the Code chips and the verdict agree). */
export const ARM_OPEN_DEGREES = 20

export type TryTarget = 'gate' | 'light'

export type TryVerdict =
  /** The sensor saw them and the gate opened or the light came on. */
  | 'worked'
  /** The sensor never saw them (it looks somewhere else). */
  | 'not-seen'
  /** The sensor has no cable, so it saw nothing. */
  | 'sensor-unplugged'
  /** The sensor was already seeing something before they came (a brick in its beam). */
  | 'wall'
  /** It saw them, but no program was running. */
  | 'not-running'
  /** It saw them, but the code did not open the gate or turn the light on. */
  | 'no-reaction'
  /** It saw them, but the arm is built into the frame. */
  | 'stuck'
  /** It saw them, but the arm motor (or the light) has no cable. */
  | 'part-unplugged'
  /** The gate was open (the light was on) before they came. */
  | 'already'

export type WalkWatch = {
  creationId: string
  sensorId: DeviceId | null
  target: TryTarget | null
  /** The visitor has left its start. */
  started: boolean
  /** Before the visitor came: the sensor already saw something; the arms that were open; the lights that were on. */
  before: { sees: boolean; open: DeviceId[]; lit: DeviceId[] }
  /** The sensor saw the visitor while it walked up or stood there. */
  seen: boolean
  /** A program was running while it was seen. */
  running: boolean
  /** An arm opened (from closed) after it was seen. */
  opened: boolean
  /** The colour a light came on in after it was seen. */
  lit: LightColor | null
  verdict: TryVerdict | null
}

const readingSees = (observation: RunObservation, sensorId: DeviceId | null) => {
  const reading = sensorId ? observation.sensors[sensorId] : undefined
  return Boolean(reading?.hit && reading.distanceStuds < SEES_SOMETHING_STUDS)
}
const openArms = (creation: DerivedCreation, observation: RunObservation) =>
  creation.hinges.filter((hinge) => hinge.plugged && Math.abs(observation.motors[hinge.brickId]?.positionDegrees ?? 0) >= ARM_OPEN_DEGREES).map((hinge) => hinge.brickId)
const litLights = (creation: DerivedCreation, observation: RunObservation) =>
  creation.lights.filter((light) => light.plugged && observation.lights[light.brickId]).map((light) => light.brickId)

/** What a walk-up is testing: a gate (anything with a hinge motor), else a light. */
export function tryTarget(creation: Pick<DerivedCreation, 'hinges' | 'lights'>): TryTarget | null {
  return creation.hinges.length ? 'gate' : creation.lights.length ? 'light' : null
}

export function startWatch(creation: DerivedCreation, observation: RunObservation | null, sensorId: DeviceId | null): WalkWatch {
  return {
    creationId: creation.id,
    sensorId,
    target: tryTarget(creation),
    started: false,
    before: observation ? { sees: readingSees(observation, sensorId), open: openArms(creation, observation), lit: litLights(creation, observation) } : { sees: false, open: [], lit: [] },
    seen: false,
    running: false,
    opened: false,
    lit: null,
    verdict: null,
  }
}

/** The watch after one more observation (the same object when nothing changed). */
export function watchStep(watch: WalkWatch, creation: DerivedCreation, observation: RunObservation): WalkWatch {
  const phase = observation.visitorPhase ?? null
  const walking = phase === 'arriving' || phase === 'here' || phase === 'leaving'
  const sees = readingSees(observation, watch.sensorId)
  const seenNow = walking && sees
  const next: WalkWatch = { ...watch }
  next.started = watch.started || walking
  next.seen = watch.seen || seenNow
  next.running = watch.running || (seenNow && observation.phase === 'running')
  if (next.seen) {
    if (openArms(creation, observation).some((id) => !watch.before.open.includes(id))) next.opened = true
    const newlyLit = litLights(creation, observation).find((id) => !watch.before.lit.includes(id))
    if (newlyLit && !next.lit) next.lit = observation.lights[newlyLit] ?? null
  }
  if (!next.verdict) {
    const worked = next.seen && !watch.before.sees && (next.target === 'gate' ? next.opened : next.target === 'light' ? next.lit !== null : true)
    // Once it turns to walk away (or is back), it is too late for the robot to answer.
    const over = next.started && (phase === 'leaving' || phase === 'away')
    if (worked) next.verdict = 'worked'
    else if (over) next.verdict = failure(next, creation, observation)
  }
  const same = (Object.keys(next) as (keyof WalkWatch)[]).every((key) => next[key] === watch[key])
  return same ? watch : next
}

function failure(watch: WalkWatch, creation: DerivedCreation, observation: RunObservation): TryVerdict {
  if (watch.before.sees) return 'wall'
  if (!watch.seen) {
    const sensor = creation.sensors.find((candidate) => candidate.brickId === watch.sensorId)
    return sensor && !sensor.plugged ? 'sensor-unplugged' : 'not-seen'
  }
  if (watch.target === 'gate') {
    if (watch.before.open.length && openArms(creation, observation).length) return 'already'
    if (!watch.running) return 'not-running'
    if (creation.hinges.some((hinge) => hinge.locked)) return 'stuck'
    if (creation.hinges.every((hinge) => !hinge.plugged)) return 'part-unplugged'
    return 'no-reaction'
  }
  if (watch.target === 'light') {
    if (watch.before.lit.length && litLights(creation, observation).length) return 'already'
    if (!watch.running) return 'not-running'
    if (creation.lights.every((light) => !light.plugged)) return 'part-unplugged'
    return 'no-reaction'
  }
  return watch.running ? 'no-reaction' : 'not-running'
}

export type TryLine = {
  text: string
  tone: 'good' | 'warn'
  /** Points at the sensor's beam on the stage ("It looks this way"). */
  pointsAtBeam?: boolean
  /** Points at the code (the Try it view offers "Open Code"). */
  pointsAtCode?: boolean
}

/** The one line the stage shows once a walk-up has a verdict. */
export function tryLine(watch: Pick<WalkWatch, 'verdict' | 'target' | 'opened' | 'lit'>, creation: Pick<DerivedCreation, 'hinges' | 'lights' | 'sensors'>): TryLine | null {
  const gate = watch.target === 'gate'
  const part = gate ? creation.hinges[0]?.name ?? 'The arm motor' : creation.lights[0]?.name ?? 'The light'
  switch (watch.verdict) {
    case null: return null
    case 'worked': {
      if (gate) return { text: watch.lit ? 'It worked! The gate opened and the light came on.' : 'It worked! The gate opened.', tone: 'good' }
      if (watch.target === 'light') return { text: 'It worked! The light came on.', tone: 'good' }
      return { text: 'It worked! The sensor saw them.', tone: 'good' }
    }
    case 'not-seen': return { text: 'The sensor didn’t see them. It looks this way', tone: 'warn', pointsAtBeam: true }
    case 'sensor-unplugged': return { text: 'The sensor isn’t plugged in, so it didn’t see them.', tone: 'warn' }
    case 'wall': return { text: 'The sensor already sees something. Give it room in front.', tone: 'warn', pointsAtBeam: true }
    case 'not-running': return { text: 'The sensor saw them, but the code isn’t running. Press Run.', tone: 'warn' }
    case 'no-reaction': return { text: gate ? 'The sensor saw them, but the code didn’t open the gate.' : watch.target === 'light' ? 'The sensor saw them, but the code didn’t turn the light on.' : 'The sensor saw them, but the code did nothing.', tone: 'warn', pointsAtCode: true }
    case 'stuck': return { text: 'The sensor saw them, but the arm is stuck to the frame.', tone: 'warn' }
    case 'part-unplugged': return { text: `The sensor saw them, but ${part} isn’t plugged in.`, tone: 'warn' }
    case 'already': return { text: gate ? 'The gate was open already. Press Reset and try again.' : 'The light was on already. Press Reset and try again.', tone: 'warn' }
  }
}

/** The robot panel's "ready" row after a try: it worked, or what did not happen, and try again. */
export function readyRowText(verdict: TryVerdict, target: TryTarget | null): string {
  if (verdict === 'worked') return 'It worked! Try it again'
  if (target === 'gate') return 'The gate didn’t open. Try it again'
  if (target === 'light') return 'The light didn’t come on. Try it again'
  return 'Try it again'
}

/* ------------------------------------------------------------------ the last try, per robot */

/** What a robot's last walk-up said, and the build and program it was about (a later edit makes it stale). */
export type LastTry = {
  verdict: TryVerdict
  target: TryTarget | null
  /** The bricks array the try ran on: any brick edit after it makes a new one. */
  bricks: readonly BrickInstance[]
  /** Everything else the try depended on (cables, run space, …) and the program it ran. */
  key: string
}

export type LastTryState = { byCreation: Record<string, LastTry> }

/** Not persisted: a reload starts every robot at "Ready to try!" again. */
export const useLastTry = create<LastTryState>(() => ({ byCreation: {} }))

export function recordLastTry(creationId: string, entry: LastTry) {
  useLastTry.setState((state) => ({ byCreation: { ...state.byCreation, [creationId]: entry } }))
}

/**
 * Everything a try depends on besides the bricks: the cables, run spaces and parts (the stage's own
 * rebuild key) and the robot's active program with its revision. A try is about this build and this code.
 */
export function lastTryKey(state: Pick<BrickState, 'documentMetadata'>, creationId: string): string {
  const program = activeProgramOf(readRoboticsSection(state.documentMetadata.robotics), creationId)
  return `${simBehaviorKey(state)}|${program ? `${program.id}@${program.revision}` : 'starter'}`
}

/** The last try, when nothing about the robot changed since. */
export function freshLastTry(entry: LastTry | undefined, bricks: readonly BrickInstance[], key: string): LastTry | null {
  return entry && entry.bricks === bricks && entry.key === key ? entry : null
}

/** For the robot panel's "ready" row: what the last try said, while it is still about this build and this code. */
export function useLastTryRow(creationId: string): { worked: boolean; text: string } | null {
  const entry = useLastTry((state) => state.byCreation[creationId])
  const bricks = useBrickStore((state) => state.bricks)
  const documentMetadata = useBrickStore((state) => state.documentMetadata)
  return useMemo(() => {
    const fresh = freshLastTry(entry, bricks, lastTryKey({ documentMetadata }, creationId))
    return fresh ? { worked: fresh.verdict === 'worked', text: readyRowText(fresh.verdict, fresh.target) } : null
  }, [entry, bricks, documentMetadata, creationId])
}
