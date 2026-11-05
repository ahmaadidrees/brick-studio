import * as Blockly from 'blockly/core'
import { RecyclableBlockFlyoutInflater, registerContinuousToolbox } from '@blockly/continuous-toolbox'
import * as ShareableProcedures from '@blockly/block-shareable-procedures'
import type { EditorContext } from './context'
import type { KitId } from '../contracts'
import { CATEGORY_COLORS, parseProccode } from './definitions'

export interface ToolboxShadow {
  type: string
  fields?: Record<string, unknown>
}

export interface ToolboxBlock {
  kind: 'block'
  type: string
  inputs?: Record<string, { shadow: ToolboxShadow }>
  fields?: Record<string, unknown>
  extraState?: Record<string, unknown>
}

export interface ToolboxButton {
  kind: 'button'
  text: string
  callbackKey: string
}

export interface ToolboxSep {
  kind: 'sep'
}

export interface ToolboxLabel {
  kind: 'label'
  text: string
}

export type ToolboxCategoryItem = ToolboxBlock | ToolboxButton | ToolboxSep | ToolboxLabel

export interface ToolboxCategory {
  kind: 'category'
  name: string
  colour: string
  contents?: ToolboxCategoryItem[]
  custom?: string
  /** Blockly category CSS classes (e.g. the extension-style header). */
  cssConfig?: { container?: string; row?: string; label?: string }
}

export interface ContinuousToolboxDefinition {
  kind: 'categoryToolbox'
  contents: ToolboxCategory[]
}

function numShadow(value: number): { shadow: ToolboxShadow } {
  return { shadow: { type: 'math_number', fields: { NUM: value } } }
}

function textShadow(value: string): { shadow: ToolboxShadow } {
  return { shadow: { type: 'text', fields: { TEXT: value } } }
}

/**
 * What a kit changes in the palette: a Racing category, the 3D category in place of Platformer (with the z blocks in
 * Motion), and block types left out (studio/kitScreens.ts `toolbox`).
 */
export interface KitPalette {
  racing: boolean
  threeD?: boolean
  hide: readonly string[]
  /**
   * Start from nothing (docs/qa/blank-2d): one Game category instead of Platformer and Racing, holding its own blocks
   * ("touching the player?") and then every Platformer and Racing block.
   */
  game?: boolean
}

/** The Platformer's palette: everything, as it has always been. */
export const PLATFORMER_PALETTE: KitPalette = { racing: false, hide: [] }

/**
 * Hackable Racing's palette: the Racing blocks, without the Platformer blocks that only mean something with gravity and
 * a floor (a car seen from above never lands, leaves the ground or stands on anything). Scripts that already hold one,
 * like the Car's "no gravity", keep it; it just isn't offered.
 */
export const RACE_PALETTE: KitPalette = {
  racing: true,
  hide: ['platformer_whenland', 'platformer_whenleaveground', 'platformer_setgravity', 'platformer_onground', 'platformer_setonground'],
}

/** Start from nothing's palette: everything, in one Game category. */
export const GAME_PALETTE: KitPalette = { racing: true, hide: [], game: true }

/**
 * Hackable 3D's palette (the same values as studio/kitScreens.ts KIT_SCREENS['3d'].toolbox; a test keeps them equal):
 * the 3D category, without the Platformer blocks that move a brick by its own 2D sweep or set "on ground" by hand, and
 * without "if on edge, bounce" (a build plate has no edge to bounce on).
 */
export const THREE_D_PALETTE: KitPalette = {
  racing: false,
  threeD: true,
  hide: ['platformer_setmover', 'platformer_moveuntilhit', 'platformer_hitsomething', 'platformer_tellhit', 'platformer_setonground', 'motion_ifonedgebounce'],
}

/** A kit's palette: Hackable Racing's, Start from nothing's, Hackable 3D's, or the Platformer's (no kit, or the Platformer). */
export function paletteForKit(kit: KitId | undefined): KitPalette {
  return kit === 'race' ? RACE_PALETTE : kit === 'blank' ? GAME_PALETTE : kit === '3d' ? THREE_D_PALETTE : PLATFORMER_PALETTE
}

