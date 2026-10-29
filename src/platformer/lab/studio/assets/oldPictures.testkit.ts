/*
 * Tests only: pictures exactly as the studio saved them until 2026-10-29 (raw rows in stored deflate blocks, and an
 * empty 0 × 0 opaque box when nothing was painted), so tests can build the saves kids already have.
 */
import { encodeBase64 } from '../../core/save'
import { maskOf, type PixelImage } from '../pixels'

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
function chunk(type: string, data: number[] | Uint8Array): number[] {
  const body = new Uint8Array(4 + data.length)
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i)
  body.set(data, 4)
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

/** What pixels.ts wrote until 2026-10-29: filter 0 rows in stored deflate blocks. */
export function storedPngDataUrl(img: PixelImage): string {
  const raw = new Uint8Array(img.height * (img.width * 4 + 1))
  for (let y = 0; y < img.height; y++) raw.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), y * (img.width * 4 + 1) + 1)
  const blocks = Math.max(1, Math.ceil(raw.length / 65535))
  const z = new Uint8Array(2 + raw.length + blocks * 5 + 4)
  z.set([0x78, 0x01])
  let o = 2
  for (let off = 0; off < raw.length; off += 65535) {
    const len = Math.min(65535, raw.length - off)
    z.set([off + len >= raw.length ? 1 : 0, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255], o)
    z.set(raw.subarray(off, off + len), o + 5)
    o += 5 + len
  }
  let a = 1
  let b = 0
  for (const x of raw) {
    a = (a + x) % 65521
    b = (b + a) % 65521
  }
  z.set(u32(((b << 16) | a) >>> 0), o)
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...chunk('IHDR', [...u32(img.width), ...u32(img.height), 8, 6, 0, 0, 0]), ...chunk('IDAT', z), ...chunk('IEND', [])])
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}

/** A costume as save JSON, exactly as the old editor made it. */
export function oldCostume(name: string, img: PixelImage) {
  const mask = maskOf(img)
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!mask.data[y * img.width + x]) continue
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x + 1)
      bottom = Math.max(bottom, y + 1)
    }
  }
  return {
    name,
    width: img.width,
    height: img.height,
    rotationCenterX: img.width / 2,
    rotationCenterY: img.height / 2,
    opaque: left === Infinity ? { left: 0, top: 0, right: 0, bottom: 0 } : { left, top, right, bottom },
    mask: { width: img.width, height: img.height, data: encodeBase64(mask.data) },
    asset: storedPngDataUrl(img),
  }
}
