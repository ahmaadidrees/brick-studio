import { describe, expect, it } from 'vitest'
import { ROVER_IDS } from '../model/fixtures'
import { compileContextFor, compileProgram } from '../program/compile'
import { startersFor } from '../program/starters'
import { wiredRover } from '../program/testFixtures'
import { IR_LIMITS, SENSOR_MAX_RANGE_STUDS, type Expr, type ProgramIR, type ProgramKey, type Script, type ScriptTrigger, type Stmt } from '../program/types'
import type { ActuatorIntent, RuntimeTickResult, TickSnapshot } from '../run/types'
import { createProgramRuntime } from './index'

const STEP = 0.1

type SnapshotOptions = {
  sensors?: Record<string, number | null>
  motors?: string[]
  buttons?: Record<string, boolean>
  held?: Partial<Record<ProgramKey, boolean>>
  pressed?: ProgramKey[]
  joystick?: { up?: number; right?: number }
}

function snapshot(tick: number, options: SnapshotOptions = {}, fixedStep = STEP): TickSnapshot {
  const sensors: TickSnapshot['sensors'] = {}
  for (const [id, distance] of Object.entries(options.sensors ?? {})) sensors[id] = distance === null ? { distanceStuds: SENSOR_MAX_RANGE_STUDS, hit: false } : { distanceStuds: distance, hit: true }
  const motors: TickSnapshot['motors'] = {}
  for (const id of options.motors ?? ['m1', 'm2']) motors[id] = { powerPercent: 0, speedPercent: 0, positionDegrees: 0, plugged: true }
  return {
    tick,
    timeSeconds: tick * fixedStep,
    input: {
      held: { up: false, down: false, left: false, right: false, space: false, ...options.held },
      pressed: options.pressed ?? [],
      joystick: { up: options.joystick?.up ?? 0, right: options.joystick?.right ?? 0 },
    },
    sensors,
    motors,
    buttons: options.buttons ?? {},
  }
}

const n = (value: number, blockId = `n${value}`): Expr => ({ kind: 'number', value, blockId })
const v = (name: string): Expr => ({ kind: 'variable', name, blockId: `get-${name}` })
const script = (id: string, trigger: ScriptTrigger, body: Stmt[]): Script => ({ id, trigger, body, hatBlockId: `${id}-hat` })
const program = (...scripts: Script[]): ProgramIR => ({ irVersion: 1, scripts })
const runScript = (...body: Stmt[]) => script('s1', { kind: 'run' }, body)
const change = (name: string, by = 1, blockId = 'change'): Stmt => ({ op: 'changeVariable', name, by: n(by), blockId })

/** Ticks a runtime through `count` snapshots built by `make` and returns every result. */
function drive(ir: ProgramIR, count: number, make: (tick: number) => TickSnapshot = (tick) => snapshot(tick)) {
  const runtime = createProgramRuntime(ir, { fixedStep: STEP })
  const results: RuntimeTickResult[] = []
  for (let tick = 0; tick < count; tick += 1) results.push(runtime.tick(make(tick)))
  return { runtime, results }
}

const brief = (intent: ActuatorIntent) => {
  switch (intent.kind) {
    case 'motorPower': return `${intent.deviceId} power ${intent.percent}`
    case 'motorTarget': return `${intent.deviceId} to ${intent.degrees}`
    case 'motorStop': return `${intent.deviceId} stop`
    case 'light': return `${intent.deviceId} ${intent.color ?? 'off'}`
  }
}
const timeline = (results: RuntimeTickResult[]) => results.flatMap((result, tick) => result.intents.map((intent) => `${tick}: ${brief(intent)}`))

