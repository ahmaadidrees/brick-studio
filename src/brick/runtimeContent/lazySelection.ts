import { useEffect, useState } from 'react'

export type RuntimeLazyRegistration<T> = {
  load: () => Promise<T>
}

export type RuntimeLazySelection<T> = {
  content: T
  loading: boolean
  error: unknown
}

const sharedLoads = new WeakMap<object, Promise<unknown>>()

/**
 * Shares an in-flight import between the rig/world slots and any prefetch call.
 * Rejected imports are evicted so a later selection can retry after a transient
 * chunk or network failure.
 */
export function loadRuntimeRegistration<T>(registration: RuntimeLazyRegistration<T>): Promise<T> {
  const cached = sharedLoads.get(registration) as Promise<T> | undefined
  if (cached) return cached

  const pending = Promise.resolve().then(() => registration.load()).catch((error: unknown) => {
    sharedLoads.delete(registration)
    throw error
  })
  sharedLoads.set(registration, pending)
  return pending
}

/**
 * Resolves a controlled lazy selection without blanking already-rendered 3D
 * content. An older request is ignored if the selected registration changes
 * before it finishes.
 */
export function useRuntimeLazySelection<T>(
  registration: RuntimeLazyRegistration<T> | null,
  fallback: T,
  prepare?: (content: T) => void,
): RuntimeLazySelection<T> {
  const [selection, setSelection] = useState<RuntimeLazySelection<T>>({
    content: fallback,
    loading: false,
    error: null,
  })

  useEffect(() => {
    let current = true

    if (!registration) {
      setSelection({ content: fallback, loading: false, error: null })
      return () => {
        current = false
      }
    }

    setSelection((previous) => ({ ...previous, loading: true, error: null }))
    void loadRuntimeRegistration(registration).then(
      (content) => {
        if (!current) return
        try {
          prepare?.(content)
          setSelection({ content, loading: false, error: null })
        } catch (error: unknown) {
          setSelection({ content: fallback, loading: false, error })
        }
      },
      (error: unknown) => {
        if (!current) return
        setSelection({ content: fallback, loading: false, error })
      },
    )

    return () => {
      current = false
    }
  }, [fallback, prepare, registration])

  // Classic/unknown selections must fall back in the same render instead of
  // flashing the previously selected environment or avatar for one frame.
  if (!registration && selection.content !== fallback) {
    return { content: fallback, loading: false, error: null }
  }
  return selection
}
