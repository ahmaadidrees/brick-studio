import { beforeEach, describe, expect, it } from 'vitest'
import { createBrickStudioDocument } from './brickDocument'
import { isGraphicsPauseGatedAction, useBrickStore } from './store'
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

describe('while the graphics are paused', () => {
  it('parks the local editing, placement and movement actions', () => {
    const store = useBrickStore.getState()
    store.selectBrick('brick-a')
    store.setGraphicsPaused(true)
    const paused = useBrickStore.getState()

    paused.deleteSelected()
    paused.rotate()
    paused.nudge(1, 0, 0)
    paused.duplicate()
    paused.choosePart('brick_2x4')
    expect(paused.placeDraft()).toBe(false)
    expect(paused.newBuild()).toBe(false)
    paused.setTouchMove(1, 0, 1, true)
    paused.requestJump()
    paused.undo()

    const after = useBrickStore.getState()
    expect(after.bricks).toEqual(paused.bricks)
    expect(after.bricks[0]).toMatchObject({ id: 'brick-a', x: 10, rotation: 0 })
    expect(after.draft).toBeNull()
    expect(after.touchMove).toEqual({ x: 0, z: 0 })
    expect(after.jumpNonce).toBe(paused.jumpNonce)
    expect(after.selectedIds).toEqual(['brick-a'])
    expect(isGraphicsPauseGatedAction('deleteSelected')).toBe(true)
    expect(isGraphicsPauseGatedAction('restoreDocument')).toBe(false)
  })

  it('still accepts incoming world state and lets the builder cancel, switch mode and export', () => {
    useBrickStore.getState().setGraphicsPaused(true)
    const incoming = createBrickStudioDocument([{ ...brick, id: 'remote-1', x: 30 }], {})
    expect(useBrickStore.getState().restoreDocument(incoming).ok).toBe(true)
    expect(useBrickStore.getState().bricks.map((item) => item.id)).toEqual(['remote-1'])
    useBrickStore.setState({ bricks: [{ ...brick, id: 'remote-2', x: 40 }] })
    expect(useBrickStore.getState().bricks[0].id).toBe('remote-2')
    expect(() => JSON.parse(useBrickStore.getState().exportDocument())).not.toThrow()
    useBrickStore.getState().setMode('explore')
    expect(useBrickStore.getState().mode).toBe('explore')
  })

  it('works again after the context is restored', () => {
    const store = useBrickStore.getState()
    store.selectBrick('brick-a')
    store.setGraphicsPaused(true)
    useBrickStore.getState().deleteSelected()
    expect(useBrickStore.getState().bricks).toHaveLength(1)
    useBrickStore.getState().setGraphicsPaused(false)
    useBrickStore.getState().deleteSelected()
    expect(useBrickStore.getState().bricks).toHaveLength(0)
  })
})
