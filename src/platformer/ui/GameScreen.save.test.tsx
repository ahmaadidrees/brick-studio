/*
 * A signed-in builder's first save goes to their account. When that fails the world is kept in this browser; when
 * both fail, nothing may pretend it is saved: closing the tab and leaving both ask first. (Pre-ship re-review, R1.)
 * The game itself is stubbed: these tests drive only GameScreen's saving and leaving.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBlankLevel, type LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { GameScreen } from './GameScreen'
import { saveCharacter } from './prefs'
import type { ClassroomWorld } from '../../classroom/contracts'

const state = vi.hoisted(() => ({ session: null as null | { editCount: number; setCharacter: ReturnType<typeof vi.fn> }, sharing: vi.fn(), create: vi.fn(), flush: vi.fn(), characterOption: '' }))
vi.mock('./cloudLevel', () => ({ createCloudLevel: state.create, CloudLevelSaver: class { world; schedule = vi.fn(); flush = state.flush; constructor(world: unknown) { this.world = world } } }))
vi.mock('../../classroom/client', () => ({ browserClassroomClient: { setWorldSharing: state.sharing, listClassmates: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../shell', () => ({
  useClassroomSession: () => ({ status: 'student', user: { id: 'student' }, classes: [] }),
  useCompactLayout: () => false,
  AppHeader: (p: { editorActions?: ReactNode; saveStatus: { source: { error?: string } }; worldMenu: (m: { openRename: () => void }) => ReactNode; onOpenWorldSetup: (tab: 'environment' | 'character') => void; onStartLiveWorld?: () => void; livePolicy?: { onOpenPeople?: () => void } }) => (
    <div>
      <span>{p.saveStatus.source.error}</span>
      {p.editorActions}
      <button className="app-header-tool" onClick={() => p.onOpenWorldSetup('character')}>Character</button>
      {p.onStartLiveWorld && <button onClick={p.onStartLiveWorld}>People action</button>}
      {p.livePolicy?.onOpenPeople && <button onClick={p.livePolicy.onOpenPeople}>People</button>}
      {p.worldMenu({ openRename() {} })}
    </div>
  ),
}))
vi.mock('./LevelMenu', () => ({ LevelMenu: (p: { onExit: () => void }) => <button onClick={p.onExit}>Leave test world</button> }))
vi.mock('./BuildShell', () => ({ BuildShell: () => null }))
vi.mock('./PeopleSheet', () => ({ PeopleSheet: (p: { open: boolean; onInviteMore?: () => void }) => p.open && p.onInviteMore ? <button onClick={p.onInviteMore}>Invite more</button> : null }))
vi.mock('../../classroom/InviteSheet', () => ({ InviteSheet: (p: { world: ClassroomWorld; onInvite: (value: unknown) => void }) => <div role="dialog" aria-label="Share with classmates"><span>Invited: {p.world.members?.map(member => member.id).join(',')}</span><button onClick={() => p.onInvite({ visibility: 'members', canEdit: true, members: [...(p.world.members?.map(member => member.id) ?? []), 'student-b'] })}>Add classmate B</button></div> }))
vi.mock('./SceneSheet', () => ({ SceneSheet: () => null }))
vi.mock('./Menu', () => ({ Menu: () => null }))
vi.mock('../game/session', () => ({
  GameSession: class {
    timeline: { world: { design: LevelDesign } }
    editCount = 0
    room = null
    solo = true
    canBuild = true
    isHost = true
    joined = true
    mode = 'build'
    editor = {}
    input = { setSuspended() {} }
    renderer: { canvas: HTMLCanvasElement }
    sound = { setMuted() {}, setMusic() {}, unlock() {} }
    setCharacter = vi.fn()
    constructor(canvas: HTMLCanvasElement, level: LevelDesign, options: { character?: string }) {
      this.timeline = { world: { design: level } }
      this.renderer = { canvas }
      state.characterOption = options.character ?? ''
      state.session = this
    }
    setMode() { return true }
    resize() {}
    start() {}
    stop() {}
    setPaused() {}
    setBottomInset() {}
    setLeftInset() {}
    focusPlayer() {}
  },
}))

let confirmLeave: { mock: { calls: unknown[] } }
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  confirmLeave = vi.spyOn(window, 'confirm').mockReturnValue(false)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  state.create.mockReset()
  state.flush.mockReset().mockResolvedValue(true)
  state.session = null
  state.characterOption = ''
  localStorage.clear()
})

const browserFull = () => vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
const open = (onExit = () => {}) => render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'new' }} startMode="build" onExit={onExit} />)

const savedWorld = (visibility: 'private' | 'class'): ClassroomWorld => ({
  id: '12345678-1234-4234-8234-123456789abc', title: 'Saved world', kind: 'personal', format: '2d',
  ownerId: 'student', ownerClassId: 'class-1', classId: 'class-1', canEdit: true, visibility, classCanEdit: visibility === 'class', members: [], revision: 1,
  updatedAt: '2026-09-24T00:00:00Z', ownerName: 'Student', sharedAt: visibility === 'class' ? '2026-09-24T00:00:00Z' : null,
})

it('starts with the saved character and applies a new choice immediately', () => {
  localStorage.setItem('brick-studio.2d.character.v1', 'brick-fox')
  open()
  expect(state.characterOption).toBe('brick-fox')
  const opener = screen.getByRole('button', { name: 'Character' })
  opener.focus()
  fireEvent.click(opener, { detail: 1 })
  fireEvent.click(screen.getByRole('radio', { name: /Bolt Bot/ }))
  expect(state.session!.setCharacter).toHaveBeenCalledWith('bolt-bot')
  expect(localStorage.getItem('brick-studio.2d.character.v1')).toBe('bolt-bot')
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(opener).toHaveFocus()
})

it('keeps the character for this visit when browser storage refuses the preference', () => {
  const full = browserFull()
  const view = open()
  fireEvent.click(screen.getByRole('button', { name: 'Character' }))
  fireEvent.click(screen.getByRole('radio', { name: /Brick Fox/ }))
  view.unmount()
  open()
  expect(state.characterOption).toBe('brick-fox')
  full.mockRestore()
  saveCharacter('builder')
})

it('keeps asking before closing the tab after the account save and the browser fallback both fail', async () => {
  browserFull()
  state.create.mockRejectedValue(new Error('Offline'))
  open()
  state.session!.editCount = 1
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(screen.getAllByText(/This browser would not save/).length).toBeGreaterThan(0)
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})

it('does not leave when the first account save fails on the way out and the browser fallback fails too', async () => {
  browserFull()
  let fail!: (error: Error) => void
  state.create.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
  const onExit = vi.fn()
  open(onExit)
  state.session!.editCount = 1
  fireEvent.click(screen.getByRole('button', { name: 'Leave test world' }))
  expect(state.create).toHaveBeenCalledOnce()
  await act(async () => {
    fail(new Error('Offline'))
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(confirmLeave).toHaveBeenCalledOnce()
  expect(onExit).not.toHaveBeenCalled()
})

it('leaves without asking once a failed account save has fallen back to this browser', async () => {
  let fail!: (error: Error) => void
  state.create.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
  const onExit = vi.fn()
  open(onExit)
  state.session!.editCount = 1
  fireEvent.click(screen.getByRole('button', { name: 'Leave test world' }))
  await act(async () => {
    fail(new Error('Offline'))
    await vi.advanceTimersByTimeAsync(0)
  })
  expect(confirmLeave).not.toHaveBeenCalled()
  expect(onExit).toHaveBeenCalledOnce()
  expect(localStorage.getItem('brick-studio.2d.drafts.v1')).not.toBeNull()
})

it('opens the same shared account world after flushing instead of creating a guest copy', async () => {
  const assign = vi.fn()
  render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'cloud', world: savedWorld('class') }} startMode="build" onExit={() => {}} />)
  vi.stubGlobal('window', Object.assign(Object.create(window), { location: { assign }, clearTimeout: vi.fn() }))
  fireEvent.click(screen.getByRole('button', { name: 'People action' }))
  await act(async () => { await Promise.resolve() })
  vi.unstubAllGlobals()
  expect(state.flush).toHaveBeenCalledOnce()
  expect(state.create).not.toHaveBeenCalled()
  expect(assign).toHaveBeenCalledWith('/2d/w/12345678123442348234123456789abc')
})

it('asks a student to choose sharing before opening a private saved world with classmates', async () => {
  render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'cloud', world: savedWorld('private') }} startMode="build" onExit={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'People action' }))
  expect(screen.getByRole('dialog', { name: 'Share with classmates' })).toBeInTheDocument()
  expect(state.create).not.toHaveBeenCalled()
  expect(state.flush).not.toHaveBeenCalled()
})

it('lets an owner invite again inside the room without navigation or a new game session', async () => {
  const world = { ...savedWorld('class'), visibility: 'members' as const, members: [{ id: 'student-a', displayName: 'A' }] }
  state.sharing.mockResolvedValue({ ...world, members: [...world.members, { id: 'student-b', displayName: 'B' }] })
  render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'room', roomKind: 'classroom', roomId: world.id.replaceAll('-', ''), world }} room={{ roomId: world.id, name: 'Owner', url: 'ws://localhost/test' }} startMode="play" onExit={() => {}} />)
  const session = state.session
  const assign = vi.fn()
  vi.stubGlobal('window', { ...window, addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window), location: { ...window.location, assign } })
  fireEvent.click(screen.getByRole('button', { name: 'People' }))
  fireEvent.click(screen.getByRole('button', { name: 'Invite more' }))
  expect(screen.getByText('Invited: student-a')).toBeInTheDocument()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add classmate B' })); await Promise.resolve() })
  expect(state.sharing).toHaveBeenCalledWith(world.id, { visibility: 'members', canEdit: true, members: ['student-a', 'student-b'] })
  expect(assign).not.toHaveBeenCalled()
  expect(state.session).toBe(session)
  fireEvent.click(screen.getByRole('button', { name: 'People' }))
  fireEvent.click(screen.getByRole('button', { name: 'Invite more' }))
  expect(screen.getByText('Invited: student-a,student-b')).toBeInTheDocument()
})

it('explicitly saves an untouched world to the account', async () => {
  state.create.mockResolvedValue(savedWorld('private'))
  open()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save to my account' })); await Promise.resolve() })
  expect(state.create).toHaveBeenCalledOnce()
  expect(state.flush).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Save now' })).toBeInTheDocument()
})
it('People waits for first account creation and opens classmates rather than a guest room', async () => {
  let finish!: (world: ClassroomWorld) => void
  state.create.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  open()
  fireEvent.click(screen.getByRole('button', { name: 'People action' }))
  expect(state.create).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog', { name: 'Share with classmates' })).toBeNull()
  await act(async () => { finish(savedWorld('private')); await Promise.resolve() })
  expect(screen.getByRole('dialog', { name: 'Share with classmates' })).toBeInTheDocument()
})
it('retries a failed first account save without another edit', async () => {
  state.create.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(savedWorld('private'))
  open()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save to my account' })); await Promise.resolve() })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry save' })); await Promise.resolve() })
  expect(state.create).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: 'Save now' })).toBeInTheDocument()
})

it('lets a signed-in guest host keep an account copy and continue to classroom invitations', async () => {
  state.create.mockResolvedValue(savedWorld('private'))
  render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'room', roomKind: 'guest', roomId: 'abcd' }} room={{ roomId: 'abcd', name: 'Owner', url: 'ws://localhost/test' }} startMode="play" onExit={() => {}} />)
  const assign = vi.fn()
  vi.stubGlobal('window', { ...window, addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window), location: { ...window.location, assign } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save a copy to my account' })); await Promise.resolve() })
  expect(state.create).toHaveBeenCalledOnce()
  expect(assign).toHaveBeenCalledWith('/2d/build?world=12345678-1234-4234-8234-123456789abc&share=1')
  vi.unstubAllGlobals()
})
