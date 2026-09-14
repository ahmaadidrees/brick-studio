import { beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

const initialState = useBrickStore.getInitialState()
const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }

beforeEach(() => {
  useBrickStore.setState({ ...initialState, bricks: [{ ...brick }], draft: null, selectedIds: [], selectedId: null }, true)
})

describe('setGraphicsPaused', () => {
  it('parks placement, grabs and touch movement when the WebGL context is lost', () => {
    const store = useBrickStore.getState()
    store.choosePart('brick_2x4')
    store.setGrabInProgress(true)
    store.setTouchMove(0.6, -0.4, 0.7, true)
    expect(useBrickStore.getState().draft).not.toBeNull()

    store.setGraphicsPaused(true)

    const paused = useBrickStore.getState()
    expect(paused.graphicsPaused).toBe(true)
    expect(paused.draft).toBeNull()
    expect(paused.marquee).toBeNull()
    expect(paused.grabInProgress).toBe(false)
    expect(paused.touchMove).toEqual({ x: 0, z: 0 })
    expect(paused.touchMoveMagnitude).toBe(0)
    expect(paused.touchRunning).toBe(false)
    expect(paused.announcement).toMatch(/Graphics paused/)
  })

  it('keeps the selection and only lifts the flag on restore', () => {
    const store = useBrickStore.getState()
    store.selectBrick('brick-a')
    store.setGraphicsPaused(true)
    expect(useBrickStore.getState().selectedIds).toEqual(['brick-a'])

    useBrickStore.getState().setGraphicsPaused(false)
    const restored = useBrickStore.getState()
    expect(restored.graphicsPaused).toBe(false)
    expect(restored.selectedIds).toEqual(['brick-a'])
    expect(restored.bricks).toHaveLength(1)
  })

  it('is idempotent', () => {
    useBrickStore.getState().setGraphicsPaused(false)
    expect(useBrickStore.getState().announcement).toBe(initialState.announcement)
    useBrickStore.getState().setGraphicsPaused(true)
    const first = useBrickStore.getState()
    useBrickStore.getState().setGraphicsPaused(true)
    expect(useBrickStore.getState()).toBe(first)
  })
})