describe('scripts and time', () => {
  it('when run starts on the first tick; commands latch: an intent only when a statement executes', () => {
    const { results } = drive(program(runScript({ op: 'runMotor', deviceId: 'm1', percent: n(50), blockId: 'run' })), 5)
    expect(timeline(results)).toEqual(['0: m1 power 50'])
    expect(results[0].intents[0]).toEqual({ kind: 'motorPower', deviceId: 'm1', percent: 50, source: { scriptId: 's1', blockId: 'run', controller: false } })
    expect(results.map((result) => result.idle)).toEqual([true, true, true, true, true])
  })

  it('wait sleeps max(1, round(s / fixedStep)) ticks and the motor keeps its command meanwhile', () => {
    const body: Stmt[] = [
      { op: 'runMotor', deviceId: 'm1', percent: n(50), blockId: 'run' },
      { op: 'wait', seconds: n(0.5), blockId: 'wait' },
      { op: 'stopMotor', deviceId: 'm1', blockId: 'stop' },
      { op: 'wait', seconds: n(0), blockId: 'wait0' },
      { op: 'setLight', deviceId: 'l', color: 'green', blockId: 'light' },
      { op: 'wait', seconds: n(0.04), blockId: 'tiny' },
      { op: 'setLight', deviceId: 'l', color: null, blockId: 'off' },
    ]
    const { results } = drive(program(runScript(...body)), 10)
    expect(timeline(results)).toEqual(['0: m1 power 50', '5: m1 stop', '6: l green', '7: l off'])
    expect(results[2].activeBlockIds).toEqual(['wait'])
    expect(results[2].idle).toBe(false)
  })

  it('wait until re-checks each tick against the fresh snapshot and continues the same tick', () => {
    const ir = program(runScript(
      { op: 'waitUntil', condition: { kind: 'sensorSees', deviceId: 's', withinStuds: n(3), blockId: 'sees' }, blockId: 'until' },
      { op: 'stopAllMotors', blockId: 'stop' },
    ))
    const distances = [10, 8, null, 3, 2.9, 1]
    const { results } = drive(ir, distances.length, (tick) => snapshot(tick, { sensors: { s: distances[tick] } }))
    expect(timeline(results)).toEqual(['4: m1 stop', '4: m2 stop'])
    expect(results[3].activeBlockIds).toEqual(['until'])
  })

  it('reporters read the snapshot: distance, sees, position, speed, buttons, joystick, keys, timer', () => {
    const set = (name: string, value: Expr): Stmt => ({ op: 'setVariable', name, value, blockId: `set-${name}` })
    const ir = program(runScript(
      set('distance', { kind: 'sensorDistance', deviceId: 's' }),
      set('none', { kind: 'sensorDistance', deviceId: 'absent' }),
      set('sees', { kind: 'sensorSees', deviceId: 's', withinStuds: n(5) }),
      set('position', { kind: 'motorPosition', deviceId: 'm1' }),
      set('speed', { kind: 'motorSpeed', deviceId: 'm1' }),
      set('button', { kind: 'buttonPressed', deviceId: 'b' }),
      set('joystick', { kind: 'joystick', axis: 'right' }),
      set('key', { kind: 'keyHeld', key: 'space' }),
      set('timer', { kind: 'timer' }),
      set('math', { kind: 'binary', op: 'min', left: { kind: 'binary', op: '*', left: n(3), right: n(4) }, right: n(10) }),
    ))
    const shot = snapshot(0, { sensors: { s: 4.5 }, buttons: { b: true }, held: { space: true }, joystick: { right: 250 } })
    shot.motors.m1 = { powerPercent: 20, speedPercent: -12, positionDegrees: 45, plugged: true }
    shot.timeSeconds = 1.5
    const result = createProgramRuntime(ir, { fixedStep: STEP }).tick(shot)
    expect(result.variables).toEqual({ distance: 4.5, none: SENSOR_MAX_RANGE_STUDS, sees: true, position: 45, speed: -12, button: true, joystick: 100, key: true, timer: 1.5, math: 10 })
  })
})

