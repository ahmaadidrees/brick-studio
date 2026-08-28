let suspensionCount = 0
const listeners = new Set<() => void>()

function notify() {
  for (const listener of [...listeners]) listener()
}

export function isBrickStudioAutosaveSuspended() {
  return suspensionCount > 0
}

export function subscribeBrickStudioAutosaveGuard(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Prevents a live room's authoritative document from replacing the builder's
 * private local autosave. The returned release function is idempotent.
 */
export function suspendBrickStudioAutosave() {
  suspensionCount += 1
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    suspensionCount = Math.max(0, suspensionCount - 1)
    notify()
  }
}
