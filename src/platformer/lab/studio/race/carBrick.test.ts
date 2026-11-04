import { describe, expect, it } from 'vitest'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { readLabel } from '../code/layers'
import { CAR_BRICK_ID, CAR_BUILD_KNOB_IDS, CAR_KNOBS, carDrivingLabels, carVariableId, createCarBrick, createCarWorkspace, createRacerBrick, createRacerWorkspace, racerDrivingLabels } from './carBrick'
import { EARLIER_BUILT_IN_FINGERPRINTS, workspaceFingerprint } from '../remix'
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

/**
 * The Car as saved in kids' projects from R1 on. Code folds its driving scripts into "How I drive" by their saved labels,
 * and an upgrade of an untouched Car would recognise it by its blocks' fingerprint. Changing either below means saved
 * Cars no longer match: add the old fingerprint to EARLIER_BUILT_IN_FINGERPRINTS (remix.ts) and keep the old labels
 * folding before you update these pins.
 */
describe('the Car as saved (pinned for later upgrades)', () => {
  const labelsOf = (ws: WorkspaceJson) => tops(ws).map((b) => `${b.type} | ${label(b)}`)

  it('has the blocks fingerprint of parity bucket A, and R1\'s upgrades', () => {
    // f3157bf8 from a202bb8 (R1, as shipped) until W A S D and directional boost pads (parity bucket A); an untouched R1
    // Car upgrades from it. The racer's 3f8004eb likewise, until it steered and braked.
    expect(EARLIER_BUILT_IN_FINGERPRINTS.brick_car).toContain('f3157bf8')
    expect(workspaceFingerprint(createCarWorkspace())).toBe(CAR_FINGERPRINT)
    expect(EARLIER_BUILT_IN_FINGERPRINTS.brick_car).not.toContain(CAR_FINGERPRINT)
    expect(EARLIER_BUILT_IN_FINGERPRINTS.brick_racer).toContain('3f8004eb')
    expect(workspaceFingerprint(createRacerWorkspace())).toBe(RACER_FINGERPRINT)
  })

  it('has the labels of R1, in order', () => {
    expect(labelsOf(createCarWorkspace())).toEqual(CAR_LABELS_R1)
    expect([...carDrivingLabels()]).toEqual(CAR_LABELS_R1.filter((l) => l.startsWith('platformer_everytick | ')).map((l) => l.slice('platformer_everytick | '.length)))
    expect([...racerDrivingLabels()]).toEqual(labelsOf(createRacerWorkspace()).filter((l) => l.startsWith('platformer_everytick | ')).map((l) => l.slice('platformer_everytick | '.length)))
  })
})

const CAR_FINGERPRINT = 'cd3793ca'
const RACER_FINGERPRINT = '68d4e698'

const CAR_LABELS_R1: readonly string[] = [
  'event_whenflagclicked | When the race starts: no gravity, I move myself',
  'event_whenbroadcastreceived | When the countdown says go: I can drive',
  'platformer_everytick | Read the arrow keys: left and right steer, up is gas, down is brake',
  'platformer_everytick | Start each tick with the normal numbers: road speed, and on rails (no sliding)',
  'platformer_everytick | Off-road slowdown: grass and dirt are slower than road',
  'platformer_everytick | Grip and drift: my tyres stop only some of a slide each tick, and on ice hardly any',
  "platformer_everytick | Steer: turn when I'm rolling, the other way when I reverse",
  'platformer_everytick | Split my speed: forward (the way I point) and sideways (sliding)',
  'platformer_everytick | Boost pads: a boost pad shoots me forward, then the extra speed fades',
  'platformer_everytick | Gas and brakes: gas speeds me up to my top speed, brakes slow me and then reverse, and I coast to a stop',
  'platformer_everytick | Grip: sideways sliding fades by my grip',
  'platformer_everytick | Drive: move, and bounce off barriers (go inside to see how)',
  'procedures_definition | Drive and bounce off barriers: turn my two speeds into x and y speeds, move, bounce off anything solid',
  'race_whenlap | When I finish my last lap: stop, and put my name on the results',
]
