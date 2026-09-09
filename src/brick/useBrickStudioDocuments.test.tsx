import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { useState } from 'react'
import { createBrickStudioDocument } from './brickDocument'
import { useBrickStore } from './store'
import { useBrickStudioDocuments } from './useBrickStudioDocuments'
import type { CustomPartDefinition, EnvironmentId } from './types'

beforeEach(() => {
  const entries = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  } })
  useBrickStore.setState(useBrickStore.getInitialState(), true)
})
afterEach(cleanup)

it('propagates full-document restoration and undo to parent metadata without a feedback loop', () => {
  const { result } = renderHook(() => {
    const [environmentId, setEnvironment] = useState<EnvironmentId>('classic')
    const [customParts, setCustomParts] = useState<CustomPartDefinition[]>([])
    useBrickStudioDocuments({}, true, { environmentId, customParts, onDocumentLoaded(document) {
      setEnvironment(document.environmentId)
      setCustomParts(document.customParts)
    } })
    return { environmentId, customParts }
  })
  const custom = { id: 'custom_cloud', name: 'Cloud', template: 'solid', width: 2, depth: 2, height: 3, studs: 'auto' } as const
  const cloud = createBrickStudioDocument([], { environmentId: 'sky-island', customParts: [custom] })
  act(() => { useBrickStore.getState().restoreDocument(cloud) })
  expect(result.current).toEqual({ environmentId: 'sky-island', customParts: [custom] })
  act(() => { useBrickStore.getState().newBuild() })
  expect(result.current).toEqual({ environmentId: 'classic', customParts: [] })
  act(() => { useBrickStore.getState().undo() })
  expect(result.current).toEqual({ environmentId: 'sky-island', customParts: [custom] })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(cloud)
})
