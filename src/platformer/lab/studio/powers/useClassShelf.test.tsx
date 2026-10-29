/**
 * The class shelf inside "+ Power" stays live: a teacher's OK shows up without closing the panel (Check again, and a
 * light check while the panel is open and on screen), and an answer meant for another account never shows.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ShelfItem, ShelfList } from '../../../../classroom/shelfClient'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { PowersBar } from '../screen/PowersBar'
import { SHELF_PICKER_REFRESH_MS, useClassShelf } from './useClassShelf'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

const classId = '33333333-3333-4333-8333-000000000001'
const student = (id: string, name: string) =>
  ({ status: 'student', user: { id }, classes: [{ id: classId }], displayName: name, signOut: async () => {}, switchAccount: async () => {} }) as never
const guest = { status: 'guest', signOut: async () => {}, switchAccount: async () => {} } as never
const row = (id: string, name: string, by: string, status: ShelfItem['status'], mine = false): ShelfItem =>
  ({ id, kind: 'power', name, what: '', by, mine, status, uses: 0, createdAt: '' })
const list = (items: ShelfItem[]): ShelfList => ({ items, needsReview: true, raceHeroes: 'shelf' })

/** A shelf API whose list answers from `items` (change it between calls), counting the calls. */
function liveShelf(items: ShelfItem[]) {
  const state = { items, lists: 0 }
  const api = {
    list: async () => { state.lists++; return list(state.items) },
    get: async () => { throw new Error('not used') },
    share: async () => { throw new Error('not used') },
    review: async () => { throw new Error('not used') },
    remove: async () => ({ removed: true as const }),
    used: async () => ({ uses: 1 }),
  }
  return { api: api as never, state }
}

function openPanel(api: never, session: never) {
  const store = new StudioStore(createStarterProject())
  render(<PowersBar store={store} brick={store.brick('brick_hero')!} shelfApi={api} session={session} />)
  fireEvent.click(screen.getByRole('button', { name: 'Power' }))
  return screen.getByRole('dialog', { name: 'Snap a power onto Hero' })
}

describe('the class shelf in "+ Power" stays live', () => {
  it('Check again shows the teacher\'s OK without closing the panel', async () => {
    const { api, state } = liveShelf([row('i2', 'My dash', 'Ana K.', 'pending', true)])
    const panel = openPanel(api, student('u-ana', 'Ana K.'))
    expect(await within(panel).findByText('My dash: waiting for your teacher.')).toBeTruthy()
    state.items = [row('i2', 'My dash', 'Ana K.', 'approved', true)]
    fireEvent.click(within(panel).getByRole('button', { name: 'Check again' }))
    expect(await within(panel).findByRole('button', { name: /My dash.*from you/ })).toBeTruthy()
    expect(within(panel).queryByText(/waiting for your teacher/)).toBeNull()
  })

  it('checks by itself while the panel is open and on screen; not when hidden, and not once closed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const { api, state } = liveShelf([])
    const panel = openPanel(api, student('u-ana', 'Ana K.'))
    await waitFor(() => expect(state.lists).toBe(1))
    state.items = [row('i1', 'Moon jump', 'Sam R.', 'approved')]
    act(() => { vi.advanceTimersByTime(SHELF_PICKER_REFRESH_MS) })
    expect(await within(panel).findByRole('button', { name: /Moon jump/ })).toBeTruthy()
    expect(state.lists).toBe(2)

    visibility.mockReturnValue('hidden')
    act(() => { vi.advanceTimersByTime(SHELF_PICKER_REFRESH_MS * 3) })
    expect(state.lists).toBe(2)

    visibility.mockReturnValue('visible')
    fireEvent.click(within(panel).getByRole('button', { name: 'Close' }))
    act(() => { vi.advanceTimersByTime(SHELF_PICKER_REFRESH_MS * 3) })
    expect(state.lists).toBe(2)
  })
})

describe('answers meant for another account never show', () => {
  /** An API whose list calls wait until the test answers them, in any order. */
  function slowShelf() {
    const pending: Array<{ resolve: (l: ShelfList) => void }> = []
    const api = { list: () => new Promise<ShelfList>((resolve) => { pending.push({ resolve }) }) }
    return { api: api as never, pending }
  }

  it('a slow answer for Ana does not show after Ben signs in on the same device', async () => {
    const { api, pending } = slowShelf()
    const { result, rerender } = renderHook(({ session }) => useClassShelf(true, api, session), { initialProps: { session: student('u-ana', 'Ana K.') } })
    expect(pending).toHaveLength(1)
    rerender({ session: student('u-ben', 'Ben T.') })
    await waitFor(() => expect(pending).toHaveLength(2))
    expect(result.current.state.kind).toBe('loading')
    await act(async () => { pending[1].resolve(list([row('b1', 'Ben\'s own', 'Ben T.', 'pending', true)])) })
    await act(async () => { pending[0].resolve(list([row('a1', 'Ana\'s secret', 'Ana K.', 'pending', true)])) })
    const state = result.current.state
    expect(state.kind === 'ready' && state.shelf.items.map((i) => i.name)).toEqual(['Ben\'s own'])
  })

  it('a slow answer does not bring the shelf back after signing out', async () => {
    const { api, pending } = slowShelf()
    const { result, rerender } = renderHook(({ session }) => useClassShelf(true, api, session), { initialProps: { session: student('u-ana', 'Ana K.') as never } })
    rerender({ session: guest })
    expect(result.current.state.kind).toBe('signed-out')
    await act(async () => { pending[0].resolve(list([row('a1', 'Ana\'s secret', 'Ana K.', 'pending', true)])) })
    expect(result.current.state.kind).toBe('signed-out')
    // Signing back in as someone else shows their shelf only once it loads.
    rerender({ session: student('u-ben', 'Ben T.') })
    expect(result.current.state.kind).toBe('loading')
  })
})
