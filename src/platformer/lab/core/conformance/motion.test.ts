import { describe, expect, it } from 'vitest'
import {
  block,
  defaultCostume,
  flagScript,
  lit,
  extraBrick,
  makeHarnessRuntime,
  stepN,
  broadcastScript,
  stmt,
} from './harness'

describe('§1.4 Motion, coordinates, fencing, and bouncing', () => {
  it('M01 · Coordinates/direction', () => {
    // 0 is up, 90 is right, 180 is down, -90 is left
    // move computes dx = s * cos((90-d) * pi / 180), dy = s * sin((90-d) * pi / 180)
    const dirs = [0, 90, 180, -90]
    const expected = [
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: -10 },
      { x: -10, y: 0 },
    ]

    for (let i = 0; i < dirs.length; i++) {
      const rt = makeHarnessRuntime({
        x: 0,
        y: 0,
        direction: dirs[i],
        scripts: [
          flagScript([
            stmt('motion_movesteps', { STEPS: lit(10) }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()

      const target = rt.world.targets[0]
      expect(target.x).toBeCloseTo(expected[i].x, 3)
      expect(target.y).toBeCloseTo(expected[i].y, 3)
    }
  })

  it('M02 · Negative/fractional steps', () => {
    // fractional steps work without rounding to whole integers; non-numeric casts to 0
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      direction: 90,
      scripts: [
        flagScript([
          stmt('motion_movesteps', { STEPS: lit(-2.5) }),
          stmt('motion_movesteps', { STEPS: lit('cat') }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].x).toBeCloseTo(-2.5, 5)
  })

  it('M03 · Direction wrapping', () => {
    // Finite directions wrap into (-180, 180]; -180 wraps to 180; NaN/Infinity ignored
    const testCases = [
      { input: 450, expected: 90 },
      { input: -180, expected: 180 },
      { input: 180, expected: 180 },
      { input: -270, expected: 90 },
    ]

    for (const { input, expected } of testCases) {
      const rt = makeHarnessRuntime({
        direction: 0,
        scripts: [
          flagScript([
            stmt('motion_pointindirection', { DIRECTION: lit(input) }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].direction).toBe(expected)
    }

    // Non-finite keeps prior direction
    const rtNonFinite = makeHarnessRuntime({
      direction: 45,
      scripts: [
        flagScript([
          stmt('motion_pointindirection', { DIRECTION: lit('not-a-number') }),
        ]),
      ],
    })
    rtNonFinite.greenFlag()
    rtNonFinite.step()
    expect(rtNonFinite.world.targets[0].direction).toBe(0) // Note: cast of 'not-a-number' in Scratch toNumber is 0
  })

  it('M04 · Position reporters', () => {
    // Position reporters snap values less than 1e-9 from an integer to that integer
    const rt = makeHarnessRuntime({
      x: 1 + 1e-10,
      y: 5.5,
      variables: [
        { id: 'rx', name: 'rx', value: 0 },
        { id: 'ry', name: 'ry', value: 0 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', { VALUE: block('motion_xposition') }, { VARIABLE: 'rx' }),
          stmt('data_setvariableto', { VALUE: block('motion_yposition') }, { VARIABLE: 'ry' }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    // Reporter snaps 1 + 1e-10 to 1
    expect(rt.world.targets[0].variables.rx).toBe(1)
    expect(rt.world.targets[0].variables.ry).toBe(5.5)
  })

  it('M05 · Ordinary fencing', () => {
    // A 100x100 costume (fence AABB [-50,50]^2 around its center): inset = min(15, floor(100/2)) = 15,
    // so the center can reach 240 + 50 - 15 = 275 horizontally and 180 + 50 - 15 = 215 vertically.
    const rt = makeHarnessRuntime({
      costumes: [defaultCostume('c1', 100, 100)],
      scripts: [
        flagScript([
          stmt('motion_setx', { X: lit(1000) }),
          stmt('data_setvariableto', { VALUE: block('motion_xposition') }, { VARIABLE: 'xr' }),
          stmt('motion_setx', { X: lit(-1000) }),
          stmt('data_setvariableto', { VALUE: block('motion_xposition') }, { VARIABLE: 'xl' }),
          stmt('motion_sety', { Y: lit(1000) }),
          stmt('data_setvariableto', { VALUE: block('motion_yposition') }, { VARIABLE: 'yt' }),
          stmt('motion_sety', { Y: lit(-1000) }),
          stmt('data_setvariableto', { VALUE: block('motion_yposition') }, { VARIABLE: 'yb' }),
        ]),
      ],
      variables: ['xr', 'xl', 'yt', 'yb'].map((id) => ({ id, name: id, value: 0 })),
    })
    rt.greenFlag()
    rt.step()
    const v = rt.world.targets[0].variables
    expect(v.xr).toBe(275)
    expect(v.xl).toBe(-275)
    expect(v.yt).toBe(215)
    expect(v.yb).toBe(-215)
  })

  it('M06 · Small-costume fence', () => {
    // Costume smaller than 30px has smaller inset (floor(dim / 2))
    const rtSmall = makeHarnessRuntime({
      costumes: [defaultCostume('small', 20, 20)],
      scripts: [
        flagScript([
          stmt('motion_setx', { X: lit(1000) }),
        ]),
      ],
    })
    rtSmall.greenFlag()
    rtSmall.step()

    // 20x20: half is 10, inset is min(15, 10) = 10 -> stage right 240 + half 10 - inset 10 = 240
    expect(rtSmall.world.targets[0].x).toBeCloseTo(240, 1)
  })

  it('M07 · Dragging', () => {
    // Target with dragging = true ignores ordinary setXY
    const rt = makeHarnessRuntime({
      x: 5,
      y: 5,
      scripts: [
        flagScript([
          stmt('motion_gotoxy', { X: lit(0), Y: lit(0) }),
        ]),
      ],
    })
    rt.world.targets[0].dragging = true

    rt.greenFlag()
    rt.world.targets[0].dragging = true // re-assert after greenFlag
    rt.step()

    expect(rt.world.targets[0].x).toBe(5)
    expect(rt.world.targets[0].y).toBe(5)
  })

  it('M08 · Go to', () => {
    // Named target: the first original, not the nearest clone. Mouse uses mouse coordinates.
    // A missing target is a no-op. Random with a stub of 0.5 gives (0, 0).
    const rt = makeHarnessRuntime({
      x: 90,
      y: 90,
      scripts: [
        broadcastScript('named', [stmt('motion_goto', {}, { TO: 'Bee' })], 'toNamed'),
        broadcastScript('missing', [stmt('motion_goto', {}, { TO: 'Nobody' })], 'toMissing'),
        broadcastScript('mouse', [stmt('motion_goto', {}, { TO: '_mouse_' })], 'toMouse'),
        broadcastScript('random', [stmt('motion_goto', {}, { TO: '_random_' })], 'toRandom'),
      ],
      extraBricks: [extraBrick('bee', 'Bee')],
      extraCopies: [{ id: 'bee1', brickId: 'bee', x: 10, y: 10 }],
    })
    const mover = rt.world.targets[0]
    const bee = rt.world.targets.find((t) => t.brickId === 'bee')!
    rt.greenFlag()
    rt.startStack(bee, { id: 'mk', hat: { opcode: 'control_start_as_clone', fields: {}, inputs: {} }, body: [stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' })] })
    rt.step()
    const beeClone = rt.world.targets.find((t) => t.isClone)!
    beeClone.x = 99
    beeClone.y = 99 // the clone is right next to the mover at (90, 90)

    rt.broadcast('named')
    rt.step()
    expect([mover.x, mover.y]).toEqual([10, 10])

    rt.broadcast('missing')
    rt.step()
    expect([mover.x, mover.y]).toEqual([10, 10])

    rt.world.mouse.x = 77
    rt.world.mouse.y = -88
    rt.broadcast('mouse')
    rt.step()
    expect([mover.x, mover.y]).toEqual([77, -88])

    rt.random = () => 0.5
    rt.broadcast('random')
    rt.step()
    expect([mover.x, mover.y]).toEqual([0, 0])
  })

  it('M09 · Point towards', () => {
    // 90 - atan2(dy, dx) in degrees
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      scripts: [
        flagScript([
          stmt('control_forever', {}, {}, [
            [stmt('motion_pointtowards', {}, { TOWARDS: '_mouse_' })],
          ]),
        ]),
      ],
    })

    // Towards (0, 10) -> dy = 10, dx = 0 -> 90 - 90 = 0 (up)
    rt.world.mouse.x = 0
    rt.world.mouse.y = 10
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].direction).toBeCloseTo(0, 3)

    // Towards (10, 0) -> dy = 0, dx = 10 -> 90 - 0 = 90 (right)
    rt.world.mouse.x = 10
    rt.world.mouse.y = 0
    rt.step()
    expect(rt.world.targets[0].direction).toBeCloseTo(90, 3)
  })

  it('M10 · Glide snapshot', () => {
    // Glide snapshots start and end, linearly interpolates over ticks
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      scripts: [
        flagScript([
          stmt('motion_glidesecstoxy', { SECS: lit(1), X: lit(100), Y: lit(0) }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step() // tick 0 -> start glide

    // 15 ticks at 30 TPS is 0.5s -> x ~ 50
    for (let i = 0; i < 15; i++) rt.step()
    expect(rt.world.targets[0].x).toBeCloseTo(50, 0)

    // Another 15 ticks -> 1.0s -> reaches 100
    for (let i = 0; i < 15; i++) rt.step()
    expect(rt.world.targets[0].x).toBeCloseTo(100, 0)
  })

  it('M11 · Glide zero', () => {
    // Duration <= 0 moves immediately with no multi-tick wait
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      variables: [{ id: 'done', name: 'done', value: false }],
      scripts: [
        flagScript([
          stmt('motion_glidesecstoxy', { SECS: lit(0), X: lit(20), Y: lit(30) }),
          stmt('data_setvariableto', { VALUE: lit(true) }, { VARIABLE: 'done' }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].x).toBeCloseTo(20, 1)
    expect(rt.world.targets[0].y).toBeCloseTo(30, 1)
    expect(rt.world.targets[0].variables.done).toBe(true)
  })

  it('M12 · Bounce', () => {
    // At right boundary heading 90 -> reflects to -90
    const rt = makeHarnessRuntime({
      x: 235,
      y: 0,
      direction: 90,
      scripts: [
        flagScript([
          stmt('motion_movesteps', { STEPS: lit(20) }),
          stmt('motion_ifonedgebounce'),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].direction).toBe(-90)
  })

  it('M13 · Edge predicate boundary', () => {
    // touching edge is strict: bounds.right = 240 -> false; 240.1 -> true. (100x100 costume centered
    // on its position, so bounds.right = x + 50.)
    const rt = makeHarnessRuntime({
      costumes: [defaultCostume('c1', 100, 100)],
      variables: [
        { id: 'flush', name: 'flush', value: true },
        { id: 'beyond', name: 'beyond', value: false },
      ],
      scripts: [
        flagScript([
          stmt('motion_setx', { X: lit(190) }),
          stmt('data_setvariableto', { VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: '_edge_' }) }, { VARIABLE: 'flush' }),
          stmt('motion_setx', { X: lit(190.1) }),
          stmt('data_setvariableto', { VALUE: block('sensing_touchingobject', {}, { TOUCHINGOBJECTMENU: '_edge_' }) }, { VARIABLE: 'beyond' }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.flush).toBe(false)
    expect(rt.world.targets[0].variables.beyond).toBe(true)
  })

  it('M14 · Rotation styles', () => {
    // rotationStyle: 'don\'t rotate' / 'left-right' / 'all around'
    // Stored direction is preserved and used by move even under 'don\'t rotate'
    const rt = makeHarnessRuntime({
      x: 0,
      y: 0,
      direction: 0, // up
      scripts: [
        flagScript([
          stmt('motion_setrotationstyle', {}, { STYLE: "don't rotate" }),
          stmt('motion_movesteps', { STEPS: lit(10) }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].rotationStyle).toBe("don't rotate")
    expect(rt.world.targets[0].direction).toBe(0)
    // Moving 10 steps at direction 0 still moves along y (up)
    expect(rt.world.targets[0].x).toBeCloseTo(0, 3)
    expect(rt.world.targets[0].y).toBeCloseTo(10, 3)
  })
})
