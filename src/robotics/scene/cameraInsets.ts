/**
 * The third thing the shared build scene takes from the robotics layer: how much of the
 * canvas its panels cover, so the studio's own camera presets (Frame, Top, Front, 3D,
 * selection) frame the build in the part of the canvas a student can see. A tiny module
 * with no imports; with nothing registered the studio frames exactly as before.
 */
export type CanvasInsetsLike = { left: number; right: number; top: number; bottom: number }

let provider: (() => CanvasInsetsLike | null) | null = null

export function registerCanvasInsets(next: (() => CanvasInsetsLike | null) | null) {
  provider = next
}

export function currentCanvasInsets(): CanvasInsetsLike | null {
  return provider ? provider() : null
}
