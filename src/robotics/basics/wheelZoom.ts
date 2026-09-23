/**
 * Kid basics (Robot Workshop prototype only): a zoom speed that follows the wheel.
 *
 * The build camera's OrbitControls moves a fixed 5 % per wheel event, whatever the event's size.
 * A mouse sends one event per notch, so zooming out to twice the distance took about 14 notches
 * ("scrolling the wheel barely zoomed out"); a trackpad sends dozens of tiny events per swipe, so
 * the same 5 % each made it jumpy. Here the zoom follows how far the wheel actually turned:
 *
 *   factor = exp(k * pixels)      (pixels: deltaY in CSS pixels; lines count 100/3 px, pages 800 px)
 *
 * with k chosen so four standard 100 px notches double the distance (2^(1/4) ≈ 1.19 per notch),
 * a trackpad pinch (ctrl + wheel, a few pixels per event) using a faster k, and any single event
 * capped at 250 px (a fast spin or a synthetic 1500 px event moves ~1.5×, never a jump across the
 * world). OrbitControls still does the zooming (toward the cursor, clamped to its limits): only
 * its zoomSpeed is set for the one event, then restored, so touch pinch is untouched.
 */
export const NOTCH_PIXELS = 100
export const NOTCHES_TO_DOUBLE = 4
export const WHEEL_ZOOM_PER_PIXEL = Math.LN2 / (NOTCHES_TO_DOUBLE * NOTCH_PIXELS)
export const PINCH_ZOOM_PER_PIXEL = 0.01
export const MAX_EVENT_PIXELS = 250
const LINE_PIXELS = 100 / 3
const PAGE_PIXELS = 800
/** OrbitControls' getZoomScale() is 0.95 ** zoomSpeed. */
const ORBIT_STEP = Math.log(1 / 0.95)

export type WheelLike = { deltaY: number; deltaMode?: number; ctrlKey?: boolean }

export function wheelPixels(event: WheelLike): number {
  const unit = event.deltaMode === 1 ? LINE_PIXELS : event.deltaMode === 2 ? PAGE_PIXELS : 1
  const pixels = event.deltaY * unit
  return Math.max(-MAX_EVENT_PIXELS, Math.min(MAX_EVENT_PIXELS, pixels))
}

/** How much one event scales the camera distance (> 1 zooms out, < 1 zooms in, 1 for no movement). */
export function wheelZoomFactor(event: WheelLike): number {
  const perPixel = event.ctrlKey ? PINCH_ZOOM_PER_PIXEL : WHEEL_ZOOM_PER_PIXEL
  return Math.exp(perPixel * wheelPixels(event))
}

/** The OrbitControls zoomSpeed that makes its fixed step equal `wheelZoomFactor(event)`. */
export function orbitZoomSpeedFor(event: WheelLike): number {
  return Math.abs(Math.log(wheelZoomFactor(event))) / ORBIT_STEP
}

/** Notches of `pixelsPerNotch` needed to scale the distance by `ratio` (for the harness and tests). */
export function notchesFor(ratio: number, pixelsPerNotch = NOTCH_PIXELS): number {
  return Math.log(ratio) / Math.log(wheelZoomFactor({ deltaY: pixelsPerNotch }))
}

type ZoomControls = { zoomSpeed: number; enabled: boolean }

/**
 * Sets the controls' zoomSpeed for each wheel event before OrbitControls handles it (a capture
 * listener on the canvas runs before OrbitControls' own listener on the canvas's wrapper), and
 * puts the default back once the event has bubbled up to the window, after OrbitControls. A
 * microtask would be too early: the browser runs microtasks between the listeners of one event.
 * Returns the uninstaller.
 */
export function installWheelZoom(canvas: HTMLElement, controls: () => ZoomControls | null): () => void {
  let restore: (() => void) | null = null
  const putBack = () => { restore?.(); restore = null }
  const onWheel = (event: WheelEvent) => {
    putBack()
    const control = controls()
    if (!control || !control.enabled || event.deltaY === 0) return
    const original = control.zoomSpeed
    control.zoomSpeed = orbitZoomSpeedFor(event)
    restore = () => { control.zoomSpeed = original }
    // Belt and braces: an event stopped before it reached the window still gets the default back.
    window.setTimeout(putBack, 0)
  }
  canvas.addEventListener('wheel', onWheel, { capture: true, passive: true })
  window.addEventListener('wheel', putBack, { passive: true })
  return () => {
    putBack()
    canvas.removeEventListener('wheel', onWheel, { capture: true })
    window.removeEventListener('wheel', putBack)
  }
}
