import {
  and,
  changeMem,
  changeSpeed,
  compare,
  costume,
  dropRider,
  face,
  forever,
  hasRider,
  hurt,
  ifElse,
  ifThen,
  keyHeld,
  launch,
  letRide,
  make,
  mem,
  not,
  onGround,
  probe,
  program,
  remove,
  setMem,
  setSpeed,
  show,
  solid,
  sound,
  speed,
  touching,
  turnAround,
  wait,
  when,
  type ScriptNode,
  type WorkspaceJson,
} from './dsl'

/*
 * "I want to…": five examples, each made only from the lab's primitives. Opening one puts its code where it belongs
 * (your moves, a Walker, or a new brick placed next to you) and opens that code, so every recipe is also something
 * to read and change.
 */

export type RecipeId = 'double-jump' | 'throw' | 'car' | 'rocket' | 'ledge-walker'

export interface Recipe {
  id: RecipeId
  /** "I want to …" */
  want: string
  /** How to try it, one short line. */
  tryIt: string
  /** The primitives it is made of. */
  uses: string[]
  /** Whose code it lives in. */
  brick: string
}

export const RECIPES: readonly Recipe[] = [
  {
    id: 'double-jump',
    want: 'jump again in the air',
    tryIt: 'Press space to jump, then space again in the air.',
    uses: ['when I land', 'when key pressed', 'on the ground?', 'set speed up', 'my memory'],
    brick: 'you',
  },
  {
    id: 'throw',
    want: 'throw a ball',
    tryIt: 'Press Z. Wait a moment between throws.',
    uses: ['when key pressed', 'make a thing', 'launch at an angle', 'bounce', 'wait (cooldown)'],
    brick: 'you',
  },
  {
    id: 'car',
    want: 'drive a car',
    tryIt: 'Walk to the car and press ↑ to get in. ← → drive, ↓ gets out.',
    uses: ['let them ride me', 'key held?', 'change speed', 'friction', 'a platform'],
    brick: 'car',
  },
  {
    id: 'rocket',
    want: 'ride a rocket',
    tryIt: 'Press ↑ at the rocket, then hold space to fly. Watch the fuel.',
    uses: ['let them ride me', 'key held?', 'change speed up', 'my fuel', 'show above me', 'when I land'],
    brick: 'rocket',
  },
  {
    id: 'ledge-walker',
    want: 'make Walkers turn at ledges',
    tryIt: 'Watch a Walker reach the end of a platform.',
    uses: ['is there ground ahead and down?', 'on the ground?', 'not', 'turn around'],
    brick: 'walker',
  },
]

export const recipeById = (id: string) => RECIPES.find((r) => r.id === id)

/**
 * Double jump: one more jump in the air. "jumps" counts the jumps made in the air since you last landed (memory
 * starts at 0, so it works at once); landing sets it back to 0. "< 2" would give a triple jump.
 */
export const doubleJumpScripts = (): ScriptNode[] => [
  when.land(setMem('my', 'jumps', 0)),
  when.key(
    'space',
    ifThen(and(not(onGround()), compare(mem('my', 'jumps'), '<', 1)), setSpeed('me', 'up', 4.5), changeMem('my', 'jumps', 1), sound('hop')),
  ),
]

/** Throw: a ball from your hand the way you face, and a short cooldown. Added to your moves. */
export const throwScripts = (): ScriptNode[] => [
  when.key(
    'z',
    ifThen(
      compare(mem('my', 'cooldown'), '=', 0),
      setMem('my', 'cooldown', 1),
      make('ball', 'hand'),
      launch('it', 20, 5),
      sound('whoosh'),
      wait(0.4),
      setMem('my', 'cooldown', 0),
    ),
  ),
]

/** A car you get into and drive. */
export const carProgram = (): WorkspaceJson =>
  program(
    'car',
    when.appear(
      solid('platform'),
      forever(
        ifThen(
          hasRider(),
          ifThen(keyHeld('right'), face('right'), changeSpeed('me', 'forward', 0.5)),
          ifThen(keyHeld('left'), face('left'), changeSpeed('me', 'forward', 0.5)),
        ),
      ),
    ),
    when.key('up', ifThen(and(touching('player'), not(hasRider())), letRide('player'), sound('bump'))),
    when.key('down', ifThen(hasRider(), dropRider())),
    when.touch('brick:walker', 'side', hurt('them')),
  )

/** A rocket you ride: it thrusts up while you hold space and it has fuel, and fills up again when it lands. */
export const rocketProgram = (): WorkspaceJson =>
  program(
    'rocket',
    when.appear(
      setMem('my', 'fuel', 100),
      show('my', 'fuel'),
      forever(
        ifThen(hasRider(), ifThen(keyHeld('right'), setSpeed('me', 'right', 1.5)), ifThen(keyHeld('left'), setSpeed('me', 'left', 1.5))),
        ifElse(
          and(hasRider(), and(keyHeld('space'), compare(mem('my', 'fuel'), '>', 0))),
          [costume('rocketFire'), changeMem('my', 'fuel', -1), ifThen(compare(speed('up'), '<', 3), changeSpeed('me', 'up', 0.5))],
          [costume('rocket')],
        ),
      ),
    ),
    when.key('up', ifThen(and(touching('player'), not(hasRider())), letRide('player'), sound('powerup'))),
    when.key('down', ifThen(hasRider(), dropRider())),
    when.land(setMem('my', 'fuel', 100)),
  )

/** The built-in Walker with one more check: no ground ahead and down means a ledge, so turn around. */
export const ledgeWalkerProgram = (): WorkspaceJson =>
  program(
    'walker',
    when.appear(
      forever(
        setSpeed('me', 'forward', 0.5),
        ifThen(probe('wall', 'ahead'), turnAround()),
        ifThen(and(onGround(), not(probe('ground', 'aheadDown'))), turnAround()),
      ),
    ),
    when.touch('brick:walker', 'side', turnAround()),
    when.touch('player', 'side', hurt('them')),
    when.stomped(setSpeed('them', 'up', 4), sound('squish'), remove('me')),
    when.hurt(sound('kick'), remove('me')),
  )
