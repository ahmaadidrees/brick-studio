import { TILT_MAX, type ImageName, type Pin, type TuneName } from './protocol'

/*
 * What each part of the micro:bit does in each game mode. Students change these in the panel; nothing is reflashed.
 * Pure data and functions: the store holds the state, the game modes read `resolve`.
 */

export type RemoteMode = 'platformer' | 'race' | '3d'
export const REMOTE_MODES: RemoteMode[] = ['platformer', 'race', '3d']

/** Parts of the board a student can assign. Shake and loud are moments, the pins are held, tilt is a stick. */
export type Part = Pin | 'tilt' | 'shake' | 'loud'
export const PARTS: Part[] = ['a', 'b', 'logo', 'tilt', 'shake', 'loud', 'p0', 'p1', 'p2']

export const PART_NAMES: Record<Part, string> = {
  a: 'Button A',
  b: 'Button B',
  logo: 'Touch logo',
  tilt: 'Tilt',
  shake: 'Shake',
  loud: 'Clap (loud sound)',
  p0: 'Pin P0',
  p1: 'Pin P1',
  p2: 'Pin P2',
}

/** Things a part can do. `walk` and `steer` are tilt only: they read how far the board leans. */
export type RemoteAction = 'nothing' | 'jump' | 'run' | 'left' | 'right' | 'up' | 'down' | 'restart' | 'walk' | 'gas' | 'brake' | 'item' | 'steer'

export const ACTION_NAMES: Record<RemoteAction, string> = {
  nothing: 'Nothing',
  jump: 'Jump',
  run: 'Run',
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
  restart: 'Restart',
  walk: 'Walk (tilt)',
  gas: 'Gas',
  brake: 'Brake',
  item: 'Use item',
  steer: 'Steer (tilt)',
}

export const MODE_NAMES: Record<RemoteMode, string> = { platformer: 'Platformer', race: 'Race', '3d': '3D world' }

const MODE_ACTIONS: Record<RemoteMode, RemoteAction[]> = {
  platformer: ['nothing', 'jump', 'run', 'left', 'right', 'up', 'down', 'restart', 'walk'],
  race: ['nothing', 'gas', 'brake', 'item', 'left', 'right', 'restart', 'steer'],
  '3d': ['nothing', 'jump', 'run', 'walk'],
}

const TILT_ONLY: RemoteAction[] = ['walk', 'steer']

/** The actions a part may be given in a mode (tilt gets only the stick actions; other parts never get them). */
export function actionsFor(mode: RemoteMode, part: Part): RemoteAction[] {
  return MODE_ACTIONS[mode].filter((a) => a === 'nothing' || (part === 'tilt') === TILT_ONLY.includes(a))
}

export type Assignments = Record<Part, RemoteAction>

const none: Assignments = { a: 'nothing', b: 'nothing', logo: 'nothing', tilt: 'nothing', shake: 'nothing', loud: 'nothing', p0: 'nothing', p1: 'nothing', p2: 'nothing' }

/** Works the moment students plug in. */
export const DEFAULT_ASSIGNMENTS: Record<RemoteMode, Assignments> = {
  platformer: { ...none, a: 'jump', b: 'run', logo: 'restart', tilt: 'walk', shake: 'jump' },
  race: { ...none, a: 'gas', b: 'brake', logo: 'item', tilt: 'steer', shake: 'item' },
  '3d': { ...none, a: 'jump', b: 'run', tilt: 'walk', shake: 'jump' },
}

/** Keeps only valid actions, so a stored or imported set can never give tilt "jump" or a button "steer". */
export function cleanAssignments(mode: RemoteMode, raw: unknown): Assignments {
  const out = { ...DEFAULT_ASSIGNMENTS[mode] }
  if (!raw || typeof raw !== 'object') return out
  for (const part of PARTS) {
    const v = (raw as Record<string, unknown>)[part]
    if (typeof v === 'string' && (actionsFor(mode, part) as string[]).includes(v)) out[part] = v as RemoteAction
  }
  return out
}

/** The live state of a board, real or virtual. */
export interface BoardState {
  pins: Record<Pin, boolean>
  /** milli-g, -1024…1024; x: right is +, y: toward you is +. */
  tilt: { x: number; y: number }
  /** Until when (ms, performance clock) a moment part counts as held. */
  pulses: Partial<Record<'shake' | 'loud', number>>
}

