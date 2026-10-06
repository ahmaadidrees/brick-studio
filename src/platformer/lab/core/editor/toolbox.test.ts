import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS } from './definitions'
import {
  CONTINUOUS_TOOLBOX,
  createContinuousToolbox,
  registerToolboxPlugins,
  type ToolboxBlock,
} from './toolbox'

describe('Continuous Toolbox configuration', () => {
  it('lists My Blocks first, then the Scratch categories in order, then Platformer', () => {
    const toolbox = createContinuousToolbox()
    expect(toolbox.kind).toBe('categoryToolbox')
    expect(toolbox.contents).toHaveLength(10)

    const expectedCategories = [
      { name: 'My Blocks', colour: CATEGORY_COLORS.procedures },
      { name: 'Motion', colour: CATEGORY_COLORS.motion },
      { name: 'Looks', colour: CATEGORY_COLORS.looks },
      { name: 'Sound', colour: CATEGORY_COLORS.sound },
      { name: 'Events', colour: CATEGORY_COLORS.events },
      { name: 'Control', colour: CATEGORY_COLORS.control },
      { name: 'Sensing', colour: CATEGORY_COLORS.sensing },
      { name: 'Operators', colour: CATEGORY_COLORS.operators },
      { name: 'Variables', colour: CATEGORY_COLORS.variables },
      { name: 'Platformer', colour: CATEGORY_COLORS.platformer },
    ]

    for (let i = 0; i < expectedCategories.length; i++) {
      expect(toolbox.contents[i].name).toBe(expectedCategories[i].name)
      expect(toolbox.contents[i].colour).toBe(expectedCategories[i].colour)
    }
  })

  it('configures shadow blocks for inputs', () => {
    const motion = CONTINUOUS_TOOLBOX.contents.find((c) => c.name === 'Motion')!
    const moveBlock = motion.contents?.find(
      (item): item is ToolboxBlock => item.kind === 'block' && item.type === 'motion_movesteps',
    )
    expect(moveBlock).toBeDefined()
    expect(moveBlock?.inputs?.STEPS?.shadow?.type).toBe('math_number')
    expect(moveBlock?.inputs?.STEPS?.shadow?.fields?.NUM).toBe(10)
  })

  it('configures custom procedure category for My Blocks', () => {
    const myBlocks = CONTINUOUS_TOOLBOX.contents[0]
    expect(myBlocks.name).toBe('My Blocks')
    expect(myBlocks.custom).toBe('PROCEDURE')
  })

  it('registers continuous toolbox and procedure serializer plugins without error', () => {
    expect(() => registerToolboxPlugins()).not.toThrow()
    // Calling a second time should be idempotent
    expect(() => registerToolboxPlugins()).not.toThrow()
  })
})
