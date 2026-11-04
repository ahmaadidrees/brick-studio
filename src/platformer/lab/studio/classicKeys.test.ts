/**
 * The classic keys (parity bucket A, 2026-11-03): the Hero walks with the arrows or A and D, jumps with Space, X or K and
 * runs with Z, J or Shift, like the classic Platformer; the Car drives with the arrows or W A S D. An untouched Car saved
 * before upgrades when the project opens; a Car a kid changed keeps its blocks.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LevelDesign } from '../core/contracts'
import { setEditorContext } from '../core/editor/context'
import { registerEditorBlocks } from '../core/editor/definitions'
import { registerToolboxPlugins } from '../core/editor/toolbox'
import { play } from '../core/index'
import { validateDesign } from '../core/project'
import { buildEditorContext } from './code/context'
import { createHeroTestDesign } from './hero/heroLevel'
import { HERO_BRICK_ID, createHeroBrick } from './hero/heroBrick'
import { addPlayer } from '../core/players'
import { EARLIER_BUILT_IN_FINGERPRINTS, upgradeUntouchedBricks, workspaceFingerprint } from './remix'
import { CAR_BRICK_ID } from './race/carBrick'
import { createRaceStarterProject } from './race/raceProject'
import carBeforeWasd from './race/__fixtures__/car-before-wasd.json'
import { StudioStore } from './store'

beforeAll(() => registerToolboxPlugins())

/** Where the first copy of `brickId` is after each tick while `keys` are held from `from` on. */
function pathWith(design: LevelDesign, brickId: string, keys: string[], ticks: number, from = 0): string[] {
  const rt = play(design)
  const me = () => rt.world.targets.find((t) => t.brickId === brickId && !t.isClone)!
  const out: string[] = []
  for (let i = 0; i < ticks; i++) {
    if (i === from) for (const k of keys) rt.pressKey(k)
    rt.step()
    out.push(`${me().x.toFixed(3)},${me().y.toFixed(3)},${me().direction}`)
  }
  return out
}

describe('the Hero reads the classic keys', () => {
  const hero = (keys: string[]) => pathWith(createHeroTestDesign(), HERO_BRICK_ID, keys, 60, 10)

  it('A and D walk like the arrows', () => {
    expect(hero(['d'])).toEqual(hero(['right arrow']))
    expect(hero(['a'])).toEqual(hero(['left arrow']))
    expect(hero(['d']).at(-1)).not.toEqual(hero([]).at(-1))
  })

  it('X and K jump like Space; Z and J run', () => {
    expect(hero(['x'])).toEqual(hero(['space']))
    expect(hero(['k'])).toEqual(hero(['space']))
    expect(hero(['right arrow', 'j'])).toEqual(hero(['right arrow', 'z']))
    const ran = Number(hero(['right arrow', 'z']).at(-1)!.split(',')[0])
    const walked = Number(hero(['right arrow']).at(-1)!.split(',')[0])
    expect(ran).toBeGreaterThan(walked + 20)
  })

  it('Shift runs like Z, as in the classic Platformer (integration, 2026-11-03)', () => {
    expect(hero(['right arrow', 'shift'])).toEqual(hero(['right arrow', 'z']))
    // A room player's Shift reaches only their own Hero.
    const design = createHeroTestDesign()
    const rt = play(design)
    const spawn = design.copies.find((c) => c.brickId === HERO_BRICK_ID)!
    const one = addPlayer(rt, { num: 1, name: 'Maya' }, spawn)!
    const two = addPlayer(rt, { num: 2, name: 'Sam' }, spawn)!
    for (const n of [1, 2]) rt.pressKey('right arrow', n)
    rt.pressKey('shift', 1)
    for (let i = 0; i < 50; i++) rt.step()
    expect(one.x - spawn.x).toBeGreaterThan(two.x - (spawn.x + 20) + 20)
  })

  it("the Hero's shift block keeps its key through the code editor", () => {
    const { workspace } = createHeroBrick()
    expect(JSON.stringify(workspace)).toContain('"KEY_OPTION":"shift"')
    // Blockly keeps a menu value only if the menu has it (core/editor/context.ts DEFAULT_KEYS).
    const count = (ws: unknown) => JSON.stringify(ws).split('"KEY_OPTION":"shift"').length - 1
    expect(count(throughBlockly(workspace))).toBe(count(workspace))
  })
})

