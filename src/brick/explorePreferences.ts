import { clampPlanarInput, type MutablePlanarVector } from './characterInput'
import { shortestAngleDelta } from './orbitCamera'
export type ExploreCameraMode = 'follow' | 'free-look'
export type ExploreKeyboardMode = 'standard' | 'arrow-camera' | 'wasd-camera'
export const EXPLORE_PREFERENCES_KEY = 'brick-studio-explore-controls-v1'
export function readExplorePreferences(): { exploreCameraMode: ExploreCameraMode; exploreKeyboardMode: ExploreKeyboardMode } {
  try {
    const value = JSON.parse(localStorage.getItem(EXPLORE_PREFERENCES_KEY) ?? '{}')
    return { exploreCameraMode: value.exploreCameraMode === 'free-look' ? 'free-look' : 'follow', exploreKeyboardMode: ['arrow-camera', 'wasd-camera'].includes(value.exploreKeyboardMode) ? value.exploreKeyboardMode : 'standard' }
  } catch { return { exploreCameraMode: 'follow', exploreKeyboardMode: 'standard' } }
}
export function saveExplorePreferences(value: { exploreCameraMode: ExploreCameraMode; exploreKeyboardMode: ExploreKeyboardMode }) {
  try { localStorage.setItem(EXPLORE_PREFERENCES_KEY, JSON.stringify({ exploreCameraMode: value.exploreCameraMode, exploreKeyboardMode: value.exploreKeyboardMode })) } catch { /* Private browsing/storage full: settings remain usable for this visit. */ }
}
export function readExploreKeys(keys: ReadonlySet<string>, mode: ExploreKeyboardMode, camera: boolean, out: MutablePlanarVector) {
  const wasd = camera ? mode === 'wasd-camera' : mode !== 'wasd-camera'
  const arrows = camera ? mode === 'arrow-camera' : mode !== 'arrow-camera'
  return clampPlanarInput(Number((wasd && keys.has('d')) || (arrows && keys.has('arrowright'))) - Number((wasd && keys.has('a')) || (arrows && keys.has('arrowleft'))), Number((wasd && keys.has('w')) || (arrows && keys.has('arrowup'))) - Number((wasd && keys.has('s')) || (arrows && keys.has('arrowdown'))), out)
}
export function getExploreKeyboardHint(mode: ExploreKeyboardMode) {
  return mode === 'arrow-camera' ? 'WASD: Move · Arrows: Camera' : mode === 'wasd-camera' ? 'Arrows: Move · WASD: Camera' : 'WASD / Arrows: Move'
}
export function followCameraYaw(yaw: number, facingYaw: number, delta: number, speed: number, mode: ExploreCameraMode, sinceManualMs: number, steering: Readonly<MutablePlanarVector> = { x: 0, z: 1 }) {
  if (mode !== 'follow' || speed < 0.15 || sinceManualMs < 2500 || Math.abs(steering.x) > 0.05 || steering.z <= 0) return yaw
  return yaw + shortestAngleDelta(yaw, facingYaw) * (1 - Math.exp(-1.5 * Math.max(0, Math.min(0.05, delta))))
}
export function exploreKeyboardBlocked(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, select, button, [contenteditable="true"], [role="dialog"], [role="menu"]') || !!document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')
}
