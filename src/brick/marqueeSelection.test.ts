import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  beginMarqueeGesture,
  finishMarqueeGesture,
  projectBrickScreenBounds,
  screenRectsIntersect,
  selectBricksInMarquee,
  shouldCaptureSelectionGesture,
  updateMarqueeGesture,
} from './marqueeSelection'
import type { BrickInstance } from './types'

const bricks: BrickInstance[] = [
  { id: 'center', partId: 'brick_2x4', x: 30, y: 0, z: 30, rotation: 1, color: '#fff' },
  { id: 'right', partId: 'door_1x4', x: 42, y: 0, z: 30, rotation: 3, color: '#e7473c' },
]

function cameraAt(x: number, y: number, z: number) {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 240)
  camera.position.set(x, y, z)
  camera.lookAt(0, 0, 0)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

describe('marquee geometry', () => {
  it('uses a drag threshold and explicitly guards the trailing click', () => {
    const gesture = beginMarqueeGesture({ x: 100, y: 100 })
    updateMarqueeGesture(gesture, { x: 103, y: 104 })
    expect(finishMarqueeGesture(gesture).suppressTrailingClick).toBe(false)

    updateMarqueeGesture(gesture, { x: 108, y: 106 })
    const finished = finishMarqueeGesture(gesture)
    expect(finished.suppressTrailingClick).toBe(true)
    expect(finished.rectangle).toEqual({ left: 100, top: 100, right: 108, bottom: 106 })
  })

  it('captures marquee gestures only in Select mode so every ordinary drag stays camera', () => {
    expect(shouldCaptureSelectionGesture({ mode: 'build', button: 0, pointerType: 'mouse', selectionMode: false })).toBe(false)
    expect(shouldCaptureSelectionGesture({ mode: 'build', button: 0, pointerType: 'mouse', selectionMode: true })).toBe(true)
    expect(shouldCaptureSelectionGesture({ mode: 'build', button: 0, pointerType: 'touch', selectionMode: false })).toBe(false)
    expect(shouldCaptureSelectionGesture({ mode: 'build', button: 0, pointerType: 'touch', selectionMode: true })).toBe(true)
    expect(shouldCaptureSelectionGesture({ mode: 'build', button: 2, pointerType: 'mouse', selectionMode: true })).toBe(false)
    expect(shouldCaptureSelectionGesture({ mode: 'explore', button: 0, pointerType: 'mouse', selectionMode: true })).toBe(false)
  })

  it('projects rotated and nonstandard brick bounds at multiple camera orientations', () => {
    const front = cameraAt(12, 10, 15)
    const side = cameraAt(-15, 8, 8)
    const frontBounds = projectBrickScreenBounds(bricks[0], front, 800, 800)
    const sideBounds = projectBrickScreenBounds(bricks[0], side, 800, 800)

    expect(frontBounds).not.toBeNull()
    expect(sideBounds).not.toBeNull()
    expect(frontBounds).not.toEqual(sideBounds)
    expect(screenRectsIntersect(frontBounds!, { left: 300, top: 300, right: 500, bottom: 500 })).toBe(true)
    expect(screenRectsIntersect(frontBounds!, { left: 0, top: 0, right: 20, bottom: 20 })).toBe(false)
  })

  it('selects every projected brick intersecting the marquee in build order', () => {
    const camera = cameraAt(12, 10, 15)
    const centerBounds = projectBrickScreenBounds(bricks[0], camera, 800, 800)!
    const inset = {
      left: centerBounds.left + 1,
      top: centerBounds.top + 1,
      right: centerBounds.right - 1,
      bottom: centerBounds.bottom - 1,
    }

    expect(selectBricksInMarquee(bricks, camera, 800, 800, inset)).toEqual(['center'])
  })
})
