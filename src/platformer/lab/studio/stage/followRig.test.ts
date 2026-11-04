/**
 * Play's follow camera eases after the player like the classic game's (parity bucket A, 2026-11-03): the side view leads
 * the way you run and settles on the ground; Racing looks ahead of the car. All in view state, never in the world.
 */
import { describe, expect, it } from 'vitest'
import { FollowRig, type FollowSubject } from './camera'

const bounds = { left: 0, right: 3000, bottom: 0, top: 1000 }
const viewport = { width: 960, height: 540 }
/** View 480 steps wide: 270 tall. */
const W = 480
const H = 270

/** Run the rig for `ticks` ticks at 60 Hz (two frames a tick), the subject moving by (vx, vy) a tick. */
function run(rig: FollowRig, from: FollowSubject, ticks: number) {
  const s = { ...from }
  let cam = rig.follow(s, bounds, viewport, W, 0)
  const log: Array<{ cam: typeof cam; s: FollowSubject }> = []
  for (let i = 0; i < ticks; i++) {
    s.x += s.vx
    s.y += s.vy
    for (let f = 0; f < 2; f++) cam = rig.follow(s, bounds, viewport, W, 1)
    log.push({ cam, s: { ...s } })
  }
  return log
}

describe('the side view (Platformer)', () => {
  it('starts on the player, standing at 28% from the bottom', () => {
    const cam = new FollowRig('side').follow({ x: 1000, y: 300, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 0)
    expect(cam.x).toBe(1000)
    expect(cam.y - H / 2).toBeCloseTo(300 - H * 0.28)
  })

  it('leads the way you run, up to 40 steps ahead, and keeps you between 35% and 65% across', () => {
    const right = run(new FollowRig('side'), { x: 1000, y: 300, vx: 7, vy: 0, onGround: true }, 120)
    // At full run speed the view ends up ahead of you, by the 40-step lead less the easing's lag (as classic: about 15).
    const last = right.at(-1)!
    expect(last.cam.x - last.s.x).toBeGreaterThan(10)
    expect(last.cam.x - last.s.x).toBeLessThanOrEqual(40)
    for (const { cam, s } of right) {
      const across = (s.x - (cam.x - W / 2)) / W
      expect(across).toBeGreaterThanOrEqual(0.35 - 1e-9)
      expect(across).toBeLessThanOrEqual(0.65 + 1e-9)
    }
    const left = run(new FollowRig('side'), { x: 2000, y: 300, vx: -7, vy: 0, onGround: true }, 120).at(-1)!
    expect(left.s.x - left.cam.x).toBeGreaterThan(10)
  })

  it('eases instead of snapping: a step to the side moves the view only part of the way that frame', () => {
    const rig = new FollowRig('side')
    rig.follow({ x: 1000, y: 300, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 0)
    const cam = rig.follow({ x: 1030, y: 300, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 1)
    expect(cam.x).toBeGreaterThan(1000)
    expect(cam.x).toBeLessThan(1030)
  })

  it('does not chase a jump: up and down it waits for the ground, unless you leave the middle band', () => {
    const rig = new FollowRig('side')
    const start = rig.follow({ x: 1000, y: 300, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 0)
    const jump = rig.follow({ x: 1000, y: 360, vx: 0, vy: 0, onGround: false }, bounds, viewport, W, 1)
    expect(jump.y).toBe(start.y)
    rig.follow({ x: 1000, y: 420, vx: 0, vy: 0, onGround: false }, bounds, viewport, W, 1)
    const high = rig.follow({ x: 1000, y: 540, vx: 0, vy: 0, onGround: false }, bounds, viewport, W, 1)
    expect(540 - (high.y - H / 2)).toBeCloseTo(H * 0.75)
  })

  it('never shows past the level, and cuts (no long scroll) when the player jumps back to the start', () => {
    const rig = new FollowRig('side')
    const edge = rig.follow({ x: 20, y: 24, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 0)
    expect([edge.x - W / 2, edge.y - H / 2]).toEqual([0, 0])
    rig.follow({ x: 2000, y: 24, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 1)
    const back = rig.follow({ x: 2000, y: 24, vx: 0, vy: 0, onGround: true }, bounds, viewport, W, 1)
    expect(back.x).toBe(2000)
  })
})

describe('from above (Racing)', () => {
  it('looks ahead of the car by 16 frames of its speed, easing there', () => {
    const log = run(new FollowRig('top'), { x: 1000, y: 500, vx: 6, vy: 0, onGround: false }, 90)
    const last = log.at(-1)!
    // 6 steps a tick is 3 px a frame: aiming 48 ahead, less the easing's lag (as classic: about 26).
    expect(last.cam.x - last.s.x).toBeGreaterThan(20)
    expect(last.cam.x - last.s.x).toBeLessThanOrEqual(48)
    expect(last.cam.y).toBeCloseTo(500)
  })
})
