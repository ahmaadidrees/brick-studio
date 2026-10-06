import { describe, expect, it } from 'vitest'
import type { BrickDef, LevelDesign } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { costumeFromImage, imageFromRows } from '../pixels'
import { cellsOnLine, decidePress, tileCharAt, worldToCell, type BuildTool } from './tilePaint'

const layer = (cols: number, rows: number) => ({ cols, rows, data: Array.from({ length: rows }, () => '.'.repeat(cols)) })

function brick(id: string): BrickDef {
  return {
    id,
    name: id,
    costumes: [costumeFromImage('c', imageFromRows(['####', '####', '####', '####'], { '#': '#336699' }))],
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }
}

function design(): LevelDesign {
  return {
    id: 'd',
    name: 'd',
    seed: 1,
    bounds: { left: 0, right: 960, bottom: 0, top: 352 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: [brick('b1')],
    copies: [{ id: 'c1', brickId: 'b1', x: 200, y: 100 }],
    tiles: layer(60, 22),
  }
}

const none: BuildTool = { brushTile: null, brushBrickId: null, erasing: false }

describe('worldToCell: row 0 is the bottom row (y up)', () => {
  const l = layer(60, 22)
  it('the bottom-left corner of the level is cell (0, 0)', () => {
    expect(worldToCell(l, 0, 0)).toEqual({ col: 0, row: 0 })
    expect(worldToCell(l, 15.9, 15.9)).toEqual({ col: 0, row: 0 })
  })
  it('going up a tile goes up a row, not down', () => {
    expect(worldToCell(l, 0, TILE_SIZE)).toEqual({ col: 0, row: 1 })
    expect(worldToCell(l, 5 * TILE_SIZE + 3, 2 * TILE_SIZE + 3)).toEqual({ col: 5, row: 2 })
  })
  it('the top row is rows - 1, and the world above or beside the layer is outside', () => {
    expect(worldToCell(l, 10, 21 * TILE_SIZE + 4)).toEqual({ col: 0, row: 21 })
    expect(worldToCell(l, 10, 22 * TILE_SIZE)).toBeNull()
    expect(worldToCell(l, -1, 5)).toBeNull()
    expect(worldToCell(l, 5, -1)).toBeNull()
    expect(worldToCell(l, 60 * TILE_SIZE, 5)).toBeNull()
    expect(worldToCell(l, NaN, 5)).toBeNull()
  })
  it('tileCharAt reads the same row 0 = bottom the store writes', () => {
    const t = { cols: 3, rows: 2, data: ['G..', '.B.'] }
    expect(tileCharAt(t, 0, 0)).toBe('G')
    expect(tileCharAt(t, 1, 1)).toBe('B')
    expect(tileCharAt(t, 9, 9)).toBe('.')
  })
})

describe('cellsOnLine: a fast drag leaves no gaps', () => {
  it('includes both ends and every step between', () => {
    expect(cellsOnLine({ col: 0, row: 0 }, { col: 4, row: 0 })).toEqual([0, 1, 2, 3, 4].map((col) => ({ col, row: 0 })))
    expect(cellsOnLine({ col: 3, row: 2 }, { col: 3, row: 2 })).toEqual([{ col: 3, row: 2 }])
  })
  it('runs in either direction and diagonally without skipping a column', () => {
    const back = cellsOnLine({ col: 5, row: 1 }, { col: 1, row: 3 })
    expect(back[0]).toEqual({ col: 5, row: 1 })
    expect(back[back.length - 1]).toEqual({ col: 1, row: 3 })
    for (let i = 1; i < back.length; i++) {
      expect(Math.abs(back[i].col - back[i - 1].col)).toBeLessThanOrEqual(1)
      expect(Math.abs(back[i].row - back[i - 1].row)).toBeLessThanOrEqual(1)
    }
  })
})

describe('decidePress: selecting vs painting', () => {
  const d = design()
  it('pressing an existing copy selects it instead of painting over it (tile brush)', () => {
    const r = decidePress(d, { ...none, brushTile: 'G' }, 200, 100)
    expect(r.kind).toBe('select-copy')
    if (r.kind === 'select-copy') expect(r.copy.id).toBe('c1')
  })
  it('pressing an existing copy selects it instead of placing another (brick brush)', () => {
    expect(decidePress(d, { ...none, brushBrickId: 'b1' }, 200, 100).kind).toBe('select-copy')
  })
  it('empty space with a tile armed paints that cell, with row 0 at the bottom', () => {
    expect(decidePress(d, { ...none, brushTile: 'G' }, 40, 5)).toEqual({ kind: 'paint-tile', cell: { col: 2, row: 0 }, ch: 'G' })
    expect(decidePress(d, { ...none, brushTile: 'S' }, 40, 40)).toEqual({ kind: 'paint-tile', cell: { col: 2, row: 2 }, ch: 'S' })
  })
  it('empty space with a brick armed places a copy, snapped to the grid', () => {
    expect(decidePress(d, { ...none, brushBrickId: 'b1' }, 405, 77, { snap: 8 })).toEqual({ kind: 'place-copy', brickId: 'b1', x: 408, y: 80 })
  })
  it('a tile brush wins over the remembered brick brush', () => {
    expect(decidePress(d, { brushTile: 'B', brushBrickId: 'b1', erasing: false }, 600, 5).kind).toBe('paint-tile')
  })
  it('nothing armed on empty space is nothing (a drag scrolls)', () => {
    expect(decidePress(d, none, 600, 200).kind).toBe('nothing')
  })
  it('right-click and the Erase tool remove a copy first, otherwise clear the tile', () => {
    expect(decidePress(d, { ...none, brushTile: 'G' }, 200, 100, { erase: true }).kind).toBe('erase-copy')
    expect(decidePress(d, { ...none, erasing: true }, 200, 100).kind).toBe('erase-copy')
    expect(decidePress(d, { ...none, brushTile: 'G' }, 40, 5, { erase: true })).toEqual({ kind: 'paint-tile', cell: { col: 2, row: 0 }, ch: '.' })
    expect(decidePress(d, { ...none, erasing: true }, 40, 5)).toEqual({ kind: 'paint-tile', cell: { col: 2, row: 0 }, ch: '.' })
  })
  it('a press outside the tile layer paints nothing', () => {
    expect(decidePress(d, { ...none, brushTile: 'G' }, 5000, 5).kind).toBe('nothing')
  })
})
