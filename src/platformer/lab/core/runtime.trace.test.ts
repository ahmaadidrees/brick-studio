import { describe, expect, it } from 'vitest'
import type { BrickProgram, PrimitiveTable, Script } from './contracts'
import { compileWorkspace } from './editor/compile'
import { Runtime, type ExecutedBlocks, YIELD_TICK } from './runtime'
import { boxBrick, makeTarget, makeWorld } from './testkit'

function setup(program: BrickProgram, primitives: PrimitiveTable = {}, copies = 1) {
  const world = makeWorld({
    bricks: [boxBrick('b1', 'Walker', 20, 20, { program })],
    targets: Array.from({ length: copies }, (_, i) => makeTarget({ id: `copy-${i}`, brickId: 'b1' })),
  })
  return new Runtime(world, primitives)
}

const programFor = (scripts: Script[]): BrickProgram => ({ scripts, procedures: [], variables: [], lists: [] })
const flag = (body: Script['body']): Script => ({
  id: 'flag-id', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body,
})
const ids = (snapshot: ExecutedBlocks, target = 'copy-0') => [...(snapshot.get(target) ?? [])].sort()

describe('executed block observer', () => {
  it('reports compiled hat, statement and nested reporter ids even after a thread finishes', () => {
    const { program } = compileWorkspace({ blocks: { blocks: [{
      type: 'event_whenflagclicked', id: 'editor-hat', next: { block: {
        type: 'motion_movesteps', id: 'editor-move', inputs: { STEPS: { block: {
          type: 'operator_add', id: 'editor-add', inputs: {
            NUM1: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
            NUM2: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
          },
        } } },
      } },
    }] } })
    const runtime = setup(program, {
      operator_add: ctx => Number(ctx.arg('NUM1')) + Number(ctx.arg('NUM2')),
      motion_movesteps: ctx => { ctx.target.x += Number(ctx.arg('STEPS')) },
    })
    const seen: ExecutedBlocks[] = []
    runtime.onExecutedBlocks(snapshot => seen.push(snapshot))
    runtime.greenFlag()
    runtime.step()
    expect(runtime.threads()).toHaveLength(0)
    expect(runtime.world.targets[0].x).toBe(3)
    expect(ids(seen.at(-1)!)).toEqual(['editor-add', 'editor-hat', 'editor-move'])
    const completed = seen.at(-1)!
    runtime.step()
    expect(seen.at(-1)!.size).toBe(0)
    expect(ids(completed)).toEqual(['editor-add', 'editor-hat', 'editor-move'])
  })

  it('keeps separate traces for multiple copies and a clone removed in the same tick', () => {
    const program = programFor([
      flag([{ id: 'spawn-id', opcode: 'test_spawn', fields: {}, inputs: {} }]),
      { id: 'clone-hat', hat: { opcode: 'control_start_as_clone', fields: {}, inputs: {} }, body: [
        { id: 'delete-id', opcode: 'test_delete', fields: {}, inputs: {} },
      ] },
    ])
    const runtime = setup(program, {
      test_spawn: ctx => {
        const clone = makeTarget({ id: `clone-${ctx.target.id}`, brickId: 'b1', copyId: ctx.target.id })
        ctx.runtime.addClone(clone, ctx.target)
      },
      test_delete: ctx => { ctx.runtime.removeClone(ctx.target) },
    }, 2)
    let trace: ExecutedBlocks = new Map()
    runtime.onExecutedBlocks(snapshot => { trace = snapshot })
    runtime.greenFlag()
    runtime.step()
    expect(runtime.world.targets.map(t => t.id)).toEqual(['copy-0', 'copy-1'])
    expect(ids(trace, 'copy-0')).toEqual(['flag-id', 'spawn-id'])
    expect(ids(trace, 'copy-1')).toEqual(['flag-id', 'spawn-id'])
    expect(ids(trace, 'clone-copy-0')).toEqual(['clone-hat', 'delete-id'])
    expect(ids(trace, 'clone-copy-1')).toEqual(['clone-hat', 'delete-id'])
    expect(runtime.executionTarget('clone-copy-0')).toEqual({ brickId: 'b1', copyId: 'copy-0' })
    expect(runtime.executionTarget('clone-copy-1')).toEqual({ brickId: 'b1', copyId: 'copy-1' })
    expect(runtime.executionTarget('unknown')).toBeUndefined()
    // The editor gets an identity copy, never a mutable reference to the runtime's trace or world.
    const identity = runtime.executionTarget('clone-copy-0') as { brickId: string; copyId?: string }
    identity.brickId = 'changed'
    expect(runtime.executionTarget('clone-copy-0')!.brickId).toBe('b1')
    expect(runtime.world.targets[0].brickId).toBe('b1')
    runtime.step()
    expect(runtime.executionTarget('clone-copy-0')).toBeUndefined()
  })

  it('isolates observer mutation and errors, unsubscribes, and clears on restart/stop', () => {
    const runtime = setup(programFor([flag([{ id: 'work', opcode: 'test_work', fields: {}, inputs: {} }])]))
    runtime.onExecutedBlocks(snapshot => {
      const mutable = snapshot as Map<string, Set<string>>
      mutable.get('copy-0')?.clear()
      mutable.set('fake', new Set(['fake-id']))
      throw new Error('display failed')
    })
    const seen: ExecutedBlocks[] = []
    const unsubscribe = runtime.onExecutedBlocks(snapshot => seen.push(snapshot))
    runtime.greenFlag()
    expect(seen.at(-1)!.size).toBe(0)
    expect(() => runtime.step()).not.toThrow()
    expect(ids(seen.at(-1)!)).toEqual(['flag-id', 'work'])
    expect(seen.at(-1)!.has('fake')).toBe(false)
    expect(runtime.executionTarget('copy-0')).toEqual({ brickId: 'b1', copyId: undefined })
    runtime.stop()
    expect(runtime.executionTarget('copy-0')).toBeUndefined()
    expect(seen.at(-1)!.size).toBe(0)
    runtime.greenFlag()
    expect(seen.at(-1)!.size).toBe(0)
    const count = seen.length
    unsubscribe()
    unsubscribe()
    runtime.step()
    expect(seen).toHaveLength(count)
    expect(runtime.executionTarget('copy-0')).toBeDefined() // the remaining observer is still subscribed
  })

  it('does not report the hat again every tick of a continuing script', () => {
    const runtime = setup(programFor([flag([
      { id: 'loop', opcode: 'control_forever', fields: {}, inputs: {}, branches: [[
        { id: 'yield', opcode: 'test_yield', fields: {}, inputs: {} },
      ]] },
    ])]), { test_yield: () => YIELD_TICK })
    const seen: ExecutedBlocks[] = []
    runtime.onExecutedBlocks(snapshot => seen.push(snapshot))
    runtime.greenFlag()
    runtime.step()
    expect(ids(seen.at(-1)!)).toEqual(['flag-id', 'loop', 'yield'])
    runtime.step()
    expect(ids(seen.at(-1)!)).toEqual(['yield'])
  })

  it('captures target identity only with observers and clears it when restoring a world', () => {
    const runtime = setup(programFor([flag([{ id: 'work', opcode: 'test_work', fields: {}, inputs: {} }])]))
    runtime.greenFlag()
    runtime.step()
    expect(runtime.executionTarget('copy-0')).toBeUndefined()
    const unsubscribe = runtime.onExecutedBlocks(() => {})
    runtime.greenFlag()
    runtime.step()
    expect(runtime.executionTarget('copy-0')?.brickId).toBe('b1')
    runtime.restoreWorld(structuredClone(runtime.world))
    expect(runtime.executionTarget('copy-0')).toBeUndefined()
    unsubscribe()
    runtime.greenFlag()
    runtime.step()
    expect(runtime.executionTarget('copy-0')).toBeUndefined()
  })

  it('preserves complete world, notes, seeded random outcomes and budget scheduling with observers', () => {
    const program = programFor([flag([
      { id: 'repeat', opcode: 'control_repeat', inputs: { TIMES: { kind: 'lit', value: 200 } }, fields: {}, branches: [[
        { id: 'move', opcode: 'test_move', fields: {}, inputs: { STEPS: {
          id: 'random', kind: 'block', opcode: 'test_random', fields: {}, inputs: {},
        } } },
      ]] },
    ])])
    const primitives: PrimitiveTable = {
      test_random: ctx => ctx.runtime.random(),
      test_move: ctx => {
        ctx.target.x += Number(ctx.arg('STEPS'))
        ctx.target.variables.moves = Number(ctx.target.variables.moves ?? 0) + 1
        ctx.runtime.emit({ kind: 'stopSounds' })
      },
    }
    const plain = setup(structuredClone(program), primitives, 3)
    const observed = setup(structuredClone(program), primitives, 3)
    plain.opBudget = observed.opBudget = 17
    let ticksObserved = 0
    observed.onExecutedBlocks(snapshot => { if (snapshot.size) ticksObserved++ })
    plain.greenFlag()
    observed.greenFlag()
    for (let i = 0; i < 120; i++) {
      plain.step()
      observed.step()
      expect(observed.world).toEqual(plain.world)
      expect(observed.notes).toEqual(plain.notes)
    }
    expect(ticksObserved).toBeGreaterThan(1)
    expect(plain.threads()).toHaveLength(0)
    expect(plain.world.targets.map(t => t.variables.moves)).toEqual([200, 200, 200])
    expect(plain.executionTarget('copy-0')).toBeUndefined()
  })
})
