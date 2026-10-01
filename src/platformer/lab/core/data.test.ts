import { describe, expect, it } from 'vitest'
import { YIELD } from './contracts'
import type { Primitive, Target, Value } from './contracts'
import { LIST_ITEM_LIMIT, dataPrimitives } from './data'
import { fakeRuntime, makeTarget, makeWorld } from './testkit'
import { callPrimitive } from './testkit'

const OPCODES = [
  'data_variable',
  'data_setvariableto',
  'data_changevariableby',
  'data_showvariable',
  'data_hidevariable',
  'data_listcontents',
  'data_addtolist',
  'data_deleteoflist',
  'data_deletealloflist',
  'data_insertatlist',
  'data_replaceitemoflist',
  'data_itemoflist',
  'data_itemnumoflist',
  'data_lengthoflist',
  'data_listcontainsitem',
  'data_showlist',
  'data_hidelist',
] as const

function prim(opcode: string): Primitive {
  const fn = dataPrimitives[opcode]
  if (!fn) throw new Error(`missing ${opcode}`)
  return fn
}

interface Harness {
  target: Target
  stage: Target
  rt: ReturnType<typeof fakeRuntime>
}

function harness(opts: {
  variables?: Record<string, Value>
  lists?: Record<string, Value[]>
  stageVariables?: Record<string, Value>
  stageLists?: Record<string, Value[]>
  random?: () => number
} = {}): Harness {
  const target = makeTarget({ variables: opts.variables ?? {}, lists: opts.lists ?? {} })
  const world = makeWorld({ targets: [target] })
  world.stage.variables = opts.stageVariables ?? {}
  world.stage.lists = opts.stageLists ?? {}
  const rt = fakeRuntime(world)
  if (opts.random) rt.random = opts.random
  return { target, stage: world.stage, rt }
}

function run(h: Harness, opcode: string, args: Record<string, Value> = {}, fields: Record<string, string> = {}, target?: Target): Value | undefined {
  const out = callPrimitive(prim(opcode), { runtime: h.rt, target: target ?? h.target, args, fields })
  if (out.result === YIELD) throw new Error(`${opcode} yielded`)
  return out.result as Value | undefined
}

function worldOf(targets: Target[], stageVariables: Record<string, Value> = {}, stageLists: Record<string, Value[]> = {}, random?: () => number) {
  const world = makeWorld({ targets })
  world.stage.variables = stageVariables
  world.stage.lists = stageLists
  const rt = fakeRuntime(world)
  if (random) rt.random = random
  const call = (opcode: string, target: Target, args: Record<string, Value> = {}, fields: Record<string, string> = {}) => {
    const out = callPrimitive(prim(opcode), { runtime: rt, target, args, fields })
    if (out.result === YIELD) throw new Error(`${opcode} yielded`)
    return out.result as Value | undefined
  }
  return { world, rt, stage: world.stage, call }
}

