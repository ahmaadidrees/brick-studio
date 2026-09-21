import type { BrickStudioDocument } from '@brick-studio/core'

export type ClassroomSession = { accessToken: string; refreshToken: string; expiresIn: number }
export type ClassroomUser = { id: string; username: string; rosterName: string; role: 'teacher' | 'student'; resetRequired: boolean }
export type ClassroomClass = {
  id: string; name: string; code?: string; loginCode: string; enrollmentOpen: boolean; collaborationOpen: boolean; showNamesOnJoin: boolean
  /** Students may share personal worlds with classmates (teacher setting; default on). */
  studentsCanShare: boolean
  /** Distinct accounts in this class's live rooms right now (teachers' class/me lists); null when unknown, e.g. at sign-in. */
  buildingNow: number | null
  /** The teacher's display name for student-facing copy; null when the server has none (teacher accounts carry no roster name). */
  teacherName: string | null
}
export type ClassroomMe = { user: ClassroomUser; classes: ClassroomClass[] }
export type ClassroomAuthResult = ClassroomMe & { session: ClassroomSession }
export type ClassroomStudent = { id: string; username: string; rosterName: string; suspended: boolean; resetRequired: boolean }
/** Who in the owner's class may see a personal world. `class` worlds and `group` worlds always report `class`. */
export type ClassroomWorldVisibility = 'private' | 'class'
export type ClassroomWorld = {
  id: string; title: string; ownerId: string; classId: string | null; kind: 'personal' | 'group' | 'class'; revision: number; updatedAt: string; document?: BrickStudioDocument
  visibility: ClassroomWorldVisibility
  /** Whether the caller may change bricks: owner, shared with edit, or the class/group rules. */
  canEdit: boolean
  /** The owner's sharing setting ("build together" vs "look only"), independent of the caller; class/group worlds are always true. */
  classCanEdit: boolean
  /** Display name of the owner (first name plus last initial; `Teacher` for teacher-owned worlds). */
  ownerName: string
  /** The owner's class (personal worlds keep `classId` null); null for a teacher's personal world. */
  ownerClassId: string | null
  /** When the owner shared it with the class; null while private. */
  sharedAt: string | null
  /** Present for teachers only: the teacher hid this shared world from classmates. */
  hiddenByTeacher?: boolean
}
export type ClassroomWorldSharing = { visibility: ClassroomWorldVisibility; canEdit: boolean }
export type ClassroomCheckpoint = { id: string; revision: number; createdAt: string; reason: string }
export type ClassroomWorldMember = { id: string; username: string; rosterName?: string }
export type ClassroomError = { error: string; code: string; currentRevision?: number; suggestions?: string[] }
/** Public join-screen entry: the roster name never leaves the server, only first name plus last initial. */
export type ClassroomRosterStudent = { username: string; displayName: string }
export type ClassroomRoster = { name: string; canEnroll: boolean; showNames: boolean; students: ClassroomRosterStudent[] }
/** Sign-in credentials; the class code is optional because usernames are global. */
export type ClassroomLoginInput = { username: string; password: string; classCode?: string }
export type ClassroomRegisterInput = { classCode: string; username: string; password: string; rosterName?: string }
export type ClassroomClassPatch = { name?: string; enrollmentOpen?: boolean; collaborationOpen?: boolean; showNamesOnJoin?: boolean; studentsCanShare?: boolean; rotateCode?: boolean }
export type ClassroomStudentPatch = { username?: string; rosterName?: string; suspended?: boolean; temporaryPassword?: string }
export type ClassroomWorldCreateInput = { title: string; document: BrickStudioDocument; kind?: ClassroomWorld['kind']; classId?: string }
export type ClassroomWorldSaveInput = { expectedRevision: number; document: BrickStudioDocument; title?: string }

/**
 * The client surface pages depend on. `ClassroomClient` (real HTTP) and `createMockClient` (in-memory fixtures)
 * both implement it, so a page written against the mock switches to the real client without edits.
 */
export interface ClassroomClientSurface {
  getSession(): ClassroomAuthResult | null
  subscribe(listener: () => void): () => void
  setSession(auth: ClassroomAuthResult | null): void
  request<T>(path: string, method?: string, body?: unknown): Promise<T>
  authenticate(path: 'register' | 'login' | 'teacher-login', values: Record<string, string>): Promise<ClassroomAuthResult>
  login(input: ClassroomLoginInput): Promise<ClassroomAuthResult>
  register(input: ClassroomRegisterInput): Promise<ClassroomAuthResult>
  classRoster(classCode: string): Promise<ClassroomRoster>
  resolveClass(classCode: string): Promise<{ name: string; canEnroll: boolean }>
  changePassword(password: string): Promise<ClassroomAuthResult>
  startGoogleTeacher(returnTo: string): Promise<string>
  signOut(): Promise<void>
  me(): Promise<ClassroomMe>
  listWorlds(): Promise<ClassroomWorld[]>
  listClasses(): Promise<ClassroomClass[]>
  listStudents(classId: string): Promise<ClassroomStudent[]>
  getWorld(id: string): Promise<ClassroomWorld>
  createWorld(input: ClassroomWorldCreateInput): Promise<ClassroomWorld>
  saveWorld(id: string, input: ClassroomWorldSaveInput): Promise<ClassroomWorld>
  renameWorld(id: string, title: string): Promise<ClassroomWorld>
  /** Own-world duplicate ("<title> copy"), the existing My Worlds action. */
  duplicateWorld(id: string): Promise<ClassroomWorld>
  listCheckpoints(id: string): Promise<ClassroomCheckpoint[]>
  restoreWorld(id: string, checkpointId: string): Promise<ClassroomWorld>
  setWorldSharing(id: string, sharing: ClassroomWorldSharing): Promise<ClassroomWorld>
  setWorldHidden(id: string, hidden: boolean): Promise<ClassroomWorld>
  /** "Make my own copy" of any world the caller can see ("<title> (copy)"). */
  copyWorld(id: string): Promise<ClassroomWorld>
  createClass(name: string): Promise<ClassroomClass>
  updateClass(id: string, patch: ClassroomClassPatch): Promise<ClassroomClass>
  updateStudent(classId: string, studentId: string, patch: ClassroomStudentPatch): Promise<ClassroomStudent>
}
