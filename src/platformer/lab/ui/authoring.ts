import type { BlockDeclaration, VariableDeclaration } from '../program/catalog'
import { isSafeIdentifier } from '../program/types'

type JsonBlock = { type?: unknown; fields?: Record<string, unknown>; inputs?: Record<string, { block?: JsonBlock; shadow?: JsonBlock }>; next?: { block?: JsonBlock } }

function visit(block: JsonBlock | undefined, fn: (block: JsonBlock) => void) {
  if (!block) return
  fn(block)
  for (const input of Object.values(block.inputs ?? {})) {
    visit(input.block, fn)
    visit(input.shadow, fn)
  }
  visit(block.next?.block, fn)
}

function sourceBlocks(source: unknown): JsonBlock[] {
  if (!source || typeof source !== 'object') return []
  const blocks = (source as { blocks?: { blocks?: JsonBlock[] } }).blocks?.blocks
  return Array.isArray(blocks) ? blocks : []
}

function safeScope(value: unknown): VariableDeclaration['scope'] | null {
  return value === 'my' || value === 'player' || value === 'world' ? value : null
}

/** Keep declarations next to Blockly JSON; also recover names from older programs that had free-text variable blocks. */
export function readVariableDeclarations(source: unknown): VariableDeclaration[] {
  const result = new Map<string, VariableDeclaration>()
  const add = (name: unknown, scope: unknown) => {
    if (typeof name !== 'string' || !isSafeIdentifier(name)) return
    const checkedScope = safeScope(scope)
    if (!checkedScope) return
    result.set(`${checkedScope}:${name}`, { name, scope: checkedScope })
  }
  if (source && typeof source === 'object') {
    const declarations = (source as { labVariables?: unknown }).labVariables
    if (Array.isArray(declarations)) for (const item of declarations) if (item && typeof item === 'object') {
      const variable = item as { name?: unknown; scope?: unknown }
      add(variable.name, variable.scope)
    }
  }
  for (const top of sourceBlocks(source)) visit(top, (block) => {
    if (block.type === 'lab_variable' || block.type === 'lab_set_variable' || block.type === 'lab_change_variable') add(block.fields?.NAME, block.fields?.SCOPE)
  })
  return [...result.values()]
}

export function readBlockDeclarations(source: unknown): BlockDeclaration[] {
  const result = new Map<string, BlockDeclaration>()
  for (const top of sourceBlocks(source)) {
    if (top.type !== 'lab_define') continue
    const name = top.fields?.NAME
    if (typeof name !== 'string' || !isSafeIdentifier(name)) continue
    const args = [top.fields?.ARG1, top.fields?.ARG2, top.fields?.ARG3].filter((value): value is string => typeof value === 'string' && isSafeIdentifier(value))
    result.set(name, { name, args })
  }
  return [...result.values()]
}

export function withVariableDeclarations<T extends Record<string, unknown>>(workspace: T, variables: readonly VariableDeclaration[]): T & { labVariables?: VariableDeclaration[] } {
  return variables.length ? { ...workspace, labVariables: variables.map((variable) => ({ ...variable })) } : workspace
}
