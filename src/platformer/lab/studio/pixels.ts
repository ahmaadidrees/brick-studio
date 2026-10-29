/**
 * Costume pixels ⇄ Costume. Shared by the costume editor, the starter project and tests. Pure TypeScript (no canvas),
 * so it runs in Node tests. The costume format every lane relies on:
 *   - `asset` is a PNG data URL of exactly width × height pixels (compressed, so it fits the save's picture limit);
 *   - `mask` marks pixels with alpha > 0; `opaque` is their bounding box (right/bottom exclusive), left out when
 *     nothing is painted (the save refuses an empty box; the all-zero mask still says nothing is solid);
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
  const opaque = opaqueBounds(mask)
  return {
    name,
    width: img.width,
    height: img.height,
    rotationCenterX: center?.x ?? img.width / 2,
    rotationCenterY: center?.y ?? img.height / 2,
    ...(opaque ? { opaque } : {}),
    mask,
    asset: pngDataUrl(img),
  }
}


// ------------------------------------------------------------------ PNG encoder (filtered rows, deflate)
//
// Pictures are compressed: a 480 × 360 backdrop is about 922,000 characters stored raw, far over the 200,000 a save
// allows for one picture (core/project.ts), but a few thousand once compressed. Each row gets the PNG filter that
// leaves the smallest numbers, then LZ77 with fixed Huffman codes; when that would be larger (noise), the rows are
// stored as they are. Deterministic, so the same picture always saves to the same text.

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
  for (let i = 0; i < bytes.length; ) {
    // 3800 keeps b well inside 2^31 before the modulo.
    const end = Math.min(bytes.length, i + 3800)
    for (; i < end; i++) {
      a += bytes[i]
      b += a
    }
    a %= 65521
    b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

function u32(n: number): number[] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  out.set(u32(data.length), 0)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  out.set(u32(crc32(out.subarray(4, 8 + data.length))), 8 + data.length)
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Rows with a filter byte each; every row gets whichever of None, Sub, Up, Paeth leaves the smallest values. */
function filteredRows(img: PixelImage): Uint8Array {
  const stride = img.width * 4
  const out = new Uint8Array(img.height * (stride + 1))
  const trial = [new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride), new Uint8Array(stride)]
  const types = [0, 1, 2, 4]
  for (let y = 0; y < img.height; y++) {
    const row = img.data.subarray(y * stride, (y + 1) * stride)
    const up = y > 0 ? img.data.subarray((y - 1) * stride, y * stride) : null
    let best = 0
    let bestScore = Infinity
    for (let t = 0; t < 4; t++) {
      const f = trial[t]
      let score = 0
      for (let i = 0; i < stride; i++) {
        const left = i >= 4 ? row[i - 4] : 0
        const above = up ? up[i] : 0
        const corner = up && i >= 4 ? up[i - 4] : 0
        const predicted = t === 0 ? 0 : t === 1 ? left : t === 2 ? above : paeth(left, above, corner)
        const v = (row[i] - predicted) & 255
        f[i] = v
        score += v < 128 ? v : 256 - v
      }
      if (score < bestScore) {
        bestScore = score
        best = t
      }
    }
    out[y * (stride + 1)] = types[best]
    out.set(trial[best], y * (stride + 1) + 1)
  }
  return out
}

class BitWriter {
  private buf = new Uint8Array(4096)
  private len = 0
  private bits = 0
  private count = 0

  private byte(b: number) {
    if (this.len === this.buf.length) {
      const bigger = new Uint8Array(this.buf.length * 2)
      bigger.set(this.buf)
      this.buf = bigger
    }
    this.buf[this.len++] = b
  }

  /** Least significant bit first, as deflate packs everything but Huffman codes. */
  write(value: number, n: number) {
    this.bits |= value << this.count
    this.count += n
    while (this.count >= 8) {
      this.byte(this.bits & 255)
      this.bits >>>= 8
      this.count -= 8
    }
  }

  finish(): Uint8Array {
    if (this.count > 0) this.byte(this.bits & 255)
    this.bits = 0
    this.count = 0
    return this.buf.subarray(0, this.len)
  }
}

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

