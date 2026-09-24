import { describe, expect, it } from 'vitest'
import type { PlayerInfo, Pose } from '@brick-studio/platformer-core/net/protocol'
import { Remotes } from './remotes'

const player: PlayerInfo = { num: 2, name: 'Friend', provider: false, host: false, canBuild: true }
const pose = (t: number, ch?: Pose['ch']): Pose => ({ m: 0, x: t, y: 50, f: 1, a: 'walk1', s: 0, v: 1, q: 0, t, ...(ch ? { ch } : {}) })

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
