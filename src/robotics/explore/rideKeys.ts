import { exploreKeyboardBlocked } from '../../brick/explorePreferences'
import { useBrickStore } from '../../brick/store'
import { rideProgramKey } from './rideModel'
import { useExploreRideStore } from './rideStore'

/**
 * The keyboard while riding (checkpoint 4). Installed in the capture phase on the window,
 * so it sees a key before the Explore character's own (bubble-phase) handler:
 *
 * - `E` rides what the character is near, or hops off; nothing else in Explore uses E.
 * - While riding, the Explore movement keys (WASD / arrows per the keyboard setting) and
 *   Space go to the program's input and never reach the character or the studio; Escape
 *   hops off instead of leaving Explore.
 * - Key-ups always pass through, so nothing the character held stays stuck after a ride.
 * - Typing in a field, an open dialog or a lost WebGL context leave every key alone, the
 *   same rule the character follows (`exploreKeyboardBlocked`).
 */
export type RideKeyRoute = 'pass' | 'ride-toggle' | 'program' | 'hop-off' | 'swallow'

export function routeRideKeyDown(event: Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'metaKey' | 'ctrlKey' | 'altKey' | 'target' | 'defaultPrevented'>): RideKeyRoute {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return 'pass'
  const ride = useExploreRideStore.getState()
  if (!ride.active) return 'pass'
  const brick = useBrickStore.getState()
  if (brick.graphicsPaused || exploreKeyboardBlocked(event.target)) return 'pass'
  if (event.key.toLowerCase() === 'e') return event.repeat ? (ride.phase === 'walking' ? 'pass' : 'swallow') : 'ride-toggle'
  if (ride.phase === 'walking') return 'pass'
  if (event.key === 'Escape') return ride.phase === 'riding' ? 'hop-off' : 'swallow'
  if (!rideProgramKey(event, brick.exploreKeyboardMode)) return 'pass'
  return ride.phase === 'riding' ? 'program' : 'swallow'
}

export function installRideKeys(target: Window = window): () => void {
  const down = (event: KeyboardEvent) => {
    const route = routeRideKeyDown(event)
    if (route === 'pass') return
    const ride = useExploreRideStore.getState()
    if (route === 'ride-toggle' && !ride.pressRideKey()) return
    event.preventDefault()
    event.stopPropagation()
    if (route === 'hop-off') ride.hopOff()
    else if (route === 'program') {
      const key = rideProgramKey(event, useBrickStore.getState().exploreKeyboardMode)
      if (key) ride.setRideKey(key, true)
    }
  }
  const up = (event: KeyboardEvent) => {
    const key = rideProgramKey(event, useBrickStore.getState().exploreKeyboardMode)
    if (key) useExploreRideStore.getState().setRideKey(key, false)
  }
  const release = () => useExploreRideStore.getState().releaseRideKeys()
  const visibility = () => { if (target.document.visibilityState !== 'visible') release() }
  target.addEventListener('keydown', down, true)
  target.addEventListener('keyup', up, true)
  target.addEventListener('blur', release)
  target.document.addEventListener('visibilitychange', visibility)
  return () => {
    target.removeEventListener('keydown', down, true)
    target.removeEventListener('keyup', up, true)
    target.removeEventListener('blur', release)
    target.document.removeEventListener('visibilitychange', visibility)
    release()
  }
}
