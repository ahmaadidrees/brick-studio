import { TS } from '@brick-studio/platformer-core/engine/constants'
import { describe, expect, it } from 'vitest'
import { starterDoc } from '../level/doc'
import { flatLevel, labHarness, placeAt, tileX, tileY } from '../testHarness'
import { advance, deserializeLabWorld, hashLabWorld, serializeLabWorld } from './world'

describe('the starter level runs', () => {
  it('starts you at the start, standing, with every placed brick', () => {
    const h = labHarness()
    expect(h.world.things[0].id).toBe(h.world.playerId)
    h.run(30)
    expect(h.player.onGround).toBe(true)
    expect(tileX(h.player)).toBe(19)
    expect(tileY(h.player)).toBe(19)
    expect(h.player.hero).toBe(true)
    expect(h.ofBrick('walker')).toHaveLength(5)
    expect(h.ofBrick('coin')).toHaveLength(3 + 4 + 5 + 8)
    expect(h.world.notes).toEqual([])
  })

  it('runs and jumps with the keys like /2d: about four bricks up standing, five running', () => {
    const jump = (run: boolean) => {
      const h = labHarness(starterDoc(), flatLevel(80))
      h.run(10)
      if (run) h.run(80, { right: true, x: true })
      const ground = h.player.y
      h.step({ space: true, right: run, x: run }, ['space'])
      let top = ground
      for (let i = 0; i < 60; i++) {
        h.step({ space: true, right: run, x: run })
        top = Math.min(top, h.player.y)
      }
      return (ground - top) / TS
    }
    const standing = jump(false)
    const running = jump(true)
    expect(standing).toBeGreaterThan(3.5)
    expect(standing).toBeLessThan(4.2)
    expect(running).toBeGreaterThan(4.8)
    expect(running).toBeLessThan(5.5)
  })

  it('keeps built-in Walkers walking and turning at walls, and they walk off ledges', () => {
    const h = labHarness()
    const onLedge = h.ofBrick('walker').find((w) => w.spawn && tileY(w) === 15)!
    expect(onLedge).toBeTruthy()
    let fell = false
    for (let i = 0; i < 60 * 30 && !fell; i++) {
      h.step()
      if (tileY(onLedge) > 16) fell = true
    }
    expect(fell).toBe(true)
  })

  it('launches you off a spring, higher when you hold space', () => {
    const heights: number[] = []
    for (const hold of [false, true]) {
      const h = labHarness()
      const spring = h.ofBrick('spring')[0]
      h.run(5)
      placeAt(h.world, h.player, tileX(spring), tileY(spring) - 3)
      let top = h.player.y
      for (let i = 0; i < 120; i++) {
        h.step({ space: hold })
        top = Math.min(top, h.player.y)
      }
      heights.push(spring.y - (top + h.player.h))
    }
    expect(heights[0]).toBeGreaterThan(2 * TS)
    expect(heights[1]).toBeGreaterThan(heights[0] * 2)
  })

  it('collects coins into the player’s memory, and the ? block gives one when bumped from below', () => {
    const h = labHarness()
    h.run(5)
    const coin = h.ofBrick('coin').find((c) => tileX(c) === 24)!
    placeAt(h.world, h.player, 24, 17)
    h.run(3)
    expect(h.thing(coin.id)).toBeUndefined()
    expect(h.player.mem.coins).toBe(1)

    const q = h.ofBrick('qblock')[0]
    placeAt(h.world, h.player, tileX(q), 19)
    h.run(20)
    h.step({ space: true }, ['space'])
    h.run(40, { space: true })
    expect(q.mem.used).toBe(1)
    expect(q.costume).toBe('usedBlock')
    expect(h.player.mem.coins).toBe(2)
    // Once only.
    h.run(30)
    h.step({ space: true }, ['space'])
    h.run(40, { space: true })
    expect(h.player.mem.coins).toBe(2)
  })

  it('carries you on the moving platform', () => {
    const h = labHarness()
    const lift = h.ofBrick('platform')[0]
    h.run(5)
    placeAt(h.world, h.player, tileX(lift), tileY(lift) - 1)
    h.run(10)
    expect(h.player.ground).toBe(lift.id)
    const startX = h.player.x
    const liftX = lift.x
    h.run(40)
    expect(h.player.ground).toBe(lift.id)
    expect(h.player.x - startX).toBe(lift.x - liftX)
    expect(Math.abs(lift.x - liftX)).toBeGreaterThan(TS)
  })

  it('sends you back to the start when a Walker walks into you, and bounces you when you stomp one', () => {
    const h = labHarness()
    const walker = h.ofBrick('walker').find((w) => tileY(w) === 19)!
    h.run(5)
    // Stand in its way.
    placeAt(h.world, h.player, tileX(walker) - 3 * walker.facing * -1, 19)
    let back = false
    for (let i = 0; i < 400 && !back; i++) {
      h.step()
      back = tileX(h.player) === 19
    }
    expect(back).toBe(true)

    const target = h.ofBrick('walker').find((w) => tileY(w) === 19)!
    h.player.x = target.x
    h.player.y = target.y - 3 * TS
    h.player.ox = h.player.x
    h.player.oy = h.player.y
    let stomped = false
    for (let i = 0; i < 60 && !stomped; i++) {
      h.step()
      stomped = !h.thing(target.id)
    }
    expect(stomped).toBe(true)
    expect(h.player.vy).toBeLessThan(0)
  })

  it('hurts you in lava and brings you back to the start', () => {
    const h = labHarness()
    h.run(5)
    placeAt(h.world, h.player, 10, 14)
    h.run(90)
    expect(tileX(h.player)).toBe(19)
    expect(tileY(h.player)).toBe(19)
  })
})

describe('the world is plain data', () => {
  it('survives a JSON round trip mid-run and stays in lockstep with the original', () => {
    const a = labHarness()
    const input = (i: number) => ({ right: i % 90 < 60, space: i % 45 === 0, x: i % 200 < 100 })
    for (let i = 0; i < 300; i++) a.step(input(i), i % 45 === 0 ? ['space'] : [])
    const copy = deserializeLabWorld(JSON.parse(JSON.stringify(serializeLabWorld(a.world))))
    expect(hashLabWorld(copy)).toBe(hashLabWorld(a.world))
    const b = labHarness()
    b.world = copy
    for (let i = 300; i < 900; i++) {
      const held = input(i)
      const press = i % 45 === 0 ? (['space'] as const) : []
      a.step(held, [...press])
      b.step(held, [...press])
    }
    expect(hashLabWorld(b.world)).toBe(hashLabWorld(a.world))
  })

  it('is deterministic: the same inputs give the same world', () => {
    const hashes = [0, 1].map(() => {
      const h = labHarness(starterDoc())
      for (let i = 0; i < 600; i++) h.step({ right: i % 120 < 90, space: i % 37 < 10 }, i % 37 === 0 ? ['space'] : [])
      return hashLabWorld(h.world)
    })
    expect(hashes[0]).toBe(hashes[1])
  })

  it('advances with no input at all', () => {
    const h = labHarness()
    advance(h.world, h.book)
    expect(h.world.tick).toBe(1)
  })
})
