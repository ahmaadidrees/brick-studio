// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createBrickStudioDocument, parseBrickStudioDocument } from './brickDocument'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from './documentPersistence'
import PublishedWorldPage from './PublishedWorldPage'

vi.mock('./BrickStudioApp', () => ({ default: ({ publishedWorld, onRemix }: { publishedWorld?: unknown; onRemix?: () => void }) => publishedWorld
  ? <button onClick={onRemix}>Remix this world</button> : <p>Guest editor</p> }))
vi.mock('./publishedWorlds', () => ({ loadPublishedWorld: vi.fn(async () => ({ title: 'Legacy world', document: createBrickStudioDocument([]) })) }))

beforeEach(() => {
  const entries = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: (key: string, value: string) => { entries.set(key, value) },
    removeItem: (key: string) => { entries.delete(key) },
  } })
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('requires explicit replacement of an existing guest draft and cancellation keeps it intact', async () => {
  window.localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, 'previous draft')
  render(<PublishedWorldPage />)
  fireEvent.click(await screen.findByText('Remix this world'))
  expect(screen.getByRole('dialog')).toBeTruthy()
  expect(window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBe('previous draft')
  fireEvent.click(screen.getByText('Cancel'))
  expect(window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toBe('previous draft')
  expect(screen.queryByText('Guest editor')).toBeNull()
})
it('recovers a legacy world into an empty guest draft without creating a race', async () => {
  render(<PublishedWorldPage />)
  fireEvent.click(await screen.findByText('Remix this world'))
  expect(screen.getByText('Guest editor')).toBeTruthy()
  expect(parseBrickStudioDocument(window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)! ).ok).toBe(true)
  expect(screen.queryByText('Start a race')).toBeNull()
})
it('keeps the legacy viewer open when local storage is blocked', async () => {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  render(<PublishedWorldPage />)
  fireEvent.click(await screen.findByText('Remix this world'))
  expect(screen.getByRole('alert').textContent).toContain('blocked local storage')
  expect(screen.getByText('Remix this world')).toBeTruthy()
})
it('replaces a draft only after confirmation and quarantines damaged prior content', async () => {
  window.localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, 'damaged but recoverable')
  render(<PublishedWorldPage />)
  fireEvent.click(await screen.findByText('Remix this world'))
  fireEvent.click(screen.getByText('Replace draft and remix'))
  expect(screen.getByText('Guest editor')).toBeTruthy()
  expect(parseBrickStudioDocument(window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)!).ok).toBe(true)
  expect(window.localStorage.getItem('brick-studio.recovery-project.v1')).toBe('damaged but recoverable')
})
