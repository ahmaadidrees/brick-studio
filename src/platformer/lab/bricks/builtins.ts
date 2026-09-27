import type { Costume } from '../program/types'
import {
  body,
  changeMem,
  compare,
  costume,
  forever,
  hurt,
  ifThen,
  moveTo,
  heroOn,
  mem,
  probe,
  program,
  remove,
  say,
  setMem,
  setSpeed,
  solid,
  sound,
  turnAround,
  wait,
  when,
  type WorkspaceJson,
} from './dsl'

/**
 * A brick: a costume and a block program. Built-ins live here, in code; a lab keeps its own copies of the ones it
 * changed (origin "copy", same id) and the bricks the kid saved or a recipe made (origin "mine").
 */
export interface BrickDef {
  id: string
  /** Picked words, never typed. */
  name: string
  costume: Costume
  /** The brick it was made from. */
  basedOn: string | null
  origin: 'builtin' | 'copy' | 'mine'
  program: WorkspaceJson | unknown
  /** One line for the brick library. */
  blurb: string
}

export const PLAYER_ID = 'you'

const you: BrickDef = {
  id: PLAYER_ID,
  name: 'My moves',
  costume: 'hero',
  basedOn: null,
  origin: 'builtin',
  blurb: 'You! Your moves are code too.',
  program: program(
    'you',
    when.appear(heroOn()),
    when.touch('tile:spikes', 'any', hurt('me')),
    when.touch('tile:lava', 'any', hurt('me')),
    when.hurt(sound('ouch'), moveTo('me', 'start')),
  ),
}

const walker: BrickDef = {
  id: 'walker',
  name: 'Walker',
  costume: 'walker',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Walks, turns at walls. Stomp it!',
  program: program(
    'walker',
    when.appear(forever(setSpeed('me', 'forward', 0.5), ifThen(probe('wall', 'ahead'), turnAround()))),
    when.touch('brick:walker', 'side', turnAround()),
    when.touch('player', 'side', hurt('them')),
    when.stomped(setSpeed('them', 'up', 4), sound('squish'), remove('me')),
    when.hurt(sound('kick'), remove('me')),
  ),
}

const spiky: BrickDef = {
  id: 'spiky',
  name: 'Spiky',
  costume: 'spiky',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Too spiky to stomp.',
  program: program(
    'spiky',
    when.appear(forever(setSpeed('me', 'forward', 0.4), ifThen(probe('wall', 'ahead'), turnAround()))),
    when.touch('player', 'any', hurt('them')),
    when.hurt(sound('kick'), remove('me')),
  ),
}

const flyer: BrickDef = {
  id: 'flyer',
  name: 'Flyer',
  costume: 'flyer',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Floats up and down.',
  program: program(
    'flyer',
    when.appear(body('gravity', 0), forever(setSpeed('me', 'up', 0.5), wait(1), setSpeed('me', 'down', 0.5), wait(1))),
    when.touch('player', 'side', hurt('them')),
    when.stomped(setSpeed('them', 'up', 4), sound('squish'), remove('me')),
    when.hurt(sound('kick'), remove('me')),
  ),
}

const spring: BrickDef = {
  id: 'spring',
  name: 'Spring',
  costume: 'spring',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Land on it to fly up. Hold space for more.',
  program: program(
    'spring',
    when.appear(solid('platform')),
    when.touch('any', 'top', setSpeed('them', 'up', 7), sound('boing'), costume('springDown'), wait(0.2), costume('spring')),
  ),
}

const qblock: BrickDef = {
  id: 'qblock',
  name: '? Block',
  costume: 'qblock',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Bump it from below for a coin.',
  program: program(
    'qblock',
    when.appear(solid('solid'), body('gravity', 0)),
    when.touch(
      'player',
      'bottom',
      ifThen(
        compare(mem('my', 'used'), '=', 0),
        setMem('my', 'used', 1),
        costume('usedBlock'),
        changeMem('player', 'coins', 1),
        sound('coin'),
        say('gotit', 1),
      ),
    ),
  ),
}

const platform: BrickDef = {
  id: 'platform',
  name: 'Moving platform',
  costume: 'platform',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Goes back and forth. Ride it.',
  program: program('platform', when.appear(solid('platform'), body('gravity', 0), forever(setSpeed('me', 'forward', 1), wait(1.5), turnAround()))),
}

const coin: BrickDef = {
  id: 'coin',
  name: 'Coin',
  costume: 'coin',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Grab it.',
  program: program('coin', when.appear(body('gravity', 0)), when.touch('player', 'any', changeMem('player', 'coins', 1), sound('coin'), remove('me'))),
}

const goal: BrickDef = {
  id: 'goal',
  name: 'Goal',
  costume: 'goal',
  basedOn: null,
  origin: 'builtin',
  blurb: 'The end of the level.',
  program: program('goal', when.appear(body('gravity', 0)), when.touch('player', 'any', sound('tada'), say('madeit', 3))),
}

const ball: BrickDef = {
  id: 'ball',
  name: 'Ball',
  costume: 'ball',
  basedOn: null,
  origin: 'builtin',
  blurb: 'Bouncy. Knocks out Walkers.',
  program: program(
    'ball',
    when.appear(body('bounce', 75), body('friction', 20), wait(3), remove('me')),
    when.touch('brick:walker', 'any', hurt('them'), remove('me')),
  ),
}

const crate: BrickDef = {
  id: 'crate',
  name: 'Crate',
  costume: 'crate',
  basedOn: null,
  origin: 'builtin',
  blurb: 'A solid box. Stand on it.',
  program: program('crate', when.appear(solid('solid'))),
}

/** Built-in bricks, in library order ("You" first). */
export const BUILTIN_BRICKS: readonly BrickDef[] = [you, walker, spiky, flyer, spring, qblock, platform, coin, goal, ball, crate]
export const builtinBrick = (id: string): BrickDef | undefined => BUILTIN_BRICKS.find((b) => b.id === id)

/** A blank program for a brand-new brick. */
export function blankProgram(prefix: string): WorkspaceJson {
  return program(prefix, when.appear())
}
