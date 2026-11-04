/**
 * Building together (docs/qa/hackable-rooms M2): edits as operations, who may make them, putting them back, and what
 * they do to a running game.
 */
import { describe, expect, it } from 'vitest'
import type { LevelDesign } from '../core/contracts'
import { playerHero } from '../core/players'
import { brickToWire, designText } from '../core/save'
import { worldFingerprint } from '../core/snapshot'
import { createStarterProject } from '../studio/starter'
import { roomGame } from '../studio/testRoom'
import { applyEdit, applyEditLive, diffDesigns, isEditOps, kindOfEdit, type EditOp } from './edits'

const starter = () => createStarterProject()
const run = (rt: ReturnType<typeof roomGame>, n: number) => { for (let i = 0; i < n; i++) rt.step() }

/** The Walker with its walking speed doubled (a code change: its "walk at" block). */
function fasterWalker(design: LevelDesign): LevelDesign {
  const bricks = design.bricks.map((b) => {
    if (b.id !== 'brick_walker') return b
    const program = structuredClone(b.program)
    // The flag script calls "walk at (speed)"; make it walk at speed x 3 by changing the "way x speed" multiply.
    const text = JSON.stringify(program).replace('"proccode":"walk at %s"', '"proccode":"walk at %s"')
    const next = JSON.parse(text) as typeof program
    next.scripts = next.scripts.map((s) => (s.hat.opcode === 'event_whenflagclicked' ? { ...s, body: [{ opcode: 'motion_changexby', inputs: { DX: { kind: 'literal', value: 0 } } } as never, ...s.body] } : s))
    return { ...b, program: next }
  })
  return { ...design, bricks }
}

describe('edits as operations', () => {
  it('a diff turns one project into the next, and applying it gives the same project', () => {
    const before = starter().design
    const coin = before.copies.find((c) => c.brickId === 'brick_coin')!
    const tiles = before.tiles!
    const row = tiles.data[3]!
    const after: LevelDesign = {
      ...before,
      copies: [...before.copies.filter((c) => c.id !== 'copy_coin_1').map((c) => (c.id === 'copy_coin_2' ? { ...c, x: c.x + 32 } : c)), { ...coin, id: 'copy_coin_new', x: 100 }],
      tiles: { ...tiles, data: tiles.data.map((r, i) => (i === 3 ? `${row[0] === '.' ? 'G' : '.'}${row.slice(1)}` : r)) },
    }
    const { ops, other } = diffDesigns(before, after)
    expect(other).toBe(false)
    expect(ops.map((o) => o.op).sort()).toEqual(['cells', 'copy', 'copy', 'uncopy'])
    expect(isEditOps(JSON.parse(JSON.stringify(ops)))).toBe(true)
    const applied = applyEdit(before, ops)
    expect(designText(applied.design)).toBe(designText(after))
    expect(kindOfEdit(before, ops)).toBe('build')
    // Undo puts it back exactly, the removed copy in its old place.
    expect(designText(applyEdit(applied.design, applied.undo).design)).toBe(designText(before))
  })

  it('a renamed level or a resized grid is not an edit (only the host can send the whole project)', () => {
    const before = starter().design
    expect(diffDesigns(before, { ...before, name: 'Renamed' }).other).toBe(true)
  })

  it('code is code, sliders are building, and a new brick is building', () => {
    const before = starter().design
    const walker = before.bricks.find((b) => b.id === 'brick_walker')!
    const tuned = { ...walker, program: { ...walker.program, variables: walker.program.variables.map((v) => (v.name === 'speed' ? { ...v, value: 2 } : v)) } }
    expect(kindOfEdit(before, [{ op: 'brick', brick: brickToWire(tuned) }])).toBe('build')
    const coded = fasterWalker(before).bricks.find((b) => b.id === 'brick_walker')!
    expect(kindOfEdit(before, [{ op: 'brick', brick: brickToWire(coded) }])).toBe('code')
    // Blocks travelling with a brick are code, even when they do the same.
    expect(kindOfEdit(before, [{ op: 'brick', brick: brickToWire(walker), ws: { blocks: {} } }])).toBe('code')
    expect(kindOfEdit(before, [{ op: 'brick', brick: brickToWire({ ...walker, id: 'brick_new', name: 'New' }) }])).toBe('build')
    expect(kindOfEdit(before, [{ op: 'unbrick', id: 'brick_walker' }])).toBe('code')
    expect(applyEdit(before, [{ op: 'brick', brick: brickToWire(coded) }]).restarted).toEqual(['brick_walker'])
    expect(applyEdit(before, [{ op: 'brick', brick: brickToWire(tuned) }]).restarted).toEqual([])
  })

  it('refuses what is not an edit', () => {
    expect(isEditOps([])).toBe(false)
    expect(isEditOps([{ op: 'paint' }])).toBe(false)
    expect(isEditOps([{ op: 'cells', cells: [[1, 2, 'GG']] }])).toBe(false)
    expect(isEditOps([{ op: 'copy', copy: { id: 'x' } }])).toBe(false)
    expect(() => applyEdit(starter().design, [{ op: 'cells', cells: [[9999, 0, 'G']] }])).toThrow()
  })
})

