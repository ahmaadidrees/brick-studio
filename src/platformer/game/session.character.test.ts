import { describe, expect, it, vi } from 'vitest'
import { createPlayer } from '@brick-studio/platformer-core/engine/player'
import { DEFAULT_CHARACTER } from '@brick-studio/platformer-core/net/protocol'
import { GameSession, playerLook } from './session'

describe('GameSession character identity', () => {
  it('uses Builder locally and includes the selected character in the render look', () => {
    const player = createPlayer(1)
    expect(playerLook(player, 9).character).toBe(DEFAULT_CHARACTER)
    expect(playerLook(player, 9, 'brick-fox')).toMatchObject({ character: 'brick-fox', animationFrame: 9 })
  })

  it('sends a pose immediately after a local selection changes', () => {
    const sendPose = vi.fn()
    const local = {
      character: DEFAULT_CHARACTER,
      joined: true,
      room: { sendPose },
      pose: () => ({ ch: local.character }),
    }
    GameSession.prototype.setCharacter.call(local as unknown as GameSession, 'bolt-bot')
    expect(local.character).toBe('bolt-bot')
    expect(sendPose).toHaveBeenCalledExactlyOnceWith({ ch: 'bolt-bot' })
    GameSession.prototype.setCharacter.call(local as unknown as GameSession, 'bolt-bot')
    GameSession.prototype.setCharacter.call(local as unknown as GameSession, 'unknown' as never)
    expect(sendPose).toHaveBeenCalledTimes(1)
  })
})
