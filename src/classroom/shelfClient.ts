/**
 * The class shelf's routes (Worker: multiplayer/worker/src/classroom/shelf.ts), on top of any classroom client's
 * `request`, so the client surface and its test doubles stay as they are.
 */
import type { ClassroomClientSurface, ClassroomRaceHeroes } from './contracts'

export type ShelfStatus = 'pending' | 'approved' | 'hidden'

export interface ShelfItem {
  id: string
  kind: 'power'
  /** The Hackable game the power is for; it shows only there. Missing (older servers and powers) means the Platformer. */
  game?: 'platformer' | 'race' | '3d'
  name: string
  what: string
  /** First name and last initial, or "Teacher". */
  by: string
  mine: boolean
  status: ShelfStatus
  uses: number
  createdAt: string
}

export interface ShelfList {
  items: ShelfItem[]
  needsReview: boolean
  raceHeroes: ClassroomRaceHeroes
}

type Requester = Pick<ClassroomClientSurface, 'request'>
const base = (classId: string) => `/classes/${encodeURIComponent(classId)}/shelf`

export const shelfClient = (client: Requester) => ({
  list: (classId: string) => client.request<ShelfList>(base(classId)),
  get: async (classId: string, id: string) => (await client.request<{ item: ShelfItem & { payload: unknown } }>(`${base(classId)}/${encodeURIComponent(id)}`)).item,
  share: async (classId: string, input: { name: string; what: string; payload: unknown }) => (await client.request<{ item: ShelfItem }>(base(classId), 'POST', input)).item,
  review: async (classId: string, id: string, status: 'approved' | 'hidden') => (await client.request<{ item: ShelfItem }>(`${base(classId)}/${encodeURIComponent(id)}`, 'PATCH', { status })).item,
  remove: (classId: string, id: string) => client.request<{ removed: true }>(`${base(classId)}/${encodeURIComponent(id)}`, 'DELETE'),
  used: (classId: string, id: string) => client.request<{ uses: number }>(`${base(classId)}/${encodeURIComponent(id)}/use`, 'POST'),
})
export type ShelfClient = ReturnType<typeof shelfClient>
