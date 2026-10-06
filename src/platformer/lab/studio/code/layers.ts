/**
 * The layered code view's state machine (pure, no Blockly).
 *
 * The code editor shows a brick's scripts at the top. Clicking the magnifier on a My Block call drills into that
 * block's definition; the call stack of drills is `stack` (proccodes, oldest first). Back pops one. An empty stack is
 * the top view.
 */
export interface LayerState {
  readonly stack: readonly string[]
}

export const TOP_VIEW: LayerState = { stack: [] }

export function isTop(state: LayerState): boolean {
  return state.stack.length === 0
}

/** The proccode of the definition on screen, or null at the top. */
export function currentProccode(state: LayerState): string | null {
  return state.stack.length ? state.stack[state.stack.length - 1] : null
}

/**
 * Drill into a definition. Drilling into the one already on screen does nothing; drilling into one already earlier in the
 * path (a block that calls itself, or a loop of calls) goes back to it instead of growing the path forever.
 */
export function drillInto(state: LayerState, proccode: string): LayerState {
  if (currentProccode(state) === proccode) return state
  const at = state.stack.indexOf(proccode)
  if (at >= 0) return { stack: state.stack.slice(0, at + 1) }
  return { stack: [...state.stack, proccode] }
}

/** One step back (the top view stays the top view). */
export function back(state: LayerState): LayerState {
  return state.stack.length ? { stack: state.stack.slice(0, -1) } : state
}

/** Jump to a breadcrumb: depth 0 is the top view, depth n keeps the first n drills. */
export function goToDepth(state: LayerState, depth: number): LayerState {
  const d = Math.max(0, Math.min(depth, state.stack.length))
  return d === state.stack.length ? state : { stack: state.stack.slice(0, d) }
}

/** Drop drills whose definition no longer exists (deleted); keeps the longest valid path. */
export function pruneMissing(state: LayerState, exists: (proccode: string) => boolean): LayerState {
  const at = state.stack.findIndex((p) => !exists(p))
  return at < 0 ? state : { stack: state.stack.slice(0, at) }
}

/** "jump %s times %b" becomes "jump" plus its inputs: only the words, for a breadcrumb. */
export function proccodeWords(proccode: string): string {
  return proccode.replace(/%[sbn]/g, '').replace(/\s+/g, ' ').trim() || proccode
}

/** Breadcrumb labels: ["Hero's scripts", "jump", ...]. */
export function breadcrumb(state: LayerState, brickName: string): string[] {
  return [`${brickName}'s scripts`, ...state.stack.map(proccodeWords)]
}

/** The block label the editor shows on a hat. Stored in the block's `data` string as `label:<text>`. */
export const LABEL_PREFIX = 'label:'

export function readLabel(data: string | null | undefined): string {
  return typeof data === 'string' && data.startsWith(LABEL_PREFIX) ? data.slice(LABEL_PREFIX.length).trim() : ''
}

export function labelData(text: string): string | undefined {
  const t = text.trim()
  return t ? LABEL_PREFIX + t : undefined
}
