import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { STUD } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { fixtureDocument } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import type { RapierModule } from '../sim/colliders'
import { RIDE_CREATION_ID, seatedRoverBricks, seatedRoverSection } from './rideFixtures'
import { installRideKeys, routeRideKeyDown } from './rideKeys'
import { RIDER_STANDING_Y } from './rideModel'
import { advanceRides, liveRide, rideAvatarFrame, resetExploreRideForTests, useExploreRideStore } from './rideStore'

/**
 * Input routing with real DOM key events: the ride listener sits in the capture phase on
 * the window, the Explore character's handler (stood in for here) in the bubble phase,
 * exactly as in the studio. While riding the movement keys reach the program and not the
 * character; after hopping off they reach the character and not the program.
 */
beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
})

const ride = () => useExploreRideStore.getState()
const avatarKeys: string[] = []
const avatarListener = (event: KeyboardEvent) => { if (!event.defaultPrevented) avatarKeys.push(`${event.type}:${event.key}`) }
let removeRideKeys: (() => void) | null = null
const BEHIND_ROVER = { translation: () => ({ x: -0.3, y: RIDER_STANDING_Y, z: (34.5 - 32) * STUD }), handle: 3 }

const press = (key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
  const down = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(down)
  return down
}
const release = (key: string, target: EventTarget = document.body) => target.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }))
const heldByProgram = () => liveRide(RIDE_CREATION_ID)!.controller.snapshot.input.held
const step = (count = 2) => { for (let index = 0; index < count; index += 1) advanceRides(1 / 60, { touchMove: { x: 0, z: 0 }, findPlacement: (points) => ({ x: points[0].x, y: RIDER_STANDING_Y, z: points[0].z }) }) }

beforeEach(() => {
  resetExploreRideForTests()
  expect(useBrickStore.getState().restoreDocument(fixtureDocument(seatedRoverBricks(), seatedRoverSection())).ok).toBe(true)
  useBrickStore.setState({ mode: 'explore', graphicsPaused: false, exploreKeyboardMode: 'standard' })
  avatarKeys.length = 0
  removeRideKeys = installRideKeys(window)
  window.addEventListener('keydown', avatarListener)
  window.addEventListener('keyup', avatarListener)
  ride().enter(RAPIER as unknown as RapierModule)
})
afterEach(() => {
  removeRideKeys?.()
  window.removeEventListener('keydown', avatarListener)
  window.removeEventListener('keyup', avatarListener)
  resetExploreRideForTests()
})

describe('keys while riding', () => {
  it('walking: every key reaches the character; E near a seat rides and is not passed on', () => {
    press('w')
    press('ArrowLeft')
    press('e') // nothing near: E is not the ride layer's
    expect(avatarKeys).toEqual(['keydown:w', 'keydown:ArrowLeft', 'keydown:e'])
    avatarKeys.length = 0
    rideAvatarFrame(BEHIND_ROVER)
    expect(ride().nearestId).toBe(RIDE_CREATION_ID)
    const e = press('e')
    expect(e.defaultPrevented).toBe(true)
    expect(ride().phase).toBe('riding')
    expect(avatarKeys).toEqual([])
  })

  it('riding: WASD, arrows and Space go to the program, never to the character; key-ups pass through', () => {
    rideAvatarFrame(BEHIND_ROVER)
    press('e')
    press('w')
    step()
    expect(heldByProgram().up).toBe(true)
    press('ArrowRight')
    press(' ')
    step()
    expect(heldByProgram()).toMatchObject({ up: true, right: true, space: true })
    expect(liveRide(RIDE_CREATION_ID)!.controller.snapshot.input.joystick).toEqual({ up: 100, right: 100 })
    expect(avatarKeys).toEqual([])
    release('w')
    release('ArrowRight')
    release(' ')
    step()
    expect(heldByProgram()).toMatchObject({ up: false, right: false, space: false })
    // The character still hears key-ups, so nothing it held before the ride stays stuck.
    expect(avatarKeys).toEqual(['keyup:w', 'keyup:ArrowRight', 'keyup: '])
  })

  it('riding: Escape hops off instead of leaving Explore; E hops off too', () => {
    rideAvatarFrame(BEHIND_ROVER)
    press('e')
    const escape = press('Escape')
    expect(escape.defaultPrevented).toBe(true)
    expect(ride().phase).toBe('dismounting')
    expect(avatarKeys).toEqual([])
    step(90)
    expect(ride().phase).toBe('walking')
    rideAvatarFrame(BEHIND_ROVER)
    rideAvatarFrame(BEHIND_ROVER)
    press('e')
    expect(ride().phase).toBe('riding')
    press('e')
    expect(ride().phase).toBe('dismounting')
  })

  it('after hopping off the movement keys are the character’s again, and the program no longer hears them', () => {
    rideAvatarFrame(BEHIND_ROVER)
    press('e')
    press('e')
    step(90)
    expect(ride().phase).toBe('walking')
    avatarKeys.length = 0
    press('w')
    press('ArrowUp')
    step()
    expect(avatarKeys).toEqual(['keydown:w', 'keydown:ArrowUp'])
    expect(heldByProgram().up).toBe(false)
  })

  it('the keyboard setting decides which set drives; typing in a field and a lost WebGL context leave keys alone', () => {
    useBrickStore.setState({ exploreKeyboardMode: 'arrow-camera' })
    rideAvatarFrame(BEHIND_ROVER)
    press('e')
    press('ArrowUp') // the camera set in this mode: not the program's
    press('w')
    step()
    expect(heldByProgram().up).toBe(true)
    expect(avatarKeys).toEqual(['keydown:ArrowUp'])
    release('w')

    const field = document.createElement('input')
    document.body.appendChild(field)
    avatarKeys.length = 0
    press('w', field)
    step()
    expect(heldByProgram().up).toBe(false)
    expect(avatarKeys).toEqual(['keydown:w'])
    field.remove()

    useBrickStore.setState({ graphicsPaused: true })
    expect(routeRideKeyDown(new KeyboardEvent('keydown', { key: 'w' }))).toBe('pass')
    useBrickStore.setState({ graphicsPaused: false })
    expect(routeRideKeyDown(new KeyboardEvent('keydown', { key: 'w', metaKey: true }))).toBe('pass')
  })

  it('a lost window releases everything the program held', () => {
    rideAvatarFrame(BEHIND_ROVER)
    press('e')
    press('w')
    step()
    expect(heldByProgram().up).toBe(true)
    window.dispatchEvent(new Event('blur'))
    step()
    expect(heldByProgram().up).toBe(false)
  })
})
