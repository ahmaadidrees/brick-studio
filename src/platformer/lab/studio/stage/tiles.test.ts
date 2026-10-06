import { describe, expect, it } from 'vitest'
import type { TileLayer } from '../../core/contracts'
import { activeCoinPops, COIN_POP_MS, drawSky, tileArtKey, trackCoinPops } from './tiles'

const layer = (): TileLayer => ({ cols: 4, rows: 2, data: ['GQ..', '....'] })

describe('coin pop (view only)', () => {
  it('a ? block that turns used starts one pop above it; loading a level pops nothing', () => {
    const l = layer()
    trackCoinPops(l, 0) // first sight only records the rows
    expect(activeCoinPops(l, 0)).toEqual([])
    l.data[0] = 'GU..'
    trackCoinPops(l, 100)
    expect(activeCoinPops(l, 100)).toEqual([{ col: 1, row: 0, t: 0 }])
    // Another frame with no change adds nothing new.
    trackCoinPops(l, 116)
    expect(activeCoinPops(l, 116)).toHaveLength(1)
  })

  it('the pop ends after its time, and a block that was already used pops nothing', () => {
    const l = layer()
    trackCoinPops(l, 0)
    l.data[0] = 'GU..'
    trackCoinPops(l, 10)
    expect(activeCoinPops(l, 10 + COIN_POP_MS - 1)).toHaveLength(1)
    expect(activeCoinPops(l, 10 + COIN_POP_MS)).toEqual([])
    const used = { cols: 2, rows: 1, data: ['UU'] }
    trackCoinPops(used, 0)
    trackCoinPops(used, 50)
    expect(activeCoinPops(used, 50)).toEqual([])
  })
})

describe('the new tiles have the real builder art', () => {
  it('one-way, bounce and used cells each get an art key', () => {
    const l: TileLayer = { cols: 3, rows: 1, data: ['-OU'] }
    expect([0, 1, 2].map((c) => tileArtKey(l, c, 0))).toEqual(['semi:00', 'bounce', 'used'].map((k) => expect.stringContaining(k.split(':')[0])))
  })
})

describe('the day sky', () => {
  it('paints the level rectangle in the Brickgineers sky blue', () => {
    const fills: { color: string; rect: number[] }[] = []
    let color = ''
    const ctx = {
      set fillStyle(v: string) {
        color = v
      },
      fillRect: (...rect: number[]) => fills.push({ color, rect }),
      save() {},
      restore() {},
      beginPath() {},
      rect() {},
      clip() {},
    } as unknown as CanvasRenderingContext2D
    drawSky(ctx, { left: 0, right: 960, bottom: 0, top: 360 }, { x: 240, y: 180, viewWidth: 480 }, { width: 480, height: 360 })
    expect(fills[0].color).toBe('#79b8ff')
    // Camera centred on x = 240 with a 480-wide view at zoom 1: the level's left edge is at screen x 0.
    expect(fills[0].rect).toEqual([0, 0, 960, 360])
  })
})
