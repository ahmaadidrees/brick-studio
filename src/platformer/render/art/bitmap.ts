/** A small RGBA pixel buffer. Pure data: usable in the browser and in Node tests. */
export class Bitmap {
  readonly data: Uint8ClampedArray
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8ClampedArray(w * h * 4)
  }

  set(x: number, y: number, c: Rgba | null) {
    if (!c || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = (y * this.w + x) * 4
    this.data[i] = c[0]
    this.data[i + 1] = c[1]
    this.data[i + 2] = c[2]
    this.data[i + 3] = c[3]
  }

  get(x: number, y: number): Rgba | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null
    const i = (y * this.w + x) * 4
    if (this.data[i + 3] === 0) return null
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]
  }

  rect(x: number, y: number, w: number, h: number, c: Rgba) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c)
  }

  hline(x0: number, x1: number, y: number, c: Rgba) {
    for (let x = x0; x <= x1; x++) this.set(x, y, c)
  }

  vline(x: number, y0: number, y1: number, c: Rgba) {
    for (let y = y0; y <= y1; y++) this.set(x, y, c)
  }

  /** Filled circle using the pixel-centre rule, so small circles look round. */
  disc(cx: number, cy: number, r: number, c: Rgba) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        if (dx * dx + dy * dy <= r * r) this.set(x, y, c)
      }
    }
  }

  /** Copy another bitmap on top, skipping its transparent pixels. */
  blit(src: Bitmap, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y)
        if (c) this.set(dx + x, dy + y, c)
      }
    }
  }

  flipped(): Bitmap {
    const out = new Bitmap(this.w, this.h)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y))
    return out
  }

  flippedV(): Bitmap {
    const out = new Bitmap(this.w, this.h)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(x, this.h - 1 - y, this.get(x, y))
    return out
  }

  /** Replace colours: keys and values are '#rrggbb'. */
  recolored(map: Record<string, string>): Bitmap {
    const lookup = new Map<string, Rgba>()
    for (const [from, to] of Object.entries(map)) lookup.set(from.toLowerCase(), hex(to))
    const out = new Bitmap(this.w, this.h)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y)
        if (!c) continue
        out.set(x, y, lookup.get(toHex(c)) ?? c)
      }
    }
    return out
  }

  /** Every opaque pixel becomes `c` (for silhouettes and flashes). */
  tinted(c: string): Bitmap {
    const col = hex(c)
    const out = new Bitmap(this.w, this.h)
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y)) out.set(x, y, col)
    return out
  }

  /** Draw a dark outline around the opaque shape (only into transparent pixels). */
  outlined(c: string): Bitmap {
    const col = hex(c)
    const out = new Bitmap(this.w, this.h)
    out.blit(this, 0, 0)
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) out.set(x, y, col)
      }
    }
    return out
  }

  crop(x: number, y: number, w: number, h: number): Bitmap {
    const out = new Bitmap(w, h)
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) out.set(xx, yy, this.get(x + xx, y + yy))
    return out
  }
}

export type Rgba = [number, number, number, number]

const hexCache = new Map<string, Rgba>()
export function hex(s: string): Rgba {
  let c = hexCache.get(s)
  if (!c) {
    const v = parseInt(s.slice(1), 16)
    c = [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255]
    hexCache.set(s, c)
  }
  return c
}

export function toHex(c: Rgba): string {
  return '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1)
}

/** Build a bitmap from rows of characters, each mapped to a colour ('.' is transparent). */
export function fromRows(rows: string[], colors: Record<string, string>): Bitmap {
  const h = rows.length
  const w = Math.max(...rows.map((r) => r.length))
  const bmp = new Bitmap(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const ch = rows[y][x]
      if (ch === '.' || ch === ' ') continue
      const col = colors[ch]
      if (!col) throw new Error(`no colour for '${ch}' in sprite row ${y}: ${rows[y]}`)
      bmp.set(x, y, hex(col))
    }
  }
  return bmp
}

/** Stack bitmaps vertically into one (used to build tall sprites from parts). */
export function stack(...parts: Bitmap[]): Bitmap {
  const w = Math.max(...parts.map((p) => p.w))
  const h = parts.reduce((n, p) => n + p.h, 0)
  const out = new Bitmap(w, h)
  let y = 0
  for (const p of parts) {
    out.blit(p, 0, y)
    y += p.h
  }
  return out
}
