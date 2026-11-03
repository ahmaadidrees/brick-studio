import { describe, expect, it } from 'vitest'
import { drawGrass, drawSky, GRASS, GRASS_STRIPE, GRASS_STRIPE_STEPS } from './sky'

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

describe('Racing’s grass', () => {
  function recorder() {
    const fills: { color: unknown; rect: number[] }[] = []
    let color: unknown = ''
    const ctx = {
      set fillStyle(v: unknown) { color = v },
      get fillStyle() { return color },
      fillRect: (...rect: number[]) => fills.push({ color, rect }),
      save() {},
      restore() {},
    } as unknown as CanvasRenderingContext2D
    return { ctx, fills }
  }

  it('is green with lighter mowing stripes, cut to the screen', () => {
    const { ctx, fills } = recorder()
    // A 1024 x 640 track (the beginner track) seen through a 480 x 360 view at zoom 1, centred on (240, 180).
    drawGrass(ctx, { left: 0, right: 1024, bottom: 0, top: 640 }, { x: 240, y: 180, viewWidth: 480 }, { width: 480, height: 360 })
    expect(fills[0]).toEqual({ color: GRASS, rect: [0, 0, 480, 360] })
    const stripes = fills.slice(1)
    expect(stripes.length).toBeGreaterThan(0)
    for (const s of stripes) {
      expect(s.color).toBe(GRASS_STRIPE)
      expect(s.rect[0]).toBe(0)
      expect(s.rect[2]).toBe(480)
      expect(s.rect[1]).toBeGreaterThanOrEqual(0)
      expect(s.rect[1] + s.rect[3]).toBeLessThanOrEqual(360)
    }
    // The level's bottom is at screen y 360 (camera y 180, zoom 1), so stripe 1 (steps 64 to 128) is screen y 232 to 296.
    expect(stripes.map((s) => s.rect[1])).toContain(360 - 2 * GRASS_STRIPE_STEPS)
  })

  it('stays cheap however big the track: a fill and a few stripes per frame', () => {
    const { ctx, fills } = recorder()
    drawGrass(ctx, { left: 0, right: 20000, bottom: 0, top: 20000 }, { x: 10000, y: 10000, viewWidth: 480 }, { width: 960, height: 720 })
    expect(fills.length).toBeLessThanOrEqual(1 + 4)
  })

  it('draws nothing when the track is off screen', () => {
    const { ctx, fills } = recorder()
    drawGrass(ctx, { left: 0, right: 100, bottom: 0, top: 100 }, { x: 5000, y: 5000, viewWidth: 480 }, { width: 480, height: 360 })
    expect(fills).toEqual([])
  })
})
