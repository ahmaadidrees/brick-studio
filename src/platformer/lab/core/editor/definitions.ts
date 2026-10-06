import * as Blockly from 'blockly/core'
import type { HatOpcode } from '../contracts'
import {
  DEFAULT_CURRENT_MENU,
  DEFAULT_GRAPHIC_EFFECTS,
  DEFAULT_MATH_OPERATORS,
  DEFAULT_SENSING_OF_PROPERTIES,
  DEFAULT_SOUND_EFFECTS,
  getBackdropOptions,
  getCostumeOptions,
  getKeyOptions,
  getListOptions,
  getMessageOptions,
  getSoundOptions,
  getTargetOptions,
  getEditorContext,
  getVariableOptions,
  type EditorContext,
  type MenuOption,
} from './context'
import { CATEGORY_COLORS } from './colors'
import { TILE_BLOCK_DEFINITIONS, TILE_BRICK_OPTION } from './tileBlocks'

/** Scratch 3 category colors. */
export { CATEGORY_COLORS }

export const HAT_OPCODES: readonly HatOpcode[] = [
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'event_whenstageclicked',
  'event_whenbroadcastreceived',
  'event_whenbackdropswitchesto',
  'event_whengreaterthan',
  'control_start_as_clone',
  'platformer_whenbump',
]

export function isHatOpcode(opcode: string): opcode is HatOpcode {
  return (HAT_OPCODES as readonly string[]).includes(opcode)
}

/**
 * Creates all Blockly 13.3.0 block JSON definitions for Scratch core opcodes,
 * wired to dynamic dropdown options provided by `context`.
 */
