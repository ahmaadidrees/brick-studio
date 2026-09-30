/** Small, JSON-only sprite sheets kept with a brick design. Pixels are row-major RGBA hex. */
export interface CostumeFrame {
  id: string
  name: string
  /** Eight lowercase hex digits per pixel: rrggbbaa. Transparent is 00000000. */
  pixels: string
}

export interface CostumeSet {
  version: 1
  width: number
  height: number
  fps: number
  frames: CostumeFrame[]
}

export const MAX_COSTUME_SIZE = 64
export const MAX_COSTUME_FRAMES = 32
export const TRANSPARENT = '00000000'
const HEX_PIXEL = /^[0-9a-f]{8}$/

export function validCostumeSet(value: unknown): value is CostumeSet {
  if (!value || typeof value !== 'object') return false
  const set = value as Partial<CostumeSet>
  if (set.version !== 1 || !Number.isInteger(set.width) || !Number.isInteger(set.height) ||
      set.width! < 1 || set.height! < 1 || set.width! > MAX_COSTUME_SIZE || set.height! > MAX_COSTUME_SIZE ||
      !Number.isFinite(set.fps) || set.fps! < 1 || set.fps! > 30 ||
      !Array.isArray(set.frames) || set.frames.length < 1 || set.frames.length > MAX_COSTUME_FRAMES) return false
  const ids = new Set<string>()
  return set.frames.every((frame) => {
    if (!frame || typeof frame.id !== 'string' || !frame.id || frame.id.length > 48 || ids.has(frame.id) ||
        typeof frame.name !== 'string' || frame.name.length > 40 ||
        typeof frame.pixels !== 'string' || frame.pixels.length !== set.width! * set.height! * 8 ||
        !/^[0-9a-f]+$/.test(frame.pixels)) return false
    ids.add(frame.id)
    return true
  })
}

/** Reject malformed saved data at the document boundary. */
export function normalizeCostumeSet(value: unknown): CostumeSet | null {
  return validCostumeSet(value) ? value : null
}

export function pixelAt(set: CostumeSet, frame: CostumeFrame, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= set.width || y >= set.height) return TRANSPARENT
  return frame.pixels.slice((y * set.width + x) * 8, (y * set.width + x + 1) * 8)
}

export function paintPixel(set: CostumeSet, frameIndex: number, x: number, y: number, color: string): CostumeSet {
  if (!Number.isInteger(frameIndex) || !Number.isInteger(x) || !Number.isInteger(y) ||
      frameIndex < 0 || frameIndex >= set.frames.length || x < 0 || y < 0 || x >= set.width || y >= set.height || !HEX_PIXEL.test(color)) return set
  const frame = set.frames[frameIndex]
  const at = (y * set.width + x) * 8
  if (frame.pixels.slice(at, at + 8) === color) return set
  const frames = set.frames.slice()
  frames[frameIndex] = { ...frame, pixels: frame.pixels.slice(0, at) + color + frame.pixels.slice(at + 8) }
  return { ...set, frames }
}

export function fillPixels(set: CostumeSet, frameIndex: number, x: number, y: number, color: string): CostumeSet {
  if (!HEX_PIXEL.test(color) || frameIndex < 0 || frameIndex >= set.frames.length || x < 0 || y < 0 || x >= set.width || y >= set.height) return set
  const frame = set.frames[frameIndex]
  const target = pixelAt(set, frame, x, y)
  if (target === color) return set
  const cells = frame.pixels.match(/.{8}/g)!
  const pending = [y * set.width + x]
  while (pending.length) {
    const at = pending.pop()!
    if (cells[at] !== target) continue
    cells[at] = color
    const px = at % set.width
    const py = Math.floor(at / set.width)
    if (px > 0) pending.push(at - 1)
    if (px + 1 < set.width) pending.push(at + 1)
    if (py > 0) pending.push(at - set.width)
    if (py + 1 < set.height) pending.push(at + set.width)
  }
  const frames = set.frames.slice()
  frames[frameIndex] = { ...frame, pixels: cells.join('') }
  return { ...set, frames }
}

export function blankFrame(set: Pick<CostumeSet, 'width' | 'height'>, id: string, name: string): CostumeFrame {
  return { id, name, pixels: TRANSPARENT.repeat(set.width * set.height) }
}

export function imageDataPixels(data: ImageData): string {
  let out = ''
  for (let i = 0; i < data.data.length; i += 4) {
    const alpha = data.data[i + 3]
    out += alpha < 8 ? TRANSPARENT : Array.from(data.data.slice(i, i + 4), (n) => n.toString(16).padStart(2, '0')).join('')
  }
  return out
}
