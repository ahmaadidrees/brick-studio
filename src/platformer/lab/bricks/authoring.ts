import {
  and,
  arith,
  body,
  compare,
  forever,
  frame,
  ifThen,
  keyHeld,
  moveXY,
  nextFrame,
  not,
  playFrames,
  position,
  program,
  setControls,
  setPhysics,
  setSpeed,
  setVariable,
  solid,
  sayText,
  touching,
  variable,
  when,
  whenClicked,
  type ScriptNode,
  type WorkspaceJson,
} from './dsl'

/**
 * A character's own little animation: students draw frames in the appearance editor, then the script can step
 * between them. The click script is composed with the player's existing movement and damage scripts.
 */
export const reactiveCharacterScripts = (): ScriptNode[] => [
  when.appear(playFrames(4)),
  whenClicked(sayText('I made this!', 2), nextFrame()),
]

/**
 * A student-built ride-on car using only positions, key sensing, variables and control/physics blocks.
 * Up boards when the player touches it; down restores the player beside the car. No ride shortcut is used.
 */
export const programmableCarProgram = (): WorkspaceJson =>
  program(
    'programmable-car',
    when.appear(solid('platform'), body('gravity', 100), setVariable('my', 'driving', 0)),
    when.key(
      'up',
      ifThen(
        and(
          and(touching('player'), compare(variable('my', 'driving'), '=', 0)),
          compare(variable('player', 'vehicle'), '=', 0),
        ),
        setVariable('my', 'driving', 1),
        setVariable('player', 'vehicle', 1),
        setControls('player', false),
        setPhysics('player', false),
      ),
    ),
    when.key(
      'down',
      ifThen(
        compare(variable('my', 'driving'), '=', 1),
        moveXY('player', arith(position('me', 'x'), '+', 22), position('me', 'y')),
        setPhysics('player', true),
        setControls('player', true),
        setVariable('player', 'vehicle', 0),
        setVariable('my', 'driving', 0),
      ),
    ),
    when.appear(
      forever(
        ifThen(
          compare(variable('my', 'driving'), '=', 1),
          ifThen(keyHeld('right'), setSpeed('me', 'right', 3)),
          ifThen(and(not(keyHeld('right')), keyHeld('left')), setSpeed('me', 'left', 3)),
          ifThen(and(not(keyHeld('left')), not(keyHeld('right'))), setSpeed('me', 'right', 0)),
          moveXY('player', position('me', 'x'), arith(position('me', 'y'), '-', 8)),
        ),
      ),
    ),
  )

/** Optional helper for examples that want to choose a particular drawn frame explicitly. */
export const showCharacterFrame = (index: number) => frame(index)
