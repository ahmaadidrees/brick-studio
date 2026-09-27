import { TS } from '@brick-studio/platformer-core/engine/constants'
import { describe, expect, it } from 'vitest'
import { applyRecipe, backToOriginal, brickDef, placeThing, saveAsNewBrick, starterDoc, type LabDoc } from '../level/doc'
import { CLIFF, GAP } from '../level/starter'
import { compileProgram } from '../program/compile'
import { flatLevel, labHarness, placeAt, tileX, tileY, type LabHarness } from '../testHarness'
import { RECIPES } from './recipes'

/*
 * The five examples from the brief, each built only from the lab's primitives, driven with the keyboard frame by
 * frame on the starter level.
 */

/** Run at the lava gap from the right and jump at frame `jumpAt`; optionally press space again `againAfter` frames later. */
function tryGap(doc: LabDoc, jumpAt: number, againAfter: number | null): boolean {
  const h = labHarness(doc)
  h.run(5)
  placeAt(h.world, h.player, GAP.to + 10, 19)
  h.player.facing = -1
  for (let f = 0; f < 260; f++) {
    const press = f === jumpAt || (againAfter !== null && f === jumpAt + againAfter)
    h.step({ left: true, x: true, space: f >= jumpAt }, press ? ['space'] : [])
    if (h.player.onGround && tileX(h.player) <= GAP.islandRight) return true
    if (tileX(h.player) === 19 && f > jumpAt + 10) return false
  }
  return false
}

describe('1 · double jump', () => {
  const jumpFrames = Array.from({ length: 50 }, (_, i) => 45 + i)

  it('the gap left of the start is too far for one jump, however you time it', () => {
    const doc = starterDoc()
    expect(jumpFrames.filter((f) => tryGap(doc, f, null))).toEqual([])
  })

  it('once you code a double jump, you clear it', () => {
    const doc = applyRecipe(starterDoc(), 'double-jump').doc
    const wins: number[] = []
    for (const f of jumpFrames) for (const again of [12, 18, 24, 30]) if (tryGap(doc, f, again)) wins.push(f)
    expect(wins.length).toBeGreaterThan(5)
  })

  it('gives exactly one extra jump, back again after landing', () => {
    const h = labHarness(applyRecipe(starterDoc(), 'double-jump').doc, flatLevel(60))
    h.run(10)
    expect(h.player.mem.jumps ?? 0).toBe(0)
    h.step({ space: true }, ['space'])
    h.run(12, { space: true })
    h.step({ space: true }, ['space'])
    expect(h.player.mem.jumps).toBe(1)
    expect(h.player.vy).toBeLessThan(0)
    h.run(10, { space: true })
    const vy = h.player.vy
    h.step({ space: true }, ['space'])
    expect(h.player.vy).toBeGreaterThanOrEqual(vy)
    h.run(120)
    expect(h.player.onGround).toBe(true)
    expect(h.player.mem.jumps).toBe(0)
  })

  it('works the moment you add it, while you stand there (no landing needed first)', () => {
    const h = labHarness(starterDoc(), flatLevel(60))
    h.run(30)
    h.setDoc(applyRecipe(h.book.doc, 'double-jump').doc)
    h.step({ space: true }, ['space'])
    h.run(12, { space: true })
    h.step({ space: true }, ['space'])
    expect(h.player.mem.jumps).toBe(1)
  })
})

