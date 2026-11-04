/**
 * Per-player room rules (docs/qa/hackable-rooms M2, owner decision 2026-11-04): in a room each player is on their own.
 * A Walker, Spikes or Lava hurt only the Hero they touch; the Goal finishes only the player who reached it; the round
 * ends when everyone has finished. Solo play is exactly as before.
 */
import { describe, expect, it } from 'vitest'
import { createRuntime, play, type Runtime } from '../core'
import type { LevelDesign, Target } from '../core/contracts'
import { playerHero, removePlayer } from '../core/players'
import { worldFingerprint, worldFromJson, worldToJson } from '../core/snapshot'
import { bricksOf } from '../core/project'
import { createStarterProject } from '../studio/starter'
import { createRaceStarterProject } from '../studio/race/raceProject'
import { roomGame } from '../studio/testRoom'
import { aboutMyHero, COURSE_CLEAR, HERO_HURT } from '../studio/builder/playRules'
import { raceLapState } from '../core/race'
import { roomFinishers } from '../studio/race/screens/raceHudState'

const run = (rt: Runtime, ticks: number) => { for (let i = 0; i < ticks; i++) rt.step() }

/** A Hero's own variable, by id (hero/heroBrick.ts STATE_VARIABLES: hurt_time, safe). */
const heroVar = (_rt: Runtime, hero: Target, id: string): number => Number(hero.variables[id])

const copyOf = (rt: Runtime, copyId: string) => rt.world.targets.find((t) => t.copyId === copyId && !t.isClone)!

/** The starter level with three players' Heroes, standing after a moment. */
function threePlayers(design: LevelDesign = createStarterProject().design) {
  const rt = roomGame(design, ['Maya', 'Sam', 'Ben'])
  run(rt, 20)
  const heroes = [1, 2, 3].map((n) => playerHero(rt.world, n)!)
  return { rt, heroes }
}

