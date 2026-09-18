import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorldsPage from './WorldsPage'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../../brick/localProjectKeys'
import { createFakeWorldsClient, FIXTURE_CLASS, studentSession, teacherSession } from './worldsFixtures'
import type { WorldsClient } from './worldsData'

afterEach(() => { cleanup(); window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const navigate = vi.fn()

function draw(client: WorldsClient = createFakeWorldsClient(), extra: Partial<Parameters<typeof WorldsPage>[0]> = {}) {
  return render(<WorldsPage client={client} navigate={navigate} {...extra} />)
}

const settled = () => waitFor(() => expect(screen.queryByText(/Loading your worlds/)).not.toBeInTheDocument())

/** A build sitting in this browser, written the way the editor writes it. */
function seedDraft(bricks = 3) {
  window.localStorage.setItem(BRICK_STUDIO_LOCAL_STORAGE_KEY, JSON.stringify({
    schemaVersion: 2, partLibraryVersion: 1, environmentId: 'toy-room', customParts: [],
    bricks: Array.from({ length: bricks }, (_, index) => ({ id: `b${index}` })),
  }))
}

describe('student', () => {
  it('lists the account worlds with their sharing state and an Open link into the editor', async () => {
    draw()
    await settled()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My worlds')
    expect(screen.getByText('3 worlds saved to your account')).toBeInTheDocument()

    const card = screen.getByRole('article', { name: 'Lava Maze' })
    expect(within(card).getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/build?world=world-ava-lava')
    expect(within(card).getByText(/Shared · build together/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Sharing…' })).toBeInTheDocument()

    // canEdit is caller-scoped (an owner is always true); the chip reads classCanEdit.
    expect(within(screen.getByRole('article', { name: 'Rainbow Rocket' })).getByText(/Shared · look only/)).toBeInTheDocument()

    const priv = screen.getByRole('article', { name: 'Treehouse Hideout' })
    expect(within(priv).getByRole('button', { name: 'Share with my class' })).toBeInTheDocument()
    expect(within(priv).queryByText(/Shared ·/)).not.toBeInTheDocument()
  })

  it('offers the rail with counts and switches to the class section', async () => {
    draw()
    await settled()

    const rail = screen.getByRole('navigation', { name: 'Worlds sections' })
    expect(within(rail).getByRole('button', { name: /^Mine/ })).toHaveTextContent('3')
    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(FIXTURE_CLASS.name)
    const shared = screen.getByRole('region', { name: 'Shared by classmates' })
    const mate = within(shared).getByRole('article', { name: 'Sky Bridge' })
    expect(within(mate).getByText('Ben K.')).toBeInTheDocument()
    expect(within(mate).getByText(/Build together/)).toBeInTheDocument()
    // Joining a classmate's world goes through the live room; the Worker decides viewer or editor there.
    expect(within(mate).getByRole('link', { name: /Join/ })).toHaveAttribute('href', '/live/worldbenskybridge')
    expect(within(mate).getByRole('link', { name: /Visit/ })).toHaveAttribute('href', '/live/worldbenskybridge')

    const lookOnly = within(shared).getByRole('article', { name: 'Crystal Castle' })
    expect(within(lookOnly).getByText(/Look only/)).toBeInTheDocument()
    expect(within(lookOnly).queryByRole('link', { name: /Join/ })).not.toBeInTheDocument()

    const teacherWorlds = screen.getByRole('region', { name: 'Teacher’s worlds' })
    expect(within(teacherWorlds).getAllByRole('link', { name: /Join/ }).map(link => link.getAttribute('href'))).toEqual(['/live/worldclasstown', '/live/worldgroupbridge'])
    expect(within(teacherWorlds).getByRole('article', { name: 'Our Town' })).toBeInTheDocument()
  })

  it('shows the browser draft strip only when this browser holds a build', async () => {
    seedDraft(12)
    draw()
    await settled()

    const strip = screen.getByRole('region', { name: 'Build in progress' })
    expect(within(strip).getByText('Build in progress on this device')).toBeInTheDocument()
    expect(within(strip).getByText('This browser only · 12 bricks')).toBeInTheDocument()
    expect(within(strip).getByRole('link', { name: 'Continue building' })).toHaveAttribute('href', '/build')
    expect(within(strip).getByRole('link', { name: 'Save to my account' })).toHaveAttribute('href', '/build?classroom=save')
    // Reading the draft never writes the key back.
    expect(window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY)).toContain('"bricks"')
  })

  it('hides the draft strip when nothing is saved in this browser', async () => {
    draw()
    await settled()
    expect(screen.queryByRole('region', { name: 'Build in progress' })).not.toBeInTheDocument()
  })

  it('shares a world through the sheet, defaulting to look only', async () => {
    const client = createFakeWorldsClient()
    const setWorldSharing = vi.spyOn(client, 'setWorldSharing')
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).getByRole('button', { name: 'Share with my class' }))
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('heading', { level: 2 })).toHaveTextContent(`Share “Treehouse Hideout” with ${FIXTURE_CLASS.name}`)
    expect(within(sheet).getByRole('radio', { name: /Classmates can look/ })).toBeChecked()
    expect(within(sheet).getByText(/teacher can see this world and can hide it/)).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('radio', { name: /Classmates can build with me/ }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Share' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(setWorldSharing).toHaveBeenCalledWith('world-ava-treehouse', { visibility: 'class', canEdit: true })
    expect(screen.getByRole('status')).toHaveTextContent('shared with your class')
    expect(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).getByText(/Shared · build together/)).toBeInTheDocument()
  })

  it('reopens the sheet on a shared world and can stop sharing', async () => {
    const client = createFakeWorldsClient()
    const setWorldSharing = vi.spyOn(client, 'setWorldSharing')
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('article', { name: 'Lava Maze' })).getByRole('button', { name: 'Sharing…' }))
    expect(within(screen.getByRole('dialog')).getByRole('radio', { name: /build with me/ })).toBeChecked()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop sharing' }))

    await waitFor(() => expect(setWorldSharing).toHaveBeenCalledWith('world-ava-lava', { visibility: 'private', canEdit: false }))
    expect(await screen.findByText(/is private again/)).toBeInTheDocument()
  })

  it('copies a classmate world and shows it under Mine', async () => {
    const client = createFakeWorldsClient()
    const copyWorld = vi.spyOn(client, 'copyWorld')
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    fireEvent.click(within(screen.getByRole('article', { name: 'Crystal Castle' })).getByRole('button', { name: 'Make my own copy' }))

    await waitFor(() => expect(copyWorld).toHaveBeenCalledWith('world-chloe-castle'))
    expect(await screen.findByRole('article', { name: 'Crystal Castle (copy)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My worlds')
  })

  it('renames a world from the card menu', async () => {
    const client = createFakeWorldsClient()
    draw(client)
    await settled()

    fireEvent.click(screen.getByRole('button', { name: 'More for Rainbow Rocket' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const field = within(screen.getByRole('dialog')).getByLabelText('World name')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.change(field, { target: { value: 'Rainbow Rocket 2.0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))

    expect(await screen.findByRole('article', { name: 'Rainbow Rocket 2.0' })).toBeInTheDocument()
  })

  it('drops the share button when the teacher turned class sharing off', async () => {
    draw(createFakeWorldsClient({ classes: [{ ...FIXTURE_CLASS, studentsCanShare: false }] }))
    await settled()

    expect(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).queryByRole('button', { name: 'Share with my class' })).not.toBeInTheDocument()
    // A world that is already shared keeps its way back out.
    expect(within(screen.getByRole('article', { name: 'Rainbow Rocket' })).getByRole('button', { name: 'Sharing…' })).toBeInTheDocument()
  })

  it('explains a closed class instead of showing class cards', async () => {
    draw(createFakeWorldsClient({ classes: [{ ...FIXTURE_CLASS, collaborationOpen: false }] }))
    await settled()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(screen.getByText('Mr. Idrees closed collaboration. Class worlds come back when it reopens.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Shared by classmates' })).not.toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Sky Bridge' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Search worlds')).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: /Period 3 Makers/ })).toHaveTextContent('0')
  })

  it('falls back to "Your teacher" when the class carries no teacher name', async () => {
    draw(createFakeWorldsClient({ classes: [{ ...FIXTURE_CLASS, collaborationOpen: false, teacherName: null }] }))
    await settled()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(screen.getByText('Your teacher closed collaboration. Class worlds come back when it reopens.')).toBeInTheDocument()
  })

  it('offers an empty state to a brand new account', async () => {
    draw(createFakeWorldsClient({ worlds: [] }))
    await settled()
    const main = screen.getByRole('main')
    expect(within(main).getByText('Your first world starts here.')).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Open the studio' })).toHaveAttribute('href', '/build')
  })
})

