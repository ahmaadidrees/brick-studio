import { describe, expect, it } from 'vitest'
import { CLONE_LIMIT } from '../contracts'
import type { Target } from '../contracts'
import {
  block,
  broadcastScript,
  cloneScript,
  defaultCostume,
  extraBrick,
  flagScript,
  lit,
  makeHarnessRuntime,
  script,
  stepN,
  stmt,
} from './harness'

const create = (option = '_myself_') => stmt('control_create_clone_of', {}, { CLONE_OPTION: option })
const log = (item: string, list = 'log') => stmt('data_addtolist', { ITEM: lit(item) }, { LIST: list })
const setVar = (id: string, value: number | string) => stmt('data_setvariableto', { VALUE: lit(value) }, { VARIABLE: id })
const original = (rt: ReturnType<typeof makeHarnessRuntime>): Target => rt.world.targets.find((t) => !t.isClone)!
const clones = (rt: ReturnType<typeof makeHarnessRuntime>): Target[] => rt.world.targets.filter((t) => t.isClone)

describe('§1.3 Clone inheritance and lifecycle', () => {
  it('C01 · State snapshot', () => {
    // Source at (12,-4), dir -90, size 75, costume 2, ghost 20, local HP 3 -> clone matches.
    // Changing clone HP must not change source HP. Bubble, volume, sound effects are not copied.
    const rt = makeHarnessRuntime({
      x: 12,
      y: -4,
      direction: -90,
      size: 75,
      costumes: [defaultCostume('c1'), defaultCostume('c2')],
      costumeIndex: 1,
      variables: [{ id: 'hp', name: 'hp', value: 3 }],
      lists: [{ id: 'local_l', name: 'local_l', value: ['init'] }],
      scripts: [flagScript([stmt('looks_say', { MESSAGE: lit('hello') }), create()])],
    })
    rt.greenFlag()
    const orig = original(rt)
    orig.effects.ghost = 20
    orig.volume = 80
    orig.soundEffects.pitch = 10
    orig.edgeHatState['edge1'] = true
    rt.step()

    expect(rt.world.targets.length).toBe(2)
    const clone = clones(rt)[0]
    expect(clone.x).toBe(12)
    expect(clone.y).toBe(-4)
    expect(clone.direction).toBe(-90)
    expect(clone.size).toBe(75)
    expect(clone.costumeIndex).toBe(1)
    expect(clone.effects.ghost).toBe(20)
    expect(clone.visible).toBe(true)
    expect(clone.rotationStyle).toBe(orig.rotationStyle)
    expect(clone.variables.hp).toBe(3)
    expect(clone.lists.local_l).toEqual(['init'])
    expect(clone.edgeHatState['edge1']).toBe(true)
    // Not inherited.
    expect(clone.bubble).toBeNull()
    expect(clone.volume).toBe(100)
    expect(clone.soundEffects.pitch).toBe(0)

    // Isolation: changing the clone's HP leaves the source's HP alone.
    clone.variables.hp = 99
    expect(orig.variables.hp).toBe(3)
  })

  it('C02 · Shared definition, separate execution', () => {
    // The source is halfway through a loop when it clones: the clone must not start halfway through
    // that loop (it never runs the flag script); it runs only its own start-as-clone script.
    const rt = makeHarnessRuntime({
      variables: [{ id: 'n', name: 'n', value: 0 }],
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript(
          [
            stmt('control_repeat', { TIMES: lit(4) }, {}, [
              [
                stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'n' }),
                log('L'),
                stmt('control_if', { CONDITION: block('operator_equals', { OPERAND1: block('data_variable', {}, { VARIABLE: 'n' }), OPERAND2: lit(2) }) }, {}, [[create()]]),
                stmt('control_wait', { DURATION: lit(0) }),
              ],
            ]),
          ],
          'flag_loop',
        ),
        cloneScript([log('C')], 'clone_start'),
      ],
    })
    rt.greenFlag()
    stepN(rt, 2)
    // Halfway: original has gone around twice, the clone exists with the copied n = 2.
    const clone = clones(rt)[0]
    expect(clone.variables.n).toBe(2)
    stepN(rt, 10)
    // 4 iterations by the original only; exactly one 'C' from the clone's own start script.
    expect(rt.world.stage.lists.log).toEqual(['L', 'L', 'C', 'L', 'L'])
    // The clone never ran the flag script (its n was never incremented).
    expect(clone.variables.n).toBe(2)
    expect(rt.threads().some((t) => t.target === clone)).toBe(false)
  })

  it('C03 · Which hats run', () => {
    // Two clones, then broadcast M: the original and both clones each receive M.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript([create(), create(), stmt('control_wait', { DURATION: lit(0) }), stmt('event_broadcast', {}, { BROADCAST_OPTION: 'M' })], 'flag'),
        broadcastScript('M', [log('got')]),
      ],
    })
    rt.greenFlag()
    stepN(rt, 3)
    expect(clones(rt).length).toBe(2)
    expect(rt.world.stage.lists.log).toEqual(['got', 'got', 'got'])

    // Flag: only originals remain to receive it (clones are deleted first).
    rt.greenFlag()
    expect(rt.world.targets.length).toBe(1)
    const flagThreads = rt.threads().filter((t) => !t.done)
    expect(flagThreads.length).toBe(1)
    expect(flagThreads.every((t) => !t.target.isClone)).toBe(true)
  })

  it('C04 · Layer', () => {
    // Layer sequence back->front [A,B,C]; create clone of B -> clone immediately behind B.
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([create('B')], 'flag'),
        broadcastScript('ping', [log('A')], 'recvA'),
      ],
      extraBricks: [
        extraBrick('b', 'B', [broadcastScript('ping', [log('B')], 'recvB')]),
        extraBrick('c', 'C', [broadcastScript('ping', [log('C')], 'recvC')]),
      ],
      extraCopies: [
        { id: 'copyB', brickId: 'b', x: 0, y: 0 },
        { id: 'copyC', brickId: 'c', x: 0, y: 0 },
      ],
      stageLists: [{ id: 'log', name: 'log', value: [] }],
    })
    expect(rt.world.targets.map((t) => t.brickId)).toEqual(['sprite1', 'b', 'c'])
    rt.greenFlag()
    rt.step()
    // Draw order (back -> front): A, clone-of-B, B, C.
    expect(rt.world.targets.map((t) => `${t.brickId}${t.isClone ? '*' : ''}`)).toEqual(['sprite1', 'b*', 'b', 'c'])
    // Executable order: hats start front -> back: C, B, clone-of-B, A.
    rt.world.stage.lists.log = []
    rt.broadcast('ping')
    rt.step()
    expect(rt.world.stage.lists.log).toEqual(['C', 'B', 'B', 'A'])
  })

  it('C05 · Global limit', () => {
    // 300 clones across two bricks A and B; the next create-clone does nothing.
    // Delete one -> one further clone can be created.
    const maker = (id: string) => flagScript([stmt('control_repeat', { TIMES: lit(CLONE_LIMIT / 2) }, {}, [[create()]])], id)
    const rt = makeHarnessRuntime({
      scripts: [maker('flagA'), broadcastScript('more', [create()], 'moreA')],
      extraBricks: [extraBrick('b', 'B', [maker('flagB')])],
      extraCopies: [{ id: 'copyB', brickId: 'b', x: 0, y: 0 }],
    })
    rt.turbo = true
    rt.opBudget = 1_000_000
    rt.greenFlag()
    stepN(rt, 5)
    expect(rt.world.cloneCount).toBe(CLONE_LIMIT)
    expect(clones(rt).filter((t) => t.brickId === 'sprite1').length).toBe(CLONE_LIMIT / 2)
    expect(clones(rt).filter((t) => t.brickId === 'b').length).toBe(CLONE_LIMIT / 2)

    rt.broadcast('more')
    stepN(rt, 2)
    expect(rt.world.cloneCount).toBe(CLONE_LIMIT)
    expect(clones(rt).length).toBe(CLONE_LIMIT)

    // Delete one (through the real delete-this-clone block), then one more is allowed.
    rt.startStack(clones(rt)[0], script('control_start_as_clone', [stmt('control_delete_this_clone')], {}, {}, 'deleter'))
    rt.step()
    expect(rt.world.cloneCount).toBe(CLONE_LIMIT - 1)
    rt.broadcast('more')
    stepN(rt, 2)
    expect(rt.world.cloneCount).toBe(CLONE_LIMIT)
    expect(clones(rt).length).toBe(CLONE_LIMIT)
  })

  it('C06 · Delete original', () => {
    // delete this clone on an original is a no-op; the next block still runs.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [flagScript([stmt('control_delete_this_clone'), log('alive')])],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets.length).toBe(1)
    expect(rt.world.targets[0].isClone).toBe(false)
    expect(rt.world.stage.lists.log).toEqual(['alive'])
  })

  it('C07 · Delete runtime clone', () => {
    // Clone with k=1: delete this clone; log impossible -> no 'impossible' entry; the k=2 sibling survives.
    const rt = makeHarnessRuntime({
      variables: [{ id: 'k', name: 'k', value: 0 }],
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript([setVar('k', 1), create(), setVar('k', 2), create()]),
        cloneScript([
          stmt('control_if', { CONDITION: block('operator_equals', { OPERAND1: block('data_variable', {}, { VARIABLE: 'k' }), OPERAND2: lit(1) }) }, {}, [
            [stmt('control_delete_this_clone'), log('impossible')],
          ]),
          stmt('control_wait', { DURATION: lit(0) }),
          log('survivor'),
        ]),
      ],
    })
    rt.greenFlag()
    stepN(rt, 3)
    expect(rt.world.cloneCount).toBe(1)
    expect(clones(rt)[0].variables.k).toBe(2)
    expect(rt.world.stage.lists.log).toEqual(['survivor'])
    // The deleted clone's thread is gone too.
    expect(rt.threads().every((t) => !t.target.isClone || t.target === clones(rt)[0])).toBe(true)
  })

  it('C08 · Stop all', () => {
    // Original v=7 and clone v=9; stop all -> original exists with v=7; clone absent; its queued
    // continuation never runs.
    const rt = makeHarnessRuntime({
      variables: [{ id: 'v', name: 'v', value: 0 }],
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript([setVar('v', 7), create(), stmt('control_wait', { DURATION: lit(0.1) }), stmt('control_stop', {}, { STOP_OPTION: 'all' })]),
        cloneScript([setVar('v', 9), stmt('control_wait', { DURATION: lit(1) }), log('clone-continued')]),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(clones(rt)[0].variables.v).toBe(9)
    expect(original(rt).variables.v).toBe(7)
    stepN(rt, 10) // the original's wait ends and it runs `stop all`
    expect(rt.world.cloneCount).toBe(0)
    expect(rt.world.targets.length).toBe(1)
    expect(original(rt).variables.v).toBe(7)
    expect(rt.threads().length).toBe(0)
    stepN(rt, 60)
    expect(rt.world.stage.lists.log).toEqual([])
  })

  it('C09 · Clone of clone', () => {
    // Original HP 10; clone HP 3; clone creates myself -> grandchild HP 3.
    // Clone creates the named original -> child HP 10.
    const rt = makeHarnessRuntime({
      variables: [{ id: 'hp', name: 'hp', value: 10 }],
      scripts: [flagScript([create()])],
    })
    rt.greenFlag()
    rt.step()
    const clone = clones(rt)[0]
    clone.variables.hp = 3
    rt.startStack(clone, script('control_start_as_clone', [create('_myself_')], {}, {}, 'mk_self'))
    rt.step()
    const grandchild = clones(rt).find((t) => t !== clone)!
    expect(grandchild.variables.hp).toBe(3)

    rt.startStack(clone, script('control_start_as_clone', [create('Sprite1')], {}, {}, 'mk_named'))
    rt.step()
    const child = clones(rt).find((t) => t !== clone && t !== grandchild)!
    expect(child.variables.hp).toBe(10)
    expect(rt.world.cloneCount).toBe(3)
  })

  it('C10 · Other scripts in sprite', () => {
    // Clone A (k=1) has 2 threads; clone B (k=2) has 1... A stops other scripts in sprite: A's other
    // thread stops, B's thread keeps going.
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'k', name: 'k', value: 0 },
        { id: 'n', name: 'n', value: 0 },
      ],
      scripts: [
        flagScript([setVar('k', 1), create(), setVar('k', 2), create()]),
        cloneScript(
          [stmt('control_forever', {}, {}, [[stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'n' }), stmt('control_wait', { DURATION: lit(0) })]])],
          'counter',
        ),
        cloneScript(
          [
            stmt('control_if', { CONDITION: block('operator_equals', { OPERAND1: block('data_variable', {}, { VARIABLE: 'k' }), OPERAND2: lit(1) }) }, {}, [
              [stmt('control_stop', {}, { STOP_OPTION: 'other scripts in sprite' })],
            ]),
          ],
          'stopper',
        ),
      ],
    })
    rt.greenFlag()
    rt.step()
    const [a, b] = [clones(rt).find((t) => t.variables.k === 1)!, clones(rt).find((t) => t.variables.k === 2)!]
    const nA = a.variables.n
    stepN(rt, 5)
    expect(a.variables.n).toBe(nA) // A's counter thread was stopped
    expect(b.variables.n).toBeGreaterThanOrEqual(5) // B's counter thread is still running
    expect(rt.threads().filter((t) => t.target === a && !t.done).length).toBe(0)
    expect(rt.threads().filter((t) => t.target === b && !t.done).length).toBe(1)
    expect(rt.world.cloneCount).toBe(2)
  })

  it('C11 · Local lists', () => {
    // Local L=[1]; clone adds 2 -> source L stays [1]. Global G=[1]; clone adds 2 -> everyone sees [1,2].
    const rt = makeHarnessRuntime({
      lists: [{ id: 'L', name: 'L', value: [1] }],
      stageLists: [{ id: 'G', name: 'G', value: [1] }],
      scripts: [flagScript([create()]), cloneScript([log(2 as unknown as string, 'L'), log(2 as unknown as string, 'G')])],
    })
    rt.greenFlag()
    stepN(rt, 2)
    const clone = clones(rt)[0]
    expect(clone.lists.L).toEqual([1, 2])
    expect(original(rt).lists.L).toEqual([1])
    expect(rt.world.stage.lists.G).toEqual([1, 2])
    // The global list is stage-shared, not copied into either sprite.
    expect(original(rt).lists.G).toBeUndefined()
    expect(clone.lists.G).toBeUndefined()
  })

  it('C12 · Uninherited assumptions', () => {
    // Create a clone while the creator is speaking, asking, and inside a procedure call: the clone
    // copies no bubble, no pending ask, and no call stack (it does not resume after the create-clone call).
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      procedures: [{ proccode: 'mk', argumentNames: [], warp: false, body: [create(), log('after-create-in-proc')] }],
      scripts: [
        flagScript([stmt('looks_say', { MESSAGE: lit('hello') }), stmt('sensing_askandwait', { QUESTION: lit('q?') })], 'asker'),
        broadcastScript('make', [stmt('procedures_call', {}, {}, undefined, { proccode: 'mk' })], 'maker'),
      ],
    })
    rt.greenFlag()
    rt.step()
    const orig = original(rt)
    expect(orig.bubble).not.toBeNull()
    expect(rt.world.askQueue.length).toBe(1)
    rt.broadcast('make')
    stepN(rt, 3)
    const clone = clones(rt)[0]
    expect(clone).toBeDefined()
    expect(clone.bubble).toBeNull()
    expect(rt.threads().some((t) => t.target === clone)).toBe(false)
    expect(rt.world.askQueue.length).toBe(1)
    expect(rt.world.askQueue[0].targetId).toBe(orig.id)
    expect(rt.world.stage.lists.log).toEqual(['after-create-in-proc'])
  })

  it('extra · the Stage cannot be cloned', () => {
    const rt = makeHarnessRuntime({ stageScripts: [flagScript([create()])] })
    rt.greenFlag()
    rt.step()
    expect(rt.world.cloneCount).toBe(0)
  })
})
