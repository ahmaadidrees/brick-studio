import type { ClassroomAuthResult, ClassroomCheckpoint } from '../../classroom/contracts'
import type { WorldsClient, WorldsClass, WorldsWorld } from './worldsData'

/**
 * Stand-in for `src/classroom/mockClient.ts` (W1's first commit) with the same
 * fixture shape from docs/flows/CONTRACTS-V2.md: one class, six students, three
 * own worlds, four classmates' worlds, two teacher worlds. Swap the import in
 * `WorldsPage`'s dev preview and in the tests once W1 lands; nothing else here
 * depends on it.
 */

const day = (offset: number) => new Date(Date.UTC(2026, 8, 17 - offset, 15, 30)).toISOString()

export const FIXTURE_CLASS: WorldsClass = {
  id: 'class-1', name: 'Room 12 Builders', code: 'BRICK7', loginCode: 'ROOM12',
  enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: 3, teacherName: 'Ms. Nair',
}

export const FIXTURE_STUDENTS = [
  { id: 'student-1', username: 'ada', displayName: 'Ada R.' },
  { id: 'student-2', username: 'benji', displayName: 'Benji T.' },
  { id: 'student-3', username: 'chiara', displayName: 'Chiara M.' },
  { id: 'student-4', username: 'dev', displayName: 'Dev P.' },
  { id: 'student-5', username: 'elle', displayName: 'Elle W.' },
  { id: 'student-6', username: 'farid', displayName: 'Farid K.' },
] as const

const world = (world: Partial<WorldsWorld> & Pick<WorldsWorld, 'id' | 'title' | 'ownerId'>): WorldsWorld => ({
  classId: null, kind: 'personal', revision: 4, updatedAt: day(1), visibility: 'private', canEdit: false, classCanEdit: false,
  ownerName: 'Ada R.', ownerClassId: FIXTURE_CLASS.id, sharedAt: null, ...world,
})

/** Three own worlds: one private, one shared look-only, one shared build-together. */
export const FIXTURE_MY_WORLDS: WorldsWorld[] = [
  world({ id: 'mine-1', title: 'Treehouse village', ownerId: 'student-1', updatedAt: day(0), canEdit: true }),
  world({ id: 'mine-2', title: 'Rocket launch pad', ownerId: 'student-1', updatedAt: day(2), canEdit: true, classCanEdit: true, visibility: 'class', sharedAt: day(1) }),
  world({ id: 'mine-3', title: 'Castle on the hill', ownerId: 'student-1', updatedAt: day(6), canEdit: true, classCanEdit: false, visibility: 'class', sharedAt: day(5) }),
]

/** Four classmates' shared personal worlds; two invite building, two are look-only. */
export const FIXTURE_CLASSMATE_WORLDS: WorldsWorld[] = [
  world({ id: 'mate-1', title: 'Pirate harbour', ownerId: 'student-2', ownerName: 'Benji T.', visibility: 'class', canEdit: true, sharedAt: day(0), updatedAt: day(0) }),
  world({ id: 'mate-2', title: 'Robot repair shop', ownerId: 'student-3', ownerName: 'Chiara M.', visibility: 'class', canEdit: false, sharedAt: day(1), updatedAt: day(1) }),
  world({ id: 'mate-3', title: 'Cloud city', ownerId: 'student-4', ownerName: 'Dev P.', visibility: 'class', canEdit: true, sharedAt: day(2), updatedAt: day(2) }),
  world({ id: 'mate-4', title: 'Dinosaur park', ownerId: 'student-5', ownerName: 'Elle W.', visibility: 'class', canEdit: false, sharedAt: day(3), updatedAt: day(3) }),
]

/** Two worlds the teacher started for the class. */
export const FIXTURE_TEACHER_WORLDS: WorldsWorld[] = [
  world({ id: 'teacher-1', title: 'Our class town', ownerId: 'teacher-1', ownerName: 'Ms. Nair', classId: FIXTURE_CLASS.id, kind: 'class', canEdit: true, classCanEdit: true, updatedAt: day(1) }),
  world({ id: 'teacher-2', title: 'Bridge challenge', ownerId: 'teacher-1', ownerName: 'Ms. Nair', classId: FIXTURE_CLASS.id, kind: 'group', canEdit: true, classCanEdit: true, updatedAt: day(4) }),
]

