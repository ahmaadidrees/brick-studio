/**
 * My powers: the powers this kid made or opened from a file, kept in this browser until the class shelf exists. Like
 * the project save, storage can be missing or blocked, so every call copes with that and the list is simply empty.
 */
import { powerFromFile, powerToFile, type PowerBrick } from './powers'

export const MY_POWERS_KEY = 'code-lab.my-powers.v1'
export const MAKER_NAME_KEY = 'code-lab.maker-name.v1'

type Listener = () => void
const listeners = new Set<Listener>()

/**
 * Kept powers this version will not snap on (a block it does not have, a damaged part). They are not listed, but they
 * are written back with the rest, so keeping or forgetting another power never throws one away.
 */
let unlisted: unknown[] = []

function read(storage: Storage | undefined = safeStorage()): PowerBrick[] {
  unlisted = []
  try {
    const raw = storage?.getItem(MY_POWERS_KEY)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    const powers: PowerBrick[] = []
    for (const item of list) {
      const power = powerFromFile(JSON.stringify(item))
      if (power) powers.push(power)
      else unlisted.push(item)
    }
    return powers
  } catch {
    return []
  }
}

/** What My powers stores: the listed powers as files, then any it does not list, untouched. */
const stored = (powers: PowerBrick[]) => JSON.stringify([...powers.map((p) => JSON.parse(powerToFile(p))), ...unlisted])

let cache: PowerBrick[] | null = null

export function myPowers(): PowerBrick[] {
  if (!cache) cache = read()
  return cache
}

/** Keep a power in My powers. A power with the same id replaces the old one (an update from its maker). */
export function keepPower(power: PowerBrick, storage: Storage | undefined = safeStorage()): void {
  const next = [...myPowers().filter((p) => p.id !== power.id), power]
  cache = next
  try { storage?.setItem(MY_POWERS_KEY, stored(next)) } catch { /* storage full or blocked: kept for this visit */ }
  for (const l of [...listeners]) l()
}

export function forgetPower(id: string, storage: Storage | undefined = safeStorage()): void {
  cache = myPowers().filter((p) => p.id !== id)
  try { storage?.setItem(MY_POWERS_KEY, stored(cache)) } catch { /* see keepPower */ }
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
  unlisted = []
}

function safeStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage } catch { return undefined }
}
