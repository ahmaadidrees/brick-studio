import { describe, expect, it } from 'vitest'
import { LIST_ITEM_LIMIT } from '../data'
import {
  block,
  flagScript,
  lit,
  makeHarnessRuntime,
  stmt,
} from './harness'

describe('§1.8 Variables and list boundaries', () => {
  it('D01 · Set vs change', () => {
    // set stores reported value unchanged; change casts both existing and delta to number
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'v1', name: 'v1', value: '' },
        { id: 'v2', name: 'v2', value: '' },
      ],
      scripts: [
        flagScript([
          // set v1 to '02'
          stmt('data_setvariableto', { VALUE: lit('02') }, { VARIABLE: 'v1' }),
          // set v2 to 'cat', then change by 2
          stmt('data_setvariableto', { VALUE: lit('cat') }, { VARIABLE: 'v2' }),
          stmt('data_changevariableby', { VALUE: lit(2) }, { VARIABLE: 'v2' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.v1).toBe('02')
    expect(rt.world.targets[0].variables.v2).toBe(2)
  })

  it('D02 · Scope', () => {
    // Lookup target-local first, then stage-global
    const rt = makeHarnessRuntime({
      variables: [{ id: 'local_v', name: 'local_v', value: 10 }],
      stageVariables: [{ id: 'global_v', name: 'global_v', value: 100 }],
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
        {
          id: 'clone_s',
          hat: { opcode: 'control_start_as_clone', fields: {}, inputs: {} },
          body: [
            stmt('data_changevariableby', { VALUE: lit(5) }, { VARIABLE: 'local_v' }),
            stmt('data_changevariableby', { VALUE: lit(50) }, { VARIABLE: 'global_v' }),
          ],
        },
      ],
    })

    rt.greenFlag()
    rt.step()
    rt.step()

    const clone = rt.world.targets.find((t) => t.isClone)!
    const orig = rt.world.targets.find((t) => !t.isClone)!

    // Local variable modified on clone only
    expect(clone.variables.local_v).toBe(15)
    expect(orig.variables.local_v).toBe(10)

    // Global variable modified on stage
    expect(rt.world.stage.variables.global_v).toBe(150)
  })

  it('D03 · Indexing', () => {
    // 1-based and floored; out of range read -> ''; invalid replace -> no-op
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: ['a', 'b', 'c'] }],
      variables: [
        { id: 'r1', name: 'r1', value: '' },
        { id: 'r0', name: 'r0', value: 'x' },
        { id: 'r4', name: 'r4', value: 'x' },
      ],
      scripts: [
        flagScript([
          // item 1.9 -> 'a'
          stmt('data_setvariableto', {
            VALUE: block('data_itemoflist', { INDEX: lit(1.9) }, { LIST: 'L' }),
          }, { VARIABLE: 'r1' }),
          // item 0 -> ''
          stmt('data_setvariableto', {
            VALUE: block('data_itemoflist', { INDEX: lit(0) }, { LIST: 'L' }),
          }, { VARIABLE: 'r0' }),
          // item 4 -> ''
          stmt('data_setvariableto', {
            VALUE: block('data_itemoflist', { INDEX: lit(4) }, { LIST: 'L' }),
          }, { VARIABLE: 'r4' }),
          // replace item 0 -> no-op
          stmt('data_replaceitemoflist', { INDEX: lit(0), ITEM: lit('x') }, { LIST: 'L' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.r1).toBe('a')
    expect(rt.world.targets[0].variables.r0).toBe('')
    expect(rt.world.targets[0].variables.r4).toBe('')
    expect(rt.world.targets[0].lists.L).toEqual(['a', 'b', 'c'])
  })

  it('D04 · Special index names', () => {
    // Exact lowercase 'last', deleteall -> []
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: ['a', 'b'] }],
      variables: [
        { id: 'rLast', name: 'rLast', value: '' },
        { id: 'rLAST', name: 'rLAST', value: 'x' },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('data_itemoflist', { INDEX: lit('last') }, { LIST: 'L' }),
          }, { VARIABLE: 'rLast' }),
          stmt('data_setvariableto', {
            VALUE: block('data_itemoflist', { INDEX: lit('LAST') }, { LIST: 'L' }),
          }, { VARIABLE: 'rLAST' }),
          stmt('data_deletealloflist', {}, { LIST: 'L' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.rLast).toBe('b')
    expect(rt.world.targets[0].variables.rLAST).toBe('')
    expect(rt.world.targets[0].lists.L).toEqual([])
  })

  it('D05 · Empty list', () => {
    // item 'last' on empty list is ''; insert 'x' at 'last' on empty list gives ['x']
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: [] }],
      variables: [{ id: 'rLast', name: 'rLast', value: 'init' }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('data_itemoflist', { INDEX: lit('last') }, { LIST: 'L' }),
          }, { VARIABLE: 'rLast' }),
          stmt('data_insertatlist', { INDEX: lit('last'), ITEM: lit('x') }, { LIST: 'L' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.rLast).toBe('')
    expect(rt.world.targets[0].lists.L).toEqual(['x'])
  })

  it('D06 · Search/coercion', () => {
    // item number of matches Scratch equality; contains matches case-insensitively
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: [123, '123', 'ABC'] }],
      variables: [
        { id: 'idx123', name: 'idx123', value: 0 },
        { id: 'containsAbc', name: 'containsAbc', value: false },
        { id: 'idxMissing', name: 'idxMissing', value: 99 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('data_itemnumoflist', { ITEM: lit('123') }, { LIST: 'L' }),
          }, { VARIABLE: 'idx123' }),
          stmt('data_setvariableto', {
            VALUE: block('data_listcontainsitem', { ITEM: lit('abc') }, { LIST: 'L' }),
          }, { VARIABLE: 'containsAbc' }),
          stmt('data_setvariableto', {
            VALUE: block('data_itemnumoflist', { ITEM: lit('missing') }, { LIST: 'L' }),
          }, { VARIABLE: 'idxMissing' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.idx123).toBe(1)
    expect(rt.world.targets[0].variables.containsAbc).toBe(true)
    expect(rt.world.targets[0].variables.idxMissing).toBe(0)
  })

  it('D07 · List reporter', () => {
    // Single-char strings concatenate without spaces; otherwise separated by space
    const testCases = [
      { list: ['a', 'b'], expected: 'ab' },
      { list: [1, 2], expected: '1 2' },
      { list: ['a', 'bc'], expected: 'a bc' },
      { list: [], expected: '' },
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        lists: [{ id: 'L', name: 'L', value: tc.list }],
        variables: [{ id: 'res', name: 'res', value: '' }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('data_listcontents', {}, { LIST: 'L' }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('D08 · Capacity', () => {
    // Capacity limit LIST_ITEM_LIMIT = 200,000; adding beyond is ignored
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: [] }],
    })
    const list = rt.world.targets[0].lists.L
    // Seed list to capacity
    for (let i = 0; i < LIST_ITEM_LIMIT; i++) list.push('item')

    rt.world.bricks['sprite1'].program.scripts = [
      flagScript([
        stmt('data_addtolist', { ITEM: lit('overflow') }, { LIST: 'L' }),
      ]),
    ]

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].lists.L.length).toBe(LIST_ITEM_LIMIT)
    expect(rt.world.targets[0].lists.L[LIST_ITEM_LIMIT - 1]).toBe('item')
  })

  it('D09 · Insert at capacity', () => {
    // Insert at valid position <= capacity pops last element so length stays at limit
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: [] }],
    })
    const list = rt.world.targets[0].lists.L
    for (let i = 0; i < LIST_ITEM_LIMIT; i++) list.push(i)

    rt.world.bricks['sprite1'].program.scripts = [
      flagScript([
        stmt('data_insertatlist', { INDEX: lit(1), ITEM: lit('head') }, { LIST: 'L' }),
      ]),
    ]

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].lists.L.length).toBe(LIST_ITEM_LIMIT)
    expect(rt.world.targets[0].lists.L[0]).toBe('head')
  })

  it('D10 · Mutations do not reset on flag', () => {
    // Variables and list contents on original targets persist across greenFlag
    const rt = makeHarnessRuntime({
      variables: [{ id: 'v', name: 'v', value: 1 }],
      lists: [{ id: 'L', name: 'L', value: ['x'] }],
    })

    rt.world.targets[0].variables.v = 999
    rt.world.targets[0].lists.L.push('y')

    rt.greenFlag()

    expect(rt.world.targets[0].variables.v).toBe(999)
    expect(rt.world.targets[0].lists.L).toEqual(['x', 'y'])
  })
})
