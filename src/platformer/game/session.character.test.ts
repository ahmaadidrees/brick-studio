import { describe, expect, it, vi } from 'vitest'
import { createPlayer } from '@brick-studio/platformer-core/engine/player'
import { SUB } from '@brick-studio/platformer-core/engine/constants'
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

  it('keeps a full left/right stride at one distance across walk and run, and freezes while stopped', () => {
    const player = createPlayer(1)
    player.onGround = true
    player.vx = SUB
    const phases = [0, 16, 32, 48, 64].map((pixels) => {
      player.anim = pixels * SUB
      const look = playerLook(player, pixels, 'builder')
      expect(look.gait).toBe('walk')
      expect(look.pose).toMatch(/^walk/)
      return look.gaitPhase
    })
    expect(phases).toEqual([0, 0.25, 0.5, 0.75, 0])

    player.anim = 20 * SUB
    player.vx = 2 * SUB
    const running = playerLook(player, 30, 'builder')
    expect(running).toMatchObject({ gait: 'run', gaitPhase: 20 / 64 })
    expect(playerLook(player, 30, 'builder', 2)).toMatchObject({ gait: 'walk', gaitPhase: 20 / 64 })
    player.vx = 0
    expect(playerLook(player, 90, 'builder')).toMatchObject({ pose: 'stand', gaitPhase: 20 / 64 })
    expect(playerLook(player, 90, 'builder').gait).toBeUndefined()
  })

  it('sends quantized cosmetic gait fields without changing the legacy pose', () => {
    const player = createPlayer(1)
    player.onGround = true
    player.vx = 2 * SUB
    player.anim = 17 * SUB
    const fake = {
      mode: 'play', timeline: { tick: 10 }, player, character: 'builder', frameCount: 20,
      lookOf: () => playerLook(player, 20, 'builder'),
    }
    const pose = (GameSession.prototype as unknown as { pose: (this: GameSession) => { a: string; ga?: number; gp?: number } }).pose.call(fake as unknown as GameSession)
    expect(pose).toMatchObject({ a: expect.stringMatching(/^walk/), ga: 1, gp: 68 })
  })
})
