import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { createStarterProject } from '../starter'
import { Blocks } from '../blockBuilder'
import { StudioStore } from '../store'
import { builtInPowers, fits, makePower, powerFromFile, powerToFile, whyNot, type PowerBrick } from './powers'

const power = (id: string): PowerBrick => builtInPowers().find((p) => p.id === id)!
const heroOf = (store: StudioStore) => store.brick('brick_hero')!
const testCostume = { name: 'c1', width: 16, height: 16, rotationCenterX: 8, rotationCenterY: 8 }

/**
 * A brick whose every-tick script calls My Block "step a"; "step a" calls "step b"; "step b" can call "step a" back
 * (never taken: a stays small). "unused" is called by nothing.
 */
function nestedCustomBlocks() {
  const store = new StudioStore(createStarterProject())
  const brickId = store.addBrick('Counter', testCostume)
  store.addCopy(brickId, 0, 0)
  const b = new Blocks('t')
  const A = { proccode: 'step a', argumentNames: [] }
  const B = { proccode: 'step b', argumentNames: [] }
  const unused = { proccode: 'unused', argumentNames: [] }
  const script = b.script('Count every tick', b.blk('platformer_everytick'), [b.call(A)])
  b.define(A, 'A', [b.change('a', 1), b.call(B)])
  b.define(B, 'B', [b.change('b', 10), b.when(b.gt(b.v('a'), 100000), [b.call(A)])])
  b.define(unused, 'never called', [b.change('c', 1)])
  store.setWorkspace(brickId, {
    blocks: { languageVersion: 0, blocks: b.scripts },
    variables: [{ id: 'a', name: 'a count', type: '' }, { id: 'b', name: 'b count', type: '' }, { id: 'c', name: 'c count', type: '' }],
  })
  return { store, brickId, scriptId: script.id as string }
}

/** Highest the Hero gets over a run, pressing space on the given ticks (held for 4 ticks each). */
function peakHeight(store: StudioStore, presses: number[], ticks = 90): number {
  const rt = play(store.getState().project.design)
  const hero = () => rt.world.targets.find((t) => t.brickId === 'brick_hero' && !t.isClone)!
  for (let i = 0; i < 30; i++) rt.step()
  const floor = hero().y
  let peak = 0
  for (let t = 0; t < ticks; t++) {
    if (presses.includes(t)) rt.pressKey('space')
    if (presses.some((p) => t === p + 4)) rt.releaseKey('space')
    rt.step()
    peak = Math.max(peak, hero().y - floor)
  }
  return peak
}

