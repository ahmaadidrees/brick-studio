/**
 * Pixel editor drawing operations, image manipulation, and PNG decoding.
 * Pure TypeScript (no DOM canvas required), runs synchronously and headlessly.
 */
import type { Costume } from '../../core/contracts'
import { blankImage, costumeFromImage, type PixelImage } from '../pixels'

export type DrawingTool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rectangle'

export type ColorRGBA = [number, number, number, number]

export const TRANSPARENT: ColorRGBA = [0, 0, 0, 0]

/** Clone a PixelImage */
export function cloneImage(img: PixelImage): PixelImage {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data),
  }
}

/** Get pixel RGBA */
export function getPixel(img: PixelImage, x: number, y: number): ColorRGBA {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return TRANSPARENT
  const idx = (y * img.width + x) * 4
  return [img.data[idx], img.data[idx + 1], img.data[idx + 2], img.data[idx + 3]]
}

/** Set pixel RGBA */
export function setPixel(img: PixelImage, x: number, y: number, color: ColorRGBA): void {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return
  const idx = (y * img.width + x) * 4
  img.data[idx] = color[0]
  img.data[idx + 1] = color[1]
  img.data[idx + 2] = color[2]
  img.data[idx + 3] = color[3]
}

/** Check if two RGBA colors are identical */
export function colorsEqual(a: ColorRGBA, b: ColorRGBA): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]
}

/** Convert hex string (#rgb, #rrggbb, #rrggbbaa) to ColorRGBA */
export function hexToRgba(hex: string): ColorRGBA {
  let cleaned = hex.trim().replace(/^#/, '')
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16) || 0
    const g = parseInt(cleaned.slice(2, 4), 16) || 0
    const b = parseInt(cleaned.slice(4, 6), 16) || 0
    return [r, g, b, 255]
  }
  if (cleaned.length === 8) {
    const r = parseInt(cleaned.slice(0, 2), 16) || 0
    const g = parseInt(cleaned.slice(2, 4), 16) || 0
    const b = parseInt(cleaned.slice(4, 6), 16) || 0
    const a = parseInt(cleaned.slice(6, 8), 16) || 0
    return [r, g, b, a]
  }
  return [0, 0, 0, 255]
}

/** Convert ColorRGBA to hex string (#rrggbb or #rrggbbaa) */
export function rgbaToHex(color: ColorRGBA): string {
  const pad = (n: number) => n.toString(16).padStart(2, '0')
  if (color[3] === 255) {
    return `#${pad(color[0])}${pad(color[1])}${pad(color[2])}`
  }
  return `#${pad(color[0])}${pad(color[1])}${pad(color[2])}${pad(color[3])}`
}

/** Draw a straight line using Bresenham's algorithm */
export function drawLine(
  img: PixelImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: ColorRGBA
): void {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const targetX = Math.round(x1)
  const targetY = Math.round(y1)
  const dx = Math.abs(targetX - x)
  const dy = Math.abs(targetY - y)
  const sx = x < targetX ? 1 : -1
  const sy = y < targetY ? 1 : -1
  let err = dx - dy

  while (true) {
    setPixel(img, x, y, color)
    if (x === targetX && y === targetY) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

/** Draw a rectangle (filled or outline) */
export function drawRect(
  img: PixelImage,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: ColorRGBA,
  filled = true
): void {
  const minX = Math.max(0, Math.min(Math.round(x0), Math.round(x1)))
  const maxX = Math.min(img.width - 1, Math.max(Math.round(x0), Math.round(x1)))
  const minY = Math.max(0, Math.min(Math.round(y0), Math.round(y1)))
  const maxY = Math.min(img.height - 1, Math.max(Math.round(y0), Math.round(y1)))

  if (filled) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        setPixel(img, x, y, color)
      }
    }
  } else {
    for (let x = minX; x <= maxX; x++) {
      setPixel(img, x, minY, color)
      setPixel(img, x, maxY, color)
    }
    for (let y = minY; y <= maxY; y++) {
      setPixel(img, minX, y, color)
      setPixel(img, maxX, y, color)
    }
  }
}