describe('control flow', () => {
  it('forever runs one pass per tick', () => {
    const { results } = drive(program(runScript({ op: 'forever', body: [change('x')], blockId: 'forever' })), 5)
    expect(results.map((result) => result.variables.x)).toEqual([1, 2, 3, 4, 5])
    expect(results.at(-1)!.idle).toBe(false)
  })

  it('repeat runs its body that many times without yielding; the count is floored and clamped', () => {
    const { results } = drive(program(runScript(
      { op: 'repeat', count: n(3.7), body: [change('x')], blockId: 'r1' },
      { op: 'repeat', count: n(-2), body: [change('y')], blockId: 'r2' },
      { op: 'repeat', count: n(0), body: [change('y')], blockId: 'r3' },
    )), 1)
    expect(results[0].variables).toEqual({ x: 3 })
  })

  it('if and else pick a branch; stop this script ends it and leaves its motors running', () => {
    const ir = program(runScript(
      { op: 'runMotor', deviceId: 'm1', percent: n(30), blockId: 'run' },
      { op: 'if', condition: { kind: 'binary', op: '>', left: n(2), right: n(1) }, then: [change('yes')], else: [change('no')], blockId: 'if' },
      { op: 'if', condition: { kind: 'boolean', value: false }, then: [change('never')], blockId: 'if2' },
      { op: 'stopScript', blockId: 'end' },
      change('after'),
    ))
    const { results } = drive(ir, 3)
    expect(results[0].variables).toEqual({ yes: 1 })
    expect(timeline(results)).toEqual(['0: m1 power 30'])
    expect(results[0].idle).toBe(true)
  })

  it('variables are shared by scripts; set keeps booleans; change adds', () => {
    const ir = program(
      runScript({ op: 'setVariable', name: 'flag', value: { kind: 'boolean', value: true }, blockId: 'set' }, change('count', 2)),
      script('s2', { kind: 'run' }, [change('count', 3), { op: 'setVariable', name: 'copy', value: v('count'), blockId: 'copy' }]),
    )
    expect(drive(ir, 1).results[0].variables).toEqual({ flag: true, count: 5, copy: 5 })
  })
})

describe('event hats', () => {
  const doorScript = (trigger: ScriptTrigger) => script('door', trigger, [
    { op: 'turnMotorTo', deviceId: 'arm', degrees: n(90), blockId: 'open' },
    { op: 'wait', seconds: n(0.3), blockId: 'wait' },
    { op: 'turnMotorTo', deviceId: 'arm', degrees: n(0), blockId: 'close' },
  ])

  it('sensor sees something: a rising edge within 5 studs starts it; triggers while it runs are ignored', () => {
    // Seen at 0, gone at 1, seen again at 2 (while still running: ignored), gone at 4, seen at 6.
    const seen = [4, null, 3, 3, 8, 8, 1, 1, 1, 1]
    const { results } = drive(program(doorScript({ kind: 'sensorSees', deviceId: 's' })), seen.length, (tick) => snapshot(tick, { sensors: { s: seen[tick] } }))
    expect(timeline(results)).toEqual(['0: arm to 90', '3: arm to 0', '6: arm to 90', '9: arm to 0'])
    // 8 studs away is in range but not "sees something" (5 studs).
    expect(results.every((result) => !result.idle)).toBe(true)
  })

  it('an edge that starts and ends while the script runs does not queue a second run', () => {
    const seen = [1, null, 1, null, null, null, null]
    const { results } = drive(program(doorScript({ kind: 'sensorSees', deviceId: 's' })), seen.length, (tick) => snapshot(tick, { sensors: { s: seen[tick] } }))
    expect(timeline(results)).toEqual(['0: arm to 90', '3: arm to 0'])
  })

  it('button pressed fires on the press, not while held', () => {
    const down = [false, true, true, true, true, false, true]
    const { results } = drive(program(script('b', { kind: 'buttonPressed', deviceId: 'btn' }, [change('presses')])), down.length, (tick) => snapshot(tick, { buttons: { btn: down[tick] } }))
    expect(results.map((result) => result.variables.presses ?? 0)).toEqual([0, 1, 1, 1, 1, 1, 2])
  })

  it('key pressed fires on each press (the pressed list, or held rising between samples)', () => {
    const frames: SnapshotOptions[] = [{}, { pressed: ['space'], held: { space: true } }, { held: { space: true } }, {}, { held: { space: true } }, { pressed: ['up'] }]
    const { results } = drive(program(script('k', { kind: 'keyPressed', key: 'space' }, [change('presses')])), frames.length, (tick) => snapshot(tick, frames[tick]))
    expect(results.map((result) => result.variables.presses ?? 0)).toEqual([0, 1, 1, 1, 2, 2])
  })
})

