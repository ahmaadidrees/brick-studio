/**
 * Start from nothing's six jobs (docs/qa/blank-2d, boards 3a to 3c; owner decisions 2026-11-04): Player, Wall, Collect,
 * Goal, Hurts and Falls. A job is a built-in power (studio/powers): its blocks are real blocks in the brick's Code, its
 * numbers are sliders (`showInBuild` variables), it switches off and comes off like any power. Nothing in the engine
 * knows about jobs.
 *
 * The Player job has three ways to move: Walks around (the arrow keys, seen from above), Runs and jumps (the Platformer
 * Hero's own scripts) and Drives (the Racing Car's own scripts). Being the player comes from the Player job
 * (LevelDesign.player): the camera follows it, Collect, Goal and Hurts touch it, and a room gives each friend a copy.
 */
import type { BrickDef, SnappedPower } from '../../core/contracts'
import { Blocks, type BlockJson, type Conn } from '../blockBuilder'
import { POWER_FILE_KIND, powerChanged, type PowerBrick, type PowerVariable } from '../powers/powers'
import { createHeroBrick, createHeroOuchSound, HERO_OUCH_SOUND } from '../hero/heroBrick'
import { carVariableId, createCarBrick } from '../race/carBrick'
import { readLabel } from '../code/layers'
import { STAGE_ID, type StudioStore } from '../store'
import { HURT_MESSAGE, jobIdOf, SCORE_ID, SCORE_NAME, WIN_MESSAGE, type JobId, type PlayerWay } from './blankRules'

export interface JobInfo {
  id: JobId
  name: string
  /** A few words on the job's button. */
  what: string
}

export const JOBS: readonly JobInfo[] = [
  { id: 'player', name: 'Player', what: 'You move it with the arrow keys' },
  { id: 'wall', name: 'Wall', what: 'Stops things' },
  { id: 'collect', name: 'Collect', what: 'Adds to the score' },
  { id: 'goal', name: 'Goal', what: 'Touch it to win' },
  { id: 'hurts', name: 'Hurts', what: 'Back to the start' },
  { id: 'falls', name: 'Falls', what: 'Drops onto walls' },
]

export const PLAYER_WAY_INFO: ReadonlyArray<{ id: PlayerWay; name: string; what: string }> = [
  { id: 'walk', name: 'Walks around', what: 'Seen from above, four ways' },
  { id: 'jump', name: 'Runs and jumps', what: 'Side view, the Platformer’s Hero' },
  { id: 'drive', name: 'Drives', what: 'Turns and speeds up, like a Racing car' },
]

/** What the card says a brick's job is, once it has one ("Collect: vanishes when the player touches it"). */
export const JOB_LINES: Readonly<Record<JobId, string>> = {
  player: 'You move it with the arrow keys',
  wall: 'Things can’t go through it',
  collect: 'Vanishes when the player touches it, and adds to the Score',
  goal: 'The player wins when it touches it',
  hurts: 'Sends the player back to the start',
  falls: 'Falls until it lands on something',
}

/** The power's name, as the Powers row and the card show it: "Player · walks around". */
export const jobName = (job: JobId, way?: PlayerWay): string =>
  job === 'player' ? `Player · ${PLAYER_WAY_INFO.find((w) => w.id === (way ?? 'walk'))!.name.toLowerCase()}` : JOBS.find((j) => j.id === job)!.name

const power = (id: string, name: string, what: string, blocks: BlockJson[], variables: PowerVariable[]): PowerBrick => ({
  kind: POWER_FILE_KIND,
  version: 1,
  id: `job-${id}`,
  name,
  credits: ['Brickgineers'],
  what,
  fits: 'brick',
  game: 'blank',
  blocks: blocks.map(({ x: _x, y: _y, ...rest }) => rest as BlockJson),
  variables,
})

const key = (b: Blocks, k: string): Conn => ({ block: b.blk('sensing_keypressed', { fields: { KEY_OPTION: k } }) })
const touchingPlayer = (b: Blocks): Conn => ({ block: b.blk('game_touchingplayer') })
const goToStart = (b: Blocks): BlockJson => b.blk('motion_gotoxy', { inputs: { X: b.v('start_x'), Y: b.v('start_y') } })
const rememberStart = (b: Blocks): BlockJson[] => [b.set('start_x', { block: b.blk('motion_xposition') }), b.set('start_y', { block: b.blk('motion_yposition') })]
const START_VARIABLES: PowerVariable[] = [{ id: 'start_x', name: 'start x', value: 0 }, { id: 'start_y', name: 'start y', value: 0 }]

