/**
 * Kid basics (Robot Workshop prototype only): the quick start's "Build a robot" opens the brick
 * drawer on its Robots category, where "Start with a kit" sits. The drawer keeps its category in
 * local state, so the request goes through this tiny channel: the shell opens the drawer (or the
 * touch sheet) and the part grid switches to Robots, including a grid that mounts after the request
 * (the touch sheet). A request is answered once. Nothing calls it without the prototype.
 */
let requested = 0
let answered = 0
const listeners = new Set<() => void>()

export function requestRobotsDrawer() {
  requested += 1
  for (const listener of [...listeners]) listener()
}

/** True while a request has not been answered by a part grid (read it without side effects, e.g. in a state initializer). */
export function robotsDrawerPending(): boolean {
  return requested > answered
}

/** The part grid showed the Robots category for every request so far. */
export function answerRobotsDrawer() {
  answered = requested
}

export function subscribeRobotsDrawer(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
