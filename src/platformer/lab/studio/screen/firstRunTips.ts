/**
 * The first-run tips (Build · Code · Play) show the first time a kid opens a Hackable kit in a browser. A browser that
 * blocks storage cannot remember them, so there they show at each visit (and still close at a tap). Each kit has its
 * own key (kitScreens `copy.tipsKey`); this is the Platformer's.
 */
export const TIPS_SEEN_KEY = 'brickgineers.hackable.tips.v1'

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function tipsSeen(area: Storage | null = storage(), key: string = TIPS_SEEN_KEY): boolean {
  try {
    return area?.getItem(key) === 'seen'
  } catch {
    return false
  }
}

export function markTipsSeen(area: Storage | null = storage(), key: string = TIPS_SEEN_KEY): void {
  try {
    area?.setItem(key, 'seen')
  } catch {
    // Storage is full or blocked: the tips show again next time, which is all that is lost.
  }
}
