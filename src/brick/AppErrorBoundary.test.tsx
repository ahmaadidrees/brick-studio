import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_CLOUD_WORLD_SESSION_KEY, installActiveWorldRecovery } from './activeWorldRecovery'
import { AppErrorBoundary } from './AppErrorBoundary'
import { createBrickStudioDocument } from './brickDocument'
import { saveLocalBrickStudioProject, type BrickStudioStorage } from './documentPersistence'
import { clearBrickStudioErrorLog, getRecentBrickStudioErrors } from './errorLog'
import { suspendBrickStudioAutosave } from './liveAutosaveGuard'
import { registerRecoverySnapshotProvider } from './recoverySnapshot'
import { useBrickStore } from './store'
import type { BrickInstance } from './types'

const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#ffffff' }
const worldBrick: BrickInstance = { id: 'brick-b', partId: 'brick_2x4', x: 30, y: 0, z: 30, rotation: 0, color: '#ff0000' }

const LIVE_LABEL = 'Live room · captured when the studio crashed · may include changes that weren\'t saved'
const CLOUD_LABEL = 'Class world · captured when the studio crashed · may include changes that weren\'t saved yet'
const LOCAL_LABEL = 'This device · captured when the studio crashed · may include unsaved changes'

function Boom({ message }: { message: string }): never {
  throw new Error(message)
}

function memoryStorage(): BrickStudioStorage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value) },
    removeItem: (key) => { items.delete(key) },
  }
}

function okDownload() {
  return vi.fn(() => ({ ok: true as const }))
}

const cleanups: Array<() => void> = []

/** Mirrors the real studio: the store holds the open world and the app registered its provider. */
function openWorld(document: ReturnType<typeof createBrickStudioDocument>) {
  expect(useBrickStore.getState().restoreDocument(document)).toEqual({ ok: true })
  cleanups.push(installActiveWorldRecovery())
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearBrickStudioErrorLog()
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  for (const release of cleanups.splice(0)) release()
  useBrickStore.setState(useBrickStore.getInitialState(), true)
})