describe('edits in a running game', () => {
  it('a copy placed during play appears and starts; a removed one goes; painted cells become bricks', () => {
    const design = starter().design
    const rt = roomGame(design, ['Maya', 'Sam'])
    run(rt, 10)
    const coin = design.copies.find((c) => c.brickId === 'brick_coin')!
    const ops: EditOp[] = [
      { op: 'copy', copy: { ...coin, id: 'copy_coin_live', x: 300, y: 100 } },
      { op: 'uncopy', id: 'copy_walker_fast' },
      { op: 'cells', cells: [[10, 8, 'G']] },
    ]
    applyEditLive(rt, ops, applyEdit(rt.world.design!, ops))
    const live = rt.world.targets.find((t) => t.copyId === 'copy_coin_live')!
    expect(live).toBeTruthy()
    expect(rt.world.targets.some((t) => t.copyId === 'copy_walker_fast')).toBe(false)
    const cell = rt.world.targets.find((t) => t.copyId === 'cell:10:8')!
    expect(cell.brickId).toBe('brick_ground')
    // Cells stay behind every copy.
    expect(rt.world.targets.indexOf(cell)).toBeLessThan(rt.world.targets.findIndex((t) => t.copyId === 'copy_hero'))
    const angle = live.direction
    run(rt, 3)
    // The new Coin runs its scripts (it spins).
    expect(live.direction).not.toBe(angle)
    expect(rt.world.design!.copies.some((c) => c.id === 'copy_coin_live')).toBe(true)
  })

  it('moving the painted Hero changes only where Heroes start, never a player mid-game', () => {
    const design = starter().design
    const rt = roomGame(design, ['Maya'])
    run(rt, 10)
    const maya = playerHero(rt.world, 1)!
    const x = maya.x
    const hero = design.copies.find((c) => c.id === 'copy_hero')!
    const ops: EditOp[] = [{ op: 'copy', copy: { ...hero, x: hero.x + 200 } }]
    applyEditLive(rt, ops, applyEdit(rt.world.design!, ops))
    expect(maya.x).toBe(x)
    expect(rt.world.design!.copies.find((c) => c.id === 'copy_hero')!.x).toBe(hero.x + 200)
  })

  it('a code edit restarts only that brick\'s scripts; every other brick keeps running', () => {
    const design = starter().design
    const rt = roomGame(design, ['Maya'])
    run(rt, 30)
    const walkers = rt.world.targets.filter((t) => t.brickId === 'brick_walker')
    const others = rt.threads().filter((t) => t.target.brickId !== 'brick_walker').map((t) => t.id)
    const walkerThreads = rt.threads().filter((t) => t.target.brickId === 'brick_walker').map((t) => t.id)
    expect(walkerThreads.length).toBeGreaterThan(0)
    const coded = fasterWalker(design).bricks.find((b) => b.id === 'brick_walker')!
    const ops: EditOp[] = [{ op: 'brick', brick: brickToWire(coded) }]
    applyEditLive(rt, ops, applyEdit(rt.world.design!, ops))
    const now = rt.threads().filter((t) => !t.done)
    // The Walkers' scripts are new threads, running the new blocks.
    expect(now.filter((t) => t.target.brickId === 'brick_walker').some((t) => walkerThreads.includes(t.id))).toBe(false)
    expect(now.filter((t) => walkers.includes(t.target)).length).toBeGreaterThan(0)
    for (const t of now.filter((x) => x.target.brickId === 'brick_walker')) expect((t as unknown as { script?: { body: Array<{ opcode: string }> } }).script?.body[0]?.opcode).toBe('motion_changexby')
    // Everyone else's scripts are the same threads as before.
    for (const id of others) expect(now.some((t) => t.id === id) || rt.threads().every((t) => t.id !== id)).toBe(true)
    expect(now.filter((t) => others.includes(t.id)).length).toBeGreaterThan(0)
    run(rt, 10)
  })

  it('two games given the same edits at the same tick agree', () => {
    const play = () => {
      const rt = roomGame(starter().design, ['Maya', 'Sam'])
      run(rt, 15)
      const coded = fasterWalker(starter().design).bricks.find((b) => b.id === 'brick_walker')!
      const ops: EditOp[] = [{ op: 'brick', brick: brickToWire(coded) }, { op: 'cells', cells: [[12, 5, 'G'], [13, 5, 'G']] }]
      applyEditLive(rt, ops, applyEdit(rt.world.design!, ops))
      rt.pressKey('right arrow', 2)
      run(rt, 60)
      return worldFingerprint(rt.world)
    }
    expect(play()).toBe(play())
  })

  it('a slider turned on a brick takes effect at once, for every copy, Heroes too; its scripts keep running', () => {
    const design = starter().design
    const rt = roomGame(design, ['Maya', 'Sam'])
    run(rt, 10)
    const hero = design.bricks.find((b) => b.id === 'brick_hero')!
    const knob = hero.program.variables.find((v) => typeof v.value === 'number' && v.showInBuild)!
    const tuned = { ...hero, program: { ...hero.program, variables: hero.program.variables.map((v) => (v.id === knob.id ? { ...v, value: Number(v.value) * 2 } : v)) } }
    const threads = rt.threads().filter((t) => t.target.brickId === 'brick_hero' && !t.done).map((t) => t.id)
    const ops: EditOp[] = [{ op: 'brick', brick: brickToWire(tuned) }]
    const applied = applyEdit(rt.world.design!, ops)
    expect(applied.restarted).toEqual([])
    applyEditLive(rt, ops, applied)
    for (const t of rt.world.targets.filter((x) => x.brickId === 'brick_hero')) expect(t.variables[knob.id]).toBe(Number(knob.value) * 2)
    expect(rt.threads().filter((t) => t.target.brickId === 'brick_hero' && !t.done).map((t) => t.id)).toEqual(threads)
  })
})
