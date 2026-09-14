import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'
import { createBrickStudioDocument } from './brickDocument'
import { saveLocalBrickStudioProject, type BrickStudioStorage } from './documentPersistence'
import { clearBrickStudioErrorLog, getRecentBrickStudioErrors } from './errorLog'
import type { BrickInstance } from './types'

const brick: BrickInstance = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#ffffff' }

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

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  clearBrickStudioErrorLog()
  localStorage.clear()
})

describe('AppErrorBoundary', () => {
  it('renders children untouched while nothing throws', () => {
    render(<AppErrorBoundary reload={vi.fn()}><p>studio</p></AppErrorBoundary>)
    expect(screen.getByText('studio')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the recovery screen with both actions when a local build exists', () => {
    const storage = memoryStorage()
    const document = createBrickStudioDocument([brick])
    expect(saveLocalBrickStudioProject(storage, document)).toEqual({ ok: true })
    const download = vi.fn(() => ({ ok: true as const }))
    const reload = vi.fn()

    render(
      <AppErrorBoundary storage={() => storage} download={download} reload={reload}>
        <Boom message="Could not load /brick-hero.glb: 404 Not Found" />
      </AppErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Oops! The studio tripped over a brick.')
    expect(alert).toHaveTextContent('Could not load /brick-hero.glb: 404 Not Found')
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Download my build' }))
    expect(download).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledWith(document)
    expect(screen.getByRole('status')).toHaveTextContent('downloaded')

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(getRecentBrickStudioErrors().at(-1)).toMatchObject({
      source: 'boundary',
      message: 'Could not load /brick-hero.glb: 404 Not Found',
    })
  })

  it('hides the download button when there is no local build', () => {
    const download = vi.fn(() => ({ ok: true as const }))
    render(
      <AppErrorBoundary storage={() => memoryStorage()} download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download my build' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(download).not.toHaveBeenCalled()
  })

  it('reads the autosaved build from window.localStorage by default', () => {
    saveLocalBrickStudioProject(window.localStorage, createBrickStudioDocument([brick]))
    const download = vi.fn(() => ({ ok: true as const }))
    render(
      <AppErrorBoundary download={download} reload={vi.fn()}>
        <Boom message="boom" />
      </AppErrorBoundary>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download my build' }))
    expect(download).toHaveBeenCalledWith(expect.objectContaining({ bricks: [brick] }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Download my build' }))
    expect(screen.getByRole('status')).toHaveTextContent('Brick Studio could not prepare the project download.')
  })
})