export const IDLE_BOARD: BoardState = {
  pins: { a: false, b: false, logo: false, p0: false, p1: false, p2: false },
  tilt: { x: 0, y: 0 },
  pulses: {},
}

/** How long a shake or clap holds its action: long enough for the game to see a press. */
export const PULSE_MS = 150

/** Tilt below this fraction is "level". Full lean is about 35°. */
const DEAD = 0.12
const FULL = 0.6
/** Tilt beyond this counts as holding left or right (walk in the platformer). */
const WALK_HOLD = 0.3

/** -1…1 from milli-g, with a dead zone in the middle. */
export function tiltAxis(milliG: number): number {
  const v = milliG / TILT_MAX
  const m = Math.abs(v)
  if (m < DEAD) return 0
  return Math.sign(v) * Math.min(1, (m - DEAD) / (FULL - DEAD))
}

/** What the game should do right now. `held` names game actions; `stick` is set only when tilt is a stick. */
export interface RemoteOutput {
  held: Set<RemoteAction>
  /** x: right +; y: forward (away from you) +. */
  stick: { x: number; y: number } | null
}

export function resolve(assign: Assignments, board: BoardState, now: number): RemoteOutput {
  const held = new Set<RemoteAction>()
  const hold = (a: RemoteAction) => {
    if (a !== 'nothing' && !TILT_ONLY.includes(a)) held.add(a)
  }
  for (const pin of Object.keys(board.pins) as Pin[]) if (board.pins[pin]) hold(assign[pin])
  for (const p of ['shake', 'loud'] as const) if ((board.pulses[p] ?? 0) > now) hold(assign[p])

  let stick: RemoteOutput['stick'] = null
  const t = assign.tilt
  if (t === 'walk' || t === 'steer') {
    stick = { x: tiltAxis(board.tilt.x), y: -tiltAxis(board.tilt.y) }
    if (t === 'walk') {
      if (stick.x <= -WALK_HOLD) held.add('left')
      if (stick.x >= WALK_HOLD) held.add('right')
    }
  }
  return { held, stick }
}

/* ---------- Reactions: what the micro:bit does when something happens in the game ---------- */

export type GameEvent = 'coin' | 'hurt' | 'die' | 'checkpoint' | 'goal' | 'powerup' | 'item' | 'lap' | 'finish'
export const GAME_EVENTS: GameEvent[] = ['coin', 'hurt', 'die', 'powerup', 'checkpoint', 'goal', 'item', 'lap', 'finish']

export const EVENT_NAMES: Record<GameEvent, string> = {
  coin: 'Got a coin',
  hurt: 'Got hurt',
  die: 'Lost a life',
  checkpoint: 'Checkpoint',
  goal: 'Reached the goal',
  powerup: 'Power-up',
  item: 'Got an item',
  lap: 'New lap',
  finish: 'Finished the race',
}

/** Which modes can send each event. */
export const EVENT_MODES: Record<GameEvent, RemoteMode[]> = {
  coin: ['platformer', 'race'],
  hurt: ['platformer', 'race'],
  die: ['platformer'],
  checkpoint: ['platformer'],
  goal: ['platformer'],
  powerup: ['platformer', 'race'],
  item: ['race'],
  lap: ['race'],
  finish: ['race'],
}

/** `count` shows the number that comes with the event (the lap, your place). */
export type ReactionShow = ImageName | 'count' | 'none'
export type ReactionSound = TuneName | 'beep' | 'buzz' | 'none'
export interface Reaction {
  show: ReactionShow
  sound: ReactionSound
}

export const DEFAULT_REACTIONS: Record<GameEvent, Reaction> = {
  coin: { show: 'heart', sound: 'beep' },
  hurt: { show: 'sad', sound: 'buzz' },
  die: { show: 'skull', sound: 'power_down' },
  checkpoint: { show: 'yes', sound: 'ba_ding' },
  goal: { show: 'happy', sound: 'power_up' },
  powerup: { show: 'star', sound: 'jump_up' },
  item: { show: 'diamond', sound: 'beep' },
  lap: { show: 'count', sound: 'ba_ding' },
  finish: { show: 'count', sound: 'entertainer' },
}
