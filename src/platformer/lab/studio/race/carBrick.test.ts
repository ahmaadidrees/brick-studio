import { describe, expect, it } from 'vitest'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { readLabel } from '../code/layers'
import { CAR_BRICK_ID, CAR_BUILD_KNOB_IDS, CAR_KNOBS, carVariableId, createCarBrick, createRacerBrick } from './carBrick'
import { boostField, carRunner, fieldDesign, hackableCarRunner, hold, measureCar, openField, speeds, type Runner } from '../../feel/race/carMetrics'

type Block = Record<string, unknown>
const tops = (ws: WorkspaceJson) => (ws.blocks as { blocks: Block[] }).blocks
const label = (b: Block) => readLabel(b.data as string | undefined)

/** The Car with the scripts whose label starts with `prefix` switched off, as the studio's On/Off switch saves them. */
function carWithout(prefix: string) {
  const { brick, workspace } = createCarBrick()
  const ws = structuredClone(workspace)
  const off = tops(ws).filter((b) => label(b).startsWith(prefix))
  expect(off.length, prefix).toBeGreaterThan(0)
  for (const b of off) b.enabled = false
  const variables = brick.program.variables
  return { ...brick, program: compileWorkspace(ws, { variables }).program }
}

/** A runner whose Car is `car` instead of the standard one. */
const runnerWith = (car: ReturnType<typeof carWithout>): Runner =>
  carRunner((field) => {
    const design = fieldDesign(field)
    return { ...design, bricks: design.bricks.map((b) => (b.id === CAR_BRICK_ID ? car : b)) }
  })

describe('the Car in open blocks', () => {
  it('compiles with no problems, and so does the Computer racer', () => {
    expect(createCarBrick().diagnostics).toEqual([])
    expect(createRacerBrick().diagnostics).toEqual([])
  })

  it('shows four sliders in Build: top speed, acceleration, steering, grip', () => {
    const shown = createCarBrick().brick.program.variables.filter((v) => v.showInBuild).map((v) => v.name)
    expect(shown).toEqual(['top speed', 'acceleration', 'steering', 'grip'])
    expect(CAR_BUILD_KNOB_IDS.every((id) => CAR_KNOBS.some((k) => k.id === id))).toBe(true)
  })

  it('reads as basics, feel scripts and one My Block, every script labelled', () => {
    const labels = tops(createCarBrick().workspace).map(label)
    expect(labels.every((l) => l.length > 0)).toBe(true)
    for (const want of ['Read the arrow keys', 'Steer', 'Gas and brakes', 'Drive: move, and bounce off barriers', 'Off-road slowdown', 'Grip and drift', 'Boost pads']) {
      expect(labels.some((l) => l.startsWith(want)), want).toBe(true)
    }
    expect(tops(createCarBrick().workspace).filter((b) => b.type === 'procedures_definition').map(label)).toEqual([
      expect.stringMatching(/^Drive and bounce off barriers/),
    ])
  })

  it('uses the operators\' sin and cos, never anything else that turns angles', () => {
    const text = JSON.stringify(createCarBrick().workspace)
    expect(text).toContain('"OPERATOR":"sin"')
    expect(text).not.toMatch(/"OPERATOR":"(tan|asin|acos|atan)"/)
  })

  it('a Computer racer is a little slower than the Car', () => {
    const top = (b: ReturnType<typeof createCarBrick>['brick'], prefix: 'car' | 'racer') => b.program.variables.find((v) => v.id === carVariableId(prefix, 'top'))!.value
    expect(top(createRacerBrick().brick, 'racer')).toBeLessThan(top(createCarBrick().brick, 'car') as number)
  })
})

describe('each feel script switches off, and the car still drives', () => {
  const lastSpeed = (run: Runner, field = openField('grass')) => {
    const tr = run(field, hold(4, { gas: true }))
    const v = speeds(tr, (field.start.col + 0.5) * 16, (field.start.row + 0.5) * 16)
    return v[v.length - 1]
  }

  it('off-road slowdown off: grass is as fast as road', () => {
    const run = runnerWith(carWithout('Off-road slowdown'))
    expect(lastSpeed(run)).toBeCloseTo(192, 6)
    expect(lastSpeed(hackableCarRunner)).toBeCloseTo(86.4, 6)
  })

  it('grip and drift off: on rails, no sliding on ice, and it still drives', () => {
    const run = runnerWith(carWithout('Grip and drift'))
    const ice = openField('ice')
    const tr = run(ice, [...hold(2.5, { gas: true }), ...hold(1, { gas: true, steer: 1 })])
    const last = tr[tr.length - 1], before = tr[tr.length - 2]
    const moving = (Math.atan2(last.x - before.x, last.y - before.y) * 180) / Math.PI
    expect(Math.abs(((last.dir - moving + 540) % 360) - 180)).toBeLessThan(0.5)
    expect(lastSpeed(run, openField('road'))).toBeCloseTo(192, 6)
  })

  it('boost pads off: a boost pad is just road', () => {
    const run = runnerWith(carWithout('Boost pads'))
    const tr = run(boostField, hold(4, { gas: true }))
    const v = speeds(tr, (boostField.start.col + 0.5) * 16, (boostField.start.row + 0.5) * 16)
    expect(Math.max(...v)).toBeLessThanOrEqual(192 + 1e-6)
  })

  it('with every feel script on, the numbers are the feel test\'s', () => {
    expect(measureCar(hackableCarRunner).grassTop).toBeCloseTo(86.4, 6)
  })
})
