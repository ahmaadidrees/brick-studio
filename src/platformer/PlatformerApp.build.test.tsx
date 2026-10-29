/*
 * /2d/build when the level it names cannot be opened: a ?draft= that is not in this browser or cannot be read, and an
 * account level this app cannot read. Each says so (no silent blank level, no redirect loop) and keeps the kid's work.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBlankLevel, levelToJson } from '@brick-studio/platformer-core/engine/level'
import PlatformerApp from './PlatformerApp'
import { saveDraft } from './ui/drafts'

const state = vi.hoisted(() => ({ signedIn: false, request: vi.fn(), listWorlds: vi.fn(), download: vi.fn() }))
vi.mock('../shell', () => ({ useClassroomSession: () => ({ status: state.signedIn ? 'student' : 'guest' }), AppHeader: () => null, currentPath: () => window.location.pathname + window.location.search, goToJoin: vi.fn() }))
vi.mock('../classroom/client', () => ({
  browserClassroomClient: { getSession: () => (state.signedIn ? { user: { id: 'me' } } : null), request: state.request, listWorlds: state.listWorlds },
  ClassroomError: class extends Error {},
}))
vi.mock('./ui/GameScreen', () => ({ GameScreen: ({ source, level }: { source: { kind: string; id?: string }; level: { title: string } }) => <div>Game: {source.kind} {source.id ?? ''} “{level.title}”</div> }))
vi.mock('./ui/unreadableFile', async (actual) => ({ ...await actual<typeof import('./ui/unreadableFile')>(), downloadUnreadable: state.download }))

const KEY = 'brick-studio.2d.drafts.v1'
const replace = vi.fn()
beforeEach(() => {
  // Redirects are recorded, not followed (jsdom cannot navigate); the address itself is the real one.
  const real = window.location
  vi.stubGlobal('location', {
    get pathname() { return real.pathname },
    get search() { return real.search },
    get hash() { return real.hash },
    get href() { return real.href },
    get origin() { return real.origin },
    replace,
    assign: vi.fn(),
    reload: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  replace.mockReset()
  state.signedIn = false
  state.request.mockReset()
  state.listWorlds.mockReset()
  state.download.mockReset()
  localStorage.clear()
})

const at = (url: string) => {
  window.history.replaceState(null, '', url)
  return render(<PlatformerApp />)
}

it('opens a readable draft', async () => {
  const saved = saveDraft(null, createBlankLevel(40, 20, 'Lava run'))
  if (!saved.ok) throw new Error('not saved')
  at(`/2d/build?draft=${saved.id}`)
  expect(await screen.findByText(`Game: draft ${saved.id} “Lava run”`)).toBeInTheDocument()
})

it('says a draft is not on this computer instead of opening a blank level', async () => {
  saveDraft(null, createBlankLevel(40, 20, 'Another one'))
  at('/2d/build?draft=dgone123')
  expect(await screen.findByRole('heading', { name: 'That project isn’t on this computer' })).toBeInTheDocument()
  expect(screen.queryByText(/^Game:/)).toBeNull()
  expect(screen.getByRole('link', { name: 'My projects' })).toHaveAttribute('href', '/projects')
})

it('says a stored draft cannot be read, keeps it, and offers to save it to a file', async () => {
  const saved = saveDraft(null, createBlankLevel(40, 20, 'From the future'))
  if (!saved.ok) throw new Error('not saved')
  const stored = JSON.parse(localStorage.getItem(KEY)!) as { level: unknown }[]
  stored[0].level = { v: 9, title: 'From the future' }
  localStorage.setItem(KEY, JSON.stringify(stored))
  at(`/2d/build?draft=${saved.id}`)
  expect(await screen.findByRole('heading', { name: 'This project could not be opened' })).toBeInTheDocument()
  expect(screen.queryByText(/^Game:/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save it to a file' }))
  expect(state.download).toHaveBeenCalledWith(expect.objectContaining({ name: 'from-the-future.brickgineers' }))
  expect(JSON.parse(state.download.mock.calls[0][0].text).document.level).toEqual({ v: 9, title: 'From the future' })
  expect(localStorage.getItem(KEY)).toBe(JSON.stringify(stored))
})

it('skips an unreadable newest draft when reopening the latest level', async () => {
  const older = saveDraft(null, createBlankLevel(40, 20, 'Older'))
  const newer = saveDraft(null, createBlankLevel(40, 20, 'Newer'))
  if (!older.ok || !newer.ok) throw new Error('not saved')
  const stored = JSON.parse(localStorage.getItem(KEY)!) as { id: string; level: unknown }[]
  stored.find((d) => d.id === newer.id)!.level = { v: 9 }
  localStorage.setItem(KEY, JSON.stringify(stored))
  at('/2d/build')
  expect(await screen.findByText(`Game: draft ${older.id} “Older”`)).toBeInTheDocument()
})

const WORLD_ID = '12345678-1234-4234-8234-123456789abc'
const world = (document: unknown, format?: string) => ({ world: { id: WORLD_ID, title: 'Speedway', format, canEdit: true, document } })

it('shows a problem card for an account level this app cannot read, instead of bouncing to the 3D builder', async () => {
  state.signedIn = true
  const document = { format: 'brickgineers-2d', version: 2, level: { v: 2 } }
  state.request.mockResolvedValue(world(document, '2d'))
  at(`/2d/build?world=${WORLD_ID}`)
  expect(await screen.findByRole('heading', { name: 'This project could not be opened' })).toBeInTheDocument()
  expect(replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Save it to a file' }))
  expect(JSON.parse(state.download.mock.calls[0][0].text)).toMatchObject({ title: 'Speedway', document })
})

it('still sends a 3D build to the 3D builder and a Hackable one to its own page', async () => {
  state.signedIn = true
  state.request.mockResolvedValue(world({ schemaVersion: 1, bricks: [] }, 'brick'))
  const view = at(`/2d/build?world=${WORLD_ID}`)
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/build?world=${WORLD_ID}`))
  view.unmount()
  state.request.mockResolvedValue(world({ format: 'brickgineers-hackable', version: 1, save: {} }, 'hackable'))
  at(`/2d/build?world=${WORLD_ID}`)
  await vi.waitFor(() => expect(replace).toHaveBeenCalledWith(`/2d/hackable?world=${WORLD_ID}`))
})

it('opens a readable account level', async () => {
  state.signedIn = true
  state.request.mockResolvedValue(world({ format: 'brickgineers-2d', version: 1, level: levelToJson(createBlankLevel(40, 20, 'Speedway')) }, '2d'))
  at(`/2d/build?world=${WORLD_ID}`)
  expect(await screen.findByText('Game: cloud “Speedway”')).toBeInTheDocument()
})