describe('controller scripts', () => {
  const arcade: Stmt[] = [
    { op: 'runMotor', deviceId: 'm1', percent: { kind: 'binary', op: '+', left: { kind: 'joystick', axis: 'up' }, right: { kind: 'joystick', axis: 'right' } }, blockId: 'left' },
    { op: 'runMotor', deviceId: 'm2', percent: { kind: 'binary', op: '-', left: { kind: 'joystick', axis: 'up' }, right: { kind: 'joystick', axis: 'right' } }, blockId: 'right' },
  ]

  it('when joystick moves: every tick off centre plus the tick it returns; last in the tick; marked controller; clamped', () => {
    const joystick = [{}, { up: 50 }, { up: 80, right: 40 }, {}, {}]
    const ir = program(
      script('joy', { kind: 'joystickMoves' }, arcade),
      runScript({ op: 'runMotor', deviceId: 'm1', percent: n(10), blockId: 'auto' }),
    )
    const { results } = drive(ir, joystick.length, (tick) => snapshot(tick, { joystick: joystick[tick] }))
    expect(timeline(results)).toEqual(['0: m1 power 10', '1: m1 power 50', '1: m2 power 50', '2: m1 power 100', '2: m2 power 40', '3: m1 power 0', '3: m2 power 0'])
    expect(results[1].intents[0].source).toEqual({ scriptId: 'joy', blockId: 'left', controller: true })
    expect(results[1].activeBlockIds).toEqual(['joy-hat'])
    expect(results[4].idle).toBe(false)
  })

  it('runs after every autonomous script even when it comes first in the program', () => {
    const ir = program(
      script('every', { kind: 'controlsUpdate' }, [{ op: 'runMotor', deviceId: 'm1', percent: n(1), blockId: 'ctl' }]),
      runScript({ op: 'runMotor', deviceId: 'm1', percent: n(2), blockId: 'auto' }),
    )
    const { results } = drive(ir, 3)
    expect(timeline(results)).toEqual(['0: m1 power 2', '0: m1 power 1', '1: m1 power 1', '2: m1 power 1'])
  })

  it('may not yield: one that waits is switched off, its output that tick dropped, its motors braked, reported once', () => {
    const ir = program(script('every', { kind: 'controlsUpdate' }, [
      { op: 'if', condition: { kind: 'binary', op: '>', left: { kind: 'timer' }, right: n(0.15) }, then: [{ op: 'wait', seconds: n(1), blockId: 'wait' }], blockId: 'if' },
      { op: 'runMotor', deviceId: 'm1', percent: n(60), blockId: 'run' },
    ]))
    const { results } = drive(ir, 5)
    expect(timeline(results)).toEqual(['0: m1 power 60', '1: m1 power 60', '2: m1 stop'])
    expect(results[2].diagnostics).toEqual([{ code: 'program.controller-waits', severity: 'error', message: expect.stringContaining('can’t wait'), blockId: 'wait', scriptId: 'every' }])
    expect(results[3].diagnostics).toEqual([])
    expect(results[4].idle).toBe(true)
  })

  it('a controller that loops forever or runs out of budget is switched off too', () => {
    const forever = drive(program(script('c', { kind: 'controlsUpdate' }, [{ op: 'forever', body: [], blockId: 'loop' }])), 2).results
    expect(forever[0].diagnostics).toEqual([expect.objectContaining({ code: 'program.controller-waits', blockId: 'loop' })])
    const heavy = drive(program(script('c', { kind: 'controlsUpdate' }, [{ op: 'repeat', count: n(IR_LIMITS.maxRepeatCount), body: [change('x')], blockId: 'rep' }])), 2).results
    expect(heavy[0].diagnostics).toEqual([expect.objectContaining({ code: 'runtime.budget-exceeded', severity: 'error', scriptId: 'c' })])
    expect(heavy[1].variables.x).toBeLessThan(IR_LIMITS.maxRepeatCount)
  })
})

