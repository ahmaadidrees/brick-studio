import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { kitAt, kitById, placeKitInSection, type KitId } from '../kits/kits'
import { deriveCreations, type DerivedCreation } from '../model/creations'
import { GATE_IDS, SIGNAL_IDS, gateBricks } from '../model/fixtures'
import { emptyRoboticsSection, writeRoboticsSection, type RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { compileContextFor, compileProgram } from '../program/compile'
import { defaultStarterFor } from '../program/starters'
import { wiredGate, wiredSignalPost } from '../program/testFixtures'
import { SEES_SOMETHING_STUDS, type LightColor } from '../program/types'
import { createRunController, deriveCreationForSpace, type StageRunController } from '../run/controller'
import type { MotorReading, RunObservation } from '../run/types'
import { createProgramRuntime } from '../runtime'
import { FIXED_STEP, type VisitorPhase } from '../sim/mechanics'
import { ARM_OPEN_DEGREES, freshLastTry, lastTryKey, readyRowText, startWatch, tryLine, tryTarget, watchStep, type WalkWatch } from './tryOutcome'

/**
 * "Say what happened, every time" (kid lane Y): the verdict a walk-up ends in, the one line the
 * stage shows, the ready row back in Build, and the kits' own programs reacting to the walk.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
  partMap = createPartMap([])
})

const motor = (reading: Partial<MotorReading>): MotorReading => ({ powerPercent: 0, speedPercent: 0, positionDegrees: 0, plugged: true, ...reading })
type Frame = { phase?: VisitorPhase; distance?: number | null; arm?: number; light?: LightColor | null; running?: boolean }
/** An observation of a gate (`GATE_IDS`) or a signal post (`SIGNAL_IDS`) with just what a walk-up reads. */
function frame(sensorId: string, { phase = 'arriving', distance = null, arm, light, running = true }: Frame): RunObservation {
  return {
    phase: running ? 'running' : 'ready', tick: 0, timeSeconds: 0,
    sensors: { [sensorId]: distance === null ? { distanceStuds: 40, hit: false } : { distanceStuds: distance, hit: true } },
    motors: arm === undefined ? {} : { [GATE_IDS.hinge]: motor({ positionDegrees: arm }) },
    lights: light === undefined ? {} : { [SIGNAL_IDS.light]: light },
    buttons: {}, beams: [], contacts: [], activeBlockIds: [], diagnostics: [], speedStudsPerSecond: 0, variables: {}, visitorPhase: phase,
  }
}
/** Feeds the watch a list of frames, the way the stage publishes them. */
function watch(creation: DerivedCreation, sensorId: string, before: Frame, frames: Frame[]): WalkWatch {
  let current = startWatch(creation, frame(sensorId, { ...before, phase: 'away' }), sensorId)
  for (const next of frames) current = watchStep(current, creation, frame(sensorId, next))
  return current
}

describe('the verdict of a walk-up', () => {
  const gate = () => wiredGate().creation
  const post = () => wiredSignalPost().creation

  it('a gate: worked as soon as the sensor has seen them and the arm has opened; the line says so', () => {
    const creation = gate()
    expect(tryTarget(creation)).toBe('gate')
    let current = startWatch(creation, frame(GATE_IDS.sensor, { phase: 'away', arm: 0 }), GATE_IDS.sensor)
    current = watchStep(current, creation, frame(GATE_IDS.sensor, { phase: 'arriving', arm: 0 }))
    expect(current.verdict).toBeNull()
    current = watchStep(current, creation, frame(GATE_IDS.sensor, { phase: 'arriving', distance: 3.2, arm: 5 }))
    expect(current).toMatchObject({ seen: true, verdict: null })
    current = watchStep(current, creation, frame(GATE_IDS.sensor, { phase: 'arriving', distance: 3, arm: ARM_OPEN_DEGREES + 1 }))
    expect(current.verdict).toBe('worked')
    expect(tryLine(current, creation)).toEqual({ text: 'It worked! The gate opened.', tone: 'good' })
    // Decided once: the walk goes on and it stays "worked".
    current = watchStep(current, creation, frame(GATE_IDS.sensor, { phase: 'away', arm: 0 }))
    expect(current.verdict).toBe('worked')
  })

  it('a signal light: worked when the light comes on while they are seen', () => {
    const creation = post()
    expect(tryTarget(creation)).toBe('light')
    const done = watch(creation, SIGNAL_IDS.sensor, { light: null }, [{ distance: 3, light: null }, { distance: 3, light: 'red' }])
    expect(done.verdict).toBe('worked')
    expect(done.lit).toBe('red')
    expect(tryLine(done, creation)?.text).toBe('It worked! The light came on.')
  })

  it('not seen: the line points at the beam; an unplugged sensor says so instead', () => {
    const creation = gate()
    const unseen = watch(creation, GATE_IDS.sensor, { arm: 0 }, [{ phase: 'arriving', arm: 0 }, { phase: 'here', arm: 0 }, { phase: 'leaving', arm: 0 }])
    expect(unseen.verdict).toBe('not-seen')
    expect(tryLine(unseen, creation)).toMatchObject({ text: 'The sensor didn’t see them. It looks this way', tone: 'warn', pointsAtBeam: true })
    const unplugged = { ...creation, sensors: creation.sensors.map((sensor) => ({ ...sensor, plugged: false })) }
    expect(watch(unplugged, GATE_IDS.sensor, { arm: 0 }, [{ phase: 'here' }, { phase: 'leaving' }]).verdict).toBe('sensor-unplugged')
    expect(tryLine({ verdict: 'sensor-unplugged', target: 'gate', opened: false, lit: null }, creation)?.text).toBe('The sensor isn’t plugged in, so it didn’t see them.')
  })

  it('seen, but nothing happened: the code (pointing at Code), the program not running, the arm stuck, the part unplugged', () => {
    const creation = gate()
    const seenOnly: Frame[] = [{ phase: 'here', distance: 3, arm: 0 }, { phase: 'leaving', arm: 0 }]
    const noReaction = watch(creation, GATE_IDS.sensor, { arm: 0 }, seenOnly)
    expect(noReaction.verdict).toBe('no-reaction')
    expect(tryLine(noReaction, creation)).toMatchObject({ text: 'The sensor saw them, but the code didn’t open the gate.', pointsAtCode: true })
    expect(watch(creation, GATE_IDS.sensor, { arm: 0 }, seenOnly.map((next) => ({ ...next, running: false }))).verdict).toBe('not-running')
    const stuck = { ...creation, hinges: creation.hinges.map((hinge) => ({ ...hinge, locked: true })) }
    expect(watch(stuck, GATE_IDS.sensor, { arm: 0 }, seenOnly).verdict).toBe('stuck')
    expect(tryLine({ verdict: 'stuck', target: 'gate', opened: false, lit: null }, creation)?.text).toBe('The sensor saw them, but the arm is stuck to the frame.')
    const loose = { ...creation, hinges: creation.hinges.map((hinge) => ({ ...hinge, plugged: false })) }
    expect(watch(loose, GATE_IDS.sensor, { arm: 0 }, seenOnly).verdict).toBe('part-unplugged')
    expect(tryLine({ verdict: 'part-unplugged', target: 'gate', opened: false, lit: null }, creation)?.text).toBe('The sensor saw them, but Arm motor isn’t plugged in.')
    const light = post()
    expect(tryLine(watch(light, SIGNAL_IDS.sensor, { light: null }, [{ phase: 'here', distance: 3, light: null }, { phase: 'leaving', light: null }]), light)?.text).toBe('The sensor saw them, but the code didn’t turn the light on.')
  })

  it('a sensor already seeing something (a wall in its beam), and a gate that was open before they came', () => {
    const creation = gate()
    const wall = watch(creation, GATE_IDS.sensor, { distance: 2, arm: 0 }, [{ phase: 'here', distance: 2, arm: 0 }, { phase: 'leaving', distance: 2, arm: 0 }])
    expect(wall.verdict).toBe('wall')
    expect(tryLine(wall, creation)).toMatchObject({ text: 'The sensor already sees something. Give it room in front.', pointsAtBeam: true })
    // Even if the gate is open, it is not because of the visitor.
    expect(watch(creation, GATE_IDS.sensor, { distance: 2, arm: 90 }, [{ phase: 'here', distance: 2, arm: 90 }, { phase: 'leaving', distance: 2, arm: 90 }]).verdict).toBe('wall')
    const open = watch(creation, GATE_IDS.sensor, { arm: 90 }, [{ phase: 'here', distance: 3, arm: 90 }, { phase: 'leaving', arm: 90 }])
    expect(open.verdict).toBe('already')
    expect(tryLine(open, creation)?.text).toBe('The gate was open already. Press Reset and try again.')
  })

  it('"sees something" is the blocks’ own: a thing at 5 steps or more is not seen', () => {
    const creation = gate()
    expect(watch(creation, GATE_IDS.sensor, { arm: 0 }, [{ phase: 'here', distance: SEES_SOMETHING_STUDS, arm: 0 }, { phase: 'leaving', arm: 0 }]).verdict).toBe('not-seen')
  })
})

describe('the ready row back in Build', () => {
  it('says what the last try did, and try again', () => {
    expect(readyRowText('worked', 'gate')).toBe('It worked! Try it again')
    expect(readyRowText('no-reaction', 'gate')).toBe('The gate didn’t open. Try it again')
    expect(readyRowText('not-seen', 'light')).toBe('The light didn’t come on. Try it again')
  })

  it('is about this build and this code: any brick edit, cable or program change makes it stale', () => {
    const { bricks, section } = wiredGate()
    const metadata = { robotics: writeRoboticsSection(section) }
    const key = lastTryKey({ documentMetadata: metadata }, 'c1')
    const entry = { verdict: 'worked' as const, target: 'gate' as const, bricks, key }
    expect(freshLastTry(entry, bricks, key)).toBe(entry)
    expect(freshLastTry(entry, [...bricks], key)).toBeNull()
    const unplugged: RoboticsSection = { ...section, connections: section.connections.slice(1) }
    expect(lastTryKey({ documentMetadata: { robotics: writeRoboticsSection(unplugged) } }, 'c1')).not.toBe(key)
    const withProgram: RoboticsSection = { ...section, programs: [{ id: 'p', creationId: 'c1', name: 'Mine', workspace: {}, deviceNames: {}, revision: 2 }] }
    const programKey = lastTryKey({ documentMetadata: { robotics: writeRoboticsSection(withProgram) } }, 'c1')
    expect(programKey).not.toBe(key)
    const edited: RoboticsSection = { ...withProgram, programs: [{ ...withProgram.programs[0], revision: 3 }] }
    expect(lastTryKey({ documentMetadata: { robotics: writeRoboticsSection(edited) } }, 'c1')).not.toBe(programKey)
    expect(freshLastTry(undefined, bricks, key)).toBeNull()
  })
})

/* ------------------------------------------------------------------ the kits' programs */

/** A kit placed and plugged in as the drawer does it, its starter compiled and running on a stage in My world. */
function kitStage(kitId: KitId): { creation: DerivedCreation; controller: StageRunController } {
  const kit = kitById(kitId)
  const bricks: BrickInstance[] = kitAt(kit, { x: 32, z: 32 }, 64)
  const input = { bricks, partMap, plateSize: 64, section: emptyRoboticsSection() }
  const { section } = placeKitInSection({ input, section: input.section, creations: deriveCreations(input) }, kit, bricks.map((brick) => brick.id), 'robot')
  const creation = deriveCreationForSpace({ bricks, partMap, plateSize: 64, section }, 'robot', 'myWorld')!
  const starter = defaultStarterFor(creation)
  const compiled = compileProgram(starter.workspace, compileContextFor(creation))
  expect(compiled.ok).toBe(true)
  const controller = createRunController({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation, space: 'myWorld' })
  controller.run(createProgramRuntime(compiled.ir, { fixedStep: FIXED_STEP }))
  return { creation, controller }
}

/** Walks the visitor up and back, recording each 1/60 s: the phase, what the sensor reads, the arm, the light. */
function walkAndRecord(controller: StageRunController, creation: DerivedCreation, seconds = 12) {
  let current = startWatch(creation, controller.observe(), creation.sensors[0].brickId)
  controller.triggerVisitor()
  const record: { t: number; phase: VisitorPhase | null; sees: boolean; arm: number; light: LightColor | null }[] = []
  for (let frame = 1; frame <= seconds * 60; frame += 1) {
    controller.advance(1 / 60)
    const o = controller.observe()
    current = watchStep(current, creation, o)
    const reading = o.sensors[creation.sensors[0].brickId]
    record.push({ t: frame / 60, phase: o.visitorPhase ?? null, sees: reading.hit && reading.distanceStuds < SEES_SOMETHING_STUDS, arm: creation.hinges[0] ? o.motors[creation.hinges[0].brickId].positionDegrees : 0, light: creation.lights[0] ? o.lights[creation.lights[0].brickId] ?? null : null })
  }
  return { record, verdict: current.verdict }
}

describe('the kits’ programs react to the walk-up (kid lane Y)', () => {
  it('Gate: open before the visitor stops, open the whole time they stand there, closed once they have gone; "It worked!"', () => {
    const { creation, controller } = kitStage('gate')
    const { record, verdict } = walkAndRecord(controller, creation)
    const arrived = record.find((entry) => entry.phase === 'here')!
    const leaving = record.find((entry) => entry.phase === 'leaving')!
    // The gate is (all but) open by the time they stop: it began as they walked into the beam.
    expect(arrived.arm).toBeGreaterThan(70)
    const standing = record.filter((entry) => entry.phase === 'here')
    expect(standing.every((entry) => entry.sees)).toBe(true)
    expect(Math.min(...standing.slice(30).map((entry) => entry.arm))).toBeGreaterThan(85)
    // It closes after they have gone, not before.
    expect(leaving.arm).toBeGreaterThan(85)
    expect(record.at(-1)!.phase).toBe('away')
    expect(record.at(-1)!.arm).toBeLessThan(3)
    expect(verdict).toBe('worked')
    controller.dispose()
  })

  it('Signal light: on (red) the whole time the visitor stands there, off once they have gone; "It worked!"', () => {
    const { creation, controller } = kitStage('signal-light')
    const { record, verdict } = walkAndRecord(controller, creation)
    const before = record.filter((entry) => entry.phase === 'arriving' && !entry.sees)
    expect(before.every((entry) => entry.light === null)).toBe(true)
    const standing = record.filter((entry) => entry.phase === 'here')
    expect(standing.length).toBeGreaterThan(150)
    expect(standing.every((entry) => entry.light === 'red')).toBe(true)
    expect(record.at(-1)!.phase).toBe('away')
    expect(record.at(-1)!.light).toBeNull()
    expect(verdict).toBe('worked')
    controller.dispose()
  })

  it('the old fixture gate (built from parts, not a kit) behaves the same with its starter', () => {
    const bricks = gateBricks()
    const { section } = wiredGate()
    const creation = deriveCreationForSpace({ bricks, partMap, plateSize: 64, section }, 'c1', 'myWorld')!
    const compiled = compileProgram(defaultStarterFor(creation).workspace, compileContextFor(creation))
    const controller = createRunController({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation, space: 'myWorld' })
    controller.run(createProgramRuntime(compiled.ir, { fixedStep: FIXED_STEP }))
    const { record, verdict } = walkAndRecord(controller, creation)
    expect(record.find((entry) => entry.phase === 'here')!.arm).toBeGreaterThan(70)
    expect(verdict).toBe('worked')
    controller.dispose()
  })
})
