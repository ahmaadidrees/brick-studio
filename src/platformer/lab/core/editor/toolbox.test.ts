import { describe, expect, it } from 'vitest'
import { CATEGORY_COLORS, createBlockDefinitions } from './definitions'
import {
  CONTINUOUS_TOOLBOX,
  createContinuousToolbox,
  paletteForKit,
  PLATFORMER_PALETTE,
  RACE_PALETTE,
  registerToolboxPlugins,
  THREE_D_PALETTE,
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
    // Parity bucket B (2026-11-04) added blocks on purpose: "slip past a corner up to (4) steps" (was 12927:ba548a4f),
    // then "move [x] by (2) and carry what stands on me" (was 13047:aadbcce3), then "what I hit" (was 13169:4f5ca372).
    const PLATFORMER = '13214:d96db26f'
    const PLATFORMER_STAGE = '9852:fe914df6'
    expect(sha(createContinuousToolbox())).toBe(PLATFORMER)
    expect(sha(CONTINUOUS_TOOLBOX)).toBe(PLATFORMER)
    expect(sha(createContinuousToolbox(undefined, { kit: 'platformer' }))).toBe(PLATFORMER)
    expect(sha(createContinuousToolbox(undefined, { palette: PLATFORMER_PALETTE }))).toBe(PLATFORMER)
    // Hackable 3D has a palette of its own now (the 3D category); the Platformer's is unchanged by it.
    expect(sha(createContinuousToolbox(undefined, { kit: '3d' }))).not.toBe(PLATFORMER)
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
      'label:Bricks that move themselves', 'platformer_setmover', 'platformer_moveuntilhit', 'platformer_hitsomething', 'platformer_whathit', 'platformer_slipcorner', 'platformer_movecarry', 'platformer_tellhit',
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

describe('the 3D palette (Hackable 3D D1)', () => {
  const blockTypes = (cat: ToolboxCategory | undefined) =>
    (cat?.contents ?? []).filter((item): item is ToolboxBlock => item.kind === 'block').map((item) => item.type)
  const allTypes = (toolbox: { contents: ToolboxCategory[] }) => toolbox.contents.flatMap(blockTypes)
  const three = () => createContinuousToolbox(undefined, { kit: '3d' })
  const shape = (cat: ToolboxCategory) =>
    cat.contents!.map((i) => (i.kind === 'block' ? i.type : i.kind === 'label' ? `label:${i.text}` : i.kind))

  it('is the kit\'s screens palette, picked by the kit or passed in', () => {
    expect(paletteForKit('3d')).toBe(THREE_D_PALETTE)
    expect(KIT_SCREENS['3d'].toolbox).toEqual(THREE_D_PALETTE)
    expect(createContinuousToolbox(undefined, { palette: KIT_SCREENS['3d'].toolbox })).toEqual(three())
  })

  it('has a 3D category in Platformer\'s place, in the 3D colour, with the 3D blocks in order', () => {
    expect(three().contents.map((c) => c.name)).toEqual(['My Blocks', 'Motion', 'Looks', 'Sound', 'Events', 'Control', 'Sensing', 'Operators', 'Variables', '3D'])
    const cat = three().contents.find((c) => c.name === '3D')!
    expect(cat.colour).toBe('#4B58B8')
    expect(CATEGORY_COLORS.threeD).toBe('#4B58B8')
    expect(cat.cssConfig).toEqual({ container: 'code-extension-category' })
    expect(shape(cat)).toEqual([
      'label:3D blocks', 'platformer_everytick', 'platformer_whenland', 'platformer_whenleaveground', 'platformer_whenbump',
      'sep', 'platformer_setgravity', 'platformer_setsolid',
      'sep', 'platformer_setspeed', 'platformer_changespeed', 'platformer_speed',
      'sep', 'platformer_onground',
      'sep', 'kit3d_launchlanders', 'kit3d_gohome',
    ])
    const launch = cat.contents!.find((i): i is ToolboxBlock => i.kind === 'block' && i.type === 'kit3d_launchlanders')!
    expect(launch.inputs?.SPEED?.shadow.fields?.NUM).toBe(15)
  })

  it('offers none of the hidden blocks anywhere', () => {
    const types = allTypes(three())
    for (const hidden of THREE_D_PALETTE.hide) expect(types, hidden).not.toContain(hidden)
    expect(types).not.toContain('motion_ifonedgebounce')
  })

  it('puts the z blocks in Motion next to their x and y siblings, only in 3D', () => {
    const motion = three().contents.find((c) => c.name === 'Motion')!
    const types = blockTypes(motion)
    expect(types.slice(types.indexOf('motion_gotoxy'), types.indexOf('motion_gotoxy') + 2)).toEqual(['motion_gotoxy', 'kit3d_gotoxyz'])
    expect(types.slice(types.indexOf('motion_changexby'), types.indexOf('motion_changexby') + 6)).toEqual([
      'motion_changexby', 'motion_setx', 'motion_changeyby', 'motion_sety', 'kit3d_changez', 'kit3d_setz',
    ])
    expect(types.slice(types.indexOf('motion_xposition'), types.indexOf('motion_xposition') + 3)).toEqual(['motion_xposition', 'motion_yposition', 'kit3d_zposition'])
    expect(motion.colour).toBe(CATEGORY_COLORS.motion)
    // Without the z blocks and the bounce, it is the Platformer's Motion.
    const platformerMotion = blockTypes(createContinuousToolbox().contents.find((c) => c.name === 'Motion'))
    expect(types.filter((t) => !t.startsWith('kit3d_'))).toEqual(platformerMotion.filter((t) => t !== 'motion_ifonedgebounce'))
    // The z blocks' defaults: 0, 0, 0 and change z by 1.
    const z = Object.fromEntries(motion.contents!.filter((i): i is ToolboxBlock => i.kind === 'block' && i.type.startsWith('kit3d_')).map((i) => [i.type, i.inputs]))
    expect(z.kit3d_changez?.DZ?.shadow.fields?.NUM).toBe(1)
    expect(Object.keys(z.kit3d_gotoxyz ?? {})).toEqual(['X', 'Y', 'Z'])
    // 2D palettes have no 3D blocks at all.
    for (const kit of ['platformer', 'race'] as const) {
      expect(allTypes(createContinuousToolbox(undefined, { kit })).some((t) => t.startsWith('kit3d_')), kit).toBe(false)
    }
  })

  it('every other category is the Platformer\'s own, untouched', () => {
    const others = (t: { contents: ToolboxCategory[] }) => t.contents.filter((c) => !['Motion', 'Platformer', '3D'].includes(c.name))
    expect(others(three())).toEqual(others(createContinuousToolbox()))
  })

  it('gives a 3D Stage no Motion or 3D, as the Platformer Stage', () => {
    const stage = createContinuousToolbox(undefined, { isStage: true, kit: '3d' })
    expect(stage.contents.map((c) => c.name)).toEqual(['My Blocks', 'Looks', 'Sound', 'Events', 'Control', 'Sensing', 'Operators', 'Variables'])
    expect(stage).toEqual(createContinuousToolbox(undefined, { isStage: true }))
  })

  it('defines every 3D block it offers, the z blocks in Motion\'s colour and the rest in the 3D colour', () => {
    const defs = createBlockDefinitions().filter((d) => String(d.type).startsWith('kit3d_'))
    expect(defs.map((d) => d.type).sort()).toEqual(allTypes(three()).filter((t) => t.startsWith('kit3d_')).sort())
    for (const d of defs) {
      const motion = ['kit3d_gotoxyz', 'kit3d_changez', 'kit3d_setz', 'kit3d_zposition'].includes(String(d.type))
      expect(d.colour, String(d.type)).toBe(motion ? CATEGORY_COLORS.motion : CATEGORY_COLORS.threeD)
    }
  })
})