export function createBlockDefinitions(context?: EditorContext): Array<Record<string, unknown>> {
  const varOptions = () => getVariableOptions(context)
  const listOptions = () => getListOptions(context)
  const msgOptions = () => getMessageOptions(context)
  const costumeOptions = () => getCostumeOptions(context)
  const soundOptions = () => getSoundOptions(context)
  const backdropOptions = () => getBackdropOptions(context, true)
  const keyOptions = () => getKeyOptions(context)

  // Motion target options: _mouse_, _random_, plus bricks
  const motionGotoOptions = () =>
    getTargetOptions(context, [
      { label: 'random position', value: '_random_' },
      { label: 'mouse-pointer', value: '_mouse_' },
    ])

  const motionTowardsOptions = () =>
    getTargetOptions(context, [{ label: 'mouse-pointer', value: '_mouse_' }])

  const sensingTouchingOptions = () =>
    getTargetOptions(context, [
      { label: 'mouse-pointer', value: '_mouse_' },
      { label: 'edge', value: '_edge_' },
    ])

  const sensingDistanceOptions = () =>
    getTargetOptions(context, [{ label: 'mouse-pointer', value: '_mouse_' }])

  const cloneOfOptions = () =>
    getTargetOptions(context, [{ label: 'myself', value: '_myself_' }])

  const sensingOfObjects = () =>
    getTargetOptions(context, [{ label: 'Stage', value: '_stage_' }])

  const onOff: MenuOption[] = [
    ['on', 'on'],
    ['off', 'off'],
  ]
  const axisOptions: MenuOption[] = [
    ['x', 'x'],
    ['y', 'y'],
  ]
  const bumpSideOptions: MenuOption[] = [
    ['any side', '_any_'],
    ['top', 'top'],
    ['bottom', 'bottom'],
    ['left', 'left'],
    ['right', 'right'],
  ]
  const bumpBrickOptions = (): MenuOption[] => [
    ['anything', '_any_'],
    ['edge', '_edge_'],
    TILE_BRICK_OPTION,
    ...(context?.getBricks?.() ?? getEditorContext().getBricks?.() ?? []).map((b): MenuOption => [b, b]),
  ]

  return [
    // =========================================================================
    // MOTION
    // =========================================================================
    {
      type: 'motion_movesteps',
      message0: 'move %1 steps',
      args0: [{ type: 'input_value', name: 'STEPS', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_turnright',
      message0: 'turn \u21bb %1 degrees',
      args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_turnleft',
      message0: 'turn \u21ba %1 degrees',
      args0: [{ type: 'input_value', name: 'DEGREES', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_pointindirection',
      message0: 'point in direction %1',
      args0: [{ type: 'input_value', name: 'DIRECTION', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_pointtowards',
      message0: 'point towards %1',
      args0: [{ type: 'field_dropdown', name: 'TOWARDS', options: motionTowardsOptions }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_gotoxy',
      message0: 'go to x: %1 y: %2',
      args0: [
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_goto',
      message0: 'go to %1',
      args0: [{ type: 'field_dropdown', name: 'TO', options: motionGotoOptions }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_glidesecstoxy',
      message0: 'glide %1 secs to x: %2 y: %3',
      args0: [
        { type: 'input_value', name: 'SECS', check: 'Number' },
        { type: 'input_value', name: 'X', check: 'Number' },
        { type: 'input_value', name: 'Y', check: 'Number' },
      ],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_glideto',
      message0: 'glide %1 secs to %2',
      args0: [
        { type: 'input_value', name: 'SECS', check: 'Number' },
        { type: 'field_dropdown', name: 'TO', options: motionGotoOptions },
      ],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_changexby',
      message0: 'change x by %1',
      args0: [{ type: 'input_value', name: 'DX', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_setx',
      message0: 'set x to %1',
      args0: [{ type: 'input_value', name: 'X', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_changeyby',
      message0: 'change y by %1',
      args0: [{ type: 'input_value', name: 'DY', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_sety',
      message0: 'set y to %1',
      args0: [{ type: 'input_value', name: 'Y', check: 'Number' }],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_ifonedgebounce',
      message0: 'if on edge, bounce',
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_setrotationstyle',
      message0: 'set rotation style %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'STYLE',
          options: [
            ['left-right', 'left-right'],
            ["don't rotate", "don't rotate"],
            ['all around', 'all around'],
          ],
        },
      ],
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'motion_xposition',
      message0: 'x position',
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'motion_yposition',
      message0: 'y position',
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'motion_direction',
      message0: 'direction',
      category: 'motion',
      colour: CATEGORY_COLORS.motion,
      output: 'Number',
      tooltip: '',
    },

    // =========================================================================
    // LOOKS
    // =========================================================================
    {
      type: 'looks_sayforsecs',
      message0: 'say %1 for %2 seconds',
      args0: [
        { type: 'input_value', name: 'MESSAGE' },
        { type: 'input_value', name: 'SECS', check: 'Number' },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_say',
      message0: 'say %1',
      args0: [{ type: 'input_value', name: 'MESSAGE' }],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_thinkforsecs',
      message0: 'think %1 for %2 seconds',
      args0: [
        { type: 'input_value', name: 'MESSAGE' },
        { type: 'input_value', name: 'SECS', check: 'Number' },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_think',
      message0: 'think %1',
      args0: [{ type: 'input_value', name: 'MESSAGE' }],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_switchcostumeto',
      message0: 'switch costume to %1',
      args0: [{ type: 'field_dropdown', name: 'COSTUME', options: costumeOptions }],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_nextcostume',
      message0: 'next costume',
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_switchbackdropto',
      message0: 'switch backdrop to %1',
      args0: [{ type: 'field_dropdown', name: 'BACKDROP', options: backdropOptions }],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_nextbackdrop',
      message0: 'next backdrop',
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_changesizeby',
      message0: 'change size by %1',
      args0: [{ type: 'input_value', name: 'CHANGE', check: 'Number' }],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_setsizeto',
      message0: 'set size to %1 %',
      args0: [{ type: 'input_value', name: 'SIZE', check: 'Number' }],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_changeeffectby',
      message0: 'change %1 effect by %2',
      args0: [
        { type: 'field_dropdown', name: 'EFFECT', options: [...DEFAULT_GRAPHIC_EFFECTS] },
        { type: 'input_value', name: 'CHANGE', check: 'Number' },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_seteffectto',
      message0: 'set %1 effect to %2',
      args0: [
        { type: 'field_dropdown', name: 'EFFECT', options: [...DEFAULT_GRAPHIC_EFFECTS] },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_cleargraphiceffects',
      message0: 'clear graphic effects',
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_show',
      message0: 'show',
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_hide',
      message0: 'hide',
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_gotofrontback',
      message0: 'go to %1 layer',
      args0: [
        {
          type: 'field_dropdown',
          name: 'FRONT_BACK',
          options: [
            ['front', 'front'],
            ['back', 'back'],
          ],
        },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_goforwardbackwardlayers',
      message0: 'go %1 %2 layers',
      args0: [
        {
          type: 'field_dropdown',
          name: 'FORWARD_BACKWARD',
          options: [
            ['forward', 'forward'],
            ['backward', 'backward'],
          ],
        },
        { type: 'input_value', name: 'NUM', check: 'Number' },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'looks_costumenumbername',
      message0: 'costume %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'NUMBER_NAME',
          options: [
            ['number', 'number'],
            ['name', 'name'],
          ],
        },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      output: null,
      tooltip: '',
    },
    {
      type: 'looks_backdropnumbername',
      message0: 'backdrop %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'NUMBER_NAME',
          options: [
            ['number', 'number'],
            ['name', 'name'],
          ],
        },
      ],
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      output: null,
      tooltip: '',
    },
    {
      type: 'looks_size',
      message0: 'size',
      category: 'looks',
      colour: CATEGORY_COLORS.looks,
      output: 'Number',
      tooltip: '',
    },

    // =========================================================================
    // SOUND
    // =========================================================================
    {
      type: 'sound_playuntildone',
      message0: 'play sound %1 until done',
      args0: [{ type: 'field_dropdown', name: 'SOUND_MENU', options: soundOptions }],
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_play',
      message0: 'start sound %1',
      args0: [{ type: 'field_dropdown', name: 'SOUND_MENU', options: soundOptions }],
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_stopallsounds',
      message0: 'stop all sounds',
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_changeeffectby',
      message0: 'change %1 effect by %2',
      args0: [
        { type: 'field_dropdown', name: 'EFFECT', options: [...DEFAULT_SOUND_EFFECTS] },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_seteffectto',
      message0: 'set %1 effect to %2',
      args0: [
        { type: 'field_dropdown', name: 'EFFECT', options: [...DEFAULT_SOUND_EFFECTS] },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_cleareffects',
      message0: 'clear sound effects',
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_changevolumeby',
      message0: 'change volume by %1',
      args0: [{ type: 'input_value', name: 'VOLUME', check: 'Number' }],
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_setvolumeto',
      message0: 'set volume to %1 %',
      args0: [{ type: 'input_value', name: 'VOLUME', check: 'Number' }],
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sound_volume',
      message0: 'volume',
      category: 'sound',
      colour: CATEGORY_COLORS.sound,
      output: 'Number',
      tooltip: '',
    },

    // =========================================================================
    // EVENTS (Hats and Broadcasts)
    // =========================================================================
    {
      type: 'event_whenflagclicked',
      message0: 'when \u2691 clicked',
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_whenkeypressed',
      message0: 'when %1 key pressed',
      args0: [{ type: 'field_dropdown', name: 'KEY_OPTION', options: keyOptions }],
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_whenthisspriteclicked',
      message0: 'when this sprite clicked',
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_whenstageclicked',
      message0: 'when stage clicked',
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_whenbroadcastreceived',
      message0: 'when I receive %1',
      args0: [{ type: 'field_dropdown', name: 'BROADCAST_OPTION', options: msgOptions }],
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_whenbackdropswitchesto',
      message0: 'when backdrop switches to %1',
      args0: [{ type: 'field_dropdown', name: 'BACKDROP', options: backdropOptions }],
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_whengreaterthan',
      message0: 'when %1 > %2',
      args0: [
        {
          type: 'field_dropdown',
          name: 'WHENGREATERTHANMENU',
          options: [
            ['timer', 'TIMER'],
            ['loudness', 'LOUDNESS'],
          ],
        },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      category: 'events',
      colour: CATEGORY_COLORS.events,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'event_broadcast',
      message0: 'broadcast %1',
      args0: [{ type: 'input_value', name: 'BROADCAST_INPUT' }],
      category: 'events',
      colour: CATEGORY_COLORS.events,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'event_broadcastandwait',
      message0: 'broadcast %1 and wait',
      args0: [{ type: 'input_value', name: 'BROADCAST_INPUT' }],
      category: 'events',
      colour: CATEGORY_COLORS.events,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },

    // =========================================================================
    // CONTROL
    // =========================================================================
    {
      type: 'control_wait',
      message0: 'wait %1 seconds',
      args0: [{ type: 'input_value', name: 'DURATION', check: 'Number' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_repeat',
      message0: 'repeat %1',
      message1: '%1',
      args0: [{ type: 'input_value', name: 'TIMES', check: 'Number' }],
      args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_forever',
      message0: 'forever',
      message1: '%1',
      args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      tooltip: '',
    },
    {
      type: 'control_if',
      message0: 'if %1 then',
      message1: '%1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_if_else',
      message0: 'if %1 then',
      message1: '%1',
      message2: 'else',
      message3: '%1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
      args3: [{ type: 'input_statement', name: 'SUBSTACK2' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_wait_until',
      message0: 'wait until %1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_repeat_until',
      message0: 'repeat until %1',
      message1: '%1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_while',
      message0: 'while %1',
      message1: '%1',
      args0: [{ type: 'input_value', name: 'CONDITION', check: 'Boolean' }],
      args1: [{ type: 'input_statement', name: 'SUBSTACK' }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_stop',
      message0: 'stop %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'STOP_OPTION',
          options: [
            ['all', 'all'],
            ['this script', 'this script'],
            ['other scripts in sprite', 'other scripts in sprite'],
          ],
        },
      ],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_start_as_clone',
      message0: 'when I start as a clone',
      category: 'control',
      colour: CATEGORY_COLORS.control,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
    {
      type: 'control_create_clone_of',
      message0: 'create clone of %1',
      args0: [{ type: 'field_dropdown', name: 'CLONE_OPTION', options: cloneOfOptions }],
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'control_delete_this_clone',
      message0: 'delete this clone',
      category: 'control',
      colour: CATEGORY_COLORS.control,
      previousStatement: null,
      tooltip: '',
    },

    // =========================================================================
    // SENSING
    // =========================================================================
    {
      type: 'sensing_touchingobject',
      message0: 'touching %1?',
      args0: [{ type: 'field_dropdown', name: 'TOUCHINGOBJECTMENU', options: sensingTouchingOptions }],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'sensing_touchingcolor',
      message0: 'touching color %1?',
      args0: [{ type: 'input_value', name: 'COLOR' }],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'sensing_coloristouchingcolor',
      message0: 'color %1 is touching %2?',
      args0: [
        { type: 'input_value', name: 'COLOR' },
        { type: 'input_value', name: 'COLOR2' },
      ],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'sensing_distanceto',
      message0: 'distance to %1',
      args0: [{ type: 'field_dropdown', name: 'DISTANCETOMENU', options: sensingDistanceOptions }],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_askandwait',
      message0: 'ask %1 and wait',
      args0: [{ type: 'input_value', name: 'QUESTION' }],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sensing_answer',
      message0: 'answer',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'String',
      tooltip: '',
    },
    {
      type: 'sensing_keypressed',
      message0: 'key %1 pressed?',
      args0: [{ type: 'field_dropdown', name: 'KEY_OPTION', options: keyOptions }],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'sensing_mousedown',
      message0: 'mouse down?',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'sensing_mousex',
      message0: 'mouse x',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_mousey',
      message0: 'mouse y',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_loudness',
      message0: 'loudness',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_timer',
      message0: 'timer',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_resettimer',
      message0: 'reset timer',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sensing_setdragmode',
      message0: 'set drag mode %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'DRAG_MODE',
          options: [
            ['draggable', 'draggable'],
            ['not draggable', 'not draggable'],
          ],
        },
      ],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'sensing_of',
      message0: '%1 of %2',
      args0: [
        { type: 'field_dropdown', name: 'PROPERTY', options: [...DEFAULT_SENSING_OF_PROPERTIES] },
        { type: 'field_dropdown', name: 'OBJECT', options: sensingOfObjects },
      ],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: null,
      tooltip: '',
    },
    {
      type: 'sensing_current',
      message0: 'current %1',
      args0: [{ type: 'field_dropdown', name: 'CURRENTMENU', options: [...DEFAULT_CURRENT_MENU] }],
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_dayssince2000',
      message0: 'days since 2000',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'sensing_username',
      message0: 'username',
      category: 'sensing',
      colour: CATEGORY_COLORS.sensing,
      output: 'String',
      tooltip: '',
    },

    // =========================================================================
    // OPERATORS
    // =========================================================================
    {
      type: 'operator_add',
      message0: '%1 + %2',
      args0: [
        { type: 'input_value', name: 'NUM1' },
        { type: 'input_value', name: 'NUM2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_subtract',
      message0: '%1 - %2',
      args0: [
        { type: 'input_value', name: 'NUM1' },
        { type: 'input_value', name: 'NUM2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_multiply',
      message0: '%1 * %2',
      args0: [
        { type: 'input_value', name: 'NUM1' },
        { type: 'input_value', name: 'NUM2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_divide',
      message0: '%1 / %2',
      args0: [
        { type: 'input_value', name: 'NUM1' },
        { type: 'input_value', name: 'NUM2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_random',
      message0: 'pick random %1 to %2',
      args0: [
        { type: 'input_value', name: 'FROM' },
        { type: 'input_value', name: 'TO' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_gt',
      message0: '%1 > %2',
      args0: [
        { type: 'input_value', name: 'OPERAND1' },
        { type: 'input_value', name: 'OPERAND2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_lt',
      message0: '%1 < %2',
      args0: [
        { type: 'input_value', name: 'OPERAND1' },
        { type: 'input_value', name: 'OPERAND2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_equals',
      message0: '%1 = %2',
      args0: [
        { type: 'input_value', name: 'OPERAND1' },
        { type: 'input_value', name: 'OPERAND2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_and',
      message0: '%1 and %2',
      args0: [
        { type: 'input_value', name: 'OPERAND1', check: 'Boolean' },
        { type: 'input_value', name: 'OPERAND2', check: 'Boolean' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_or',
      message0: '%1 or %2',
      args0: [
        { type: 'input_value', name: 'OPERAND1', check: 'Boolean' },
        { type: 'input_value', name: 'OPERAND2', check: 'Boolean' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_not',
      message0: 'not %1',
      args0: [{ type: 'input_value', name: 'OPERAND', check: 'Boolean' }],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_join',
      message0: 'join %1 %2',
      args0: [
        { type: 'input_value', name: 'STRING1' },
        { type: 'input_value', name: 'STRING2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'String',
      tooltip: '',
    },
    {
      type: 'operator_letter_of',
      message0: 'letter %1 of %2',
      args0: [
        { type: 'input_value', name: 'LETTER', check: 'Number' },
        { type: 'input_value', name: 'STRING' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'String',
      tooltip: '',
    },
    {
      type: 'operator_length',
      message0: 'length of %1',
      args0: [{ type: 'input_value', name: 'STRING' }],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_contains',
      message0: '%1 contains %2?',
      args0: [
        { type: 'input_value', name: 'STRING1' },
        { type: 'input_value', name: 'STRING2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'operator_mod',
      message0: '%1 mod %2',
      args0: [
        { type: 'input_value', name: 'NUM1' },
        { type: 'input_value', name: 'NUM2' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_round',
      message0: 'round %1',
      args0: [{ type: 'input_value', name: 'NUM' }],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'operator_mathop',
      message0: '%1 of %2',
      args0: [
        { type: 'field_dropdown', name: 'OPERATOR', options: [...DEFAULT_MATH_OPERATORS] },
        { type: 'input_value', name: 'NUM' },
      ],
      category: 'operators',
      colour: CATEGORY_COLORS.operators,
      output: 'Number',
      tooltip: '',
    },

    // =========================================================================
    // VARIABLES & LISTS (DATA)
    // =========================================================================
    {
      type: 'data_variable',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'VARIABLE', options: varOptions }],
      category: 'variables',
      colour: CATEGORY_COLORS.variables,
      output: null,
      tooltip: '',
    },
    {
      type: 'data_setvariableto',
      message0: 'set %1 to %2',
      args0: [
        { type: 'field_dropdown', name: 'VARIABLE', options: varOptions },
        { type: 'input_value', name: 'VALUE' },
      ],
      category: 'variables',
      colour: CATEGORY_COLORS.variables,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_changevariableby',
      message0: 'change %1 by %2',
      args0: [
        { type: 'field_dropdown', name: 'VARIABLE', options: varOptions },
        { type: 'input_value', name: 'VALUE' },
      ],
      category: 'variables',
      colour: CATEGORY_COLORS.variables,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_showvariable',
      message0: 'show variable %1',
      args0: [{ type: 'field_dropdown', name: 'VARIABLE', options: varOptions }],
      category: 'variables',
      colour: CATEGORY_COLORS.variables,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_hidevariable',
      message0: 'hide variable %1',
      args0: [{ type: 'field_dropdown', name: 'VARIABLE', options: varOptions }],
      category: 'variables',
      colour: CATEGORY_COLORS.variables,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_listcontents',
      message0: '%1',
      args0: [{ type: 'field_dropdown', name: 'LIST', options: listOptions }],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      output: null,
      tooltip: '',
    },
    {
      type: 'data_addtolist',
      message0: 'add %1 to %2',
      args0: [
        { type: 'input_value', name: 'ITEM' },
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_deleteoflist',
      message0: 'delete %1 of %2',
      args0: [
        { type: 'input_value', name: 'INDEX' },
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_deletealloflist',
      message0: 'delete all of %1',
      args0: [{ type: 'field_dropdown', name: 'LIST', options: listOptions }],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_insertatlist',
      message0: 'insert %1 at %2 of %3',
      args0: [
        { type: 'input_value', name: 'ITEM' },
        { type: 'input_value', name: 'INDEX' },
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_replaceitemoflist',
      message0: 'replace item %1 of %2 with %3',
      args0: [
        { type: 'input_value', name: 'INDEX' },
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
        { type: 'input_value', name: 'ITEM' },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_itemoflist',
      message0: 'item %1 of %2',
      args0: [
        { type: 'input_value', name: 'INDEX' },
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      output: null,
      tooltip: '',
    },
    {
      type: 'data_itemnumoflist',
      message0: 'item # of %1 in %2',
      args0: [
        { type: 'input_value', name: 'ITEM' },
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'data_lengthoflist',
      message0: 'length of %1',
      args0: [{ type: 'field_dropdown', name: 'LIST', options: listOptions }],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'data_listcontainsitem',
      message0: '%1 contains %2?',
      args0: [
        { type: 'field_dropdown', name: 'LIST', options: listOptions },
        { type: 'input_value', name: 'ITEM' },
      ],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      output: 'Boolean',
      tooltip: '',
    },
    {
      type: 'data_showlist',
      message0: 'show list %1',
      args0: [{ type: 'field_dropdown', name: 'LIST', options: listOptions }],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'data_hidelist',
      message0: 'hide list %1',
      args0: [{ type: 'field_dropdown', name: 'LIST', options: listOptions }],
      category: 'lists',
      colour: CATEGORY_COLORS.lists,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },

    // =========================================================================
    // PROCEDURES (MY BLOCKS)
    // =========================================================================
    {
      type: 'procedures_definition',
      message0: 'define %1 %2',
      args0: [
        { type: 'field_label', name: 'LABEL', text: '' },
        { type: 'input_value', name: 'custom_block' },
      ],
      category: 'procedures',
      colour: CATEGORY_COLORS.procedures,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
      mutator: PROCEDURE_STATE_MUTATOR,
    },
    {
      type: 'procedures_prototype',
      message0: '%1',
      args0: [{ type: 'field_label', name: 'LABEL', text: '' }],
      category: 'procedures',
      colour: CATEGORY_COLORS.procedures,
      output: null,
      tooltip: '',
      mutator: PROCEDURE_STATE_MUTATOR,
    },
    {
      type: 'procedures_call',
      message0: '%1',
      args0: [{ type: 'field_label', name: 'LABEL', text: '' }],
      category: 'procedures',
      colour: CATEGORY_COLORS.procedures,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
      mutator: PROCEDURE_STATE_MUTATOR,
    },
    {
      type: 'argument_reporter_string_number',
      message0: '%1',
      args0: [{ type: 'field_label', name: 'VALUE', text: '' }],
      category: 'procedures',
      colour: CATEGORY_COLORS.procedures,
      output: null,
      tooltip: '',
    },
    {
      type: 'argument_reporter_boolean',
      message0: '%1',
      args0: [{ type: 'field_label', name: 'VALUE', text: '' }],
      category: 'procedures',
      colour: CATEGORY_COLORS.procedures,
      output: 'Boolean',
      tooltip: '',
    },
    // =========================================================================
    // PLATFORMER (extension, step 3). Wording is fixed by docs/qa/code-lab-core/STEP3.md.
    // =========================================================================
    {
      type: 'platformer_setgravity',
      message0: 'turn gravity %1',
      args0: [{ type: 'field_dropdown', name: 'GRAVITY', options: onOff }],
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'platformer_setsolid',
      message0: 'solid %1',
      args0: [{ type: 'field_dropdown', name: 'SOLID', options: onOff }],
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'platformer_setspeed',
      message0: 'set %1 speed to %2',
      args0: [
        { type: 'field_dropdown', name: 'AXIS', options: axisOptions },
        { type: 'input_value', name: 'SPEED' },
      ],
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'platformer_changespeed',
      message0: 'change %1 speed by %2',
      args0: [
        { type: 'field_dropdown', name: 'AXIS', options: axisOptions },
        { type: 'input_value', name: 'SPEED' },
      ],
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      previousStatement: null,
      nextStatement: null,
      tooltip: '',
    },
    {
      type: 'platformer_speed',
      message0: '%1 speed',
      args0: [{ type: 'field_dropdown', name: 'AXIS', options: axisOptions }],
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      output: 'Number',
      tooltip: '',
    },
    {
      type: 'platformer_onground',
      message0: 'on ground?',
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      output: 'Boolean',
      tooltip: '',
    },
    ...TILE_BLOCK_DEFINITIONS,
    {
      type: 'platformer_whenbump',
      message0: 'when I bump %1 of %2',
      args0: [
        { type: 'field_dropdown', name: 'SIDE', options: bumpSideOptions },
        { type: 'field_dropdown', name: 'BRICK', options: bumpBrickOptions },
      ],
      category: 'platformer',
      colour: CATEGORY_COLORS.platformer,
      nextStatement: null,
      hat: 'cap',
      tooltip: '',
    },
  ]
}

/**
 * Registers all block definitions with Blockly. Safe to call multiple times.
 */
/**
 * My Blocks keep their proccode, argument names and warp flag in Blockly extraState, so a custom block's name, inputs
 * and "run without screen refresh" survive save/load. The compiler reads the same state (compile.ts parseProcedureDef).
 */
export const PROCEDURE_STATE_MUTATOR = 'code_lab_procedure_state'

export interface ProcedureState {
  proccode: string
  argumentNames: string[]
  warp?: boolean
}

/** "jump %s times %b" → "jump ( ) times < >" */
export function procedureLabel(proccode: string): string {
  return proccode.replace(/%s/g, '( )').replace(/%b/g, '< >').replace(/%n/g, '( )')
}

type ProcedureBlock = Blockly.Block & { extraState_?: ProcedureState }

const procedureStateMixin = {
  saveExtraState(this: ProcedureBlock): ProcedureState | null {
    return this.extraState_ ? { ...this.extraState_, argumentNames: [...this.extraState_.argumentNames] } : null
  },
  loadExtraState(this: ProcedureBlock, state: Partial<ProcedureState> | null) {
    const proccode = typeof state?.proccode === 'string' ? state.proccode : ''
    const argumentNames = Array.isArray(state?.argumentNames) ? state!.argumentNames.map((a) => String(a)) : []
    this.extraState_ = { proccode, argumentNames, ...(typeof state?.warp === 'boolean' ? { warp: state.warp } : {}) }
    this.getField('LABEL')?.setValue(procedureLabel(proccode))
    // A call takes one value input per argument, keyed by argument name (compile.ts reads inputs by name).
    if (this.type === 'procedures_call') {
      for (const name of argumentNames) if (!this.getInput(name)) this.appendValueInput(name)
    }
  },
}

export function registerEditorBlocks(context?: EditorContext): void {
  if (!Blockly.Extensions.isRegistered(PROCEDURE_STATE_MUTATOR)) {
    Blockly.Extensions.registerMutator(PROCEDURE_STATE_MUTATOR, procedureStateMixin)
  }
  const definitions = createBlockDefinitions(context)
  for (const def of definitions) {
    const type = def.type as string
    if (Blockly.Blocks[type]) {
      delete Blockly.Blocks[type]
    }
  }
  Blockly.defineBlocksWithJsonArray(definitions as unknown as Parameters<typeof Blockly.defineBlocksWithJsonArray>[0])
}
