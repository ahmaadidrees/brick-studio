/**
 * Costume pixels ⇄ Costume. Shared by the costume editor, the starter project and tests. Pure TypeScript (no canvas),
 * so it runs in Node tests. The costume format every lane relies on:
 *   - `asset` is a PNG data URL of exactly width × height pixels;
 *   - `mask` marks pixels with alpha > 0; `opaque` is their bounding box (right/bottom exclusive);
 *   - the rotation center defaults to the middle of the image.
 */
import type { Costume, CostumeMask } from '../core/contracts'

/** RGBA, row-major from the top-left, 4 bytes per pixel. */
export interface PixelImage {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function blankImage(width: number, height: number): PixelImage {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) }
}

/** Build an image from rows of palette characters ('.' or ' ' = transparent). Handy for starter art and tests. */
export function imageFromRows(rows: string[], palette: Record<string, string>): PixelImage {
  const height = rows.length
  const width = Math.max(...rows.map((r) => r.length))
  const img = blankImage(width, height)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const hex = palette[row[x]]
      if (!hex) continue
      const i = (y * width + x) * 4
      img.data[i] = parseInt(hex.slice(1, 3), 16)
      img.data[i + 1] = parseInt(hex.slice(3, 5), 16)
      img.data[i + 2] = parseInt(hex.slice(5, 7), 16)
      img.data[i + 3] = 255
    }
  })
  return img
}

export function maskOf(img: PixelImage): CostumeMask {
  const data = new Uint8Array(img.width * img.height)
  for (let p = 0; p < data.length; p++) data[p] = img.data[p * 4 + 3] > 0 ? 1 : 0
  return { width: img.width, height: img.height, data }
}

/** Bounding box of opaque pixels; undefined when the image is fully transparent. */
export function opaqueBounds(mask: CostumeMask): Costume['opaque'] {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (!mask.data[y * mask.width + x]) continue
      if (x < left) left = x
      if (y < top) top = y
      if (x + 1 > right) right = x + 1
      if (y + 1 > bottom) bottom = y + 1
    }
  }
  return left === Infinity ? undefined : { left, top, right, bottom }
}

export function costumeFromImage(name: string, img: PixelImage, center?: { x: number; y: number }): Costume {
  const mask = maskOf(img)
  return {
    name,
    width: img.width,
    height: img.height,
    rotationCenterX: center?.x ?? img.width / 2,
    rotationCenterY: center?.y ?? img.height / 2,
    opaque: opaqueBounds(mask) ?? { left: 0, top: 0, right: 0, bottom: 0 },
    mask,
    asset: pngDataUrl(img),
  }
}

// ------------------------------------------------------------------ minimal PNG encoder (stored deflate blocks)

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function adler32(bytes: Uint8Array): number {
  let a = 1
  let b = 0
  for (const x of bytes) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function chunk(type: string, data: Uint8Array): number[] {
  const body = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i)
  body.set(data, 4)
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

export function encodePng(img: PixelImage): Uint8Array {
  const raw = new Uint8Array(img.height * (img.width * 4 + 1))
  for (let y = 0; y < img.height; y++) {
    raw[y * (img.width * 4 + 1)] = 0 // filter: none
    raw.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * (img.width * 4 + 1) + 1)
  }
  // zlib stream of uncompressed deflate blocks (max 65535 bytes each).
  const z: number[] = [0x78, 0x01]
  for (let off = 0; off < raw.length || off === 0; off += 65535) {
    const len = Math.min(65535, raw.length - off)
    const last = off + len >= raw.length ? 1 : 0
    z.push(last, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255)
    for (let i = 0; i < len; i++) z.push(raw[off + i])
    if (raw.length === 0) break
  }
  z.push(...u32(adler32(raw)))
  const ihdr = new Uint8Array([...u32(img.width), ...u32(img.height), 8, 6, 0, 0, 0])
  return new Uint8Array([
    137, 80, 78, 71, 13, 10, 26, 10,
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', new Uint8Array(z)),
    ...chunk('IEND', new Uint8Array(0)),
  ])
}

export function pngDataUrl(img: PixelImage): string {
  const bytes = encodePng(img)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}