describe('2 · throw a ball', () => {
  const ballsOf = (h: LabHarness) => h.ofBrick('ball')

  it('makes a ball at your hand, launched the way you face, that bounces and goes away', () => {
    const h = labHarness(applyRecipe(starterDoc(), 'throw').doc, flatLevel(80))
    h.run(10)
    h.step({}, ['z'])
    const [ball] = ballsOf(h)
    expect(ball).toBeTruthy()
    expect(ball.x).toBeGreaterThanOrEqual(h.player.x + h.player.w)
    expect(ball.vx).toBeGreaterThan(0)
    expect(ball.vy).toBeLessThan(0)
    expect(ball.bounce).toBe(75)
    let bounced = false
    let prev = ball.vy
    for (let i = 0; i < 90; i++) {
      h.step()
      if (prev > 0 && ball.vy < 0) bounced = true
      prev = ball.vy
    }
    expect(bounced).toBe(true)
    h.run(100)
    expect(ballsOf(h)).toHaveLength(0)
  })

  it('has a cooldown, and throws left when you face left', () => {
    const h = labHarness(applyRecipe(starterDoc(), 'throw').doc, flatLevel(80))
    h.run(10)
    h.step({}, ['z'])
    h.run(5)
    h.step({}, ['z'])
    expect(ballsOf(h)).toHaveLength(1)
    expect(h.player.mem.cooldown).toBe(1)
    h.run(25)
    expect(h.player.mem.cooldown).toBe(0)
    h.run(20, { left: true })
    h.step({ left: true }, ['z'])
    const balls = ballsOf(h)
    expect(balls).toHaveLength(2)
    expect(balls[1].vx).toBeLessThan(0)
    expect(balls[1].x + balls[1].w).toBeLessThanOrEqual(h.player.x)
  })

  it('knocks out a Walker', () => {
    const h = labHarness(applyRecipe(starterDoc(), 'throw').doc)
    h.run(5)
    const walker = h.ofBrick('walker').find((w) => tileY(w) === 19 && tileX(w) > 60)!
    placeAt(h.world, h.player, tileX(walker) - 6, 19)
    h.player.facing = 1
    h.step({}, ['z'])
    let gone = false
    for (let i = 0; i < 120 && !gone; i++) {
      h.step()
      gone = !h.thing(walker.id)
    }
    expect(gone).toBe(true)
  })
})

function withVehicle(recipe: 'car' | 'rocket', x: number) {
  const applied = applyRecipe(starterDoc(), recipe)
  const placed = placeThing(applied.doc, applied.place!, x, 19, 1)
  const h = labHarness(placed.doc)
  const vehicle = h.world.things.find((t) => t.spawn === placed.id)!
  h.run(5)
  return { h, vehicle, doc: placed.doc }
}

describe('3 · a car you get into and drive', () => {
  it('lets you in with ↑, drives with → faster than you run, and lets you out with ↓', () => {
    const { h, vehicle: car } = withVehicle('car', 64)
    placeAt(h.world, h.player, 65, 19)
    h.run(3)
    h.step({}, ['up'])
    h.step()
    expect(h.player.riding).toBe(car.id)
    expect(car.rider).toBe(h.player.id)
    const x0 = car.x
    h.run(90, { right: true })
    expect(car.vx / 256).toBeGreaterThan(3)
    expect(car.x - x0).toBeGreaterThan(12 * TS)
    // You ride along, sitting in it.
    expect(Math.abs(h.player.x + h.player.w / 2 - (car.x + car.w / 2))).toBeLessThan(256)
    expect(h.player.y + h.player.h).toBeGreaterThan(car.y)
    h.step({}, ['down'])
    h.run(40)
    expect(h.player.riding).toBe(0)
    expect(car.rider).toBe(0)
    const px0 = h.player.x
    h.run(30, { left: true })
    expect(h.player.x).toBeLessThan(px0)
  })

  it('squashes a Walker it drives into', () => {
    const { h, vehicle: car } = withVehicle('car', 64)
    placeAt(h.world, h.player, 65, 19)
    h.run(3)
    h.step({}, ['up'])
    const walker = h.ofBrick('walker').find((w) => tileY(w) === 19 && tileX(w) > 64)!
    let gone = false
    for (let i = 0; i < 400 && !gone; i++) {
      h.step({ right: true })
      gone = !h.thing(walker.id)
    }
    expect(gone).toBe(true)
    expect(h.player.riding).toBe(car.id)
  })
})

