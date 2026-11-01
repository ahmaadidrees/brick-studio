/**
 * The Hero's variables in plain words (2026-11-01): "p speed" is now "full run speed", and so on. Saved Heroes must open
 * and play exactly as before, their sliders must work, and no block may end up pointing at a variable that is not there.
 *
 * `hero-before-plain-names.json` is the starter Hero as main b0d43fe made it, just before the names changed: the same
 * blocks as today's Hero, with the old names.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { LevelDesign } from '../../core/contracts'
import { setEditorContext } from '../../core/editor/context'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { registerToolboxPlugins } from '../../core/editor/toolbox'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { buildEditorContext } from '../code/context'
import { projectFromText } from '../persist/hackableSave'
import { exportProjectJson } from '../persist/projectIo'
import { canResetBrick, upgradeUntouchedHero, workspaceFingerprint } from '../remix'
import { createStarterProject } from '../starter'
import { StudioStore, type StudioProject } from '../store'
import { KnobsCard } from '../workshop/KnobsCard'
import { knobList, knobWords } from '../workshop/knobs'
import feelScriptsHero from '../__fixtures__/hero-before-feel-scripts.json'
import startRespawnHero from './__fixtures__/hero-before-start-respawn.json'
import plainNamesHero from './__fixtures__/hero-before-plain-names.json'
import { HERO_BRICK_ID, HERO_KNOBS, HERO_OLD_VARIABLE_NAMES, heroVariables } from './heroBrick'

beforeAll(() => registerToolboxPlugins())
afterEach(cleanup)

type Fixture = { program: unknown; workspace: unknown }
type Ws = { variables: Array<{ id: string; name: string }>; blocks: { blocks: unknown[] } }

function savedWith(fixture: Fixture, tune: Record<string, number> = {}): StudioProject {
  const project = createStarterProject()
  project.workspaces[HERO_BRICK_ID] = structuredClone(fixture.workspace)
  const hero = project.design.bricks.find((b) => b.id === HERO_BRICK_ID)!
  hero.program = structuredClone(fixture.program) as typeof hero.program
  hero.program.variables = hero.program.variables.map((v) => (v.id in tune ? { ...v, value: tune[v.id] } : v))
  return project
}

const heroOf = (project: StudioProject) => project.design.bricks.find((b) => b.id === HERO_BRICK_ID)!
const names = (list: ReadonlyArray<{ id: string; name: string }>) => Object.fromEntries(list.map((v) => [v.id, v.name]))

/** Every variable id a block in this workspace points at. */
function variableRefs(workspace: unknown): Set<string> {
  const refs = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    for (const [key, v] of Object.entries(value)) {
      if (key === 'VARIABLE') refs.add(typeof v === 'string' ? v : String((v as { id?: string }).id))
      else walk(v)
    }
  }
  walk((workspace as Ws).blocks)
  return refs
}

/** Every block's variable is declared, in the brick and in its workspace. */
function expectNoMissingVariables(project: StudioProject): void {
  const declaredInBrick = new Set(heroOf(project).program.variables.map((v) => v.id))
  const declaredInWorkspace = new Set((project.workspaces[HERO_BRICK_ID] as Ws).variables.map((v) => v.id))
  for (const id of variableRefs(project.workspaces[HERO_BRICK_ID])) {
    expect(declaredInBrick.has(id), id).toBe(true)
    expect(declaredInWorkspace.has(id), id).toBe(true)
  }
}

/** Where the Hero is after each tick of a run that walks, runs, jumps and stops: the whole movement, not one number. */
function path(design: LevelDesign): string[] {
  const rt = play(design)
  const hero = () => rt.world.targets.find((t) => t.brickId === HERO_BRICK_ID && !t.isClone)!
  const script: Array<[number, string[]]> = [[20, []], [25, ['right arrow']], [40, ['right arrow', 'x']], [12, ['right arrow', 'x', 'space']], [30, ['left arrow']], [10, ['space']], [30, []]]
  const held = new Set<string>()
  const out: string[] = []
  for (const [ticks, keys] of script) {
    for (const k of held) if (!keys.includes(k)) rt.releaseKey(k)
    for (const k of keys) if (!held.has(k)) rt.pressKey(k)
    held.clear()
    keys.forEach((k) => held.add(k))
    for (let i = 0; i < ticks; i++) {
      rt.step()
      out.push(`${hero().x},${hero().y}`)
    }
  }
  return out
}