/** Walks around: seen from above, the arrow keys move it four ways, and walls stop it (board 3b). */
function walk(): PowerBrick {
  const b = new Blocks('walk')
  const blocks = [
    b.flag('When the game starts: no gravity, and remember where I start', [b.blk('platformer_setgravity', { fields: { GRAVITY: 'off' } }), ...rememberStart(b)]),
    b.script('Move with the arrow keys', b.blk('platformer_everytick'), [
      b.setSpeed('x', 0),
      b.setSpeed('y', 0),
      b.when(key(b, 'right arrow'), [b.setSpeed('x', b.v('speed'))]),
      b.when(key(b, 'left arrow'), [b.setSpeed('x', b.sub(0, b.v('speed')))]),
      b.when(key(b, 'up arrow'), [b.setSpeed('y', b.v('speed'))]),
      b.when(key(b, 'down arrow'), [b.setSpeed('y', b.sub(0, b.v('speed')))]),
    ]),
    b.receive('When I get hurt: back to the start', HURT_MESSAGE, [goToStart(b), b.setSpeed('x', 0), b.setSpeed('y', 0)]),
  ]
  return power('player-walk', jobName('player', 'walk'), 'The arrow keys move it four ways, seen from above. Walls stop it.', blocks, [
    { id: 'speed', name: 'speed', value: 3, showInBuild: true },
    ...START_VARIABLES,
  ])
}

/** A built-in brick's own scripts as a power: its top blocks and variables (with their sliders). */
function scriptsOf(made: { brick: BrickDef; workspace: unknown }, keep: (label: string) => boolean = () => true): { blocks: BlockJson[]; variables: PowerVariable[] } {
  const tops = ((made.workspace as { blocks?: { blocks?: BlockJson[] } }).blocks?.blocks ?? []).filter((t) => keep(readLabel(t.data as string | undefined)))
  const variables = made.brick.program.variables.map((v): PowerVariable => ({ id: v.id, name: v.name, value: v.value, ...(v.showInBuild ? { showInBuild: true } : {}) }))
  const lists = made.brick.program.lists.map((l): PowerVariable => ({ id: l.id, name: l.name, value: l.value, list: true }))
  return { blocks: structuredClone(tops), variables: [...variables, ...lists] }
}

/** Runs and jumps: the Platformer Hero's own scripts (it already does its own gravity and goes back when hurt). */
function jump(): PowerBrick {
  const { blocks, variables } = scriptsOf(createHeroBrick())
  return power('player-jump', jobName('player', 'jump'), 'The Platformer Hero’s moves: run with the arrow keys, jump with Space.', blocks, variables)
}

/**
 * Drives: the Racing Car's own scripts, without what only a race track needs (the countdown, the off-road slowdown on
 * unpainted ground and the last lap), plus going when the game starts and back to the start when hurt.
 */
const RACE_ONLY = ['When the countdown says go', 'Off-road slowdown', 'When I finish my last lap']
function drive(): PowerBrick {
  const { blocks, variables } = scriptsOf(createCarBrick(), (label) => !RACE_ONLY.some((l) => label.startsWith(l)))
  const b = new Blocks('drive')
  const go = carVariableId('car', 'go')
  const extra = [
    b.flag('When the game starts: I can drive, and remember where I start', [b.set(go, 1), ...rememberStart(b)]),
    b.receive('When I get hurt: back to the start, stopped', HURT_MESSAGE, [goToStart(b), b.set(carVariableId('car', 'fwd'), 0), b.set(carVariableId('car', 'side'), 0), b.setSpeed('x', 0), b.setSpeed('y', 0)]),
  ]
  return power('player-drive', jobName('player', 'drive'), 'The Racing Car’s moves: up speeds up, left and right turn.', [...blocks, ...extra], [...variables, ...START_VARIABLES])
}

function wall(): PowerBrick {
  const b = new Blocks('wall')
  return power('wall', 'Wall', 'Things can’t go through it.', [b.flag('When the game starts: be solid', [b.blk('platformer_setsolid', { fields: { SOLID: 'on' } })])], [])
}

function collect(): PowerBrick {
  const b = new Blocks('collect')
  return power('collect', 'Collect', 'Vanishes when the player touches it, and adds its points to the Score.', [
    b.flag('When the game starts: show me', [b.show()]),
    b.script('When the player touches me: add my points to the Score, and vanish', b.blk('platformer_everytick'), [
      b.when(touchingPlayer(b), [b.change(SCORE_ID, b.v('points')), b.hide()]),
    ]),
  ], [{ id: 'points', name: 'points', value: 1, showInBuild: true }])
}

