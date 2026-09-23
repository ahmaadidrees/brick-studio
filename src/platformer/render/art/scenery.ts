import { Bitmap, hex } from './bitmap'
import { PAL } from './palette'

/* Background scenery: studded hills, clouds and bushes. Procedural, drawn once at start-up. */

function blob(w: number, h: number, circles: [number, number, number][], fill: string, shade: string, outline: string, studColor?: string): Bitmap {
  const b = new Bitmap(w, h)
  for (const [cx, cy, r] of circles) b.disc(cx, cy, r, hex(fill))
  // Shade the lower-right of the shape.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!b.get(x, y)) continue
      if (!b.get(x + 2, y + 2) || !b.get(x, y + 3)) b.set(x, y, hex(shade))
    }
  }
  const out = b.outlined(outline)
  if (studColor) {
    for (let x = 6; x < w - 6; x += 12) {
      for (let y = 4; y < h; y++) {
        if (out.get(x, y) && out.get(x, y)![0] === hex(fill)[0] && out.get(x, y - 2)) {
          out.set(x, y + 2, hex(studColor))
          out.set(x + 1, y + 2, hex(studColor))
          break
        }
      }
    }
  }
  return out
}

export function cloud(size: 'small' | 'big'): Bitmap {
  if (size === 'small') return blob(34, 20, [[10, 12, 7], [18, 8, 8], [26, 12, 7]], PAL.cloud, PAL.cloudShade, PAL.outline)
  return blob(52, 24, [[10, 15, 8], [20, 10, 9], [32, 9, 9], [42, 15, 8]], PAL.cloud, PAL.cloudShade, PAL.outline)
}

export function bush(): Bitmap {
  return blob(48, 18, [[10, 13, 8], [22, 9, 9], [34, 11, 9], [40, 14, 7]], PAL.bush, '#2f8a3a', PAL.outline, PAL.bushLight)
}

export function hill(big: boolean, far: boolean): Bitmap {
  const w = big ? 96 : 64
  const h = big ? 56 : 36
  const fill = far ? PAL.hillFar : PAL.hill
  const shade = far ? PAL.hillFarShade : PAL.hillShade
  const b = new Bitmap(w, h)
  const cx = w / 2
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - cx) / (w / 2)
      const dy = (h - y - 0.5) / h
      if (dx * dx + (1 - dy) * (1 - dy) * 0.0 + dy * dy * 0 <= 1 && dy <= Math.sqrt(1 - dx * dx)) b.set(x, y, hex(fill))
    }
  }
  // Shade the right flank, add stud dots.
  for (let y = 0; y < h; y++) for (let x = Math.floor(cx + 6); x < w; x++) if (b.get(x, y) && (x + y) % 3 !== 0) b.set(x, y, hex(shade))
  const out = b.outlined(PAL.outline)
  for (const [x, y] of big
    ? [
        [30, 22],
        [42, 34],
        [26, 42],
        [52, 20],
      ]
    : [
        [22, 16],
        [34, 24],
      ]) {
    out.rect(x, y, 3, 2, hex(far ? '#c9ecc2' : '#9be39a'))
    out.hline(x, x + 2, y + 2, hex(PAL.outline))
  }
  return out
}
