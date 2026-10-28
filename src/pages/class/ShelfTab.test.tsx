import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ClassroomAuthResult, ClassroomClass } from '../../classroom/contracts'
import type { ShelfItem } from '../../classroom/shelfClient'
import ClassPage from './ClassPage'
import type { ClassPageClient } from './classPageData'

vi.mock('qrcode', () => ({ toDataURL: vi.fn(async () => 'data:image/png;base64,AA==') }))
afterEach(() => { cleanup(); window.localStorage.clear() })

const session: ClassroomAuthResult = {
  user: { id: 'teacher-1', username: 'mrsdiaz', rosterName: 'Ana Diaz', role: 'teacher', resetRequired: false },
  classes: [],
  session: { accessToken: 'a', refreshToken: 'r', expiresIn: 60 },
}

const CLASS = { id: 'class-1', name: 'Room 12 Builders', code: 'BRICK7', loginCode: 'BRICK7', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: null, teacherName: null, shelfNeedsReview: true, raceHeroes: 'shelf' as const }
const item = (id: string, name: string, by: string, status: ShelfItem['status'], uses = 0): ShelfItem =>
  ({ id, kind: 'power', name, what: `${name} for any brick.`, by, mine: false, status, uses, createdAt: '2026-10-27T10:00:00.000Z' })
const PAYLOAD = { kind: 'brickgineers-power', version: 1, name: 'Double jump', fits: 'brick', blocks: [{ type: 'a' }, { type: 'b' }, { type: 'c' }], variables: [{ id: 'v1', name: 'jumps' }], credits: ['Brickgineers', 'Ava M.'] }

type Call = [string, string, unknown?]

/** A fake page client whose `request` answers the class list and the shelf routes from memory. */
function shelfClient({ failList = false } = {}) {
  const calls: Call[] = []
  let cls: ClassroomClass = { ...CLASS }
  let items = [item('p1', 'Double jump', 'Ava M.', 'pending'), item('a1', 'Coin magnet', 'Ben T.', 'approved', 3), item('h1', 'Spin forever', 'Chloe R.', 'hidden')]
  const request = vi.fn(async (path: string, method = 'GET', body?: unknown) => {
    calls.push([path, method, body])
    if (path === '/classes' && method === 'GET') return { classes: [cls] }
    if (path === '/classes/class-1' && method === 'PATCH') { cls = { ...cls, ...(body as object) }; return { class: cls } }
    if (path === '/worlds') return { worlds: [] }
    if (path.endsWith('/students')) return { students: [] }
    if (path === '/classes/class-1/shelf' && method === 'GET') {
      if (failList) throw new Error('The shelf is not reachable right now.')
      return { items, needsReview: cls.shelfNeedsReview, raceHeroes: cls.raceHeroes }
    }
    const one = /^\/classes\/class-1\/shelf\/([^/]+)$/.exec(path)
    if (one) {
      const found = items.find(row => row.id === one[1])!
      if (method === 'GET') return { item: { ...found, payload: PAYLOAD } }
      if (method === 'PATCH') { const updated = { ...found, status: (body as { status: ShelfItem['status'] }).status }; items = items.map(row => row.id === found.id ? updated : row); return { item: updated } }
      if (method === 'DELETE') { items = items.filter(row => row.id !== found.id); return { removed: true } }
    }
    return {}
  })
  const client: ClassPageClient = { getSession: () => session, subscribe: () => () => {}, signOut: vi.fn(async () => {}), request: request as unknown as ClassPageClient['request'] }
  return { client, calls }
}

