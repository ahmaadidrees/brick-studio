import { beforeAll, describe, expect, it } from 'vitest'
import { deriveCreations, type DerivedCreation } from '../model/creations'
import { fixtureInput } from '../model/fixtures'
import type { RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { createProgram, saveProgramWorkspace } from '../program/programs'
import { starterFor, type StarterId } from '../program/starters'
import { wiredGate, wiredRover, wiredSignalPost, type WiredFixture } from '../program/testFixtures'
import { isControllerTrigger, type ProgramIR } from '../program/types'
import { choosePlayProgram, readsSensor } from './playProgram'

beforeAll(() => installRoboticsParts(true))

const derive = (fixture: WiredFixture, section: RoboticsSection): DerivedCreation => deriveCreations(fixtureInput(fixture.bricks, section))[0]

function withProgram(fixture: WiredFixture, section: RoboticsSection, starterId: StarterId, name?: string): RoboticsSection {
  const creation = derive(fixture, section)
  const result = createProgram(section, creation, starterFor(creation, starterId)!, { name })
  if (!result.ok) throw new Error(result.reason)
  return result.section
}

const hasController = (ir: ProgramIR) => ir.scripts.some((script) => isControllerTrigger(script.trigger))

describe('Drive: the program a robot drives with', () => {
  it('a robot with no programs gets a Joystick drive program made on the fly, and nothing is saved', () => {
    const rover = wiredRover()
    const before = JSON.stringify(rover.section)
    const choice = choosePlayProgram('drive', rover.section, rover.creation)!
    expect(choice).toMatchObject({ kind: 'drive', source: 'starter', name: 'Joystick drive', programId: null })
    expect(hasController(choice.ir)).toBe(true)
    expect(JSON.stringify(rover.section)).toBe(before)
  })

  it('its own joystick program wins over the starter, even when it is not the active one', () => {
    const rover = wiredRover()
    let section = withProgram(rover, rover.section, 'joystick-drive', 'My driving')
    section = withProgram(rover, section, 'stop-before-wall')
    const programs = section.programs
    expect(section.creations[0].activeProgramId).toBe(programs[1].id)
    const choice = choosePlayProgram('drive', section, derive(rover, section))!
    expect(choice).toMatchObject({ source: 'saved', name: 'My driving', programId: programs[0].id })
  })

  it('a program that does not read the joystick is passed over for the on-the-fly one', () => {
    const rover = wiredRover()
    const section = withProgram(rover, rover.section, 'stop-before-wall')
    expect(choosePlayProgram('drive', section, derive(rover, section))).toMatchObject({ source: 'starter', programId: null })
  })
})

describe('Try it: the program a gate or a signal light runs', () => {
  it('a gate with no programs runs Smart gate made on the fly; nothing is saved', () => {
    const gate = wiredGate()
    const before = JSON.stringify(gate.section)
    const choice = choosePlayProgram('try', gate.section, gate.creation)!
    expect(choice).toMatchObject({ kind: 'try', source: 'starter', name: 'Smart gate', programId: null })
    expect(choice.ir.scripts[0].trigger.kind).toBe('sensorSees')
    expect(JSON.stringify(gate.section)).toBe(before)
  })

  it('a signal light with no programs runs Signal post made on the fly', () => {
    const post = wiredSignalPost()
    expect(choosePlayProgram('try', post.section, post.creation)).toMatchObject({ source: 'starter', name: 'Signal post', programId: null })
  })

  it('its own program that reacts to the sensor runs instead (their edits included)', () => {
    const gate = wiredGate()
    let section = withProgram(gate, gate.section, 'smart-gate', 'Open wide')
    const program = section.programs[0]
    // The student changed 90 to 45.
    const edited = JSON.parse(JSON.stringify(program.workspace).replace('"NUM":90', '"NUM":45'))
    const saved = saveProgramWorkspace(section, program.id, edited, derive(gate, section))
    if (!saved.ok) throw new Error('not saved')
    section = saved.section
    const choice = choosePlayProgram('try', section, derive(gate, section))!
    expect(choice).toMatchObject({ source: 'saved', name: 'Open wide', programId: program.id })
    expect(JSON.stringify(choice.ir)).toContain('45')
  })

  it('a saved program that ignores the sensor, or does not compile, is passed over for the starter', () => {
    const gate = wiredGate()
    let section = withProgram(gate, gate.section, 'blank', 'Nothing yet')
    expect(choosePlayProgram('try', section, derive(gate, section))).toMatchObject({ source: 'starter', name: 'Smart gate' })
    // A sensor-reading program whose sensor block names a part that is gone: it cannot compile.
    section = withProgram(gate, section, 'smart-gate', 'Broken')
    const broken = section.programs[1]
    const workspace = JSON.parse(JSON.stringify(broken.workspace).split(gate.creation.sensors[0].brickId).join('gone-sensor'))
    section = { ...section, programs: section.programs.map((program) => (program.id === broken.id ? { ...program, workspace } : program)) }
    expect(choosePlayProgram('try', section, derive(gate, section))).toMatchObject({ source: 'starter', programId: null })
  })
})

describe('readsSensor', () => {
  const script = (trigger: ProgramIR['scripts'][number]['trigger'], body: ProgramIR['scripts'][number]['body']): ProgramIR => ({ irVersion: 1, scripts: [{ id: 's', trigger, body, hatBlockId: 'h' }] })
  it('a "when … sees something" hat, or a sensor read anywhere inside a script', () => {
    expect(readsSensor(script({ kind: 'sensorSees', deviceId: 'x' }, []))).toBe(true)
    expect(readsSensor(script({ kind: 'run' }, [{ op: 'forever', body: [{ op: 'if', condition: { kind: 'binary', op: '<', left: { kind: 'sensorDistance', deviceId: 'x' }, right: { kind: 'number', value: 3 } }, then: [] }] }]))).toBe(true)
    expect(readsSensor(script({ kind: 'run' }, [{ op: 'waitUntil', condition: { kind: 'not', operand: { kind: 'sensorSees', deviceId: 'x', withinStuds: { kind: 'number', value: 5 } } } }]))).toBe(true)
    expect(readsSensor(script({ kind: 'run' }, [{ op: 'turnMotorTo', deviceId: 'arm', degrees: { kind: 'number', value: 90 } }, { op: 'wait', seconds: { kind: 'timer' } }]))).toBe(false)
  })
})