describe('snapping a power onto a brick', () => {
  it('Double jump snaps onto the Hero: its scripts and variables come in with their own ids, and the brick records it', () => {
    const store = new StudioStore(createStarterProject())
    const before = heroOf(store).program.scripts.length
    const snap = store.snapPower('brick_hero', power('double-jump'))!
    expect(snap).toMatchObject({ id: 'pw1', name: 'Double jump', credits: ['Brickgineers'] })
    const hero = heroOf(store)
    expect(hero.powers).toEqual([snap])
    expect(hero.program.scripts).toHaveLength(before + 2)
    expect(snap.variableIds.every((id) => id.startsWith('pw1_'))).toBe(true)
    expect(hero.program.variables.find((v) => v.id === 'pw1_power')).toMatchObject({ name: 'second jump power', value: 9, showInBuild: true })
    expect(store.getState().diagnostics.brick_hero?.filter((d) => d.severity === 'error') ?? []).toEqual([])
    // still the built-in Hero (a power is an addition, not a remix), and still valid
    expect(hero.name).toBe('Hero')
    expect(validateDesign(store.getState().project.design)).toEqual([])
  })

  it('snapping the same power twice gives the second copy its own ids and clear names', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', power('double-jump'))
    const second = store.snapPower('brick_hero', power('double-jump'))!
    expect(second.id).toBe('pw2')
    const names = heroOf(store).program.variables.map((v) => v.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('jumps left (Double jump)')
    expect(validateDesign(store.getState().project.design)).toEqual([])
  })

  it('taking it off leaves the brick exactly as it was', () => {
    const store = new StudioStore(createStarterProject())
    const workspace = structuredClone(store.getState().project.workspaces.brick_hero) as { blocks: { blocks: unknown[] }; variables: unknown[] }
    const program = structuredClone(heroOf(store).program)
    const snap = store.snapPower('brick_hero', power('double-jump'))!
    store.takeOffPower('brick_hero', snap.id)
    const after = store.getState().project.workspaces.brick_hero as typeof workspace
    expect(after.blocks.blocks).toEqual(workspace.blocks.blocks)
    expect(after.variables).toEqual(workspace.variables)
    expect(heroOf(store).program).toEqual(program)
    expect(heroOf(store).powers).toEqual([])
  })

  it('a second jump in the air takes the Hero higher, and turning the power off takes it away', () => {
    const plain = new StudioStore(createStarterProject())
    const without = peakHeight(plain, [0, 6])
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', power('double-jump'))!
    const withPower = peakHeight(store, [0, 6])
    expect(withPower).toBeGreaterThan(without + 20)
    store.setPowerOn('brick_hero', snap.id, false)
    expect(store.isPowerOn('brick_hero', snap.id)).toBe(false)
    expect(peakHeight(store, [0, 6])).toBe(without)
    store.setPowerOn('brick_hero', snap.id, true)
    expect(peakHeight(store, [0, 6])).toBe(withPower)
  })

  it('a single press is still one normal jump with Double jump on', () => {
    const plain = peakHeight(new StudioStore(createStarterProject()), [0])
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', power('double-jump'))
    expect(peakHeight(store, [0])).toBe(plain)
  })

  it('Hop makes a Walker hop now and then', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_walker', power('hop'))
    const rt = play(store.getState().project.design)
    const walkers = () => rt.world.targets.filter((t) => t.brickId === 'brick_walker' && !t.isClone)
    for (let i = 0; i < 20; i++) rt.step()
    const start = walkers().map((w) => w.y)
    let rose = 0
    for (let i = 0; i < 120; i++) {
      rt.step()
      walkers().forEach((w, k) => { rose = Math.max(rose, w.y - start[k]) })
    }
    expect(rose).toBeGreaterThan(10)
  })

  it('fits any placed brick, but not the Stage or a painted grid brick, and says why', () => {
    const store = new StudioStore(createStarterProject())
    const design = store.getState().project.design
    expect(fits(power('dash'), heroOf(store))).toBe(true)
    expect(fits(power('dash'), design.stage)).toBe(false)
    const ground = design.bricks.find((b) => b.grid?.char === 'G')!
    expect(fits(power('dash'), ground)).toBe(false)
    expect(whyNot(power('dash'), ground)).toMatch(/painted on the grid/)
    expect(store.snapPower(ground.id, power('dash'))).toBeNull()
  })
})

