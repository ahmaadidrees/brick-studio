import { describe, expect, it } from 'vitest'
import type { PlayerInfo, Pose } from '@brick-studio/platformer-core/net/protocol'
import { Remotes } from './remotes'

const player: PlayerInfo = { num: 2, name: 'Friend', provider: false, host: false, canBuild: true }
const pose = (t: number, ch?: Pose['ch']): Pose => ({ m: 0, x: t, y: 50, f: 1, a: 'walk1', s: 0, v: 1, q: 0, t, ...(ch ? { ch } : {}) })
const stride = (t: number, x: number, gp: number, changes: Partial<Pose> = {}): Pose => ({ ...pose(t, 'builder'), x, ga: 1, gp, ...changes })

describe('Remotes character appearance', () => {
  it('shows legacy Classic and applies a new selection while position is still interpolated', () => {
    const remotes = new Remotes()
    remotes.setPlayers([player], 1)
    remotes.addPose(2, pose(10))
    expect(remotes.looks(10)[0].character).toBe('classic')

    remotes.addPose(2, { ...pose(20, 'bolt-bot'), af: 18 })
    const look = remotes.looks(20)[0]
    expect(look.x).toBe(14)
    expect(look.character).toBe('bolt-bot')

    // A delayed packet cannot undo the newest selection.
    remotes.addPose(2, pose(12, 'brick-fox'))
    expect(remotes.looks(20)[0].character).toBe('bolt-bot')
    remotes.addPose(2, pose(23))
    expect(remotes.looks(23)[0].character).toBe('classic')
  })

  it('decodes optional remote gait and leaves legacy poses without gait metadata', () => {
    const remotes = new Remotes()
    remotes.setPlayers([player], 1)
    remotes.addPose(2, pose(10))
    expect(remotes.looks(10)[0]).toMatchObject({ character: 'classic', pose: 'walk1' })
    expect(remotes.looks(10)[0].gait).toBeUndefined()
    remotes.addPose(2, { ...pose(20, 'builder'), ga: 1, gp: 64 })
    expect(remotes.looks(20)[0].gait).toBeUndefined()
    expect(remotes.looks(26)[0]).toMatchObject({ gait: 'run', gaitPhase: 0.25 })
  })

  it('moves gait phase forward across 255 to 0 between nearby run poses', () => {
    const remotes = new Remotes()
    remotes.setPlayers([player], 1)
    remotes.addPose(2, stride(10, 10, 240))
    remotes.addPose(2, stride(14, 18, 16))

    // Draw tick trails sender tick by six: these sample sender ticks 11, 12, 13.
    expect(remotes.looks(17)[0]).toMatchObject({ x: 12, gait: 'run', gaitPhase: 248 / 256 })
    expect(remotes.looks(18)[0]).toMatchObject({ x: 14, gait: 'run', gaitPhase: 0 })
    expect(remotes.looks(19)[0]).toMatchObject({ x: 16, gait: 'run', gaitPhase: 8 / 256 })
  })

  it('does not blend gait through stopping, long gaps, turns, teleports or a reverse phase sweep', () => {
    const between = (next: Pose, at: number) => {
      const remotes = new Remotes()
      remotes.setPlayers([player], 1)
      remotes.addPose(2, stride(10, 10, 80))
      remotes.addPose(2, next)
      return remotes.looks(at)[0]
    }
    expect(between(stride(14, 18, 120, { a: 'stand', ga: undefined }), 18)).toMatchObject({ gaitPhase: 80 / 256 })
    expect(between(stride(20, 30, 120), 21)).toMatchObject({ gaitPhase: 80 / 256 })
    expect(between(stride(14, 18, 120, { f: -1 }), 18)).toMatchObject({ gaitPhase: 80 / 256 })
    expect(between(stride(14, 8, 120), 18)).toMatchObject({ gaitPhase: 80 / 256 })
    expect(between(stride(14, 18, 60), 18)).toMatchObject({ gaitPhase: 80 / 256 })
    expect(between(stride(14, 200, 120), 18)).toMatchObject({ x: 200, gaitPhase: 120 / 256 })
  })

  it('accepts lower pose ticks after a new authoritative world while keeping the roster identity', () => {
    const remotes = new Remotes()
    remotes.setPlayers([player], 1)
    remotes.addPose(2, pose(600, 'brick-fox'))
    expect(remotes.looks(600)[0].character).toBe('brick-fox')

    remotes.resetPoseHistory()
    remotes.setPlayers([player], 1)
    expect(remotes.looks(1)).toEqual([])
    expect((remotes as unknown as { map: Map<number, { character: string }> }).map.get(2)?.character).toBe('brick-fox')

    remotes.addPose(2, pose(2, 'bolt-bot'))
    expect(remotes.looks(2)[0]).toMatchObject({ x: 2, character: 'bolt-bot' })
  })
})
