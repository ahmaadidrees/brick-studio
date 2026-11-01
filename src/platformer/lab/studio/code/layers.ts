/**
 * The layered code view's state machine (pure, no Blockly).
 *
 * The code editor shows a brick's scripts at the top. Clicking the magnifier on a My Block call drills into that
 * block's definition; the call stack of drills is `stack` (proccodes, oldest first). Back pops one. An empty stack is
 * the top view. Some bricks fold a run of their scripts into a section ("How I move", see sections.ts): opening one sets
 * `section`, the base of the path, and drills from inside it keep it, so Back returns to the section, then the top.
 */
export interface LayerState {
  readonly stack: readonly string[]
  readonly section?: string
}

export const TOP_VIEW: LayerState = { stack: [] }

export function isTop(state: LayerState): boolean {
  return state.stack.length === 0 && !state.section
}

/** The proccode of the definition on screen, or null at the top or in a section. */
export function currentProccode(state: LayerState): string | null {
  return state.stack.length ? state.stack[state.stack.length - 1] : null
}

/** The section on screen, or null (the top view, or a definition drilled into). */
export function currentSection(state: LayerState): string | null {
  return state.stack.length ? null : state.section ?? null
}

function withStack(state: LayerState, stack: readonly string[]): LayerState {
  return state.section ? { stack, section: state.section } : { stack }
}

/** Open a section from the top view. */
export function openSection(section: string): LayerState {
  return { stack: [], section }
}

/**
 * Drill into a definition. Drilling into the one already on screen does nothing; drilling into one already earlier in the
 * path (a block that calls itself, or a loop of calls) goes back to it instead of growing the path forever.
 */
export function drillInto(state: LayerState, proccode: string): LayerState {
  if (currentProccode(state) === proccode) return state
  const at = state.stack.indexOf(proccode)
  if (at >= 0) return withStack(state, state.stack.slice(0, at + 1))
  return withStack(state, [...state.stack, proccode])
}

/** One step back: a definition, then the section, then the top view (which stays the top view). */
export function back(state: LayerState): LayerState {
  if (state.stack.length) return withStack(state, state.stack.slice(0, -1))
  return state.section ? TOP_VIEW : state
}

/** Jump to a breadcrumb: depth 0 is the top view, then the section (if open), then each drill. */
export function goToDepth(state: LayerState, depth: number): LayerState {
  const base = state.section ? 1 : 0
  const d = Math.max(0, Math.min(depth, base + state.stack.length))
  if (d === base + state.stack.length) return state
  return d === 0 ? TOP_VIEW : withStack(state, state.stack.slice(0, d - base))
}

/** Drop drills whose definition no longer exists (deleted), keeping the longest valid path, and a section the brick lacks. */
export function pruneMissing(state: LayerState, exists: (proccode: string) => boolean, sectionExists: (id: string) => boolean = () => true): LayerState {
  if (state.section && !sectionExists(state.section)) return pruneMissing({ stack: state.stack }, exists)
  const at = state.stack.findIndex((p) => !exists(p))
  return at < 0 ? state : withStack(state, state.stack.slice(0, at))
}

/** "jump %s times %b" becomes "jump" plus its inputs: only the words, for a breadcrumb. */
export function proccodeWords(proccode: string): string {
  return proccode.replace(/%[sbn]/g, '').replace(/\s+/g, ' ').trim() || proccode
}

/** Breadcrumb labels: ["Hero's scripts", "jump", ...], or ["Hero's scripts", "How I move", ...] inside a section. */
export function breadcrumb(state: LayerState, brickName: string, sectionTitle: (id: string) => string = (id) => id): string[] {
  return [`${brickName}'s scripts`, ...(state.section ? [sectionTitle(state.section)] : []), ...state.stack.map(proccodeWords)]
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
