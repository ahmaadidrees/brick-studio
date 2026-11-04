import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import type { LevelDesign } from '../../core/contracts'
import { KIT_SCREENS } from '../kitScreens'
import { followTargetOf, playFollowWidth, TOP_DOWN_SHORT_SIDE } from '../Stage'
import { CAR_BRICK_ID, createCarBrick } from '../race/carBrick'
import { createBeginnerRace } from '../race/raceTrack'
import { followCamera, followViewWidth, getCameraZoom } from './camera'
import { createStarterProject } from '../starter'

/** The beginner race with the Car remixed into "My Car" under a new id, and the original Car left unplaced in the drawer. */
function remixedCarRace(): LevelDesign {
  const design = createBeginnerRace()
  const original = createCarBrick().brick
  return {
    ...design,
    bricks: [original, ...design.bricks.map((b) => (b.id === CAR_BRICK_ID ? { ...b, id: 'brick_my_car', name: 'My Car', remixOf: CAR_BRICK_ID } : b))],
    copies: design.copies.map((c) => (c.brickId === CAR_BRICK_ID ? { ...c, brickId: 'brick_my_car' } : c)),
  }
}

describe('Play’s camera in a race', () => {
  it('follows the Car', () => {
    const design = createBeginnerRace()
    const runtime = play(design)
    runtime.step()
    const car = followTargetOf(design, runtime.world.targets)
    expect(car?.copyId).toBe('copy_car')
  })

  it('follows a remixed "My Car", even with the original Car still in the drawer', () => {
    const design = remixedCarRace()
    const runtime = play(design)
    runtime.step()
    const car = followTargetOf(design, runtime.world.targets)
    expect(car?.brickId).toBe('brick_my_car')
    // Move the car into the middle of the track: the camera centres on it.
    car!.x = 500
    car!.y = 320
    const viewport = { width: 960, height: 540 }
    const cam = followCamera(runtime.world.bounds, viewport, car!, playFollowWidth(KIT_SCREENS.race, runtime.world.bounds, viewport))
    expect([cam.x, cam.y]).toEqual([500, 320])
  })

  it('sees about the same patch of track on any screen: 240 steps across the shorter side, classic-sized cars', () => {
    const bounds = createBeginnerRace().bounds
    for (const viewport of [{ width: 540, height: 720 }, { width: 1024, height: 700 }, { width: 960, height: 540 }, { width: 375, height: 520 }]) {
      const width = playFollowWidth(KIT_SCREENS.race, bounds, viewport)
      const zoom = getCameraZoom({ x: 0, y: 0, viewWidth: width }, viewport)
      expect(Math.min(viewport.width, viewport.height) / zoom).toBeCloseTo(TOP_DOWN_SHORT_SIDE)
      // The 11-step Car is at least 15 pixels long (at 360 it was 11 on a small phone).
      expect(TOP_DOWN_SHORT_SIDE).toBe(240)
      expect(11 * zoom).toBeGreaterThanOrEqual(15)
    }
  })

  it('keeps the Platformer’s follow width unchanged', () => {
    const bounds = createStarterProject().design.bounds
    for (const viewport of [{ width: 540, height: 720 }, { width: 1024, height: 700 }, { width: 960, height: 540 }]) {
      expect(playFollowWidth(KIT_SCREENS.platformer, bounds, viewport)).toBe(followViewWidth(bounds, viewport))
    }
  })
})
