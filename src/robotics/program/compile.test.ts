import { describe, expect, it } from 'vitest'
import { GATE_IDS, ROVER_IDS, SIGNAL_IDS } from '../model/fixtures'
import { compileContextFor, compileProgram, describeIR, type CompileContext } from './compile'
import { defaultStarterFor, startersFor } from './starters'
import { wiredCreation, wiredGate, wiredRover, wiredSignalPost } from './testFixtures'
import { IR_LIMITS, PROGRAM_LIMITS, type Stmt } from './types'
import { roverBricks } from '../model/fixtures'

type B = { type: string; id: string; fields?: Record<string, unknown>; inputs?: Record<string, unknown>; next?: { block: B }; enabled?: boolean; x?: number; y?: number }
const b = (type: string, id: string, rest: Omit<B, 'type' | 'id'> = {}): B => ({ type, id, ...rest })
const num = (value: number, id: string) => ({ shadow: b('robo_number', id, { fields: { NUM: value } }) })
const val = (block: B) => ({ block })
const chain = (...blocks: B[]): B => {
  for (let index = blocks.length - 1; index > 0; index -= 1) blocks[index - 1].next = { block: blocks[index] }
  return blocks[0]
}
const ws = (...tops: B[]) => ({ blocks: { languageVersion: 0, blocks: tops } })
const whenRun = (...body: B[]) => chain(b('robo_when_run', 'hat'), ...body)

/** A hand-made context: motors m1 (A), m2 (B, reversed), hinge h (C), sensor s (D), light l and button k unplugged. */
const context = (overrides: Partial<CompileContext> = {}): CompileContext => ({
  creationName: 'Buggy',
  devices: {
    m1: { id: 'm1', name: 'Left motor', kind: 'motor', plugged: true, port: 'A' },
    m2: { id: 'm2', name: 'Right motor', kind: 'motor', plugged: true, port: 'B' },
    h: { id: 'h', name: 'Arm motor', kind: 'hinge', plugged: true, port: 'C' },
    s: { id: 's', name: 'Front sensor', kind: 'sensor', plugged: true, port: 'D' },
    l: { id: 'l', name: 'Light', kind: 'light', plugged: false, port: null },
    k: { id: 'k', name: 'Button', kind: 'button', plugged: false, port: null },
  },
  drivePair: { leftId: 'm1', rightId: 'm2', reversedIds: ['m2'] },
  deviceNames: {},
  ...overrides,
})

const bodyOf = (workspace: unknown, ctx = context()) => {
  const result = compileProgram(workspace, ctx)
  return result.ir.scripts[0]?.body ?? []
}

