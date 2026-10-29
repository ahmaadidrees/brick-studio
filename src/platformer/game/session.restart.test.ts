import { describe, expect, it, vi } from 'vitest'
import { GameSession } from './session'

/** restartRun on a stand-in session: only the fields a race restart reads. */
function race(solo: boolean, rescued = true) {
  return {
    isRace: true,
    mode: 'play',
    solo,
    raceRun: { rescue: vi.fn(() => rescued), practice: false },
    startRace: vi.fn(),
    setMode: vi.fn(),
    onToast: vi.fn(),
  }
}

describe('restarting a race', () => {
  it('starts a race on your own over from the grid', () => {
    const s = race(true)
    GameSession.prototype.restartRun.call(s as unknown as GameSession)
    expect(s.startRace).toHaveBeenCalledOnce()
    expect(s.raceRun.rescue).not.toHaveBeenCalled()
  })

  it('puts you back on the road in a room’s race, which one driver cannot restart', () => {
    const s = race(false)
    GameSession.prototype.restartRun.call(s as unknown as GameSession)
    expect(s.raceRun.rescue).toHaveBeenCalledOnce()
    expect(s.startRace).not.toHaveBeenCalled()
    expect(s.onToast).toHaveBeenCalledWith('Back on the road')
  })

  it('says nothing when there is nothing to do (lights not green yet, or finished)', () => {
    const s = race(false, false)
    GameSession.prototype.restartRun.call(s as unknown as GameSession)
    expect(s.onToast).not.toHaveBeenCalled()
    expect(s.startRace).not.toHaveBeenCalled()
  })
})
