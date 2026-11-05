/**
 * Parity B's bricks in a room (wave 2 integration, fix c): with M2's per-player rules the critters hurt only the Hero
 * they touch, every player gets their own Checkpoint, the moving platforms carry everyone the same in every game, and
 * the new bricks work as M2 live edits (placed, tuned and recoded while the room plays).
 */
import { describe, expect, it } from 'vitest'
import { createRuntime, type Runtime } from '../core'
import type { BrickDef, LevelDesign, Target } from '../core/contracts'
import { playerHero } from '../core/players'
import { bricksOf } from '../core/project'
import { brickToWire } from '../core/save'
import { worldFingerprint, worldFromJson, worldToJson } from '../core/snapshot'
import { CHECKPOINT_BRICK_ID, CHECKPOINT_MESSAGE } from '../studio/builtins/checkpoint'
import { FLYER_BRICK_ID, SHELLBUG_BRICK_ID, SPIKY_BRICK_ID } from '../studio/builtins/critters'
import { LIFT_BRICK_ID, PLATFORM_BRICK_ID } from '../studio/builtins/platforms'
import { HERO_HURT } from '../studio/builder/playRules'
import { createStarterProject } from '../studio/starter'
import { StudioStore } from '../studio/store'
import { roomGame } from '../studio/testRoom'
import { applyEdit, applyEditLive, diffDesigns, kindOfEdit, type EditOp } from './edits'

const run = (rt: Runtime, ticks: number) => { for (let i = 0; i < ticks; i++) rt.step() }
const STAND_Y = 24

/** The starter level plus Parity B's bricks, placed out of everyone's way (x 600 and on, high up for the critters). */
function parityLevel(): LevelDesign {
  const store = new StudioStore(createStarterProject())
  const place = (id: string, x: number, y: number) => store.addCopy(store.addCatalogBrick(id) ?? id, x, y)
  place(CHECKPOINT_BRICK_ID, 220, STAND_Y + 8)
  place(SPIKY_BRICK_ID, 700, 300)
  place(FLYER_BRICK_ID, 760, 300)
  place(SHELLBUG_BRICK_ID, 820, 300)
  place(PLATFORM_BRICK_ID, 600, 200)
  place(LIFT_BRICK_ID, 900, 200)
  return store.getState().project.design
}

function threePlayers(design = parityLevel()) {
  const rt = roomGame(design, ['Maya', 'Sam', 'Ben'])
  run(rt, 20)
  const heroes = [1, 2, 3].map((n) => playerHero(rt.world, n)!)
  const of = (brickId: string) => rt.world.targets.find((t) => t.brickId === brickId && !t.isClone)!
  const heard: Array<{ m: string; about?: readonly number[] }> = []
  rt.onBroadcast((m, _from, about) => heard.push({ m: m.trim().toLowerCase(), about }))
  return { rt, heroes, of, heard }
}

const startX = (hero: Target) => Number(hero.variables.start_x)
const hurtTime = (hero: Target) => Number(hero.variables.hurt_time)

describe('Parity B bricks in a room: each player is on their own', () => {
  it('a Checkpoint gives each player their own: the second one gets it too, with the flag already up', () => {
    const { rt, heroes, of, heard } = threePlayers()
    const flag = of(CHECKPOINT_BRICK_ID)
    const mayaStart = startX(heroes[0]!)
    // Sam walks up to the flag: his start moves there, and only his.
    heroes[1]!.x = flag.x - 6
    run(rt, 8)
    expect(Math.abs(startX(heroes[1]!) - flag.x)).toBeLessThan(16)
    expect(startX(heroes[0]!)).toBe(mayaStart)
    expect(flag.costumeIndex).toBe(1)
    expect(heard.filter((h) => h.m === CHECKPOINT_MESSAGE).every((h) => JSON.stringify(h.about) === '[2]')).toBe(true)
    // Ben comes by later: the flag is up already, and he still gets his checkpoint.
    heroes[1]!.x = 320
    run(rt, 4)
    heroes[2]!.x = flag.x + 6
    run(rt, 8)
    expect(Math.abs(startX(heroes[2]!) - flag.x)).toBeLessThan(16)
    expect(startX(heroes[0]!)).toBe(mayaStart)
    // A Hero whose start is already here is not told again (one word per arrival, as solo).
    const words = heard.filter((h) => h.m === CHECKPOINT_MESSAGE).length
    run(rt, 10)
    expect(heard.filter((h) => h.m === CHECKPOINT_MESSAGE).length).toBe(words)
  })

  it('Spiky, the Flyer and the Shellbug hurt only the Hero they touch', () => {
    for (const critter of [SPIKY_BRICK_ID, FLYER_BRICK_ID, SHELLBUG_BRICK_ID]) {
      const { rt, heroes, of, heard } = threePlayers()
      const it = of(critter)
      // Sam walks into it from the side, at its height.
      heroes[1]!.x = it.x - 8
      heroes[1]!.y = it.y
      run(rt, 2)
      const hurt = heard.find((h) => h.m === HERO_HURT)
      expect(hurt?.about, critter).toEqual([2])
      expect(hurtTime(heroes[1]!), critter).toBeGreaterThan(0)
      expect(hurtTime(heroes[0]!), critter).toBe(0)
      expect(hurtTime(heroes[2]!), critter).toBe(0)
    }
  })

  it('a moving platform carries two players the same way, and two games (one from a keyframe) agree', () => {
    const play = () => {
      const { rt, heroes, of } = threePlayers()
      const platform = of(PLATFORM_BRICK_ID)
      heroes[0]!.x = platform.x - 4
      heroes[0]!.y = platform.y + 16
      heroes[2]!.x = platform.x + 4
      heroes[2]!.y = platform.y + 16
      run(rt, 10)
      return { rt, heroes, platform }
    }
    const a = play()
    const gapBefore = a.heroes[2]!.x - a.heroes[0]!.x
    const from = { maya: a.heroes[0]!.x, ben: a.heroes[2]!.x, platform: a.platform.x }
    run(a.rt, 30)
    const moved = a.platform.x - from.platform
    expect(Math.abs(moved)).toBeGreaterThan(10)
    expect(a.heroes[0]!.x - from.maya).toBeCloseTo(moved, 5)
    expect(a.heroes[2]!.x - from.ben).toBeCloseTo(moved, 5)
    expect(a.heroes[2]!.x - a.heroes[0]!.x).toBeCloseTo(gapBefore, 5)
    const b = play()
    run(b.rt, 30)
    expect(worldFingerprint(b.rt.world)).toBe(worldFingerprint(a.rt.world))
    const design = a.rt.world.design!
    const c = createRuntime(design)
    c.restoreWorld(worldFromJson(worldToJson(a.rt.world), bricksOf(design), design))
    for (const rt of [a.rt, c]) run(rt, 90)
    expect(worldFingerprint(c.world)).toBe(worldFingerprint(a.rt.world))
  })
})

