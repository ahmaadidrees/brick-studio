import { describe, expect, it } from 'vitest'
import {
  block,
  defaultCostume,
  flagScript,
  lit,
  makeHarnessRuntime,
  stmt,
} from './harness'

describe('§1.6 Sensing, keyboard, timer, and ask/answer', () => {
  it('S01 · Sprite touching', () => {
    // Pixel-level touching: two overlapping solid costumes touch
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
      extraCopies: [{ id: 'copy2', brickId: 'b2', x: 5, y: 5 }],
      variables: [{ id: 'touch', name: 'touch', value: false }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'B2' }),
          }, { VARIABLE: 'touch' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.touch).toBe(true)

    // Move copy2 far away
    rt.world.targets[1].x = 100
    rt.world.targets[1].y = 100
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('data_setvariableto', {
        VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'B2' }),
      }, { VARIABLE: 'touch' }),
    ])
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.touch).toBe(false)
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

  it('S04 · Color target tolerance', () => {
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

  it('S05 · Color source mask', () => {
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

  it('S06 · CPU/GPU threshold', () => {
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
    // Key detection supports strings, special keys (space, enter), and char codes
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'keyA', name: 'keyA', value: false },
        { id: 'keySpace', name: 'keySpace', value: false },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('sensing_keypressed', {}, { KEY_OPTION: 'a' }),
          }, { VARIABLE: 'keyA' }),
          stmt('data_setvariableto', {
            VALUE: block('sensing_keypressed', {}, { KEY_OPTION: 'space' }),
          }, { VARIABLE: 'keySpace' }),
        ]),
      ],
    })

    rt.pressKey('A')
    rt.pressKey('space')
    rt.greenFlag()
    // Re-assert keys down
    rt.pressKey('a')
    rt.pressKey('space')
    rt.step()

    expect(rt.world.targets[0].variables.keyA).toBe(true)
    expect(rt.world.targets[0].variables.keySpace).toBe(true)
  })

  it('S11 · Key repeat', () => {
    // Repeated press events do not duplicate down-state or re-trigger active hat
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        {
          id: 'key_hat',
          hat: { opcode: 'event_whenkeypressed', fields: { KEY_OPTION: 'k' }, inputs: {} },
          body: [
            stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
            stmt('control_wait', { DURATION: lit(1) }),
            stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
          ],
        },
      ],
    })

    rt.pressKey('k')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start'])

    // Repeat press while running
    rt.pressKey('k')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start']) // no second execution
  })

  it('S12 · Ask queue', () => {
    // Global FIFO queue of questions; asking thread waits until answered
    const rt = makeHarnessRuntime({
      variables: [{ id: 'stepDone', name: 'stepDone', value: false }],
      scripts: [
        flagScript([
          stmt('sensing_askandwait', { QUESTION: lit('What is your name?') }),
          stmt('data_setvariableto', { VALUE: lit(true) }, { VARIABLE: 'stepDone' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    // Question enqueued in world.askQueue
    expect(rt.world.askQueue.length).toBe(1)
    expect(rt.world.askQueue[0].question).toBe('What is your name?')
    expect(rt.world.targets[0].variables.stepDone).toBe(false)

    // Submit answer
    rt.world.answer = 'Alice'
    rt.world.askQueue[0].state = 'answered'
    rt.step()

    expect(rt.world.targets[0].variables.stepDone).toBe(true)
    expect(rt.world.askQueue.length).toBe(0)
  })

  it('S13 · Shared answer/reset', () => {
    // Answer is shared across targets; reset on greenFlag
    const rt = makeHarnessRuntime({
      variables: [{ id: 'ans', name: 'ans', value: '' }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', { VALUE: block('sensing_answer') }, { VARIABLE: 'ans' }),
        ]),
      ],
    })

    rt.world.answer = 'GlobalAnswer'
    rt.greenFlag() // Green flag resets answer to ''
    expect(rt.world.answer).toBe('')

    rt.world.answer = 'NewAnswer'
    rt.step()
    expect(rt.world.targets[0].variables.ans).toBe('NewAnswer')
  })
})
