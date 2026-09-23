import { TILE } from '@brick-studio/platformer-core/engine/constants'

/**
 * A side-scroller camera. Horizontally it leads in the direction you are running and never lets
 * you get too close to an edge. Vertically it settles on the ground you last landed on, and only
 * chases you in the air when you leave a comfortable middle band (platform snapping).
 */
export class Camera {
  x = 0
  y = 0
  private look = 0
  private snapped = false

  /** How much of the bottom of the view is covered (touch buttons, the build bar), in pixels. */
  bottomPad = 0
  /** How much of the left of the view is covered (the docked Bricks drawer while building), in pixels. */
  leftPad = 0

  follow(px: number, py: number, vxPx: number, onGround: boolean, viewW: number, viewH: number, levelW: number, levelH: number) {
    const ground = this.bottomPad ? 0.6 : 0.72
    const targetLook = Math.max(-40, Math.min(40, vxPx * 18))
    this.look += (targetLook - this.look) * 0.04
    const wantX = px + this.look - viewW / 2
    if (!this.snapped) {
      this.x = wantX
      this.y = py - viewH * ground
      this.snapped = true
    }
    this.x += (wantX - this.x) * 0.12
    const minX = px - viewW * 0.65
    const maxX = px - viewW * 0.35
    if (this.x < minX) this.x = minX
    if (this.x > maxX) this.x = maxX

    if (onGround) this.y += (py - viewH * ground - this.y) * 0.1
    const top = viewH * 0.25
    const bottom = viewH * (this.bottomPad ? 0.7 : 0.86)
    if (py - this.y < top) this.y = py - top
    if (py - this.y > bottom) this.y = py - bottom
    this.clamp(viewW, viewH, levelW, levelH, 0, this.bottomPad)
  }

  /** Free movement (building). */
  pan(dx: number, dy: number, viewW: number, viewH: number, levelW: number, levelH: number) {
    this.x += dx
    this.y += dy
    this.clamp(viewW, viewH, levelW, levelH, 4 * TILE, this.bottomPad + TILE)
  }

  jumpTo(px: number, py: number, viewW: number, viewH: number, levelW: number, levelH: number, margin = 0) {
    this.x = px - this.leftPad - (viewW - this.leftPad) / 2
    this.y = py - (viewH - this.bottomPad) * (margin ? 0.5 : 0.6)
    this.snapped = true
    this.clamp(viewW, viewH, levelW, levelH, margin, this.bottomPad)
  }

  reset() {
    this.snapped = false
  }

  private clamp(viewW: number, viewH: number, levelW: number, levelH: number, margin = 0, below = 0) {
    // While building, the drawer covers the left of the view, so the level may slide out from under it.
    const left = margin ? this.leftPad : 0
    if (levelW <= viewW - left) this.x = (levelW - viewW - left) / 2
    else this.x = Math.max(-margin - left, Math.min(levelW - viewW + margin, this.x))
    const minY = -3 * TILE - margin
    const maxY = levelH - viewH + Math.max(margin, below)
    if (maxY < minY) this.y = maxY
    else this.y = Math.max(minY, Math.min(maxY, this.y))
  }
}
