import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { designText } from '../core/save'
import { createStarter3dProject } from '../studio/three/project3d'
import { createRaceStarterProject } from '../studio/race/raceProject'
import { createStarterProject } from '../studio/starter'
import { ROOMS_3D_SOON, roomRefusal } from './studioRoom'
import RoomPage from './RoomPage'

/* Hackable 3D rooms are D3: a room address opened on a 3D project refuses politely instead of breaking. */

const rooms = vi.hoisted(() => ({ design: null as unknown, closed: 0, connected: 0 }))

vi.mock('./session', () => ({
  RoomSession: class {
    view = { status: 'connecting', title: '', me: 1, host: false, players: [], settings: { closed: false }, banned: 0, classroom: true, notice: null, generation: 0 }
    get runtime() { return { world: { design: rooms.design } } }
    connect() { rooms.connected++ }
    close() { rooms.closed++ }
    onRuntime() { return () => {} }
    subscribe() { return () => {} }
  },
}))
vi.mock('../../../shell', async (orig) => ({
  ...(await orig<typeof import('../../../shell')>()),
  AppHeader: () => <header />,
  useClassroomSession: () => ({ status: 'student', displayName: 'Ben K.' }),
}))

afterEach(() => { cleanup(); rooms.closed = 0; rooms.connected = 0 })

it('only Hackable 3D is refused a room', () => {
  expect(roomRefusal(createStarter3dProject().design)).toBe('Playing Hackable 3D together is coming soon.')
  expect(roomRefusal(createStarterProject().design)).toBeNull()
  expect(roomRefusal(createRaceStarterProject().design)).toBeNull()
})

it('a room’s 3D game still builds, so the page gets its design and can refuse it (never a page stuck joining)', async () => {
  const { gameFromBase } = await vi.importActual<typeof import('./game')>('./game')
  const runtime = gameFromBase({ project: designText(createStarter3dProject().design), tick: 0 } as Parameters<typeof gameFromBase>[0])
  expect(runtime.world.design?.kit).toBe('3d')
})

it('a class room opened on a Hackable 3D project says it is coming soon, leaves the room, and offers to open the project', async () => {
  rooms.design = createStarter3dProject().design
  render(<RoomPage route={{ kind: 'classroom', worldId: '33333333-3333-4333-8333-000000000001' }} />)
  expect(await screen.findByRole('heading', { name: ROOMS_3D_SOON })).toBeInTheDocument()
  expect(rooms.closed).toBeGreaterThan(0)
  expect(screen.getByRole('link', { name: 'Open it' })).toHaveAttribute('href', '/3d/hackable?world=33333333-3333-4333-8333-000000000001')
  expect(screen.getByRole('link', { name: 'My projects' })).toHaveAttribute('href', '/projects')
})
