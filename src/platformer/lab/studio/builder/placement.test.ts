import { describe, expect, it } from 'vitest'
import type { BrickDef, LevelDesign } from '../../core/contracts'
import { costumeFromImage, imageFromRows } from '../pixels'
import { clampToLevel, copyBox, isHeroBrick, landingSpot } from './placement'

// A 16x16 costume centred on its middle: the box is 8 steps either side of the copy's point.
function brick(id: string, name = id): BrickDef {
  const rows = Array.from({ length: 16 }, () => '#'.repeat(16))
  return {
    id,
    name,
    costumes: [costumeFromImage('c', imageFromRows(rows, { '#': '#336699' }))],
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }
}

function design(): LevelDesign {
  const data = Array.from({ length: 22 }, (_, row) => (row < 2 ? '='.repeat(60) : '.'.repeat(60)))
  return {
    id: 'd',
    name: 'd',
    seed: 1,
    bounds: { left: 0, right: 960, bottom: 0, top: 352 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: [brick('coin'), brick('brick_hero', 'Hero')],
    copies: [],
    tiles: { cols: 60, rows: 22, data },
  }
}

describe('placement: bricks stay inside the level', () => {
  const d = design()
  it('a brick inside the level is left alone', () => {
    expect(clampToLevel(d, { brickId: 'coin' }, 200, 200, 8)).toEqual({ x: 200, y: 200 })
  })
  it('a brick past an edge stops with its art just inside, on the grid', () => {
    const left = clampToLevel(d, { brickId: 'coin' }, -520, 672, 8)
    const box = copyBox(d, { brickId: 'coin' }, left.x, left.y)!
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.top).toBeLessThanOrEqual(352)
    expect(left.x % 8).toBe(0)
    expect(left.y % 8).toBe(0)
    const right = clampToLevel(d, { brickId: 'coin' }, 2000, -50, 8)
    const rbox = copyBox(d, { brickId: 'coin' }, right.x, right.y)!
    expect(rbox.right).toBeLessThanOrEqual(960)
    expect(rbox.bottom).toBeGreaterThanOrEqual(0)
  })
  it('a bigger copy (size) is kept in by its real box', () => {
    const at = clampToLevel(d, { brickId: 'coin', size: 400 }, 0, 100, 8)
    expect(copyBox(d, { brickId: 'coin', size: 400 }, at.x, at.y)!.left).toBeGreaterThanOrEqual(0)
  })
})

describe('placement: the Hero never starts inside the ground', () => {
  const d = design()
  it('knows the Hero', () => {
    expect(isHeroBrick(d, 'brick_hero')).toBe(true)
    expect(isHeroBrick(d, 'coin')).toBe(false)
  })
  it('a Hero put into the ground is lifted to stand on top of it (rows 0-1 are ground, top at y 32)', () => {
    const at = landingSpot(d, { brickId: 'brick_hero' }, 100, 16, 8)
    expect(copyBox(d, { brickId: 'brick_hero' }, at.x, at.y)!.bottom).toBe(32)
    expect(at.x).toBe(100)
  })
  it('a Hero below the level comes back in and onto the ground', () => {
    const at = landingSpot(d, { brickId: 'brick_hero' }, 100, -200, 8)
    expect(copyBox(d, { brickId: 'brick_hero' }, at.x, at.y)!.bottom).toBe(32)
  })
  it('a Hero in the air stays where it was put; other bricks may sit in the ground', () => {
    expect(landingSpot(d, { brickId: 'brick_hero' }, 100, 120, 8)).toEqual({ x: 100, y: 120 })
    expect(landingSpot(d, { brickId: 'coin' }, 100, 16, 8)).toEqual({ x: 100, y: 16 })
  })
  it('a Hero inside a tall wall goes up over it', () => {
    const tall = design()
    tall.tiles = { ...tall.tiles!, data: tall.tiles!.data.map((r, row) => (row < 6 ? '='.repeat(60) : r)) }
    const at = landingSpot(tall, { brickId: 'brick_hero' }, 100, 40, 8)
    expect(copyBox(tall, { brickId: 'brick_hero' }, at.x, at.y)!.bottom).toBe(96)
  })
  it('with no clear spot above, the Hero stays where it was put', () => {
    const full = design()
    full.tiles = { ...full.tiles!, data: full.tiles!.data.map(() => '='.repeat(60)) }
    expect(landingSpot(full, { brickId: 'brick_hero' }, 100, 40, 8)).toEqual({ x: 100, y: 40 })
  })
})