describe('every block compiles to the intended IR', () => {
  it('hats become script triggers, in workspace order, with the hat block id', () => {
    const result = compileProgram(ws(
      b('robo_when_run', 'h1'),
      b('robo_when_sensor_sees', 'h2', { fields: { SENSOR: 's' } }),
      b('robo_when_button_pressed', 'h3', { fields: { BUTTON: 'k' } }),
      b('robo_when_key_pressed', 'h4', { fields: { KEY: 'space' } }),
      b('robo_when_joystick_moves', 'h5'),
      b('robo_when_controls_update', 'h6'),
    ), context())
    expect(result.ir.scripts.map((script) => [script.id, script.hatBlockId, script.trigger])).toEqual([
      ['h1', 'h1', { kind: 'run' }],
      ['h2', 'h2', { kind: 'sensorSees', deviceId: 's' }],
      ['h3', 'h3', { kind: 'buttonPressed', deviceId: 'k' }],
      ['h4', 'h4', { kind: 'keyPressed', key: 'space' }],
      ['h5', 'h5', { kind: 'joystickMoves' }],
      ['h6', 'h6', { kind: 'controlsUpdate' }],
    ])
    expect(result.ok).toBe(true)
  })

  it('motor, light and control statements', () => {
    const body = bodyOf(ws(whenRun(
      b('robo_run_motor', 'run', { fields: { MOTOR: 'm1' }, inputs: { POWER: num(50, 'n50') } }),
      b('robo_turn_motor_to', 'turn', { fields: { MOTOR: 'h' }, inputs: { DEGREES: num(90, 'n90') } }),
      b('robo_stop_motor', 'stop', { fields: { MOTOR: 'm1' } }),
      b('robo_stop_motors', 'stopAll'),
      b('robo_set_light', 'red', { fields: { LIGHT: 'l', COLOR: 'red' } }),
      b('robo_light_off', 'off', { fields: { LIGHT: 'l' } }),
      b('robo_wait', 'wait', { inputs: { SECONDS: num(1, 'n1') } }),
      b('robo_wait_until', 'until', { inputs: { CONDITION: val(b('robo_button_pressed', 'pressed', { fields: { BUTTON: 'k' } })) } }),
      b('robo_repeat', 'repeat', { inputs: { TIMES: num(10, 'n10'), DO: val(b('robo_stop_motors', 'inner')) } }),
      b('robo_if', 'if', { inputs: { CONDITION: val(b('robo_key_held', 'held', { fields: { KEY: 'up' } })), DO: val(b('robo_stop_script', 'end1')) } }),
      b('robo_if_else', 'ifelse', { inputs: { CONDITION: val(b('robo_not', 'not', { inputs: { VALUE: val(b('robo_key_held', 'held2', { fields: { KEY: 'down' } })) } })), DO: val(b('robo_stop_motors', 'a')), ELSE: val(b('robo_stop_script', 'end2')) } }),
      b('robo_forever', 'forever', { inputs: { DO: val(b('robo_wait', 'w2', { inputs: { SECONDS: num(0.5, 'half') } })) } }),
    )))
    expect(body).toEqual<Stmt[]>([
      { op: 'runMotor', deviceId: 'm1', percent: { kind: 'number', value: 50, blockId: 'n50' }, blockId: 'run' },
      { op: 'turnMotorTo', deviceId: 'h', degrees: { kind: 'number', value: 90, blockId: 'n90' }, blockId: 'turn' },
      { op: 'stopMotor', deviceId: 'm1', blockId: 'stop' },
      { op: 'stopAllMotors', blockId: 'stopAll' },
      { op: 'setLight', deviceId: 'l', color: 'red', blockId: 'red' },
      { op: 'setLight', deviceId: 'l', color: null, blockId: 'off' },
      { op: 'wait', seconds: { kind: 'number', value: 1, blockId: 'n1' }, blockId: 'wait' },
      { op: 'waitUntil', condition: { kind: 'buttonPressed', deviceId: 'k', blockId: 'pressed' }, blockId: 'until' },
      { op: 'repeat', count: { kind: 'number', value: 10, blockId: 'n10' }, body: [{ op: 'stopAllMotors', blockId: 'inner' }], blockId: 'repeat' },
      { op: 'if', condition: { kind: 'keyHeld', key: 'up', blockId: 'held' }, then: [{ op: 'stopScript', blockId: 'end1' }], blockId: 'if' },
      { op: 'if', condition: { kind: 'not', operand: { kind: 'keyHeld', key: 'down', blockId: 'held2' }, blockId: 'not' }, then: [{ op: 'stopAllMotors', blockId: 'a' }], else: [{ op: 'stopScript', blockId: 'end2' }], blockId: 'ifelse' },
      { op: 'forever', body: [{ op: 'wait', seconds: { kind: 'number', value: 0.5, blockId: 'half' }, blockId: 'w2' }], blockId: 'forever' },
    ])
  })

  it('sensing, input, logic and math reporters', () => {
    const set = (id: string, reporter: B) => b('robo_set_variable', id, { fields: { VAR: { id: 'v1' } }, inputs: { VALUE: val(reporter) } })
    const workspace = {
      ...ws(whenRun(
        set('s1', b('robo_sensor_distance', 'dist', { fields: { SENSOR: 's' } })),
        set('s2', b('robo_sensor_sees', 'sees', { fields: { SENSOR: 's' }, inputs: { STUDS: num(3, 'n3') } })),
        set('s3', b('robo_motor_position', 'pos', { fields: { MOTOR: 'h' } })),
        set('s4', b('robo_motor_speed', 'speed', { fields: { MOTOR: 'm1' } })),
        set('s5', b('robo_timer', 'timer')),
        set('s6', b('robo_joystick', 'joy', { fields: { AXIS: 'right' } })),
        set('s7', b('robo_compare', 'cmp', { fields: { OP: 'GTE' }, inputs: { A: num(1, 'a1'), B: num(2, 'b1') } })),
        set('s8', b('robo_and_or', 'or', { fields: { OP: 'OR' }, inputs: { A: val(b('robo_key_held', 'kh', { fields: { KEY: 'left' } })), B: val(b('robo_button_pressed', 'bp', { fields: { BUTTON: 'k' } })) } })),
        set('s9', b('robo_arithmetic', 'div', { fields: { OP: 'DIVIDE' }, inputs: { A: num(6, 'a2'), B: val(b('robo_variable', 'get', { fields: { VAR: { id: 'v1' } } })) } })),
        set('s10', b('robo_min_max', 'max', { fields: { OP: 'MAX' }, inputs: { A: num(1, 'a3'), B: num(2, 'b3') } })),
        b('robo_change_variable', 'change', { fields: { VAR: { id: 'v1' } }, inputs: { BY: num(1, 'by') } }),
      )),
      variables: [{ id: 'v1', name: 'speed' }],
    }
    const result = compileProgram(workspace, context())
    expect(result.ok).toBe(true)
    const values = result.ir.scripts[0].body.map((stmt) => (stmt.op === 'setVariable' ? stmt.value : stmt))
    expect(values).toEqual([
      { kind: 'sensorDistance', deviceId: 's', blockId: 'dist' },
      { kind: 'sensorSees', deviceId: 's', withinStuds: { kind: 'number', value: 3, blockId: 'n3' }, blockId: 'sees' },
      { kind: 'motorPosition', deviceId: 'h', blockId: 'pos' },
      { kind: 'motorSpeed', deviceId: 'm1', blockId: 'speed' },
      { kind: 'timer', blockId: 'timer' },
      { kind: 'joystick', axis: 'right', blockId: 'joy' },
      { kind: 'binary', op: '>=', left: { kind: 'number', value: 1, blockId: 'a1' }, right: { kind: 'number', value: 2, blockId: 'b1' }, blockId: 'cmp' },
      { kind: 'binary', op: 'or', left: { kind: 'keyHeld', key: 'left', blockId: 'kh' }, right: { kind: 'buttonPressed', deviceId: 'k', blockId: 'bp' }, blockId: 'or' },
      { kind: 'binary', op: '/', left: { kind: 'number', value: 6, blockId: 'a2' }, right: { kind: 'variable', name: 'speed', blockId: 'get' }, blockId: 'div' },
      { kind: 'binary', op: 'max', left: { kind: 'number', value: 1, blockId: 'a3' }, right: { kind: 'number', value: 2, blockId: 'b3' }, blockId: 'max' },
      { op: 'changeVariable', name: 'speed', by: { kind: 'number', value: 1, blockId: 'by' }, blockId: 'change' },
    ])
    expect((result.ir.scripts[0].body[0] as { name: string }).name).toBe('speed')
  })

  it('accepts Blockly’s own number and variable blocks as aliases', () => {
    const body = bodyOf({
      ...ws(whenRun(
        b('variables_set', 'set', { fields: { VAR: { id: 'v' } }, inputs: { VALUE: { shadow: b('math_number', 'n', { fields: { NUM: 4 } }) } } }),
        b('math_change', 'change', { fields: { VAR: { id: 'v' } }, inputs: { DELTA: num(2, 'by') } }),
        b('robo_run_motor', 'run', { fields: { MOTOR: 'm1' }, inputs: { POWER: val(b('variables_get', 'get', { fields: { VAR: { id: 'v' } } })) } }),
      )),
      variables: [{ id: 'v', name: 'power' }],
    })
    expect(body).toEqual([
      { op: 'setVariable', name: 'power', value: { kind: 'number', value: 4, blockId: 'n' }, blockId: 'set' },
      { op: 'changeVariable', name: 'power', by: { kind: 'number', value: 2, blockId: 'by' }, blockId: 'change' },
      { op: 'runMotor', deviceId: 'm1', percent: { kind: 'variable', name: 'power', blockId: 'get' }, blockId: 'run' },
    ])
  })

  it('a real block over a shadow compiles the real block; disabled blocks are skipped', () => {
    const body = bodyOf(ws(whenRun(
      b('robo_wait', 'wait', { inputs: { SECONDS: { block: b('robo_timer', 't'), shadow: b('robo_number', 'shadow', { fields: { NUM: 1 } }) } } }),
      b('robo_stop_motors', 'skipped', { enabled: false }),
      b('robo_stop_motors', 'kept'),
    )))
    expect(body).toEqual([
      { op: 'wait', seconds: { kind: 'timer', blockId: 't' }, blockId: 'wait' },
      { op: 'stopAllMotors', blockId: 'kept' },
    ])
  })
})

