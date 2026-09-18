import { createMockClient } from '../../classroom/mockClient'
import type { ClassroomClass, ClassroomWorld } from '../../classroom/contracts'
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
  const mock = createMockClient({ as: 'teacher' })
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
