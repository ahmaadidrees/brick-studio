export type PoseVisibilitySource = {
  isVisible: () => boolean
  subscribe: (listener: () => void) => () => void
}

export type EfficientPoseSenderOptions<TPose> = {
  send: (pose: TPose) => boolean
  clone: (pose: TPose) => TPose
  equals: (first: TPose, second: TPose) => boolean
  isMoving: (pose: TPose) => boolean
  stop: (pose: TPose) => TPose
  intervalMs: number
  heartbeatMs: number
  now?: () => number
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
  visibility?: PoseVisibilitySource
}

export type EfficientPoseSender<TPose> = {
  update: (pose: TPose) => void
  activate: () => void
  deactivate: () => void
  transportOpened: () => void
  transportClosed: () => void
}

export function createDocumentVisibilitySource(): PoseVisibilitySource {
  return {
    isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
    subscribe: (listener) => {
      if (typeof document === 'undefined') return () => {}
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
  }
}

export function createEfficientPoseSender<TPose>(options: EfficientPoseSenderOptions<TPose>): EfficientPoseSender<TPose> {
  const now = options.now ?? (() => Date.now())
  const setTimer = options.setTimeout ?? ((handler, timeout) => globalThis.setTimeout(handler, timeout))
  const clearTimer = options.clearTimeout ?? ((timer) => globalThis.clearTimeout(timer))
  const visibility = options.visibility ?? createDocumentVisibilitySource()

  let active = false
  let transportOpen = false
  let visible = visibility.isVisible()
  let latest: TPose | undefined
  let lastSent: TPose | undefined
  let lastSentAt = Number.NEGATIVE_INFINITY
  let throttleTimer: ReturnType<typeof setTimeout> | undefined
  let heartbeatTimer: ReturnType<typeof setTimeout> | undefined
  let unsubscribeVisibility: (() => void) | undefined

  const clearThrottle = () => {
    if (throttleTimer !== undefined) clearTimer(throttleTimer)
    throttleTimer = undefined
  }

  const clearHeartbeat = () => {
    if (heartbeatTimer !== undefined) clearTimer(heartbeatTimer)
    heartbeatTimer = undefined
  }

  const scheduleHeartbeat = () => {
    if (heartbeatTimer !== undefined) return
    if (!active || !transportOpen || !visible || !latest || options.isMoving(latest)) return
    heartbeatTimer = setTimer(() => {
      heartbeatTimer = undefined
      if (!active || !transportOpen || !visible || !latest || options.isMoving(latest)) return
      const heartbeat = options.clone(latest)
      if (options.send(heartbeat)) {
        lastSent = options.clone(heartbeat)
        lastSentAt = now()
      }
      scheduleHeartbeat()
    }, options.heartbeatMs)
  }

  const sendNow = (pose: TPose) => {
    clearThrottle()
    if (!active || !transportOpen || !visible || !options.send(pose)) return false
    lastSent = options.clone(pose)
    lastSentAt = now()
    if (options.isMoving(pose)) clearHeartbeat()
    else {
      clearHeartbeat()
      scheduleHeartbeat()
    }
    return true
  }

  const flushLatest = () => {
    throttleTimer = undefined
    if (!latest || !visible) return
    if (lastSent && options.equals(lastSent, latest)) {
      if (!options.isMoving(latest)) scheduleHeartbeat()
      return
    }
    sendNow(options.clone(latest))
  }

  const update = (pose: TPose) => {
    const previousLatest = latest
    latest = options.clone(pose)
    if (!active || !transportOpen || !visible) return

    const stopped = !options.isMoving(latest)
      && ((lastSent && options.isMoving(lastSent)) || (previousLatest && options.isMoving(previousLatest)))
    if (stopped) {
      clearHeartbeat()
      sendNow(options.clone(latest))
      return
    }

    if (lastSent && options.equals(lastSent, latest)) {
      if (!options.isMoving(latest)) scheduleHeartbeat()
      return
    }

    const wait = options.intervalMs - (now() - lastSentAt)
    if (wait <= 0) {
      sendNow(options.clone(latest))
    } else if (throttleTimer === undefined) {
      throttleTimer = setTimer(flushLatest, wait)
    }
  }

  const visibilityChanged = () => {
    const nextVisible = visibility.isVisible()
    if (nextVisible === visible) return
    visible = nextVisible
    if (!visible) {
      clearThrottle()
      clearHeartbeat()
      if (active && transportOpen && latest && options.isMoving(latest)) {
        latest = options.stop(latest)
        if (options.send(options.clone(latest))) {
          lastSent = options.clone(latest)
          lastSentAt = now()
        }
      }
    } else if (active && transportOpen && latest) {
      sendNow(options.clone(latest))
    }
  }

  return {
    update,
    activate: () => {
      if (active) return
      active = true
      visible = visibility.isVisible()
      unsubscribeVisibility = visibility.subscribe(visibilityChanged)
    },
    deactivate: () => {
      if (!active) return
      active = false
      transportOpen = false
      clearThrottle()
      clearHeartbeat()
      unsubscribeVisibility?.()
      unsubscribeVisibility = undefined
    },
    transportOpened: () => {
      transportOpen = true
      if (active && visible && latest) sendNow(options.clone(latest))
    },
    transportClosed: () => {
      transportOpen = false
      clearThrottle()
      clearHeartbeat()
    },
  }
}