describe('helpers on the drive pair', () => {
  const drive = (direction: string, power = 40) => ws(whenRun(b('robo_drive', 'drive', { fields: { DIRECTION: direction }, inputs: { POWER: num(power, 'p') } })))

  it('drive forward folds the right motor’s reversal into its sign', () => {
    expect(describeIR(compileProgram(drive('forward'), context()).ir)).toBe('when run\n  run m1 at 40\n  run m2 at -40')
    expect(describeIR(compileProgram(drive('backward'), context()).ir)).toBe('when run\n  run m1 at -40\n  run m2 at 40')
    // Nothing reversed: both the same sign.
    expect(describeIR(compileProgram(drive('forward'), context({ drivePair: { leftId: 'm1', rightId: 'm2', reversedIds: [] } })).ir)).toBe('when run\n  run m1 at 40\n  run m2 at 40')
  })

  it('a computed power is negated as an expression, keeping block ids', () => {
    const workspace = ws(whenRun(b('robo_drive', 'drive', { fields: { DIRECTION: 'forward' }, inputs: { POWER: val(b('robo_timer', 't')) } })))
    const [left, right] = bodyOf(workspace)
    expect(left).toEqual({ op: 'runMotor', deviceId: 'm1', percent: { kind: 'timer', blockId: 't' }, blockId: 'drive' })
    expect(right).toEqual({ op: 'runMotor', deviceId: 'm2', percent: { kind: 'binary', op: '-', left: { kind: 'number', value: 0, blockId: 'drive' }, right: { kind: 'timer', blockId: 't' }, blockId: 'drive' }, blockId: 'drive' })
  })

  it('turn spins in place, waits, then stops both drive motors', () => {
    const turn = (direction: string) => ws(whenRun(b('robo_turn', 'turn', { fields: { DIRECTION: direction }, inputs: { POWER: num(30, 'p'), SECONDS: num(1.5, 's') } })))
    expect(describeIR(compileProgram(turn('left'), context()).ir)).toBe('when run\n  run m1 at -30\n  run m2 at -30\n  wait 1.5\n  stop m1\n  stop m2')
    expect(describeIR(compileProgram(turn('right'), context()).ir)).toBe('when run\n  run m1 at 30\n  run m2 at 30\n  wait 1.5\n  stop m1\n  stop m2')
    expect(describeIR(compileProgram(turn('left'), context({ drivePair: { leftId: 'm1', rightId: 'm2', reversedIds: [] } })).ir)).toBe('when run\n  run m1 at -30\n  run m2 at 30\n  wait 1.5\n  stop m1\n  stop m2')
  })

  it('drive using joystick is the arcade mix over joystick reporters', () => {
    const workspace = ws(chain(b('robo_when_joystick_moves', 'hat'), b('robo_drive_joystick', 'joy')))
    expect(describeIR(compileProgram(workspace, context({ drivePair: { leftId: 'm1', rightId: 'm2', reversedIds: [] } })).ir))
      .toBe('when joystickMoves\n  run m1 at (joystick.up + joystick.right)\n  run m2 at (joystick.up - joystick.right)')
    expect(describeIR(compileProgram(workspace, context()).ir))
      .toBe('when joystickMoves\n  run m1 at (joystick.up + joystick.right)\n  run m2 at (0 - (joystick.up - joystick.right))')
    for (const stmt of bodyOf(workspace)) expect(stmt.blockId).toBe('joy')
  })

  it('without a drive pair every helper says "Choose two drive motors first" and compiles to nothing', () => {
    const workspace = ws(whenRun(
      b('robo_drive', 'drive', { fields: { DIRECTION: 'forward' }, inputs: { POWER: num(40, 'p') } }),
      b('robo_turn', 'turn', { fields: { DIRECTION: 'left' }, inputs: { POWER: num(40, 'p2'), SECONDS: num(1, 's') } }),
      b('robo_drive_joystick', 'joy'),
      b('robo_stop_motors', 'stop'),
    ))
    const result = compileProgram(workspace, context({ drivePair: null }))
    expect(result.ok).toBe(false)
    expect(result.diagnostics.filter((diagnostic) => diagnostic.code === 'drive.no-pair')).toEqual(['drive', 'turn', 'joy'].map((blockId) => ({ code: 'drive.no-pair', severity: 'error', message: 'Choose two drive motors first', blockId, scriptId: 'hat' })))
    expect(result.ir.scripts[0].body).toEqual([{ op: 'stopAllMotors', blockId: 'stop' }])
  })

  it('without a drive pair the helper says why, from the build: a wheel off its axle', () => {
    const { creation } = wiredRover({ leftWheelOff: true })
    const context = compileContextFor(creation)
    expect(context.drivePairMissing).toBe('Left motor has no wheel on its axle')
    const result = compileProgram(drive('forward', 40), context)
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'drive.no-pair', severity: 'error', message: 'Choose two drive motors first · Left motor has no wheel on its axle' })])
    // With a drive pair there is nothing to explain.
    expect(compileContextFor(wiredRover().creation)).not.toHaveProperty('drivePairMissing')
  })

  it('with the rover fixture: left motor forward, right motor (mounted mirror-wise) negated', () => {
    const { creation } = wiredRover()
    const result = compileProgram(drive('forward', 40), compileContextFor(creation))
    expect(result).toMatchObject({ ok: true, diagnostics: [] })
    expect(describeIR(result.ir)).toBe(`when run\n  run ${ROVER_IDS.leftMotor} at 40\n  run ${ROVER_IDS.rightMotor} at -40`)
  })
})

