import { createBrickStudioDocument } from '@brick-studio/core'
import { createMockClient, type MockRole } from '../../classroom/mockClient'
import type { ClassroomAuthResult, ClassroomCheckpoint } from '../../classroom/contracts'
import type { WorldsClient, WorldsClass, WorldsWorld } from './worldsData'

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
    listWorlds: async () => worlds ? worlds.map(item => ({ ...item })) : mock.listWorlds(),
    listClasses: async () => classes ? classes.map(item => ({ ...item })) : mock.listClasses(),
    listClassmates: classId => mock.listClassmates(classId),
    renameWorld: (id, title) => mock.renameWorld(id, title),
    duplicateWorld: source => mock.duplicateWorld(source.id),
    listCheckpoints: id => checkpoints ? Promise.resolve(checkpoints.map(item => ({ ...item }))) : mock.listCheckpoints(id),
    restoreCheckpoint: (id, checkpointId) => mock.restoreWorld(id, checkpointId),
    setWorldSharing: (id, sharing) => mock.setWorldSharing(id, sharing),
    setWorldHidden: (id, hidden) => mock.setWorldHidden(id, hidden),
    copyWorld: id => mock.copyWorld(id),
    createSharedWorld: (classId, title, kind) => mock.createWorld({ title, document: createBrickStudioDocument([]), kind, classId }),
    signOut: () => mock.signOut(),
  }
}
