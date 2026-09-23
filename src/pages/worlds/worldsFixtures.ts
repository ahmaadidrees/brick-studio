import { createBrickStudioDocument } from '@brick-studio/core'
import { createMockClient, MOCK_IDS, type MockRole } from '../../classroom/mockClient'
import type { ClassroomAuthResult, ClassroomCheckpoint } from '../../classroom/contracts'
import { emptyDocument, type WorldsClient, type WorldsClass, type WorldsWorld } from './worldsData'

/**
 * Thin wrapper over `src/classroom/mockClient.ts` (W1): the page-specific bits
 * (the `?demo=` states, the `session`/`worlds`/`classes` overrides tests reach
 * for) live here, but every world, class and student comes from the shared
 * fixture (docs/flows/CONTRACTS-V2.md) so this page's dev preview and tests
 * exercise the same data every other classroom page does.
 */

const studentSeed = createMockClient({ as: 'student' })
const teacherSeed = createMockClient({ as: 'teacher' })

/** Ava Rivera, signed in — the default `session` for these fixtures. */
export const studentSession: ClassroomAuthResult = studentSeed.getSession() as ClassroomAuthResult
/** Mr. Idrees, signed in. */
export const teacherSession: ClassroomAuthResult = teacherSeed.getSession() as ClassroomAuthResult
/** Period 3 Makers, the fixture's one class. */
export const FIXTURE_CLASS: WorldsClass = studentSession.classes[0]

export type FakeWorldsOptions = {
  session?: ClassroomAuthResult | null
  worlds?: WorldsWorld[]
  classes?: WorldsClass[]
  checkpoints?: ClassroomCheckpoint[]
}

const roleFor = (session: ClassroomAuthResult | null | undefined): MockRole =>
  session === null ? 'guest' : session?.user.role === 'teacher' ? 'teacher' : 'student'

/**
 * In-memory client backed by W1's mock: reads fall back to the mock's own
 * fixture data (so mutations the page makes — sharing, hiding, copying — stay
 * consistent), while `worlds`/`classes`/`checkpoints` let a test or a
 * `?demo=` state pin the list it renders without touching the mock's db.
 */
export function createFakeWorldsClient({ session, worlds, classes, checkpoints }: FakeWorldsOptions = {}): WorldsClient {
  const mock = createMockClient({ as: roleFor(session) })
  return {
    getSession: mock.getSession,
    subscribe: mock.subscribe,
    // Lane A widens the mock's `listWorlds` to honour `?presence=1`; until then the extra argument is
    // ignored and the presence fields are simply absent, which is exactly what the page must survive.
    listWorlds: async options => worlds
      ? worlds.map(item => ({ ...item }))
      : (mock.listWorlds as (input?: { presence?: boolean }) => Promise<WorldsWorld[]>)(options),
    listClasses: async () => classes ? classes.map(item => ({ ...item })) : mock.listClasses(),
    listClassmates: classId => mock.listClassmates(classId),
    renameWorld: (id, title) => mock.renameWorld(id, title),
    duplicateWorld: source => mock.duplicateWorld(source.id),
    listCheckpoints: id => checkpoints ? Promise.resolve(checkpoints.map(item => ({ ...item }))) : mock.listCheckpoints(id),
    restoreCheckpoint: (id, checkpointId) => mock.restoreWorld(id, checkpointId),
    setWorldSharing: (id, sharing) => mock.setWorldSharing(id, sharing),
    setWorldHidden: (id, hidden) => mock.setWorldHidden(id, hidden),
    copyWorld: id => mock.copyWorld(id),
    createSharedWorld: (classId, title, kind, format = 'brick') => mock.createWorld({ title, document: emptyDocument(format, title) as ReturnType<typeof createBrickStudioDocument>, kind, classId }).then((world) => ({ ...world, format })),
    signOut: () => mock.signOut(),
  }
}

/**
 * A hand-built world for the presence and invite-banner cases, where the test needs to pin
 * `buildingNames` / `members` / `sharedAt` rather than take whatever the shared fixture holds.
 * Everything is a plain `personal` world in Period 3 unless the override says otherwise.
 */
export function fixtureWorld(overrides: Partial<WorldsWorld> & Pick<WorldsWorld, 'id' | 'title'>): WorldsWorld {
  return {
    ownerId: MOCK_IDS.ava, classId: null, kind: 'personal', revision: 3, updatedAt: '2026-09-17T10:00:00.000Z',
    visibility: 'private', canEdit: true, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: MOCK_IDS.classId,
    sharedAt: null, ...overrides,
  }
}
