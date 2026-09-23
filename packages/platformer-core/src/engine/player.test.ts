import { describe, it, expect } from 'vitest'
import { SUB, TILE } from './constants'
import { DEFAULT_FEEL } from './feel'
import { POWER } from './player'
import { harness } from './testHarness'
import { ES, EK } from './world'
import { T } from './tiles'

const FLAT = [
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '................................................................................................................................................................................................................',
  '...@............................................................................................................................................................................................................',
  '################################################################################################################################################################################################################',
  '################################################################################################################################################################################################################',
]

const px = (subUnits: number) => subUnits / SUB

function jumpHeight(setup: (h: ReturnType<typeof harness>) => void, hold: number) {
  const h = harness(FLAT)
  h.run(5)
  setup(h)
  const groundY = h.p.y
  let minY = h.p.y
  h.step({ jump: true, jumpPressed: true, right: h.p.vx > 0, run: true })
  for (let i = 1; i < 120; i++) {
    h.step({ jump: i < hold, right: h.p.vx > 0, run: true })
    minY = Math.min(minY, h.p.y)
    if (h.p.onGround) break
  }
  return px(groundY - minY) / TILE
}

describe('running', () => {
  it('walks at 1.5 px/frame and runs at 2.5 px/frame', () => {
    const h = harness(FLAT)
    h.run(90, { right: true })
    expect(px(h.p.vx)).toBeCloseTo(DEFAULT_FEEL.walkMax, 3)
    h.run(60, { right: true, run: true })
    expect(px(h.p.vx)).toBeCloseTo(DEFAULT_FEEL.runMax, 3)
  })

  it('fills the run meter at full run and reaches P-speed', () => {
    const h = harness(FLAT)
    h.run(200, { right: true, run: true })
    expect(h.p.pmeter).toBe(7)
    expect(px(h.p.vx)).toBeCloseTo(DEFAULT_FEEL.pMax, 3)
  })

  it('skids to a stop within a third of a second when turning at run speed', () => {
    const h = harness(FLAT)
    h.run(80, { right: true, run: true })
    let frames = 0
    let skidded = false
    while (h.p.vx > 0 && frames < 60) {
      h.step({ left: true, run: true })
      skidded ||= h.p.skid
      frames++
    }
    expect(skidded).toBe(true)
    expect(frames).toBeLessThanOrEqual(22)
    expect(h.sounds.filter((s) => s === 'skid').length).toBe(1)
  })

  it('keeps momentum after letting go', () => {
    const h = harness(FLAT)
    h.run(80, { right: true, run: true })
    const x0 = h.p.x
    h.run(90)
    expect(h.p.vx).toBe(0)
    expect(px(h.p.x - x0) / TILE).toBeGreaterThan(1.5)
  })
})

describe('jumping', () => {
  it('standing full jump reaches about 4 tiles', () => {
    const height = jumpHeight(() => {}, 999)
    expect(height).toBeGreaterThan(3.8)
    expect(height).toBeLessThan(4.4)
  })

  it('a tap jump is short: between 1 and 1.7 tiles', () => {
    const height = jumpHeight(() => {}, 1)
    expect(height).toBeGreaterThan(1)
    expect(height).toBeLessThan(1.7)
  })

  it('jumps higher at run speed and higher still at P-speed', () => {
    const run = jumpHeight((h) => h.run(60, { right: true, run: true }), 999)
    const p = jumpHeight((h) => h.run(200, { right: true, run: true }), 999)
    expect(run).toBeGreaterThan(4.8)
    expect(run).toBeLessThan(5.6)
    expect(p).toBeGreaterThan(run)
    expect(p).toBeLessThan(6.4)
  })

  it('an early press still jumps on landing (jump buffer)', () => {
    const h = harness(FLAT)
    h.run(5)
    const groundY = h.p.y
    h.step({ jump: true, jumpPressed: true })
    let pressed = false
    for (let i = 0; i < 120; i++) {
      const above = groundY - h.p.y
      if (!pressed && h.p.vy > 0 && above > 0 && above <= 3 * h.p.vy) {
        h.step({ jump: true, jumpPressed: true })
        pressed = true
        continue
      }
      h.step({ jump: pressed })
      if (h.sounds.filter((s) => s === 'jump').length >= 2) break
    }
    expect(pressed).toBe(true)
    expect(h.sounds.filter((s) => s === 'jump').length).toBe(2)
  })
})

