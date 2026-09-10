import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BrickStudioApp from './BrickStudioApp'
import { useBrickStore } from './store'
import type { ClassroomWorld } from '../classroom/contracts'
import type { CloudSaveStatus } from '../classroom/cloudAutosave'

const cloud = vi.hoisted(() => ({
  world: null as ClassroomWorld | null,
  status: 'saved' as CloudSaveStatus,
  error: '',
  recovery: null,
  attach: vi.fn(),
  leave: vi.fn(),
  flush: vi.fn(async () => true),
  retry: vi.fn(),
  downloadRecovery: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('../classroom/useClassroomWorld', () => ({ useClassroomWorld: () => cloud }))
vi.mock('./BrickStudioScene', () => ({ default: () => <div /> }))
vi.mock('./PartThumbnail', () => ({ PartThumbnail: () => <span /> }))
vi.mock('../classroom/ClassroomPanel', () => ({
  ClassroomPanel: ({ intent }: { intent: string }) => <div role="dialog" aria-label={`Classroom ${intent}`} />,
}))

beforeEach(() => {
  for (const name of ['localStorage', 'sessionStorage']) {
    const values = new Map<string, string>()
    vi.stubGlobal(name, {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    })
  }
  useBrickStore.setState(useBrickStore.getInitialState(), true)
  cloud.world = null
  cloud.status = 'saved'
  cloud.error = ''
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('studio navigation and save context', () => {
  it('distinguishes a browser-only draft without claiming an account save', () => {
    render(<BrickStudioApp />)
    expect(screen.getByRole('status', { name: 'Save status: This browser only' })).toBeInTheDocument()
    expect(screen.queryByText('Saved to account')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'My Worlds' })).toHaveTextContent('My Worlds')
  })

  it('keeps My Worlds navigable while a named cloud world moves through pending, saving, error and saved states', () => {
    cloud.world = { id: 'world-one', title: 'My mountain castle', kind: 'personal', ownerId: 'student-one', classId: null, revision: 1, updatedAt: '2026-09-10T12:00:00Z' }
    cloud.status = 'pending'
    const view = render(<BrickStudioApp />)
    expect(screen.getByText('My mountain castle')).toHaveAttribute('title', 'My mountain castle')

    const states: [CloudSaveStatus, string][] = [
      ['pending', 'Waiting to save…'],
      ['saving', 'Saving to account…'],
      ['error', 'Save needs attention'],
      ['saved', 'Saved to account'],
    ]
    for (const [status, label] of states) {
      cloud.status = status
      view.rerender(<BrickStudioApp />)
      const navigation = screen.getByRole('button', { name: 'My Worlds' })
      expect(navigation).toHaveTextContent(/^My Worlds$/)
      expect(navigation).toBeEnabled()
      expect(screen.getByRole('status', { name: `Save status: ${label}` })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: 'My Worlds' }))
    expect(screen.getByRole('dialog', { name: 'Classroom worlds' })).toBeInTheDocument()
  })

  it('opens the existing customization sheet directly and keeps the draft uncommitted when canceled', () => {
    render(<BrickStudioApp />)
    const before = useBrickStore.getState().getDocumentSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'Start building' }))
    fireEvent.click(screen.getByRole('button', { name: 'Customize scene & character' }))
    const picker = screen.getByRole('dialog', { name: 'Scene & character' })
    expect(picker).toBeInTheDocument()
    fireEvent.keyDown(picker, { key: 'Enter' })
    fireEvent.keyDown(picker, { key: '2' })
    expect(useBrickStore.getState().mode).toBe('build')
    fireEvent.click(within(picker).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Scene & character' })).not.toBeInTheDocument()
    expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(before)
  })

  it('keeps My Worlds and My Class at the start of the compact menu', () => {
    render(<BrickStudioApp />)
    fireEvent.click(screen.getByRole('button', { name: 'More studio actions' }))
    const menu = screen.getByRole('menu', { name: 'Studio actions' })
    const entries = within(menu).getAllByRole('menuitem')
    expect(entries[0]).toHaveTextContent('My Worlds')
    expect(entries[1]).toHaveTextContent('My Class')
    fireEvent.click(entries[1])
    expect(screen.getByRole('dialog', { name: 'Classroom class' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('does not report an account save for a connected or offline shared world', () => {
    const policy = { connection: 'online' as const, isOwner: true, onRequestMode: vi.fn() }
    const view = render(<BrickStudioApp livePolicy={policy} />)
    expect(screen.getByRole('status', { name: 'Save status: Shared world' })).toBeInTheDocument()
    expect(screen.queryByText('Saved to account')).not.toBeInTheDocument()
    view.rerender(<BrickStudioApp livePolicy={{ ...policy, connection: 'offline' }} />)
    expect(screen.getByRole('status', { name: 'Save status: Offline · edits paused' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Build mode' })).toBeDisabled()
  })
})
