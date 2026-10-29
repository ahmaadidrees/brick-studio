import { describe, expect, it } from 'vitest'
import { DESIGN_LIMITS } from '../../core/project'
import { parse } from '../../core/save'
import { blankImage, costumeFromImage, imageFromRows, type PixelImage } from '../pixels'
import { createStarterProject } from '../starter'
import { exportProjectJson } from '../persist/projectIo'
import { storedPngDataUrl } from './oldPictures.testkit'
import { decodePngSync } from './pixelOps'

/** Every pixel the same colour, then a few kid-style shapes on top: what a painted backdrop looks like. */
function paintedBackdrop(width = 480, height = 360): PixelImage {
  const img = blankImage(width, height)
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * width + x) * 4
    img.data.set([r, g, b, 255], i)
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, 120, 190, 255 - Math.floor(y / 6))
  for (let y = 250; y < height; y++) for (let x = 0; x < width; x++) put(x, y, 70, 160, 80)
  for (let n = 0; n < 40; n++) {
    const cx = (n * 97) % width
    const cy = 40 + ((n * 53) % 180)
    for (let dy = -6; dy <= 6; dy++) for (let dx = -10; dx <= 10; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x >= 0 && x < width && y >= 0 && y < height && dx * dx + dy * dy * 3 < 100) put(x, y, 250, 250, 250)
    }
  }
  return img
}

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.prototype.every.call(a, (v: number, i: number) => v === b[i])

/** Deterministic noise: the hardest picture to squeeze. */
function noise(width: number, height: number, seed = 7): PixelImage {
  const img = blankImage(width, height)
  let s = seed
  for (let i = 0; i < img.data.length; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    img.data[i] = s >>> 24
  }
  return img
}

const withStageCostume = (costume: ReturnType<typeof costumeFromImage>) => {
  const project = createStarterProject()
  return { ...project, design: { ...project.design, stage: { ...project.design.stage, costumes: [costume] } } }
}

describe('pictures stay within the save limits', () => {
  it('a blank backdrop the size of the level view is a small, valid picture', () => {
    const sky = costumeFromImage('Sky', blankImage(480, 360))
    expect(sky.asset!.length).toBeLessThan(20_000)
    expect(parse(exportProjectJson(withStageCostume(sky))).ok).toBe(true)
  })

  it('a painted backdrop fits the picture limit and comes back pixel for pixel', () => {
    const img = paintedBackdrop()
    const sky = costumeFromImage('Sky', img)
    expect(sky.asset!.length).toBeLessThanOrEqual(DESIGN_LIMITS.maxAssetChars)
    expect(parse(exportProjectJson(withStageCostume(sky))).ok).toBe(true)
    const back = decodePngSync(sky.asset!)!
    expect(back.width).toBe(480)
    expect(sameBytes(back.data, img.data)).toBe(true)
  })

  it('a costume with nothing painted on it still saves', () => {
    const project = createStarterProject()
    const blank = costumeFromImage('costume2', blankImage(32, 32))
    project.design.bricks[0] = { ...project.design.bricks[0], costumes: [...project.design.bricks[0].costumes, blank] }
    expect(parse(exportProjectJson(project)).ok).toBe(true)
  })

  it('round-trips every kind of picture through the encoder and decoder', () => {
    const images = [
      blankImage(1, 1),
      imageFromRows(['..r', '.rr', '...'], { r: '#ff0000' }),
      noise(17, 9),
      noise(64, 64, 3),
      paintedBackdrop(100, 70),
      noise(300, 200, 11),
    ]
    for (const img of images) {
      const back = decodePngSync(costumeFromImage('x', img).asset!)!
      expect([back.width, back.height]).toEqual([img.width, img.height])
      expect(sameBytes(back.data, img.data)).toBe(true)
    }
  })

  it('still opens pictures saved before they were compressed', () => {
    const img = paintedBackdrop(40, 30)
    const back = decodePngSync(storedPngDataUrl(img))!
    expect(sameBytes(back.data, img.data)).toBe(true)
  })
})
