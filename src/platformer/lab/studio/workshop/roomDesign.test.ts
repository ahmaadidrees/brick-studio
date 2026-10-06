import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { createStarterProject } from '../starter'
import { HERO_BRICK_ID, createHeroBrick } from '../hero/heroBrick'
import { formatKnob, knobRange } from './knobs'
import { BRICK_X, HELPER_X, ROOM_HEIGHT, ROOM_WIDTH, buildTestRoom, isHeroBrick, roomTiles } from './roomDesign'

const project = createStarterProject()
const stage = project.design.stage
const walker = project.design.bricks.find((b) => b.id !== HERO_BRICK_ID && b.program.scripts.length > 0)!
const hero = project.design.bricks.find((b) => b.id === HERO_BRICK_ID)!

describe('test room design', () => {
  it('is a valid ~320 x 160 design for a plain brick', () => {
    const d = buildTestRoom(walker, stage)
    expect(d.bounds).toEqual({ left: 0, right: ROOM_WIDTH, bottom: 0, top: ROOM_HEIGHT })
    expect(validateDesign(d)).toEqual([])
  })

  it('contains exactly one copy of the brick', () => {
    const d = buildTestRoom(walker, stage)
    expect(d.copies.filter((c) => c.brickId === walker.id)).toHaveLength(1)
    expect(d.bricks.map((b) => b.id)).toContain(walker.id)
  })

  it('gives a non-Hero brick a helper Hero', () => {
    const d = buildTestRoom(walker, stage)
    expect(d.bricks.map((b) => b.id)).toEqual([walker.id, HERO_BRICK_ID])
    expect(d.copies.find((c) => c.brickId === HERO_BRICK_ID)?.x).toBe(HELPER_X)
    expect(d.copies.find((c) => c.brickId === walker.id)?.x).toBe(BRICK_X)
  })

  it('uses the project Hero as the helper when given one', () => {
    const d = buildTestRoom(walker, stage, { hero })
    expect(d.bricks[1]).toBe(hero)
  })

  it('adds no helper when the brick is the Hero, and the Hero is the only copy', () => {
    expect(isHeroBrick(hero)).toBe(true)
    const d = buildTestRoom(hero, stage)
    expect(d.bricks).toHaveLength(1)
    expect(d.copies).toHaveLength(1)
    expect(d.copies[0].brickId).toBe(HERO_BRICK_ID)
    expect(validateDesign(d)).toEqual([])
  })

  it('has a tile floor and wall columns that match the bounds', () => {
    const t = roomTiles()
    expect(t.cols * 16).toBe(ROOM_WIDTH)
    expect(t.rows * 16).toBe(ROOM_HEIGHT)
    expect(t.data).toHaveLength(t.rows)
    expect(t.data[0]).toBe('G'.repeat(t.cols))
    expect(t.data[5][0]).toBe('G')
    expect(t.data[5][t.cols - 1]).toBe('G')
    expect(t.data[5][5]).toBe('.')
    expect(buildTestRoom(walker, stage).tiles).toEqual(t)
  })

  it('applies knob values to the brick copy and leaves the defaults alone', () => {
    const v = hero.program.variables.find((x) => x.showInBuild)!
    const d = buildTestRoom(hero, stage, { knobs: { [v.id]: 99 } })
    expect(d.copies[0].knobs).toEqual({ [v.id]: 99 })
    expect(d.bricks[0].program.variables.find((x) => x.id === v.id)?.value).toBe(v.value)
    expect(buildTestRoom(hero, stage).copies[0].knobs).toBeUndefined()
  })

  it('does not carry the stage scripts or backdrops, only its variables', () => {
    const d = buildTestRoom(walker, stage)
    expect(d.stage.program.scripts).toEqual([])
    expect(d.stage.costumes).toEqual([])
    expect(d.stage.program.variables).toEqual(stage.program.variables)
  })

  it('runs: the brick copy exists in the world and stays inside the room for 90 ticks', () => {
    const rt = play(buildTestRoom(walker, stage, { hero: createHeroBrick().brick }))
    for (let i = 0; i < 90; i++) rt.step()
    const t = rt.world.targets.find((x) => x.brickId === walker.id)!
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x).toBeLessThanOrEqual(ROOM_WIDTH)
    expect(t.y).toBeGreaterThanOrEqual(0)
  })
})

describe('knob slider range rule', () => {
  it('whole numbers: 0 to 2x, step 1', () => {
    expect(knobRange(7)).toEqual({ min: 0, max: 14, step: 1 })
  })
  it('zero: 0 to 10', () => {
    expect(knobRange(0)).toEqual({ min: 0, max: 10, step: 1 })
  })
  it('decimals >= 1 step 0.05', () => {
    expect(knobRange(1.5)).toEqual({ min: 0, max: 3, step: 0.05 })
  })
  it('small decimals get a finer step', () => {
    const r = knobRange(0.22)
    expect(r.max).toBeCloseTo(0.44)
    expect(r.step).toBeCloseTo(0.01)
  })
  it('negative values mirror and always contain the value', () => {
    expect(knobRange(-3)).toEqual({ min: -6, max: 0, step: 1 })
    for (const v of [-3, -0.4, 0, 0.0547, 1, 2.5, 100, 14.3]) {
      const r = knobRange(v)
      expect(r.min).toBeLessThanOrEqual(v)
      expect(r.max).toBeGreaterThanOrEqual(v)
    }
  })
  it('formats tidily', () => {
    expect(formatKnob(3)).toBe('3')
    expect(formatKnob(0.2188))
    expect(formatKnob(0.21875)).toBe('0.219')
  })
})
