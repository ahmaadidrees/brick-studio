import { beforeAll, describe, expect, it } from 'vitest'
import { deriveCreations } from '../model/creations'
import { ROVER_IDS, SIGNAL_IDS, fixtureInput, roverBricks, signalPostBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsConnection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { nextSteps, type NextStep } from './nextSteps'

/**
 * The ready row after a try (kid lane Y): a gate's or a signal light's "Ready to try!" says what the
 * last walk-up did instead ("It worked! Try it again" with a tick), and still opens Try it.
 * (Its own file, beside `nextSteps.test.ts`, so parallel lanes adding tests there merge cleanly.)
 */
beforeAll(() => installRoboticsParts(true))

type Wire = [deviceId: string, hubId: string, port: RoboticsConnection['port']]

function robot(bricks = signalPostBricks(), anchor: string = SIGNAL_IDS.hub, wires: Wire[] = []) {
  const section = { ...emptyRoboticsSection(), creations: [{ id: 'robot', name: 'Buggy', anchorBrickIds: [anchor] }], connections: wires.map(([deviceId, hubId, port]) => ({ deviceId, hubId, port })) }
  const input = fixtureInput(bricks, section)
  return { creation: deriveCreations(input)[0], input }
}

const S = SIGNAL_IDS
const R = ROVER_IDS
const current = (rows: NextStep[]) => rows.find((row) => row.state === 'current' && row.group === 'step') ?? null
const row = (rows: NextStep[], id: string) => rows.find((candidate) => candidate.id === id)!

describe('after a try (kid lane Y)', () => {
  it('the ready row says what the last try did (a tick when it worked) and still opens Try it', () => {
    const { creation, input } = robot(signalPostBricks(), S.hub, [[S.sensor, S.hub, 'A'], [S.light, S.hub, 'B']])
    expect(current(nextSteps(creation, { input }))).toMatchObject({ id: 'ready', text: 'Ready to try!', icon: { symbol: 'try' } })
    const worked = nextSteps(creation, { input }, { tried: { worked: true, text: 'It worked! Try it again' } })
    expect(current(worked)).toMatchObject({ id: 'ready', text: 'It worked! Try it again', icon: { symbol: 'worked' }, action: { kind: 'play', creationId: 'robot' } })
    const failed = nextSteps(creation, { input }, { tried: { worked: false, text: 'The light didn’t come on. Try it again' } })
    expect(current(failed)).toMatchObject({ id: 'ready', text: 'The light didn’t come on. Try it again', icon: { symbol: 'try' } })
  })

  it('only a ready robot that is tried shows it: not a rover, not one with a step left', () => {
    const rover = robot(roverBricks(), R.hub, [[R.leftMotor, R.hub, 'A'], [R.rightMotor, R.hub, 'B'], [R.sensor, R.hub, 'C']])
    expect(current(nextSteps(rover.creation, { input: rover.input }, { tried: { worked: true, text: 'It worked! Try it again' } }))).toMatchObject({ id: 'ready', text: 'Ready to drive!' })
    const unplugged = robot(signalPostBricks(), S.hub, [[S.sensor, S.hub, 'A']])
    const rows = nextSteps(unplugged.creation, { input: unplugged.input }, { tried: { worked: true, text: 'It worked! Try it again' } })
    expect(row(rows, 'ready').text).toBe('Ready to try!')
    expect(current(rows)?.id).toBe('plug')
  })
})
