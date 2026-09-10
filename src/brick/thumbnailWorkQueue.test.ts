import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scheduleThumbnailWork } from './thumbnailWorkQueue'

let frames: Map<number, FrameRequestCallback>
let nextFrame: number

function runFrame() {
  const [id, callback] = frames.entries().next().value!
  frames.delete(id)
  callback(0)
}

beforeEach(() => {
  frames = new Map()
  nextFrame = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
})

afterEach(() => vi.unstubAllGlobals())

describe('thumbnail work queue', () => {
  it('spreads a catalogue batch across frames instead of one blocking burst', () => {
    const work = vi.fn()
    for (let index = 0; index < 60; index++) scheduleThumbnailWork(work)
    expect(work).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    for (let completed = 1; completed <= 60; completed++) {
      runFrame()
      expect(work).toHaveBeenCalledTimes(completed)
    }
    expect(frames.size).toBe(0)
  })

  it('skips obsolete colour requests without delaying the replacement', () => {
    const obsolete = vi.fn()
    const current = vi.fn()
    const cancel = scheduleThumbnailWork(obsolete)
    scheduleThumbnailWork(current)
    cancel()
    runFrame()
    expect(obsolete).not.toHaveBeenCalled()
    expect(current).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
  })

  it('cancels the pending frame when all cards leave or unmount', () => {
    const work = vi.fn()
    const cancel = scheduleThumbnailWork(work)
    cancel()
    cancel()
    expect(frames.size).toBe(0)
    expect(work).not.toHaveBeenCalled()
  })

  it('supports hosts without animation frames and cleans up the timer', () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.useFakeTimers()
    const work = vi.fn()
    const cancel = scheduleThumbnailWork(work)
    cancel()
    vi.runAllTimers()
    expect(work).not.toHaveBeenCalled()
    scheduleThumbnailWork(work)
    vi.runAllTimers()
    expect(work).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
