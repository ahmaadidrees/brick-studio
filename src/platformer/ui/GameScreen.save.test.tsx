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

const state = vi.hoisted(() => ({ session: null as null | { editCount: number; setCharacter: ReturnType<typeof vi.fn> }, create: vi.fn(), flush: vi.fn(), characterOption: '' }))
vi.mock('./cloudLevel', () => ({ createCloudLevel: state.create, CloudLevelSaver: class { world; flush = state.flush; constructor(world: unknown) { this.world = world } } }))
vi.mock('../../classroom/client', () => ({ browserClassroomClient: { listClassmates: vi.fn().mockResolvedValue([]) } }))
vi.mock('../../shell', () => ({
  useClassroomSession: () => ({ status: 'student', user: { id: 'student' }, classes: [] }),
  useCompactLayout: () => false,
  AppHeader: (p: { saveStatus: { source: { error?: string } }; worldMenu: (m: { openRename: () => void }) => ReactNode; onOpenWorldSetup: (tab: 'environment' | 'character') => void; onStartLiveWorld?: () => void }) => (
    <div>
      <span>{p.saveStatus.source.error}</span>
      <button className="app-header-tool" onClick={() => p.onOpenWorldSetup('character')}>Character</button>
      {p.onStartLiveWorld && <button onClick={p.onStartLiveWorld}>People action</button>}
      {p.worldMenu({ openRename() {} })}
    </div>
  ),
}))
vi.mock('./LevelMenu', () => ({ LevelMenu: (p: { onExit: () => void }) => <button onClick={p.onExit}>Leave test world</button> }))
vi.mock('./BuildShell', () => ({ BuildShell: () => null }))
vi.mock('./PeopleSheet', () => ({ PeopleSheet: () => null }))
vi.mock('../../classroom/InviteSheet', () => ({ InviteSheet: () => <div role="dialog" aria-label="Share with classmates" /> }))
vi.mock('./SceneSheet', () => ({ SceneSheet: () => null }))
vi.mock('./Menu', () => ({ Menu: () => null }))
vi.mock('../game/session', () => ({
  GameSession: class {
    timeline: { world: { design: LevelDesign } }
    editCount = 0
    room = null
    solo = true
    canBuild = true
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
  expect(assign).toHaveBeenCalledWith('/2d/w/12345678123442348234123456789abc?invited=1')
})

it('asks a student to choose sharing before opening a private saved world with classmates', async () => {
  render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'cloud', world: savedWorld('private') }} startMode="build" onExit={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'People action' }))
  expect(screen.getByRole('dialog', { name: 'Share with classmates' })).toBeInTheDocument()
  expect(state.create).not.toHaveBeenCalled()
  expect(state.flush).not.toHaveBeenCalled()
})
