import { describe, expect, it } from 'vitest'
import type { BrickDef } from '../bricks/builtins'
import { arith, changeMem, forever, program, repeat, setMem, wait, when, type Node, type WorkspaceJson } from '../bricks/dsl'
import { setProgram, starterDoc, type LabDoc } from '../level/doc'
import { LAB_LIMITS } from '../program/types'
import { flatLevel, labHarness } from '../testHarness'

function tester(workspace: WorkspaceJson) {
  const base = starterDoc()
  const brick: BrickDef = { id: 'tester', name: 'Tester', costume: 'crate', basedOn: null, origin: 'mine', program: workspace, blurb: '' }
  const doc: LabDoc = { ...base, bricks: { ...base.bricks, tester: brick } }
  const h = labHarness(doc, flatLevel(40, 16, [{ id: 1, brick: 'tester', x: 20, y: 13, dir: 1 }]))
  const t = h.ofBrick('tester')[0]
  return { h, t, doc }
}

describe('running scripts', () => {
  it('waits whole frames: 0.5 seconds is 30 frames', () => {
    const { h, t } = tester(program('p', when.appear(setMem('my', 'count', 1), wait(0.5), setMem('my', 'count', 2))))
    h.run(30)
    expect(t.mem.count).toBe(1)
    h.run(1)
    expect(t.mem.count).toBe(2)
    expect(t.fibers).toHaveLength(0)
  })

  it('goes round a forever loop once a frame', () => {
    const { h, t } = tester(program('p', when.appear(forever(changeMem('my', 'count', 1)))))
    h.run(100)
    expect(t.mem.count).toBe(100)
  })

  it('ignores a key while its script is still running, so a wait at the end is a cooldown', () => {
    const { h, t } = tester(program('p', when.key('z', changeMem('my', 'count', 1), wait(1))))
    for (let i = 0; i < 120; i++) h.step({}, i % 10 === 0 ? ['z'] : [])
    expect(t.mem.count).toBe(2)
  })

  it('fires "every N seconds" on time', () => {
    const { h, t } = tester(program('p', when.every(0.5, changeMem('my', 'count', 1))))
    h.run(151)
    expect(t.mem.count).toBe(5)
  })

  it('spreads a big loop over frames instead of freezing the game', () => {
    const { h, t } = tester(program('p', when.appear(repeat(10000, changeMem('my', 'count', 1)))))
    h.run(1)
    const first = t.mem.count as number
    expect(first).toBeGreaterThan(100)
    expect(first).toBeLessThan(LAB_LIMITS.opsPerThing)
    h.run(60)
    expect(t.mem.count).toBe(10000)
    expect(h.world.notes).toEqual([])
  })

  it('keeps a whole level of busy things inside the frame budget: some wait a frame, all finish', () => {
    const busy = program('p', when.appear(repeat(10000, changeMem('my', 'count', arith(1, '+', 0)))))
    const base = starterDoc()
    const brick: BrickDef = { id: 'tester', name: 'Tester', costume: 'crate', basedOn: null, origin: 'mine', program: busy, blurb: '' }
    const things = Array.from({ length: 40 }, (_, i) => ({ id: i + 1, brick: 'tester', x: 2 + i, y: 13, dir: 1 as const }))
    const h = labHarness({ ...base, bricks: { ...base.bricks, tester: brick } }, flatLevel(60, 16, things))
    h.step()
    const counts = () => h.ofBrick('tester').map((t) => (t.mem.count as number | undefined) ?? 0)
    // The level's budget ran out partway: later things waited, and the kid is told why.
    expect(counts().filter((c) => c === 0).length).toBeGreaterThan(0)
    expect(h.world.notes.map((n) => n.diagnostic.code)).toEqual(['runtime.level-busy'])
    let spent = 0
    for (const c of counts()) spent += c
    expect(spent * 4).toBeLessThanOrEqual(LAB_LIMITS.opsPerTick)
    h.run(400)
    expect(counts().every((c) => c === 10000)).toBe(true)
  })

  it('stops a script whose math runs away, and says why; dividing by zero is just 0', () => {
    const big = (n: number): Node | number => (n === 0 ? 1e300 : arith(big(n - 1), '*', 1e300))
    const { h, t } = tester(program('p', when.appear(setMem('my', 'count', arith(5, '/', 0)), setMem('my', 'score', big(2)), setMem('my', 'hits', 1))))
    h.step()
    expect(t.mem.count).toBe(0)
    expect(t.mem.score).toBeUndefined()
    expect(t.mem.hits).toBeUndefined()
    expect(t.fibers).toHaveLength(0)
    expect(h.world.notes.map((n) => n.diagnostic.message)).toEqual(['This math made a number too big to use. Check the numbers in it.'])
  })
})

describe('live edits', () => {
  const loop = (step: number, start = 0) => program('p', when.appear(setMem('my', 'count', start), forever(changeMem('my', 'count', step))))

  it('changes a running loop in place, keeping what the thing remembers', () => {
    const { h, t, doc } = tester(loop(1))
    h.run(30)
    expect(t.mem.count).toBe(30)
    h.setDoc(setProgram(doc, 'tester', loop(10)))
    h.run(10)
    // Same block ids, so the loop picked up the new step and nothing started over.
    expect(t.mem.count).toBe(130)
  })

  it('starts a script again when an edit changes what it already did', () => {
    const { h, t, doc } = tester(loop(1))
    h.run(30)
    h.setDoc(setProgram(doc, 'tester', loop(1, 500)))
    h.run(10)
    expect(t.mem.count).toBe(510)
  })

  it('runs a "when I appear" script added while the level runs, and stops one taken away', () => {
    const { h, t, doc } = tester(loop(1))
    h.run(10)
    const added = program('p', when.appear(setMem('my', 'count', 0), forever(changeMem('my', 'count', 1))))
    added.blocks.blocks.push(...program('q', when.appear(setMem('my', 'score', 7))).blocks.blocks.map((b) => ({ ...b, y: 400 })))
    const withScore = setProgram(doc, 'tester', added)
    h.setDoc(withScore)
    h.run(1)
    expect(t.mem.score).toBe(7)
    expect(t.mem.count).toBe(11)
    h.setDoc(setProgram(withScore, 'tester', program('q', when.appear(setMem('my', 'score', 7)))))
    h.run(10)
    expect(t.mem.count).toBe(11)
  })
})
