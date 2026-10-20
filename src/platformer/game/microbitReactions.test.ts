import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMicrobit } from '../../microbit/store'
import { GameSession } from './session'
import type { RaceRun } from '../race/raceRun'

type Priv = {
  onEffects: (this: unknown, fx: unknown[], tick: number) => void
  reactRaceProgress: (this: unknown, run: unknown) => void
}
const proto = GameSession.prototype as unknown as Priv

afterEach(() => vi.restoreAllMocks())

function fakeSession(extra: object = {}) {
  return {
    seen: new Map(), silent: false, isRace: false, solo: true,
    player: { num: 1 }, ctx: {}, camera: { x: 0, y: 0 }, renderer: { width: 100, height: 100 },
    sound: { play: vi.fn() }, syncCtx: vi.fn(), effectParticles: vi.fn(), ...extra,
  }
}

describe('micro:bit reactions', () => {
  it('a coin you collect reacts once, even if the effect arrives twice', () => {
    const react = vi.spyOn(useMicrobit.getState(), 'react').mockImplementation(() => {})
    const s = fakeSession()
    const coin = { k: 'coin', id: 0, x: 0, y: 0, by: 1 }
    proto.onEffects.call(s, [coin, coin], 5)
    proto.onEffects.call(s, [coin], 5)
    expect(react).toHaveBeenCalledExactlyOnceWith('coin', undefined)
  })

  it('ignores other players\' coins and anything while silent', () => {
    const react = vi.spyOn(useMicrobit.getState(), 'react').mockImplementation(() => {})
    proto.onEffects.call(fakeSession(), [{ k: 'coin', id: 0, x: 0, y: 0, by: 2 }], 5)
    proto.onEffects.call(fakeSession({ silent: true }), [{ k: 'coin', id: 0, x: 0, y: 0, by: 1 }], 5)
    expect(react).not.toHaveBeenCalled()
  })

  it('a lap going up reacts once with the lap the HUD shows; crossing the line reacts with your place', () => {
    const react = vi.spyOn(useMicrobit.getState(), 'react').mockImplementation(() => {})
    const lap = { lap: 0, done: -1 }
    const run = { you: { lap }, hud: () => ({ place: 2 }) } as unknown as RaceRun
    const s = { ...fakeSession(), reactRun: null, reactLap: 0, reactDone: false, remoteRacers: () => [] }
    const step = () => proto.reactRaceProgress.call(s, run)
    step(); step()
    expect(react).not.toHaveBeenCalled()
    lap.lap = 1; step(); step()
    expect(react).toHaveBeenCalledExactlyOnceWith('lap', 2)
    lap.lap = 3; lap.done = 900; step(); step()
    expect(react).toHaveBeenCalledTimes(2)
    expect(react).toHaveBeenLastCalledWith('finish', 2)
  })
})
