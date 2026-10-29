import { createMockClient, MOCK_IDS } from '../../classroom/mockClient'
import type { ClassroomClass, ClassroomRaceHeroes, ClassroomWorld } from '../../classroom/contracts'
import type { ShelfItem } from '../../classroom/shelfClient'
import type { ClassPageClient } from './classPageData'

/**
 * Thin wrapper over `src/classroom/mockClient.ts` (W1) for `/class?demo=…` and
 * `/class/projector?demo=1`: `everyday` is the mock's own teacher fixture
 * unchanged; `first-run` hides its pre-seeded class until the demo creates
 * one, so the page renders the brand-new-teacher flow. Dev only; the page
 * uses the real client in production builds.
 */
export type DemoVariant = 'first-run' | 'everyday'

export function createDemoClassPageClient(variant: DemoVariant = 'everyday'): ClassPageClient {
  const mock = withDemoShelf(createMockClient({ as: 'teacher' }))
  if (variant !== 'first-run') return mock

  /** Set once the demo creates its first class; only that class (and its empty roster/worlds) show up after. */
  let createdId: string | null = null
  return {
    getSession: mock.getSession,
    subscribe: mock.subscribe,
    signOut: mock.signOut,
    request: (async (path: string, method = 'GET', body?: unknown) => {
      const result = await mock.request<Record<string, unknown>>(path, method, body)
      if (path === '/classes' && method === 'POST') { const created = result.class as ClassroomClass | undefined; if (created) createdId = created.id }
      if (path === '/classes' && method === 'GET') return { classes: createdId ? (result.classes as ClassroomClass[]).filter(item => item.id === createdId) : [] }
      if (path === '/worlds' && method === 'GET') return { worlds: createdId ? (result.worlds as ClassroomWorld[]).filter(item => item.classId === createdId) : [] }
      if (path.endsWith('/students') && method === 'GET') return { students: [] }
      return result
    }) as ClassPageClient['request'],
  }
}

type DemoShelfItem = ShelfItem & { classId: string; payload: unknown }
const power = (name: string, what: string, scripts: number, variables: string[], credits: string[]) =>
  ({ kind: 'brickgineers-power', version: 1, name, what, fits: 'brick', blocks: Array.from({ length: scripts }, () => ({ type: 'event_whenflagclicked' })), variables: variables.map((v, i) => ({ id: `v${i}`, name: v, value: 0 })), credits })
const shelfItem = (id: string, name: string, what: string, by: string, status: ShelfItem['status'], uses: number, payload: unknown, daysAgo: number): DemoShelfItem =>
  ({ id, kind: 'power', name, what, by, mine: false, status, uses, createdAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(), classId: MOCK_IDS.classId, payload })

/**
 * The class shelf has no mock routes of its own, so the demo answers them here, with a few
 * items for the mock's class and the two shelf settings kept beside the mock's class row.
 */
function withDemoShelf(mock: ClassPageClient): ClassPageClient {
  const items: DemoShelfItem[] = [
    shelfItem('shelf-wall-jump', 'Wall jump', 'Jump off walls to climb up.', 'Ava M.', 'pending', 0, power('Wall jump', 'Jump off walls to climb up.', 2, ['wall time'], ['Ava M.']), 0),
    shelfItem('shelf-dash', 'Super dash', 'Press shift to zoom forward.', 'Ben T.', 'pending', 0, power('Super dash', 'Press shift to zoom forward.', 3, ['dash speed', 'cooldown'], ['Brickgineers', 'Ben T.']), 1),
    shelfItem('shelf-double-jump', 'Double jump', 'Jump again in the air.', 'Teacher', 'approved', 7, power('Double jump', 'Jump again in the air.', 1, ['jumps'], ['Brickgineers']), 4),
    shelfItem('shelf-coin-magnet', 'Coin magnet', 'Coins fly to you.', 'Chloe R.', 'approved', 3, power('Coin magnet', 'Coins fly to you.', 2, ['pull'], ['Chloe R.']), 3),
    shelfItem('shelf-spin', 'Spin forever', 'Spins really fast.', 'Diego P.', 'hidden', 0, power('Spin forever', 'Spins really fast.', 1, [], ['Diego P.']), 5),
  ]
  const settings = new Map<string, { shelfNeedsReview?: boolean; raceHeroes?: ClassroomRaceHeroes }>()
  const withSettings = (cls: ClassroomClass) => ({ ...cls, shelfNeedsReview: true, raceHeroes: 'shelf' as ClassroomRaceHeroes, ...settings.get(cls.id) })
  const view = ({ classId: _classId, payload: _payload, ...item }: DemoShelfItem): ShelfItem => item
  const notFound = () => { throw new Error('That brick is not on the shelf.') }

  return {
    ...mock,
    request: (async (path: string, method = 'GET', body?: unknown) => {
      const shelf = /^\/classes\/([^/]+)\/shelf(?:\/([^/]+))?$/.exec(path)
      if (shelf) {
        const classId = decodeURIComponent(shelf[1])
        const id = shelf[2] && decodeURIComponent(shelf[2])
        const current = { shelfNeedsReview: true, raceHeroes: 'shelf' as ClassroomRaceHeroes, ...settings.get(classId) }
        if (!id) return { items: items.filter(item => item.classId === classId).map(view), needsReview: current.shelfNeedsReview, raceHeroes: current.raceHeroes }
        const index = items.findIndex(item => item.id === id && item.classId === classId)
        if (index === -1) return notFound()
        if (method === 'GET') return { item: { ...view(items[index]), payload: items[index].payload } }
        if (method === 'PATCH') { items[index] = { ...items[index], status: (body as { status: ShelfItem['status'] }).status }; return { item: view(items[index]) } }
        if (method === 'DELETE') { items.splice(index, 1); return { removed: true } }
      }
      const result = await mock.request<Record<string, unknown>>(path, method, body)
      const classPatch = /^\/classes\/([^/]+)$/.exec(path)
      if (classPatch && method === 'PATCH') {
        const { shelfNeedsReview, raceHeroes } = (body ?? {}) as { shelfNeedsReview?: boolean; raceHeroes?: ClassroomRaceHeroes }
        const id = decodeURIComponent(classPatch[1])
        settings.set(id, { ...settings.get(id), ...(shelfNeedsReview !== undefined ? { shelfNeedsReview } : {}), ...(raceHeroes ? { raceHeroes } : {}) })
        return { ...result, class: withSettings(result.class as ClassroomClass) }
      }
      if (path === '/classes' && method === 'GET') return { ...result, classes: (result.classes as ClassroomClass[]).map(withSettings) }
      return result
    }) as ClassPageClient['request'],
  }
}
