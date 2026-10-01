import { describe, expect, it } from 'vitest'
import { costumeFromImage, encodePng, imageFromRows } from './pixels'

describe('pixels', () => {
  const img = imageFromRows(['..r', '.rr', '...'], { r: '#ff0000' })

  it('builds a costume with mask, opaque bounds and centered rotation', () => {
    const c = costumeFromImage('c', img)
    expect([c.width, c.height, c.rotationCenterX, c.rotationCenterY]).toEqual([3, 3, 1.5, 1.5])
    expect(Array.from(c.mask!.data)).toEqual([0, 0, 1, 0, 1, 1, 0, 0, 0])
    expect(c.opaque).toEqual({ left: 1, top: 0, right: 3, bottom: 2 })
    expect(c.asset!.startsWith('data:image/png;base64,')).toBe(true)
  })

  it('encodes a PNG whose stored rows hold the raw pixels', () => {
    const png = encodePng(img)
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    // Deflate blocks are stored uncompressed, so row 0 appears verbatim: filter byte, two clear pixels, red.
    const row0 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 255]
    const hay = Array.from(png).join(',')
    expect(hay.includes(row0.join(','))).toBe(true)
  })
})
