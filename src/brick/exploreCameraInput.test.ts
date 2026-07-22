import { describe, expect, it } from 'vitest'
import {
  beginExploreCameraPointer,
  cancelExploreCameraGesture,
  createExploreCameraGesture,
  endExploreCameraPointer,
  normalizeWheelZoom,
  updateExploreCameraPointer,
  zoomFromPinch,
} from './exploreCameraInput'
import { ORBIT_MAX_DISTANCE, ORBIT_MIN_DISTANCE } from './orbitCamera'

describe('Explore camera gesture input', () => {
  it('uses a look threshold and emits stable yaw/pitch deltas', () => {
    const gesture = createExploreCameraGesture()
    expect(beginExploreCameraPointer(gesture, 1, 100, 100, 6.1)).toBe(true)
    expect(updateExploreCameraPointer(gesture, 1, 102, 101)).toEqual({ yawDelta: 0, pitchDelta: 0, zoom: null })
    expect(updateExploreCameraPointer(gesture, 1, 110, 90)).toEqual({ yawDelta: -0.12, pitchDelta: 0.09, zoom: null })
  })

  it('converts pinch distance to the shared zoom and clamps both limits', () => {
    expect(zoomFromPinch(6, 100, 200)).toBe(ORBIT_MIN_DISTANCE)
    expect(zoomFromPinch(6, 100, 25)).toBe(ORBIT_MAX_DISTANCE)

    const gesture = createExploreCameraGesture()
    beginExploreCameraPointer(gesture, 1, 100, 100, 6)
    beginExploreCameraPointer(gesture, 2, 200, 100, 6)
    const update = updateExploreCameraPointer(gesture, 2, 250, 100)
    expect(update.zoom).toBe(ORBIT_MIN_DISTANCE + 0.6)
    expect(update.yawDelta).toBe(0)
  })

  it('rebases after a pinch and cancels without leaving live pointers', () => {
    const gesture = createExploreCameraGesture()
    beginExploreCameraPointer(gesture, 1, 50, 50, 6.1)
    beginExploreCameraPointer(gesture, 2, 100, 50, 6.1)
    endExploreCameraPointer(gesture, 2)
    expect(updateExploreCameraPointer(gesture, 1, 52, 52)).toEqual({ yawDelta: 0, pitchDelta: 0, zoom: null })
    cancelExploreCameraGesture(gesture)
    expect(gesture.pointers.size).toBe(0)
    expect(updateExploreCameraPointer(gesture, 1, 100, 100)).toEqual({ yawDelta: 0, pitchDelta: 0, zoom: null })
  })

  it('normalizes pixel, line, and page wheel deltas to a guarded range', () => {
    expect(normalizeWheelZoom(120, 0)).toBeCloseTo(0.96)
    expect(normalizeWheelZoom(3, 1)).toBeCloseTo(0.384)
    expect(normalizeWheelZoom(1, 2)).toBe(1.2)
    expect(normalizeWheelZoom(-10000, 0)).toBe(-1.2)
  })
})