describe('4 · a rocket you ride, with fuel', () => {
  it('thrusts up while you hold space, burning fuel, then falls and fills up again on landing', () => {
    const { h, vehicle: rocket } = withVehicle('rocket', 90)
    placeAt(h.world, h.player, 90, 19)
    h.run(3)
    expect(rocket.mem.fuel).toBe(100)
    expect(rocket.shown).toEqual(['my:fuel'])
    h.step({}, ['up'])
    h.step()
    expect(h.player.riding).toBe(rocket.id)
    const ground = rocket.y
    h.run(30, { space: true })
    expect(rocket.costume).toBe('rocketFire')
    expect(rocket.mem.fuel).toBeLessThan(75)
    expect(ground - rocket.y).toBeGreaterThan(3 * TS)
    h.run(90, { space: true })
    expect(rocket.mem.fuel).toBe(0)
    expect(rocket.costume).toBe('rocket')
    h.run(200)
    expect(rocket.onGround).toBe(true)
    expect(rocket.mem.fuel).toBe(100)
    expect(h.player.riding).toBe(rocket.id)
  })

  it('gets you to the top of the cliff, which no jump reaches', () => {
    const { h, vehicle: rocket } = withVehicle('rocket', CLIFF.from - 3)
    placeAt(h.world, h.player, CLIFF.from - 3, 19)
    h.run(3)
    h.step({}, ['up'])
    h.run(150, { space: true, right: true })
    h.run(120)
    expect(rocket.onGround).toBe(true)
    expect(tileY(rocket)).toBe(CLIFF.top - 1)
    expect(tileX(rocket)).toBeGreaterThanOrEqual(CLIFF.from)
    expect(tileX(rocket)).toBeLessThanOrEqual(CLIFF.to)
    h.step({}, ['down'])
    h.run(60)
    expect(h.player.riding).toBe(0)
    expect(tileY(h.player)).toBe(CLIFF.top - 1)
  })
})

describe('5 · Walkers that turn at ledges (editing the built-in)', () => {
  const ledgeWalker = (h: LabHarness) => h.ofBrick('walker').find((w) => w.spawn && tileY(w) === 15)!

  it('the built-in Walker walks off the ledge; your edited copy turns around at both ends', () => {
    const edited = applyRecipe(starterDoc(), 'ledge-walker').doc
    expect(edited.bricks.walker.origin).toBe('copy')
    expect(compileProgram(edited.bricks.walker.program, { bricks: [{ id: 'walker', name: 'Walker' }] }).ok).toBe(true)
    const h = labHarness(edited)
    const w = ledgeWalker(h)
    let turns = 0
    let facing = w.facing
    for (let i = 0; i < 60 * 40; i++) {
      h.step()
      expect(tileY(w)).toBe(15)
      if (w.facing !== facing) {
        turns++
        facing = w.facing
      }
    }
    expect(turns).toBeGreaterThanOrEqual(4)
    // Back to the original: it walks off again.
    const h2 = labHarness(backToOriginal(edited, 'walker'))
    const w2 = ledgeWalker(h2)
    let fell = false
    for (let i = 0; i < 60 * 30 && !fell; i++) {
      h2.step()
      fell = tileY(w2) > 16
    }
    expect(fell).toBe(true)
  })

  it('applies live, while the level runs, to every Walker', () => {
    const h = labHarness()
    h.run(60)
    h.setDoc(applyRecipe(h.book.doc, 'ledge-walker').doc)
    const w = ledgeWalker(h)
    for (let i = 0; i < 60 * 30; i++) {
      h.step()
      expect(tileY(w)).toBe(15)
    }
  })

  it('saves as a new brick with a picked name, and the level’s Walkers become it', () => {
    const edited = applyRecipe(starterDoc(), 'ledge-walker').doc
    const saved = saveAsNewBrick(edited, 'walker', 'Smart')
    const def = brickDef(saved.doc, saved.id)!
    expect(def.name).toBe('Smart Walker')
    expect(def.origin).toBe('mine')
    expect(def.basedOn).toBe('walker')
    expect(saved.doc.bricks.walker).toBeUndefined()
    expect(saved.doc.level.things.filter((t) => t.brick === saved.id)).toHaveLength(5)
    // Still "a Walker" to anything that looks for Walkers (a ball, a car).
    const h = labHarness(saved.doc)
    expect(h.book.brick(saved.id)!.lineage).toEqual([saved.id, 'walker'])
  })
})

it('ships all five as recipes', () => {
  expect(RECIPES.map((r) => r.id)).toEqual(['double-jump', 'throw', 'car', 'rocket', 'ledge-walker'])
})
