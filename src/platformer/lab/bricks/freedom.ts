import {
  addDefinitions,
  argument,
  arith,
  body,
  broadcast,
  call,
  compare,
  define,
  distance,
  forever,
  ifElse,
  ifThen,
  launch,
  make,
  mem,
  moveXY,
  position,
  program,
  remove,
  setMem,
  setSpeed,
  setVariable,
  solid,
  sound,
  turnAround,
  type ScriptNode,
  variable,
  wait,
  when,
} from './dsl'
import type { WorkspaceJson } from './dsl'

/** Throwing move for the returning ball example; append these scripts to the player's existing moves. */
export const returningThrowScripts = (): ScriptNode[] => [
  when.key(
    'z',
    ifThen(
      compare(mem('my', 'cooldown'), '=', 0),
      setMem('my', 'cooldown', 1),
      make('returning-ball', 'hand'),
      sound('whoosh'),
      wait(0.7),
      setMem('my', 'cooldown', 0),
    ),
  ),
]

/** A ball that flies out, then steps toward the player's live x/y position until it reaches them. */
export const returningBallProgram = (): WorkspaceJson =>
  program(
    'returning-ball',
    when.appear(
      body('gravity', 0),
      launch('me', 0, 6),
      wait(0.45),
      forever(
        ifElse(
          compare(position('player', 'x'), '<', position('me', 'x')),
          [moveXY('me', arith(position('me', 'x'), '-', 4), position('me', 'y'))],
          [ifThen(compare(position('player', 'x'), '>', position('me', 'x')), moveXY('me', arith(position('me', 'x'), '+', 4), position('me', 'y')))],
        ),
        ifElse(
          compare(position('player', 'y'), '<', position('me', 'y')),
          [moveXY('me', position('me', 'x'), arith(position('me', 'y'), '-', 4))],
          [ifThen(compare(position('player', 'y'), '>', position('me', 'y')), moveXY('me', position('me', 'x'), arith(position('me', 'y'), '+', 4)))],
        ),
        ifThen(compare(distance('player'), '<', 1), remove('me')),
      ),
    ),
  )

/** Player controls: Z sends GO; X sends STOP. Both store a shared value and broadcast a message. */
export const trafficSignalProgram = (): WorkspaceJson =>
  program(
    'traffic-signal',
    when.key('z', setVariable('world', 'signal', 1), broadcast('GO')),
    when.key('x', setVariable('world', 'signal', 0), broadcast('STOP')),
  )

/** The vehicle responds to messages and checks the shared world signal before moving. */
export const signalCarProgram = (): WorkspaceJson =>
  program(
    'signal-car',
    when.appear(solid('platform'), body('gravity', 100), setVariable('world', 'signal', 0)),
    when.message('GO', ifThen(compare(variable('world', 'signal'), '>', 0), setSpeed('me', 'right', 3))),
    when.message('STOP', ifThen(compare(variable('world', 'signal'), '=', 0), setSpeed('me', 'right', 0))),
  )

/** A reusable custom block called with a number; change the call's speed to change its pace. */
export const reusablePatrolProgram = (pace = 1.5): WorkspaceJson => {
  const events = program('reusable-patrol', when.appear(solid('platform'), body('gravity', 0), call('patrolAtSpeed', pace)))
  return addDefinitions(
    events,
    'reusable-patrol',
    define('patrolAtSpeed', ['pace'], forever(setSpeed('me', 'forward', argument('pace')), wait(1), turnAround())),
  )
}
