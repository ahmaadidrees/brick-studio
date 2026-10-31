/**
 * Touch: a finger that slides up or down the block palette scrolls it. Blockly 13 starts a block drag for any drag that
 * begins on a palette block, so on a tablet trying to scroll Motion dropped "set x to 0" into the Hero's code.
 *
 * With a finger (or pen), a palette drag takes the block out only when it is mostly sideways, or when the finger rested
 * on the block first (a long press). The mouse is unchanged: it has the wheel for scrolling.
 */
import * as Blockly from 'blockly/core'

/** How long a finger rests on a palette block before any drag direction takes the block out. */
export const PALETTE_LONG_PRESS_MS = 400

/** A palette drag scrolls when it is mostly up or down and the finger did not rest first. */
export function paletteDragScrolls(delta: { x: number; y: number }, heldMs: number): boolean {
  return heldMs < PALETTE_LONG_PRESS_MS && Math.abs(delta.y) > Math.abs(delta.x)
}

interface GestureInternals {
  flyout: { isScrollable(): boolean } | null
  currentDragDeltaXY: { x: number; y: number }
  calledUpdateIsDragging: boolean
  updateIsDragging(e: PointerEvent): void
  updateIsDraggingWorkspace(): void
  doStart(e: PointerEvent): void
  __paletteDown?: { at: number; pointerType: string }
}

let installed = false

/** Patch Blockly's gesture once per page. Safe to call on every editor mount. */
export function installTouchPaletteScroll(): void {
  if (installed) return
  const proto = Blockly.Gesture.prototype as unknown as GestureInternals
  const doStart = proto.doStart
  const updateIsDragging = proto.updateIsDragging
  if (typeof doStart !== 'function' || typeof updateIsDragging !== 'function') return
  installed = true
  proto.doStart = function (this: GestureInternals, e: PointerEvent) {
    this.__paletteDown = { at: e.timeStamp, pointerType: e.pointerType }
    return doStart.call(this, e)
  }
  proto.updateIsDragging = function (this: GestureInternals, e: PointerEvent) {
    const down = this.__paletteDown
    if (this.flyout && down && down.pointerType !== 'mouse' && this.flyout.isScrollable()
      && paletteDragScrolls(this.currentDragDeltaXY, e.timeStamp - down.at)) {
      this.calledUpdateIsDragging = true
      this.updateIsDraggingWorkspace()
      return
    }
    return updateIsDragging.call(this, e)
  }
}