function reverseBits(code: number, n: number): number {
  let r = 0
  for (let i = 0; i < n; i++) {
    r = (r << 1) | (code & 1)
    code >>>= 1
  }
  return r
}

/** The fixed Huffman code (RFC 1951 §3.2.6), bit-reversed so it can be written least significant bit first. */
const FIXED_LIT = (() => {
  const code = new Uint16Array(288)
  const bits = new Uint8Array(288)
  for (let v = 0; v < 288; v++) {
    const [c, n] = v < 144 ? [0x30 + v, 8] : v < 256 ? [0x190 + v - 144, 9] : v < 280 ? [v - 256, 7] : [0xc0 + v - 280, 8]
    code[v] = reverseBits(c, n)
    bits[v] = n
  }
  return { code, bits }
})()
const FIXED_DIST = Array.from({ length: 30 }, (_, d) => reverseBits(d, 5))
/** Length 3..258 → its length code's index. */
const LEN_INDEX = (() => {
  const t = new Uint8Array(259)
  for (let i = 0; i < LEN_BASE.length; i++) for (let l = LEN_BASE[i]; l < (LEN_BASE[i + 1] ?? 259); l++) t[l] = i
  t[258] = 28
  return t
})()

function distIndex(d: number): number {
  let i = 0
  while (i < 29 && DIST_BASE[i + 1] <= d) i++
  return i
}

const WINDOW = 32768
const HASH_SIZE = 1 << 15
const MAX_CHAIN = 48
const MAX_MATCH = 258

/** One final deflate block with fixed Huffman codes and greedy LZ77 matching. */
function deflateFixed(data: Uint8Array): Uint8Array {
  const out = new BitWriter()
  out.write(1, 1) // BFINAL
  out.write(1, 2) // BTYPE 01: fixed Huffman
  const n = data.length
  const head = new Int32Array(HASH_SIZE).fill(-1)
  const prev = new Int32Array(WINDOW).fill(-1)
  const hash = (p: number) => ((data[p] << 10) ^ (data[p + 1] << 5) ^ data[p + 2]) & (HASH_SIZE - 1)
  const insert = (p: number) => {
    if (p + 2 >= n) return
    const h = hash(p)
    prev[p & (WINDOW - 1)] = head[h]
    head[h] = p
  }
  const literal = (v: number) => out.write(FIXED_LIT.code[v], FIXED_LIT.bits[v])
  let i = 0
  while (i < n) {
    let bestLen = 0
    let bestDist = 0
    if (i + 2 < n) {
      const max = Math.min(MAX_MATCH, n - i)
      let j = head[hash(i)]
      for (let chain = MAX_CHAIN; j >= 0 && i - j <= WINDOW && chain > 0; chain--) {
        if (data[j + bestLen] === data[i + bestLen]) {
          let l = 0
          while (l < max && data[j + l] === data[i + l]) l++
          if (l > bestLen) {
            bestLen = l
            bestDist = i - j
            if (l === max) break
          }
        }
        const next = prev[j & (WINDOW - 1)]
        if (next >= j) break
        j = next
      }
    }
    if (bestLen >= 3) {
      const li = LEN_INDEX[bestLen]
      literal(257 + li)
      if (LEN_EXTRA[li]) out.write(bestLen - LEN_BASE[li], LEN_EXTRA[li])
      const di = distIndex(bestDist)
      out.write(FIXED_DIST[di], 5)
      if (DIST_EXTRA[di]) out.write(bestDist - DIST_BASE[di], DIST_EXTRA[di])
      for (let k = 0; k < bestLen; k++) insert(i + k)
      i += bestLen
    } else {
      literal(data[i])
      insert(i)
      i++
    }
  }
  literal(256)
  return out.finish()
}

/** Deflate "stored" blocks: the bytes as they are, for pictures that do not compress. */
function deflateStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535))
  const out = new Uint8Array(data.length + blocks * 5)
  let o = 0
  for (let b = 0; b < blocks; b++) {
    const off = b * 65535
    const len = Math.min(65535, data.length - off)
    out.set([b === blocks - 1 ? 1 : 0, len & 255, len >> 8, ~len & 255, (~len >> 8) & 255], o)
    out.set(data.subarray(off, off + len), o + 5)
    o += 5 + len
  }
  return out
}