describe('diagnostics', () => {
  const codes = (workspace: unknown, ctx = context()) => compileProgram(workspace, ctx).diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity, diagnostic.message, diagnostic.blockId])

  it('a missing device names the part from the program’s remembered names; a device elsewhere in the world is not in this creation', () => {
    const workspace = ws(whenRun(b('robo_wait_until', 'until', { inputs: { CONDITION: val(b('robo_sensor_sees', 'sees', { fields: { SENSOR: 'gone' }, inputs: { STUDS: num(3, 'n') } })) } })))
    expect(codes(workspace, context({ deviceNames: { gone: 'front sensor' } }))).toEqual([['device.missing', 'error', 'front sensor is missing', 'sees']])
    expect(codes(workspace)).toEqual([['device.missing', 'error', 'This part is missing', 'sees']])
    expect(codes(workspace, context({ deviceNames: { gone: 'Gate sensor' }, worldBrickIds: new Set(['gone']) }))).toEqual([['device.not-in-creation', 'error', 'Gate sensor is not part of Buggy', 'sees']])
  })

  it('an unplugged device is a warning on its block: the program still runs', () => {
    const result = compileProgram(ws(whenRun(b('robo_set_light', 'red', { fields: { LIGHT: 'l', COLOR: 'red' } }))), context())
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([{ code: 'device.unplugged', severity: 'warning', message: 'Light is not plugged in', blockId: 'red', deviceId: 'l', scriptId: 'hat' }])
    // Through the rover fixture: unplugging the left motor warns on the helper that drives it.
    const { creation } = wiredRover({ unplug: [ROVER_IDS.leftMotor] })
    const drive = compileProgram(ws(whenRun(b('robo_drive', 'drive', { fields: { DIRECTION: 'forward' }, inputs: { POWER: num(40, 'p') } }))), compileContextFor(creation))
    expect(drive.ok).toBe(true)
    expect(drive.diagnostics).toEqual([expect.objectContaining({ code: 'device.unplugged', message: 'Left motor is not plugged in', blockId: 'drive', deviceId: ROVER_IDS.leftMotor })])
  })

  it('a wrong kind of device, or none chosen, is an error', () => {
    expect(codes(ws(whenRun(b('robo_run_motor', 'run', { fields: { MOTOR: 's' }, inputs: { POWER: num(1, 'n') } }))))).toEqual([['device.not-in-creation', 'error', 'Front sensor is not a motor', 'run']])
    expect(codes(ws(whenRun(b('robo_run_motor', 'run', { fields: { MOTOR: '' }, inputs: { POWER: num(1, 'n') } }))))).toEqual([['device.not-in-creation', 'error', 'Pick a motor for this block', 'run']])
    const noLights = context({ devices: {} })
    expect(codes(ws(whenRun(b('robo_light_off', 'off', { fields: { LIGHT: '' } }))), noLights)).toEqual([['device.not-in-creation', 'error', 'Buggy has no light yet', 'off']])
  })

  it('loose blocks are an info note; a workspace with no hat warns', () => {
    const workspace = ws(b('robo_when_run', 'hat'), chain(b('robo_stop_motors', 'loose'), b('robo_stop_motors', 'loose2')))
    expect(codes(workspace)).toEqual([['program.loose-blocks', 'info', 'These blocks are not under a “when” block, so they don’t run. Snap them under one.', 'loose']])
    expect(compileProgram(workspace, context()).ok).toBe(true)
    expect(codes(ws())).toEqual([['program.no-scripts', 'warning', 'Add a “when run” block to start a script.', null]])
    expect(codes({})).toEqual([['program.no-scripts', 'warning', 'Add a “when run” block to start a script.', null]])
  })

  it('a controller script that waits or loops forever is an error on that block, however deep', () => {
    const workspace = ws(chain(
      b('robo_when_joystick_moves', 'hat'),
      b('robo_if', 'if', { inputs: { CONDITION: val(b('robo_key_held', 'k', { fields: { KEY: 'up' } })), DO: val(b('robo_wait', 'wait', { inputs: { SECONDS: num(1, 'n') } })) } }),
      b('robo_repeat', 'repeat', { inputs: { TIMES: num(2, 'n2'), DO: val(b('robo_wait_until', 'until', { inputs: { CONDITION: val(b('robo_key_held', 'k2', { fields: { KEY: 'up' } })) } })) } }),
      b('robo_forever', 'forever'),
    ))
    const result = compileProgram(workspace, context())
    expect(result.ok).toBe(false)
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.blockId])).toEqual([['program.controller-waits', 'wait'], ['program.controller-waits', 'until'], ['program.controller-waits', 'forever']])
    expect(result.diagnostics[0].message).toContain('“when joystick moves” runs all at once')
    // The same blocks under `when run` are fine.
    expect(compileProgram(ws(whenRun(b('robo_wait', 'wait', { inputs: { SECONDS: num(1, 'n') } }))), context()).ok).toBe(true)
  })

  it('empty slots warn and read as 0 / false', () => {
    const result = compileProgram(ws(whenRun(b('robo_wait_until', 'until'), b('robo_run_motor', 'run', { fields: { MOTOR: 'm1' } }))), context())
    expect(result.ok).toBe(true)
    expect(result.diagnostics.map((diagnostic) => [diagnostic.code, diagnostic.severity, diagnostic.blockId])).toEqual([['program.empty-slot', 'warning', 'until'], ['program.empty-slot', 'warning', 'run']])
    expect(result.ir.scripts[0].body).toEqual([
      { op: 'waitUntil', condition: { kind: 'boolean', value: false, blockId: 'until' }, blockId: 'until' },
      { op: 'runMotor', deviceId: 'm1', percent: { kind: 'number', value: 0, blockId: 'run' }, blockId: 'run' },
    ])
  })

  it('unknown blocks, a hat inside a stack and a value used as a statement are errors', () => {
    expect(codes(ws(whenRun(b('controls_whileUntil', 'while'))))).toEqual([['program.unknown-block', 'error', 'This block (controls_whileUntil) is not part of the Robot Workshop. Remove it.', 'while']])
    expect(codes(ws(whenRun(b('robo_when_run', 'inner'))))[0]).toEqual(['program.unknown-block', 'error', 'A “when” block can only start a script, at the top', 'inner'])
    expect(codes(ws(whenRun(b('robo_timer', 'value'))))[0]).toEqual(['program.unknown-block', 'error', 'This block is a value; put it in a slot', 'value'])
    expect(codes(ws(whenRun(b('robo_wait', 'w', { inputs: { SECONDS: val(b('robo_stop_motors', 'cmd')) } }))))[0]).toEqual(['program.unknown-block', 'error', 'This block does something; it can’t go in a slot', 'cmd'])
    expect(codes('{not json')).toEqual([['program.unknown-block', 'error', 'This program could not be read. Start a new one.', null]])
  })

  it('limits: bytes, blocks, depth, scripts and variables', () => {
    const big = { ...ws(whenRun()), padding: 'x'.repeat(PROGRAM_LIMITS.maxWorkspaceBytes) }
    expect(codes(big)[0]).toEqual(['program.too-big', 'error', 'This program is too big (over 200 KB). Split it into two programs.', null])

    const many = ws(whenRun(...Array.from({ length: IR_LIMITS.maxNodes + 1 }, (_, index) => b('robo_stop_motors', `s${index}`))))
    expect(codes(many)[0][0]).toBe('program.too-big')

    let deep: B = b('robo_stop_motors', 'leaf')
    for (let level = 0; level < IR_LIMITS.maxDepth + 1; level += 1) deep = b('robo_forever', `f${level}`, { inputs: { DO: val(deep) } })
    const deepResult = compileProgram(ws(whenRun(deep)), context())
    expect(deepResult.ok).toBe(false)
    expect(deepResult.diagnostics[0].code).toBe('program.too-big')
    expect(deepResult.ir.scripts).toEqual([])

    const scripts = ws(...Array.from({ length: IR_LIMITS.maxScripts + 1 }, (_, index) => b('robo_when_run', `h${index}`)))
    const scriptResult = compileProgram(scripts, context())
    expect(scriptResult.ir.scripts).toHaveLength(IR_LIMITS.maxScripts)
    expect(scriptResult.diagnostics).toEqual([expect.objectContaining({ code: 'program.too-big', blockId: `h${IR_LIMITS.maxScripts}` })])

    const variables = ws(whenRun(...Array.from({ length: IR_LIMITS.maxVariables + 1 }, (_, index) => b('robo_set_variable', `v${index}`, { fields: { VAR: { name: `v${index}` } }, inputs: { VALUE: num(1, `n${index}`) } }))))
    expect(codes(variables).at(-1)?.[0]).toBe('program.too-big')
  })

  it('never throws on hostile input and gives each block id at most one diagnostic per code', () => {
    for (const input of [null, undefined, 42, 'null', [], { blocks: 7 }, { blocks: { blocks: [null, 3, { type: 5 }] } }]) {
      expect(() => compileProgram(input, context())).not.toThrow()
    }
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(compileProgram(cyclic, context()).ok).toBe(false)
    const distance = () => val(b('robo_sensor_distance', 'd', { fields: { SENSOR: 'gone' } }))
    const twice = ws(whenRun(b('robo_wait_until', 'u', { inputs: { CONDITION: val(b('robo_compare', 'cmp', { fields: { OP: 'LT' }, inputs: { A: distance(), B: distance() } })) } })))
    expect(compileProgram(twice, context()).diagnostics.filter((diagnostic) => diagnostic.code === 'device.missing')).toHaveLength(1)
  })
})