describe('actuators, faults, budget and stop', () => {
  it('stop motors stops every motor in the snapshot', () => {
    const { results } = drive(program(runScript({ op: 'stopAllMotors', blockId: 'stop' })), 1, (tick) => snapshot(tick, { motors: ['a', 'b', 'arm'] }))
    expect(timeline(results)).toEqual(['0: a stop', '0: b stop', '0: arm stop'])
  })

  it('a non-finite result stops the script with an error and brakes the motors it drove', () => {
    const huge: Expr = { kind: 'binary', op: '*', left: n(1e308), right: n(10), blockId: 'times' }
    const { results } = drive(program(runScript(
      { op: 'runMotor', deviceId: 'm1', percent: n(40), blockId: 'run' },
      { op: 'wait', seconds: n(0.1), blockId: 'wait' },
      { op: 'runMotor', deviceId: 'm2', percent: huge, blockId: 'bad' },
    )), 3)
    expect(timeline(results)).toEqual(['0: m1 power 40', '1: m1 stop'])
    expect(results[1].diagnostics).toEqual([{ code: 'runtime.non-finite', severity: 'error', message: 'This math made a number too big to use. Check the numbers in it.', blockId: 'times', scriptId: 's1' }])
    expect(results[2].idle).toBe(true)
  })

  it('dividing by zero gives 0 and one info note, however often it happens', () => {
    const { results } = drive(program(runScript({ op: 'forever', body: [{ op: 'setVariable', name: 'q', value: { kind: 'binary', op: '/', left: n(5), right: n(0), blockId: 'div' }, blockId: 'set' }], blockId: 'loop' })), 4)
    expect(results.map((result) => result.variables.q)).toEqual([0, 0, 0, 0])
    expect(results.flatMap((result) => result.diagnostics)).toEqual([{ code: 'runtime.non-finite', severity: 'info', message: 'Dividing by zero counts as 0 here.', blockId: 'div', scriptId: 's1' }])
  })

  it('a long repeat is paused when it spends its share of the budget and resumes next tick', () => {
    const ir = program(runScript({ op: 'repeat', count: n(IR_LIMITS.maxRepeatCount), body: [change('x')], blockId: 'rep' }, change('done')))
    const { results } = drive(ir, 12)
    const xs = results.map((result) => result.variables.x as number)
    expect(xs[0]).toBeGreaterThan(0)
    expect(xs[0]).toBeLessThan(IR_LIMITS.maxRepeatCount)
    expect(xs.at(-1)).toBe(IR_LIMITS.maxRepeatCount)
    expect(results.at(-1)!.variables.done).toBe(1)
    expect(results.flatMap((result) => result.diagnostics)).toEqual([])
    // Two scripts share the budget evenly.
    const shared = drive(program(
      runScript({ op: 'repeat', count: n(IR_LIMITS.maxRepeatCount), body: [change('x')], blockId: 'rep' }),
      script('s2', { kind: 'run' }, [{ op: 'repeat', count: n(IR_LIMITS.maxRepeatCount), body: [change('y')], blockId: 'rep2' }]),
    ), 1).results[0].variables
    expect(Math.abs((shared.x as number) - (shared.y as number))).toBeLessThanOrEqual(1)
    expect((shared.x as number) + (shared.y as number)).toBeLessThanOrEqual(xs[0] + 1)
  })

  it('a single statement too big for one tick can never finish, so it stops with an error', () => {
    // Wide and shallow (the compiler caps depth at 32): 2^13 leaves, over the whole tick budget.
    const tree = (depth: number): Expr => (depth === 0 ? n(1) : { kind: 'binary', op: '+', left: tree(depth - 1), right: tree(depth - 1), blockId: 'sum' })
    const heavy = tree(13)
    const { results } = drive(program(runScript({ op: 'setVariable', name: 'x', value: heavy, blockId: 'set' })), 2)
    expect(results[0].diagnostics).toEqual([expect.objectContaining({ code: 'runtime.budget-exceeded', severity: 'error', scriptId: 's1' })])
    expect(results[0].variables).toEqual({})
    expect(results[1].idle).toBe(true)
  })

  it('stop cancels everything; later ticks return nothing', () => {
    const ir = program(
      runScript({ op: 'forever', body: [{ op: 'runMotor', deviceId: 'm1', percent: n(20), blockId: 'run' }], blockId: 'loop' }),
      script('joy', { kind: 'controlsUpdate' }, [{ op: 'runMotor', deviceId: 'm2', percent: n(5), blockId: 'ctl' }]),
    )
    const runtime = createProgramRuntime(ir, { fixedStep: STEP })
    expect(runtime.tick(snapshot(0)).intents).toHaveLength(2)
    runtime.stop()
    runtime.stop()
    expect(runtime.tick(snapshot(1))).toEqual({ intents: [], activeBlockIds: [], diagnostics: [], variables: {}, idle: true })
  })

  it('is deterministic: the same program and snapshots give the same results', () => {
    const ir = program(
      runScript({ op: 'forever', body: [change('x'), { op: 'if', condition: { kind: 'sensorSees', deviceId: 's', withinStuds: n(3) }, then: [{ op: 'stopAllMotors', blockId: 'stop' }], blockId: 'if' }], blockId: 'loop' }),
      script('door', { kind: 'sensorSees', deviceId: 's' }, [{ op: 'setLight', deviceId: 'l', color: 'red', blockId: 'red' }, { op: 'wait', seconds: n(0.2), blockId: 'w' }]),
      script('joy', { kind: 'joystickMoves' }, [{ op: 'runMotor', deviceId: 'm1', percent: { kind: 'joystick', axis: 'up' }, blockId: 'j' }]),
    )
    const make = (tick: number) => snapshot(tick, { sensors: { s: 10 - tick }, joystick: { up: tick % 3 === 0 ? 0 : 40 } })
    expect(drive(ir, 12, make).results).toEqual(drive(ir, 12, make).results)
  })
})