/** The Game category: its own blocks first, then the Platformer's and Racing's under their own labels. */
function gameCategory(platformer: ToolboxCategory, racing: ToolboxCategory): ToolboxCategory {
  const body = (cat: ToolboxCategory) => cat.contents ?? []
  return {
    kind: 'category',
    name: 'Game',
    colour: CATEGORY_COLORS.game,
    cssConfig: { container: 'code-extension-category' },
    contents: [
      { kind: 'label', text: 'Game blocks' },
      { kind: 'block', type: 'game_touchingplayer' },
      ...body(platformer),
      ...body(racing),
    ],
  }
}

/** The Racing extension (Hackable Racing R1): laps and the track, in the Racing colour. */
function racingCategory(): ToolboxCategory {
  return {
    kind: 'category',
    name: 'Racing',
    colour: CATEGORY_COLORS.race,
    cssConfig: { container: 'code-extension-category' },
    contents: [
      { kind: 'label', text: 'Racing blocks' },
      { kind: 'block', type: 'race_whenlap' },
      { kind: 'sep' },
      { kind: 'block', type: 'race_lapsdone' },
      { kind: 'block', type: 'race_myplace' },
      { kind: 'sep' },
      { kind: 'block', type: 'race_groundunder' },
      { kind: 'block', type: 'race_trackdirection' },
    ],
  }
}

/**
 * The 3D category (Hackable 3D): the Platformer's blocks that still mean something on a build plate (they take x, y and
 * z there), then the two only 3D has. It stands where Platformer stands, in the 3D colour.
 */
function threeDCategory(): ToolboxCategory {
  return {
    kind: 'category',
    name: '3D',
    colour: CATEGORY_COLORS.threeD,
    cssConfig: { container: 'code-extension-category' },
    contents: [
      { kind: 'label', text: '3D blocks' },
      { kind: 'block', type: 'platformer_everytick' },
      { kind: 'block', type: 'platformer_whenland' },
      { kind: 'block', type: 'platformer_whenleaveground' },
      { kind: 'block', type: 'platformer_whenbump' },
      { kind: 'sep' },
      { kind: 'block', type: 'platformer_setgravity' },
      { kind: 'block', type: 'platformer_setsolid' },
      { kind: 'sep' },
      { kind: 'block', type: 'platformer_setspeed', inputs: { SPEED: numShadow(5) } },
      { kind: 'block', type: 'platformer_changespeed', inputs: { SPEED: numShadow(1) } },
      { kind: 'block', type: 'platformer_speed' },
      { kind: 'sep' },
      { kind: 'block', type: 'platformer_onground' },
      { kind: 'sep' },
      { kind: 'block', type: 'kit3d_launchlanders', inputs: { SPEED: numShadow(15) } },
      { kind: 'block', type: 'kit3d_gohome' },
    ],
  }
}

/** The Motion blocks with a z, each placed just after its x and y sibling (in studs, like every 3D distance). */
const MOTION_Z_BLOCKS: ReadonlyArray<{ after: string; block: ToolboxBlock }> = [
  { after: 'motion_gotoxy', block: { kind: 'block', type: 'kit3d_gotoxyz', inputs: { X: numShadow(0), Y: numShadow(0), Z: numShadow(0) } } },
  { after: 'motion_sety', block: { kind: 'block', type: 'kit3d_changez', inputs: { DZ: numShadow(1) } } },
  { after: 'kit3d_changez', block: { kind: 'block', type: 'kit3d_setz', inputs: { Z: numShadow(0) } } },
  { after: 'motion_yposition', block: { kind: 'block', type: 'kit3d_zposition' } },
]

function withZ(motion: ToolboxCategory): ToolboxCategory {
  const contents = [...(motion.contents ?? [])]
  for (const { after, block } of MOTION_Z_BLOCKS) {
    const i = contents.findIndex((item) => item.kind === 'block' && item.type === after)
    contents.splice(i < 0 ? contents.length : i + 1, 0, block)
  }
  return { ...motion, contents }
}

