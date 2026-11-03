/**
 * The first-run tips (Build · Code · Play) show the first time a kid opens the Hackable Platformer in a browser. A
 * browser that blocks storage cannot remember them, so there they show at each visit (and still close at a tap).
 */
export const TIPS_SEEN_KEY = 'brickgineers.hackable.tips.v1'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function tipsSeen(area: Storage | null = storage()): boolean {
  try {
    return area?.getItem(TIPS_SEEN_KEY) === 'seen'
  } catch {
    return false
  }
}

export function markTipsSeen(area: Storage | null = storage()): void {
  try {
    area?.setItem(TIPS_SEEN_KEY, 'seen')
  } catch {
    // Storage is full or blocked: the tips show again next time, which is all that is lost.
  }
}
