import type { BrickStudioDocument } from '@brick-studio/core'

export type ClassroomSession = { accessToken: string; refreshToken: string; expiresIn: number }
export type ClassroomUser = { id: string; username: string; rosterName: string; role: 'teacher' | 'student'; resetRequired: boolean }
export type ClassroomClass = { id: string; name: string; code?: string; loginCode: string; enrollmentOpen: boolean; collaborationOpen: boolean }
export type ClassroomMe = { user: ClassroomUser; classes: ClassroomClass[] }
export type ClassroomAuthResult = ClassroomMe & { session: ClassroomSession }
export type ClassroomStudent = { id: string; username: string; rosterName: string; suspended: boolean; resetRequired: boolean }
export type ClassroomWorld = { id: string; title: string; ownerId: string; classId: string | null; kind: 'personal' | 'group' | 'class'; revision: number; updatedAt: string; document?: BrickStudioDocument }
export type ClassroomCheckpoint = { id: string; revision: number; createdAt: string; reason: string }
export type ClassroomWorldMember = { id: string; username: string; rosterName?: string }
export type ClassroomError = { error: string; code: string; currentRevision?: number }
