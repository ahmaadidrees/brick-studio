import { describe, expect, it } from 'vitest'
import { blankImage, costumeFromImage, imageFromRows } from '../pixels'
import {
  cloneImage,
  colorsEqual,
  costumeToPixelImage,
  decodePngSync,
  drawLine,
  drawRect,
  EditHistory,
  floodFill,
  getPixel,
  hexToRgba,
  resizeImage,
  rgbaToHex,
  savePixelImageToCostume,
  setPixel,
  TRANSPARENT,
} from './pixelOps'

describe('pixelOps', () => {
  it('clones, gets and sets pixels accurately', () => {
    const img = blankImage(4, 4)
    expect(getPixel(img, 1, 1)).toEqual(TRANSPARENT)

    const red: [number, number, number, number] = [255, 0, 0, 255]
    setPixel(img, 1, 1, red)
    expect(getPixel(img, 1, 1)).toEqual(red)

    const cloned = cloneImage(img)
    expect(getPixel(cloned, 1, 1)).toEqual(red)
    setPixel(cloned, 1, 1, [0, 255, 0, 255])
    // Original unchanged
    expect(getPixel(img, 1, 1)).toEqual(red)
  })

  it('converts hex and rgba colors correctly', () => {
    expect(hexToRgba('#ff0000')).toEqual([255, 0, 0, 255])
    expect(hexToRgba('#00ff0080')).toEqual([0, 255, 0, 128])
    expect(hexToRgba('#123')).toEqual([17, 34, 51, 255])
    expect(rgbaToHex([255, 0, 0, 255])).toBe('#ff0000')
    expect(rgbaToHex([0, 255, 0, 128])).toBe('#00ff0080')
    expect(colorsEqual([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true)
    expect(colorsEqual([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false)
  })

  it('draws straight lines with Bresenham algorithm', () => {
    const img = blankImage(5, 5)
    const blue: [number, number, number, number] = [0, 0, 255, 255]
    drawLine(img, 0, 0, 4, 0, blue) // Horizontal line
    for (let x = 0; x < 5; x++) {
      expect(getPixel(img, x, 0)).toEqual(blue)
    }

    drawLine(img, 0, 0, 4, 4, blue) // Diagonal line
    for (let i = 0; i < 5; i++) {
      expect(getPixel(img, i, i)).toEqual(blue)
    }
  })

  it('draws filled and outline rectangles', () => {
    const imgFilled = blankImage(6, 6)
    const green: [number, number, number, number] = [0, 255, 0, 255]
    drawRect(imgFilled, 1, 1, 3, 3, green, true)
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(getPixel(imgFilled, x, y)).toEqual(green)
      }
    }
    expect(getPixel(imgFilled, 0, 0)).toEqual(TRANSPARENT)

    const imgOutline = blankImage(6, 6)
    drawRect(imgOutline, 1, 1, 3, 3, green, false)
    expect(getPixel(imgOutline, 1, 1)).toEqual(green)
    expect(getPixel(imgOutline, 2, 1)).toEqual(green)
    expect(getPixel(imgOutline, 2, 2)).toEqual(TRANSPARENT) // interior is hollow
  })

  it('performs flood fill correctly', () => {
    const img = blankImage(5, 5)
    const red: [number, number, number, number] = [255, 0, 0, 255]
    const yellow: [number, number, number, number] = [255, 255, 0, 255]

    // Create a 3x3 box
    drawRect(img, 1, 1, 3, 3, red, false)
    // Fill the interior (2, 2)
    floodFill(img, 2, 2, yellow)
    expect(getPixel(img, 2, 2)).toEqual(yellow)
    expect(getPixel(img, 1, 1)).toEqual(red) // border remains red
    expect(getPixel(img, 0, 0)).toEqual(TRANSPARENT) // outside remains transparent
  })

  it('resizes image while preserving pixel content', () => {
    const img = blankImage(4, 4)
    const red: [number, number, number, number] = [255, 0, 0, 255]
    setPixel(img, 1, 1, red)

    const resized = resizeImage(img, 8, 8, 'top-left')
    expect(resized.width).toBe(8)
    expect(resized.height).toBe(8)
    expect(getPixel(resized, 1, 1)).toEqual(red)
    expect(getPixel(resized, 5, 5)).toEqual(TRANSPARENT)
  })

  it('decodes PNG data URLs synchronously and matches original pixels', () => {
    const source = imageFromRows(
      [
        '..rr..',
        '.rrrr.',
        'rrrrrr',
        '..gg..',
      ],
      { r: '#ff0000', g: '#00ff00' }
    )
    const costume = costumeFromImage('test', source)
    const decoded = decodePngSync(costume.asset!)
    expect(decoded).not.toBeNull()
    expect(decoded!.width).toBe(source.width)
    expect(decoded!.height).toBe(source.height)
    expect(Array.from(decoded!.data)).toEqual(Array.from(source.data))

    const loaded = costumeToPixelImage(costume)
    expect(Array.from(loaded.data)).toEqual(Array.from(source.data))
  })

  it('keeps mask and opaque bounds in sync on costume edits', () => {
    const img = blankImage(8, 8)
    // Completely transparent image
    const emptyCostume = savePixelImageToCostume('blank', img)
    expect(emptyCostume.opaque).toEqual({ left: 0, top: 0, right: 0, bottom: 0 })
    expect(emptyCostume.mask!.data.every((v) => v === 0)).toBe(true)

    // Paint a 2x2 square at (2, 3) to (3, 4)
    const red: [number, number, number, number] = [255, 0, 0, 255]
    drawRect(img, 2, 3, 3, 4, red, true)

    const editedCostume = savePixelImageToCostume('square', img, { x: 4, y: 4 })
    expect(editedCostume.rotationCenterX).toBe(4)
    expect(editedCostume.rotationCenterY).toBe(4)
    expect(editedCostume.opaque).toEqual({ left: 2, top: 3, right: 4, bottom: 5 })

    // Check mask matches alpha > 0
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const isSet = x >= 2 && x <= 3 && y >= 3 && y <= 4
        expect(editedCostume.mask!.data[y * 8 + x]).toBe(isSet ? 1 : 0)
      }
    }
  })

  it('supports undo and redo history', () => {
    const history = new EditHistory(10)
    const img0 = blankImage(4, 4)
    const center0 = { x: 2, y: 2 }

    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(false)

    // Save initial state
    history.push(img0, center0)

    // Action 1: set pixel
    const img1 = cloneImage(img0)
    setPixel(img1, 0, 0, [255, 0, 0, 255])
    history.push(img1, center0)

    // Action 2: set another pixel
    const img2 = cloneImage(img1)
    setPixel(img2, 1, 1, [0, 255, 0, 255])

    expect(history.canUndo()).toBe(true)

    // Undo action 2
    const undone = history.undo(img2, center0)
    expect(undone).not.toBeNull()
    expect(getPixel(undone!.img, 1, 1)).toEqual(TRANSPARENT)
    expect(getPixel(undone!.img, 0, 0)).toEqual([255, 0, 0, 255])
    expect(history.canRedo()).toBe(true)

    // Redo action 2
    const redone = history.redo(undone!.img, center0)
    expect(redone).not.toBeNull()
    expect(getPixel(redone!.img, 1, 1)).toEqual([0, 255, 0, 255])
    expect(history.canRedo()).toBe(false)

    // New action clears redo
    history.push(redone!.img, center0)
    expect(history.canRedo()).toBe(false)
  })
})
