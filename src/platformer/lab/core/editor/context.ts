import { EFFECT_NAMES, type Value } from '../contracts'

/** A `[label, value]` pair formatted for Blockly `FieldDropdown`. */
export type MenuOption = [label: string, value: string]

export interface VariableItem {
  id: string
  name: string
  value?: Value
  showInBuild?: boolean
}

export interface ListItem {
  id: string
  name: string
  value?: Value[]
}

/**
 * Host-provided context for populating dynamic dropdowns in the Blockly editor.
 * The UI provides an implementation that reflects the currently open brick and level.
 */
export interface EditorContext {
  getVariables?: () => VariableItem[]
  getLists?: () => ListItem[]
  getMessages?: () => string[]
  getBricks?: () => string[]
  getCostumes?: () => string[]
  getSounds?: () => string[]
  getBackdrops?: () => string[]
  getKeys?: () => MenuOption[]
  isStage?: boolean
}

export const DEFAULT_KEYS: readonly MenuOption[] = [
  ['space', 'space'],
  ['up arrow', 'up arrow'],
  ['down arrow', 'down arrow'],
  ['right arrow', 'right arrow'],
  ['left arrow', 'left arrow'],
  ['any', 'any'],
  ['a', 'a'],
  ['b', 'b'],
  ['c', 'c'],
  ['d', 'd'],
  ['e', 'e'],
  ['f', 'f'],
  ['g', 'g'],
  ['h', 'h'],
  ['i', 'i'],
  ['j', 'j'],
  ['k', 'k'],
  ['l', 'l'],
  ['m', 'm'],
  ['n', 'n'],
  ['o', 'o'],
  ['p', 'p'],
  ['q', 'q'],
  ['r', 'r'],
  ['s', 's'],
  ['t', 't'],
  ['u', 'u'],
  ['v', 'v'],
  ['w', 'w'],
  ['x', 'x'],
  ['y', 'y'],
  ['z', 'z'],
  ['0', '0'],
  ['1', '1'],
  ['2', '2'],
  ['3', '3'],
  ['4', '4'],
  ['5', '5'],
  ['6', '6'],
  ['7', '7'],
  ['8', '8'],
  ['9', '9'],
]

export const DEFAULT_GRAPHIC_EFFECTS: readonly MenuOption[] = EFFECT_NAMES.map((name) => [name, name])

export const DEFAULT_SOUND_EFFECTS: readonly MenuOption[] = [
  ['pitch', 'pitch'],
  ['pan', 'pan'],
]

export const DEFAULT_MATH_OPERATORS: readonly MenuOption[] = [
  ['abs', 'abs'],
  ['floor', 'floor'],
  ['ceiling', 'ceiling'],
  ['sqrt', 'sqrt'],
  ['sin', 'sin'],
  ['cos', 'cos'],
  ['tan', 'tan'],
  ['asin', 'asin'],
  ['acos', 'acos'],
  ['atan', 'atan'],
  ['ln', 'ln'],
  ['log', 'log'],
  ['e ^', 'e ^'],
  ['10 ^', '10 ^'],
]

export const DEFAULT_CURRENT_MENU: readonly MenuOption[] = [
  ['year', 'YEAR'],
  ['month', 'MONTH'],
  ['date', 'DATE'],
  ['day of week', 'DAYOFWEEK'],
  ['hour', 'HOUR'],
  ['minute', 'MINUTE'],
  ['second', 'SECOND'],
]

export const DEFAULT_SENSING_OF_PROPERTIES: readonly MenuOption[] = [
  ['x position', 'x position'],
  ['y position', 'y position'],
  ['direction', 'direction'],
  ['costume #', 'costume #'],
  ['costume name', 'costume name'],
  ['size', 'size'],
  ['volume', 'volume'],
  ['backdrop #', 'backdrop #'],
  ['backdrop name', 'backdrop name'],
]

export const defaultEditorContext: EditorContext = {
  getVariables: () => [{ id: 'var_default', name: 'my variable' }],
  getLists: () => [{ id: 'list_default', name: 'my list' }],
  getMessages: () => ['message1'],
  getBricks: () => [],
  getCostumes: () => ['costume1'],
  getSounds: () => ['pop'],
  getBackdrops: () => ['backdrop1'],
  getKeys: () => [...DEFAULT_KEYS],
}

let activeContext: EditorContext = defaultEditorContext

export function setEditorContext(ctx: EditorContext): () => void {
  const previous = activeContext
  activeContext = ctx
  return () => {
    if (activeContext === ctx) activeContext = previous
  }
}

export function getEditorContext(): EditorContext {
  return activeContext
}

// ---------------------------------------------------------------- Dynamic Option Resolvers

export function getVariableOptions(ctx: EditorContext = activeContext): MenuOption[] {
  const vars = ctx.getVariables?.() ?? []
  if (vars.length === 0) return [['my variable', 'var_default']]
  return vars.map((v) => [v.name, v.id])
}

export function getListOptions(ctx: EditorContext = activeContext): MenuOption[] {
  const lists = ctx.getLists?.() ?? []
  if (lists.length === 0) return [['my list', 'list_default']]
  return lists.map((l) => [l.name, l.id])
}

export function getMessageOptions(ctx: EditorContext = activeContext): MenuOption[] {
  const msgs = ctx.getMessages?.() ?? []
  if (msgs.length === 0) return [['message1', 'message1']]
  return msgs.map((m) => [m, m])
}

export function getCostumeOptions(ctx: EditorContext = activeContext): MenuOption[] {
  const costumes = ctx.getCostumes?.() ?? []
  if (costumes.length === 0) return [['costume1', 'costume1']]
  return costumes.map((c) => [c, c])
}

export function getSoundOptions(ctx: EditorContext = activeContext): MenuOption[] {
  const sounds = ctx.getSounds?.() ?? []
  if (sounds.length === 0) return [['pop', 'pop']]
  return sounds.map((s) => [s, s])
}

export function getBackdropOptions(ctx: EditorContext = activeContext, includeSpecials = false): MenuOption[] {
  const backdrops = ctx.getBackdrops?.() ?? []
  const base: MenuOption[] = backdrops.length > 0 ? backdrops.map((b) => [b, b]) : [['backdrop1', 'backdrop1']]
  if (!includeSpecials) return base
  return [
    ...base,
    ['next backdrop', 'next backdrop'],
    ['previous backdrop', 'previous backdrop'],
    ['random backdrop', 'random backdrop'],
  ]
}

export function getKeyOptions(ctx: EditorContext = activeContext): MenuOption[] {
  const keys = ctx.getKeys?.()
  if (keys && keys.length > 0) return keys
  return [...DEFAULT_KEYS]
}

export type SpecialTarget = '_mouse_' | '_random_' | '_myself_' | '_edge_' | '_stage_'

export function getTargetOptions(
  ctx: EditorContext = activeContext,
  specials: Array<{ label: string; value: SpecialTarget }> = [],
): MenuOption[] {
  const specialOptions: MenuOption[] = specials.map((s) => [s.label, s.value])
  const bricks = ctx.getBricks?.() ?? []
  const brickOptions: MenuOption[] = bricks.map((b) => [b, b])
  const result = [...specialOptions, ...brickOptions]
  return result.length > 0 ? result : [['(none)', '']]
}