describe('the Car reads W A S D too', () => {
  // The countdown says go after about three seconds; drive for two more.
  const car = (keys: string[], design = createRaceStarterProject().design) => pathWith(design, CAR_BRICK_ID, keys, 200, 20)

  it('W A S D drive like the arrows', () => {
    expect(car(['w'])).toEqual(car(['up arrow']))
    expect(car(['w', 'd'])).toEqual(car(['up arrow', 'right arrow']))
    expect(car(['w', 'a'])).toEqual(car(['up arrow', 'left arrow']))
    expect(car(['s'])).toEqual(car(['down arrow']))
    expect(car(['w']).at(-1)).not.toEqual(car([]).at(-1))
  })
})

/** The code editor's own load and save (CodeEditor.tsx). */
function throughBlockly(workspace: unknown): unknown {
  const store = new StudioStore(createRaceStarterProject())
  store.selectBrick(CAR_BRICK_ID)
  const ctx = buildEditorContext(store)
  setEditorContext(ctx)
  registerEditorBlocks(ctx)
  const ws = new Blockly.Workspace()
  try {
    Blockly.serialization.workspaces.load(JSON.parse(JSON.stringify(workspace)), ws)
    return Blockly.serialization.workspaces.save(ws)
  } finally {
    ws.dispose()
  }
}

/** A race track saved with the R1 Car, its top speed tuned to 9. */
function savedWithR1Car() {
  const project = createRaceStarterProject()
  project.workspaces[CAR_BRICK_ID] = structuredClone(carBeforeWasd.workspace)
  const car = project.design.bricks.find((b) => b.id === CAR_BRICK_ID)!
  car.program = structuredClone(carBeforeWasd.program) as unknown as typeof car.program
  car.program.variables = car.program.variables.map((v) => (v.id === 'car_top' ? { ...v, value: 9 } : v))
  return project
}

describe('saved Cars from before W A S D', () => {
  it('the R1 Car is known by its fingerprint, through the editor too', () => {
    expect(workspaceFingerprint(carBeforeWasd.workspace)).toBe('f3157bf8')
    expect(workspaceFingerprint(throughBlockly(carBeforeWasd.workspace))).toBe('f3157bf8')
    expect(EARLIER_BUILT_IN_FINGERPRINTS[CAR_BRICK_ID]).toContain('f3157bf8')
  })

  it('an untouched Car upgrades: today\'s blocks, the kid\'s top speed, and it drives with W', () => {
    const old = savedWithR1Car()
    const up = upgradeUntouchedBricks(old)
    expect(up.workspaces[CAR_BRICK_ID]).toEqual(createRaceStarterProject().workspaces[CAR_BRICK_ID])
    const car = up.design.bricks.find((b) => b.id === CAR_BRICK_ID)!
    expect(car.program.variables.find((v) => v.id === 'car_top')!.value).toBe(9)
    expect(validateDesign(up.design)).toEqual([])
    const drive = (keys: string[]) => pathWith(up.design, CAR_BRICK_ID, keys, 160, 20)
    expect(drive(['w'])).toEqual(drive(['up arrow']))
    expect(upgradeUntouchedBricks(up)).toBe(up)
  })

  it('a Car the kid changed, renamed a variable of, or remixed is left alone', () => {
    const edited = savedWithR1Car()
    const ws = edited.workspaces[CAR_BRICK_ID] as { blocks: { blocks: unknown[] } }
    ws.blocks.blocks = ws.blocks.blocks.slice(1)
    expect(upgradeUntouchedBricks(edited)).toBe(edited)
    const renamed = savedWithR1Car()
    renamed.design.bricks.find((b) => b.id === CAR_BRICK_ID)!.program.variables.find((v) => v.id === 'car_top')!.name = 'zoom'
    expect(upgradeUntouchedBricks(renamed)).toBe(renamed)
    const mine = savedWithR1Car()
    mine.design.bricks.find((b) => b.id === CAR_BRICK_ID)!.remixOf = CAR_BRICK_ID
    expect(upgradeUntouchedBricks(mine)).toBe(mine)
  })
})