export const FIXTURE_CHECKPOINTS: ClassroomCheckpoint[] = [
  { id: 'cp-1', revision: 4, createdAt: day(0), reason: 'autosave' },
  { id: 'cp-2', revision: 3, createdAt: day(2), reason: 'before restore' },
]

export const studentSession: ClassroomAuthResult = {
  user: { id: 'student-1', username: 'ada', rosterName: 'Ada Reyes', role: 'student', resetRequired: false },
  classes: [FIXTURE_CLASS],
  session: { accessToken: 'demo', refreshToken: 'demo', expiresIn: 3600 },
}

export const teacherSession: ClassroomAuthResult = {
  user: { id: 'teacher-1', username: 'ms.nair', rosterName: 'Priya Nair', role: 'teacher', resetRequired: false },
  classes: [FIXTURE_CLASS],
  session: { accessToken: 'demo', refreshToken: 'demo', expiresIn: 3600 },
}

export type FakeWorldsOptions = {
  session?: ClassroomAuthResult | null
  worlds?: WorldsWorld[]
  classes?: WorldsClass[]
  checkpoints?: ClassroomCheckpoint[]
}

/** In-memory client: every mutation updates the list the page re-reads. */
export function createFakeWorldsClient({ session = studentSession, worlds, classes = [FIXTURE_CLASS], checkpoints = FIXTURE_CHECKPOINTS }: FakeWorldsOptions = {}): WorldsClient {
  let current = session
  let list = (worlds ?? [...FIXTURE_MY_WORLDS, ...FIXTURE_CLASSMATE_WORLDS, ...FIXTURE_TEACHER_WORLDS]).map(item => ({ ...item }))
  const listeners = new Set<() => void>()
  const publish = () => listeners.forEach(listener => listener())
  const patch = (id: string, changes: Partial<WorldsWorld>) => {
    let updated: WorldsWorld | null = null
    list = list.map(item => item.id === id ? (updated = { ...item, ...changes }) : item)
    if (!updated) throw new Error('That world is no longer available.')
    return updated as WorldsWorld
  }
  return {
    getSession: () => current,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    listWorlds: async () => list.map(item => ({ ...item })),
    listClasses: async () => classes.map(item => ({ ...item })),
    renameWorld: async (id, title) => patch(id, { title }),
    duplicateWorld: async source => {
      const copy: WorldsWorld = { ...source, id: `${source.id}-copy-${list.length}`, title: `${source.title} copy`, visibility: 'private', sharedAt: null, updatedAt: new Date().toISOString() }
      list = [copy, ...list]
      return copy
    },
    listCheckpoints: async () => checkpoints.map(item => ({ ...item })),
    restoreCheckpoint: async id => patch(id, { revision: (list.find(item => item.id === id)?.revision ?? 1) + 1 }),
    setWorldSharing: async (id, sharing) => patch(id, { visibility: sharing.visibility, classCanEdit: sharing.canEdit, sharedAt: sharing.visibility === 'class' ? new Date().toISOString() : null }),
    setWorldHidden: async (id, hiddenByTeacher) => patch(id, { hiddenByTeacher }),
    copyWorld: async id => {
      const source = list.find(item => item.id === id)
      if (!source) throw new Error('That world is no longer available.')
      const copy: WorldsWorld = { ...source, id: `${id}-copy`, title: `${source.title} (copy)`, ownerId: current?.user.id ?? 'me', ownerName: 'You', kind: 'personal', classId: null, visibility: 'private', canEdit: true, sharedAt: null, updatedAt: new Date().toISOString() }
      list = [copy, ...list]
      return copy
    },
    createSharedWorld: async (classId, title, kind) => {
      const created: WorldsWorld = { id: `shared-${list.length}`, title, ownerId: current?.user.id ?? 'teacher-1', ownerName: 'You', classId, kind, revision: 1, updatedAt: new Date().toISOString(), visibility: 'private', canEdit: true, classCanEdit: true, ownerClassId: classId, sharedAt: null }
      list = [created, ...list]
      return created
    },
    signOut: async () => { current = null; publish() },
  }
}