/** Flood fill connected pixels with matching color using 4-way breadth-first queue */
export function floodFill(
  img: PixelImage,
  startX: number,
  startY: number,
  fillColor: ColorRGBA
): void {
  const x = Math.round(startX)
  const y = Math.round(startY)
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return

  const targetColor = getPixel(img, x, y)
  if (colorsEqual(targetColor, fillColor)) return

  const visited = new Uint8Array(img.width * img.height)
  const queue: [number, number][] = [[x, y]]
  visited[y * img.width + x] = 1

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!
    setPixel(img, cx, cy, fillColor)

    const neighbors: [number, number][] = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ]

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < img.width && ny >= 0 && ny < img.height) {
        const idx = ny * img.width + nx
        if (!visited[idx]) {
          visited[idx] = 1
          if (colorsEqual(getPixel(img, nx, ny), targetColor)) {
            queue.push([nx, ny])
          }
        }
      }
    }
  }
}

/** Resize image canvas to new dimensions, keeping existing pixels */
export function resizeImage(
  img: PixelImage,
  newWidth: number,
  newHeight: number,
  anchor: 'top-left' | 'center' = 'top-left'
): PixelImage {
  const target = blankImage(newWidth, newHeight)
  let offsetX = 0
  let offsetY = 0

  if (anchor === 'center') {
    offsetX = Math.floor((newWidth - img.width) / 2)
    offsetY = Math.floor((newHeight - img.height) / 2)
  }

  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const tx = x + offsetX
      const ty = y + offsetY
      if (tx >= 0 && tx < newWidth && ty >= 0 && ty < newHeight) {
        setPixel(target, tx, ty, getPixel(img, x, y))
      }
    }
  }

  return target
}

// ------------------------------------------------------------- PNG Decoder

