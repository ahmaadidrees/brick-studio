/**
 * Every number or text slot keeps a value to type into, as in Scratch. A slot filled with a reporter
 * ("set jump now to (jump standing)") may have no number underneath it: the Hero, the bricks and the powers are built
 * that way. Pulling the reporter out then left an empty pill that took no typing, and the script read it as nothing
 * (the Hero stopped jumping).
 *
 *  - When a reporter leaves such a slot, the slot gets a number (or text) to type into. If the reporter was a variable
 *    with a number in it, the slot starts at that number, so the script keeps working the same until the kid types.
 *  - When a brick's code opens, empty slots get one too (projects saved with the bug). That is not an edit: nothing is
 *    saved until the kid changes something.
 * Yes/no slots (hexagons) stay empty, as in Scratch.
 */
import * as Blockly from 'blockly/core'
import type { Value } from '../../core/contracts'
import type { ContinuousToolboxDefinition, ToolboxShadow } from '../../core/editor/toolbox'

/** blockType -> input name -> the shadow the palette gives that input. */
export type SlotShadows = Map<string, Record<string, ToolboxShadow>>

export function slotShadowsFromToolbox(toolbox: ContinuousToolboxDefinition): SlotShadows {
  const map: SlotShadows = new Map()
  for (const category of toolbox.contents) {
    for (const item of category.contents ?? []) {
      if (item.kind !== 'block' || !item.inputs) continue
      const inputs = { ...(map.get(item.type) ?? {}) }
      for (const [name, conn] of Object.entries(item.inputs)) if (conn?.shadow && !inputs[name]) inputs[name] = conn.shadow
      map.set(item.type, inputs)
    }
  }
  return map
}

const NUMBER_SHADOWS = new Set(['math_number', 'math_positive_number', 'math_whole_number', 'math_integer'])

/**
 * The shadow a slot gets, or null for a slot that takes no typing (yes/no). `check` is the input's connection check.
 * `value` is what the slot held (a variable's number) when there is one.
 */
export function slotShadowFor(shadows: SlotShadows, blockType: string, inputName: string, check: readonly string[] | null, value?: Value): ToolboxShadow | null {
  const known = shadows.get(blockType)?.[inputName]
  const usable = typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value !== '' ? value : undefined
  if (known) {
    if (usable !== undefined && NUMBER_SHADOWS.has(known.type) && typeof usable === 'number') return { type: known.type, fields: { NUM: usable } }
    if (usable !== undefined && known.type === 'text') return { type: 'text', fields: { TEXT: String(usable) } }
    return { type: known.type, ...(known.fields ? { fields: { ...known.fields } } : {}) }
  }
  if (check && !check.includes('Number') && !check.includes('String')) return null
  // A My Block's inputs are text slots, as in Scratch (they take words and numbers).
  const text = blockType === 'procedures_call' || (check !== null && !check.includes('Number'))
  if (text) return { type: 'text', fields: { TEXT: usable === undefined ? '' : String(usable) } }
  const num = typeof usable === 'number' ? usable : typeof usable === 'string' && usable.trim() !== '' && Number.isFinite(Number(usable)) ? Number(usable) : 0
  return { type: 'math_number', fields: { NUM: num } }
}

const SKIP_BLOCKS = new Set(['procedures_definition', 'procedures_prototype'])

/** Give one empty slot its shadow. Returns true when it added one. */
function fillSlot(block: Blockly.Block, input: Blockly.Input, shadows: SlotShadows, value?: Value): boolean {
  const conn = input.connection
  if (input.type !== Blockly.inputs.inputTypes.VALUE || !conn) return false
  if (block.isShadow() || SKIP_BLOCKS.has(block.type)) return false
  if (conn.targetBlock() || conn.getShadowState()) return false
  const spec = slotShadowFor(shadows, block.type, input.name, conn.getCheck(), value)
  if (!spec) return false
  conn.setShadowState(spec as Blockly.serialization.blocks.State)
  return true
}

/** On load: empty number and text slots get a value to type into. Not recorded (no undo step, no save). */
export function fillEmptySlots(ws: Blockly.Workspace, shadows: SlotShadows): number {
  let filled = 0
  const wasEnabled = Blockly.Events.isEnabled()
  Blockly.Events.disable()
  try {
    for (const block of ws.getAllBlocks(false)) {
      for (const input of block.inputList) if (fillSlot(block, input, shadows)) filled++
    }
  } finally {
    if (wasEnabled) Blockly.Events.enable()
  }
  return filled
}

/**
 * After a reporter leaves a slot (dragged out, or deleted), give the slot a value to type into, in the same undo step.
 * `valueOf` answers a variable's number by id.
 */
export function refillUnpluggedSlot(ws: Blockly.Workspace, event: Blockly.Events.Abstract, shadows: SlotShadows, valueOf: (variableId: string) => Value | undefined): boolean {
  if (event.type !== Blockly.Events.BLOCK_MOVE) return false
  const move = event as Blockly.Events.BlockMove
  if (!move.oldParentId || !move.oldInputName) return false
  const parent = ws.getBlockById(move.oldParentId)
  const input = parent?.getInput(move.oldInputName)
  if (!parent || !input) return false
  const moved = move.blockId ? ws.getBlockById(move.blockId) : null
  const variableId = moved?.type === 'data_variable' ? moved.getFieldValue('VARIABLE') : null
  const value = typeof variableId === 'string' ? valueOf(variableId) : undefined
  const group = Blockly.Events.getGroup()
  Blockly.Events.setGroup(move.group || true)
  try {
    return fillSlot(parent, input, shadows, value)
  } finally {
    Blockly.Events.setGroup(group)
  }
}
