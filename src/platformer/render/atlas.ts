import type { Bitmap } from './art/bitmap'
import { GLYPH_ADVANCE, textBitmap } from './art/font'
import { buildArt } from './art/library'

/** Art keys turned into canvases on first use and kept. */
export class Atlas {
  private cache = new Map<string, HTMLCanvasElement>()
  private glyphs = new Map<string, HTMLCanvasElement>()

  get(key: string): HTMLCanvasElement {
    let c = this.cache.get(key)
    if (!c) {
      c = toCanvas(buildArt(key))
      this.cache.set(key, c)
    }
    return c
  }

  /** Draw text in the pixel font, one cached glyph at a time. */
  text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#ffffff') {
    const s = text.toUpperCase()
    for (let i = 0; i < s.length; i++) {
      if (s[i] === ' ') continue
      const k = s[i] + color
      let g = this.glyphs.get(k)
      if (!g) {
        g = toCanvas(textBitmap(s[i], color))
        this.glyphs.set(k, g)
      }
      ctx.drawImage(g, x + i * GLYPH_ADVANCE, y)
    }
  }

  textWidth(text: string): number {
    return text.length * GLYPH_ADVANCE + 1
  }
}

export function toCanvas(b: Bitmap): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = b.w
  c.height = b.h
  const ctx = c.getContext('2d')!
  ctx.putImageData(new ImageData(new Uint8ClampedArray(b.data), b.w, b.h), 0, 0)
  return c
}