/** The code editor's own load and save (CodeEditor.tsx). */
function throughBlockly(workspace: unknown): unknown {
  const store = new StudioStore(createStarterProject())
  store.selectBrick(HERO_BRICK_ID)
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

describe('the plain names', () => {
  it('every Hero variable has its own name, and none uses an engine word', () => {
    const all = heroVariables().map((v) => v.name)
    expect(new Set(all.map((n) => n.toLowerCase())).size).toBe(all.length)
    for (const name of all) expect(name).not.toMatch(/\b(p speed|p jump|ticks?|coyote|skid|shed|slack|excess|push)\b/)
    expect(HERO_KNOBS.every((k) => k.hint.length > 8 && k.hint.length < 90)).toBe(true)
  })

  it('the saved Hero from just before has exactly the old names, and the same blocks as today\'s Hero', () => {
    const current = createStarterProject()
    const fresh = names(heroOf(current).program.variables)
    const old = names((plainNamesHero as unknown as { program: { variables: Array<{ id: string; name: string }> } }).program.variables)
    expect(Object.keys(old)).toEqual(Object.keys(fresh))
    for (const id of Object.keys(fresh)) expect(old[id], id).toBe(HERO_OLD_VARIABLE_NAMES[id] ?? fresh[id])
    expect(Object.keys(HERO_OLD_VARIABLE_NAMES).every((id) => HERO_OLD_VARIABLE_NAMES[id] !== fresh[id])).toBe(true)
    const print = workspaceFingerprint(current.workspaces[HERO_BRICK_ID])
    expect(workspaceFingerprint(plainNamesHero.workspace)).toBe(print)
    expect(workspaceFingerprint(throughBlockly(plainNamesHero.workspace))).toBe(print)
  })
})

describe('an untouched Hero saved with the old names', () => {
  it('opens with the plain names, the kid\'s slider values, the very same blocks and program', () => {
    const old = savedWith(plainNamesHero, { walk_top: 4, p_top: 9 })
    const up = upgradeUntouchedHero(old)
    expect(up).not.toBe(old)
    const fresh = createStarterProject()
    expect(names(heroOf(up).program.variables)).toEqual(names(heroOf(fresh).program.variables))
    expect(names((up.workspaces[HERO_BRICK_ID] as Ws).variables)).toEqual(names((fresh.workspaces[HERO_BRICK_ID] as Ws).variables))
    expect(heroOf(up).program.variables.map((v) => v.value)).toEqual(heroOf(old).program.variables.map((v) => v.value))
    expect(heroOf(up).program.variables.find((v) => v.id === 'p_top')!.value).toBe(9)
    expect(heroOf(up).program.scripts).toEqual(heroOf(old).program.scripts)
    expect(heroOf(up).program.procedures).toEqual(heroOf(old).program.procedures)
    expect((up.workspaces[HERO_BRICK_ID] as Ws).blocks).toEqual((old.workspaces[HERO_BRICK_ID] as Ws).blocks)
    expect(validateDesign(up.design)).toEqual([])
    expectNoMissingVariables(up)
    // Opening it again changes nothing more.
    expect(upgradeUntouchedHero(up)).toBe(up)
  })

  it('plays exactly as before: the same path, tick by tick, as the old save and as a new Hero', () => {
    const old = savedWith(plainNamesHero)
    const before = path(old.design)
    expect(path(upgradeUntouchedHero(old).design)).toEqual(before)
    expect(path(createStarterProject().design)).toEqual(before)
    expect(new Set(before).size).toBeGreaterThan(50) // it really moved
  })

  it('with nothing tuned, it is the original Hero again (no "Back to the original")', () => {
    expect(canResetBrick(savedWith(plainNamesHero), HERO_BRICK_ID)).toBe(true)
    expect(canResetBrick(upgradeUntouchedHero(savedWith(plainNamesHero)), HERO_BRICK_ID)).toBe(false)
  })

  it('upgrades the same way through a save file and through the editor\'s own save', () => {
    const opened = projectFromText(exportProjectJson(savedWith(plainNamesHero)))!
    expect(heroOf(opened).program.variables.find((v) => v.id === 'p_top')!.name).toBe('full run speed')
    expectNoMissingVariables(opened)
    const edited = savedWith({ ...plainNamesHero, workspace: throughBlockly(plainNamesHero.workspace) })
    expect(heroOf(upgradeUntouchedHero(edited)).program.variables.find((v) => v.id === 'jump_stand')!.name).toBe('jump power')
  })

  it('has working sliders: four up front, the rest under a closed "More sliders"', () => {
    const store = new StudioStore(upgradeUntouchedHero(savedWith(plainNamesHero)))
    render(<KnobsCard store={store} brickId={HERO_BRICK_ID} />)
    const card = screen.getByRole('region', { name: 'Sliders' })
    expect(within(card).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['walk speed', 'run speed', 'jump power', 'gravity'])
    expect(within(card).getByText('How high I jump.')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /More sliders/ }))
    fireEvent.change(screen.getByRole('slider', { name: 'full run speed' }), { target: { value: '8' } })
    expect(heroOf(store.getState().project).program.variables.find((v) => v.id === 'p_top')!.value).toBe(8)
  })
})

