import { describe, expect, it } from 'vitest'
import { FOUR_WHEEL_IDS, ROVER_IDS } from '../model/fixtures'
import { compileContextFor, compileProgram, describeIR, type CompileContext } from './compile'
import { defaultStarterFor, startersFor } from './starters'
import { wiredFourWheel, wiredRover } from './testFixtures'
import type { Stmt } from './types'

/**
 * The drive helpers on a four-wheel car (KID-UX, "every motor drives"): `drive`, `turn` and
 * `drive using joystick` run every motor of each side, left side first, with each motor's
 * reversal folded into its sign. A two-motor rover compiles exactly as before.
 */
type B = { type: string; id: string; fields?: Record<string, unknown>; inputs?: Record<string, unknown>; next?: { block: B } }
const b = (type: string, id: string, rest: Omit<B, 'type' | 'id'> = {}): B => ({ type, id, ...rest })
const num = (value: number, id: string) => ({ shadow: b('robo_number', id, { fields: { NUM: value } }) })
const chain = (...blocks: B[]): B => {
  for (let index = blocks.length - 1; index > 0; index -= 1) blocks[index - 1].next = { block: blocks[index] }
  return blocks[0]
}
const ws = (...tops: B[]) => ({ blocks: { languageVersion: 0, blocks: tops } })
const whenRun = (...body: B[]) => chain(b('robo_when_run', 'hat'), ...body)
const drive = (direction: string, power = 40) => ws(whenRun(b('robo_drive', 'drive', { fields: { DIRECTION: direction }, inputs: { POWER: num(power, 'p') } })))
const turn = (direction: string) => ws(whenRun(b('robo_turn', 'turn', { fields: { DIRECTION: direction }, inputs: { POWER: num(30, 'p'), SECONDS: num(1.5, 's') } })))
const joystick = ws(chain(b('robo_when_joystick_moves', 'hat'), b('robo_drive_joystick', 'joy')))

const ids = FOUR_WHEEL_IDS
const [FL, BL, FR, BR] = [ids.frontLeftMotor, ids.backLeftMotor, ids.frontRightMotor, ids.backRightMotor]
const ir = (workspace: unknown, context: CompileContext) => {
  const result = compileProgram(workspace, context)
  expect(result, JSON.stringify(result.diagnostics)).toMatchObject({ ok: true, diagnostics: [] })
  return describeIR(result.ir)
}

