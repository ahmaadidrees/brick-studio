/**
 * My powers: the powers this kid made or opened from a file, kept in this browser until the class shelf exists. Like
 * the project save, storage can be missing or blocked, so every call copes with that and the list is simply empty.
 */
import { powerFromFile, powerToFile, type PowerBrick } from './powers'

export const MY_POWERS_KEY = 'code-lab.my-powers.v1'
export const MAKER_NAME_KEY = 'code-lab.maker-name.v1'

type Listener = () => void
const listeners = new Set<Listener>()

function read(storage: Storage | undefined = safeStorage()): PowerBrick[] {
  try {
    const raw = storage?.getItem(MY_POWERS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.map((p) => powerFromFile(JSON.stringify(p))).filter((p): p is PowerBrick => !!p)
  } catch {
    return []
  }
}

let cache: PowerBrick[] | null = null

export function myPowers(): PowerBrick[] {
  if (!cache) cache = read()
  return cache
}

/** Keep a power in My powers. A power with the same id replaces the old one (an update from its maker). */
export function keepPower(power: PowerBrick, storage: Storage | undefined = safeStorage()): void {
  const next = [...myPowers().filter((p) => p.id !== power.id), power]
  cache = next
  try { storage?.setItem(MY_POWERS_KEY, JSON.stringify(next.map((p) => JSON.parse(powerToFile(p))))) } catch { /* storage full or blocked: kept for this visit */ }
  for (const l of [...listeners]) l()
}

export function forgetPower(id: string, storage: Storage | undefined = safeStorage()): void {
  cache = myPowers().filter((p) => p.id !== id)
  try { storage?.setItem(MY_POWERS_KEY, JSON.stringify(cache)) } catch { /* see keepPower */ }
  for (const l of [...listeners]) l()
}

export function onPowersChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function makerName(): string {
  try { return safeStorage()?.getItem(MAKER_NAME_KEY) ?? '' } catch { return '' }
}

export function rememberMakerName(name: string): void {
  try { safeStorage()?.setItem(MAKER_NAME_KEY, name.trim().slice(0, 40)) } catch { /* not remembered */ }
}

/** Save a power as a file the kid can hand to a classmate (until the class shelf). */
export function downloadPower(power: PowerBrick): void {
  const blob = new Blob([powerToFile(power)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${power.name.replace(/[^\w -]+/g, '').trim() || 'power'}.power.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** For tests: forget the in-memory copy so the next read comes from storage. */
export function resetPowerCache(): void {
  cache = null
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}
