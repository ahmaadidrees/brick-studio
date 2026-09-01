import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brickDocument'
import { createInitialLiveRoomSnapshot, type LiveRoomActions, type LiveRoomSnapshot } from './liveRoomModel'
import { LiveWorldHud } from './LiveWorldHud'

afterEach(cleanup)

const players = [
  { playerId: 'owner', isOwner: true, profile: { displayName: 'Ari' } },
  { playerId: 'guest', isOwner: false, profile: { displayName: 'Bo' } },
]

function createActions(): LiveRoomActions {
  return {
    setMode: vi.fn(),
    setLocked: vi.fn(),
    setProfile: vi.fn(),
    sendPose: vi.fn(),
    requestResync: vi.fn(),
    reconnect: vi.fn(),
  }
}

function createSnapshot(patch: Partial<LiveRoomSnapshot> = {}): LiveRoomSnapshot {
  return {
    ...createInitialLiveRoomSnapshot('ROOM42', true),
    connection: 'online',
    syncing: false,
    selfPlayerId: 'owner',
    isOwner: true,
    document: createBrickStudioDocument([]),
    players,
    ...patch,
  }
}

function renderHud(snapshot = createSnapshot(), actions = createActions()) {
  return {
    actions,
    ...render(
      <LiveWorldHud
        snapshot={snapshot}
        roomTitle="Rover playground"
        shareLink="https://example.test/live/ROOM42"
        copyText={vi.fn(async () => true)}
        editingIntegrated
        actions={actions}
        onLeave={vi.fn()}
        onPublishSnapshot={vi.fn(async () => 'Published')}
        onRemixWorld={vi.fn(async () => 'Saved')}
      />,
    ),
  }
}

describe('canvas-first live room chrome', () => {
  it('starts compact, keeps large panels closed, and opens only one panel at a time', () => {
    renderHud()

    expect(screen.getByRole('toolbar', { name: 'Live collaboration controls' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Build$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Explore$/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
    expect(screen.getByRole('dialog', { name: '2 people here' })).toHaveTextContent('Ari')
    expect(screen.getByRole('dialog', { name: '2 people here' })).toHaveTextContent('Bo')

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Share this live world' })).toHaveTextContent('invite never includes your private owner key')
    expect(screen.queryByRole('dialog', { name: '2 people here' })).not.toBeInTheDocument()
  })

  it('preserves owner authority without adding another mode switch', () => {
    const { actions, rerender } = renderHud()

    fireEvent.click(screen.getByRole('button', { name: 'Room' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close room to new people' }))
    expect(actions.setLocked).toHaveBeenCalledWith(true)
    expect(screen.getByRole('dialog', { name: 'Rover playground' })).toHaveTextContent('You are the owner')

    rerender(
      <LiveWorldHud
        snapshot={createSnapshot({ isOwner: false, selfPlayerId: 'guest' })}
        roomTitle="Rover playground"
        shareLink="https://example.test/live/ROOM42"
        copyText={vi.fn(async () => true)}
        editingIntegrated
        actions={actions}
        onLeave={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: /room to new people/i })).not.toBeInTheDocument()
    expect(screen.getByText('The owner controls Build and Explore from the main switch.')).toBeInTheDocument()
  })

  it('keeps recovery and rejected-edit feedback visible without taking over the canvas', () => {
    const actions = createActions()
    const { rerender } = renderHud(createSnapshot({ connection: 'offline' }), actions)

    const recovery = screen.getByText('Building is paused').closest('.live-recovery-banner')
    expect(recovery).not.toBeNull()
    fireEvent.click(within(recovery as HTMLElement).getByRole('button', { name: 'Try again' }))
    expect(actions.reconnect).toHaveBeenCalledOnce()

    rerender(
      <LiveWorldHud
        snapshot={createSnapshot({ notice: { seq: 7, code: 'edit_rejected', message: 'Another builder changed that brick first.' } })}
        roomTitle="Rover playground"
        shareLink="https://example.test/live/ROOM42"
        copyText={vi.fn(async () => true)}
        editingIntegrated
        actions={actions}
        onLeave={vi.fn()}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('That change was not saved.')
    expect(alert).toHaveTextContent('Another builder changed that brick first.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Get latest' }))
    expect(actions.requestResync).toHaveBeenCalledOnce()
  })
})