function goal(): PowerBrick {
  const b = new Blocks('goal')
  return power('goal', 'Goal', 'The player wins when it touches it.', [
    b.script('When the player touches me: You win!', b.blk('platformer_everytick'), [
      b.when(touchingPlayer(b), [b.say('You win!'), b.broadcast(WIN_MESSAGE), b.stopAll()]),
    ]),
  ], [])
}

function hurts(): PowerBrick {
  const b = new Blocks('hurts')
  return power('hurts', 'Hurts', 'Sends the player back to the start.', [
    b.script('When the player touches me: say hurt (the player goes back to the start)', b.blk('platformer_everytick'), [
      b.when(touchingPlayer(b), [b.broadcast(HURT_MESSAGE)]),
    ]),
  ], [])
}

function falls(): PowerBrick {
  const b = new Blocks('falls')
  return power('falls', 'Falls', 'Falls until it lands on something solid.', [
    b.flag('When the game starts: fall', [b.gravityOn()]),
  ], [])
}

/** The power a job is. */
export function jobPower(job: JobId, way: PlayerWay = 'walk'): PowerBrick {
  switch (job) {
    case 'player': return way === 'jump' ? jump() : way === 'drive' ? drive() : walk()
    case 'wall': return wall()
    case 'collect': return collect()
    case 'goal': return goal()
    case 'hurts': return hurts()
    case 'falls': return falls()
  }
}

/** A snap's job tag: 'player:walk', 'wall'... */
const jobTag = (job: JobId, way?: PlayerWay) => (job === 'player' ? `player:${way ?? 'walk'}` : job)

/** The snap of this job on a brick, if it has it. */
export const snapOfJob = (brick: Pick<BrickDef, 'powers'>, job: JobId): SnappedPower | undefined => brick.powers?.find((p) => jobIdOf(p.job) === job)

/**
 * Give a brick a job. The Player job makes it the player (a Player job left on the previous player comes off, unless
 * the kid changed it); another way of moving replaces the one it has. Collect makes the Score; Runs and jumps brings
 * the Hero's "Ouch". Returns the snap, or null when the brick can't have jobs (the Stage).
 */
export function giveJob(store: StudioStore, brickId: string, job: JobId, way: PlayerWay = 'walk'): SnappedPower | null {
  const brick = store.brick(brickId)
  if (!brick || brickId === STAGE_ID) return null
  const had = snapOfJob(brick, job)
  if (had && had.job === jobTag(job, way)) return had
  if (had) store.takeOffPower(brickId, had.id)
  if (job === 'player') {
    const before = store.getState().project.design.player
    const old = before && before !== brickId ? store.brick(before) : undefined
    const oldSnap = old && snapOfJob(old, 'player')
    if (old && oldSnap && !powerChanged(store.getState().project, old.id, oldSnap.id)) store.takeOffPower(old.id, oldSnap.id)
  }
  if (job === 'collect') store.ensureStageData([{ id: SCORE_ID, name: SCORE_NAME, value: 0 }])
  if (job === 'player' && way === 'jump' && !store.brick(brickId)?.sounds.some((s) => s.name === HERO_OUCH_SOUND)) {
    store.setSounds(brickId, [...(store.brick(brickId)?.sounds ?? []), createHeroOuchSound()])
  }
  const snap = store.giveJob(brickId, jobPower(job, way), jobTag(job, way))
  if (snap && job === 'player') store.setPlayer(brickId)
  return snap
}

/** Every job a brick can be given, Player once per way of moving (tiles can't be the player): Code's lists. */
export interface JobChoice { key: string; job: JobId; way?: PlayerWay; name: string; what: string }
export function jobChoices(brick: Pick<BrickDef, 'grid'>): JobChoice[] {
  return JOBS.flatMap((j): JobChoice[] => j.id === 'player'
    ? brick.grid ? [] : PLAYER_WAY_INFO.map((w) => ({ key: `player:${w.id}`, job: j.id, way: w.id, name: jobName('player', w.id), what: w.what }))
    : [{ key: j.id, job: j.id, name: j.name, what: j.what }])
}

/** The jobs on a brick, with their snaps, in order. */
export function jobSnaps(brick: Pick<BrickDef, 'powers'>): Array<{ job: JobId; snap: SnappedPower }> {
  return (brick.powers ?? []).flatMap((snap) => {
    const job = jobIdOf(snap.job)
    return job ? [{ job, snap }] : []
  })
}