/** A category without the hidden blocks, and without the gaps they leave: no gap first, last, twice, or before a label. */
function withoutHidden(category: ToolboxCategory, hide: ReadonlySet<string>): ToolboxCategory {
  if (!category.contents || !category.contents.some((item) => item.kind === 'block' && hide.has(item.type))) return category
  const kept = category.contents.filter((item) => !(item.kind === 'block' && hide.has(item.type)))
  const contents = kept.filter((item, i) => {
    if (item.kind !== 'sep') return true
    const prev = kept[i - 1]
    const next = kept[i + 1]
    return !!prev && !!next && prev.kind !== 'sep' && next.kind !== 'sep' && next.kind !== 'label'
  })
  return { ...category, contents }
}

/**
 * Creates the complete continuous-category toolbox specification for Scratch 3 opcodes.
 * If isStage is true, the Motion category is omitted. `kit` is the project's Hackable kit (missing means the
 * Platformer) and picks its palette (`paletteForKit`); `palette` overrides it (the kit's screens descriptor).
 * The Platformer's palette is exactly the one it has always had. In a 3D palette the 3D category replaces Platformer
 * and Motion gains go to x y z, change z by, set z to and z position.
 */
export function createContinuousToolbox(
  context?: EditorContext,
  options?: { isStage?: boolean; kit?: KitId; palette?: KitPalette },
): ContinuousToolboxDefinition {
  const isStage = options?.isStage ?? context?.isStage ?? false
  const palette = options?.palette ?? paletteForKit(options?.kit)

  const allCategories: ToolboxCategory[] = [
    // 0. My Blocks (Procedures): first, so the kid's own blocks are the first thing in the palette
    {
      kind: 'category',
      name: 'My Blocks',
      colour: CATEGORY_COLORS.procedures,
      custom: 'PROCEDURE',
      contents: [
        {
          kind: 'button',
          text: 'Make a Block',
          callbackKey: 'MAKE_A_PROCEDURE',
        },
      ],
    },

    // 1. Motion
    {
      kind: 'category',
      name: 'Motion',
      colour: CATEGORY_COLORS.motion,
      contents: [
        { kind: 'block', type: 'motion_movesteps', inputs: { STEPS: numShadow(10) } },
        { kind: 'block', type: 'motion_turnright', inputs: { DEGREES: numShadow(15) } },
        { kind: 'block', type: 'motion_turnleft', inputs: { DEGREES: numShadow(15) } },
        { kind: 'sep' },
        { kind: 'block', type: 'motion_pointindirection', inputs: { DIRECTION: numShadow(90) } },
        { kind: 'block', type: 'motion_pointtowards' },
        { kind: 'sep' },
        {
          kind: 'block',
          type: 'motion_gotoxy',
          inputs: { X: numShadow(0), Y: numShadow(0) },
        },
        { kind: 'block', type: 'motion_goto' },
        {
          kind: 'block',
          type: 'motion_glideto',
          inputs: { SECS: numShadow(1) },
        },
        {
          kind: 'block',
          type: 'motion_glidesecstoxy',
          inputs: { SECS: numShadow(1), X: numShadow(0), Y: numShadow(0) },
        },
        { kind: 'sep' },
        { kind: 'block', type: 'motion_changexby', inputs: { DX: numShadow(10) } },
        { kind: 'block', type: 'motion_setx', inputs: { X: numShadow(0) } },
        { kind: 'block', type: 'motion_changeyby', inputs: { DY: numShadow(10) } },
        { kind: 'block', type: 'motion_sety', inputs: { Y: numShadow(0) } },
        { kind: 'sep' },
        { kind: 'block', type: 'motion_ifonedgebounce' },
        { kind: 'block', type: 'motion_setrotationstyle' },
        { kind: 'sep' },
        { kind: 'block', type: 'motion_xposition' },
        { kind: 'block', type: 'motion_yposition' },
        { kind: 'block', type: 'motion_direction' },
      ],
    },

    // 2. Looks
    {
      kind: 'category',
      name: 'Looks',
      colour: CATEGORY_COLORS.looks,
      contents: [
        { kind: 'block', type: 'looks_sayforsecs', inputs: { MESSAGE: textShadow('Hello!'), SECS: numShadow(2) } },
        { kind: 'block', type: 'looks_say', inputs: { MESSAGE: textShadow('Hello!') } },
        { kind: 'block', type: 'looks_thinkforsecs', inputs: { MESSAGE: textShadow('Hmm...'), SECS: numShadow(2) } },
        { kind: 'block', type: 'looks_think', inputs: { MESSAGE: textShadow('Hmm...') } },
        { kind: 'sep' },
        { kind: 'block', type: 'looks_switchcostumeto' },
        { kind: 'block', type: 'looks_nextcostume' },
        { kind: 'block', type: 'looks_switchbackdropto' },
        { kind: 'block', type: 'looks_nextbackdrop' },
        { kind: 'sep' },
        { kind: 'block', type: 'looks_changesizeby', inputs: { CHANGE: numShadow(10) } },
        { kind: 'block', type: 'looks_setsizeto', inputs: { SIZE: numShadow(100) } },
        { kind: 'sep' },
        { kind: 'block', type: 'looks_changeeffectby', inputs: { CHANGE: numShadow(25) } },
        { kind: 'block', type: 'looks_seteffectto', inputs: { VALUE: numShadow(0) } },
        { kind: 'block', type: 'looks_cleargraphiceffects' },
        { kind: 'sep' },
        { kind: 'block', type: 'looks_show' },
        { kind: 'block', type: 'looks_hide' },
        { kind: 'sep' },
        { kind: 'block', type: 'looks_gotofrontback' },
        { kind: 'block', type: 'looks_goforwardbackwardlayers', inputs: { NUM: numShadow(1) } },
        { kind: 'sep' },
        { kind: 'block', type: 'looks_costumenumbername' },
        { kind: 'block', type: 'looks_backdropnumbername' },
        { kind: 'block', type: 'looks_size' },
      ],
    },

    // 3. Sound
    {
      kind: 'category',
      name: 'Sound',
      colour: CATEGORY_COLORS.sound,
      contents: [
        { kind: 'block', type: 'sound_playuntildone' },
        { kind: 'block', type: 'sound_play' },
        { kind: 'block', type: 'sound_stopallsounds' },
        { kind: 'sep' },
        { kind: 'block', type: 'sound_changeeffectby', inputs: { VALUE: numShadow(10) } },
        { kind: 'block', type: 'sound_seteffectto', inputs: { VALUE: numShadow(100) } },
        { kind: 'block', type: 'sound_cleareffects' },
        { kind: 'sep' },
        { kind: 'block', type: 'sound_changevolumeby', inputs: { VOLUME: numShadow(-10) } },
        { kind: 'block', type: 'sound_setvolumeto', inputs: { VOLUME: numShadow(100) } },
        { kind: 'block', type: 'sound_volume' },
      ],
    },

    // 4. Events
    {
      kind: 'category',
      name: 'Events',
      colour: CATEGORY_COLORS.events,
      contents: [
        { kind: 'block', type: 'event_whenflagclicked' },
        { kind: 'block', type: 'event_whenkeypressed' },
        { kind: 'block', type: 'event_whenthisspriteclicked' },
        { kind: 'block', type: 'event_whenstageclicked' },
        { kind: 'block', type: 'event_whenbackdropswitchesto' },
        { kind: 'sep' },
        { kind: 'block', type: 'event_whengreaterthan', inputs: { VALUE: numShadow(10) } },
        { kind: 'sep' },
        { kind: 'block', type: 'event_whenbroadcastreceived' },
        {
          kind: 'block',
          type: 'event_broadcast',
          inputs: { BROADCAST_INPUT: textShadow('message1') },
        },
        {
          kind: 'block',
          type: 'event_broadcastandwait',
          inputs: { BROADCAST_INPUT: textShadow('message1') },
        },
      ],
    },

    // 5. Control
    {
      kind: 'category',
      name: 'Control',
      colour: CATEGORY_COLORS.control,
      contents: [
        { kind: 'block', type: 'control_wait', inputs: { DURATION: numShadow(1) } },
        { kind: 'sep' },
        { kind: 'block', type: 'control_repeat', inputs: { TIMES: numShadow(10) } },
        { kind: 'block', type: 'control_forever' },
        { kind: 'sep' },
        { kind: 'block', type: 'control_if' },
        { kind: 'block', type: 'control_if_else' },
        { kind: 'block', type: 'control_wait_until' },
        { kind: 'block', type: 'control_repeat_until' },
        { kind: 'sep' },
        { kind: 'block', type: 'control_stop' },
        { kind: 'sep' },
        { kind: 'block', type: 'control_start_as_clone' },
        { kind: 'block', type: 'control_create_clone_of' },
        { kind: 'block', type: 'control_delete_this_clone' },
      ],
    },

    // 6. Sensing
    {
      kind: 'category',
      name: 'Sensing',
      colour: CATEGORY_COLORS.sensing,
      contents: [
        { kind: 'block', type: 'sensing_touchingobject' },
        { kind: 'block', type: 'sensing_touchingcolor' },
        { kind: 'block', type: 'sensing_coloristouchingcolor' },
        { kind: 'block', type: 'sensing_distanceto' },
        { kind: 'sep' },
        { kind: 'block', type: 'sensing_askandwait', inputs: { QUESTION: textShadow("What's your name?") } },
        { kind: 'block', type: 'sensing_answer' },
        { kind: 'sep' },
        { kind: 'block', type: 'sensing_keypressed' },
        { kind: 'block', type: 'sensing_mousedown' },
        { kind: 'block', type: 'sensing_mousex' },
        { kind: 'block', type: 'sensing_mousey' },
        { kind: 'block', type: 'sensing_setdragmode' },
        { kind: 'sep' },
        { kind: 'block', type: 'sensing_loudness' },
        { kind: 'sep' },
        { kind: 'block', type: 'sensing_timer' },
        { kind: 'block', type: 'sensing_resettimer' },
        { kind: 'sep' },
        { kind: 'block', type: 'sensing_of' },
        { kind: 'sep' },
        { kind: 'block', type: 'sensing_current' },
        { kind: 'block', type: 'sensing_dayssince2000' },
        { kind: 'block', type: 'sensing_username' },
      ],
    },

    // 7. Operators
    {
      kind: 'category',
      name: 'Operators',
      colour: CATEGORY_COLORS.operators,
      contents: [
        { kind: 'block', type: 'operator_add', inputs: { NUM1: numShadow(0), NUM2: numShadow(0) } },
        { kind: 'block', type: 'operator_subtract', inputs: { NUM1: numShadow(0), NUM2: numShadow(0) } },
        { kind: 'block', type: 'operator_multiply', inputs: { NUM1: numShadow(0), NUM2: numShadow(0) } },
        { kind: 'block', type: 'operator_divide', inputs: { NUM1: numShadow(0), NUM2: numShadow(0) } },
        { kind: 'sep' },
        {
          kind: 'block',
          type: 'operator_random',
          inputs: { FROM: numShadow(1), TO: numShadow(10) },
        },
        { kind: 'sep' },
        { kind: 'block', type: 'operator_gt', inputs: { OPERAND1: textShadow(''), OPERAND2: numShadow(50) } },
        { kind: 'block', type: 'operator_lt', inputs: { OPERAND1: textShadow(''), OPERAND2: numShadow(50) } },
        { kind: 'block', type: 'operator_equals', inputs: { OPERAND1: textShadow(''), OPERAND2: numShadow(50) } },
        { kind: 'sep' },
        { kind: 'block', type: 'operator_and' },
        { kind: 'block', type: 'operator_or' },
        { kind: 'block', type: 'operator_not' },
        { kind: 'sep' },
        {
          kind: 'block',
          type: 'operator_join',
          inputs: { STRING1: textShadow('apple '), STRING2: textShadow('banana') },
        },
        {
          kind: 'block',
          type: 'operator_letter_of',
          inputs: { LETTER: numShadow(1), STRING: textShadow('apple') },
        },
        { kind: 'block', type: 'operator_length', inputs: { STRING: textShadow('apple') } },
        {
          kind: 'block',
          type: 'operator_contains',
          inputs: { STRING1: textShadow('apple'), STRING2: textShadow('a') },
        },
        { kind: 'sep' },
        { kind: 'block', type: 'operator_mod', inputs: { NUM1: numShadow(0), NUM2: numShadow(0) } },
        { kind: 'block', type: 'operator_round', inputs: { NUM: numShadow(0) } },
        { kind: 'block', type: 'operator_mathop', inputs: { NUM: numShadow(0) } },
      ],
    },

    // 8. Variables & Lists
    {
      kind: 'category',
      name: 'Variables',
      colour: CATEGORY_COLORS.variables,
      contents: [
        {
          kind: 'button',
          text: 'Make a Variable',
          callbackKey: 'MAKE_A_VARIABLE',
        },
        { kind: 'block', type: 'data_variable' },
        { kind: 'block', type: 'data_setvariableto', inputs: { VALUE: numShadow(0) } },
        { kind: 'block', type: 'data_changevariableby', inputs: { VALUE: numShadow(1) } },
        { kind: 'block', type: 'data_showvariable' },
        { kind: 'block', type: 'data_hidevariable' },
        { kind: 'sep' },
        {
          kind: 'button',
          text: 'Make a List',
          callbackKey: 'MAKE_A_LIST',
        },
        { kind: 'block', type: 'data_listcontents' },
        { kind: 'block', type: 'data_addtolist', inputs: { ITEM: textShadow('thing') } },
        { kind: 'block', type: 'data_deleteoflist', inputs: { INDEX: numShadow(1) } },
        { kind: 'block', type: 'data_deletealloflist' },
        {
          kind: 'block',
          type: 'data_insertatlist',
          inputs: { ITEM: textShadow('thing'), INDEX: numShadow(1) },
        },
        {
          kind: 'block',
          type: 'data_replaceitemoflist',
          inputs: { INDEX: numShadow(1), ITEM: textShadow('thing') },
        },
        { kind: 'block', type: 'data_itemoflist', inputs: { INDEX: numShadow(1) } },
        { kind: 'block', type: 'data_itemnumoflist', inputs: { ITEM: textShadow('thing') } },
        { kind: 'block', type: 'data_lengthoflist' },
        { kind: 'block', type: 'data_listcontainsitem', inputs: { ITEM: textShadow('thing') } },
        { kind: 'block', type: 'data_showlist' },
        { kind: 'block', type: 'data_hidelist' },
      ],
    },

    // 10. Platformer (extension, step 3): box-based physics, separate from Scratch's pixel touching.
    {
      kind: 'category',
      name: 'Platformer',
      colour: CATEGORY_COLORS.platformer,
      cssConfig: { container: 'code-extension-category' },
      contents: [
        { kind: 'label', text: 'Platformer blocks' },
        { kind: 'block', type: 'platformer_everytick' },
        { kind: 'block', type: 'platformer_whenland' },
        { kind: 'block', type: 'platformer_whenleaveground' },
        { kind: 'block', type: 'platformer_whenbump' },
        { kind: 'sep' },
        { kind: 'block', type: 'platformer_setgravity' },
        { kind: 'block', type: 'platformer_setsolid' },
        { kind: 'sep' },
        { kind: 'block', type: 'platformer_setspeed', inputs: { SPEED: numShadow(5) } },
        { kind: 'block', type: 'platformer_changespeed', inputs: { SPEED: numShadow(1) } },
        { kind: 'block', type: 'platformer_speed' },
        { kind: 'sep' },
        { kind: 'block', type: 'platformer_onground' },
        { kind: 'label', text: 'Bricks that move themselves' },
        { kind: 'block', type: 'platformer_setmover' },
        { kind: 'block', type: 'platformer_moveuntilhit', inputs: { DISTANCE: numShadow(5) } },
        { kind: 'block', type: 'platformer_hitsomething' },
        { kind: 'block', type: 'platformer_whathit' },
        { kind: 'block', type: 'platformer_slipcorner', inputs: { STEPS: numShadow(4) } },
        { kind: 'block', type: 'platformer_movecarry', inputs: { DISTANCE: numShadow(2) } },
        { kind: 'block', type: 'platformer_tellhit' },
        { kind: 'block', type: 'platformer_setonground' },
      ],
    },
  ]

  // In 3D, the 3D category takes Platformer's place, and Motion gains its z blocks.
  if (palette.threeD) {
    allCategories.splice(allCategories.findIndex((cat) => cat.name === 'Platformer'), 1, threeDCategory())
    const motion = allCategories.findIndex((cat) => cat.name === 'Motion')
    allCategories[motion] = withZ(allCategories[motion])
  }
  if (palette.game) {
    // Start from nothing: one Game category where Platformer was.
    const at = allCategories.findIndex((cat) => cat.name === 'Platformer')
    allCategories.splice(at, 1, gameCategory(allCategories[at], racingCategory()))
  } else if (palette.racing) {
    // Racing comes just before Platformer (or 3D): a race brick's own blocks first, then the ones that move it.
    allCategories.splice(allCategories.findIndex((cat) => cat.name === 'Platformer' || cat.name === '3D'), 0, racingCategory())
  }
  const hide = new Set(palette.hide)
  const kitCategories = hide.size ? allCategories.map((cat) => withoutHidden(cat, hide)) : allCategories

  // Motion, Platformer, Racing and 3D all act on a brick's body; the Stage has none of them.
  const contents = isStage
    ? kitCategories.filter((cat) => !BODY_CATEGORIES.has(cat.name))
    : kitCategories

  return {
    kind: 'categoryToolbox',
    contents,
  }
}

