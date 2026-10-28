import * as Blockly from 'blockly/core'
import { describe, expect, it } from 'vitest'
import {
  CATEGORY_COLORS,
  HAT_OPCODES,
  createBlockDefinitions,
  isHatOpcode,
  registerEditorBlocks,
} from './definitions'

describe('Blockly block definitions', () => {
  it('covers every HatOpcode in contracts.ts', () => {
    const defs = createBlockDefinitions()
    const defTypes = new Set(defs.map((d) => d.type as string))

    for (const hat of HAT_OPCODES) {
      expect(isHatOpcode(hat)).toBe(true)
      expect(defTypes.has(hat)).toBe(true)
    }
    expect(isHatOpcode('not_a_hat')).toBe(false)
  })

  it('contains block definitions for all 9 Scratch categories with matching colors', () => {
    const defs = createBlockDefinitions()
    const categories = new Set(defs.map((d) => d.category as string))

    expect(categories.has('motion')).toBe(true)
    expect(categories.has('looks')).toBe(true)
    expect(categories.has('sound')).toBe(true)
    expect(categories.has('events')).toBe(true)
    expect(categories.has('control')).toBe(true)
    expect(categories.has('sensing')).toBe(true)
    expect(categories.has('operators')).toBe(true)
    expect(categories.has('variables')).toBe(true)
    expect(categories.has('lists')).toBe(true)
    expect(categories.has('procedures')).toBe(true)

    for (const def of defs) {
      const cat = def.category as keyof typeof CATEGORY_COLORS
      if (cat && CATEGORY_COLORS[cat]) {
        expect(def.colour).toBe(CATEGORY_COLORS[cat])
      }
    }
  })

  it('registers all definitions into Blockly.Blocks without error', () => {
    registerEditorBlocks()
    const defs = createBlockDefinitions()
    for (const def of defs) {
      const type = def.type as string
      expect(Blockly.Blocks[type]).toBeDefined()
    }
  })

  it('re-registers cleanly when called repeatedly with updated context', () => {
    registerEditorBlocks()
    registerEditorBlocks({
      getVariables: () => [{ id: 'custom_var', name: 'my_counter' }],
    })
    expect(Blockly.Blocks['data_variable']).toBeDefined()
  })
})
