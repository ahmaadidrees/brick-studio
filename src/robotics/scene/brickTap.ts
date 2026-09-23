/**
 * A tap on a placed brick that the robotics layer takes instead of the studio (the Robot
 * Workshop's paint mode: a tap paints the brick rather than selecting it). A tiny module with
 * no imports, like `cameraInsets.ts`: the scene asks `takeBrickTap` before it selects the bricks
 * a click, a touch tap or a box took; with nothing registered it answers false and the studio
 * selects exactly as before.
 */
export type BrickTapHandler = (brickIds: readonly string[]) => boolean

let handler: BrickTapHandler | null = null

export function registerBrickTap(next: BrickTapHandler | null) {
  handler = next
}

/** True when the registered handler took the tap: the caller then leaves the selection alone. */
export function takeBrickTap(brickIds: string | readonly string[] | null | undefined): boolean {
  if (!handler || !brickIds) return false
  const ids = typeof brickIds === 'string' ? [brickIds] : brickIds
  return ids.length > 0 && handler(ids)
}

/** While a handler is registered a held finger never grabs a brick: every tap, short or long, is the handler's. */
export function brickTapsTaken(): boolean {
  return handler !== null
}
