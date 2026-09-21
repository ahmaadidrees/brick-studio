/*
 * Which class a teacher was last looking at. A teacher with two or three
 * classes lands on `/class`, `/class/projector` and the `/worlds` rail many
 * times a day, and every one of them used to open the first class in the list
 * — so picking "After-school Club" had to be redone on every page. This
 * remembers the choice in one small localStorage value and nothing else: it is
 * a convenience, never a source of truth, so a missing, unreadable or stale
 * value simply falls back to the first class.
 */

export const REMEMBERED_TEACHER_CLASS_KEY = 'brickgineers.teacher-class.v1'

/** The slice of `Storage` this module touches; tests and SSR pass their own (or none). */
export type ClassStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function defaultStorage(): ClassStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Safari in private mode throws on the property itself, not just on access.
    return null
  }
}

/** The remembered class id, or null when there is none, it is unreadable, or it is not a class id. */
export function readRememberedTeacherClass(storage: ClassStorage | null = defaultStorage()): string | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(REMEMBERED_TEACHER_CLASS_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    const classId = (parsed as { classId?: unknown } | null)?.classId
    return typeof classId === 'string' && classId ? classId : null
  } catch {
    return null
  }
}

/** Remembers `classId`; an empty id clears the value instead, so nothing stale is left behind. */
export function rememberTeacherClass(classId: string, storage: ClassStorage | null = defaultStorage()): void {
  if (!storage) return
  if (!classId) return clearRememberedTeacherClass(storage)
  try {
    storage.setItem(REMEMBERED_TEACHER_CLASS_KEY, JSON.stringify({ classId }))
  } catch {
    // A full or blocked store costs the teacher one convenience, not the page.
  }
}

/** Forgets the class. The shell calls this on sign-out and account switch, so the next teacher starts clean. */
export function clearRememberedTeacherClass(storage: ClassStorage | null = defaultStorage()): void {
  if (!storage) return
  try {
    storage.removeItem(REMEMBERED_TEACHER_CLASS_KEY)
  } catch {
    // Nothing to do; the value is only ever a hint.
  }
}

/**
 * Which class a page should open: an explicit `?classId=` first (a link the
 * teacher just followed beats what they did yesterday), then the remembered
 * one, then the first class. Ids that name no class this teacher has are
 * skipped, so a deleted class never leaves a page empty.
 */
export function pickTeacherClassId(
  classes: readonly { id: string }[],
  requested?: string | null,
  storage: ClassStorage | null = defaultStorage(),
): string {
  const has = (id: string | null | undefined): id is string => Boolean(id) && classes.some(item => item.id === id)
  if (has(requested)) return requested
  const remembered = readRememberedTeacherClass(storage)
  if (has(remembered)) return remembered
  return classes[0]?.id ?? ''
}
