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

  it('advances a full distance-based stride and freezes while stopped', () => {
    const player = createPlayer(1)
    player.onGround = true
    player.vx = SUB
    const cycle = 23 * 1.05
    const phases = [0, 1, 2, 3, 4].map((quarter) => {
      player.anim = quarter * cycle / 4 * SUB
      return playerLook(player, quarter * 6, 'builder', 100).gaitPhase
    })
    phases.forEach((phase, i) => expect(phase).toBeCloseTo((i / 4) % 1))
    player.vx = 0
    const stopped = playerLook(player, 25, 'builder', 100)
    expect(stopped.pose).toBe('stand')
    expect(stopped.gaitPhase).toBeCloseTo(phases[4]!)
    expect(playerLook(player, 26, 'builder', 100).gaitPhase).toBeCloseTo(phases[4]!)
  })

  it('sends quantized cosmetic gait fields without changing the legacy pose', () => {
    const player = createPlayer(1)
    player.onGround = true
    player.vx = 2 * SUB
    player.anim = 13 * SUB
    playerLook(player, 19, 'builder')
    player.anim = 17 * SUB
    const fake = {
      mode: 'play', timeline: { tick: 10 }, player, character: 'builder', frameCount: 20,
      lookOf: () => playerLook(player, 20, 'builder'),
    }
    const pose = (GameSession.prototype as unknown as { pose: (this: GameSession) => { a: string; ga?: number; gp?: number } }).pose.call(fake as unknown as GameSession)
    expect(pose).toMatchObject({ a: expect.stringMatching(/^walk/), ga: 1, gp: Math.floor((4 / (23 * 1.28)) * 256) })
  })
})
