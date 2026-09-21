import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brickDocument'
import { createInitialLiveRoomSnapshot, type LiveRoomActions, type LiveRoomSnapshot } from './liveRoomModel'
import { LivePeoplePanelContext, LiveWorldHud, type LiveWorldHudProps } from './LiveWorldHud'

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

function renderHud(snapshot = createSnapshot(), actions = createActions(), options: Partial<LiveWorldHudProps> = {}) {
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
        {...options}
      />,
    ),
  }
}

describe('canvas-first live room chrome', () => {
  it('starts compact and opens one People panel with invite, roster and room controls', () => {
    renderHud()

    expect(screen.getByRole('toolbar', { name: 'Live collaboration controls' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Build$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Explore$/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
    const panel = screen.getByRole('dialog', { name: 'Rover playground' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(panel).toHaveTextContent('In this world (2)')
    expect(panel).toHaveTextContent('Ari')
    expect(panel).toHaveTextContent('Bo')
    expect(panel).toHaveTextContent('https://example.test/live/ROOM42')
    expect(panel).toHaveTextContent('keep your owner link for yourself')
    expect(within(panel).getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Leave room' })).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('button', { name: 'Close people panel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'People, 2 here' })).toHaveFocus()
  })

  it('opens the People panel from a header request and hides its own trigger while a header controls it', () => {
    const actions = createActions()
    const props = { snapshot: createSnapshot(), roomTitle: 'Rover playground', shareLink: 'https://example.test/live/ROOM42', copyText: vi.fn(async () => true), editingIntegrated: true, actions, onLeave: vi.fn() }
    const { rerender } = render(<LivePeoplePanelContext.Provider value={{ seq: 0 }}><LiveWorldHud {...props} /></LivePeoplePanelContext.Provider>)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<LivePeoplePanelContext.Provider value={{ seq: 1 }}><LiveWorldHud {...props} /></LivePeoplePanelContext.Provider>)
    expect(screen.getByRole('dialog', { name: 'Rover playground' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    rerender(<LivePeoplePanelContext.Provider value={{ seq: 2 }}><LiveWorldHud {...props} /></LivePeoplePanelContext.Provider>)
    expect(screen.getByRole('dialog', { name: 'Rover playground' })).toBeInTheDocument()
  })

  it('preserves owner authority without adding another mode switch', () => {
    const { actions, rerender } = renderHud()

    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
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

  it('offers one explicit rejoin after takeover without automatically reconnecting or showing a stale live count', () => {
    const actions = createActions()
    renderHud(createSnapshot({ connection: 'offline', notice: { seq: 1, code: 'session_replaced', message: 'Another session took over.' } }), actions)
    expect(screen.getByText('Paused here')).toBeInTheDocument()
    expect(screen.getByText('This room is open somewhere else')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(actions.reconnect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 last seen' }))
    expect(screen.getByRole('dialog', { name: 'Rover playground' })).toHaveTextContent('Last seen in this room')
    expect(screen.queryByRole('button', { name: 'Change my builder name' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Rejoin here' }))
    expect(actions.reconnect).toHaveBeenCalledOnce()
  })

  it('distinguishes classroom invites from temporary guest rooms and keeps account names authoritative', () => {
    renderHud(createSnapshot(), createActions(), { roomKind: 'classroom', onRemixWorld: undefined, onPublishSnapshot: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Only classmates with access can join. They need to sign in')
    expect(screen.queryByText(/2 hours/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No account needed/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change my builder name' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Reopen this classroom world from My Class')
  })

  it('keeps export available while offline without using the local-overwrite action', async () => {
    const onExportWorld = vi.fn(async () => 'Download started')
    const onRemixWorld = vi.fn(async () => 'Saved locally')
    renderHud(createSnapshot({ connection: 'offline' }), createActions(), { onExportWorld, onRemixWorld })
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 last seen' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Expires after 2 hours without activity')
    expect(screen.getByRole('dialog')).toHaveTextContent('replaces this browser’s current build')
    fireEvent.click(screen.getByRole('button', { name: 'Export copy' }))
    await waitFor(() => expect(onExportWorld).toHaveBeenCalledOnce())
    expect(onRemixWorld).not.toHaveBeenCalled()
    expect(await screen.findByText('Download started')).toBeInTheDocument()
  })

  it.each([true, false])('copies only the supplied diagnostic export and reports clipboard success=%s', async (copied) => {
    const copyText = vi.fn(async () => copied)
    const diagnostics = 'Brick Studio diagnostics\nconnection: offline\nclose: 4001'
    renderHud(createSnapshot(), { ...createActions(), exportDiagnostics: () => diagnostics }, { copyText })
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }))
    await waitFor(() => expect(copyText).toHaveBeenCalledWith(diagnostics))
    expect(await screen.findByText(copied ? 'Diagnostics copied. Share them when reporting a connection problem.' : 'Could not copy diagnostics. Try again.')).toBeInTheDocument()
  })

  it('keeps unconfirmed changes distinct from Live and guards leaving only while edits are pending', () => {
    const options = { roomTitle: 'Room', shareLink: 'https://example.test/live/ROOM42', copyText: vi.fn(async () => true), editingIntegrated: true, actions: createActions(), onLeave: vi.fn() }
    const { rerender } = render(<LiveWorldHud {...options} snapshot={createSnapshot({ pendingOperations: 2 })} />)
    expect(screen.getByText('Syncing…')).toBeInTheDocument()
    const pendingUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(pendingUnload)
    expect(pendingUnload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('2 changes still need confirmation from the room')
    rerender(<LiveWorldHud {...options} snapshot={createSnapshot({ pendingOperations: 0 })} />)
    expect(screen.getByText('Live')).toBeInTheDocument()
    const savedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(savedUnload)
    expect(savedUnload.defaultPrevented).toBe(false)
  })

  it('keeps a replaced-session recovery draft visible after rejoin until its download succeeds and the builder dismisses it', async () => {
    const recoveryDocument = createBrickStudioDocument([], { environmentId: 'sky-island' })
    const onExportRecovery = vi.fn().mockRejectedValueOnce(new Error('Download failed')).mockResolvedValue('Recovery download started')
    const dismissRecovery = vi.fn()
    renderHud(createSnapshot({ recoveryDocument, notice: { seq: 2, code: 'changes_need_review', message: 'Review earlier changes' } }), { ...createActions(), dismissRecovery }, { onExportRecovery })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByText('Keep a copy of your earlier changes')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'I have my copy' })).not.toBeInTheDocument()
    const pendingUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(pendingUnload)
    expect(pendingUnload.defaultPrevented).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Download recovery copy' }))
    await screen.findByText('Download failed')
    expect(dismissRecovery).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'I have my copy' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Download recovery copy' }))
    fireEvent.click(await screen.findByRole('button', { name: 'I have my copy' }))
    expect(dismissRecovery).toHaveBeenCalledOnce()
    expect(onExportRecovery).toHaveBeenCalledTimes(2)
    const exportedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(exportedUnload)
    expect(exportedUnload.defaultPrevented).toBe(false)
  })

  it('continues guarding navigation when an additional recovery draft has not been exported', async () => {
    const recoveryDocument = createBrickStudioDocument([])
    renderHud(createSnapshot({ recoveryDocument, recoveryDocumentCount: 2 }), createActions(), { onExportRecovery: async () => 'Downloaded first draft' })
    fireEvent.click(screen.getByRole('button', { name: 'Download recovery copy' }))
    await screen.findByText('Downloaded first draft')
    expect(screen.getByText('2 recovery copies remain. Download each before leaving.')).toBeInTheDocument()
    const guardedUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(guardedUnload)
    expect(guardedUnload.defaultPrevented).toBe(true)
  })

  it('offers Invite more and the roster presence lines only when the room provides them', () => {
    const onInviteMore = vi.fn()
    renderHud(createSnapshot(), createActions(), { roomKind: 'classroom', onInviteMore, presence: { building: ['Ben K.'], waiting: ['Cy D.', 'Dee F.'] } })
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here. Building with Ben K. Waiting for Cy D. and Dee F.' }))
    const panel = screen.getByRole('dialog', { name: 'Rover playground' })
    expect(panel).toHaveTextContent('Building with Ben K.')
    expect(panel).toHaveTextContent('Waiting for Cy D. and Dee F.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Invite more' }))
    expect(onInviteMore).toHaveBeenCalledTimes(1)
    cleanup()
    renderHud(createSnapshot(), createActions(), { roomKind: 'classroom', presence: { building: [], waiting: [] } })
    fireEvent.click(screen.getByRole('button', { name: 'People, 2 here' }))
    const plain = screen.getByRole('dialog', { name: 'Rover playground' })
    expect(within(plain).queryByRole('button', { name: 'Invite more' })).not.toBeInTheDocument()
    expect(plain).not.toHaveTextContent('Building with')
  })
})
