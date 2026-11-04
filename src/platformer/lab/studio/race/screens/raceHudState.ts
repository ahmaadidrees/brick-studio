/**
 * What Racing's Play HUD shows, read from the running race (no React): the Starter's countdown, the Car's lap, its
 * place, and the results once the Car finishes. Lane 4 of docs/qa/hackable-modes/R1-SCREENS.md.
 *
 * It only reads. The countdown is the Starter's own words (whatever a kid makes it say), mirrored because the Starter
 * can be off camera. Laps and places come from core/race.ts, the same numbers `laps done` and `my place` report.
 *
 * In a room every player's Car is a copy of the same Car (core/players.ts), so each one's costume says "You": each
 * screen follows its own player's Car, and names the others by their players' names in the room.
 */
import type { LevelDesign, Target, World } from '../../../core/contracts'
import { isRacer, raceLapState, raceLoopOf, racePlace, RACE_LOOP_REASON_TEXT } from '../../../core/race'
import { isPlayerBrick } from '../../kitScreens'
import { RACE_GLOBALS } from '../carBrick'
import { STARTER_BRICK_ID } from '../raceTrack'

/** One line of the results card, or of the live standings. */
export interface RaceStanding {
  place: number
  name: string
  /** Over the line (on the results list); false: still racing. */
  done: boolean
  you: boolean
  /** The lap this racer is on (live standings). */
  lap?: number
  /** Ticks from "go" to crossing the line for the last time, when known (results). */
  time?: number | null
}

export interface RaceHudState {
  /** What the Starter is saying while it counts down ("3", "2", "1", "Go!"), or null. */
  countdown: string | null
  /** The lap the Car is on, 1 to `laps` (stays at `laps` once it finishes). */
  lap: number
  laps: number
  /** The Car's place, 1 for the leader; 0 when laps can't count or there is no Car. */
  place: number
  /** How many racers (cars that drive themselves), the Car included. */
  racers: number
  /** The Car has done its last lap. */
  finished: boolean
  /** Why laps don't count on this track (the Build chip's words), or null when they do. */
  noLaps: string | null
  /** Everyone in order once the Car finishes: the results list first, then whoever is still racing. Empty before. */
  standings: RaceStanding[]
  /** Ticks since "go", stopped when the Car finishes; null before the race starts (or when the start was not seen). */
  time: number | null
  /** The Car's fastest lap so far, in ticks; null before its first lap. */
  bestLap: number | null
  /** Everyone in race order while the race is on (classic's standings box). Empty before "go" or with one racer. */
  live: RaceStanding[]
}

/** Longer than this, the Starter is not counting down (it is showing the results, or a kid's own message). */
const COUNTDOWN_MAX = 12
const DEFAULT_LAPS = 3

/** A race time like the classic HUD's: seconds to a tenth ("41.3s"). */
export const formatRaceTime = (ticks: number): string => `${(Math.max(0, ticks) / 30).toFixed(1)}s`

export const ordinal = (n: number): string => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) % 10 === 1 ? 0 : n % 10] || 'th')

const isStarter = (world: World, t: Target): boolean => {
  if (t.isStage || t.isClone) return false
  const brick = world.bricks[t.brickId]
  return !!brick && (brick.id === STARTER_BRICK_ID || brick.remixOf === STARTER_BRICK_ID || brick.name.trim().toLowerCase() === 'starter')
}

/** A racer's name on the results: its costume's name ("You", "Red racer"), as the results list writes it. */
export const racerName = (world: World, t: Target): string => world.bricks[t.brickId]?.costumes[t.costumeIndex]?.name ?? world.bricks[t.brickId]?.name ?? ''

/** "2. Red racer" → "Red racer". */
const entryName = (entry: unknown): string => String(entry).replace(/^\s*\d+\.\s*/, '')

/**
 * The Car: the first placed copy of the kit's player brick (the Car, a remixed "My Car"), as the camera follows. In a
 * room (`me`, our player number), our own player's Car.
 */
export function raceCarOf(world: World, design: LevelDesign, me = 0): Target | undefined {
  if (me && world.players?.length) return world.targets.find((t) => t.player === me && !t.isClone)
  const players = new Set(design.bricks.filter((b) => isPlayerBrick(design, b.id)).map((b) => b.id))
  return world.targets.find((t) => !t.isStage && !t.isClone && players.has(t.brickId))
}

/** The ticks each lap took, from "go" (the lap ticks are when each lap ended). */
function lapTimes(lapTicks: readonly number[], start: number): number[] {
  return lapTicks.map((t, i) => t - (i === 0 ? start : lapTicks[i - 1]!))
}

/**
 * `startTick` is the tick the race said "go" (RaceHud hears the broadcast), so the clock is the game's own ticks: it
 * never drifts, and every player of a room sees the same times. `me`: our player number in a room (0 outside one).
 */
