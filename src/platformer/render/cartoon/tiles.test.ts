import { describe, expect, it } from 'vitest'
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { CartoonSkin } from './cartoonSkin'
import { cartoonTileKey, fromPixelKey } from './tiles'

/** A little level from text: # ground, X hard, B brick, ? question, = plate, - empty. */
function grid(rows: string[]) {
  const width = rows[0].length
  const height = rows.length
  const legend: Record<string, number> = { '#': T.GROUND, X: T.HARD, B: T.BRICK, '?': T.QBLOCK, '=': T.SEMI, '-': T.EMPTY, '~': T.LAVA }
  const tiles = new Uint8Array(width * height)
  rows.forEach((row, y) => [...row].forEach((ch, x) => (tiles[y * width + x] = legend[ch])))
  const key = (x: number, y: number, frame = 0) => cartoonTileKey(tiles, width, height, x, y, 'day', frame)
  return { key }
}

describe('cartoon tiles', () => {
  it('lays ground as two-wide bricks in a running bond, green where the top is open', () => {
    const { key } = grid(['------', '######', '######'])
    const role = (x: number, y: number) => key(x, y)!.split(':')[1]
    const top = (x: number, y: number) => key(x, y)!.split(':')[2]
    // Row 1 pairs start on odd columns, row 2 on even ones, so the seams are staggered.
    expect([0, 1, 2, 3, 4, 5].map((x) => role(x, 1)).join('')).toBe('SLRLRS')
    expect([0, 1, 2, 3, 4, 5].map((x) => role(x, 2)).join('')).toBe('LRLRLR')
    expect([0, 1, 2, 3, 4, 5].map((x) => top(x, 1)).join('')).toBe('111111')
    expect([0, 1, 2, 3, 4, 5].map((x) => top(x, 2)).join('')).toBe('000000')
  })

  it('gives both halves of a brick the same colour', () => {
    const { key } = grid(['------', '######', '######'])
    for (const [x, y] of [
      [1, 1],
      [3, 1],
      [0, 2],
      [4, 2],
    ]) {
      expect(key(x, y)!.split(':')[1]).toBe('L')
      expect(key(x, y)!.split(':')[3]).toBe(key(x + 1, y)!.split(':')[3])
    }
  })

  it('splits a brick whose halves have different tops', () => {
    const { key } = grid(['-#----', '######'])
    // Column 1 has ground above it, column 2 does not: two singles, not one brick.
    expect(key(1, 1)!.startsWith('G:S:0')).toBe(true)
    expect(key(2, 1)!.startsWith('G:S:1')).toBe(true)
  })

  it('shows studs only on open tops', () => {
    const { key } = grid(['-X-', '-B-', '-?-', '==-'])
    expect(key(1, 0)).toBe('H:1')
    expect(key(1, 1)).toBe('B:0')
    expect(key(1, 2, 5)).toBe('Q:1:0')
    expect(key(0, 3)).toBe('S:01')
    expect(key(1, 3)).toBe('S:10')
    expect(key(0, 0)).toBeNull()
  })

  it('maps the pixel keys the editor and drawer use', () => {
    expect(fromPixelKey('g:0:day')).toBe('G:S:1:0:day')
    expect(fromPixelKey('g:5:underground')).toBe('G:S:1:0:underground')
    expect(fromPixelKey('semi:00')).toBe('S:00')
    expect(fromPixelKey('pipe:L:1')).toBe('P:L:1')
    expect(fromPixelKey('q:0')).toBe('Q:0:1')
    expect(fromPixelKey('walker:1')).toBeNull()
  })
})

describe('cartoon skin pictures', () => {
  // jsdom has no canvas drawing; the sizes and anchors are what the renderer relies on.
  const skin = new CartoonSkin(4)

  it('gives tiles room above them for studs', () => {
    expect(skin.sprite('G:S:1:0:day')).toMatchObject({ w: 16, h: 19, ox: 0, oy: 3 })
    expect(skin.sprite('hard')).toMatchObject({ w: 16, h: 19, oy: 3 })
  })

  it('anchors the builder at its feet and keeps the anchor when mirrored', () => {
    const s = skin.sprite('p:1:small:stand:0')
    expect(s).toMatchObject({ w: 20, h: 23, ox: 10, oy: 23 })
    expect(skin.sprite('p:1:small:stand:0|f')).toMatchObject({ w: 20, h: 23, ox: 10, oy: 23 })
    expect(skin.sprite('p:2:big:jump:1').h).toBe(34)
  })

  it('puts a lift under its studs and knows every course piece', () => {
    expect(skin.sprite('lift')).toMatchObject({ w: 48, oy: 2.6 })
    expect(skin.sprite('goal')).toMatchObject({ w: 32, h: 160 })
    expect(skin.sprite('checkpoint:3')).toMatchObject({ w: 16, h: 32 })
    expect(skin.sprite('start')).toMatchObject({ w: 32, h: 16 })
  })

  it('draws its hairlines one screen pixel wide and snaps to screen pixels', () => {
    expect(skin.hairline).toBe(0.25)
    expect(skin.snap(10.13)).toBe(10.25)
  })
})
