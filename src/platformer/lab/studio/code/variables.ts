/**
 * Variables in the Code tab, Scratch's way: kids type a name (the word list is only suggestions), a name is used once,
 * and the variable menu offers Rename and Delete.
 */
import type * as Blockly from 'blockly/core'

export const MAX_VARIABLE_NAME = 24

export type VariableKind = 'variable' | 'list'

/** Why a name can't be used, in kid words; null when it is fine. `taken` holds every name it must not repeat. */
export function variableNameProblem(name: string, taken: readonly string[], kind: VariableKind = 'variable'): string | null {
  const n = name.trim()
  if (!n) return 'Type a name first.'
  if (n.length > MAX_VARIABLE_NAME) return `That name is too long. Keep it to ${MAX_VARIABLE_NAME} letters.`
  const lower = n.toLowerCase()
  if (taken.some((t) => t.trim().toLowerCase() === lower)) return `There’s already a ${kind} called “${n}”. Try another name.`
  return null
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

function parseWorkspace(ws: unknown): Json | null {
  if (typeof ws === 'string') {
    try {
      const parsed: unknown = JSON.parse(ws)
      return isRecord(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return isRecord(ws) ? ws : null
}

/** A saved workspace with one variable (or list) renamed. Blocks refer to it by id, so only the declaration changes. */
export function renameInWorkspace(ws: unknown, id: string, name: string): Json | null {
  const json = parseWorkspace(ws)
  if (!json || !Array.isArray(json.variables)) return null
  let found = false
  const variables = json.variables.map((v: unknown) => {
    if (!isRecord(v) || v.id !== id) return v
    found = true
    return { ...v, name }
  })
  return found ? { ...json, variables } : null
}

/** Does this saved workspace have a block that reads or sets the variable (or list)? */
export function workspaceUsesVariable(ws: unknown, id: string): boolean {
  const json = parseWorkspace(ws)
  if (!json) return false
  const walk = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.some(walk)
    if (!isRecord(node)) return false
    if (isRecord(node.fields) && (node.fields.VARIABLE === id || node.fields.LIST === id)) return true
    return Object.entries(node).some(([key, value]) => key !== 'variables' && walk(value))
  }
  return walk(json.blocks)
}

/** The kid's blocks (not the palette's) that read or set the variable. */
export function variableUses(ws: Blockly.Workspace, id: string): Blockly.Block[] {
  return ws.getAllBlocks(false).filter((b) => !b.isShadow() && (b.getField('VARIABLE')?.getValue() === id || b.getField('LIST')?.getValue() === id))
}

interface DropdownInternals {
  getOptions(useCache?: boolean): unknown
  doValueUpdate_(value: string): void
  forceRerender(): void
  getValue(): unknown
}

/** After a rename, every menu showing the variable reads its new name. */
export function refreshVariableFields(ws: Blockly.Workspace, id: string): void {
  for (const block of ws.getAllBlocks(false)) {
    for (const name of ['VARIABLE', 'LIST']) {
      const field = block.getField(name) as unknown as DropdownInternals | null
      if (!field || field.getValue() !== id || typeof field.doValueUpdate_ !== 'function') continue
      field.getOptions(false)
      field.doValueUpdate_(id)
      field.forceRerender()
    }
  }
}