/** A zlib stream of `raw`, compressed when that is smaller. */
export function zlibCompress(raw: Uint8Array): Uint8Array {
  const packed = deflateFixed(raw)
  const body = packed.length < raw.length ? packed : deflateStored(raw)
  const out = new Uint8Array(body.length + 6)
  out[0] = 0x78
  out[1] = 0x01
  out.set(body, 2)
  out.set(u32(adler32(raw)), body.length + 2)
  return out
}

export function encodePng(img: PixelImage): Uint8Array {
  const ihdr = new Uint8Array([...u32(img.width), ...u32(img.height), 8, 6, 0, 0, 0])
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlibCompress(filteredRows(img))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function pngDataUrl(img: PixelImage): string {
  const bytes = encodePng(img)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return `data:image/png;base64,${btoa(bin)}`
}

// ------------------------------------------------------------------ PNG decoder (any deflate stream, every row filter)

/** Biggest picture the decoder will unpack (the game's own edge limit is 4,096; masks stop at 1,000,000 pixels). */
const MAX_DECODE_PIXELS = 4_096 * 4_096

class BitReader {
  pos = 0
  private bits = 0
  private count = 0
  constructor(private readonly data: Uint8Array) {}

  bit(): number {
    if (this.count === 0) {
      if (this.pos >= this.data.length) throw new Error('end of data')
      this.bits = this.data[this.pos++]
      this.count = 8
    }
    const b = this.bits & 1
    this.bits >>= 1
    this.count--
    return b
  }

  read(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) v |= this.bit() << i
    return v
  }

  /** Skip to the next byte (stored blocks start there). */
  align() {
    this.count = 0
  }
}

interface Huffman {
  count: Uint16Array
  symbol: Uint16Array
}

function huffman(lengths: ArrayLike<number>, n: number): Huffman {
  const count = new Uint16Array(16)
  for (let i = 0; i < n; i++) count[lengths[i]]++
  count[0] = 0
  const offs = new Uint16Array(16)
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len] + count[len]
  const symbol = new Uint16Array(n)
  for (let i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i
  return { count, symbol }
}

function decodeSymbol(r: BitReader, h: Huffman): number {
  let code = 0
  let first = 0
  let index = 0
  for (let len = 1; len <= 15; len++) {
    code |= r.bit()
    const count = h.count[len]
    if (code - count < first) return h.symbol[index + (code - first)]
    index += count
    first += count
    first <<= 1
    code <<= 1
  }
  throw new Error('bad code')
}

const FIXED_HUFFMAN = (() => {
  const lengths = new Uint8Array(288 + 30)
  for (let v = 0; v < 288; v++) lengths[v] = v < 144 ? 8 : v < 256 ? 9 : v < 280 ? 7 : 8
  lengths.fill(5, 288)
  return { lit: huffman(lengths, 288), dist: huffman(lengths.subarray(288), 30) }
})()
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