describe('data', () => {
  it('registers variable, list, and show/hide opcodes', () => {
    expect(LIST_ITEM_LIMIT).toBe(200_000)
    for (const opcode of OPCODES) expect(typeof dataPrimitives[opcode]).toBe('function')
  })

  it('D01 · set vs change', () => {
    const box = harness({ variables: { v: 0 } })
    run(box, 'data_setvariableto', { VALUE: 'cat' }, { VARIABLE: 'v' })
    run(box, 'data_changevariableby', { VALUE: 2 }, { VARIABLE: 'v' })
    expect(run(box, 'data_variable', {}, { VARIABLE: 'v' })).toBe(2)
    expect(box.target.variables.v).toBe(2)

    run(box, 'data_setvariableto', { VALUE: '02' }, { VARIABLE: 'v' })
    expect(run(box, 'data_variable', {}, { VARIABLE: 'v' })).toBe('02')
    expect(box.target.variables.v).toBe('02')

    run(box, 'data_setvariableto', { VALUE: false }, { VARIABLE: 'v' })
    expect(run(box, 'data_variable', {}, { VARIABLE: 'v' })).toBe(false)
    run(box, 'data_changevariableby', { VALUE: '3' }, { VARIABLE: 'v' })
    expect(box.target.variables.v).toBe(3)
    run(box, 'data_setvariableto', { VALUE: '02' }, { VARIABLE: 'v' })
    run(box, 'data_changevariableby', { VALUE: 'cat' }, { VARIABLE: 'v' })
    // "02" casts to 2 and "cat" casts to 0, so the stored value becomes the number 2.
    expect(box.target.variables.v).toBe(2)
    run(box, 'data_setvariableto', { VALUE: 'cat' }, { VARIABLE: 'v' })
    run(box, 'data_changevariableby', { VALUE: 'cat' }, { VARIABLE: 'v' })
    expect(box.target.variables.v).toBe(0)
  })

  it('D02 · scope', () => {
    const original = makeTarget({
      id: 'orig',
      variables: { 'v-local': 1, 'score-local': 1, same: 1 },
      lists: { 'l-local': ['a'] },
    })
    const clone = makeTarget({
      id: 'clone',
      isClone: true,
      variables: { 'v-local': 1, 'score-local': 1 },
      lists: { 'l-local': ['a'] },
    })
    expect(clone.lists['l-local']).not.toBe(original.lists['l-local'])
    const bystander = makeTarget({ id: 'other', variables: {}, lists: {} })
    const globalList = ['g']
    const { stage, call } = worldOf(
      [original, clone, bystander],
      { g: 10, 'score-global': 5, same: 9 },
      { 'g-list': globalList },
    )

    call('data_changevariableby', clone, { VALUE: 4 }, { VARIABLE: 'v-local' })
    expect(clone.variables['v-local']).toBe(5)
    expect(original.variables['v-local']).toBe(1)

    call('data_changevariableby', clone, { VALUE: 1 }, { VARIABLE: 'g' })
    expect(stage.variables.g).toBe(11)
    expect(call('data_variable', original, {}, { VARIABLE: 'g' })).toBe(11)
    expect(call('data_variable', bystander, {}, { VARIABLE: 'g' })).toBe(11)

    call('data_addtolist', clone, { ITEM: 'z' }, { LIST: 'l-local' })
    expect(clone.lists['l-local']).toEqual(['a', 'z'])
    expect(original.lists['l-local']).toEqual(['a'])

    call('data_addtolist', clone, { ITEM: 'z' }, { LIST: 'g-list' })
    expect(globalList).toEqual(['g', 'z'])
    expect(stage.lists['g-list']).toBe(globalList)
    expect(call('data_listcontents', original, {}, { LIST: 'g-list' })).toBe('gz')

    // Same display name, distinct ids: neither write reaches the other slot.
    expect(call('data_variable', original, {}, { VARIABLE: 'score-local' })).toBe(1)
    expect(call('data_variable', original, {}, { VARIABLE: 'score-global' })).toBe(5)
    call('data_setvariableto', original, { VALUE: 8 }, { VARIABLE: 'score-local' })
    expect(stage.variables['score-global']).toBe(5)

    // The same id on the target hides the stage value.
    expect(call('data_variable', original, {}, { VARIABLE: 'same' })).toBe(1)
    call('data_setvariableto', original, { VALUE: 3 }, { VARIABLE: 'same' })
    expect(original.variables.same).toBe(3)
    expect(stage.variables.same).toBe(9)
    expect(call('data_variable', bystander, {}, { VARIABLE: 'same' })).toBe(9)

    call('data_setvariableto', stage, { VALUE: 4 }, { VARIABLE: 'g' })
    expect(call('data_variable', stage, {}, { VARIABLE: 'g' })).toBe(4)
  })

  it('D03 · indexing', () => {
    const items = ['a', 'b', 'c']
    const box = harness({ lists: { L: items } })
    const at = (index: Value) => run(box, 'data_itemoflist', { INDEX: index }, { LIST: 'L' })
    expect(at(1.9)).toBe('a')
    expect(at(0)).toBe('')
    expect(at(4)).toBe('')
    expect(at('2')).toBe('b')
    expect(at(-1)).toBe('')

    run(box, 'data_replaceitemoflist', { INDEX: 0, ITEM: 'x' }, { LIST: 'L' })
    expect(items).toEqual(['a', 'b', 'c'])
    run(box, 'data_deleteoflist', { INDEX: 0 }, { LIST: 'L' })
    expect(items).toEqual(['a', 'b', 'c'])
    run(box, 'data_insertatlist', { INDEX: 0, ITEM: 'x' }, { LIST: 'L' })
    expect(items).toEqual(['a', 'b', 'c'])
    run(box, 'data_deleteoflist', { INDEX: 4 }, { LIST: 'L' })
    run(box, 'data_replaceitemoflist', { INDEX: 4, ITEM: 'x' }, { LIST: 'L' })
    expect(items).toEqual(['a', 'b', 'c'])

    run(box, 'data_deleteoflist', { INDEX: 1.9 }, { LIST: 'L' })
    expect(items).toEqual(['b', 'c'])
    run(box, 'data_insertatlist', { INDEX: 1.2, ITEM: 'a' }, { LIST: 'L' })
    expect(items).toEqual(['a', 'b', 'c'])
    run(box, 'data_replaceitemoflist', { INDEX: 2.8, ITEM: 'B' }, { LIST: 'L' })
    expect(items).toEqual(['a', 'B', 'c'])
  })

  it('D04 · special index names', () => {
    const items = ['a', 'b']
    let draws = 0
    const box = harness({
      lists: { L: items },
      random: () => {
        draws++
        return 0
      },
    })
    expect(run(box, 'data_itemoflist', { INDEX: 'last' }, { LIST: 'L' })).toBe('b')
    expect(run(box, 'data_itemoflist', { INDEX: 'LAST' }, { LIST: 'L' })).toBe('')
    expect(run(box, 'data_itemoflist', { INDEX: 'all' }, { LIST: 'L' })).toBe('')
    expect(draws).toBe(0)

    expect(run(box, 'data_itemoflist', { INDEX: 'random' }, { LIST: 'L' })).toBe('a')
    expect(run(box, 'data_itemoflist', { INDEX: 'any' }, { LIST: 'L' })).toBe('a')
    expect(draws).toBe(2)

    run(box, 'data_deleteoflist', { INDEX: 'all' }, { LIST: 'L' })
    expect(items).toEqual([])
    expect(box.target.lists.L).toBe(items)

    const again = ['a', 'b']
    box.target.lists.L = again
    run(box, 'data_deletealloflist', {}, { LIST: 'L' })
    expect(again).toEqual([])
    expect(box.target.lists.L).toBe(again)
  })

  it('D05 · empty list', () => {
    const items: Value[] = []
    let draws = 0
    const box = harness({
      lists: { L: items },
      random: () => {
        draws++
        return 0.4
      },
    })
    expect(run(box, 'data_itemoflist', { INDEX: 'last' }, { LIST: 'L' })).toBe('')
    expect(run(box, 'data_itemoflist', { INDEX: 'random' }, { LIST: 'L' })).toBe('')
    expect(run(box, 'data_itemoflist', { INDEX: 'any' }, { LIST: 'L' })).toBe('')
    expect(draws).toBe(0)
    run(box, 'data_deleteoflist', { INDEX: 'last' }, { LIST: 'L' })
    run(box, 'data_replaceitemoflist', { INDEX: 'last', ITEM: 'x' }, { LIST: 'L' })
    expect(items).toEqual([])

    run(box, 'data_insertatlist', { INDEX: 'last', ITEM: 'x' }, { LIST: 'L' })
    expect(items).toEqual(['x'])

    const pair = ['a', 'b']
    box.target.lists.L = pair
    run(box, 'data_insertatlist', { INDEX: 'last', ITEM: 'z' }, { LIST: 'L' })
    expect(pair).toEqual(['a', 'b', 'z'])
    // Insert at length + 1 appends. Insert one past that is a no-op.
    run(box, 'data_insertatlist', { INDEX: 5, ITEM: 'no' }, { LIST: 'L' })
    expect(pair).toEqual(['a', 'b', 'z'])
    run(box, 'data_insertatlist', { INDEX: 4, ITEM: 'tail' }, { LIST: 'L' })
    expect(pair).toEqual(['a', 'b', 'z', 'tail'])

    const empty: Value[] = []
    box.target.lists.L = empty
    run(box, 'data_insertatlist', { INDEX: 'random', ITEM: 'r' }, { LIST: 'L' })
    expect(empty).toEqual(['r'])
    expect(draws).toBe(1)
  })

  it('D06 · search/coercion', () => {
    const items: Value[] = [123, '123', 'ABC']
    const box = harness({ lists: { L: items } })
    expect(run(box, 'data_itemnumoflist', { ITEM: '123' }, { LIST: 'L' })).toBe(1)
    expect(run(box, 'data_listcontainsitem', { ITEM: 'abc' }, { LIST: 'L' })).toBe(true)
    expect(run(box, 'data_itemnumoflist', { ITEM: 'missing' }, { LIST: 'L' })).toBe(0)
    expect(run(box, 'data_listcontainsitem', { ITEM: 'missing' }, { LIST: 'L' })).toBe(false)
    expect(run(box, 'data_itemnumoflist', { ITEM: 'ABC' }, { LIST: 'L' })).toBe(3)
    expect(run(box, 'data_listcontainsitem', { ITEM: 123 }, { LIST: 'L' })).toBe(true)

    const mixed: Value[] = [4, 7, 123, '123', 9]
    box.target.lists.L = mixed
    expect(run(box, 'data_itemnumoflist', { ITEM: '123' }, { LIST: 'L' })).toBe(3)
    expect(run(box, 'data_listcontainsitem', { ITEM: '123' }, { LIST: 'L' })).toBe(true)

    run(box, 'data_replaceitemoflist', { INDEX: 1, ITEM: '02' }, { LIST: 'L' })
    expect(mixed[0]).toBe('02')
    expect(run(box, 'data_itemnumoflist', { ITEM: 2 }, { LIST: 'L' })).toBe(1)
    expect(run(box, 'data_listcontainsitem', { ITEM: NaN }, { LIST: 'L' })).toBe(false)
    mixed.push(NaN)
    expect(run(box, 'data_listcontainsitem', { ITEM: NaN }, { LIST: 'L' })).toBe(true)
    expect(run(box, 'data_itemnumoflist', { ITEM: NaN }, { LIST: 'L' })).toBe(mixed.length)
  })

  it('D07 · list reporter', () => {
    const box = harness({ lists: { L: [] } })
    const text = () => run(box, 'data_listcontents', {}, { LIST: 'L' })
    box.target.lists.L = ['a', 'b']
    expect(text()).toBe('ab')
    box.target.lists.L = [1, 2]
    expect(text()).toBe('1 2')
    box.target.lists.L = ['a', 'bc']
    expect(text()).toBe('a bc')
    box.target.lists.L = []
    expect(text()).toBe('')
    box.target.lists.L = ['a', '']
    expect(text()).toBe('a ')
    box.target.lists.L = [true, false]
    expect(text()).toBe('true false')
    box.target.lists.L = ['é', 'é']
    expect(text()).toBe('éé')
    box.target.lists.L = ['😀', '😀']
    expect(text()).toBe('😀 😀')
    box.target.lists.L = ['a']
    expect(text()).toBe('a')
  })

  it('D08 · capacity', () => {
    const items = new Array<Value>(LIST_ITEM_LIMIT).fill('x')
    items[0] = 'head'
    items[LIST_ITEM_LIMIT - 1] = 'tail'
    const box = harness({ lists: { L: items } })
    run(box, 'data_addtolist', { ITEM: 'more' }, { LIST: 'L' })
    expect(items.length).toBe(LIST_ITEM_LIMIT)
    expect(items[0]).toBe('head')
    expect(items[items.length - 1]).toBe('tail')
    expect(box.target.lists.L).toBe(items)

    const room = new Array<Value>(LIST_ITEM_LIMIT - 1).fill('x')
    box.target.lists.L = room
    run(box, 'data_addtolist', { ITEM: 'y' }, { LIST: 'L' })
    expect(room.length).toBe(LIST_ITEM_LIMIT)
    expect(room[room.length - 1]).toBe('y')
    run(box, 'data_addtolist', { ITEM: 'z' }, { LIST: 'L' })
    expect(room.length).toBe(LIST_ITEM_LIMIT)
    expect(room[room.length - 1]).toBe('y')
  })

  it('D09 · insert at capacity', () => {
    const items = new Array<Value>(LIST_ITEM_LIMIT).fill('x')
    items[0] = 'head'
    items[LIST_ITEM_LIMIT - 2] = 'near'
    items[LIST_ITEM_LIMIT - 1] = 'tail'
    const box = harness({ lists: { L: items } })
    run(box, 'data_insertatlist', { INDEX: 1, ITEM: 'NEW' }, { LIST: 'L' })
    expect(items.length).toBe(LIST_ITEM_LIMIT)
    expect(items[0]).toBe('NEW')
    expect(items[1]).toBe('head')
    expect(items[items.length - 1]).toBe('near')
    expect(box.target.lists.L).toBe(items)

    const full = new Array<Value>(LIST_ITEM_LIMIT).fill('x')
    full[0] = 'head'
    full[LIST_ITEM_LIMIT - 2] = 'near'
    full[LIST_ITEM_LIMIT - 1] = 'tail'
    box.target.lists.L = full
    run(box, 'data_insertatlist', { INDEX: LIST_ITEM_LIMIT + 1, ITEM: 'NO' }, { LIST: 'L' })
    expect(full.length).toBe(LIST_ITEM_LIMIT)
    expect(full[0]).toBe('head')
    expect(full[full.length - 1]).toBe('tail')
    expect(full.includes('NO')).toBe(false)

    run(box, 'data_insertatlist', { INDEX: LIST_ITEM_LIMIT, ITEM: 'MID' }, { LIST: 'L' })
    expect(full.length).toBe(LIST_ITEM_LIMIT)
    expect(full[full.length - 1]).toBe('MID')
    expect(full[full.length - 2]).toBe('near')
    expect(full[0]).toBe('head')
  })

  it('D10 · mutations do not reset on flag', () => {
    const originalList = ['x']
    const original = makeTarget({ id: 'orig', variables: { v: 'kept' }, lists: { L: originalList } })
    const cloneList = originalList.slice()
    const clone = makeTarget({ id: 'clone', isClone: true, variables: { v: 'kept' }, lists: { L: cloneList } })
    const { world, call } = worldOf([original, clone])

    expect(call('data_listcontents', original, {}, { LIST: 'L' })).toBe('x')
    expect(dataPrimitives.event_whenflagclicked).toBeUndefined()
    // No data block clears a target because the flag was clicked.
    expect(original.lists.L).toEqual(['x'])
    expect(original.variables.v).toBe('kept')

    call('data_addtolist', clone, { ITEM: 'only-clone' }, { LIST: 'L' })
    expect(clone.lists.L).toEqual(['x', 'only-clone'])
    expect(original.lists.L).toEqual(['x'])

    const index = world.targets.indexOf(clone)
    world.targets.splice(index, 1)
    expect(world.targets).not.toContain(clone)
    expect(original.lists.L).toBe(originalList)
    expect(original.lists.L).toEqual(['x'])
    expect(call('data_variable', original, {}, { VARIABLE: 'v' })).toBe('kept')
  })

  it('leaves unknown ids unset and treats show/hide as no-ops', () => {
    const box = harness({ variables: { v: 'stay' }, lists: { L: ['a'] } })
    expect(run(box, 'data_variable', {}, { VARIABLE: 'missing' })).toBe(0)
    expect(box.target.variables).not.toHaveProperty('missing')
    expect(box.stage.variables).not.toHaveProperty('missing')
    run(box, 'data_setvariableto', { VALUE: 5 }, { VARIABLE: 'missing' })
    run(box, 'data_changevariableby', { VALUE: 1 }, { VARIABLE: 'missing' })
    expect(box.target.variables).not.toHaveProperty('missing')
    expect(run(box, 'data_variable', {}, { VARIABLE: 'missing' })).toBe(0)

    expect(run(box, 'data_listcontents', {}, { LIST: 'missing' })).toBe('')
    expect(run(box, 'data_lengthoflist', {}, { LIST: 'missing' })).toBe(0)
    expect(run(box, 'data_itemoflist', { INDEX: 1 }, { LIST: 'missing' })).toBe('')
    expect(run(box, 'data_itemnumoflist', { ITEM: 'a' }, { LIST: 'missing' })).toBe(0)
    expect(run(box, 'data_listcontainsitem', { ITEM: 'a' }, { LIST: 'missing' })).toBe(false)
    run(box, 'data_addtolist', { ITEM: 'z' }, { LIST: 'missing' })
    run(box, 'data_deletealloflist', {}, { LIST: 'missing' })
    expect(box.target.lists).not.toHaveProperty('missing')
    expect(box.target.lists.L).toEqual(['a'])

    run(box, 'data_showvariable', {}, { VARIABLE: 'v' })
    run(box, 'data_hidevariable', {}, { VARIABLE: 'v' })
    run(box, 'data_showlist', {}, { LIST: 'L' })
    run(box, 'data_hidelist', {}, { LIST: 'L' })
    expect(box.target.variables.v).toBe('stay')
    expect(box.target.lists.L).toEqual(['a'])
  })

  it('stores list items unchanged and reports length', () => {
    const items: Value[] = []
    const box = harness({ lists: { L: items } })
    run(box, 'data_addtolist', { ITEM: false }, { LIST: 'L' })
    run(box, 'data_addtolist', { ITEM: 0 }, { LIST: 'L' })
    run(box, 'data_addtolist', { ITEM: '' }, { LIST: 'L' })
    expect(items).toEqual([false, 0, ''])
    expect(run(box, 'data_lengthoflist', {}, { LIST: 'L' })).toBe(3)
    expect(run(box, 'data_itemoflist', { INDEX: 1 }, { LIST: 'L' })).toBe(false)
    run(box, 'data_deleteoflist', { INDEX: 'last' }, { LIST: 'L' })
    expect(items).toEqual([false, 0])
    run(box, 'data_replaceitemoflist', { INDEX: 'last', ITEM: true }, { LIST: 'L' })
    expect(items).toEqual([false, true])
  })
})
