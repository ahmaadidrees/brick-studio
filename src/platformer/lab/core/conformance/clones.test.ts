import { describe, expect, it } from 'vitest'
import { CLONE_LIMIT } from '../contracts'
import {
  block,
  broadcastScript,
  cloneScript,
  defaultCostume,
  flagScript,
  lit,
  makeHarnessDesign,
  makeHarnessRuntime,
  stmt,
} from './harness'

describe('§1.3 Clones', () => {
  it('C01 · Clone inheritance snapshot', () => {
    // Clone snapshot copies properties, local variables/lists, but not bubbles or threads
    const rt = makeHarnessRuntime({
      x: 42,
      y: -50,
      direction: 45,
      size: 150,
      visible: true,
      costumes: [defaultCostume('c1'), defaultCostume('c2')],
      costumeIndex: 1,
      variables: [{ id: 'local_v', name: 'local_v', value: 100 }],
      lists: [{ id: 'local_l', name: 'local_l', value: ['init'] }],
      scripts: [
        flagScript([
          stmt('looks_say', { MESSAGE: lit('hello') }),
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
      ],
    })

    rt.greenFlag()
    const orig = rt.world.targets[0]
    orig.effects.ghost = 25
    orig.volume = 80
    orig.soundEffects.pitch = 10
    orig.edgeHatState['edge1'] = true

    rt.step()

    // 2 targets: clone inserted behind orig, so [clone, orig]
    expect(rt.world.targets.length).toBe(2)
    const clone = rt.world.targets[0]
    expect(clone.isClone).toBe(true)

    // Inherited values
    expect(clone.x).toBe(42)
    expect(clone.y).toBe(-50)
    expect(clone.direction).toBe(45)
    expect(clone.size).toBe(150)
    expect(clone.costumeIndex).toBe(1)
    expect(clone.effects.ghost).toBe(25)
    expect(clone.volume).toBe(100)
    expect(clone.soundEffects.pitch).toBe(0)
    expect(clone.variables.local_v).toBe(100)
    expect(clone.lists.local_l).toEqual(['init'])
    expect(clone.edgeHatState['edge1']).toBe(true)

    // NOT inherited: speech bubble
    expect(clone.bubble).toBeNull()
  })

  it('C02 · Layer insertion', () => {
    // Clone is inserted immediately behind the creator in targets array
    const rt = makeHarnessRuntime({
      extraCopies: [{ id: 'copy2', brickId: 'sprite1', x: 10, y: 10 }],
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
      ],
    })

    // targets initially: [copy1, copy2]
    expect(rt.world.targets.map((t) => t.id)).toEqual(['copy1', 'copy2'])

    // copy2 creates clone
    const copy2 = rt.world.targets[1]
    const brick = rt.world.bricks['sprite1']
    rt.world.targets = [rt.world.targets[0], copy2] // copy2 is at index 1

    const cloneTarget = { ...copy2, id: 'clone_of_copy2', isClone: true }
    rt.addClone(cloneTarget, copy2)

    // Inserted at copy2's position: [copy1, clone_of_copy2, copy2]
    expect(rt.world.targets.map((t) => t.id)).toEqual(['copy1', 'clone_of_copy2', 'copy2'])
  })

  it('C03 · Clone limit', () => {
    // CLONE_LIMIT is 300; attempt 301 fails
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_repeat', { TIMES: lit(350) }, {}, [
            [stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' })],
          ]),
        ]),
      ],
    })
    rt.turbo = true
    rt.opBudget = 100_000
    rt.greenFlag()

    // Step until repeat completes
    for (let i = 0; i < 10; i++) rt.step()

    expect(rt.world.cloneCount).toBe(CLONE_LIMIT)
    expect(rt.world.targets.filter((t) => t.isClone).length).toBe(300)
  })

  it('C04 · Clone can clone', () => {
    // A clone can spawn clones
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
        cloneScript([
          stmt('control_if', {
            CONDITION: block('operator_equals', {
              OPERAND1: block('data_variable', {}, { VARIABLE: 'generation' }),
              OPERAND2: lit(0),
            }),
          }, {}, [
            [
              stmt('data_setvariableto', { VALUE: lit(1) }, { VARIABLE: 'generation' }),
              stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
            ],
          ]),
        ]),
      ],
      variables: [{ id: 'generation', name: 'generation', value: 0 }],
    })

    rt.greenFlag()
    rt.step() // orig clones -> gen 0 clone
    rt.step() // gen 0 clone clones -> gen 1 clone
    rt.step()

    expect(rt.world.cloneCount).toBe(2)
  })

  it('C05 · Clones receive broadcasts', () => {
    // Clones receive broadcasts and run broadcast hats
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
          stmt('event_broadcast', {}, { BROADCAST_OPTION: 'greet' }),
        ]),
        broadcastScript('greet', [
          stmt('data_addtolist', { ITEM: lit('greeted') }, { LIST: 'log' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    rt.step()

    // Both orig and clone received broadcast
    expect(rt.world.stage.lists.log).toEqual(['greeted', 'greeted'])
  })

  it('C06 · Delete this clone', () => {
    // control_delete_this_clone stops threads on that clone and removes it
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
        cloneScript([
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('control_delete_this_clone'),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.cloneCount).toBe(1)

    // Wait 35 ticks to complete wait(1) and delete
    for (let i = 0; i < 35; i++) rt.step()
    expect(rt.world.cloneCount).toBe(0)
    expect(rt.world.targets.every((t) => !t.isClone)).toBe(true)
  })

  it('C07 · Delete non-clone', () => {
    // Deleting a non-clone original sprite is a no-op
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_delete_this_clone'),
          stmt('motion_setx', { X: lit(99) }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets.length).toBe(1)
    expect(rt.world.targets[0].x).toBe(99)
  })

  it('C08 · Stop all clears clones', () => {
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.cloneCount).toBe(1)

    rt.stopAll()
    expect(rt.world.cloneCount).toBe(0)
    expect(rt.world.targets.length).toBe(1)
  })

  it('C09 · Green flag clears clones', () => {
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.cloneCount).toBe(1)

    rt.greenFlag()
    expect(rt.world.cloneCount).toBe(0)
  })

  it('C10 · Stage cannot clone', () => {
    // Trying to clone Stage is ignored
    const rt = makeHarnessRuntime({
      stageScripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.cloneCount).toBe(0)
  })

  it('C11 · Variable independence', () => {
    // Mutating a local variable on a clone does not mutate original or sister clones
    const rt = makeHarnessRuntime({
      variables: [{ id: 'val', name: 'val', value: 10 }],
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
        ]),
        cloneScript([
          stmt('data_setvariableto', { VALUE: lit(999) }, { VARIABLE: 'val' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    rt.step()

    const clone = rt.world.targets.find((t) => t.isClone)!
    const orig = rt.world.targets.find((t) => !t.isClone)!

    expect(clone.variables.val).toBe(999)
    expect(orig.variables.val).toBe(10)
  })

  it('C12 · Target name resolution', () => {
    // Named clone menu clones the original painted copy of that brick
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('control_create_clone_of', {}, { CLONE_OPTION: 'Sprite1' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.cloneCount).toBe(1)
  })
})
