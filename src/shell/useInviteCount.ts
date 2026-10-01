import { browserClassroomClient } from '../classroom/client'
import { useStudentInvites, type InviteClient } from '../classroom/inviteStore'
import type { ClassroomSessionState } from './useClassroomSession'

export type InviteCountClient = InviteClient
export const INVITE_COUNT_TTL_MS = 15_000
/** Compatibility hook; all counts now come from the same lightweight invite stream. */
export function useInviteCount(session: Pick<ClassroomSessionState, 'status' | 'user'>, client: InviteCountClient = browserClassroomClient): number {
  const userId = session.status === 'student' && session.user?.role === 'student' ? session.user.id : null
  const { state } = useStudentInvites(userId, client)
  return state.invites.filter(invite => !invite.seenAt).length
}
export function resetInviteCountCache(_client: object = browserClassroomClient) { /* The shared store is scoped by account. */ }
export function invitesWaitingLabel(count: number): string {
  return count > 0 ? `${count} ${count === 1 ? 'invite' : 'invites'} waiting` : ''
}