describe('teacher', () => {
  it('shows classes in the rail, a New class link and the start-a-shared-world form', async () => {
    const client = createFakeWorldsClient({ session: teacherSession })
    const createSharedWorld = vi.spyOn(client, 'createSharedWorld')
    draw(client)
    await settled()

    const rail = screen.getByRole('navigation', { name: 'Worlds sections' })
    expect(within(rail).getByRole('button', { name: /^My worlds/ })).toBeInTheDocument()
    expect(within(rail).getByRole('link', { name: /New class/ })).toHaveAttribute('href', '/class')

    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    fireEvent.change(screen.getByLabelText('Shared world name'), { target: { value: 'Market day' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start world' }))

    await waitFor(() => expect(createSharedWorld).toHaveBeenCalledWith(FIXTURE_CLASS.id, 'Market day', 'class'))
    expect(screen.getByRole('region', { name: 'Shared by students' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Sky Bridge' })).getByRole('button', { name: 'Hide from class' })).toBeInTheDocument()
  })

  it('hides a student world from the class', async () => {
    const client = createFakeWorldsClient({ session: teacherSession })
    const setWorldHidden = vi.spyOn(client, 'setWorldHidden')
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    fireEvent.click(within(screen.getByRole('article', { name: 'Crystal Castle' })).getByRole('button', { name: 'Hide from class' }))

    await waitFor(() => expect(setWorldHidden).toHaveBeenCalledWith('world-chloe-castle', true))
    expect(await screen.findByText(/is hidden from the class/)).toBeInTheDocument()
  })
})

describe('session and layout', () => {
  it('sends a signed-out visitor to sign-in and back to /worlds', async () => {
    draw(createFakeWorldsClient({ session: null }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/join?mode=signin&next=%2Fworlds'))
    expect(screen.getByRole('status')).toHaveTextContent('Taking you to sign in…')
  })

  it('opens the class section for ?view=class and own worlds otherwise', async () => {
    draw(createFakeWorldsClient(), { view: 'class' })
    await settled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(FIXTURE_CLASS.name)

    cleanup()
    draw(createFakeWorldsClient(), { view: 'mine' })
    await settled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My worlds')
  })

  it('reads the view from the URL when nothing is passed', async () => {
    window.history.replaceState(null, '', '/worlds?view=class')
    try {
      draw()
      await settled()
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(FIXTURE_CLASS.name)
    } finally { window.history.replaceState(null, '', '/') }
  })

  it('keeps the account chip and studio link in the header', async () => {
    draw()
    await settled()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'Open the studio' })).toHaveAttribute('href', '/build')
    expect(within(header).getByRole('button', { name: /Ava R\./ })).toHaveTextContent(FIXTURE_CLASS.name)
  })

  it('replaces the rail with a tab row at 1024 and narrower', async () => {
    const listeners = new Set<() => void>()
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query === '(max-width: 1024px)',
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: () => void) => { listeners.add(listener) },
      removeEventListener: (_: string, listener: () => void) => { listeners.delete(listener) },
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    } as unknown as MediaQueryList))

    draw()
    await settled()
    const nav = screen.getByRole('navigation', { name: 'Worlds sections' })
    expect(nav).toHaveClass('worlds-tabs')
    expect(nav).not.toHaveClass('worlds-rail')
    expect(within(nav).getByRole('button', { name: /^Mine/ })).toBeInTheDocument()
  })

  it('signs the account out through the header menu', async () => {
    const client = createFakeWorldsClient()
    const signOut = vi.spyOn(client, 'signOut')
    draw(client)
    await settled()

    fireEvent.click(screen.getByRole('button', { name: /Ava R\./ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })
})

describe('search', () => {
  it('filters the account worlds by name', async () => {
    draw()
    await settled()

    fireEvent.change(screen.getByLabelText('Search worlds'), { target: { value: 'lava' } })
    expect(screen.getByRole('article', { name: 'Lava Maze' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Treehouse Hideout' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search worlds'), { target: { value: '' } })
    expect(screen.getByRole('article', { name: 'Treehouse Hideout' })).toBeInTheDocument()
  })
})

describe('session identity', () => {
  it('uses first name and last initial for the signed-in student', async () => {
    draw()
    await settled()
    expect(studentSession.user.rosterName).toBe('Ava Rivera')
    expect(screen.getByRole('banner')).toHaveTextContent('Ava R.')
  })
})