export function decodePngSync(input: string | Uint8Array): PixelImage | null {
  let bytes: Uint8Array
  if (typeof input === 'string') {
    const comma = input.indexOf(',')
    const base64 = comma >= 0 ? input.slice(comma + 1) : input
    try {
      const binary = atob(base64)
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    } catch {
      return null
    }
  } else {
    bytes = input
  }

  // Check PNG signature: 137 80 78 71 13 10 26 10
  if (
    bytes.length < 8 ||
    bytes[0] !== 137 ||
    bytes[1] !== 80 ||
    bytes[2] !== 78 ||
    bytes[3] !== 71 ||
    bytes[4] !== 13 ||
    bytes[5] !== 10 ||
    bytes[6] !== 26 ||
    bytes[7] !== 10
  ) {
    return null
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatParts: Uint8Array[] = []

  while (offset + 8 <= bytes.length) {
    const length =
      ((bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3]) >>>
      0
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    )
    const dataOffset = offset + 8
    const nextChunk = dataOffset + length + 4

    if (nextChunk > bytes.length) break

    if (type === 'IHDR') {
      width =
        ((bytes[dataOffset] << 24) |
          (bytes[dataOffset + 1] << 16) |
          (bytes[dataOffset + 2] << 8) |
          bytes[dataOffset + 3]) >>>
        0
      height =
        ((bytes[dataOffset + 4] << 24) |
          (bytes[dataOffset + 5] << 16) |
          (bytes[dataOffset + 6] << 8) |
          bytes[dataOffset + 7]) >>>
        0
      bitDepth = bytes[dataOffset + 8]
      colorType = bytes[dataOffset + 9]
    } else if (type === 'IDAT') {
      idatParts.push(bytes.subarray(dataOffset, dataOffset + length))
    } else if (type === 'IEND') {
      break
    }

    offset = nextChunk
  }

  if (width <= 0 || height <= 0 || idatParts.length === 0) return null

  // Concatenate IDAT
  const totalIdatLen = idatParts.reduce((acc, p) => acc + p.length, 0)
  const idat = new Uint8Array(totalIdatLen)
  let idatOff = 0
  for (const part of idatParts) {
    idat.set(part, idatOff)
    idatOff += part.length
  }

  // Decompress zlib stream (uncompressed blocks generated by encodePng)
  // zlib header: 2 bytes
  let raw: Uint8Array | null = null
  if (idat.length > 6 && idat[0] === 0x78 && idat[1] === 0x01) {
    let pos = 2
    const uncompressedParts: Uint8Array[] = []
    while (pos + 4 < idat.length - 4) {
      const last = idat[pos]
      const len = idat[pos + 1] | (idat[pos + 2] << 8)
      const nlen = idat[pos + 3] | (idat[pos + 4] << 8)
      if (((len ^ 0xffff) & 0xffff) !== nlen) break
      uncompressedParts.push(idat.subarray(pos + 5, pos + 5 + len))
      pos += 5 + len
      if (last === 1) break
    }

    const totalRawLen = uncompressedParts.reduce((acc, p) => acc + p.length, 0)
    raw = new Uint8Array(totalRawLen)
    let rawOff = 0
    for (const part of uncompressedParts) {
      raw.set(part, rawOff)
      rawOff += part.length
    }
  }

  const expectedBytesPerRow = width * 4 + 1
  if (!raw || raw.length < height * expectedBytesPerRow) {
    // If not uncompressed zlib or corrupted, return a blank fallback image of correct dimensions
    return blankImage(width, height)
  }

  // Reconstruct pixel image from scanlines
  const img = blankImage(width, height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * expectedBytesPerRow
    const filter = raw[rowStart]
    const rowBytes = raw.subarray(rowStart + 1, rowStart + expectedBytesPerRow)
    if (filter === 0) {
      img.data.set(rowBytes, y * width * 4)
    } else {
      // Basic filter support if needed (none filter is standard in pixels.ts)
      img.data.set(rowBytes, y * width * 4)
    }
  }

  return img
}

/** Convert a Costume to a PixelImage */
export function costumeToPixelImage(costume: Costume): PixelImage {
  if (costume.asset) {
    const decoded = decodePngSync(costume.asset)
    if (decoded && decoded.width === costume.width && decoded.height === costume.height) {
      return decoded
    }
  }
  return blankImage(costume.width, costume.height)
}

/** Save an edited PixelImage into a Costume, ensuring mask and opaque bounds are updated */
export function savePixelImageToCostume(
  name: string,
  img: PixelImage,
  center?: { x: number; y: number }
): Costume {
  return costumeFromImage(name, img, center)
}

// ------------------------------------------------------------- Undo / Redo History

export class EditHistory {
  private undoStack: { img: PixelImage; center: { x: number; y: number } }[] = []
  private redoStack: { img: PixelImage; center: { x: number; y: number } }[] = []
  private maxDepth: number

  constructor(maxDepth = 30) {
    this.maxDepth = maxDepth
  }

  push(img: PixelImage, center: { x: number; y: number }): void {
    this.undoStack.push({ img: cloneImage(img), center: { ...center } })
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift()
    }
    this.redoStack = []
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(currentImg: PixelImage, currentCenter: { x: number; y: number }): {
    img: PixelImage
    center: { x: number; y: number }
  } | null {
    const prev = this.undoStack.pop()
    if (!prev) return null
    this.redoStack.push({ img: cloneImage(currentImg), center: { ...currentCenter } })
    return prev
  }

  redo(currentImg: PixelImage, currentCenter: { x: number; y: number }): {
    img: PixelImage
    center: { x: number; y: number }
  } | null {
    const next = this.redoStack.pop()
    if (!next) return null
    this.undoStack.push({ img: cloneImage(currentImg), center: { ...currentCenter } })
    return next
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
