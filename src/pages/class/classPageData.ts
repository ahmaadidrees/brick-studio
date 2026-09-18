import { browserClassroomClient } from '../../classroom/client'
import type { ClassroomCheckpoint, ClassroomClass, ClassroomClientSurface, ClassroomStudent, ClassroomWorld, ClassroomWorldMember } from '../../classroom/contracts'

/**
 * Flows v2 fields the teacher page consumes. They are optional here because
 * `src/classroom/contracts.ts` still describes the pre-sharing shapes; once W1
 * lands its migration and client the page can read them from the shared types
 * and these two aliases can be deleted (see docs/flows/status/w5.md).
 */
export type ClassPageClass = ClassroomClass & {
  studentsCanShare?: boolean
  /** Optional presence count for the "N building now" chip; hidden when absent. */
  buildingNow?: number
}
export type ClassPageWorld = ClassroomWorld & {
  ownerName?: string
  visibility?: 'private' | 'class'
  canEdit?: boolean
  sharedAt?: string | null
  hiddenByTeacher?: boolean
}

/**
 * Everything the page needs from the classroom client: the session store plus
 * the raw request method. This is a `ClassroomClientSurface` subset — `ClassroomClient`
 * (real HTTP) and `createMockClient` (W1's fixture) both satisfy it as-is, so tests
 * and the dev fixtures supply the same shape without adapting it.
 */
export type ClassPageClient = Pick<ClassroomClientSurface, 'request' | 'getSession' | 'subscribe' | 'signOut'>

export const defaultClassPageClient: ClassPageClient = browserClassroomClient

export type ClassPageData = { classes: ClassPageClass[]; worlds: ClassPageWorld[] }

/** The code students type on the join screen: the enrollment code while it exists, else the sign-in code. */
export const classCode = (classroom: Pick<ClassPageClass, 'code' | 'loginCode'>) => classroom.code || classroom.loginCode

/** Invite links open account creation first: `/join?classCode=<code>` on this origin. */
export function joinLink(code: string) {
  const url = new URL('/join', window.location.origin)
  url.searchParams.set('classCode', code)
  return url.toString()
}

/** "Students go to brickgineers.com/join…" — the host comes from the browser, never from source. */
export const joinHost = () => `${window.location.host}/join`

/** Live room link for a classroom world, matching the editor's own join links. */
export const worldRoomHref = (world: Pick<ClassroomWorld, 'id'>) => `/live/${world.id.replaceAll('-', '')}`

export const loadClasses = (client: ClassPageClient) =>
  client.request<{ classes: ClassPageClass[] }>('/classes').then(result => result.classes ?? [])
export const loadWorlds = (client: ClassPageClient) =>
  client.request<{ worlds: ClassPageWorld[] }>('/worlds').then(result => result.worlds ?? [])
export const loadStudents = (client: ClassPageClient, classId: string) =>
  client.request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`).then(result => result.students ?? [])

export const createClass = (client: ClassPageClient, name: string) =>
  client.request<{ class: ClassPageClass }>('/classes', 'POST', { name }).then(result => result.class)
export const patchClass = (client: ClassPageClient, classId: string, body: Record<string, unknown>) =>
  client.request<{ class: ClassPageClass }>(`/classes/${classId}`, 'PATCH', body)
export const patchStudent = (client: ClassPageClient, classId: string, studentId: string, body: Record<string, unknown>) =>
  client.request(`/classes/${classId}/students/${studentId}`, 'PATCH', body)

/** Teacher-only: take a student's shared world out of the class list (or put it back). */
export const setWorldHidden = (client: ClassPageClient, worldId: string, hiddenByTeacher: boolean) =>
  client.request(`/worlds/${worldId}/visibility`, 'PATCH', { hiddenByTeacher })

export const loadMembers = (client: ClassPageClient, worldId: string) =>
  client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${worldId}/members`).then(result => result.members ?? [])
export const loadCheckpoints = (client: ClassPageClient, worldId: string) =>
  client.request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${worldId}/checkpoints`).then(result => result.checkpoints ?? [])
export const addMember = (client: ClassPageClient, worldId: string, userId: string) =>
  client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${worldId}/members`, 'POST', { userId }).then(result => result.members ?? [])
export const removeMember = (client: ClassPageClient, worldId: string, userId: string) =>
  client.request<{ members: ClassroomWorldMember[] }>(`/worlds/${worldId}/members/${userId}`, 'DELETE').then(result => result.members ?? [])
export const restoreCheckpoint = async (client: ClassPageClient, world: ClassPageWorld, checkpointId: string) => {
  const current = await client.request<{ world: ClassPageWorld }>(`/worlds/${world.id}`)
  const result = await client.request<{ world: ClassPageWorld }>(`/worlds/${world.id}/restore`, 'POST', { checkpointId, expectedRevision: current.world.revision })
  return result.world
}

/**
 * Worlds a student shared with this class, newest first; hidden ones stay for
 * the teacher. A shared personal world's `classId` is always null (only
 * `ownerClassId` says whose class it came from), so a multi-class teacher
 * must match on that instead — otherwise every class would show every
 * student's shared world. A world with no `ownerClassId` (older data, or a
 * fixture that never set it) falls back to showing under `firstClassId`.
 */
export const sharedByStudents = (worlds: ClassPageWorld[], classId: string, teacherId: string, firstClassId?: string) =>
  worlds.filter(world => world.kind === 'personal' && world.ownerId !== teacherId && world.visibility === 'class'
    && (world.ownerClassId === classId || (world.ownerClassId == null && classId === firstClassId)))
    .sort((a, b) => (b.sharedAt || b.updatedAt).localeCompare(a.sharedAt || a.updatedAt))

/** Worlds the teacher started for the class or a group. */
export const teacherWorlds = (worlds: ClassPageWorld[], classId: string) =>
  worlds.filter(world => world.classId === classId && world.kind !== 'personal')