describe('end to end: the stop-before-wall starter on the rover', () => {
  it('drives with the right motor’s reversal applied, then stops both motors once the wall is closer than 3 studs', () => {
    const { creation } = wiredRover()
    const starter = startersFor(creation).find((candidate) => candidate.id === 'stop-before-wall')!
    const compiled = compileProgram(starter.workspace, compileContextFor(creation))
    expect(compiled.ok).toBe(true)
    const runtime = createProgramRuntime(compiled.ir, { fixedStep: 1 / 60 })
    const distances = Array.from({ length: 17 }, (_, index) => 10 - index * 0.5) // 10, 9.5, … 2
    const results = distances.map((distance, tick) => {
      const shot = snapshot(tick, { sensors: { [ROVER_IDS.sensor]: distance }, motors: [ROVER_IDS.leftMotor, ROVER_IDS.rightMotor] }, 1 / 60)
      return runtime.tick(shot)
    })
    const source = (blockId: string) => ({ scriptId: 'stop-before-wall:when-run', blockId, controller: false })
    expect(results[0].intents).toEqual([
      { kind: 'motorPower', deviceId: ROVER_IDS.leftMotor, percent: 40, source: source('stop-before-wall:drive') },
      { kind: 'motorPower', deviceId: ROVER_IDS.rightMotor, percent: -40, source: source('stop-before-wall:drive') },
    ])
    const stopTick = distances.findIndex((distance) => distance < 3)
    expect(distances[stopTick]).toBe(2.5)
    results.forEach((result, tick) => {
      if (tick !== 0 && tick !== stopTick) expect(result.intents, `tick ${tick}`).toEqual([])
    })
    expect(results[stopTick].intents).toEqual([
      { kind: 'motorStop', deviceId: ROVER_IDS.leftMotor, source: source('stop-before-wall:stop') },
      { kind: 'motorStop', deviceId: ROVER_IDS.rightMotor, source: source('stop-before-wall:stop') },
    ])
    expect(results[stopTick - 1].activeBlockIds).toEqual(['stop-before-wall:wait-until'])
    expect(results[stopTick].idle).toBe(true)
    expect(results.flatMap((result) => result.diagnostics)).toEqual([])
  })
})
