/**
 * Getting hurt sends the Hero back to where the kid placed it (the spot where it first lands after the level starts),
 * not to a fixed point. And saves holding an earlier built-in Hero still upgrade to this one.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { beforeAll, describe, expect, it } from 'vitest'
import type { LevelDesign } from '../../core/contracts'
import { setEditorContext } from '../../core/editor/context'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { registerToolboxPlugins } from '../../core/editor/toolbox'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { buildEditorContext } from '../code/context'
import { EARLIER_HERO_FINGERPRINTS, upgradeUntouchedHero, workspaceFingerprint } from '../remix'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import feelScriptsHero from '../__fixtures__/hero-before-feel-scripts.json'
import startRespawnHero from './__fixtures__/hero-before-start-respawn.json'
import { HERO_START } from './heroBrick'
import { createHeroTestDesign, HERO_STAND_Y } from './heroLevel'

beforeAll(() => {
  registerToolboxPlugins()
})

const heroOf = (rt: ReturnType<typeof play>) => rt.world.targets.find((t) => t.brickId === 'brick_hero' && !t.isClone)!

function placedAt(design: LevelDesign, x: number, y: number): LevelDesign {
  return { ...design, copies: design.copies.map((c) => (c.brickId === 'brick_hero' ? { ...c, x, y } : c)) }
}

/** Play, let the Hero settle, put it somewhere else, hurt it, and return where it ends up one tick later. */
function hurtAfter(design: LevelDesign, settleTicks: number): { settled: { x: number; y: number }; after: { x: number; y: number } } {
  const rt = play(design)
  for (let i = 0; i < settleTicks; i++) rt.step()
  const hero = heroOf(rt)
  const settled = { x: hero.x, y: hero.y }
  hero.x += 200
  hero.y += 60
  rt.broadcast('hero hurt')
  rt.step()
  return { settled, after: { x: heroOf(rt).x, y: heroOf(rt).y } }
}

describe('getting hurt', () => {
  it('sends a Hero the kid moved back to where they put it, standing', () => {
    const { settled, after } = hurtAfter(placedAt(createHeroTestDesign(), 400, HERO_STAND_Y), 20)
    expect(settled).toEqual({ x: 400, y: HERO_STAND_Y })
    expect(after).toEqual({ x: 400, y: HERO_STAND_Y })
  })

  it('a Hero placed in the air comes back where it first landed, not in the air', () => {
    const { settled, after } = hurtAfter(placedAt(createHeroTestDesign(), 300, 120), 40)
    expect(settled).toEqual({ x: 300, y: HERO_STAND_Y })
    expect(after).toEqual({ x: 300, y: HERO_STAND_Y })
  })

  it('before the Hero has landed at all, it goes back to where it was placed', () => {
    const { after } = hurtAfter(placedAt(createHeroTestDesign(), 300, 200), 1)
    expect(after).toEqual({ x: 300, y: 200 })
  })

  it('the starter Hero, not moved, still comes back to the same spot as before', () => {
    const { after } = hurtAfter(createStarterProject().design, 20)
    expect(after).toEqual({ x: HERO_START.x, y: HERO_START.y })
  })

  it('Play again starts over: a new start is found each time', () => {
    const store = new StudioStore(createStarterProject())
    const copy = store.getState().project.design.copies.find((c) => c.brickId === 'brick_hero')!
    store.updateCopy(copy.id, { x: copy.x + 20 })
    const { after } = hurtAfter(store.getState().project.design, 20)
    expect(after.x).toBe(HERO_START.x + 20)
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

function savedWith(fixture: { program: unknown; workspace: unknown }) {
  const project = createStarterProject()
  project.workspaces.brick_hero = structuredClone(fixture.workspace)
  const hero = project.design.bricks.find((b) => b.id === 'brick_hero')!
  hero.program = structuredClone(fixture.program) as typeof hero.program
  return project
}

describe('saves with an earlier Hero', () => {
  it('an untouched earlier Hero still upgrades, and the upgraded Hero comes back to where it was placed', () => {
    const old = savedWith(feelScriptsHero as never)
    const up = upgradeUntouchedHero(old)
    expect(up).not.toBe(old)
    expect(up.workspaces.brick_hero).toEqual(createStarterProject().workspaces.brick_hero)
    expect(validateDesign(up.design)).toEqual([])
    const { after } = hurtAfter(placedAt(up.design, HERO_START.x + 30, HERO_START.y), 20)
    expect(after).toEqual({ x: HERO_START.x + 30, y: HERO_START.y })
  })

  it('a Hero saved just before this change is still a valid project that plays', () => {
    const old = savedWith(startRespawnHero as never)
    const loaded = upgradeUntouchedHero(old)
    expect(validateDesign(loaded.design)).toEqual([])
    const rt = play(loaded.design)
    for (let i = 0; i < 10; i++) rt.step()
    expect(heroOf(rt)).toBeTruthy()
  })

  // The Hero just before this change, as generated and after a trip through the editor (both the same). remix.ts
  // recognises earlier Heroes by fingerprint (EARLIER_HERO_FINGERPRINTS); listing this one there upgrades it as well.
  it('the Hero just before this change has a known fingerprint, and the current Hero has another', () => {
    expect(workspaceFingerprint(startRespawnHero.workspace)).toBe(PREVIOUS_HERO_FINGERPRINT)
    expect(workspaceFingerprint(throughBlockly(startRespawnHero.workspace))).toBe(PREVIOUS_HERO_FINGERPRINT)
    const current = workspaceFingerprint(createStarterProject().workspaces.brick_hero)
    expect(current).not.toBe(PREVIOUS_HERO_FINGERPRINT)
    expect(EARLIER_HERO_FINGERPRINTS).not.toContain(current)
  })
})

const PREVIOUS_HERO_FINGERPRINT = 'f9ce2b65'
