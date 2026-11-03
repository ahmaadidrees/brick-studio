import { describe, expect, it } from 'vitest'
import type { BrickDef, LevelDesign } from '../../core/contracts'
import { costumeFromImage, imageFromRows } from '../pixels'
import { TILE_SIZE } from '../../core/contracts'
import { createRaceStarterProject } from '../race/raceProject'
import { CAR_BRICK_ID, RACER_BRICK_ID } from '../race/carBrick'
import { clampToLevel, copyBox, isHeroBrick, isRaceCarBrick, landingPose, landingSpot, trackFacing } from './placement'

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

describe('placement: race cars', () => {
  const race = () => createRaceStarterProject().design
  const centre = (c: number, r: number) => ({ x: c * TILE_SIZE + TILE_SIZE / 2, y: r * TILE_SIZE + TILE_SIZE / 2 })
  /** The first cell holding this character, scanning from (col, row) along `dc`, `dr`. */
  const findAlong = (d: LevelDesign, ch: string, col: number, row: number, dc: number, dr: number): [number, number] => {
    for (let c = col, r = row; c >= 0 && r >= 0 && c < d.tiles!.cols && r < d.tiles!.rows; c += dc, r += dr) if (d.tiles!.data[r][c] === ch) return [c, r]
    throw new Error(`no ${ch}`)
  }
  const wallCells = (d: LevelDesign, box: { left: number; right: number; bottom: number; top: number }) => {
    const hits: string[] = []
    for (let r = Math.floor(box.bottom / TILE_SIZE); r <= Math.ceil(box.top / TILE_SIZE) - 1; r++) {
      for (let c = Math.floor(box.left / TILE_SIZE); c <= Math.ceil(box.right / TILE_SIZE) - 1; c++) if (d.tiles!.data[r]?.[c] === 'X') hits.push(`${c},${r}`)
    }
    return hits
  }

  it('knows the Car and Computer racers, only in a race level', () => {
    const d = race()
    expect(isRaceCarBrick(d, CAR_BRICK_ID)).toBe(true)
    expect(isRaceCarBrick(d, RACER_BRICK_ID)).toBe(true)
    expect(isRaceCarBrick(d, 'brick_starter')).toBe(false)
    expect(isRaceCarBrick({ ...d, kit: undefined }, CAR_BRICK_ID)).toBe(false)
    expect(isRaceCarBrick({ ...d, bricks: d.bricks.map((b) => (b.id === CAR_BRICK_ID ? { ...b, name: 'My Car', remixOf: CAR_BRICK_ID } : b)) }, CAR_BRICK_ID)).toBe(true)
  })

  it('faces along the track: right on the bottom straight, up the right side, left along the top, down the left side', () => {
    const d = race()
    const at = (c: number, r: number) => trackFacing(d, centre(c, r).x, centre(c, r).y)
    expect(at(32, 8)).toBe(90)
    expect(at(57, 19)).toBe(0)
    expect(at(32, 30)).toBe(-90)
    expect(at(7, 19)).toBe(180)
    // Round the corner from the bottom straight to the right side: between right and up.
    expect([0, 45, 90]).toContain(at(55, 10))
    // Far from any road, or with no finish line, there is no track to follow.
    expect(at(32, 19)).toBeUndefined()
    const noFinish = { ...d, tiles: { ...d.tiles!, data: d.tiles!.data.map((row) => row.replace(/F/g, 'R')) } }
    expect(trackFacing(noFinish, centre(32, 8).x, centre(32, 8).y)).toBeUndefined()
  })

  it('a Car dropped on a Barrier moves to the nearest clear spot, facing along the track', () => {
    const d = race()
    // The barrier below the bottom straight.
    const [c, r] = findAlong(d, 'X', 32, 8, 0, -1)
    const { x, y } = centre(c, r)
    const pose = landingPose(d, { brickId: CAR_BRICK_ID }, x, y, 8)
    const box = copyBox(d, { brickId: CAR_BRICK_ID, direction: pose.direction }, pose.x, pose.y)!
    expect(wallCells(d, box)).toEqual([])
    expect(Math.hypot(pose.x - x, pose.y - y)).toBeLessThanOrEqual(2 * TILE_SIZE)
    expect(pose.x % 8).toBe(0)
    expect(pose.y % 8).toBe(0)
    expect(pose.direction).toBe(90)
  })

  it('a Computer racer put on the road stays put and faces the way the race goes', () => {
    const d = race()
    const { x, y } = centre(57, 19)
    expect(landingPose(d, { brickId: RACER_BRICK_ID }, x, y)).toEqual({ x, y, direction: 0 })
  })

  it('other bricks, and every Platformer brick, land just as before', () => {
    const d = race()
    const [c, r] = findAlong(d, 'X', 32, 8, 0, -1)
    const { x, y } = centre(c, r)
    expect(landingPose(d, { brickId: 'brick_starter' }, x, y, 8)).toEqual(landingSpot(d, { brickId: 'brick_starter' }, x, y, 8))
    const p = design()
    expect(landingPose(p, { brickId: 'brick_hero' }, 100, 16, 8)).toEqual(landingSpot(p, { brickId: 'brick_hero' }, 100, 16, 8))
    expect(landingPose(p, { brickId: 'coin' }, 100, 16, 8)).toEqual({ x: 100, y: 16 })
  })
})
