import { describe, expect, it } from 'vitest'
import { drawSky } from './sky'

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
