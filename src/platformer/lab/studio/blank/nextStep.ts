/**
 * Start from nothing's next-step line (docs/qa/blank-2d, board 4a): one dark line at the bottom of the stage naming the
 * next thing to do. It replaces the kits' three first-run tips. Nothing pops up by itself; each line goes once its step
 * is done, and × hides the line for good (in this browser).
 *
 *   Start by drawing a brick → Tap the stage to place Zip → Tap Zip to give it a job → Pick a job, then press Play →
 *   Give the Flag the Goal job → Play together: send the link.
 */
import type { LevelDesign } from '../../core/contracts'
import { hasJobOrCode, jobsOf } from './blankRules'

export interface NextStep {
  id: 'draw' | 'place' | 'job' | 'pick' | 'play' | 'goal' | 'together'
  text: string
}

export interface NextStepState {
  brushBrickId: string | null
  /** The brick whose card is open in Build, if any. */
  cardBrickId: string | null
  /** Play has been pressed since the studio opened. */
  played: boolean
}

const placedIds = (design: LevelDesign): Set<string> => {
  const ids = new Set(design.copies.map((c) => c.brickId))
  const chars = new Set((design.tiles?.data ?? []).join(''))
  for (const b of design.bricks) if (b.grid && chars.has(b.grid.char)) ids.add(b.id)
  return ids
}

/** What to do next, or null when there is nothing left to suggest. */
export function nextStep(design: LevelDesign, s: NextStepState): NextStep | null {
  if (design.bricks.length === 0) return { id: 'draw', text: 'Start by drawing a brick.' }
  const placed = placedIds(design)
  if (placed.size === 0) {
    const brush = design.bricks.find((b) => b.id === s.brushBrickId)
    if (brush) return { id: 'place', text: brush.grid ? `Drag on the stage to paint ${brush.name}.` : `Tap the stage to place ${brush.name}.` }
    const last = design.bricks[design.bricks.length - 1]
    return { id: 'place', text: `Pick ${last.name} in My bricks, then tap the stage.` }
  }
  const onStage = design.bricks.filter((b) => placed.has(b.id))
  // New tiles start with the Wall job by themselves: the things placed one at a time are the ones waiting for a job.
  const things = onStage.filter((b) => !b.grid)
  const busy = (things.length ? things : onStage).filter((b) => hasJobOrCode(b))
  const card = s.cardBrickId ? design.bricks.find((b) => b.id === s.cardBrickId) : undefined
  if (busy.length === 0) {
    if (card) return { id: 'pick', text: 'Pick a job, then press Play.' }
    const first = onStage.find((b) => !b.grid) ?? onStage[0]
    // While a brush is armed a tap places another one, so Done comes first.
    return { id: 'job', text: s.brushBrickId ? `Press Done, then tap ${first.name} to give it a job.` : `Tap ${first.name} to give it a job.` }
  }
  if (!s.played) return { id: 'play', text: card && !hasJobOrCode(card) ? 'Pick a job, then press Play.' : 'Press Play to try your game.' }
  const jobs = onStage.flatMap((b) => jobsOf(b))
  if (jobs.includes('collect') && !jobs.includes('goal')) {
    const idle = onStage.find((b) => !hasJobOrCode(b))
    return { id: 'goal', text: idle ? `Next: give ${idle.name} the Goal job.` : 'Next: draw a brick and give it the Goal job.' }
  }
  return { id: 'together', text: 'Play together: open This project, then Play together, and send the link.' }
}

const HIDDEN_KEY = 'brickgineers.blank.nextStep.hidden'

export function nextStepHidden(store: Pick<Storage, 'getItem'> | undefined = safeStorage()): boolean {
  try { return store?.getItem(HIDDEN_KEY) === '1' } catch { return false }
}

export function hideNextStep(store: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try { store?.setItem(HIDDEN_KEY, '1') } catch { /* private window: hidden for this visit only */ }
}

function safeStorage(): Storage | undefined {
  try { return typeof window === 'undefined' ? undefined : window.localStorage } catch { return undefined }
}
