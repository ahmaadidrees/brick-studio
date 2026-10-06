import * as Blockly from 'blockly/core'
import { RecyclableBlockFlyoutInflater, registerContinuousToolbox } from '@blockly/continuous-toolbox'
import * as ShareableProcedures from '@blockly/block-shareable-procedures'
import type { EditorContext } from './context'
import { CATEGORY_COLORS } from './definitions'
import { TILE_TOOLBOX_ENTRY } from './tileBlocks'

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
 * Creates the complete continuous-category toolbox specification for Scratch 3 opcodes.
 * If isStage is true, the Motion category is omitted.
 */
export function createContinuousToolbox(
  context?: EditorContext,
  options?: { isStage?: boolean },
): ContinuousToolboxDefinition {
  const isStage = options?.isStage ?? context?.isStage ?? false

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
        { kind: 'label', text: 'Platformer extension' },
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
        TILE_TOOLBOX_ENTRY,
      ],
    },
  ]

  // Motion and Platformer both act on a brick's body; the Stage has neither.
  const contents = isStage
    ? allCategories.filter((cat) => cat.name !== 'Motion' && cat.name !== 'Platformer')
    : allCategories

  return {
    kind: 'categoryToolbox',
    contents,
  }
}

/** Pre-built continuous toolbox configuration. */
export const CONTINUOUS_TOOLBOX = createContinuousToolbox()

let pluginsRegistered = false

/**
 * Registers the continuous-toolbox and shareable-procedures plugins with Blockly.
 * Idempotent: safe to call multiple times.
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