describe('a Hero the kid changed keeps the names it has', () => {
  const changedBlocks = () => {
    const project = savedWith(plainNamesHero)
    const ws = project.workspaces[HERO_BRICK_ID] as Ws
    ws.blocks.blocks = ws.blocks.blocks.slice(0, -1) // one script gone
    return project
  }

  it('changed blocks, a remixed "My Hero", or a variable the kid renamed: nothing is renamed', () => {
    const edited = changedBlocks()
    expect(upgradeUntouchedHero(edited)).toBe(edited)
    expectNoMissingVariables(edited)
    const mine = savedWith(plainNamesHero)
    heroOf(mine).remixOf = HERO_BRICK_ID
    expect(upgradeUntouchedHero(mine)).toBe(mine)
    const renamed = savedWith(plainNamesHero)
    ;(renamed.workspaces[HERO_BRICK_ID] as Ws).variables.find((v) => v.id === 'p_top')!.name = 'zoom'
    heroOf(renamed).program.variables.find((v) => v.id === 'p_top')!.name = 'zoom'
    expect(upgradeUntouchedHero(renamed)).toBe(renamed)
  })

  it('a brick that reads a Hero variable by its old name ("p speed of Hero") keeps working: the names stay', () => {
    const project = savedWith(plainNamesHero)
    const walker = project.workspaces.brick_walker as Ws
    walker.blocks.blocks.push({ type: 'sensing_of', id: 'reads_p', x: 0, y: 900, fields: { PROPERTY: 'p speed', OBJECT: 'Hero' } })
    expect(upgradeUntouchedHero(project)).toBe(project)
    // An earlier Hero upgrades its blocks, and keeps the old names for the same reason.
    const earlier = savedWith(feelScriptsHero as unknown as Fixture)
    ;(earlier.workspaces.brick_walker as Ws).blocks.blocks.push({ type: 'sensing_of', id: 'reads_p', x: 0, y: 900, fields: { PROPERTY: 'p speed', OBJECT: 'Hero' } })
    const up = upgradeUntouchedHero(earlier)
    expect(up).not.toBe(earlier)
    expect(heroOf(up).program.variables.find((v) => v.id === 'p_top')!.name).toBe('p speed')
    expect((up.workspaces[HERO_BRICK_ID] as Ws).variables.find((v) => v.id === 'p_top')!.name).toBe('p speed')
    expectNoMissingVariables(up)
  })

  it('its sliders still show the plain words, and say what the variable is called in its code', () => {
    const store = new StudioStore(changedBlocks())
    const vars = heroOf(store.getState().project).program.variables
    expect(knobWords(vars.find((v) => v.id === 'p_top')!)).toEqual({ label: 'full run speed', hint: 'My fastest run, once the run meter is full. In the code it is called “p speed”.' })
    expect(knobWords({ id: 'p_top', name: 'zoom', value: 7 })).toEqual({ label: 'zoom' })
    render(<KnobsCard store={store} brickId={HERO_BRICK_ID} />)
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['walk speed', 'run speed', 'jump power', 'gravity'])
    fireEvent.change(screen.getByRole('slider', { name: 'gravity' }), { target: { value: '2' } })
    expect(heroOf(store.getState().project).program.variables.find((v) => v.id === 'fall_gravity')!.value).toBe(2)
  })
})

describe('older saved Heroes', () => {
  it('the two earlier Hero fixtures upgrade to the plain names, keep every block\'s variable, and keep their sliders', () => {
    for (const fixture of [feelScriptsHero, startRespawnHero] as unknown as Fixture[]) {
      const up = upgradeUntouchedHero(savedWith(fixture, { walk_top: 5 }))
      expect(names(heroOf(up).program.variables)).toEqual(names(heroOf(createStarterProject()).program.variables))
      expect(heroOf(up).program.variables.find((v) => v.id === 'walk_top')!.value).toBe(5)
      expectNoMissingVariables(up)
      expect(validateDesign(up.design)).toEqual([])
      const { main, moreCount } = knobList(heroOf(up).program.variables)
      expect(main.map((v) => knobWords(v).label)).toEqual(['walk speed', 'run speed', 'jump power', 'gravity'])
      expect(moreCount).toBe(HERO_KNOBS.length - 4)
    }
  })
})
