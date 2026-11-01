/**
 * The known-block list (knownBlocks.ts) is a plain list so the Worker can share it. Here it is rebuilt from what is
 * really registered, so it can never fall behind the editor or the runtime.
 */
import * as ShareableProcedures from '@blockly/block-shareable-procedures'
import { describe, expect, it } from 'vitest'
import { ALL_PRIMITIVES } from '../index'
import { CONTINUOUS_TOOLBOX } from './toolbox'
import { createBlockDefinitions, HAT_OPCODES } from './definitions'
import { isKnownBlockType, KNOWN_BLOCK_TYPES } from './knownBlocks'

/** Stack blocks the runtime runs itself rather than through a primitive (core/runtime.ts). */
const RUNTIME_CONTROL = [
  'control_if', 'control_if_else', 'control_repeat', 'control_forever', 'control_repeat_until', 'control_while', 'control_wait',
  'control_wait_until', 'control_stop', 'procedures_call', 'event_broadcast', 'event_broadcastandwait',
]
/** Literal blocks the compiler reads as values (core/editor/compile.ts compileExpr). */
const LITERALS = ['math_number', 'math_positive_number', 'math_whole_number', 'math_integer', 'text', 'colour_picker']

describe('known blocks', () => {
  it('are exactly the registered blocks, the literals, the runtime opcodes and the hats', () => {
    const rebuilt = new Set<string>([
      ...createBlockDefinitions().map((d) => d.type as string),
      ...LITERALS,
      ...Object.keys(ShareableProcedures.blocks),
      ...Object.keys(ALL_PRIMITIVES),
      ...RUNTIME_CONTROL,
      ...HAT_OPCODES,
    ])
    // When this fails after adding a block, add its type to KNOWN_BLOCK_TYPES (knownBlocks.ts).
    expect([...KNOWN_BLOCK_TYPES].sort()).toEqual([...rebuilt].sort())
    expect(new Set(KNOWN_BLOCK_TYPES).size).toBe(KNOWN_BLOCK_TYPES.length)
  })

  it('include every block the palette offers', () => {
    const offered = new Set<string>()
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      const n = node as Record<string, unknown>
      if (typeof n.type === 'string' && (n.kind === 'block' || n.kind === undefined)) offered.add(n.type)
      Object.values(n).forEach(walk)
    }
    walk(CONTINUOUS_TOOLBOX)
    expect(offered.size).toBeGreaterThan(50)
    expect([...offered].filter((t) => !isKnownBlockType(t))).toEqual([])
  })

  it('do not include blocks Blockly has but Brickgineers cannot run', () => {
    for (const type of ['controls_if', 'logic_compare', 'math_arithmetic', 'text_join', 'lists_create_with', 'variables_get', 'evil_block', '__proto__']) {
      expect(isKnownBlockType(type), type).toBe(false)
    }
    expect(isKnownBlockType(undefined)).toBe(false)
  })
})
