/**
 * The layered code view's state machine (pure, no Blockly).
 *
 * The code editor shows a brick's scripts at the top. Clicking the magnifier on a My Block call drills into that
 * block's definition; the call stack of drills is `stack` (proccodes, oldest first). Back pops one. An empty stack is
 * the top view. Some bricks fold a run of their scripts into a section ("How I move", see sections.ts): opening one sets
 * `section`, the base of the path, and shows its scripts as a list. Picking one sets `script` (that script alone, or
 * ALL_SCRIPTS for all of them at once); drills from there keep both, so Back returns to the script, the list, then the top.
 */
export interface LayerState {
  readonly stack: readonly string[]
  readonly section?: string
  /** Inside a section: the id of the one script on screen, or ALL_SCRIPTS. Unset: the section's list of scripts. */
  readonly script?: string
}

/** `script` for "all of the section's scripts at once". */
export const ALL_SCRIPTS = '*'

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

/** In a section with nothing picked yet: its list of scripts is on screen (and no blocks). */
export function isScriptList(state: LayerState): boolean {
  return !state.stack.length && !!state.section && !state.script
}

/** The one script on screen inside a section (not ALL_SCRIPTS), or null. */
export function currentScript(state: LayerState): string | null {
  return !state.stack.length && state.section && state.script && state.script !== ALL_SCRIPTS ? state.script : null
}

function withStack(state: LayerState, stack: readonly string[]): LayerState {
  if (!state.section) return { stack }
  return state.script ? { stack, section: state.section, script: state.script } : { stack, section: state.section }
}

/** Open a section from the top view: its list of scripts. */
export function openSection(section: string): LayerState {
  return { stack: [], section }
}

/** Show one script of a section (or ALL_SCRIPTS). */
export function openScript(section: string, script: string): LayerState {
  return { stack: [], section, script }
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

/** One step back: a definition, then the script, then the section's list, then the top view (which stays the top view). */
export function back(state: LayerState): LayerState {
  if (state.stack.length) return withStack(state, state.stack.slice(0, -1))
  if (state.section && state.script) return openSection(state.section)
  return state.section ? TOP_VIEW : state
}

/** Jump to a breadcrumb: depth 0 is the top view, then the section's list (if open), the script (if picked), then each drill. */
export function goToDepth(state: LayerState, depth: number): LayerState {
  const base = (state.section ? 1 : 0) + (state.section && state.script ? 1 : 0)
  const d = Math.max(0, Math.min(depth, base + state.stack.length))
  if (d === base + state.stack.length) return state
  if (d === 0) return TOP_VIEW
  if (d === 1 && state.section) return openSection(state.section)
  return withStack(state, state.stack.slice(0, d - base))
}

/** Drop drills whose definition no longer exists (deleted), keeping the longest valid path, and a section the brick lacks. */
export function pruneMissing(
  state: LayerState,
  exists: (proccode: string) => boolean,
  sectionExists: (id: string) => boolean = () => true,
  scriptExists: (id: string) => boolean = () => true,
): LayerState {
  if (state.section && !sectionExists(state.section)) return pruneMissing({ stack: state.stack }, exists)
  // A script that is gone (deleted, or joined to another): back to the section's list.
  if (state.section && state.script && state.script !== ALL_SCRIPTS && !scriptExists(state.script)) {
    return pruneMissing(state.stack.length ? { stack: state.stack, section: state.section } : openSection(state.section), exists)
  }
  const at = state.stack.findIndex((p) => !exists(p))
  return at < 0 ? state : withStack(state, state.stack.slice(0, at))
}

/** "jump %s times %b" becomes "jump" plus its inputs: only the words, for a breadcrumb. */
export function proccodeWords(proccode: string): string {
  return proccode.replace(/%[sbn]/g, '').replace(/\s+/g, ' ').trim() || proccode
}

/** Breadcrumb labels: ["Hero's scripts", "jump", ...], or ["Hero's scripts", "How I move", "Walk", ...] inside a section. */
export function breadcrumb(
  state: LayerState,
  brickName: string,
  sectionTitle: (id: string) => string = (id) => id,
  scriptTitle: (id: string) => string = (id) => id,
): string[] {
  // Inside a section, after its title: the script's short name, or "All of them".
  const script = state.section && state.script ? [state.script === ALL_SCRIPTS ? 'All of them' : scriptTitle(state.script)] : []
  return [`${brickName}'s scripts`, ...(state.section ? [sectionTitle(state.section)] : []), ...script, ...state.stack.map(proccodeWords)]
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

/**
 * A script label in plain words, for drawing and lists only (the saved label, which folds a script into its section, never
 * changes). The Hero's older labels use game-maker words: "p speed", "Coyote time", "Jump buffer", "tick".
 */
const PLAIN_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Coyote time:/, 'Late jump:'],
  [/^Jump buffer:/, 'Early jump:'],
  [/\bp speed\b/g, 'full run speed'],
  [/\bone tick at a time\b/g, 'a moment at a time'],
  [/\bevery tick\b/g, 'over and over'],
  [/\bStart each tick\b/g, 'Start each moment'],
]

export function plainLabel(label: string): string {
  return PLAIN_WORDS.reduce((text, [find, put]) => text.replace(find, put), label)
}

/** "Walk: speed up toward…" as a short name ("Walk") and the rest, for the section's list and its breadcrumb. */
export function splitLabel(label: string): { name: string; detail: string } {
  const text = plainLabel(label)
  const at = text.indexOf(':')
  if (at <= 0 || at > 48) return { name: text, detail: '' }
  return { name: text.slice(0, at).trim(), detail: text.slice(at + 1).trim() }
}