describe('room rules: each player is on their own', () => {
  it('a Walker hurts only the Hero it touches', () => {
    const { rt, heroes } = threePlayers()
    const walker = copyOf(rt, 'copy_walker_slow')
    const heard: Array<{ m: string; about?: readonly number[] }> = []
    rt.onBroadcast((m, _from, about) => heard.push({ m, about }))
    heroes[1]!.x = walker.x + 10
    run(rt, 3)
    expect(heroVar(rt, heroes[1]!, 'hurt_time')).toBeGreaterThan(0)
    expect(heroVar(rt, heroes[0]!, 'hurt_time')).toBe(0)
    expect(heroVar(rt, heroes[2]!, 'hurt_time')).toBe(0)
    expect(heard.find((h) => h.m === HERO_HURT)?.about).toEqual([2])
    // The screens agree: Sam's "Try again", nobody else's.
    const hurt = heard.find((h) => h.m === HERO_HURT)!
    expect([1, 2, 3].map((me) => aboutMyHero(rt.world, walker, me, hurt.about))).toEqual([false, true, false])
  })

  it('a Walker stomped from above by one Hero bounces only that Hero, judged by its own height', () => {
    const { rt, heroes } = threePlayers()
    const walker = copyOf(rt, 'copy_walker_slow')
    // Maya stands low by the Walker's other side, out of reach; Ben drops on it from above.
    heroes[2]!.x = walker.x
    heroes[2]!.y = walker.y + 12
    let stomped: readonly number[] | undefined
    rt.onBroadcast((m, _from, about) => { if (m === 'stomped') stomped = about })
    run(rt, 4)
    expect(stomped).toEqual([3])
    expect(walker.visible).toBe(false)
    expect(heroVar(rt, heroes[2]!, 'hurt_time')).toBe(0)
  })

  it('Spikes (a bump) hurt only the Hero that bumped them', () => {
    const design = createStarterProject().design
    const spawn = design.copies.find((c) => c.id === 'copy_hero')!
    design.copies.push({ id: 'copy_spikes_test', brickId: 'brick_spikes', x: 130, y: 24 })
    const { rt, heroes } = threePlayers(design)
    heroes[1]!.x = 100
    heroes[1]!.y = spawn.y
    rt.pressKey('right arrow', 2)
    let about: readonly number[] | undefined
    rt.onBroadcast((m, _from, a) => { if (m === HERO_HURT) about ??= a })
    run(rt, 40)
    expect(about).toEqual([2])
    expect(heroVar(rt, heroes[1]!, 'hurt_time') + heroVar(rt, heroes[1]!, 'safe')).toBeGreaterThan(0)
    expect(heroVar(rt, heroes[0]!, 'hurt_time')).toBe(0)
    expect(heroVar(rt, heroes[2]!, 'hurt_time')).toBe(0)
  })

  it("a Spring launches only the Hero on it", () => {
    const { rt, heroes } = threePlayers()
    const spring = copyOf(rt, 'copy_spring')
    heroes[0]!.x = spring.x
    heroes[0]!.y = spring.y + 10
    const before = heroes.map((h) => h.y)
    run(rt, 6)
    expect(heroes[0]!.y).toBeGreaterThan(before[0]! + 10)
    expect(heroes[1]!.y).toBeCloseTo(before[1]!, 5)
    expect(heroes[2]!.y).toBeCloseTo(before[2]!, 5)
  })

  it('the Goal finishes only the player who reached it; the round ends when everyone has', () => {
    const { rt, heroes } = threePlayers()
    const goal = copyOf(rt, 'copy_goal')
    const cleared: Array<readonly number[] | undefined> = []
    rt.onBroadcast((m, _from, about) => { if (m === COURSE_CLEAR) cleared.push(about) })
    heroes[1]!.x = goal.x
    heroes[1]!.y = goal.y
    run(rt, 3)
    const sam = rt.world.players!.find((p) => p.num === 2)!
    expect(sam.finished).toBeGreaterThan(0)
    expect(cleared).toEqual([[2]])
    // The game goes on for the others: Maya still walks, Sam's Hero sits out (its scripts stopped, keys ignored).
    expect(rt.world.everyTick).toBe(true)
    expect(rt.threads().some((t) => t.target === heroes[1])).toBe(false)
    const mayaX = heroes[0]!.x
    const samAt = { x: heroes[1]!.x, y: heroes[1]!.y }
    rt.pressKey('right arrow', 1)
    rt.pressKey('left arrow', 2)
    run(rt, 20)
    expect(heroes[0]!.x).toBeGreaterThan(mayaX + 10)
    expect({ x: heroes[1]!.x, y: heroes[1]!.y }).toEqual(samAt)
    // Nobody hears the Goal again for Sam: it no longer touches his Hero.
    expect(cleared).toHaveLength(1)

    heroes[0]!.x = goal.x
    heroes[0]!.y = goal.y
    run(rt, 3)
    expect(rt.world.players!.find((p) => p.num === 1)!.finished).toBeGreaterThan(sam.finished!)
    expect(rt.world.everyTick).toBe(true)

    heroes[2]!.x = goal.x
    heroes[2]!.y = goal.y
    run(rt, 3)
    expect(rt.world.players!.every((p) => p.finished !== undefined)).toBe(true)
    // Everyone has finished: the round is over, as a solo game's is.
    expect(rt.world.everyTick).toBe(false)
    expect(rt.threads()).toHaveLength(0)
  })

  it('when the last player still going leaves, the round ends', () => {
    const { rt, heroes } = threePlayers()
    const goal = copyOf(rt, 'copy_goal')
    for (const h of [heroes[0]!, heroes[1]!]) {
      h.x = goal.x
      h.y = goal.y
      run(rt, 3)
    }
    expect(rt.world.everyTick).toBe(true)
    removePlayer(rt, 3)
    expect(rt.world.everyTick).toBe(false)
  })

  it('solo play is unchanged: the Goal stops everything', () => {
    const design = createStarterProject().design
    const hero = design.copies.find((c) => c.id === 'copy_hero')!
    const goal = design.copies.find((c) => c.id === 'copy_goal')!
    hero.x = goal.x
    hero.y = goal.y
    const rt = play(design)
    const heard: Array<{ m: string; about?: readonly number[] }> = []
    rt.onBroadcast((m, _from, about) => heard.push({ m, about }))
    run(rt, 3)
    expect(heard.find((h) => h.m === COURSE_CLEAR)).toEqual({ m: COURSE_CLEAR, about: undefined })
    expect(rt.world.everyTick).toBe(false)
    expect(rt.world.players).toBeUndefined()
    expect(rt.world.threads?.some((t) => t.about)).toBe(false)
  })

  it('two games given the same events agree, through a save to JSON, after a hurt and a finish', () => {
    const play2 = () => {
      const { rt, heroes } = threePlayers()
      const walker = copyOf(rt, 'copy_walker_slow')
      const goal = copyOf(rt, 'copy_goal')
      heroes[1]!.x = walker.x + 10
      heroes[0]!.x = goal.x
      heroes[0]!.y = goal.y
      run(rt, 2)
      return rt
    }
    const a = play2()
    const b = play2()
    expect(worldFingerprint(a.world)).toBe(worldFingerprint(b.world))
    // A script about a player keeps it through a keyframe.
    expect(a.world.threads!.some((t) => t.about)).toBe(true)
    const design = a.world.design!
    const c = createRuntime(design)
    c.restoreWorld(worldFromJson(worldToJson(a.world), bricksOf(design), design))
    for (const rt of [a, c]) {
      rt.pressKey('right arrow', 3)
      run(rt, 60)
    }
    expect(worldFingerprint(c.world)).toBe(worldFingerprint(a.world))
  })
})

describe('Racing in a room: each Car finishes on its own', () => {
  it('a Car finishing does not stop the others, and its time is its own', () => {
    const design = createRaceStarterProject().design
    const lapsVar = design.stage.program.variables.find((v) => v.name === 'laps to win')
    const rt = roomGame(design, ['Maya', 'Sam'])
    if (lapsVar) rt.world.stage.variables[lapsVar.id] = 1
    run(rt, 5)
    const cars = [1, 2].map((n) => playerHero(rt.world, n)!)
    // Fake Sam's last lap the way the laps code records it, then let his lap hat run.
    const lap = (cars[1]!.lap ??= { lap: 0, gates: 0, d: 0, onFinish: false, lapTicks: [] })
    lap.lap = 1
    lap.lapTicks.push(rt.world.tick)
    rt.startHats('race_whenlap', { target: cars[1]! })
    let finishedAbout: readonly number[] | undefined
    rt.onBroadcast((m, _from, about) => { if (m === 'finished') finishedAbout = about })
    run(rt, 3)
    expect(finishedAbout).toEqual([2])
    expect(raceLapState(cars[0]!)?.lap ?? 0).toBe(0)
    // Maya's Car still runs its scripts; nothing stopped.
    expect(rt.threads().some((t) => t.target === cars[0])).toBe(true)
    expect(rt.world.everyTick).toBe(true)
    // Maya's screen: "Sam finished" with his time from "go"; Sam's own screen lists nobody else.
    const go = rt.world.tick - 10
    expect(roomFinishers(rt.world, go, 1)).toEqual([{ num: 2, name: 'Sam', ticks: lap.lapTicks[0]! - go }])
    expect(roomFinishers(rt.world, go, 2)).toEqual([])
    expect(roomFinishers(rt.world, go, 0)).toEqual([])
  })
})