describe('AppErrorBoundary', () => {
  it('renders children untouched while nothing throws', () => {
    render(<AppErrorBoundary reload={vi.fn()}><p>studio</p></AppErrorBoundary>)
    expect(screen.getByText('studio')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('offers the build saved on this device, without claiming it was the open world, when nothing captured one', () => {
    const storage = memoryStorage()
    const document = createBrickStudioDocument([brick])
    expect(saveLocalBrickStudioProject(storage, document)).toEqual({ ok: true })
    const download = okDownload()
    const reload = vi.fn()

    render(
      <AppErrorBoundary storage={() => storage} download={download} reload={reload}>
        <Boom message="Could not load /brick-hero.glb: 404 Not Found" />
      </AppErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Oops! The studio tripped over a brick.')
    expect(alert).toHaveTextContent('Could not load /brick-hero.glb: 404 Not Found')
    expect(alert).toHaveTextContent('A build saved on this device can be downloaded below.')
    expect(reload).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Download the world I was in' })).toBeNull()

    const button = screen.getByRole('button', { name: 'Download build saved on this device' })
    expect(button).toHaveAccessibleDescription('Build saved on this device · the world you were in could not be captured')
    fireEvent.click(button)
    expect(download).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledWith(document, 'brickgineers-build')
    expect(screen.getByRole('status')).toHaveTextContent('downloaded as brickgineers-build.brickstudio.json')

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(getRecentBrickStudioErrors().at(-1)).toMatchObject({
      source: 'boundary',
      message: 'Could not load /brick-hero.glb: 404 Not Found',
    })
  })

  it('hides every download when there is no captured world and no local build', () => {
    const download = okDownload()
    render(
      <AppErrorBoundary storage={() => memoryStorage()} download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Reload to jump back into the studio.')
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(download).not.toHaveBeenCalled()
  })

  it('reads the autosaved build from window.localStorage by default', () => {
    saveLocalBrickStudioProject(window.localStorage, createBrickStudioDocument([brick]))
    const download = okDownload()
    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download build saved on this device' }))
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ bricks: [brick] }), 'brickgineers-build')
  })

  it('surfaces the export error message when the download cannot be prepared', () => {
    const storage = memoryStorage()
    saveLocalBrickStudioProject(storage, createBrickStudioDocument([brick]))
    const download = vi.fn(() => ({
      ok: false as const,
      error: { code: 'download' as const, message: 'Brick Studio could not prepare the project download.' },
    }))
    render(
      <AppErrorBoundary storage={() => storage} download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download build saved on this device' }))
    expect(screen.getByRole('status')).toHaveTextContent('Brick Studio could not prepare the project download.')
  })

  it('offers the class world that was open first and keeps the older private save separate', () => {
    const privateBuild = createBrickStudioDocument([brick])
    expect(saveLocalBrickStudioProject(localStorage, privateBuild)).toEqual({ ok: true })
    const classWorld = createBrickStudioDocument([worldBrick, { ...brick, id: 'brick-c', x: 50 }])
    sessionStorage.setItem(ACTIVE_CLOUD_WORLD_SESSION_KEY, JSON.stringify({ userId: 'teacher-1', worldId: 'world-b' }))
    cleanups.push(suspendBrickStudioAutosave())
    openWorld(classWorld)
    const download = okDownload()

    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('We captured the world you were in just before the studio closed.')
    const active = screen.getByRole('button', { name: 'Download the world I was in' })
    expect(active).toHaveAccessibleDescription(CLOUD_LABEL)
    fireEvent.click(active)
    expect(download).toHaveBeenLastCalledWith(classWorld, 'brickgineers-class-world-recovered')
    expect(screen.getByRole('status')).toHaveTextContent(
      'The world you were in was downloaded as brickgineers-class-world-recovered.brickstudio.json.',
    )

    const older = screen.getByRole('button', { name: 'Download older build saved on this device' })
    expect(older).toHaveAccessibleDescription('Build saved on this device earlier · kept separate from the world above')
    fireEvent.click(older)
    expect(download).toHaveBeenLastCalledWith(privateBuild, 'brickgineers-build')
    expect(screen.getByRole('status')).toHaveTextContent(
      'The build saved on this device was downloaded as brickgineers-build.brickstudio.json.',
    )
    expect(download).toHaveBeenCalledTimes(2)
  })

  it('offers the live room that was open with an honest unsaved-changes label', () => {
    window.history.replaceState({}, '', '/live/abc')
    const privateBuild = createBrickStudioDocument([brick])
    saveLocalBrickStudioProject(localStorage, privateBuild)
    const liveWorld = createBrickStudioDocument([worldBrick])
    openWorld(liveWorld)
    const download = okDownload()

    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )

    const active = screen.getByRole('button', { name: 'Download the world I was in' })
    expect(active).toHaveAccessibleDescription(LIVE_LABEL)
    fireEvent.click(active)
    expect(download).toHaveBeenLastCalledWith(liveWorld, 'brickgineers-live-room-recovered')

    fireEvent.click(screen.getByRole('button', { name: 'Download older build saved on this device' }))
    expect(download).toHaveBeenLastCalledWith(privateBuild, 'brickgineers-build')
  })

  it('shows a single download when the local autosave already matches the open build', () => {
    const document = createBrickStudioDocument([brick])
    saveLocalBrickStudioProject(localStorage, document)
    openWorld(document)
    const download = okDownload()

    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )

    const downloads = screen.getAllByRole('button', { name: /download/i })
    expect(downloads).toHaveLength(1)
    expect(downloads[0]).toHaveTextContent('Download the world I was in')
    expect(downloads[0]).toHaveAccessibleDescription(LOCAL_LABEL)
    fireEvent.click(downloads[0])
    expect(download).toHaveBeenCalledWith(document, 'brickgineers-build-recovered')
  })

  it('keeps an older local autosave downloadable when the open local build moved past it', () => {
    saveLocalBrickStudioProject(localStorage, createBrickStudioDocument([brick]))
    const unsaved = createBrickStudioDocument([brick, worldBrick])
    openWorld(unsaved)
    const download = okDownload()

    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )

    const active = screen.getByRole('button', { name: 'Download the world I was in' })
    expect(active).toHaveAccessibleDescription(LOCAL_LABEL)
    fireEvent.click(active)
    expect(download).toHaveBeenLastCalledWith(unsaved, 'brickgineers-build-recovered')
    fireEvent.click(screen.getByRole('button', { name: 'Download older build saved on this device' }))
    expect(download).toHaveBeenLastCalledWith(expect.objectContaining({ bricks: [brick] }), 'brickgineers-build')
  })

  it('captures the open world before the crashing subtree tears down and resets the store', () => {
    window.history.replaceState({}, '', '/live/room-1')
    const privateBuild = createBrickStudioDocument([brick])
    saveLocalBrickStudioProject(localStorage, privateBuild)
    const liveWorld = createBrickStudioDocument([worldBrick])
    openWorld(liveWorld)

    function Studio({ crash }: { crash: boolean }) {
      // Like a live client's dispose or a cloud leave: unmount puts the private build back.
      useEffect(() => () => { useBrickStore.getState().restoreDocument(privateBuild) }, [])
      if (crash) throw new Error('boom')
      return <p>studio</p>
    }
    const download = okDownload()
    const view = render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Studio crash={false} />
      </AppErrorBoundary>,
    )
    expect(screen.getByText('studio')).toBeInTheDocument()

    view.rerender(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Studio crash />
      </AppErrorBoundary>,
    )

    // Teardown really did reset the store, so anything read afterwards would be wrong.
    expect(useBrickStore.getState().bricks).toEqual(privateBuild.bricks)
    const active = screen.getByRole('button', { name: 'Download the world I was in' })
    expect(active).toHaveAccessibleDescription(LIVE_LABEL)
    fireEvent.click(active)
    expect(download).toHaveBeenLastCalledWith(liveWorld, 'brickgineers-live-room-recovered')
    fireEvent.click(screen.getByRole('button', { name: 'Download older build saved on this device' }))
    expect(download).toHaveBeenLastCalledWith(privateBuild, 'brickgineers-build')
  })

  it('ignores a provider that throws and falls back to the build saved on this device', () => {
    cleanups.push(registerRecoverySnapshotProvider(() => { throw new Error('provider exploded') }))
    saveLocalBrickStudioProject(localStorage, createBrickStudioDocument([brick]))
    const download = okDownload()

    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )

    expect(screen.queryByRole('button', { name: 'Download the world I was in' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Download build saved on this device' }))
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ bricks: [brick] }), 'brickgineers-build')
  })

  it('ignores a provider whose document fails validation and falls back to the build saved on this device', () => {
    cleanups.push(registerRecoverySnapshotProvider(() => ({
      document: { ...createBrickStudioDocument([worldBrick]), schemaVersion: 99 as never },
      source: 'cloud',
      worldId: 'world-b',
      title: null,
      capturedAt: Date.now(),
    })))
    saveLocalBrickStudioProject(localStorage, createBrickStudioDocument([brick]))
    const download = okDownload()

    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )

    expect(screen.queryByRole('button', { name: 'Download the world I was in' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Download build saved on this device' }))
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ bricks: [brick] }), 'brickgineers-build')
  })
})