/** The categories that act on a brick's body, which the Stage has none of. */
const BODY_CATEGORIES = new Set(['Motion', 'Platformer', 'Racing', '3D', 'Game'])

/** Pre-built continuous toolbox configuration. */
export const CONTINUOUS_TOOLBOX = createContinuousToolbox()

/**
 * The My Blocks palette: Make a Block, then one call per definition in the workspace with the definition's argument
 * reporters under it, as Scratch. Nothing from @blockly/block-shareable-procedures ("to do something", "return") is
 * listed: those blocks only stay defined so an old save that contains them still loads.
 */
export function myBlocksFlyout(ws: Blockly.Workspace): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [{ kind: 'button', text: 'Make a Block', callbackKey: 'MAKE_A_PROCEDURE' }]
  const seen = new Set<string>()
  for (const block of ws.getTopBlocks(true)) {
    if (block.type !== 'procedures_definition') continue
    const extra = (block as unknown as { extraState_?: { proccode?: string; argumentNames?: string[] } }).extraState_
    const proccode = extra?.proccode || 'my block'
    if (seen.has(proccode)) continue
    seen.add(proccode)
    const argumentNames = extra?.argumentNames ?? []
    const inputs: Record<string, { shadow: ToolboxShadow }> = {}
    parseProccode(proccode, argumentNames).forEach((part) => {
      // Number and text slots start with an empty text shadow, like Scratch; boolean slots start empty.
      if (part.kind === 'arg' && !part.boolean) inputs[part.name] = textShadow('')
    })
    items.push({ kind: 'block', type: 'procedures_call', extraState: { proccode, argumentNames }, inputs })
    for (const arg of argumentNames) {
      items.push({
        kind: 'block',
        type: arg.endsWith('?') ? 'argument_reporter_boolean' : 'argument_reporter_string_number',
        fields: { VALUE: arg },
      })
    }
  }
  return items
}

