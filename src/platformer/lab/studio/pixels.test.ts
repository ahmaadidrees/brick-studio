import { describe, expect, it } from 'vitest'
import { costumeFromImage, decodePng, encodePng, imageFromRows } from './pixels'

describe('pixels', () => {
  const img = imageFromRows(['..r', '.rr', '...'], { r: '#ff0000' })

  it('builds a costume with mask, opaque bounds and centered rotation', () => {
    const c = costumeFromImage('c', img)
    expect([c.width, c.height, c.rotationCenterX, c.rotationCenterY]).toEqual([3, 3, 1.5, 1.5])
    expect(Array.from(c.mask!.data)).toEqual([0, 0, 1, 0, 1, 1, 0, 0, 0])
    expect(c.opaque).toEqual({ left: 1, top: 0, right: 3, bottom: 2 })
    expect(c.asset!.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('encodes a compressed PNG that decodes to the same pixels', () => {
    const png = encodePng(img)
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const back = decodePng(png)!
    expect([back.width, back.height]).toEqual([3, 3])
    expect(Array.from(back.data)).toEqual(Array.from(img.data))
  })

  it('squeezes flat pictures and stays deterministic', () => {
    const flat = imageFromRows(Array.from({ length: 64 }, () => 'b'.repeat(64)), { b: '#3355ff' })
    const png = encodePng(flat)
    expect(png.length).toBeLessThan(400)
    expect(Array.from(encodePng(flat))).toEqual(Array.from(png))
  })

  it('refuses damaged pictures instead of guessing', () => {
    const png = encodePng(img)
    expect(decodePng(png.subarray(0, png.length - 20))).toBeNull()
    expect(decodePng('data:image/png;base64,not-a-png')).toBeNull()
  })
})
