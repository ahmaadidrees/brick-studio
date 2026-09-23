import { DEFAULT_FEEL, type Feel } from '@brick-studio/platformer-core/engine/feel'

const KEY = 'brick-studio.2d.feel.v1'

export function loadFeel(): Feel {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_FEEL }
    const saved = JSON.parse(raw) as Partial<Feel>
    const out = { ...DEFAULT_FEEL }
    for (const k of Object.keys(DEFAULT_FEEL) as (keyof Feel)[]) {
      const v = saved[k]
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    }
    return out
  } catch {
    return { ...DEFAULT_FEEL }
  }
}

export function saveFeel(f: Feel) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // Storage can be unavailable (private mode); the panel still works for this session.
  }
}
