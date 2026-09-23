/** Best clear times for the built-in courses, kept in this browser. */
const KEY = 'brick-studio.2d.best.v1'

function readAll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY)
    const data: unknown = raw ? JSON.parse(raw) : {}
    return data && typeof data === 'object' ? (data as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Best time in ticks, or -1 if the course has not been cleared here yet. */
export function loadBest(course: string): number {
  const t = readAll()[course]
  return typeof t === 'number' && Number.isFinite(t) && t >= 0 ? t : -1
}

/** Record a clear. Returns true when it beats the stored best. */
export function saveBest(course: string, ticks: number): boolean {
  const all = readAll()
  const old = all[course]
  if (typeof old === 'number' && old >= 0 && old <= ticks) return false
  all[course] = ticks
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // Private browsing or storage full: the time still shows for this session.
  }
  return true
}
