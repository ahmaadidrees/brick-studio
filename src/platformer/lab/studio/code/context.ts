import type { EditorContext, VariableItem, ListItem } from '../../core/editor/context'
import type { StudioStore } from '../store'
import { STAGE_ID } from '../store'
import { ALL_BROADCAST_WORDS } from './words'

/**
 * Recursively scans a workspace JSON tree to extract broadcast message names.
 */
export function extractMessagesFromWorkspace(data: unknown, outMessages: Set<string>): void {
  if (!data || typeof data !== 'object') return

  if (Array.isArray(data)) {
    for (const item of data) {
      extractMessagesFromWorkspace(item, outMessages)
    }
    return
  }

  const record = data as Record<string, unknown>

  // Check fields
  if (record.fields && typeof record.fields === 'object') {
    const fields = record.fields as Record<string, unknown>
    if (typeof fields.BROADCAST_OPTION === 'string' && fields.BROADCAST_OPTION.trim()) {
      outMessages.add(fields.BROADCAST_OPTION.trim())
    }
  }

  // Check inputs
  if (record.inputs && typeof record.inputs === 'object') {
    const inputs = record.inputs as Record<string, unknown>
    const broadcastInput = inputs.BROADCAST_INPUT
    if (broadcastInput && typeof broadcastInput === 'object') {
      const bObj = broadcastInput as Record<string, unknown>
      // Shadow or block
      const target = (bObj.shadow || bObj.block) as Record<string, unknown> | undefined
      if (target?.fields && typeof target.fields === 'object') {
        const fields = target.fields as Record<string, unknown>
        const val = fields.TEXT ?? fields.BROADCAST_OPTION
        if (typeof val === 'string' && val.trim()) {
          outMessages.add(val.trim())
        }
      }
    }
  }

  // Walk any child objects or arrays
  for (const key of Object.keys(record)) {
    if (key === 'fields') continue
    const val = record[key]
    if (val && typeof val === 'object') {
      extractMessagesFromWorkspace(val, outMessages)
    }
  }
}

/**
 * Extracts all distinct broadcast message names across all workspaces in the project.
 */
export function extractBroadcastMessages(workspaces: Record<string, unknown>): string[] {
  const messages = new Set<string>()

  for (const ws of Object.values(workspaces)) {
    if (!ws) continue
    if (typeof ws === 'string') {
      try {
        const parsed = JSON.parse(ws)
        extractMessagesFromWorkspace(parsed, messages)
      } catch {
        // Skip unparseable JSON
      }
    } else {
      extractMessagesFromWorkspace(ws, messages)
    }
  }

  // If no broadcast messages found yet, include a friendly default
  if (messages.size === 0) {
    messages.add('message1')
  }

  return Array.from(messages)
}

/**
 * Extra dropdown choices that exist only while a "how it works" card loads its read-only blocks: the card's variables
 * ("x speed"), a brick ("Platform") and a message. Blockly checks a dropdown's value against its options when it loads,
 * so the card's own names must be on offer for that moment. They are never offered to the real editor.
 */
interface CardExtras {
  variables: VariableItem[]
  bricks: string[]
  messages: string[]
}
let cardExtras: CardExtras | null = null

export function withCardContext<T>(extras: CardExtras, fn: () => T): T {
  const previous = cardExtras
  cardExtras = extras
  try {
    return fn()
  } finally {
    cardExtras = previous
  }
}

/**
 * Builds an EditorContext instance for Blockly block definitions and dropdowns
 * based on the current StudioStore state.
 */
export function buildEditorContext(store: StudioStore): EditorContext {
  const state = store.getState()
  const brickId = state.selectedBrickId
  const isStage = brickId === STAGE_ID
  const brick = store.brick(brickId)
  const stage = store.brick(STAGE_ID)

  // 1. Variables: this brick's variables + stage's variables (globals)
  const brickVars = brick?.program?.variables ?? []
  const stageVars = isStage ? [] : (stage?.program?.variables ?? [])
  const seenVarIds = new Set<string>()
  const variables: VariableItem[] = []

  for (const v of [...brickVars, ...stageVars]) {
    if (!seenVarIds.has(v.id)) {
      seenVarIds.add(v.id)
      variables.push({
        id: v.id,
        name: v.name,
        value: v.value,
        showInBuild: v.showInBuild,
      })
    }
  }

  // 2. Lists: this brick's lists + stage's lists (globals)
  const brickLists = brick?.program?.lists ?? []
  const stageLists = isStage ? [] : (stage?.program?.lists ?? [])
  const seenListIds = new Set<string>()
  const lists: ListItem[] = []

  for (const l of [...brickLists, ...stageLists]) {
    if (!seenListIds.has(l.id)) {
      seenListIds.add(l.id)
      lists.push({
        id: l.id,
        name: l.name,
        value: l.value,
      })
    }
  }

  // 3. Broadcast messages across every brick's workspace
  const workspaceMessages = extractBroadcastMessages(state.project.workspaces)
  // Ensure default broadcast words are easily reachable if needed
  const messages = Array.from(new Set([...workspaceMessages, ALL_BROADCAST_WORDS[0]]))

  // 4. Brick names
  const brickNames = state.project.design.bricks.map((b) => b.name)

  // 5. Costumes and Sounds for this brick
  const costumes = (brick?.costumes ?? []).map((c) => c.name)
  const sounds = (brick?.sounds ?? []).map((s) => s.name)

  // 6. Stage backdrops
  const backdrops = (stage?.costumes ?? []).map((c) => c.name)

  return {
    getVariables: () => (cardExtras ? [...variables, ...cardExtras.variables] : variables),
    getLists: () => lists,
    getMessages: () => (cardExtras ? [...messages, ...cardExtras.messages] : messages),
    getBricks: () => (cardExtras ? [...brickNames, ...cardExtras.bricks] : brickNames),
    getCostumes: () => costumes,
    getSounds: () => sounds,
    getBackdrops: () => backdrops,
    isStage,
  }
}
