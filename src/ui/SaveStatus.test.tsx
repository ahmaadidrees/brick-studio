import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { CloudSaveStatus } from '../classroom/cloudAutosave'
import type { LiveConnectionState } from '../brick/liveProtocol'
import { SaveStatus, describeSaveStatus } from './SaveStatus'

afterEach(cleanup)

describe('describeSaveStatus', () => {
  it('maps every real enum value to the contract label', () => {
    expect(describeSaveStatus({ kind: 'local' }).label).toBe('Saved in this browser')
    const cloud: Record<CloudSaveStatus, string> = {
      saved: 'Saved to your account',
      pending: 'Waiting to save…',
      saving: 'Saving to your account…',
      error: 'Save needs attention',
    }
    for (const [status, label] of Object.entries(cloud) as Array<[CloudSaveStatus, string]>) {
      expect(describeSaveStatus({ kind: 'cloud', status }).label).toBe(label)
    }
    const live: Record<LiveConnectionState, string> = {
      connecting: 'Connecting…',
      online: 'Shared world',
      reconnecting: 'Reconnecting…',
      offline: 'Offline · edits paused',
    }
    for (const [connection, label] of Object.entries(live) as Array<[LiveConnectionState, string]>) {
      expect(describeSaveStatus({ kind: 'live', connection }).label).toBe(label)
    }
  })

  it('reports blocked storage as an error, never as saved', () => {
    const status = describeSaveStatus({ kind: 'local', error: 'Storage is blocked' })
    expect(status.label).toBe('Save needs attention')
    expect(status.tone).toBe('error')
  })
})

describe('SaveStatus', () => {
  it('is a polite live region', () => {
    render(<SaveStatus source={{ kind: 'cloud', status: 'saving' }} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Saving to your account…')
  })

  it('uses the device icon for local drafts and the cloud icon only for cloud saved', () => {
    const { container, rerender } = render(<SaveStatus source={{ kind: 'local' }} />)
    expect(container.querySelector('svg.lucide-monitor')).not.toBeNull()
    expect(container.querySelector('svg.lucide-cloud')).toBeNull()
    rerender(<SaveStatus source={{ kind: 'cloud', status: 'saved' }} />)
    expect(container.querySelector('svg.lucide-cloud')).not.toBeNull()
    for (const status of ['pending', 'saving', 'error'] as const) {
      rerender(<SaveStatus source={{ kind: 'cloud', status }} />)
      expect(container.querySelector('svg.lucide-cloud'), status).toBeNull()
    }
    rerender(<SaveStatus source={{ kind: 'live', connection: 'online' }} />)
    expect(container.querySelector('svg.lucide-cloud')).toBeNull()
  })

  it('keeps the label for screen readers in compact mode and shows the action only for problems', () => {
    const { rerender } = render(<SaveStatus source={{ kind: 'live', connection: 'offline' }} compact action={<button type="button">Try again</button>} />)
    expect(screen.getByRole('status')).toHaveTextContent('Offline · edits paused')
    expect(screen.getByText('Offline · edits paused').closest('.sr-only')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    rerender(<SaveStatus source={{ kind: 'live', connection: 'online' }} compact action={<button type="button">Try again</button>} />)
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('autoCompact keeps the label in the DOM and marks the pill for the narrow-screen rule', () => {
    render(<SaveStatus source={{ kind: 'local' }} autoCompact />)
    const status = screen.getByRole('status')
    expect(status).toHaveClass('ui-save-status-auto')
    expect(status).not.toHaveClass('ui-save-status-compact')
    expect(status).toHaveTextContent('Saved in this browser')
    expect(status).toHaveAttribute('title', 'Saved in this browser')
  })

  it('shows the storage error as the detail line', () => {
    render(<SaveStatus source={{ kind: 'local', error: 'This browser is blocking storage.' }} />)
    expect(screen.getByRole('status')).toHaveTextContent('Save needs attention')
    expect(screen.getByRole('status')).toHaveTextContent('This browser is blocking storage.')
  })
})
