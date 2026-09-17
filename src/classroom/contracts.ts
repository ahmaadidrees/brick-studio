import type { BrickStudioDocument } from '@brick-studio/core'

export type ClassroomSession = { accessToken: string; refreshToken: string; expiresIn: number }
export type ClassroomUser = { id: string; username: string; rosterName: string; role: 'teacher' | 'student'; resetRequired: boolean }
export type ClassroomClass = { id: string; name: string; code?: string; loginCode: string; enrollmentOpen: boolean; collaborationOpen: boolean; showNamesOnJoin: boolean }
export type ClassroomMe = { user: ClassroomUser; classes: ClassroomClass[] }
export type ClassroomAuthResult = ClassroomMe & { session: ClassroomSession }
export type ClassroomStudent = { id: string; username: string; rosterName: string; suspended: boolean; resetRequired: boolean }
export type ClassroomWorld = { id: string; title: string; ownerId: string; classId: string | null; kind: 'personal' | 'group' | 'class'; revision: number; updatedAt: string; document?: BrickStudioDocument }
export type ClassroomCheckpoint = { id: string; revision: number; createdAt: string; reason: string }
export type ClassroomWorldMember = { id: string; username: string; rosterName?: string }
export type ClassroomError = { error: string; code: string; currentRevision?: number; suggestions?: string[] }
/** Public join-screen entry: the roster name never leaves the server, only first name plus last initial. */
export type ClassroomRosterStudent = { username: string; displayName: string }
export type ClassroomRoster = { name: string; canEnroll: boolean; showNames: boolean; students: ClassroomRosterStudent[] }
/** Sign-in credentials; the class code is optional because usernames are global. */
export type ClassroomLoginInput = { username: string; password: string; classCode?: string }