/** Inflate a zlib stream into exactly `size` bytes; null when it is damaged or holds anything else. */
export function zlibDecompress(z: Uint8Array, size: number): Uint8Array | null {
  if (z.length < 6 || (z[0] & 0x0f) !== 8 || ((z[0] << 8) | z[1]) % 31 !== 0 || z[1] & 0x20) return null
  const out = new Uint8Array(size)
  let o = 0
  const r = new BitReader(z.subarray(2))
  try {
    for (let last = 0; !last; ) {
      last = r.bit()
      const type = r.read(2)
      if (type === 0) {
        r.align()
        const data = z.subarray(2)
        if (r.pos + 4 > data.length) return null
        const len = data[r.pos] | (data[r.pos + 1] << 8)
        const nlen = data[r.pos + 2] | (data[r.pos + 3] << 8)
        if ((len ^ 0xffff) !== nlen || r.pos + 4 + len > data.length || o + len > size) return null
        out.set(data.subarray(r.pos + 4, r.pos + 4 + len), o)
        o += len
        r.pos += 4 + len
        continue
      }
      let lit: Huffman
      let dist: Huffman
      if (type === 1) {
        lit = FIXED_HUFFMAN.lit
        dist = FIXED_HUFFMAN.dist
      } else if (type === 2) {
        const nlen = r.read(5) + 257
        const ndist = r.read(5) + 1
        const ncode = r.read(4) + 4
        if (nlen > 286 || ndist > 30) return null
        const lengths = new Uint8Array(320)
        for (let i = 0; i < ncode; i++) lengths[CODE_LENGTH_ORDER[i]] = r.read(3)
        const lencode = huffman(lengths, 19)
        lengths.fill(0)
        for (let i = 0; i < nlen + ndist; ) {
          const sym = decodeSymbol(r, lencode)
          if (sym < 16) lengths[i++] = sym
          else {
            let repeat = 0
            let value = 0
            if (sym === 16) {
              if (i === 0) return null
              value = lengths[i - 1]
              repeat = 3 + r.read(2)
            } else if (sym === 17) repeat = 3 + r.read(3)
            else repeat = 11 + r.read(7)
            if (i + repeat > nlen + ndist) return null
            while (repeat--) lengths[i++] = value
          }
        }
        lit = huffman(lengths, nlen)
        dist = huffman(lengths.subarray(nlen), ndist)
      } else return null
      for (;;) {
        const sym = decodeSymbol(r, lit)
        if (sym < 256) {
          if (o >= size) return null
          out[o++] = sym
        } else if (sym === 256) break
        else {
          const li = sym - 257
          if (li >= 29) return null
          const len = LEN_BASE[li] + r.read(LEN_EXTRA[li])
          const di = decodeSymbol(r, dist)
          if (di >= 30) return null
          const d = DIST_BASE[di] + r.read(DIST_EXTRA[di])
          if (d > o || o + len > size) return null
          for (let k = 0; k < len; k++, o++) out[o] = out[o - d]
        }
      }
    }
  } catch {
    return null
  }
  return o === size ? out : null
}

/**
 * Read a PNG this app wrote (8-bit RGBA, or RGB which gets full alpha), from bytes or a data URL. Null when it is
 * not one or is damaged, so callers can tell "nothing painted" from "could not read it".
 */
export function decodePng(input: string | Uint8Array): PixelImage | null {
  let bytes: Uint8Array
  if (typeof input === 'string') {
    const comma = input.indexOf(',')
    try {
      const binary = atob(comma >= 0 ? input.slice(comma + 1) : input)
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    } catch {
      return null
    }
  } else bytes = input
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 8 || signature.some((b, i) => bytes[i] !== b)) return null

  const be32 = (at: number) => ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0
  let width = 0
  let height = 0
  let channels = 0
  const idat: Uint8Array[] = []
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = be32(at)
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const data = at + 8
    if (data + length + 4 > bytes.length) break
    if (type === 'IHDR') {
      width = be32(data)
      height = be32(data + 4)
      const bitDepth = bytes[data + 8]
      const colorType = bytes[data + 9]
      const interlace = bytes[data + 12]
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) return null
      channels = colorType === 6 ? 4 : 3
    } else if (type === 'IDAT') idat.push(bytes.subarray(data, data + length))
    else if (type === 'IEND') break
    at = data + length + 4
  }
  if (width <= 0 || height <= 0 || !channels || idat.length === 0 || width * height > MAX_DECODE_PIXELS) return null
  const z = new Uint8Array(idat.reduce((n, p) => n + p.length, 0))
  let zo = 0
  for (const p of idat) {
    z.set(p, zo)
    zo += p.length
  }
  const stride = width * channels
  const raw = zlibDecompress(z, height * (stride + 1))
  if (!raw) return null

  const img = blankImage(width, height)
  const line = new Uint8Array(stride)
  const above = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? line[i - channels] : 0
      const b = above[i]
      const c = i >= channels ? above[i - channels] : 0
      const predicted = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : -1
      if (predicted < 0) return null
      line[i] = (src[i] + predicted) & 255
    }
    above.set(line)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      img.data[o] = line[x * channels]
      img.data[o + 1] = line[x * channels + 1]
      img.data[o + 2] = line[x * channels + 2]
      img.data[o + 3] = channels === 4 ? line[x * channels + 3] : 255
    }
  }
  return img
}