describe('making a power and sharing it as a file', () => {
  it('a power made from a script carries the variables it uses, with their values, and credits the maker', () => {
    const store = new StudioStore(createStarterProject())
    const hero = heroOf(store)
    const ws = store.getState().project.workspaces.brick_hero as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    const coyote = ws.blocks.blocks.find((b) => (b.data ?? '').includes('Coyote time'))!
    const made = makePower(store.getState().project, 'brick_hero', { name: 'Late jump', by: 'Ana', what: 'jump just after a ledge', blockIds: [coyote.id] })
    expect(made).toMatchObject({ name: 'Late jump', credits: ['Ana'], fits: 'brick' })
    expect(made.blocks).toHaveLength(1)
    expect(made.variables.map((v) => v.name).sort()).toEqual(['late jump left', 'late jump ticks'])
    expect(made.variables.find((v) => v.name === 'late jump ticks')!.value).toBe(hero.program.variables.find((v) => v.id === 'late_ticks')!.value)
  })

  it('a power made from scripts another power added credits that power\'s maker first', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', power('double-jump'))!
    const made = makePower(store.getState().project, 'brick_hero', { name: 'Triple jump', by: 'Sam', what: '', blockIds: snap.blockIds })
    expect(made.credits).toEqual(['Brickgineers', 'Sam'])
  })

  it('round-trips through a file, and snaps onto another brick from it', () => {
    const file = powerToFile(power('double-jump'))
    const back = powerFromFile(file)!
    expect(back).toEqual(power('double-jump'))
    const store = new StudioStore(createStarterProject())
    expect(store.snapPower('brick_walker', back)).not.toBeNull()
    expect(validateDesign(store.getState().project.design)).toEqual([])
  })

  it('a script that calls My Block A, which calls My Block B, takes both (and their variables) and plays the same elsewhere', () => {
    const { store, brickId, scriptId } = nestedCustomBlocks()
    const made = makePower(store.getState().project, brickId, { name: 'Counter', by: 'Ana', what: 'counts', blockIds: [scriptId] })
    const procs = made.blocks.map((b) => (b.extraState as { proccode?: string } | undefined)?.proccode).filter(Boolean).sort()
    expect(procs).toEqual(['step a', 'step b']) // not the unused My Block
    expect(made.blocks).toHaveLength(3)
    expect(made.variables.map((v) => v.name).sort()).toEqual(['a count', 'b count'])
    expect(made.credits).toEqual(['Ana'])

    // Through a file and into a different project, it behaves like the original.
    const back = powerFromFile(powerToFile(made))!
    const other = new StudioStore(createStarterProject())
    const otherId = other.addBrick('Counter bot', testCostume)
    other.addCopy(otherId, 0, 0)
    const snap = other.snapPower(otherId, back)!
    expect(other.getState().diagnostics[otherId]?.filter((d) => d.severity === 'error') ?? []).toEqual([])
    expect(validateDesign(other.getState().project.design)).toEqual([])
    const counts = (s: StudioStore, id: string, vars: string[]) => {
      const rt = play(s.getState().project.design)
      for (let i = 0; i < 12; i++) rt.step()
      const t = rt.world.targets.find((x) => x.brickId === id && !x.isClone)!
      return vars.map((v) => t.variables[v])
    }
    const original = counts(store, brickId, ['a', 'b'])
    expect(original[0]).toBeGreaterThan(0)
    expect(original[1]).toBe(Number(original[0]) * 10)
    expect(counts(other, otherId, [`${snap.id}_a`, `${snap.id}_b`])).toEqual(original)
  })

  it('a new script that calls a My Block from Ana\'s power credits Ana first', () => {
    const { store, brickId, scriptId } = nestedCustomBlocks()
    const ana = makePower(store.getState().project, brickId, { name: 'Counter', by: 'Ana', what: '', blockIds: [scriptId] })
    const other = new StudioStore(createStarterProject())
    const otherId = other.addBrick('Counter bot', testCostume)
    other.snapPower(otherId, ana)
    const b = new Blocks('sam')
    const mine = b.flag('Count once at the start', [b.call({ proccode: 'step a', argumentNames: [] })])
    const ws = structuredClone(other.getState().project.workspaces[otherId]) as { blocks: { blocks: unknown[] } }
    ws.blocks.blocks.push(mine)
    other.setWorkspace(otherId, ws)
    const made = makePower(other.getState().project, otherId, { name: 'Start count', by: 'Sam', what: '', blockIds: [mine.id as string] })
    expect(made.credits).toEqual(['Ana', 'Sam'])
    expect(made.blocks.filter((x) => x.type === 'procedures_definition')).toHaveLength(2)
  })

  it('My Blocks that call each other come along once each', () => {
    const { store, brickId, scriptId } = nestedCustomBlocks()
    const made = makePower(store.getState().project, brickId, { name: 'Counter', by: 'Ana', what: '', blockIds: [scriptId] })
    const defs = made.blocks.filter((b) => b.type === 'procedures_definition')
    expect(defs).toHaveLength(2)
  })

  it('refuses files that are not powers', () => {
    expect(powerFromFile('not json')).toBeNull()
    expect(powerFromFile('{}')).toBeNull()
    expect(powerFromFile(JSON.stringify({ ...power('dash'), kind: 'something-else' }))).toBeNull()
    expect(powerFromFile(JSON.stringify({ ...power('dash'), blocks: [{ notAType: 1 }] }))).toBeNull()
    expect(powerFromFile(JSON.stringify({ ...power('dash'), fits: 'everything' }))).toBeNull()
  })
})
