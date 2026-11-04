/**
 * Pits (parity bucket A, 2026-11-03): a Platformer level has no floor, so falling off the bottom hurts the Hero, like the
 * classic Platformer. Levels whose Hero doesn't know about pits keep their solid floor, and Racing keeps every wall.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRuntime, play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { setEditorContext } from '../../core/editor/context'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { registerToolboxPlugins } from '../../core/editor/toolbox'
import type { LevelDesign } from '../../core/contracts'
import { buildEditorContext } from '../code/context'
import { EARLIER_HERO_FINGERPRINTS, upgradeUntouchedHero, workspaceFingerprint } from '../remix'
import { createRaceStarterProject } from '../race/raceProject'
import { createStarterProject, STARTER_GAP_COLS } from '../starter'
import { StudioStore } from '../store'
import beforePits from './__fixtures__/hero-before-pits.json'
import { HERO_START, PIT_Y } from './heroBrick'

beforeAll(() => {
  registerToolboxPlugins()
})

const heroOf = (rt: ReturnType<typeof play>) => rt.world.targets.find((t) => t.brickId === 'brick_hero' && !t.isClone)!
/** The middle of the starter's gap, where there is no ground. */
const GAP_X = ((STARTER_GAP_COLS[0]! + STARTER_GAP_COLS[STARTER_GAP_COLS.length - 1]! + 1) / 2) * 16

/** Play, let the Hero find its start, drop it over the gap, and follow it for `ticks`. */
function dropInGap(design: LevelDesign, ticks: number): Array<{ x: number; y: number }> {
  const rt = play(design)
  for (let i = 0; i < 20; i++) rt.step()
  heroOf(rt).x = GAP_X
  heroOf(rt).y = 40
  const path: Array<{ x: number; y: number }> = []
  for (let i = 0; i < ticks; i++) {
    rt.step()
    path.push({ x: heroOf(rt).x, y: heroOf(rt).y })
  }
  return path
}

describe('pits', () => {
  it('the starter level is open at the bottom; a Racing track keeps its floor', () => {
    expect(createStarterProject().design.pits).toBe(true)
    expect(createRuntime(createStarterProject().design).world.physics?.walls.bottom).toBe(false)
    expect(createRuntime(createRaceStarterProject().design).world.physics).toBeUndefined()
  })

  it('falling into the gap drops the Hero out of the level, and it comes back where it started', () => {
    const path = dropInGap(createStarterProject().design, 120)
    // The Hero notices on the tick it drops below PIT_Y, so the lowest it is seen is just under the level's bottom.
    const fell = path.findIndex((p) => p.y < 0)
    expect(fell).toBeGreaterThan(0)
    expect(path[fell - 1]!.y).toBeGreaterThan(PIT_Y - 1)
    expect(path.slice(fell)).toContainEqual({ x: HERO_START.x, y: HERO_START.y })
    expect(path.at(-1)).toEqual({ x: HERO_START.x, y: HERO_START.y })
  })

  it('a level without pits still has a floor: the Hero stands in the gap', () => {
    const { pits: _pits, ...design } = createStarterProject().design
    const path = dropInGap(design, 40)
    expect(path.at(-1)).toEqual({ x: GAP_X, y: 8 })
  })

  it('pits must be true or false', () => {
    const design = { ...createStarterProject().design, pits: 'yes' as unknown as boolean }
    expect(validateDesign(design).map((p) => p.path)).toContain('pits')
  })
})

/** The code editor's own load and save (CodeEditor.tsx). */
function throughBlockly(workspace: unknown): unknown {
  const store = new StudioStore(createStarterProject())
  store.selectBrick('brick_hero')
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

/** A project saved just before pits: that Hero, and no `pits` on the level. */
function savedBeforePits(): ReturnType<typeof createStarterProject> {
  const project = createStarterProject()
  delete project.design.pits
  project.workspaces.brick_hero = structuredClone(beforePits.workspace)
  const hero = project.design.bricks.find((b) => b.id === 'brick_hero')!
  hero.program = structuredClone(beforePits.program) as unknown as typeof hero.program
  return project
}

describe('saves from before pits', () => {
  it('the Hero just before pits has a known fingerprint, through the editor too, and the current Hero has another', () => {
    expect(workspaceFingerprint(beforePits.workspace)).toBe('88bce6fb')
    expect(workspaceFingerprint(throughBlockly(beforePits.workspace))).toBe('88bce6fb')
    expect(EARLIER_HERO_FINGERPRINTS).toContain('88bce6fb')
    const current = workspaceFingerprint(createStarterProject().workspaces.brick_hero)
    expect(EARLIER_HERO_FINGERPRINTS).not.toContain(current)
  })

  it('an untouched Hero upgrades and its level opens at the bottom; the kid\'s slider values stay', () => {
    const old = savedBeforePits()
    old.design.bricks.find((b) => b.id === 'brick_hero')!.program.variables.find((v) => v.id === 'walk_top')!.value = 5
    const up = upgradeUntouchedHero(old)
    expect(up.workspaces.brick_hero).toEqual(createStarterProject().workspaces.brick_hero)
    expect(up.design.pits).toBe(true)
    expect(up.design.bricks.find((b) => b.id === 'brick_hero')!.program.variables.find((v) => v.id === 'walk_top')!.value).toBe(5)
    expect(validateDesign(up.design)).toEqual([])
    expect(dropInGap(up.design, 120).at(-1)).toEqual({ x: HERO_START.x, y: HERO_START.y })
  })

  it('a Hero the kid changed keeps its blocks and its level keeps the floor', () => {
    const old = savedBeforePits()
    const ws = old.workspaces.brick_hero as { blocks: { blocks: Array<Record<string, unknown>> } }
    ws.blocks.blocks = ws.blocks.blocks.slice(1)
    expect(upgradeUntouchedHero(old)).toBe(old)
    expect(old.design.pits).toBeUndefined()
  })

  it('a level that already says either way is left alone', () => {
    const closed = { ...createStarterProject(), design: { ...createStarterProject().design, pits: false } }
    expect(upgradeUntouchedHero(closed)).toBe(closed)
  })
})
