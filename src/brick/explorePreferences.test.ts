import { describe, expect, it } from 'vitest'
import { EXPLORE_PREFERENCES_KEY, followCameraYaw, readExploreKeys, readExplorePreferences, saveExplorePreferences, type ExploreKeyboardMode } from './explorePreferences'

describe('Explore camera controls', () => {
  it.each(['standard', 'arrow-camera', 'wasd-camera'] as ExploreKeyboardMode[])('assigns every movement key to only one action in %s', (mode) => {
    for (const key of ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']) {
      const keys = new Set([key])
      const move = readExploreKeys(keys, mode, false, { x: 0, z: 0 })
      const look = readExploreKeys(keys, mode, true, { x: 0, z: 0 })
      expect(Number(Math.hypot(move.x, move.z) > 0) + Number(Math.hypot(look.x, look.z) > 0)).toBe(1)
    }
  })
  it('maps arrows to camera and WASD to movement explicitly', () => {
    expect(readExploreKeys(new Set(['arrowup']), 'arrow-camera', true, { x: 0, z: 0 })).toEqual({ x: 0, z: 1 })
    expect(readExploreKeys(new Set(['w']), 'arrow-camera', false, { x: 0, z: 0 })).toEqual({ x: 0, z: 1 })
    expect(readExploreKeys(new Set(['d']), 'wasd-camera', true, { x: 0, z: 0 })).toEqual({ x: 1, z: 0 })
  })
  it('gently follows and pauses for manual control or free look', () => {
    const result = followCameraYaw(0, 1, 1 / 60, 2, 'follow', 3000)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThan(0.1)
    expect(followCameraYaw(0, 1, 1 / 60, 2, 'follow', 100)).toBe(0)
    expect(followCameraYaw(0, 1, 1 / 60, 2, 'free-look', 3000)).toBe(0)
  })
  it('does not create a perpetual camera-relative turn while strafing or backing up', () => {
    for (const steering of [{ x: 1, z: 0 }, { x: -1, z: 1 }, { x: 0, z: -1 }]) {
      let yaw = 0.4
      for (let frame = 0; frame < 600; frame++) yaw = followCameraYaw(yaw, yaw + Math.PI / 2, 1 / 60, 4, 'follow', 5000, steering)
      expect(yaw).toBe(0.4)
    }
  })
  it('persists only local preferences and safely defaults malformed storage', () => {
    saveExplorePreferences({ exploreCameraMode: 'free-look', exploreKeyboardMode: 'wasd-camera' })
    expect(readExplorePreferences()).toEqual({ exploreCameraMode: 'free-look', exploreKeyboardMode: 'wasd-camera' })
    localStorage.setItem(EXPLORE_PREFERENCES_KEY, '{broken')
    expect(readExplorePreferences()).toEqual({ exploreCameraMode: 'follow', exploreKeyboardMode: 'standard' })
    localStorage.removeItem(EXPLORE_PREFERENCES_KEY)
  })
})