let pluginsRegistered = false

/**
 * Registers the continuous-toolbox plugin, and keeps the shareable-procedures serializer and blocks defined so saves
 * that still hold them load. Idempotent: safe to call multiple times.
 */
/**
 * The studio disposes and re-injects the workspace whenever a different brick is opened. Two things then broke the
 * flyout and left the previous brick's code on screen:
 *  - recycled palette blocks from the disposed workspace were reused ("Workspace is null");
 *  - a palette refresh could dispose a block that was already disposed (tooltip unbind on an emptied wrapper).
 * The palette is small, so recycling stays off, and disposing a dead block is skipped.
 */
export class StudioBlockFlyoutInflater extends RecyclableBlockFlyoutInflater {
  override recyclingEnabled = false

  protected override blockIsRecyclable(): boolean {
    return false
  }

  override disposeItem(item: Blockly.FlyoutItem): void {
    const element = item.getElement()
    if (element instanceof Blockly.BlockSvg && (element.isDeadOrDying() || element.disposed)) return
    super.disposeItem(item)
  }
}

export function registerToolboxPlugins(): void {
  if (pluginsRegistered) return

  registerContinuousToolbox()
  Blockly.registry.register(Blockly.registry.Type.FLYOUT_INFLATER, 'block', StudioBlockFlyoutInflater, true)

  try {
    ShareableProcedures.registerProcedureSerializer()
  } catch {
    // Already registered or serializer replaced
  }

  try {
    Blockly.common.defineBlocks(ShareableProcedures.blocks)
  } catch {
    // Blocks already defined
  }

  pluginsRegistered = true
}