describe('starters against the fixture creations', () => {
  it('rover: stop-before-wall, joystick-drive and blank, all compiling cleanly; stop-before-wall is the default', () => {
    const { creation } = wiredRover()
    const starters = startersFor(creation)
    expect(starters.map((starter) => starter.id)).toEqual(['stop-before-wall', 'joystick-drive', 'blank'])
    for (const starter of starters) expect(compileProgram(starter.workspace, compileContextFor(creation)), starter.id).toMatchObject({ ok: true, diagnostics: [] })
    expect(defaultStarterFor(creation).id).toBe('stop-before-wall')
    expect(describeIR(compileProgram(starters[0].workspace, compileContextFor(creation)).ir)).toBe([
      'when run',
      `  run ${ROVER_IDS.leftMotor} at 40`,
      `  run ${ROVER_IDS.rightMotor} at -40`,
      `  wait until sees(${ROVER_IDS.sensor} < 3)`,
      '  stop motors',
    ].join('\n'))
    expect(starters[0].goal).toBe('Try it: change 3 to 6. Does it stop earlier or later?')
    expect(starters[1].controller).toBe(true)
  })

  it('gate: smart-gate turns the arm motor to 90°, waits 2 s and closes', () => {
    const { creation } = wiredGate()
    const starters = startersFor(creation)
    expect(starters.map((starter) => starter.id)).toEqual(['smart-gate', 'blank'])
    expect(defaultStarterFor(creation).id).toBe('smart-gate')
    const result = compileProgram(starters[0].workspace, compileContextFor(creation))
    expect(result).toMatchObject({ ok: true, diagnostics: [] })
    expect(describeIR(result.ir)).toBe(`when sensorSees ${GATE_IDS.sensor}\n  turn ${GATE_IDS.hinge} to 90\n  wait 2\n  turn ${GATE_IDS.hinge} to 0`)
  })

  it('signal post: set the light red, wait, turn it off', () => {
    const { creation } = wiredSignalPost()
    const starters = startersFor(creation)
    expect(starters.map((starter) => starter.id)).toEqual(['signal-post', 'blank'])
    expect(defaultStarterFor(creation).id).toBe('signal-post')
    const result = compileProgram(starters[0].workspace, compileContextFor(creation))
    expect(result).toMatchObject({ ok: true, diagnostics: [] })
    expect(describeIR(result.ir)).toBe(`when sensorSees ${SIGNAL_IDS.sensor}\n  light ${SIGNAL_IDS.light} red\n  wait 2\n  light ${SIGNAL_IDS.light} off`)
  })

  it('every starter is one script (the first-run state), and a rover with no sensor starts from joystick drive', () => {
    for (const { creation } of [wiredRover(), wiredGate(), wiredSignalPost()]) {
      for (const starter of startersFor(creation)) expect((starter.workspace.blocks!.blocks as unknown[]).length).toBe(1)
    }
    const noSensor = wiredCreation(roverBricks().filter((brick) => brick.id !== ROVER_IDS.sensor), ROVER_IDS.hub, ROVER_IDS.hub, [[ROVER_IDS.leftMotor, 'A'], [ROVER_IDS.rightMotor, 'B']])
    expect(startersFor(noSensor.creation).map((starter) => starter.id)).toEqual(['joystick-drive', 'blank'])
    expect(defaultStarterFor(noSensor.creation).id).toBe('joystick-drive')
  })
})