describe('walls', () => {
  // Walk off a ledge and fall down the face of a tall wall.
  const WALL = [
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..........@...X.....',
    '.........XXX..X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '..............X.....',
    '####################',
    '####################',
  ].map((r) => r + '.'.repeat(20))

  it('slides slowly down a wall and kicks off it', () => {
    const h = harness(WALL)
    h.run(3)
    let slid = false
    for (let i = 0; i < 90; i++) {
      h.step({ right: true })
      if (h.p.wallSide === 1 && h.p.vy > 0) {
        slid = true
        break
      }
    }
    expect(slid).toBe(true)
    h.run(6, { right: true })
    expect(h.p.onGround).toBe(false)
    expect(px(h.p.vy)).toBeLessThanOrEqual(DEFAULT_FEEL.wallSlideMax + 1e-9)
    h.step({ right: true, jump: true, jumpPressed: true })
    expect(h.p.vx).toBeLessThan(0)
    expect(h.p.vy).toBeLessThan(0)
    expect(h.sounds).toContain('walljump')
  })
})

describe('the world under your feet', () => {
  it('stomps a walker by landing on it, and bounces', () => {
    const h = harness([
      '....@...',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '........',
      '...X.X..',
      '...XgX..',
      '########',
      '########',
    ].map((r) => r + '.'.repeat(20)))
    let bounced = false
    for (let i = 0; i < 90 && !bounced; i++) {
      h.step({})
      bounced = h.p.vy < 0
    }
    expect(bounced).toBe(true)
    expect(h.emitted.some((e) => e.t === 'stomp')).toBe(true)
    h.step({})
    const walker = h.world.entities.find((e) => e.kind === EK.WALKER)
    expect(walker?.state).toBe(ES.SQUASHED)
  })

  it('kicks a shell by walking into it, and the shell slides', () => {
    const rows = FLAT.map((r) => r.slice(0, 60))
    rows[13] = '...@....k' + '.'.repeat(51)
    const h = harness(rows)
    const bug = h.world.entities.find((e) => e.kind === EK.SHELLBUG)!
    h.ctx.emit({ t: 'stomp', id: bug.id, dir: 1 })
    h.step({})
    expect(bug.state).toBe(ES.SHELL)
    for (let i = 0; i < 120 && bug.state === ES.SHELL; i++) h.step({ right: true })
    expect(bug.state).toBe(ES.SLIDING)
    expect(bug.dir).toBe(1)
    expect(h.p.dead).toBe(0)
    expect(h.p.power).toBe(POWER.SMALL)
  })

  it('bumps a ? block from below, and grows from what comes out', () => {
    const rows = FLAT.map((r) => r.slice(0, 40))
    rows[10] = '......M' + '.'.repeat(33)
    rows[13] = '......@' + '.'.repeat(33)
    const h = harness(rows)
    h.run(3)
    h.step({ jump: true, jumpPressed: true })
    h.run(40, { jump: true })
    expect(h.emitted.some((e) => e.t === 'bump')).toBe(true)
    expect(h.world.tiles[10 * 40 + 6]).toBe(T.USED)
    const item = h.world.entities.find((e) => e.kind === EK.GROW)
    expect(item).toBeDefined()
    // Chase it down.
    for (let i = 0; i < 400 && h.p.power === POWER.SMALL; i++) h.step({ right: item!.x > h.p.x, left: item!.x < h.p.x })
    expect(h.p.power).toBe(POWER.BIG)
  })

  it('collects coins by touching them', () => {
    const rows = FLAT.map((r) => r.slice(0, 40))
    rows[13] = '...@..ooo' + '.'.repeat(31)
    const h = harness(rows)
    h.run(90, { right: true })
    expect(h.p.coins).toBe(3)
  })
})

describe('course flow', () => {
  const COURSE = [
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '........................................',
    '...@.........C...................G......',
    '##########...###########################',
    '##########...###########################',
  ]

  it('falls into a pit, dies, and comes back at the last checkpoint', () => {
    const h = harness(COURSE)
    h.run(3)
    // Stand just past the pit and walk through the checkpoint.
    h.p.x = 13 * 4096 + 512
    h.p.y = 14 * 4096 - h.p.h
    h.run(30, { right: true })
    expect(h.p.checkpoint).not.toBe(0)
    expect(h.sounds).toContain('checkpoint')
    // Walk back into the pit.
    h.p.x = 11 * 4096
    h.p.y = 12 * 4096
    h.p.vx = 0
    for (let i = 0; i < 200 && !h.p.dead; i++) h.step({})
    expect(h.p.dead).toBeGreaterThan(0)
    h.run(200)
    expect(h.p.dead).toBe(0)
    expect(Math.floor(h.p.x / 4096)).toBe(13)
  })

  it('touching the goal clears the run, records the time, then starts over', () => {
    const h = harness(COURSE)
    h.run(3)
    h.p.x = 30 * 4096
    h.p.y = 13 * 4096
    for (let i = 0; i < 240 && h.p.clearTime < 0; i++) h.step({ right: true })
    expect(h.p.clearTime).toBeGreaterThan(0)
    expect(h.p.bestTime).toBe(h.p.clearTime)
    expect(h.sounds).toContain('goal')
    h.run(260)
    expect(h.p.celebrate).toBe(0)
    expect(Math.floor(h.p.x / 4096)).toBe(3)
    expect(h.p.clearTime).toBe(-1)
  })
})
