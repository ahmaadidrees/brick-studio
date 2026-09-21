import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorldsPage from './WorldsPage'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../../brick/localProjectKeys'
import { createFakeWorldsClient, fixtureWorld, FIXTURE_CLASS, studentSession, teacherSession } from './worldsFixtures'
import { SEEN_INVITES_STORAGE_KEY } from '../../classroom/inviteSeen'
import type { InviteSheetProps } from '../../classroom/InviteSheet'
import { createWorldsClient, type WorldsClient } from './worldsData'
import type { ClassroomClient } from '../../classroom/client'
import { readRememberedTeacherClass, REMEMBERED_TEACHER_CLASS_KEY } from '../../shell'

/**
 * Lane A owns the sheet's insides; this page owns what happens after it answers. The stand-in
 * exposes the two answers the page cares about (build / look) plus Stop sharing, so these tests
 * never depend on the real sheet's markup.
 */
vi.mock('../../classroom/InviteSheet', () => ({
  InviteSheet: ({ world, className, classmates, classmatesError, busy, onInvite, onStopSharing, onClose }: InviteSheetProps) =>
    <div role="dialog" aria-label={`Invite to ${world.title}`}>
      <p>Sheet for {world.title} in {className}</p>
      <p>Roster: {classmatesError ? `error: ${classmatesError}` : classmates === null ? 'loading' : classmates.map(mate => mate.displayName).join(', ')}</p>
      <button type="button" disabled={busy} onClick={() => onInvite({ visibility: 'members', canEdit: true, members: ['student-ben'] })}>Invite Ben K. and build</button>
      <button type="button" disabled={busy} onClick={() => onInvite({ visibility: 'class', canEdit: false })}>Invite the class to look</button>
      {onStopSharing && <button type="button" disabled={busy} onClick={onStopSharing}>Stop sharing</button>}
      <button type="button" onClick={onClose}>Cancel</button>
    </div>,
}))

const REAL_LOCATION = window.location
const putLocation = (value: unknown) => Object.defineProperty(window, 'location', { configurable: true, writable: true, value })

