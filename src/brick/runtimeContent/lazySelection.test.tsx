import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  loadRuntimeRegistration,
  useRuntimeLazySelection,
  type RuntimeLazyRegistration,
} from './lazySelection'

type Content = { id: string }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('runtime lazy selection', () => {
  it('shares one in-flight load between consumers', async () => {
    const content = { id: 'shared' }
    const load = vi.fn(async () => content)
    const registration = { load }

    const [first, second] = await Promise.all([
      loadRuntimeRegistration(registration),
      loadRuntimeRegistration(registration),
    ])

    expect(first).toBe(content)
    expect(second).toBe(content)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('keeps previous content while loading and ignores stale completions', async () => {
    const fallback = { id: 'classic' }
    const first = deferred<Content>()
    const second = deferred<Content>()
    const firstRegistration: RuntimeLazyRegistration<Content> = { load: () => first.promise }
    const secondRegistration: RuntimeLazyRegistration<Content> = { load: () => second.promise }
    const { result, rerender } = renderHook(
      ({ registration }) => useRuntimeLazySelection(registration, fallback),
      { initialProps: { registration: firstRegistration } },
    )

    expect(result.current.content).toBe(fallback)
    expect(result.current.loading).toBe(true)

    rerender({ registration: secondRegistration })
    await act(async () => first.resolve({ id: 'first' }))
    expect(result.current.content).toBe(fallback)
    expect(result.current.loading).toBe(true)

    const latest = { id: 'second' }
    await act(async () => second.resolve(latest))
    expect(result.current.content).toBe(latest)
    expect(result.current.loading).toBe(false)
  })

  it('keeps resolved content visible while the next selection loads', async () => {
    const fallback = { id: 'classic' }
    const firstContent = { id: 'first' }
    const second = deferred<Content>()
    const firstRegistration: RuntimeLazyRegistration<Content> = {
      load: async () => firstContent,
    }
    const secondRegistration: RuntimeLazyRegistration<Content> = { load: () => second.promise }
    const { result, rerender } = renderHook(
      ({ registration }) => useRuntimeLazySelection(registration, fallback),
      { initialProps: { registration: firstRegistration } },
    )

    await waitFor(() => expect(result.current.content).toBe(firstContent))
    rerender({ registration: secondRegistration })

    expect(result.current.content).toBe(firstContent)
    expect(result.current.loading).toBe(true)

    const secondContent = { id: 'second' }
    await act(async () => second.resolve(secondContent))
    expect(result.current.content).toBe(secondContent)
  })

  it('falls back after a failed load and lets a later call retry', async () => {
    const fallback = { id: 'classic' }
    const failure = new Error('chunk unavailable')
    const load = vi.fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ id: 'recovered' })
    const registration = { load }
    const { result } = renderHook(() => useRuntimeLazySelection(registration, fallback))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.content).toBe(fallback)
    expect(result.current.error).toBe(failure)

    await expect(loadRuntimeRegistration(registration)).resolves.toEqual({ id: 'recovered' })
    expect(load).toHaveBeenCalledTimes(2)
  })
})
