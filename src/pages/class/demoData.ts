import type { ClassroomAuthResult } from '../../classroom/contracts'
import type { ClassPageClass, ClassPageClient, ClassPageWorld } from './classPageData'

/**
 * Local stand-in for `src/classroom/mockClient.ts` (W1). It answers the same
 * paths the page calls with the flows v2 shapes, so `/class?demo=…` renders the
 * first-run and everyday states without a worker. Dev and tests only; the page
 * uses the real client in production builds. Delete once W1's mock lands.
 */
export type DemoVariant = 'first-run' | 'everyday'

const teacher: ClassroomAuthResult = {
  user: { id: 'teacher-1', username: 'mrsdiaz', rosterName: 'Ana Diaz', role: 'teacher', resetRequired: false },
  classes: [],
  session: { accessToken: 'demo', refreshToken: 'demo', expiresIn: 3600 },
}

const demoClass: ClassPageClass = {
  id: 'class-1',
  name: 'Room 12 Builders',
  code: 'BRICK7',
  loginCode: 'BRICK7',
  enrollmentOpen: true,
  collaborationOpen: true,
  showNamesOnJoin: true,
  studentsCanShare: true,
  buildingNow: 4,
  teacherName: null,
}

const secondClass = { ...demoClass, id: 'class-2', name: 'After-school Club', code: 'CLUB42', loginCode: 'CLUB42', buildingNow: 0 }

const students = [
  { id: 's1', username: 'aiden_k', rosterName: 'Aiden Kim', suspended: false, resetRequired: false },
  { id: 's2', username: 'bella.r', rosterName: 'Bella Rivera', suspended: false, resetRequired: true },
  { id: 's3', username: 'caleb_w', rosterName: 'Caleb Wu', suspended: false, resetRequired: false },
  { id: 's4', username: 'dani_m', rosterName: 'Dani Moore', suspended: true, resetRequired: false },
  { id: 's5', username: 'evan_p', rosterName: 'Evan Park', suspended: false, resetRequired: false },
  { id: 's6', username: 'farah_s', rosterName: 'Farah Saleh', suspended: false, resetRequired: false },
]

const worlds: ClassPageWorld[] = [
  { id: 'w1', title: 'Rocket Base', ownerId: 's1', classId: null, kind: 'personal', revision: 8, updatedAt: '2026-09-16T15:00:00.000Z', ownerName: 'Aiden K.', visibility: 'class', canEdit: false, classCanEdit: true, ownerClassId: 'class-1', sharedAt: '2026-09-16T15:02:00.000Z', hiddenByTeacher: false },
  { id: 'w2', title: 'Treehouse Village', ownerId: 's2', classId: null, kind: 'personal', revision: 4, updatedAt: '2026-09-16T14:20:00.000Z', ownerName: 'Bella R.', visibility: 'class', canEdit: true, classCanEdit: true, ownerClassId: 'class-1', sharedAt: '2026-09-16T14:25:00.000Z', hiddenByTeacher: false },
  { id: 'w3', title: 'Silly Maze', ownerId: 's4', classId: null, kind: 'personal', revision: 2, updatedAt: '2026-09-15T18:00:00.000Z', ownerName: 'Dani M.', visibility: 'class', canEdit: false, classCanEdit: false, ownerClassId: 'class-1', sharedAt: '2026-09-15T18:05:00.000Z', hiddenByTeacher: true },
  { id: 'w4', title: 'Bridge Challenge', ownerId: 'teacher-1', classId: 'class-1', kind: 'class', revision: 12, updatedAt: '2026-09-17T09:00:00.000Z', ownerName: 'Ana D.', visibility: 'class', canEdit: true, classCanEdit: true, ownerClassId: 'class-1', sharedAt: null, hiddenByTeacher: false },
  { id: 'w5', title: 'Group B: City Block', ownerId: 'teacher-1', classId: 'class-1', kind: 'group', revision: 3, updatedAt: '2026-09-16T09:00:00.000Z', ownerName: 'Ana D.', visibility: 'class', canEdit: true, classCanEdit: true, ownerClassId: 'class-1', sharedAt: null, hiddenByTeacher: false },
]

/** A client whose requests resolve from the fixtures above; writes update them in memory. */
export function createDemoClassPageClient(variant: DemoVariant = 'everyday'): ClassPageClient {
  const state = {
    classes: variant === 'first-run' ? [] : [structuredClone(demoClass), structuredClone(secondClass)],
    worlds: variant === 'first-run' ? [] : structuredClone(worlds),
    students: variant === 'first-run' ? [] : structuredClone(students),
  }
  return {
    getSession: () => teacher,
    subscribe: () => () => {},
    signOut: async () => {},
    request: (async (path: string, method = 'GET', body?: Record<string, unknown>) => {
      if (path === '/classes' && method === 'GET') return { classes: state.classes }
      if (path === '/worlds' && method === 'GET') return { worlds: state.worlds }
      if (path.endsWith('/students')) return { students: state.students }
      if (path === '/classes' && method === 'POST') {
        const created = { ...structuredClone(demoClass), id: `class-${state.classes.length + 1}`, name: String(body?.name ?? 'New class'), buildingNow: 0 }
        state.classes = [...state.classes, created]
        state.students = structuredClone(students)
        return { class: created }
      }
      if (method === 'PATCH' && path.startsWith('/classes/')) {
        const id = path.split('/')[2]
        state.classes = state.classes.map(item => item.id === id ? { ...item, ...body, ...(body?.rotateCode ? { code: 'NEWCDE', loginCode: 'NEWCDE' } : {}) } : item)
        return { class: state.classes.find(item => item.id === id) }
      }
      if (method === 'PATCH' && path.endsWith('/visibility')) {
        const id = path.split('/')[2]
        state.worlds = state.worlds.map(world => world.id === id ? { ...world, hiddenByTeacher: Boolean(body?.hiddenByTeacher) } : world)
        return {}
      }
      if (path === '/worlds' && method === 'POST') {
        state.worlds = [...state.worlds, { ...structuredClone(worlds[3]), id: `w${state.worlds.length + 1}`, title: String(body?.title ?? 'Shared world'), kind: (body?.kind as 'class' | 'group') ?? 'class', classId: String(body?.classId ?? 'class-1') }]
        return { world: state.worlds.at(-1) }
      }
      if (path.endsWith('/members')) return { members: [{ id: 's1', username: 'aiden_k', rosterName: 'Aiden Kim' }] }
      if (path.endsWith('/checkpoints')) return { checkpoints: [{ id: 'cp1', revision: 11, createdAt: '2026-09-17T08:40:00.000Z', reason: 'save' }] }
      return {}
    }) as ClassPageClient['request'],
  }
}