describe('Parity B bricks as live edits (M2 building together)', () => {
  /** Two games of the same room, given the same edit at the same tick. */
  function twoGames() {
    const design = parityLevel()
    return [roomGame(design, ['Maya', 'Sam']), roomGame(design, ['Maya', 'Sam'])].map((rt) => { run(rt, 20); return rt })
  }
  const live = (rts: Runtime[], ops: EditOp[]) => {
    for (const rt of rts) applyEditLive(rt, ops, applyEdit(rt.world.design!, ops))
  }
  const brickIn = (rt: Runtime, id: string) => rt.world.design!.bricks.find((b) => b.id === id)!

  it('placing a new Shellbug from the drawer is building, and it walks in every game', () => {
    const design = createStarterProject().design
    const store = new StudioStore({ design, workspaces: {} })
    const id = store.addCatalogBrick(SHELLBUG_BRICK_ID)!
    store.addCopy(id, 500, 200)
    const { ops, other } = diffDesigns(design, store.getState().project.design)
    expect(other).toBe(false)
    expect(kindOfEdit(design, ops)).toBe('build')
    const games = [roomGame(design, ['Maya', 'Sam']), roomGame(design, ['Maya', 'Sam'])]
    for (const rt of games) run(rt, 20)
    live(games, ops)
    for (const rt of games) run(rt, 60)
    const bug = games[0]!.world.targets.find((t) => t.brickId === SHELLBUG_BRICK_ID)!
    expect(bug).toBeTruthy()
    expect(bug.y).toBeLessThan(200) // it fell to the ground: its scripts run
    expect(worldFingerprint(games[1]!.world)).toBe(worldFingerprint(games[0]!.world))
  })

  it('turning the platform\'s speed slider is building and takes effect at once; changing its code is code and restarts it', () => {
    const games = twoGames()
    const old: BrickDef = brickIn(games[0]!, PLATFORM_BRICK_ID)
    const speedId = `${PLATFORM_BRICK_ID}_speed`
    const faster: BrickDef = { ...old, program: { ...old.program, variables: old.program.variables.map((v) => (v.id === speedId ? { ...v, value: 4 } : v)) } }
    const tune: EditOp[] = [{ op: 'brick', brick: brickToWire(faster) }]
    expect(kindOfEdit(games[0]!.world.design!, tune)).toBe('build')
    live(games, tune)
    const platform = games[0]!.world.targets.find((t) => t.brickId === PLATFORM_BRICK_ID && !t.isClone)!
    expect(platform.variables[speedId]).toBe(4)
    const x = platform.x
    run(games[0]!, 1)
    run(games[1]!, 1)
    expect(Math.abs(platform.x - x)).toBe(4)

    // Code: drop its turning script's check (it never turns): a code edit, which restarts only the platform.
    const text = JSON.stringify(faster.program)
    const recoded: BrickDef = { ...faster, program: JSON.parse(text.replace('"opcode":"control_if"', '"opcode":"control_if_never"').replace('control_if_never', 'control_if')) }
    recoded.program = { ...recoded.program, scripts: recoded.program.scripts.slice(0, 1) }
    const code: EditOp[] = [{ op: 'brick', brick: brickToWire(recoded) }]
    expect(kindOfEdit(games[0]!.world.design!, code)).toBe('code')
    const walker = games[0]!.world.targets.find((t) => t.brickId === 'brick_walker' && !t.isClone)!
    const walkerThreads = games[0]!.threads().filter((t) => t.target === walker).length
    expect(applyEdit(games[0]!.world.design!, code).restarted).toEqual([PLATFORM_BRICK_ID])
    live(games, code)
    expect(games[0]!.threads().filter((t) => t.target === walker).length).toBe(walkerThreads)
    for (const rt of games) run(rt, 40)
    expect(worldFingerprint(games[1]!.world)).toBe(worldFingerprint(games[0]!.world))
  })
})
