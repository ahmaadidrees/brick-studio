import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_CLOUD_WORLD_SESSION_KEY,
  captureActiveWorldSnapshot,
  describeActiveWorld,
  installActiveWorldRecovery,
} from './activeWorldRecovery'
import { createBrickStudioDocument } from './brickDocument'
import { suspendBrickStudioAutosave } from './liveAutosaveGuard'
import { captureRecoverySnapshot } from './recoverySnapshot'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#ffffff' }
const cleanups: Array<() => void> = []

function openCloudWorld(worldId = 'world-b') {
  sessionStorage.setItem(ACTIVE_CLOUD_WORLD_SESSION_KEY, JSON.stringify({ userId: 'teacher-1', worldId }))
  cleanups.push(suspendBrickStudioAutosave())
}

beforeEach(() => {
  useBrickStore.setState(useBrickStore.getInitialState(), true)
})

afterEach(() => {
  for (const release of cleanups.splice(0)) release()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('describeActiveWorld', () => {
  it('treats any /live/ path as a live room identified by the room segment', () => {
    expect(describeActiveWorld('/live/abc')).toEqual({ source: 'live', worldId: 'abc' })
    expect(describeActiveWorld('/live/abc/')).toEqual({ source: 'live', worldId: 'abc' })
    expect(describeActiveWorld('/live/')).toEqual({ source: 'live', worldId: null })
  })

  it('reports a cloud world only while the session pointer is set and the autosave guard is held', () => {
    sessionStorage.setItem(ACTIVE_CLOUD_WORLD_SESSION_KEY, JSON.stringify({ userId: 'teacher-1', worldId: 'world-b' }))
    // A stale pointer after a failed or still-pending resume means the store holds the private build.
    expect(describeActiveWorld('/')).toEqual({ source: 'local', worldId: null })
    cleanups.push(suspendBrickStudioAutosave())
    expect(describeActiveWorld('/')).toEqual({ source: 'cloud', worldId: 'world-b' })
  })

  it('ignores malformed session pointers', () => {
    cleanups.push(suspendBrickStudioAutosave())
    for (const raw of ['nope', '{}', 'null', JSON.stringify({ userId: '', worldId: 'w' }), JSON.stringify({ userId: 'u' }), JSON.stringify({ userId: 'u', worldId: 7 })]) {
      sessionStorage.setItem(ACTIVE_CLOUD_WORLD_SESSION_KEY, raw)
      expect(describeActiveWorld('/')).toEqual({ source: 'local', worldId: null })
    }
  })

  it('reads window.location.pathname by default', () => {
    window.history.replaceState({}, '', '/live/room-9')
    expect(describeActiveWorld()).toEqual({ source: 'live', worldId: 'room-9' })
  })
})

describe('captureActiveWorldSnapshot', () => {
  it('returns null while the store holds nothing worth recovering', () => {
    expect(captureActiveWorldSnapshot()).toBeNull()
  })

  it('snapshots the store document together with the derived identity', () => {
    const document = createBrickStudioDocument([brick])
    expect(useBrickStore.getState().restoreDocument(document)).toEqual({ ok: true })
    openCloudWorld('world-b')
    const before = Date.now()
    const snapshot = captureActiveWorldSnapshot()
    expect(snapshot).toMatchObject({ source: 'cloud', worldId: 'world-b', title: null, document })
    expect(snapshot?.capturedAt).toBeGreaterThanOrEqual(before)
  })

  it('labels the private build as local when no world owns the store', () => {
    useBrickStore.getState().restoreDocument(createBrickStudioDocument([brick]))
    expect(captureActiveWorldSnapshot()).toMatchObject({ source: 'local', worldId: null })
  })
})

describe('installActiveWorldRecovery', () => {
  it('registers the store provider once and returns the same uninstall function', () => {
    const document = createBrickStudioDocument([brick])
    useBrickStore.getState().restoreDocument(document)
    const uninstall = installActiveWorldRecovery()
    cleanups.push(uninstall)
    expect(installActiveWorldRecovery()).toBe(uninstall)
    expect(captureRecoverySnapshot()).toMatchObject({ source: 'local', document })

    uninstall()
    uninstall()
    expect(captureRecoverySnapshot()).toBeNull()

    const reinstalled = installActiveWorldRecovery()
    cleanups.push(reinstalled)
    expect(reinstalled).not.toBe(uninstall)
    expect(captureRecoverySnapshot()).toMatchObject({ source: 'local', document })
  })
})
