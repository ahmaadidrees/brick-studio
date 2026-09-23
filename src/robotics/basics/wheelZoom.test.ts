import { describe, expect, it } from 'vitest'
import { MAX_EVENT_PIXELS, installWheelZoom, notchesFor, orbitZoomSpeedFor, wheelPixels, wheelZoomFactor } from './wheelZoom'

describe('the wheel zooms by how far it turned', () => {
  it('four mouse notches double the distance; a notch in is the inverse of a notch out', () => {
    expect(notchesFor(2)).toBeCloseTo(4, 6)
    expect(wheelZoomFactor({ deltaY: 100 }) ** 4).toBeCloseTo(2, 6)
    expect(wheelZoomFactor({ deltaY: -100 }) * wheelZoomFactor({ deltaY: 100 })).toBeCloseTo(1, 9)
    // The studio's fixed 5 % step needed about 14 notches for the same.
    expect(Math.log(2) / Math.log(1 / 0.95)).toBeGreaterThan(13)
  })

  it('lines, pages and one huge event are measured sensibly', () => {
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 })).toBeCloseTo(100, 6)
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 })).toBe(MAX_EVENT_PIXELS)
    expect(wheelPixels({ deltaY: -1500 })).toBe(-MAX_EVENT_PIXELS)
    expect(wheelZoomFactor({ deltaY: 1500 })).toBeLessThan(1.6)
  })

  it('a trackpad swipe of many small events adds up the same way; a pinch is quicker per pixel', () => {
    let swipe = 1
    for (let index = 0; index < 40; index += 1) swipe *= wheelZoomFactor({ deltaY: 10 })
    expect(swipe).toBeCloseTo(2, 6)
    expect(wheelZoomFactor({ deltaY: 10, ctrlKey: true })).toBeGreaterThan(wheelZoomFactor({ deltaY: 10 }))
  })

  it('maps onto OrbitControls\' 0.95 ** zoomSpeed step', () => {
    for (const deltaY of [4, 100, -120, 250]) {
      const step = 0.95 ** orbitZoomSpeedFor({ deltaY })
      const factor = wheelZoomFactor({ deltaY })
      expect(deltaY > 0 ? 1 / step : step).toBeCloseTo(factor, 9)
    }
  })

  it('sets zoomSpeed for one wheel event, before the controls see it, and puts it back after', () => {
    const wrapper = document.createElement('div')
    const canvas = document.createElement('canvas')
    wrapper.appendChild(canvas)
    document.body.appendChild(wrapper)
    const controls = { zoomSpeed: 1, enabled: true }
    const seen: number[] = []
    // OrbitControls listens on the canvas's wrapper, in the bubble phase.
    wrapper.addEventListener('wheel', () => seen.push(controls.zoomSpeed))
    const uninstall = installWheelZoom(canvas, () => controls)
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))
    expect(seen[0]).toBeCloseTo(orbitZoomSpeedFor({ deltaY: 100 }), 9)
    expect(controls.zoomSpeed).toBe(1)
    uninstall()
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))
    expect(seen[1]).toBe(1)
    wrapper.remove()
  })
})
