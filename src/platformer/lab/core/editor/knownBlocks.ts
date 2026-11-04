/**
 * Every block type this version of Brickgineers can open and run: the blocks the editor defines (core/editor/definitions.ts
 * and the shareable-procedures blocks kept so old saves load), the literal blocks the compiler reads, and every opcode the
 * runtime runs (core/index.ts ALL_PRIMITIVES, the control blocks in core/runtime.ts, the hats).
 *
 * A plain list with no imports, so the Worker can check a class shelf power with the same list the app uses
 * (multiplayer/worker/src/classroom/shelf.ts). knownBlocks.test.ts rebuilds it from the registered blocks and fails when
 * it falls behind: add a new block there and here together.
 */
export const KNOWN_BLOCK_TYPES: readonly string[] = [
  'argument_reporter_boolean', 'argument_reporter_string_number',
  'colour_picker',
  'control_create_clone_of', 'control_create_clone_of_menu', 'control_delete_this_clone', 'control_forever',
  'control_if', 'control_if_else', 'control_repeat', 'control_repeat_until', 'control_start_as_clone', 'control_stop',
  'control_wait', 'control_wait_until', 'control_while',
  'data_addtolist', 'data_changevariableby', 'data_deletealloflist', 'data_deleteoflist', 'data_hidelist',
  'data_hidevariable', 'data_insertatlist', 'data_itemnumoflist', 'data_itemoflist', 'data_lengthoflist',
  'data_listcontainsitem', 'data_listcontents', 'data_replaceitemoflist', 'data_setvariableto', 'data_showlist',
  'data_showvariable', 'data_variable',
  'event_broadcast', 'event_broadcastandwait', 'event_whenbackdropswitchesto', 'event_whenbroadcastreceived',
  'event_whenflagclicked', 'event_whengreaterthan', 'event_whenkeypressed', 'event_whenstageclicked',
  'event_whenthisspriteclicked',
  'looks_backdropnumbername', 'looks_changeeffectby', 'looks_changesizeby', 'looks_cleargraphiceffects',
  'looks_costumenumbername', 'looks_goforwardbackwardlayers', 'looks_gotofrontback', 'looks_hide',
  'looks_nextbackdrop', 'looks_nextcostume', 'looks_say', 'looks_sayforsecs', 'looks_seteffectto', 'looks_setsizeto',
  'looks_show', 'looks_size', 'looks_switchbackdropto', 'looks_switchbackdroptoandwait', 'looks_switchcostumeto',
  'looks_think', 'looks_thinkforsecs',
  'math_integer', 'math_number', 'math_positive_number', 'math_whole_number',
  'motion_changexby', 'motion_changeyby', 'motion_direction', 'motion_glidesecstoxy', 'motion_glideto', 'motion_goto',
  'motion_gotoxy', 'motion_ifonedgebounce', 'motion_movesteps', 'motion_pointindirection', 'motion_pointtowards',
  'motion_setrotationstyle', 'motion_setx', 'motion_sety', 'motion_turnleft', 'motion_turnright', 'motion_xposition',
  'motion_yposition',
  'operator_add', 'operator_and', 'operator_contains', 'operator_divide', 'operator_equals', 'operator_gt',
  'operator_join', 'operator_length', 'operator_letter_of', 'operator_lt', 'operator_mathop', 'operator_mod',
  'operator_multiply', 'operator_not', 'operator_or', 'operator_random', 'operator_round', 'operator_subtract',
  'platformer_changespeed', 'platformer_everytick', 'platformer_hitsomething', 'platformer_movecarry', 'platformer_moveuntilhit',
  'platformer_onground', 'platformer_setgravity', 'platformer_setmover', 'platformer_setonground',
  'platformer_setsolid', 'platformer_setspeed', 'platformer_slipcorner', 'platformer_speed', 'platformer_tellhit', 'platformer_whenbump',
  'platformer_whathit', 'platformer_whenland', 'platformer_whenleaveground',
  'procedures_call', 'procedures_callnoreturn', 'procedures_callreturn', 'procedures_definition',
  'procedures_defnoreturn', 'procedures_defreturn', 'procedures_prototype',
  'race_groundunder', 'race_lapsdone', 'race_myplace', 'race_trackdirection', 'race_whenlap',
  'sensing_answer', 'sensing_askandwait', 'sensing_coloristouchingcolor', 'sensing_current', 'sensing_currentmenu',
  'sensing_dayssince2000', 'sensing_distanceto', 'sensing_distancetomenu', 'sensing_keyoptions', 'sensing_keypressed',
  'sensing_loud', 'sensing_loudness', 'sensing_mousedown', 'sensing_mousex', 'sensing_mousey', 'sensing_of',
  'sensing_of_object_menu', 'sensing_resettimer', 'sensing_setdragmode', 'sensing_timer', 'sensing_touchingcolor',
  'sensing_touchingobject', 'sensing_touchingobjectmenu', 'sensing_userid', 'sensing_username',
  'sound_changeeffectby', 'sound_changevolumeby', 'sound_cleareffects', 'sound_play', 'sound_playuntildone',
  'sound_seteffectto', 'sound_setvolumeto', 'sound_stopallsounds', 'sound_volume',
  'text',
]

const KNOWN = new Set(KNOWN_BLOCK_TYPES)

export function isKnownBlockType(type: unknown): type is string {
  return typeof type === 'string' && KNOWN.has(type)
}