afterEach(() => { cleanup(); putLocation(REAL_LOCATION); window.localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

/**
 * Inviting people to build leaves the page for the live room. jsdom refuses to navigate, so
 * `window.location` is swapped for a stand-in that records the call and is put back after the test.
 */
function captureAssign() {
  const assign = vi.fn()
  putLocation({ ...REAL_LOCATION, href: REAL_LOCATION.href, search: REAL_LOCATION.search, assign })
  return assign
}

/** Marks these world ids as already answered, the way "Not now" does. */
const seedSeen = (...ids: string[]) => window.localStorage.setItem(SEEN_INVITES_STORAGE_KEY, JSON.stringify(ids))

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
  it('lists the account worlds with their sharing state and the right primary button', async () => {
    draw()
    await settled()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('My worlds')
    expect(screen.getByText('3 worlds saved to your account')).toBeInTheDocument()

    // Shared for building: the world is a room, so the primary button walks into it.
    const card = screen.getByRole('article', { name: 'Lava Maze' })
    expect(within(card).getByRole('link', { name: /Build together/ })).toHaveAttribute('href', '/live/worldavalava')
    expect(within(card).queryByRole('link', { name: /^Open/ })).not.toBeInTheDocument()
    expect(within(card).getByText(/Shared · build together/)).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Who can join' })).toBeInTheDocument()

    // canEdit is caller-scoped (an owner is always true); the chip reads classCanEdit.
    const lookOnly = screen.getByRole('article', { name: 'Rainbow Rocket' })
    expect(within(lookOnly).getByText(/Shared · look only/)).toBeInTheDocument()
    expect(within(lookOnly).getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/build?world=world-ava-rocket')
    expect(within(lookOnly).getByRole('button', { name: 'Who can join' })).toBeInTheDocument()

    const priv = screen.getByRole('article', { name: 'Treehouse Hideout' })
    expect(within(priv).getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/build?world=world-ava-treehouse')
    expect(within(priv).getByRole('button', { name: 'Invite classmates' })).toBeInTheDocument()
    expect(within(priv).queryByRole('button', { name: 'Who can join' })).not.toBeInTheDocument()
    expect(within(priv).queryByText(/Shared ·/)).not.toBeInTheDocument()
  })

  it('asks the server for presence with the world list', async () => {
    const client = createFakeWorldsClient()
    const listWorlds = vi.spyOn(client, 'listWorlds')
    draw(client)
    await settled()
    expect(listWorlds).toHaveBeenCalledWith({ presence: true })
  })

  it('renders a card untouched when presence never came back', async () => {
    // Lane A fills buildingNow/buildingNames; without them the card falls back to the sharing chip.
    draw(createFakeWorldsClient({ worlds: [fixtureWorld({ id: 'w-1', title: 'Quiet Build', visibility: 'class', classCanEdit: true, sharedAt: '2026-09-17T10:00:00.000Z' })] }))
    await settled()
    const card = screen.getByRole('article', { name: 'Quiet Build' })
    expect(within(card).getByText(/Shared · build together/)).toBeInTheDocument()
    expect(within(card).queryByText(/is here/)).not.toBeInTheDocument()
  })

  it('names who is in the room and who was invited on an own shared card', async () => {
    draw(createFakeWorldsClient({ worlds: [fixtureWorld({
      id: 'w-party', title: 'Party Plate', visibility: 'members', classCanEdit: true, sharedAt: '2026-09-17T10:00:00.000Z',
      members: [{ id: 'student-ben', displayName: 'Ben K.' }, { id: 'student-chloe', displayName: 'Chloe M.' }, { id: 'student-diego', displayName: 'Diego S.' }, { id: 'student-emma', displayName: 'Emma L.' }, { id: 'student-finn', displayName: 'Finn O.' }],
      buildingNow: 3, buildingNames: ['Ben K.', 'Chloe M.', 'Diego S.'],
    })] }))
    await settled()

    const card = screen.getByRole('article', { name: 'Party Plate' })
    expect(within(card).getByText(/Ben K\. is here/)).toBeInTheDocument()
    expect(within(card).getByText(/Chloe M\. is here/)).toBeInTheDocument()
    expect(within(card).getByText('+1 more')).toBeInTheDocument()
    // The invited chips only name the classmates who have not arrived.
    expect(within(card).getByText(/Emma L\. invited/)).toBeInTheDocument()
    expect(within(card).getByText(/Finn O\. invited/)).toBeInTheDocument()
    expect(within(card).queryByText(/Diego S\. invited/)).not.toBeInTheDocument()
    expect(within(card).queryByText(/Shared ·/)).not.toBeInTheDocument()
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
    expect(within(mate).getByRole('link', { name: 'Join and build' })).toHaveAttribute('href', '/live/worldbenskybridge')
    expect(within(mate).getByRole('link', { name: /Visit/ })).toHaveAttribute('href', '/live/worldbenskybridge')

    const lookOnly = within(shared).getByRole('article', { name: 'Crystal Castle' })
    expect(within(lookOnly).getByText(/Look only/)).toBeInTheDocument()
    expect(within(lookOnly).queryByRole('link', { name: /Join and build/ })).not.toBeInTheDocument()

    const teacherWorlds = screen.getByRole('region', { name: 'Teacher’s worlds' })
    expect(within(teacherWorlds).getAllByRole('link', { name: /Join/ }).map(link => link.getAttribute('href'))).toEqual(['/live/worldclasstown', '/live/worldgroupbridge'])
    expect(within(teacherWorlds).getByRole('article', { name: 'Our Town' })).toBeInTheDocument()
  })

  it('offers New build at the top of the page, on every section', async () => {
    draw()
    await settled()

    const newBuild = screen.getByRole('link', { name: 'New build' })
    expect(newBuild).toHaveAttribute('href', '/build?new=1')
    expect(newBuild).toHaveClass('ui-button-primary')

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(screen.getByRole('link', { name: 'New build' })).toBeInTheDocument()
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

  it('invites the class to look and stays on the page', async () => {
    const client = createFakeWorldsClient()
    const setWorldSharing = vi.spyOn(client, 'setWorldSharing')
    const assign = captureAssign()
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).getByRole('button', { name: 'Invite classmates' }))
    const sheet = screen.getByRole('dialog', { name: 'Invite to Treehouse Hideout' })
    expect(within(sheet).getByText(`Sheet for Treehouse Hideout in ${FIXTURE_CLASS.name}`)).toBeInTheDocument()
    // A world nobody can see yet has no way out of sharing.
    expect(within(sheet).queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Invite the class to look' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(setWorldSharing).toHaveBeenCalledWith('world-ava-treehouse', { visibility: 'class', canEdit: false })
    expect(assign).not.toHaveBeenCalled()
    const card = screen.getByRole('article', { name: 'Treehouse Hideout' })
    expect(within(card).getByText(/Shared · look only/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/build?world=world-ava-treehouse')
    expect(within(card).getByRole('button', { name: 'Who can join' })).toBeInTheDocument()
  })

  it('takes the owner into the live room after inviting classmates to build', async () => {
    const client = createFakeWorldsClient()
    const setWorldSharing = vi.spyOn(client, 'setWorldSharing')
    const assign = captureAssign()
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).getByRole('button', { name: 'Invite classmates' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Invite Ben K. and build' }))

    await waitFor(() => expect(setWorldSharing).toHaveBeenCalledWith('world-ava-treehouse', { visibility: 'members', canEdit: true, members: ['student-ben'] }))
    // The owner lands in the same room the invite opens for the friend.
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/live/worldavatreehouse?invited=1'))
  })

  it('loads the classmate roster once, in the background, for the sheet', async () => {
    const client = createFakeWorldsClient()
    const listClassmates = vi.spyOn(client, 'listClassmates')
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).getByRole('button', { name: 'Invite classmates' }))
    expect(within(screen.getByRole('dialog')).getByText('Roster: loading')).toBeInTheDocument()
    expect(listClassmates).toHaveBeenCalledWith(FIXTURE_CLASS.id)
    expect(await screen.findByText('Roster: Ben K., Chloe M., Diego S., Emma L., Finn O.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(within(screen.getByRole('article', { name: 'Lava Maze' })).getByRole('button', { name: 'Who can join' }))
    expect(listClassmates).toHaveBeenCalledTimes(1)
  })

  it('offers Open alone and Stop sharing in the menu of a shared world', async () => {
    const client = createFakeWorldsClient()
    const setWorldSharing = vi.spyOn(client, 'setWorldSharing')
    draw(client)
    await settled()

    fireEvent.click(screen.getByRole('button', { name: 'More for Treehouse Hideout' }))
    expect(screen.queryByRole('menuitem', { name: 'Open alone' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Stop sharing' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'More for Lava Maze' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open alone' }))
    expect(navigate).toHaveBeenCalledWith('/build?world=world-ava-lava')

    fireEvent.click(screen.getByRole('button', { name: 'More for Lava Maze' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Stop sharing' }))
    await waitFor(() => expect(setWorldSharing).toHaveBeenCalledWith('world-ava-lava', { visibility: 'private', canEdit: false }))
    expect(await screen.findByText(/is private again/)).toBeInTheDocument()
  })

  it('reopens the sheet from the gear on a shared world and can stop sharing', async () => {
    const client = createFakeWorldsClient()
    const setWorldSharing = vi.spyOn(client, 'setWorldSharing')
    draw(client)
    await settled()

    fireEvent.click(within(screen.getByRole('article', { name: 'Lava Maze' })).getByRole('button', { name: 'Who can join' }))
    const sheet = screen.getByRole('dialog', { name: 'Invite to Lava Maze' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Stop sharing' }))

    await waitFor(() => expect(setWorldSharing).toHaveBeenCalledWith('world-ava-lava', { visibility: 'private', canEdit: false }))
    expect(await screen.findByText(/is private again/)).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Lava Maze' })).getByRole('button', { name: 'Invite classmates' })).toBeInTheDocument()
  })

  it('lists a quiet invite under Shared with you, apart from the whole-class worlds', async () => {
    draw()
    await settled()

    const rail = screen.getByRole('navigation', { name: 'Worlds sections' })
    // The invite counts toward the class section like any shared world.
    expect(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) })).toHaveTextContent('5')
    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))

    const invited = screen.getByRole('region', { name: 'Shared with you' })
    const arcade = within(invited).getByRole('article', { name: 'Pixel Arcade' })
    expect(within(arcade).getByText('Finn O. invited you')).toBeInTheDocument()
    expect(within(arcade).getByText(/Build together/)).toBeInTheDocument()
    expect(within(arcade).getByRole('link', { name: 'Join and build' })).toHaveAttribute('href', '/live/worldfinnarcade')
    expect(within(arcade).getByRole('link', { name: /Visit/ })).toHaveAttribute('href', '/live/worldfinnarcade')
    expect(within(arcade).getByRole('button', { name: 'Make my own copy' })).toBeInTheDocument()
    // An invitee never sees who else was invited.
    expect(within(arcade).queryByText(/classmate/)).not.toBeInTheDocument()

    const shared = screen.getByRole('region', { name: 'Shared by classmates' })
    expect(within(shared).queryByRole('article', { name: 'Pixel Arcade' })).not.toBeInTheDocument()
    expect(within(shared).getByRole('article', { name: 'Sky Bridge' })).toBeInTheDocument()
    // Sections keep their order: invites first, then the class, then the teacher.
    const regions = screen.getAllByRole('region').map(region => region.getAttribute('aria-label'))
    expect(regions.indexOf('Shared with you')).toBeLessThan(regions.indexOf('Shared by classmates'))
  })

  it('skips the Shared with you section when nobody invited this student', async () => {
    draw(createFakeWorldsClient({ worlds: [] }))
    await settled()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(screen.queryByRole('region', { name: 'Shared with you' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Shared by classmates' })).toBeInTheDocument()
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

  it('drops the invite button when the teacher turned class sharing off', async () => {
    draw(createFakeWorldsClient({ classes: [{ ...FIXTURE_CLASS, studentsCanShare: false }] }))
    await settled()

    expect(within(screen.getByRole('article', { name: 'Treehouse Hideout' })).queryByRole('button', { name: 'Invite classmates' })).not.toBeInTheDocument()
    // A world that is already shared keeps its way back out.
    expect(within(screen.getByRole('article', { name: 'Rainbow Rocket' })).getByRole('button', { name: 'Who can join' })).toBeInTheDocument()
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

  it('puts unanswered invites in a banner above My worlds, newest first and at most three', async () => {
    const invite = (id: string, title: string, owner: string, sharedAt: string, extra: Partial<Parameters<typeof fixtureWorld>[0]> = {}) =>
      fixtureWorld({ id, title, ownerId: `student-${owner.toLowerCase()}`, ownerName: `${owner} X.`, visibility: 'members', canEdit: true, classCanEdit: true, sharedAt, updatedAt: sharedAt, ...extra })
    draw(createFakeWorldsClient({ worlds: [
      invite('w-a', 'Oldest World', 'Ben', '2026-09-14T10:00:00.000Z'),
      invite('w-b', 'Middle World', 'Chloe', '2026-09-15T10:00:00.000Z'),
      invite('w-c', 'Newer World', 'Diego', '2026-09-16T10:00:00.000Z'),
      invite('w-d', 'Newest World', 'Finn', '2026-09-17T10:00:00.000Z', { buildingNow: 2, buildingNames: ['Ava P.', 'Ben K.'] }),
    ] }))
    await settled()

    const banner = screen.getByRole('region', { name: 'Invites' })
    const titles = within(banner).getAllByRole('article').map(card => card.getAttribute('aria-label'))
    expect(titles).toEqual(['Invite to Newest World', 'Invite to Newer World', 'Invite to Middle World'])

    const newest = within(banner).getByRole('article', { name: 'Invite to Newest World' })
    expect(within(newest).getByText('Finn X. invited you to build Newest World')).toBeInTheDocument()
    expect(within(newest).getByText('Ava P. and Ben K. building right now')).toBeInTheDocument()
    expect(within(newest).getByRole('link', { name: 'Join and build' })).toHaveAttribute('href', '/live/wd')
    expect(within(newest).getByRole('button', { name: 'Not now' })).toBeInTheDocument()
    // No live line when nobody is in the room.
    expect(within(within(banner).getByRole('article', { name: 'Invite to Newer World' })).queryByText(/building right now/)).not.toBeInTheDocument()
  })

  it('reads a look-only invite differently and sends the student to Visit', async () => {
    draw(createFakeWorldsClient({ worlds: [fixtureWorld({
      id: 'w-look', title: 'Glass Tower', ownerId: 'student-ben', ownerName: 'Ben K.',
      visibility: 'members', canEdit: false, classCanEdit: false, sharedAt: '2026-09-17T10:00:00.000Z',
    })] }))
    await settled()

    const card = within(screen.getByRole('region', { name: 'Invites' })).getByRole('article', { name: 'Invite to Glass Tower' })
    expect(within(card).getByText('Ben K. invited you to look at Glass Tower')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Visit' })).toHaveAttribute('href', '/live/wlook')
    expect(within(card).queryByRole('link', { name: 'Join and build' })).not.toBeInTheDocument()
  })

  it('drops an invite from the banner on Not now and remembers it', async () => {
    draw()
    await settled()

    const banner = screen.getByRole('region', { name: 'Invites' })
    expect(within(banner).getByText('Finn O. invited you to build Pixel Arcade')).toBeInTheDocument()
    fireEvent.click(within(banner).getByRole('button', { name: 'Not now' }))

    expect(screen.queryByRole('region', { name: 'Invites' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(SEEN_INVITES_STORAGE_KEY)).toContain('world-finn-arcade')
  })

  it('remembers the invite when the student joins it', async () => {
    draw()
    await settled()

    fireEvent.click(within(screen.getByRole('region', { name: 'Invites' })).getByRole('link', { name: 'Join and build' }))
    expect(window.localStorage.getItem(SEEN_INVITES_STORAGE_KEY)).toContain('world-finn-arcade')
    expect(screen.queryByRole('region', { name: 'Invites' })).not.toBeInTheDocument()
  })

  it('keeps an already-answered invite out of the banner', async () => {
    seedSeen('world-finn-arcade')
    draw()
    await settled()
    expect(screen.queryByRole('region', { name: 'Invites' })).not.toBeInTheDocument()
    // The card itself is still there under the class section.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(within(screen.getByRole('region', { name: 'Shared with you' })).getByRole('article', { name: 'Pixel Arcade' })).toBeInTheDocument()
  })

  it('puts a green building-now chip on the worlds classmates are in right now', async () => {
    const shared = (id: string, title: string, buildingNow: number, visibility: 'class' | 'members') => fixtureWorld({
      id, title, ownerId: 'student-ben', ownerName: 'Ben K.', visibility, canEdit: true, classCanEdit: true,
      sharedAt: '2026-09-17T10:00:00.000Z', buildingNow, buildingNames: [],
    })
    seedSeen('w-invited')
    draw(createFakeWorldsClient({ worlds: [shared('w-invited', 'Invited Build', 2, 'members'), shared('w-class', 'Class Build', 0, 'class')] }))
    await settled()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))

    const invited = within(screen.getByRole('region', { name: 'Shared with you' })).getByRole('article', { name: 'Invited Build' })
    expect(within(invited).getByText('2 building now')).toBeInTheDocument()
    expect(within(invited).getByRole('link', { name: 'Join and build' })).toHaveAttribute('href', '/live/winvited')
    expect(within(invited).getByRole('link', { name: 'Visit' })).toBeInTheDocument()
    expect(within(invited).getByRole('button', { name: 'Make my own copy' })).toBeInTheDocument()

    const classCard = within(screen.getByRole('region', { name: 'Shared by classmates' })).getByRole('article', { name: 'Class Build' })
    expect(within(classCard).queryByText(/building now/)).not.toBeInTheDocument()
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

    // A teacher is never invited to anything, so the banner never shows on their page.
    expect(screen.queryByRole('region', { name: 'Invites' })).not.toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    fireEvent.change(screen.getByLabelText('Shared world name'), { target: { value: 'Market day' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start world' }))

    await waitFor(() => expect(createSharedWorld).toHaveBeenCalledWith(FIXTURE_CLASS.id, 'Market day', 'class'))
    expect(screen.getByRole('region', { name: 'Shared by students' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Sky Bridge' })).getByRole('button', { name: 'Hide from class' })).toBeInTheDocument()
  })

  it('offers the way back to the class page: a header button and a link on the selected class', async () => {
    draw(createFakeWorldsClient({ session: teacherSession }))
    await settled()

    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'My class' })).toHaveAttribute('href', '/class')
    // Order matters: the class is the first thing a teacher reaches for.
    const links = within(header).getAllByRole('link').map(link => link.textContent)
    expect(links.indexOf('My class')).toBeLessThan(links.indexOf('Open the studio'))

    const rail = screen.getByRole('navigation', { name: 'Worlds sections' })
    expect(within(rail).queryByRole('link', { name: 'Open class page' })).not.toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    // The rail entry still filters this page; the link is the extra way out.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(FIXTURE_CLASS.name)
    expect(within(rail).getByRole('link', { name: 'Open class page' })).toHaveAttribute('href', `/class?classId=${FIXTURE_CLASS.id}`)

    fireEvent.click(within(rail).getByRole('button', { name: /^My worlds/ }))
    expect(within(rail).queryByRole('link', { name: 'Open class page' })).not.toBeInTheDocument()
  })

  it('opens the class the teacher last picked and remembers a new pick from the rail', async () => {
    const SECOND = { ...FIXTURE_CLASS, id: 'class-2', name: 'After-school Club' }
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, JSON.stringify({ classId: 'class-2' }))
    draw(createFakeWorldsClient({ session: teacherSession, classes: [FIXTURE_CLASS, SECOND] }), { view: 'class' })
    await settled()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('After-school Club')

    const rail = screen.getByRole('navigation', { name: 'Worlds sections' })
    fireEvent.click(within(rail).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(readRememberedTeacherClass()).toBe(FIXTURE_CLASS.id)

    // "My worlds" is not a class, so it never overwrites the remembered one.
    fireEvent.click(within(rail).getByRole('button', { name: /^My worlds/ }))
    expect(readRememberedTeacherClass()).toBe(FIXTURE_CLASS.id)
  })

  it('falls back to the first class when the remembered one is gone', async () => {
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, JSON.stringify({ classId: 'class-gone' }))
    draw(createFakeWorldsClient({ session: teacherSession }), { view: 'class' })
    await settled()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(FIXTURE_CLASS.name)
  })

  it('sends a document with the shared-world request, so the Worker does not reject it as an invalid document', async () => {
    // The real client (worldsData.ts), not the fake, so a regression in what
    // `createSharedWorld` puts on the wire is caught here.
    const request = vi.fn(async (path: string, method = 'GET') => {
      if (path === '/classes' && method === 'GET') return { classes: [FIXTURE_CLASS] }
      if (path.startsWith('/worlds?') && method === 'GET') return { worlds: [] }
      return { world: { id: 'w-new', title: 'Market day', kind: 'class', ownerId: teacherSession.user.id, classId: FIXTURE_CLASS.id, revision: 1, updatedAt: '2026-09-18T00:00:00.000Z' } }
    })
    const classroomClient: ClassroomClient = {
      getSession: () => teacherSession,
      subscribe: () => () => {},
      signOut: vi.fn(async () => {}),
      request: request as unknown as ClassroomClient['request'],
    } as unknown as ClassroomClient
    draw(createWorldsClient(classroomClient))
    await settled()

    // The page asks the real route for presence; the fields are optional, the query is not.
    expect(request).toHaveBeenCalledWith('/worlds?presence=1')

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    fireEvent.change(screen.getByLabelText('Shared world name'), { target: { value: 'Market day' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start world' }))

    await waitFor(() => expect(request).toHaveBeenCalledWith('/worlds', 'POST', expect.objectContaining({ document: expect.any(Object) })))
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

  it('shows a student\'s quiet invite among the shared worlds with how many classmates were invited', async () => {
    draw(createFakeWorldsClient({ session: teacherSession }))
    await settled()

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Worlds sections' })).getByRole('button', { name: new RegExp(FIXTURE_CLASS.name) }))
    expect(screen.queryByRole('region', { name: 'Shared with you' })).not.toBeInTheDocument()
    const arcade = within(screen.getByRole('region', { name: 'Shared by students' })).getByRole('article', { name: 'Pixel Arcade' })
    expect(within(arcade).getByText('Finn O.')).toBeInTheDocument()
    expect(within(arcade).getByText('2 classmates')).toBeInTheDocument()
    expect(within(arcade).getByRole('button', { name: 'Hide from class' })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Sky Bridge' })).queryByText(/classmate/)).not.toBeInTheDocument()
  })

  it('keeps a class section to worlds shared by that class\'s own students, for a teacher with more than one class', async () => {
    const classA = { ...FIXTURE_CLASS, id: 'class-a', name: 'Class A' }
    const classB = { ...FIXTURE_CLASS, id: 'class-b', name: 'Class B' }
    const worldFor = (id: string, title: string, ownerClassId: string) => ({
      id, title, ownerId: `owner-${id}`, classId: null, kind: 'personal' as const, revision: 1, updatedAt: '2026-09-17T00:00:00.000Z',
      visibility: 'class' as const, canEdit: false, classCanEdit: true, ownerName: 'A Student', ownerClassId, sharedAt: '2026-09-17T00:00:00.000Z', hiddenByTeacher: false,
    })
    const worldA = worldFor('world-a', 'Class A Build', classA.id)
    const worldB = worldFor('world-b', 'Class B Build', classB.id)

    const client = createFakeWorldsClient({ session: teacherSession, classes: [classA, classB], worlds: [worldA, worldB] })
    draw(client)
    await settled()

    const rail = screen.getByRole('navigation', { name: 'Worlds sections' })
    expect(within(within(rail).getByRole('button', { name: /^Class A/ })).getByText('1')).toBeInTheDocument()
    expect(within(within(rail).getByRole('button', { name: /^Class B/ })).getByText('1')).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: /^Class A/ }))
    expect(screen.getByRole('article', { name: 'Class A Build' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Class B Build' })).not.toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: /^Class B/ }))
    expect(screen.getByRole('article', { name: 'Class B Build' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Class A Build' })).not.toBeInTheDocument()
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