export function readRaceHud(world: World, design: LevelDesign, startTick: number | null = null, me = 0): RaceHudState {
  const room = me > 0 && !!world.players?.length
  const car = raceCarOf(world, design, me)
  const starter = world.targets.find((t) => isStarter(world, t))
  const said = starter?.bubble?.text.trim() ?? ''
  const countdown = said && said.length <= COUNTDOWN_MAX && !/^results/i.test(said) ? said : null

  const lapsSetting = Number(world.stage.variables[RACE_GLOBALS.lapsToWin])
  const laps = Number.isFinite(lapsSetting) && lapsSetting >= 1 ? Math.floor(lapsSetting) : DEFAULT_LAPS
  const done = car ? raceLapState(car)?.lap ?? 0 : 0
  const finished = done >= laps
  const racers = world.targets.filter(isRacer)

  const loop = raceLoopOf(world)
  const noLaps = loop.ok ? null : RACE_LOOP_REASON_TEXT[loop.reason]

  /** A racer's name: its costume's, or for another player's Car in a room, that player's name. */
  const nameOf = (t: Target): string =>
    (room && t !== car && t.player !== undefined && world.players!.find((p) => p.num === t.player)?.name) || racerName(world, t)
  /** The tick a racer crossed the line for the last time, if it has. */
  const lineTick = (t: Target): number | undefined => raceLapState(t)?.lapTicks[laps - 1]

  // The results list holds names, and in a room every player's Car is "You": there, finishers go by when they crossed.
  const finishedRacers = room
    ? [...racers, ...(car && !racers.includes(car) ? [car] : [])].filter((t) => lineTick(t) !== undefined).sort((a, b) => lineTick(a)! - lineTick(b)!)
    : []
  const results = room ? finishedRacers.map(nameOf) : (world.stage.lists[RACE_GLOBALS.results] ?? []).map(entryName)
  const carName = car ? nameOf(car) : ''
  // A Car that just crossed the line is written on the results a tick later (its lap script runs next tick), or never
  // if a kid's Car has no results script: it goes after whoever is already on the list.
  const finishers = finished && !results.includes(carName) ? [...results, carName] : results
  const carLine = room && car ? finishedRacers.indexOf(car) : -1
  // After the line `my place` can be passed by a later finisher (R1-engine.md), so a finished Car's place is its line.
  const place = car ? (finished ? (carLine >= 0 ? carLine : finishers.indexOf(carName)) + 1 : racePlace(world, car)) : 0

  const started = startTick !== null && startTick <= world.tick
  /** A racer's time over the line: from "go" to the end of its last lap. */
  const finishTime = (t: Target | undefined): number | null => {
    const ticks = t ? raceLapState(t)?.lapTicks : undefined
    return started && ticks && ticks.length >= laps ? ticks[laps - 1]! - startTick! : null
  }
  const byName = (name: string) => racers.find((t) => nameOf(t) === name) ?? (car && nameOf(car) === name ? car : undefined)

  let standings: RaceStanding[] = []
  if (car && finished) {
    standings = room
      ? finishedRacers.map((t, i) => ({ place: i + 1, name: nameOf(t), done: true, you: t === car, time: finishTime(t) }))
      : finishers.map((name, i) => ({ place: i + 1, name, done: true, you: name === carName, time: finishTime(byName(name)) }))
    const over = room ? new Set(finishedRacers) : null
    const still = racers
      .filter((t) => (over ? !over.has(t) : !finishers.includes(racerName(world, t))))
      .sort((a, b) => racePlace(world, a) - racePlace(world, b))
    for (const t of still) standings.push({ place: standings.length + 1, name: nameOf(t), done: false, you: false })
  }

  // The clock stops when the Car crosses the line for the last time.
  const time = !started ? null : finished ? finishTime(car) ?? world.tick - startTick! : world.tick - startTick!
  const carLaps = started && car ? lapTimes(raceLapState(car)?.lapTicks ?? [], startTick!) : []
  const bestLap = carLaps.length ? Math.min(...carLaps) : null

  let live: RaceStanding[] = []
  if (started && !noLaps && racers.length > 1) {
    live = racers
      .map((t) => ({ t, place: racePlace(world, t) }))
      .sort((a, b) => a.place - b.place)
      .map(({ t }, i) => {
        const lapsDone = raceLapState(t)?.lap ?? 0
        return { place: i + 1, name: nameOf(t), done: lapsDone >= laps, you: t === car, lap: Math.min(lapsDone + 1, laps) }
      })
  }

  return { countdown, lap: Math.min(done + 1, laps), laps, place, racers: racers.length, finished, noLaps, standings, time, bestLap, live }
}

/**
 * Room rules (docs/qa/hackable-rooms M2): every other player whose Car has crossed the line for the last time, with
 * their time from "go" (null when this screen did not see "go"). Read from the shared race, so every screen agrees.
 */
export function roomFinishers(world: World, startTick: number | null, me: number): { num: number; name: string; ticks: number | null }[] {
  if (!me || !world.players?.length) return []
  const lapsSetting = Number(world.stage.variables[RACE_GLOBALS.lapsToWin])
  const laps = Number.isFinite(lapsSetting) && lapsSetting >= 1 ? Math.floor(lapsSetting) : DEFAULT_LAPS
  const out: { num: number; name: string; ticks: number | null }[] = []
  for (const p of world.players) {
    if (p.num === me) continue
    const car = world.targets.find((t) => t.player === p.num && !t.isClone)
    const line = car ? raceLapState(car)?.lapTicks[laps - 1] : undefined
    if (line === undefined) continue
    out.push({ num: p.num, name: p.name, ticks: startTick !== null && startTick <= line ? line - startTick : null })
  }
  return out
}
