import type { ClassroomAuthResult } from './contracts'
const KEY = 'brickgineers.last-class.v1'
export type RememberedClass = { code: string; name: string }
export function readRememberedClass(): RememberedClass | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || 'null')
    return value && typeof value.code === 'string' && value.code.length <= 40 && value.code.length > 0 && typeof value.name === 'string' && value.name.length <= 80 ? value : null
  } catch { return null }
}
export function rememberClass(auth: ClassroomAuthResult) {
  if (auth.user.role !== 'student') return
  const classroom = auth.classes[0]
  if (!classroom?.loginCode) return
  try { localStorage.setItem(KEY, JSON.stringify({ code: classroom.loginCode, name: classroom.name })) } catch { /* Login works without local storage. */ }
}
export function forgetClass() {
  try { localStorage.removeItem(KEY) } catch { /* Storage may be unavailable. */ }
}
