import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, createBlockDefinitions } from './definitions'
import {
  CONTINUOUS_TOOLBOX,
  createContinuousToolbox,
  paletteForKit,
  PLATFORMER_PALETTE,
  RACE_PALETTE,
  registerToolboxPlugins,
  type ToolboxBlock,
  type ToolboxCategory,
} from './toolbox'
import { KIT_SCREENS } from '../../studio/kitScreens'

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

describe('the palette by kit (docs/qa/hackable-modes/R1-SCREENS.md, lane 3)', () => {
  /** FNV-1a over the palette's JSON, with its length: any change to the palette changes it. */
  const sha = (value: unknown) => {
    const text = JSON.stringify(value)
    let h = 0x811c9dc5
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0
    return `${text.length}:${h.toString(16).padStart(8, '0')}`
  }
  const blockTypes = (cat: ToolboxCategory | undefined) =>
    (cat?.contents ?? []).filter((item): item is ToolboxBlock => item.kind === 'block').map((item) => item.type)
  const allTypes = (toolbox: { contents: ToolboxCategory[] }) => toolbox.contents.flatMap(blockTypes)
  const race = () => createContinuousToolbox(undefined, { kit: 'race' })

  it('keeps the Platformer palette byte for byte as it was before kits (a202bb8)', () => {
    // Pinned from createContinuousToolbox() at a202bb8 (its JSON length and FNV-1a). A change here changes every Platformer kid's palette.
    // Parity bucket B (2026-11-04) added one block on purpose: "slip past a corner up to (4) steps" (was 12927:ba548a4f).
    const PLATFORMER = '13047:aadbcce3'
    const PLATFORMER_STAGE = '9852:fe914df6'
    expect(sha(createContinuousToolbox())).toBe(PLATFORMER)
    expect(sha(CONTINUOUS_TOOLBOX)).toBe(PLATFORMER)
    expect(sha(createContinuousToolbox(undefined, { kit: 'platformer' }))).toBe(PLATFORMER)
    expect(sha(createContinuousToolbox(undefined, { palette: PLATFORMER_PALETTE }))).toBe(PLATFORMER)
    // A kit with no palette of its own (3D never opens the studio) gets the Platformer's.
    expect(sha(createContinuousToolbox(undefined, { kit: '3d' }))).toBe(PLATFORMER)
    expect(sha(createContinuousToolbox(undefined, { isStage: true }))).toBe(PLATFORMER_STAGE)
    expect(sha(createContinuousToolbox(undefined, { isStage: true, kit: 'platformer' }))).toBe(PLATFORMER_STAGE)
  })

  it('gives a race a Racing category, in the Racing colour, with the five Racing blocks, just before Platformer', () => {
    const names = race().contents.map((c) => c.name)
    expect(names).toEqual(['My Blocks', 'Motion', 'Looks', 'Sound', 'Events', 'Control', 'Sensing', 'Operators', 'Variables', 'Racing', 'Platformer'])
    const racing = race().contents.find((c) => c.name === 'Racing')!
    expect(racing.colour).toBe(CATEGORY_COLORS.race)
    expect(racing.cssConfig).toEqual({ container: 'code-extension-category' })
    expect(blockTypes(racing)).toEqual(['race_whenlap', 'race_lapsdone', 'race_myplace', 'race_groundunder', 'race_trackdirection'])
    // Every Racing block the editor defines is in the palette, and each is drawn in the Racing colour.
    const defs = createBlockDefinitions().filter((d) => String(d.type).startsWith('race_'))
    expect(defs.map((d) => d.type).sort()).toEqual(blockTypes(racing).sort())
    for (const d of defs) expect(d.colour, String(d.type)).toBe(CATEGORY_COLORS.race)
    // The Platformer never sees them.
    expect(allTypes(createContinuousToolbox()).some((t) => t.startsWith('race_'))).toBe(false)
  })

  it('leaves out the Platformer blocks that need gravity and a floor, and only those, without stray gaps', () => {
    expect(RACE_PALETTE.hide).toEqual(['platformer_whenland', 'platformer_whenleaveground', 'platformer_setgravity', 'platformer_onground', 'platformer_setonground'])
    const types = allTypes(race())
    for (const hidden of RACE_PALETTE.hide) expect(types, hidden).not.toContain(hidden)
    const platformerTypes = allTypes(createContinuousToolbox())
    expect(types.filter((t) => !t.startsWith('race_'))).toEqual(platformerTypes.filter((t) => !RACE_PALETTE.hide.includes(t)))
    const platformer = race().contents.find((c) => c.name === 'Platformer')!
    expect(platformer.contents!.map((i) => (i.kind === 'block' ? i.type : i.kind === 'label' ? `label:${i.text}` : i.kind))).toEqual([
      'label:Platformer blocks', 'platformer_everytick', 'platformer_whenbump',
      'sep', 'platformer_setsolid',
      'sep', 'platformer_setspeed', 'platformer_changespeed', 'platformer_speed',
      'label:Bricks that move themselves', 'platformer_setmover', 'platformer_moveuntilhit', 'platformer_hitsomething', 'platformer_slipcorner', 'platformer_tellhit',
    ])
    // Every other category is the Platformer's own, untouched.
    const others = (t: { contents: ToolboxCategory[] }) => t.contents.filter((c) => c.name !== 'Racing' && c.name !== 'Platformer')
    expect(others(race())).toEqual(others(createContinuousToolbox()))
  })

  it('gives a race Stage no Motion, Platformer or Racing, as the Platformer Stage', () => {
    const stage = createContinuousToolbox(undefined, { isStage: true, kit: 'race' })
    expect(stage.contents.map((c) => c.name)).toEqual(['My Blocks', 'Looks', 'Sound', 'Events', 'Control', 'Sensing', 'Operators', 'Variables'])
    expect(stage).toEqual(createContinuousToolbox(undefined, { isStage: true }))
  })

  it('a palette passed in wins over the kit, and matches the kits\' screens descriptor', () => {
    expect(paletteForKit('race')).toBe(RACE_PALETTE)
    expect(paletteForKit('platformer')).toBe(PLATFORMER_PALETTE)
    expect(paletteForKit(undefined)).toBe(PLATFORMER_PALETTE)
    expect(createContinuousToolbox(undefined, { kit: 'platformer', palette: RACE_PALETTE })).toEqual(race())
    // studio/kitScreens.ts says the same thing, so passing its `toolbox` or only the kit gives one palette.
    expect(KIT_SCREENS.race.toolbox).toEqual(RACE_PALETTE)
    expect(KIT_SCREENS.platformer.toolbox).toEqual(PLATFORMER_PALETTE)
  })
})
