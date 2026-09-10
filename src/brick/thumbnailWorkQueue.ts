// GPU rendering and PNG encoding are synchronous. Spread uncached thumbnails
// across frames so opening the drawer or changing colour does not render the
// entire catalogue in one React commit.
const pendingWork = new Map<number, () => void>()
let nextId = 0
let cancelFrame: (() => void) | null = null

function requestNextFrame() {
  if (cancelFrame || pendingWork.size === 0) return
  if (typeof requestAnimationFrame === 'function') {
    const frame = requestAnimationFrame(runNext)
    cancelFrame = () => cancelAnimationFrame(frame)
  } else {
    const timer = setTimeout(runNext, 16)
    cancelFrame = () => clearTimeout(timer)
  }
}

function runNext() {
  cancelFrame = null
  const next = pendingWork.entries().next().value
  if (!next) return
  const [id, work] = next
  pendingWork.delete(id)
  try {
    work()
  } finally {
    requestNextFrame()
  }
}

/** Returns a cancellation function for unmounted, offscreen or superseded work. */
export function scheduleThumbnailWork(work: () => void): () => void {
  const id = nextId++
  pendingWork.set(id, work)
  requestNextFrame()
  return () => {
    pendingWork.delete(id)
    if (pendingWork.size === 0) {
      cancelFrame?.()
      cancelFrame = null
    }
  }
}
