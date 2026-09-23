/**
 * While the Code view is open the studio's builder shortcuts (R, arrows, Delete, F, Home,
 * Escape, the 1/2 mode keys, ⌘Z/⌘C/⌘V/⌘D) must not fire: the construction is not what the
 * student is editing, and Blockly owns copy, paste, undo and delete inside its workspace.
 * `useBuilderShortcuts` in `src/brick/BrickStudioApp.tsx` asks `studioShortcutsSuspended()`
 * first, and the scene's drag-to-move and long-press grab ask `studioEditingSuspended()`, so
 * a drag on a scenery brick in My world cannot move it (the camera still orbits).
 * Kept import-free, like `scene/hiddenBricks.ts`, so the studio pays nothing for it.
 */
let holds = 0

/** Suspends the builder shortcuts until the returned release is called (idempotent). Holds nest. */
export function suspendStudioShortcuts(): () => void {
  holds += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holds = Math.max(0, holds - 1)
  }
}

export function studioShortcutsSuspended(): boolean {
  return holds > 0
}

/** The same hold, read by the scene's build pointer gestures (move a brick, long-press grab). */
export const studioEditingSuspended = studioShortcutsSuspended
