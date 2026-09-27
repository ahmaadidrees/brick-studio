/* Copied from src/robotics/program/workspaceJson.ts on claude/robotics-kid-int (generic, no robotics types). */
/**
 * The subset of `Blockly.serialization.workspaces.save()` output the code lab
 * reads. Mirrors `blockly/core/serialization/blocks.State` without importing Blockly,
 * so the compiler, starters and device helpers load in plain Node. Every field is
 * optional because a saved workspace is untrusted input.
 */
export type WorkspaceConnectionJson = { block?: WorkspaceBlockJson; shadow?: WorkspaceBlockJson }

export type WorkspaceBlockJson = {
  type?: unknown
  id?: unknown
  x?: unknown
  y?: unknown
  enabled?: unknown
  /** Blockly 11+: a disabled block lists why instead of `enabled: false`. */
  disabledReasons?: unknown
  extraState?: unknown
  fields?: Record<string, unknown>
  inputs?: Record<string, WorkspaceConnectionJson | undefined>
  next?: WorkspaceConnectionJson
}

export type WorkspaceVariableJson = { name?: unknown; id?: unknown; type?: unknown }

export type WorkspaceJson = {
  blocks?: { languageVersion?: unknown; blocks?: unknown }
  variables?: unknown
}

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The block a connection holds: the real block when there is one, else its shadow. */
export function connectedBlock(connection: unknown): WorkspaceBlockJson | undefined {
  if (!isRecord(connection)) return undefined
  if (isRecord(connection.block)) return connection.block as WorkspaceBlockJson
  if (isRecord(connection.shadow)) return connection.shadow as WorkspaceBlockJson
  return undefined
}

export function topBlocks(workspace: unknown): WorkspaceBlockJson[] {
  if (!isRecord(workspace) || !isRecord(workspace.blocks) || !Array.isArray(workspace.blocks.blocks)) return []
  return workspace.blocks.blocks.filter(isRecord) as WorkspaceBlockJson[]
}

export const isDisabledBlock = (block: WorkspaceBlockJson): boolean =>
  block.enabled === false || (Array.isArray(block.disabledReasons) && block.disabledReasons.length > 0)

/**
 * Every block in the workspace (top blocks, their inputs and `next` chains, shadows
 * included), visited iteratively in document order so a hostile document cannot
 * overflow the stack. Stops after `limit` blocks.
 */
export function walkBlocks(workspace: unknown, visit: (block: WorkspaceBlockJson, depth: number) => void, limit = Number.POSITIVE_INFINITY): void {
  const stack: { block: WorkspaceBlockJson; depth: number }[] = []
  const top = topBlocks(workspace)
  for (let index = top.length - 1; index >= 0; index -= 1) stack.push({ block: top[index], depth: 1 })
  let count = 0
  while (stack.length) {
    const { block, depth } = stack.pop()!
    visit(block, depth)
    count += 1
    if (count >= limit) return
    const children: { block: WorkspaceBlockJson; depth: number }[] = []
    if (isRecord(block.inputs)) {
      for (const key of Object.keys(block.inputs)) {
        const connection = block.inputs[key]
        if (!isRecord(connection)) continue
        if (isRecord(connection.block)) children.push({ block: connection.block as WorkspaceBlockJson, depth: depth + 1 })
        if (isRecord(connection.shadow)) children.push({ block: connection.shadow as WorkspaceBlockJson, depth: depth + 1 })
      }
    }
    const next = connectedBlock(block.next)
    if (next) children.push({ block: next, depth })
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index])
  }
}

/** Blockly stores variables by id; the name is what a student sees and what the IR uses. */
export function variableNames(workspace: unknown): Map<string, string> {
  const names = new Map<string, string>()
  if (!isRecord(workspace) || !Array.isArray(workspace.variables)) return names
  for (const entry of workspace.variables) if (isRecord(entry) && typeof entry.id === 'string' && typeof entry.name === 'string') names.set(entry.id, entry.name)
  return names
}

export function utf8Bytes(text: string): number {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : text.length
}

/** The JSON text of a workspace, or null when it cannot be serialised (cycles, BigInt). */
export function workspaceText(workspace: unknown): string | null {
  try {
    const text = JSON.stringify(workspace)
    return typeof text === 'string' ? text : null
  } catch {
    return null
  }
}
