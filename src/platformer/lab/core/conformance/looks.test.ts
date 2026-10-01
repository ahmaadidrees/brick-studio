import { describe, expect, it } from 'vitest'
import {
  block,
  defaultCostume,
  flagScript,
  lit,
  makeHarnessRuntime,
  stmt,
} from './harness'

describe('§1.5 Looks, size, effects, layers, and timed bubbles', () => {
  it('L01 · Costume names/numbers', () => {
    // Costume named "2" at 1st position (index 0), costume named "c2" at 2nd position (index 1)
    const rt = makeHarnessRuntime({
      costumes: [
        defaultCostume('2', 32, 32),
        defaultCostume('c2', 32, 32),
      ],
      costumeIndex: 0,
      scripts: [
        flagScript([
          // Numeric 2 -> 1-based index 2 -> costumeIndex 1
          stmt('looks_switchcostumeto', { COSTUME: lit(2) }),
        ], 'sNum'),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].costumeIndex).toBe(1)

    // String "2" -> matches name "2" at index 0
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('looks_switchcostumeto', { COSTUME: lit('2') }),
    ])
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].costumeIndex).toBe(0)
  })

  it('L02 · Costume wrap', () => {
    // 3 costumes: nextcostume wraps 3 -> 1; numeric 4 -> 1; numeric 0 -> 3
    const rt = makeHarnessRuntime({
      costumes: [
        defaultCostume('c1'),
        defaultCostume('c2'),
        defaultCostume('c3'),
      ],
      costumeIndex: 2, // 3rd costume
      scripts: [
        flagScript([
          stmt('looks_nextcostume'),
        ]),
      ],
    })

    rt.greenFlag()
    rt.world.targets[0].costumeIndex = 2 // re-assert 3rd costume after greenFlag
    rt.step()
    expect(rt.world.targets[0].costumeIndex).toBe(0) // wraps to 1st costume

    // Switch numeric 4 -> 1st costume (index 0)
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('looks_switchcostumeto', { COSTUME: lit(4) }),
    ])
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].costumeIndex).toBe(0)

    // Switch numeric 0 -> 3rd costume (index 2)
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('looks_switchcostumeto', { COSTUME: lit(0) }),
    ])
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].costumeIndex).toBe(2)
  })

  it('L03 · Rotation center', () => {
    // Switching costume does not rewrite target x/y coordinates
    const c1 = { ...defaultCostume('c1', 32, 32), rotationCenterX: 0, rotationCenterY: 0 }
    const c2 = { ...defaultCostume('c2', 32, 32), rotationCenterX: 16, rotationCenterY: 16 }

    const rt = makeHarnessRuntime({
      costumes: [c1, c2],
      x: 50,
      y: 75,
      scripts: [
        flagScript([
          stmt('looks_switchcostumeto', { COSTUME: lit(2) }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].x).toBe(50)
    expect(rt.world.targets[0].y).toBe(75)
    expect(rt.world.targets[0].costumeIndex).toBe(1)
  })

  it('L04 · Size min/max', () => {
    // 100x100 skin on 480x360 stage:
    // minScale = min(1, max(5/100, 5/100)) = 0.05 -> 5%
    // maxScale = min(720/100, 540/100) = 5.4 -> 540%
    const rt = makeHarnessRuntime({
      costumes: [defaultCostume('c1', 100, 100)],
      scripts: [
        flagScript([
          stmt('looks_setsizeto', { SIZE: lit(0) }),
        ], 'sMin'),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].size).toBe(5)

    // Set size to 10000 -> clamps to 540
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('looks_setsizeto', { SIZE: lit(10000) }),
    ])
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].size).toBe(540)
  })

  it('L05 · Effects', () => {
    // Ghost clamps to 0..100; brightness clamps to -100..100; unknown effect ignored
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('looks_seteffectto', { VALUE: lit(150) }, { EFFECT: 'GHOST' }),
          stmt('looks_seteffectto', { VALUE: lit(200) }, { EFFECT: 'BRIGHTNESS' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].effects.ghost).toBe(100)
    expect(rt.world.targets[0].effects.brightness).toBe(100)

    // Underflow clamping
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('looks_seteffectto', { VALUE: lit(-20) }, { EFFECT: 'GHOST' }),
      stmt('looks_seteffectto', { VALUE: lit(-200) }, { EFFECT: 'BRIGHTNESS' }),
    ])
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].effects.ghost).toBe(0)
    expect(rt.world.targets[0].effects.brightness).toBe(-100)
  })

  it('L06 · Ghost vs hide', () => {
    // Sprite with ghost = 100 still registers touching another sprite
    // Sprite with visible = false does NOT register touching
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      extraBricks: [
        {
          id: 'sprite2',
          name: 'Sprite2',
          costumes: [defaultCostume('c1')],
          sounds: [],
          program: { scripts: [], procedures: [], variables: [], lists: [] },
        },
      ],
      extraCopies: [{ id: 'copy2', brickId: 'sprite2', x: 0, y: 0 }],
      variables: [
        { id: 'touchGhost', name: 'touchGhost', value: false },
        { id: 'touchHidden', name: 'touchHidden', value: false },
      ],
      scripts: [
        flagScript([
          // Ghost 100
          stmt('looks_seteffectto', { VALUE: lit(100) }, { EFFECT: 'GHOST' }),
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'Sprite2' }),
          }, { VARIABLE: 'touchGhost' }),
          // Hide
          stmt('looks_hide'),
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: 'Sprite2' }),
          }, { VARIABLE: 'touchHidden' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.touchGhost).toBe(true)
    expect(rt.world.targets[0].variables.touchHidden).toBe(false)
  })

  it('L07 · Show/hide', () => {
    // Hidden target continues executing scripts and can sense mouse pointer
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      visible: false,
      variables: [{ id: 'v', name: 'v', value: 0 }, { id: 'touchMouse', name: 'touchMouse', value: false }],
      scripts: [
        flagScript([
          stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'v' }),
          stmt('data_setvariableto', {
            VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: '_mouse_' }),
          }, { VARIABLE: 'touchMouse' }),
        ]),
      ],
    })
    rt.world.mouse.x = 0
    rt.world.mouse.y = 0

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.v).toBe(1)
    expect(rt.world.targets[0].variables.touchMouse).toBe(true)
  })

  it('L08 · Layer operations', () => {
    // gotofront / gobackwards alters target draw order
    const rt = makeHarnessRuntime({
      extraBricks: [
        {
          id: 'other',
          name: 'Other',
          costumes: [defaultCostume('c1')],
          sounds: [],
          program: { scripts: [], procedures: [], variables: [], lists: [] },
        },
      ],
      extraCopies: [
        { id: 'copy2', brickId: 'other', x: 0, y: 0 },
        { id: 'copy3', brickId: 'other', x: 0, y: 0 },
      ],
      scripts: [
        flagScript([
          stmt('looks_gotofrontback', {}, { FRONT_BACK: 'front' }),
        ]),
      ],
    })

    // targets initially: [copy1, copy2, copy3]
    expect(rt.world.targets.map((t) => t.id)).toEqual(['copy1', 'copy2', 'copy3'])

    rt.greenFlag()
    rt.step()

    // copy1 went to front: [copy2, copy3, copy1]
    expect(rt.world.targets.map((t) => t.id)).toEqual(['copy2', 'copy3', 'copy1'])
  })

  it('L09 · Say/think plain', () => {
    // Say plain sets bubble; empty string clears it
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('looks_say', { MESSAGE: lit('Hello World') }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].bubble).toEqual({ kind: 'say', text: 'Hello World' })

    // Say empty string clears bubble
    rt.world.bricks['sprite1'].program.scripts[0] = flagScript([
      stmt('looks_say', { MESSAGE: lit('') }),
    ])
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].bubble).toBeNull()
  })

  it('L10 · Say/think for seconds', () => {
    // Timed bubble stays active for duration, then clears
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('looks_sayforsecs', { SECS: lit(0.5), MESSAGE: lit('Timed') }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step() // tick 0 -> bubble set
    expect(rt.world.targets[0].bubble).toEqual({ kind: 'say', text: 'Timed' })

    // Advance 10 ticks (~0.33s) -> still active
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.targets[0].bubble).toEqual({ kind: 'say', text: 'Timed' })

    // Advance 10 more ticks (~0.66s) -> clears
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.targets[0].bubble).toBeNull()
  })

  it('L11 · Bubble overwrite race', () => {
    // Overwriting bubble cancels old timer clearance
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('looks_sayforsecs', { SECS: lit(0.2), MESSAGE: lit('Old') }),
        ], 's1'),
        flagScript([
          stmt('control_wait', { DURATION: lit(0.05) }),
          stmt('looks_say', { MESSAGE: lit('New') }),
        ], 's2'),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].bubble?.text).toBe('Old')

    // After wait(0.05) runs, s2 says 'New'
    for (let i = 0; i < 3; i++) rt.step()
    expect(rt.world.targets[0].bubble?.text).toBe('New')

    // When s1's 0.2s timer completes, 'New' is NOT erased
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.targets[0].bubble?.text).toBe('New')
  })

  it('L12 · Flag/stop effects', () => {
    // Green flag and stopAll clear effects, but retain position, size, costume
    const rt = makeHarnessRuntime({
      x: 77,
      size: 150,
      costumes: [defaultCostume('c1'), defaultCostume('c2')],
      costumeIndex: 1,
    })

    rt.world.targets[0].effects.ghost = 40
    rt.world.targets[0].effects.brightness = -20

    rt.stopAll()
    expect(rt.world.targets[0].effects.ghost).toBe(0)
    expect(rt.world.targets[0].effects.brightness).toBe(0)
    expect(rt.world.targets[0].x).toBe(77)
    expect(rt.world.targets[0].size).toBe(150)
    expect(rt.world.targets[0].costumeIndex).toBe(1)
  })
})