describe('helpers on a four-wheel car', () => {
  const context = () => compileContextFor(wiredFourWheel().creation)

  it('the context carries both sides, the pair first on each', () => {
    expect(context().driveSides).toEqual({ left: [FL, BL], right: [FR, BR], reversedIds: [FR, BR] })
    expect(context().drivePair).toEqual({ leftId: FL, rightId: FR, reversedIds: [FR] })
    expect(compileContextFor(wiredRover().creation).driveSides).toEqual({ left: [ROVER_IDS.leftMotor], right: [ROVER_IDS.rightMotor], reversedIds: [ROVER_IDS.rightMotor] })
  })

  it('drive forward and backward run all four motors, the right side negated', () => {
    expect(ir(drive('forward'), context())).toBe(`when run\n  run ${FL} at 40\n  run ${BL} at 40\n  run ${FR} at -40\n  run ${BR} at -40`)
    expect(ir(drive('backward', 60), context())).toBe(`when run\n  run ${FL} at -60\n  run ${BL} at -60\n  run ${FR} at 60\n  run ${BR} at 60`)
  })

  it('a computed power is negated per reversed motor, keeping block ids', () => {
    const body = compileProgram(ws(whenRun(b('robo_drive', 'drive', { fields: { DIRECTION: 'forward' }, inputs: { POWER: { block: b('robo_timer', 't') } } }))), context()).ir.scripts[0].body
    const timer = { kind: 'timer', blockId: 't' }
    const negated = { kind: 'binary', op: '-', left: { kind: 'number', value: 0, blockId: 'drive' }, right: timer, blockId: 'drive' }
    expect(body).toEqual<Stmt[]>([
      { op: 'runMotor', deviceId: FL, percent: timer as never, blockId: 'drive' },
      { op: 'runMotor', deviceId: BL, percent: timer as never, blockId: 'drive' },
      { op: 'runMotor', deviceId: FR, percent: negated as never, blockId: 'drive' },
      { op: 'runMotor', deviceId: BR, percent: negated as never, blockId: 'drive' },
    ])
  })

  it('turn spins every motor in place, waits, then stops all four', () => {
    expect(ir(turn('left'), context())).toBe([
      'when run', `  run ${FL} at -30`, `  run ${BL} at -30`, `  run ${FR} at -30`, `  run ${BR} at -30`, '  wait 1.5',
      `  stop ${FL}`, `  stop ${BL}`, `  stop ${FR}`, `  stop ${BR}`,
    ].join('\n'))
    expect(ir(turn('right'), context())).toBe([
      'when run', `  run ${FL} at 30`, `  run ${BL} at 30`, `  run ${FR} at 30`, `  run ${BR} at 30`, '  wait 1.5',
      `  stop ${FL}`, `  stop ${BL}`, `  stop ${FR}`, `  stop ${BR}`,
    ].join('\n'))
  })

  it('drive using joystick gives each side its half of the arcade mix', () => {
    expect(ir(joystick, context())).toBe([
      'when joystickMoves',
      `  run ${FL} at (joystick.up + joystick.right)`,
      `  run ${BL} at (joystick.up + joystick.right)`,
      `  run ${FR} at (0 - (joystick.up - joystick.right))`,
      `  run ${BR} at (0 - (joystick.up - joystick.right))`,
    ].join('\n'))
    for (const stmt of compileProgram(joystick, context()).ir.scripts[0].body) expect(stmt.blockId).toBe('joy')
  })

  it('an unplugged motor on either side warns on the helper that drives it; the program still runs', () => {
    const result = compileProgram(drive('forward'), compileContextFor(wiredFourWheel({ unplug: [BR] }).creation))
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([expect.objectContaining({ code: 'device.unplugged', severity: 'warning', message: 'Back right motor is not plugged in', blockId: 'drive', deviceId: BR })])
    expect(describeIR(result.ir).split('\n')).toHaveLength(5)
  })

  it('three motors: a side of two and a side of one', () => {
    const { creation } = wiredFourWheel({ backLeftWheelOff: true })
    expect(ir(drive('forward'), compileContextFor(creation))).toBe(`when run\n  run ${FL} at 40\n  run ${FR} at -40\n  run ${BR} at -40`)
  })

  it('a hand-made context: sides when given, the pair alone when not', () => {
    const base: CompileContext = {
      creationName: 'Buggy',
      devices: Object.fromEntries(['a', 'b', 'c'].map((id) => [id, { id, name: id, kind: 'motor' as const, plugged: true, port: null }])),
      drivePair: { leftId: 'a', rightId: 'b', reversedIds: ['b'] },
      deviceNames: {},
    }
    expect(ir(drive('forward'), base)).toBe('when run\n  run a at 40\n  run b at -40')
    expect(ir(drive('forward'), { ...base, driveSides: { left: ['a', 'c'], right: ['b'], reversedIds: ['b'] } })).toBe('when run\n  run a at 40\n  run c at 40\n  run b at -40')
    // Sides never stand in for a missing pair.
    const noPair = compileProgram(drive('forward'), { ...base, drivePair: null, driveSides: { left: ['a'], right: ['b'], reversedIds: [] } })
    expect(noPair.ok).toBe(false)
    expect(noPair.diagnostics[0]).toMatchObject({ code: 'drive.no-pair', message: 'Choose two drive motors first' })
  })

  it('starters: joystick drive and blank (no sensor on a full hub), both compiling cleanly', () => {
    const { creation } = wiredFourWheel()
    const starters = startersFor(creation)
    expect(starters.map((starter) => starter.id)).toEqual(['joystick-drive', 'blank'])
    expect(defaultStarterFor(creation).id).toBe('joystick-drive')
    for (const starter of starters) expect(compileProgram(starter.workspace, compileContextFor(creation)), starter.id).toMatchObject({ ok: true, diagnostics: [] })
    expect(compileProgram(starters[0].workspace, compileContextFor(creation)).ir.scripts[0].body).toHaveLength(4)
  })

  it('the rover compiles exactly as before', () => {
    const context = compileContextFor(wiredRover().creation)
    expect(ir(drive('forward'), context)).toBe(`when run\n  run ${ROVER_IDS.leftMotor} at 40\n  run ${ROVER_IDS.rightMotor} at -40`)
    expect(ir(turn('left'), context)).toBe(`when run\n  run ${ROVER_IDS.leftMotor} at -30\n  run ${ROVER_IDS.rightMotor} at -30\n  wait 1.5\n  stop ${ROVER_IDS.leftMotor}\n  stop ${ROVER_IDS.rightMotor}`)
    expect(ir(joystick, context)).toBe(`when joystickMoves\n  run ${ROVER_IDS.leftMotor} at (joystick.up + joystick.right)\n  run ${ROVER_IDS.rightMotor} at (0 - (joystick.up - joystick.right))`)
  })
})
