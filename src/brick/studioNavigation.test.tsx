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
  ClassroomPanel: ({ intent, invitedClassCode }: { intent: string; invitedClassCode?: string }) => <div role="dialog" aria-label={`Classroom ${intent}`} data-class-code={invitedClassCode ?? ''} />,
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
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })

describe('studio navigation and save context', () => {
  it('distinguishes a browser-only draft without claiming an account save', () => {
    render(<BrickStudioApp />)
    // The header uses the shared SaveStatus primitive fed from the real enum; the chip carries its source.
    expect(screen.getByText('This browser only').closest('[role="status"]')).toHaveAttribute('data-kind', 'local')
    expect(screen.queryByText('Saved to your account')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'World menu' }))
    expect(screen.getByRole('menuitem', { name: /My Worlds/ })).toHaveTextContent('My Worlds')
  })

  it('keeps My Worlds navigable while a named cloud world moves through pending, saving, error and saved states', () => {
    cloud.world = { id: 'world-one', title: 'My mountain castle', kind: 'personal', ownerId: 'student-one', classId: null, visibility: 'private', canEdit: true, classCanEdit: false, ownerName: 'Owner', ownerClassId: null, sharedAt: null, revision: 1, updatedAt: '2026-09-10T12:00:00Z' }
    cloud.status = 'pending'
    const view = render(<BrickStudioApp />)
    expect(screen.getByText('My mountain castle')).toHaveAttribute('title', 'My mountain castle')

    fireEvent.click(screen.getByRole('button', { name: 'World menu' }))
    const states: [CloudSaveStatus, string][] = [
      ['pending', 'Waiting to save…'],
      ['saving', 'Saving to your account…'],
      ['error', 'Save needs attention'],
      ['saved', 'Saved to your account'],
    ]
    for (const [status, label] of states) {
      cloud.status = status
      view.rerender(<BrickStudioApp />)
      const navigation = screen.getByRole('menuitem', { name: /My Worlds/ })
      expect(navigation).toHaveTextContent(/^My Worlds/)
      expect(navigation).toBeEnabled()
      expect(screen.getByText(label).closest('[role="status"]')).toHaveAttribute('data-kind', 'cloud')
    }
    fireEvent.click(screen.getByRole('menuitem', { name: /My Worlds/ }))
    expect(screen.getByRole('dialog', { name: 'Classroom worlds' })).toBeInTheDocument()
  })

  it('opens the existing customization sheet directly and keeps the draft uncommitted when canceled', () => {
    render(<BrickStudioApp />)
    const before = useBrickStore.getState().getDocumentSnapshot()
    fireEvent.click(screen.getByRole('button', { name: 'Start building' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scene' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'World menu' }))
    const menu = screen.getByRole('menu', { name: 'Studio actions' })
    const entries = within(menu).getAllByRole('menuitem')
    expect(entries[0]).toHaveTextContent('Home')
    expect(entries[1]).toHaveTextContent('My Worlds')
    expect(entries[2]).toHaveTextContent('My Class')
    fireEvent.click(entries[2])
    expect(screen.getByRole('dialog', { name: 'Classroom signin' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it.each([
    ['worlds', 'Classroom worlds'],
    ['join', 'Classroom join'],
    ['signin', 'Classroom signin'],
    ['teacher', 'Classroom teacher'],
  ])('opens the classroom panel for /build?classroom=%s and consumes the param', (intent, dialog) => {
    window.history.replaceState(null, '', `/build?classroom=${intent}&utm_source=poster#top`)
    render(<BrickStudioApp />)
    expect(screen.getByRole('dialog', { name: dialog })).toBeInTheDocument()
    expect(window.location.search).toBe('?utm_source=poster')
    expect(window.location.hash).toBe('#top')
  })

  it('opens no panel for /build?classroom=bogus and still strips the param', () => {
    window.history.replaceState(null, '', '/build?classroom=bogus&utm_source=poster')
    render(<BrickStudioApp />)
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.pathname).toBe('/build')
    expect(window.location.search).toBe('?utm_source=poster')
  })

  it('strips an invite class code from the address bar and still prefills the panel with it', () => {
    window.history.replaceState(null, '', '/build?classroom=signin&classCode=CLASS-456&utm_source=poster')
    render(<BrickStudioApp />)
    expect(screen.getByRole('dialog', { name: 'Classroom signin' })).toHaveAttribute('data-class-code', 'CLASS-456')
    expect(window.location.search).toBe('?utm_source=poster')
  })

  it('keeps a class code from a link without an intent for a panel opened from the menu', () => {
    window.history.replaceState(null, '', '/build?classCode=CLASS-456')
    render(<BrickStudioApp />)
    expect(screen.queryByRole('dialog', { name: /^Classroom/ })).not.toBeInTheDocument()
    expect(window.location.search).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'World menu' }))
    fireEvent.click(within(screen.getByRole('menu', { name: 'Studio actions' })).getByRole('menuitem', { name: /My Class/ }))
    expect(screen.getByRole('dialog', { name: 'Classroom signin' })).toHaveAttribute('data-class-code', 'CLASS-456')
  })

  it('does not report an account save for a connected or offline shared world', () => {
    const policy = { connection: 'online' as const, isOwner: true, onRequestMode: vi.fn() }
    const view = render(<BrickStudioApp livePolicy={policy} />)
    expect(screen.getByText('Shared world').closest('[role="status"]')).toHaveAttribute('data-kind', 'live')
    expect(screen.queryByText('Saved to your account')).not.toBeInTheDocument()
    view.rerender(<BrickStudioApp livePolicy={{ ...policy, connection: 'offline' }} />)
    expect(screen.getByText('Offline · edits paused').closest('[role="status"]')).toHaveAttribute('data-tone', 'offline')
    expect(screen.getByRole('button', { name: 'Explore mode' })).toBeDisabled()
  })
})
