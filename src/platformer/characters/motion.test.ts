import { describe, expect, it } from 'vitest'
import { SUB } from '@brick-studio/platformer-core/engine/constants'
import { createPlayer } from '@brick-studio/platformer-core/engine/player'
import { characterMotion, gaitCycleLength } from './motion'

function walker() {
  const p = createPlayer(1)
  p.onGround = true
  p.vx = 2 * SUB
  return p
}

describe('cosmetic character motion', () => {
  it('integrates new distance with the current stride while speed blends continuously', () => {
    const p = walker()
    characterMotion(p, 0, 'builder', 2, 'walk1')
    p.anim += 2 * SUB; p.x += 2 * SUB
    const walk = characterMotion(p, 1, 'builder', 2, 'walk1')
    expect(walk.gaitPhase).toBeCloseTo(2 / gaitCycleLength(23, walk.gaitBlend))
    p.vx = 3 * SUB; p.anim += 3 * SUB; p.x += 3 * SUB
    const run = characterMotion(p, 2, 'builder', 2, 'walk1')
    expect(run.gait).toBe('run')
    expect(run.gaitBlend).toBeGreaterThan(walk.gaitBlend)
    expect(run.gaitBlend).toBeLessThan(1)
    expect(run.gaitPhase).toBeCloseTo(walk.gaitPhase + 3 / gaitCycleLength(23, run.gaitBlend))
    p.vx = 2.08 * SUB
    expect(characterMotion(p, 3, 'builder', 2, 'walk1').gait).toBe('run')
    p.vx = 1.8 * SUB
    expect(characterMotion(p, 4, 'builder', 2, 'walk1').gait).toBe('walk')
  })

  it('freezes phase at rest and settles the stride; repeated rendering does not change state', () => {
    const p = walker()
    characterMotion(p, 0, 'builder', 2, 'walk1')
    p.x += 2 * SUB; p.anim += 2 * SUB
    const step = characterMotion(p, 1, 'builder', 2, 'walk1')
    p.vx = 0
    const stop = characterMotion(p, 2, 'builder', 2, 'stand')
    const settled = characterMotion(p, 8, 'builder', 2, 'stand')
    expect(stop.gaitPhase).toBe(step.gaitPhase)
    expect(settled.gaitPhase).toBe(step.gaitPhase)
    expect(settled.gaitWeight).toBeLessThan(stop.gaitWeight)
    expect(characterMotion(p, 8, 'builder', 2, 'stand')).toBe(settled)
  })

  it('ignores teleport distance and counter resets without phantom steps or landing squashes', () => {
    const p = walker()
    characterMotion(p, 0, 'brick-fox', 2, 'walk1')
    p.x += 2 * SUB; p.anim += 2 * SUB
    const step = characterMotion(p, 1, 'brick-fox', 2, 'walk1')
    p.x += 180 * SUB; p.anim += 180 * SUB
    const teleport = characterMotion(p, 2, 'brick-fox', 2, 'walk1')
    expect(teleport.gaitPhase).toBe(step.gaitPhase)
    expect(teleport.gaitWeight).toBe(0)
    expect(teleport.landingCompression).toBe(0)
    p.anim = 0
    expect(characterMotion(p, 3, 'brick-fox', 2, 'walk1').gaitPhase).toBe(step.gaitPhase)
  })

  it('adds a brief normalized landing response independently of head-bounce squash', () => {
    const p = walker()
    p.onGround = false
    characterMotion(p, 0, 'bolt-bot', 2, 'jump')
    p.onGround = true
    const landed = characterMotion(p, 1, 'bolt-bot', 2, 'stand')
    expect(landed.landingCompression).toBeGreaterThan(0)
    expect(landed.landingCompression).toBeLessThanOrEqual(1)
    expect(p.squash).toBe(0)
    const snapshot = { ...p }
    expect(characterMotion(p, 7, 'bolt-bot', 2, 'stand').landingCompression).toBeLessThan(1)
    expect(characterMotion(p, 14, 'bolt-bot', 2, 'stand').landingCompression).toBe(0)
    expect(p).toEqual(snapshot)
  })
})
