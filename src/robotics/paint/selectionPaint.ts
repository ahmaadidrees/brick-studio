/**
 * How the studio's drawer swatches paint what is picked in the Robot Workshop (lane P). A tiny
 * module with no imports, like `scene/cameraInsets.ts`: paint mode registers the painter (one
 * brick as it is; several, such as a whole kit just placed, the way "Paint all" does, so tyres,
 * axles, eyes, lights and buttons keep their colour). With nothing registered the studio paints
 * the selection its own way.
 */
export type SelectionPainter = (color: string) => boolean

let painter: SelectionPainter | null = null

export function registerSelectionPainter(next: SelectionPainter | null) {
  painter = next
}

/** True when the registered painter painted the selection (the caller then does nothing else). */
export function paintSelectionWith(color: string): boolean {
  return painter ? painter(color) : false
}