async function openShelf(client: ClassPageClient) {
  render(<ClassPage client={client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Shelf' }))
  return screen.findByRole('list', { name: 'Bricks waiting for you' })
}

const card = (list: HTMLElement, name: string) => within(list).getByText(name).closest('li')!

it('lists what waits, what is on the shelf and what is hidden, with names only as first name and last initial', async () => {
  const { client } = shelfClient()
  const waiting = await openShelf(client)
  expect(within(card(waiting, 'Double jump')).getByText('by Ava M.')).toBeInTheDocument()
  expect(within(card(waiting, 'Double jump')).getByText('Double jump for any brick.')).toBeInTheDocument()
  const shelf = screen.getByRole('list', { name: 'Bricks on the shelf' })
  expect(within(card(shelf, 'Coin magnet')).getByText(/Used by 3 classmates/)).toBeInTheDocument()
  expect(within(screen.getByRole('list', { name: 'Hidden bricks' })).getByText('Spin forever')).toBeInTheDocument()
  expect(screen.queryByText(/mrsdiaz/)).not.toBeInTheDocument()
})

it('puts a waiting brick on the shelf', async () => {
  const { client, calls } = shelfClient()
  const waiting = await openShelf(client)
  fireEvent.click(within(card(waiting, 'Double jump')).getByRole('button', { name: 'Put on shelf' }))
  await waitFor(() => expect(within(screen.getByRole('list', { name: 'Bricks on the shelf' })).getByText('Double jump')).toBeInTheDocument())
  expect(calls).toContainEqual(['/classes/class-1/shelf/p1', 'PATCH', { status: 'approved' }])
  expect(screen.queryByRole('list', { name: 'Bricks waiting for you' })).not.toBeInTheDocument()
  expect(screen.getByText(/Nothing waiting/)).toBeInTheDocument()
  expect(screen.getByText('“Double jump” is on the shelf. The class can use it now.')).toBeInTheDocument()
})

it('"Not now" hides a waiting brick', async () => {
  const { client, calls } = shelfClient()
  const waiting = await openShelf(client)
  fireEvent.click(within(card(waiting, 'Double jump')).getByRole('button', { name: 'Not now' }))
  await waitFor(() => expect(within(screen.getByRole('list', { name: 'Hidden bricks' })).getByText('Double jump')).toBeInTheDocument())
  expect(calls).toContainEqual(['/classes/class-1/shelf/p1', 'PATCH', { status: 'hidden' }])
})

it('peeks at a brick: how many scripts, its variables and who made it', async () => {
  const { client, calls } = shelfClient()
  const waiting = await openShelf(client)
  const peek = within(card(waiting, 'Double jump')).getByRole('button', { name: 'Peek' })
  expect(peek).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(peek)
  await waitFor(() => expect(within(card(waiting, 'Double jump')).getByText('3 scripts')).toBeInTheDocument())
  expect(within(card(waiting, 'Double jump')).getByText('jumps')).toBeInTheDocument()
  expect(within(card(waiting, 'Double jump')).getByText('Brickgineers → Ava M.')).toBeInTheDocument()
  expect(calls).toContainEqual(['/classes/class-1/shelf/p1', 'GET', undefined])
  expect(within(card(waiting, 'Double jump')).getByRole('button', { name: 'Close peek' })).toHaveAttribute('aria-expanded', 'true')
})

it('hides a brick on the shelf, puts it back, and deletes a hidden one only after confirming', async () => {
  const { client, calls } = shelfClient()
  await openShelf(client)
  fireEvent.click(within(card(screen.getByRole('list', { name: 'Bricks on the shelf' }), 'Coin magnet')).getByRole('button', { name: 'Hide' }))
  await waitFor(() => expect(calls).toContainEqual(['/classes/class-1/shelf/a1', 'PATCH', { status: 'hidden' }]))
  const hidden = await screen.findByRole('list', { name: 'Hidden bricks' })
  await waitFor(() => expect(within(hidden).getByText('Coin magnet')).toBeInTheDocument())

  fireEvent.click(within(card(hidden, 'Coin magnet')).getByRole('button', { name: 'Put back' }))
  await waitFor(() => expect(calls).toContainEqual(['/classes/class-1/shelf/a1', 'PATCH', { status: 'approved' }]))

  fireEvent.click(await within(card(screen.getByRole('list', { name: 'Hidden bricks' }), 'Spin forever')).findByRole('button', { name: 'Delete' }))
  expect(await screen.findByRole('dialog', { name: 'Delete “Spin forever”?' })).toBeInTheDocument()
  expect(calls.some(call => call[1] === 'DELETE')).toBe(false)
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(calls).toContainEqual(['/classes/class-1/shelf/h1', 'DELETE', undefined]))
  await waitFor(() => expect(screen.queryByText('Spin forever')).not.toBeInTheDocument())
})

it('saves the check-first switch and the race rule as class patches and shows what the server returns', async () => {
  const { client, calls } = shelfClient()
  await openShelf(client)
  const toggle = screen.getByRole('switch', { name: 'Check bricks before the class sees them' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(toggle)
  await waitFor(() => expect(calls).toContainEqual(['/classes/class-1', 'PATCH', { shelfNeedsReview: false }]))
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Check bricks before the class sees them' })).toHaveAttribute('aria-checked', 'false'))

  const group = screen.getByRole('group', { name: 'Which Heroes can race?' })
  expect(within(group).getByRole('radio', { name: 'Built-in and class shelf' })).toBeChecked()
  expect(within(group).getByRole('radio', { name: 'Built-in Heroes only' })).toHaveAccessibleDescription('Everyone races with the Heroes that come with Brickgineers.')
  fireEvent.click(within(group).getByRole('radio', { name: 'Built-in Heroes only' }))
  await waitFor(() => expect(calls).toContainEqual(['/classes/class-1', 'PATCH', { raceHeroes: 'builtin' }]))
  await waitFor(() => expect(within(group).getByRole('radio', { name: 'Built-in Heroes only' })).toBeChecked())
  fireEvent.click(within(group).getByRole('radio', { name: 'Anything' }))
  await waitFor(() => expect(calls).toContainEqual(['/classes/class-1', 'PATCH', { raceHeroes: 'any' }]))
  expect(screen.getByText('Code Lab levels can’t race yet; this is the rule they’ll follow when they can.')).toBeInTheDocument()
})

it('shows a failed shelf load as the page error with a way to try again', async () => {
  const { client } = shelfClient({ failList: true })
  render(<ClassPage client={client} navigate={vi.fn()} />)
  fireEvent.click(await screen.findByRole('radio', { name: 'Shelf' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The shelf is not reachable right now.')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
})
