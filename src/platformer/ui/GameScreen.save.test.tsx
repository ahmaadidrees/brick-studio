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

const state = vi.hoisted(() => ({ session: null as null | { editCount: number }, create: vi.fn() }))
vi.mock('./cloudLevel', () => ({ createCloudLevel: state.create, CloudLevelSaver: class {} }))
vi.mock('../../shell', () => ({
  useClassroomSession: () => ({ status: 'student', user: { id: 'student' }, classes: [] }),
  useCompactLayout: () => false,
  AppHeader: (p: { saveStatus: { source: { error?: string } }; worldMenu: (m: { openRename: () => void }) => ReactNode }) => (
    <div>
      <span>{p.saveStatus.source.error}</span>
      {p.worldMenu({ openRename() {} })}
    </div>
  ),
}))
vi.mock('./LevelMenu', () => ({ LevelMenu: (p: { onExit: () => void }) => <button onClick={p.onExit}>Leave test world</button> }))
vi.mock('./BuildShell', () => ({ BuildShell: () => null }))
vi.mock('./PeopleSheet', () => ({ PeopleSheet: () => null }))
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
    constructor(canvas: HTMLCanvasElement, level: LevelDesign) {
      this.timeline = { world: { design: level } }
      this.renderer = { canvas }
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
  localStorage.clear()
})

const browserFull = () => vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError') })
const open = (onExit = () => {}) => render(<GameScreen level={createBlankLevel(40, 20)} source={{ kind: 'new' }} startMode="build" onExit={onExit} />)

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
