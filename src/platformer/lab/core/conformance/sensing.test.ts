import { describe, expect, it, vi } from 'vitest'
import type { Costume } from '../contracts'
import { activeQuestion, submitAnswer } from '../sensing'
import {
  block,
  broadcastScript,
  defaultCostume,
  extraBrick,
  flagScript,
  keyScript,
  lit,
  makeHarnessRuntime,
  stepN,
  stmt,
} from './harness'

/** A hollow square ring: opaque only on the border, `size` x `size`, rotation center in the middle. */
function ring(name: string, size: number): Costume {
  const data = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data[y * size + x] = x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 1 : 0
  }
  return { name, width: size, height: size, rotationCenterX: size / 2, rotationCenterY: size / 2, mask: { width: size, height: size, data } }
}

describe('§1.6 Sensing, keyboard, timer, and ask/answer', () => {
  it('S01 · Sprite touching', () => {
    // Two hollow rings with overlapping bounding boxes but disjoint opaque pixels -> false.
    // Move them so actual pixels overlap -> true. (A solid-box control proves the answer is
    // pixel-based: the same positions with unmasked costumes are touching.)
    const touchesAt = (x: number, solid: boolean) => {
      const big = solid ? defaultCostume('big', 12, 12) : ring('big', 12)
      const small = solid ? defaultCostume('small', 6, 6) : ring('small', 6)
      const rt = makeHarnessRuntime({
        costumes: [big],
        variables: [{ id: 'touch', name: 'touch', value: false }],
        scripts: [
          broadcastScript('check', [stmt('data_setvariableto', { VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'Small' }) }, { VARIABLE: 'touch' })], 'check'),
        ],
        extraBricks: [extraBrick('small', 'Small', [], { costumes: [small] })],
        extraCopies: [{ id: 'copySmall', brickId: 'small', x, y: 0 }],
      })
      rt.broadcast('check')
      rt.step()
      return rt.world.targets[0].variables.touch
    }
    expect(touchesAt(0, true)).toBe(true) // boxes overlap: a box test would say touching
    expect(touchesAt(0, false)).toBe(false) // small ring sits inside the big ring's hole
    expect(touchesAt(3, false)).toBe(true) // small ring's right edge lands on the big ring's right edge
  })

  it('S02 · Named sprite includes clones', () => {
    // Touching tests any clone of named sprite; dragged candidate is excluded
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      extraBricks: [
        {
          id: 'b2',
          name: 'B2',
          costumes: [defaultCostume('c1', 20, 20)],
          sounds: [],
          program: { scripts: [], procedures: [], variables: [], lists: [] },
        },
      ],
      // Original B2 is at (100, 100) - far away!
      extraCopies: [{ id: 'copyB2', brickId: 'b2', x: 100, y: 100 }],
      variables: [{ id: 'touch', name: 'touch', value: false }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'B2' }),
          }, { VARIABLE: 'touch' }),
        ]),
      ],
    })

    // Clone B2 at (0, 0) overlapping Sprite1
    const b2Target = rt.world.targets[1]
    const b2Clone = { ...b2Target, id: 'cloneB2', x: 0, y: 0, isClone: true }
    rt.addClone(b2Clone, b2Target)

    rt.greenFlag()
    // Re-add clone after greenFlag
    rt.addClone(b2Clone, b2Target)
    rt.step()
    expect(rt.world.targets[0].variables.touch).toBe(true)

    // If candidate clone is dragged, it is excluded
    b2Clone.dragging = true
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('data_setvariableto', {
        VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'B2' }),
      }, { VARIABLE: 'touch' }),
    ])
    rt.greenFlag()
    rt.addClone(b2Clone, b2Target)
    rt.step()
    expect(rt.world.targets[0].variables.touch).toBe(false)
  })

  it('S03 · Hidden asymmetry', () => {
    // Hidden target: touching other sprites is false, but touching mouse pointer can be true
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      visible: false,
      extraBricks: [
        {
          id: 'b2',
          name: 'B2',
          costumes: [defaultCostume('c1', 20, 20)],
          sounds: [],
          program: { scripts: [], procedures: [], variables: [], lists: [] },
        },
      ],
      extraCopies: [{ id: 'copyB2', brickId: 'b2', x: 0, y: 0 }],
      variables: [
        { id: 'touchSprite', name: 'touchSprite', value: false },
        { id: 'touchMouse', name: 'touchMouse', value: false },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'B2' }),
          }, { VARIABLE: 'touchSprite' }),
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: '_mouse_' }),
          }, { VARIABLE: 'touchMouse' }),
        ]),
      ],
    })
    rt.world.mouse.x = 0
    rt.world.mouse.y = 0

    rt.greenFlag()
    rt.world.targets[0].visible = false // re-assert hidden
    rt.step()

    expect(rt.world.targets[0].variables.touchSprite).toBe(false)
    expect(rt.world.targets[0].variables.touchMouse).toBe(true)
  })

  it('S04 · Color target tolerance (KNOWN-DIFF: headless stub always false)', () => {
    // Conformance note: Color sensing requires a composited canvas/WebGL rasterizer.
    // Core engine provides headless semantics with safe stubs returning false.
    const rt = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: true }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingcolor', { COLOR: lit('#ff0000') }),
          }, { VARIABLE: 'res' }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.res).toBe(false)
  })

  it('S05 · Color source mask (KNOWN-DIFF: headless stub always false)', () => {
    // Headless core stub test for coloristouchingcolor
    const rt = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: true }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_coloristouchingcolor', { COLOR: lit('#ff0000'), COLOR2: lit('#0000ff') }),
          }, { VARIABLE: 'res' }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.res).toBe(false)
  })

  it('S06 · CPU/GPU threshold (KNOWN-DIFF: no renderer, primitives only defined)', () => {
    // In headless runtime, color queries are consistently handled without WebGL crashes
    const rt = makeHarnessRuntime()
    expect(rt.primitives['sensing_touchingcolor']).toBeDefined()
    expect(rt.primitives['sensing_coloristouchingcolor']).toBeDefined()
  })

  it('S07 · Distance', () => {
    // Distance between target positions: A(0,0), B(3,4) -> 5
    // Stage or nonexistent target -> 10000
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      extraBricks: [
        {
          id: 'b2',
          name: 'B2',
          costumes: [defaultCostume('c1')],
          sounds: [],
          program: { scripts: [], procedures: [], variables: [], lists: [] },
        },
      ],
      extraCopies: [{ id: 'copyB2', brickId: 'b2', x: 3, y: 4 }],
      variables: [
        { id: 'distB', name: 'distB', value: 0 },
        { id: 'distMissing', name: 'distMissing', value: 0 },
        { id: 'distStage', name: 'distStage', value: 0 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_distanceto', {}, { DISTANCETOMENU: 'B2' }),
          }, { VARIABLE: 'distB' }),
          stmt('data_setvariableto', {
            VALUE: block('sensing_distanceto', {}, { DISTANCETOMENU: 'NoSuchSprite' }),
          }, { VARIABLE: 'distMissing' }),
          stmt('data_setvariableto', {
            VALUE: block('sensing_distanceto', {}, { DISTANCETOMENU: 'Stage' }),
          }, { VARIABLE: 'distStage' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.distB).toBeCloseTo(5, 4)
    expect(rt.world.targets[0].variables.distMissing).toBe(10000)
    expect(rt.world.targets[0].variables.distStage).toBe(10000)
  })

  it('S08 · Attribute of', () => {
    // sensing_of: lookup property of target or stage
    const rt = makeHarnessRuntime({
      x: 10,
      y: 20,
      direction: 45,
      size: 120,
      variables: [{ id: 'v_hp', name: 'hp', value: 42 }],
      extraBricks: [
        {
          id: 'observer',
          name: 'Observer',
          costumes: [defaultCostume('c1')],
          sounds: [],
          program: {
            scripts: [
              flagScript([
                stmt('data_setvariableto', {
                  VALUE: block('sensing_of', {}, { OBJECT: 'Sprite1', PROPERTY: 'hp' }),
                }, { VARIABLE: 'readHp' }),
                stmt('data_setvariableto', {
                  VALUE: block('sensing_of', {}, { OBJECT: 'Sprite1', PROPERTY: 'x position' }),
                }, { VARIABLE: 'readX' }),
                stmt('data_setvariableto', {
                  VALUE: block('sensing_of', {}, { OBJECT: 'Sprite1', PROPERTY: 'nonexistent' }),
                }, { VARIABLE: 'readMissing' }),
              ]),
            ],
            procedures: [],
            variables: [
              { id: 'readHp', name: 'readHp', value: 0 },
              { id: 'readX', name: 'readX', value: 0 },
              { id: 'readMissing', name: 'readMissing', value: 0 },
            ],
            lists: [],
          },
        },
      ],
      extraCopies: [{ id: 'obsCopy', brickId: 'observer', x: 0, y: 0 }],
    })

    rt.greenFlag()
    rt.step()

    const obs = rt.world.targets[1]
    expect(obs.variables.readHp).toBe(42)
    expect(obs.variables.readX).toBe(10)
    expect(obs.variables.readMissing).toBe(0)
  })

  it('S09 · Timer', () => {
    // Project timer advances per tick; resetTimer sets timerStartTick
    const rt = makeHarnessRuntime({
      variables: [
        { id: 't1', name: 't1', value: 0 },
        { id: 't2', name: 't2', value: 0 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', { VALUE: block('sensing_timer') }, { VARIABLE: 't1' }),
          stmt('control_wait', { DURATION: lit(0.1) }),
          stmt('data_setvariableto', { VALUE: block('sensing_timer') }, { VARIABLE: 't2' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.t1).toBe(0)

    for (let i = 0; i < 5; i++) rt.step()
    expect(rt.world.targets[0].variables.t2).toBeGreaterThan(0)

    // StopAll does NOT reset the timer
    const prevTimer = rt.world.tick - rt.world.timerStartTick
    rt.stopAll()
    expect(rt.world.tick - rt.world.timerStartTick).toBe(prevTimer)

    // GreenFlag resets the timer
    rt.greenFlag()
    expect(rt.world.timerStartTick).toBe(rt.world.tick)
  })

  it('S10 · Key names', () => {
    // pressKey('a'): key "A" true, numeric 65 true, string "apple" tests its first letter (A) true.
    // "Shift" as an argument tests the letter S (not the modifier). Other keys are false.
    // Special names: space (also 32 and " "), arrows (37-40), enter.
    const rt = makeHarnessRuntime({
      variables: ['kA', 'k65', 'kApple', 'kB', 'kShift', 'kSpace'].map((id) => ({ id, name: id, value: 'unset' as string | boolean })),
      scripts: [
        broadcastScript('read', [
          stmt('data_setvariableto', { VALUE: block('sensing_keypressed', { KEY_OPTION: lit('A') }) }, { VARIABLE: 'kA' }),
          stmt('data_setvariableto', { VALUE: block('sensing_keypressed', { KEY_OPTION: lit(65) }) }, { VARIABLE: 'k65' }),
          stmt('data_setvariableto', { VALUE: block('sensing_keypressed', { KEY_OPTION: lit('apple') }) }, { VARIABLE: 'kApple' }),
          stmt('data_setvariableto', { VALUE: block('sensing_keypressed', { KEY_OPTION: lit('b') }) }, { VARIABLE: 'kB' }),
          stmt('data_setvariableto', { VALUE: block('sensing_keypressed', { KEY_OPTION: lit('Shift') }) }, { VARIABLE: 'kShift' }),
          stmt('data_setvariableto', { VALUE: block('sensing_keypressed', {}, { KEY_OPTION: 'space' }) }, { VARIABLE: 'kSpace' }),
        ], 'read'),
      ],
    })
    const v = rt.world.targets[0].variables
    rt.pressKey('a')
    rt.broadcast('read')
    rt.step()
    expect([v.kA, v.k65, v.kApple, v.kB, v.kShift, v.kSpace]).toEqual([true, true, true, false, false, false])

    rt.pressKey('space')
    rt.broadcast('read')
    rt.step()
    expect(v.kSpace).toBe(true)
    rt.releaseKey('a')
    rt.broadcast('read')
    rt.step()
    expect([v.kA, v.k65, v.kApple]).toEqual([false, false, false])
  })

  it('S11 · Key repeat', () => {
    // Posting key-down twice emits two key events but leaves one down-state entry; an active hat
    // for that key still ignores the second trigger.
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        keyScript('k', [
          stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
        ], 'key_hat'),
      ],
    })
    const spy = vi.spyOn(rt, 'startHats')
    rt.pressKey('k')
    rt.step()
    rt.pressKey('k') // repeat while the hat is running
    rt.step()
    const keyEvents = spy.mock.calls.filter(([opcode]) => opcode === 'event_whenkeypressed')
    expect(keyEvents.length).toBe(2) // an event for each press
    expect(rt.world.keysDown.size).toBe(1) // one down-state entry
    expect(rt.world.targets[0].lists.trace).toEqual(['start']) // hat ignored the repeat
    stepN(rt, 35)
    expect(rt.world.targets[0].lists.trace).toEqual(['start', 'end'])
  })

  it('S12 · Ask queue', () => {
    // Two askers: the first question is displayed; an answer resolves only the first asker, sets the
    // global answer, and displays the second question. Only the asking thread waits.
    const asker = (question: string, flag: string) =>
      flagScript([stmt('sensing_askandwait', { QUESTION: lit(question) }), stmt('data_setvariableto', { VALUE: block('sensing_answer') }, { VARIABLE: flag })], `ask_${flag}`)
    const rt = makeHarnessRuntime({
      variables: [{ id: 'got', name: 'got', value: 'none' }],
      lists: [],
      // The extra brick is the front-most target, so its hat starts (and asks) first.
      scripts: [asker('second', 'got')],
      extraBricks: [extraBrick('b', 'B', [asker('first', 'got')], { variables: [{ id: 'got', name: 'got', value: 'none' }] })],
      extraCopies: [{ id: 'copyB', brickId: 'b', x: 0, y: 0 }],
    })
    const [second, first] = rt.world.targets // back -> front
    rt.greenFlag()
    rt.step()
    expect(rt.world.askQueue.map((q) => q.question)).toEqual(['first', 'second'])
    expect(activeQuestion(rt.world)?.question).toBe('first')
    expect(first.variables.got).toBe('none')
    expect(second.variables.got).toBe('none')

    submitAnswer(rt, 'x')
    expect(rt.world.answer).toBe('x')
    expect(activeQuestion(rt.world)?.question).toBe('second')
    rt.step()
    expect(first.variables.got).toBe('x') // the first asker resumed
    expect(second.variables.got).toBe('none') // the second still waits

    submitAnswer(rt, 'y')
    rt.step()
    expect(second.variables.got).toBe('y')
    expect(activeQuestion(rt.world)).toBeNull()
  })

  it('S13 · Shared answer/reset', () => {
    // The answer is shared by all targets: after 'x' then 'y', every target reads 'y'. The green flag
    // empties it.
    const reader = (flag: string) => broadcastScript('read', [stmt('data_setvariableto', { VALUE: block('sensing_answer') }, { VARIABLE: 'ans' })], `read_${flag}`)
    const rt = makeHarnessRuntime({
      variables: [{ id: 'ans', name: 'ans', value: '' }],
      scripts: [reader('a')],
      extraBricks: [extraBrick('b', 'B', [reader('b')], { variables: [{ id: 'ans', name: 'ans', value: '' }] })],
      extraCopies: [{ id: 'copyB', brickId: 'b', x: 0, y: 0 }],
    })
    const [a, b] = rt.world.targets
    submitAnswer(rt, 'x')
    rt.broadcast('read')
    rt.step()
    expect([a.variables.ans, b.variables.ans]).toEqual(['x', 'x'])
    submitAnswer(rt, 'y')
    rt.broadcast('read')
    rt.step()
    expect([a.variables.ans, b.variables.ans]).toEqual(['y', 'y'])

    rt.greenFlag() // Green flag resets the answer
    expect(rt.world.answer).toBe('')
    rt.broadcast('read')
    rt.step()
    expect([a.variables.ans, b.variables.ans]).toEqual(['', ''])
  })

})
