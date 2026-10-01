/**
 * Platformer extension (step 3), written the way a kid would check it by watching:
 * "it lands on the platform", "it stops at the wall", "the bump hat fires once per tick".
 * Every test builds a tiny level and runs it through the real runtime (createRuntime + ALL_PRIMITIVES).
 */
import { describe, expect, it } from 'vitest'
import type { BrickDef, CopyPlacement, Expr, LevelDesign, Script, Stmt, Target } from './contracts'
import { DEFAULT_PHYSICS } from './contracts'
import { createRuntime, play } from './index'
import { validateDesign } from './project'
import type { Runtime } from './runtime'

const lit = (value: number | string): Expr => ({ kind: 'lit', value })
const stmt = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}, branches?: Stmt[][]): Stmt => ({
  opcode,
  fields,
  inputs,
  ...(branches ? { branches } : {}),
})
const block = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Expr => ({ kind: 'block', opcode, fields, inputs })

const gravityOn = stmt('platformer_setgravity', { GRAVITY: 'on' })
const solidOn = stmt('platformer_setsolid', { SOLID: 'on' })
const setSpeed = (axis: 'x' | 'y', n: number) => stmt('platformer_setspeed', { AXIS: axis }, { SPEED: lit(n) })

let scriptId = 0
const onFlag = (...body: Stmt[]): Script => ({ id: `s${scriptId++}`, hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body })
const whenBump = (side: string, brick: string, ...body: Stmt[]): Script => ({
  id: `s${scriptId++}`,
  hat: { opcode: 'platformer_whenbump', fields: { SIDE: side, BRICK: brick }, inputs: {} },
  body,
})

function brick(id: string, name: string, w: number, h: number, scripts: Script[] = [], variables: BrickDef['program']['variables'] = []): BrickDef {
  return {
    id,
    name,
    costumes: [{ name: 'c', width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }],
    sounds: [],
    program: { scripts, procedures: [], variables, lists: [] },
  }
}

function level(bricks: BrickDef[], copies: CopyPlacement[]): LevelDesign {
  return {
    id: 'lvl',
    name: 'Test',
    seed: 1,
    bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks,
    copies,
  }
}

const copyOf = (rt: Runtime, id: string): Target => rt.world.targets.find((t) => t.copyId === id && !t.isClone)!
const run = (rt: Runtime, ticks: number) => {
  for (let i = 0; i < ticks; i++) rt.step()
}

/** A 100 x 20 platform whose top is at y = 60 (centered on y = 50). */
const platform = brick('plat', 'Platform', 100, 20, [onFlag(solidOn)])
const faller = (extra: Script[] = [], vars: BrickDef['program']['variables'] = []) => brick('f', 'Faller', 20, 20, [onFlag(gravityOn), ...extra], vars)

describe('blocks', () => {
  it('a level using the Platformer blocks and the bump hat passes validateDesign', () => {
    const d = level([platform, faller([whenBump('top', 'Platform', stmt('motion_changexby', {}, { DX: lit(1) }))])], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }])
    expect(validateDesign(d)).toEqual([])
  })

  it('set / change / report speed on both axes, and on ground reads false before anything happens', () => {
    const b = brick('a', 'A', 10, 10, [
      onFlag(
        setSpeed('x', 4),
        stmt('platformer_changespeed', { AXIS: 'x' }, { SPEED: lit(3) }),
        stmt('platformer_setspeed', { AXIS: 'y' }, { SPEED: lit('5') }),
        stmt('platformer_changespeed', { AXIS: 'y' }, { SPEED: lit(Infinity) }),
        stmt('data_setvariableto', { VARIABLE: 'rx' }, { VALUE: block('platformer_speed', { AXIS: 'x' }) }),
        stmt('data_setvariableto', { VARIABLE: 'ry' }, { VALUE: block('platformer_speed', { AXIS: 'y' }) }),
        stmt('data_setvariableto', { VARIABLE: 'og' }, { VALUE: block('platformer_onground') }),
      ),
    ], [
      { id: 'rx', name: 'rx', value: 0 },
      { id: 'ry', name: 'ry', value: 0 },
      { id: 'og', name: 'og', value: 'unset' },
    ])
    const rt = play(level([b], [{ id: 'c', brickId: 'a', x: 100, y: 100 }]))
    rt.step()
    const t = copyOf(rt, 'c')
    expect(t.variables).toMatchObject({ rx: 7, ry: 5, og: false })
    expect(t.body).toMatchObject({ vx: 7, vy: 5, gravity: false, solid: false })
  })

  it('reading speed never creates a body', () => {
    const b = brick('a', 'A', 10, 10, [onFlag(stmt('data_setvariableto', { VARIABLE: 'rx' }, { VALUE: block('platformer_speed', { AXIS: 'x' }) }))], [{ id: 'rx', name: 'rx', value: 9 }])
    const rt = play(level([b], [{ id: 'c', brickId: 'a', x: 100, y: 100 }]))
    rt.step()
    expect(copyOf(rt, 'c').variables.rx).toBe(0)
    expect(copyOf(rt, 'c').body).toBeUndefined()
  })
})

describe('falling and landing', () => {
  it('lands on a platform at exactly platformTop + half its height, and stays there with onGround true for 30 ticks', () => {
    const rt = play(level([platform, faller()], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 200 }]))
    const f = copyOf(rt, 'f')
    run(rt, 40)
    expect(f.y).toBe(70)
    for (let i = 0; i < 30; i++) {
      rt.step()
      expect(f.y).toBe(70)
      expect(f.body!.onGround).toBe(true)
      expect(f.body!.vy).toBe(0)
    }
  })

  it('falls onto the floor when walls.bottom is on, and keeps falling through it when it is off', () => {
    const rt = play(level([faller()], [{ id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 60)
    expect(copyOf(rt, 'f').y).toBe(10)
    expect(copyOf(rt, 'f').body!.onGround).toBe(true)

    const open = createRuntime(level([faller()], [{ id: 'f', brickId: 'f', x: 100, y: 200 }]))
    open.world.physics = { ...DEFAULT_PHYSICS, walls: { left: true, right: true, bottom: false } }
    open.greenFlag()
    run(open, 60)
    expect(copyOf(open, 'f').y).toBeLessThan(0)
    expect(copyOf(open, 'f').body!.onGround).toBe(false)
  })

  it('never falls faster than maxFall, and a fast faller does not tunnel through a thin platform', () => {
    const thin = brick('thin', 'Thin', 100, 4, [onFlag(solidOn)])
    const rt = play(level([thin, faller()], [{ id: 'p', brickId: 'thin', x: 100, y: 100 }, { id: 'f', brickId: 'f', x: 100, y: 340 }]))
    const f = copyOf(rt, 'f')
    let fastest = 0
    for (let i = 0; i < 60; i++) {
      rt.step()
      fastest = Math.min(fastest, f.body!.vy)
    }
    expect(fastest).toBe(-16)
    expect(f.y).toBe(112) // platform top 102 + 10
    expect(f.body!.onGround).toBe(true)
  })

  it('a faller slides off the platform edge and keeps falling', () => {
    const walk = faller([onFlag(setSpeed('x', 5))])
    const rt = play(level([platform, walk], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 70 }]))
    run(rt, 5)
    expect(copyOf(rt, 'f').y).toBe(70)
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(10)
  })
})

describe('walls and sides', () => {
  it('stops at the level wall: exact x, speed 0, bump on the right wall', () => {
    const runner = brick('r', 'Runner', 20, 20, [onFlag(gravityOn, setSpeed('x', 7))])
    const rt = play(level([runner], [{ id: 'r', brickId: 'r', x: 300, y: 10 }]))
    run(rt, 60)
    expect(copyOf(rt, 'r').x).toBe(470)
    expect(copyOf(rt, 'r').body!.vx).toBe(0)
  })

  it('stops at the left level wall too', () => {
    const runner = brick('r', 'Runner', 20, 20, [onFlag(setSpeed('x', -7))])
    const rt = play(level([runner], [{ id: 'r', brickId: 'r', x: 100, y: 100 }]))
    run(rt, 40)
    expect(copyOf(rt, 'r').x).toBe(10)
  })

  it('stops at a solid\'s left face and at its right face with no gap and no overlap', () => {
    const wall = brick('w', 'Wall', 20, 100, [onFlag(solidOn)])
    const right = brick('r', 'Right', 20, 20, [onFlag(setSpeed('x', 7))])
    const left = brick('l', 'Left', 20, 20, [onFlag(setSpeed('x', -7))])
    const rt = play(
      level([wall, right, left], [
        { id: 'w', brickId: 'w', x: 200, y: 150 }, // box x 190..210
        { id: 'r', brickId: 'r', x: 100, y: 150 },
        { id: 'l', brickId: 'l', x: 300, y: 150 },
      ]),
    )
    run(rt, 60)
    expect(copyOf(rt, 'r').x).toBe(180)
    expect(copyOf(rt, 'l').x).toBe(220)
    expect(copyOf(rt, 'r').body!.vx).toBe(0)
    expect(copyOf(rt, 'l').body!.vx).toBe(0)
  })

  it('hits its head on a ceiling: vy becomes 0 and it stops flush under it', () => {
    const ceiling = brick('c', 'Ceiling', 100, 20, [onFlag(solidOn)])
    const up = brick('u', 'Up', 20, 20, [onFlag(setSpeed('y', 5))])
    const rt = play(level([ceiling, up], [{ id: 'c', brickId: 'c', x: 100, y: 110 }, { id: 'u', brickId: 'u', x: 100, y: 50 }])) // ceiling bottom 100
    run(rt, 30)
    expect(copyOf(rt, 'u').y).toBe(90)
    expect(copyOf(rt, 'u').body!.vy).toBe(0)
  })

  it('with gravity on, a head-bump turns the jump into a fall right away', () => {
    const ceiling = brick('c', 'Ceiling', 100, 20, [onFlag(solidOn)])
    const up = brick('u', 'Up', 20, 20, [onFlag(gravityOn, setSpeed('y', 12))])
    const rt = play(level([ceiling, up], [{ id: 'c', brickId: 'c', x: 100, y: 110 }, { id: 'u', brickId: 'u', x: 100, y: 50 }]))
    // Rises 11, 10, 9, 8, then the next 7 would poke past the ceiling (bottom 100): it stops at y = 90 with vy 0.
    run(rt, 4)
    expect(copyOf(rt, 'u').y).toBe(88)
    rt.step()
    expect(copyOf(rt, 'u').y).toBe(90)
    expect(copyOf(rt, 'u').body!.vy).toBe(0)
    run(rt, 60)
    expect(copyOf(rt, 'u').y).toBe(10)
  })
})

describe('jumping', () => {
  /** forever { if <on ground?> and <key space pressed?> { set y speed to 12 }; wait 0 } */
  const jumpScript = onFlag(
    stmt('control_forever', {}, {}, [
      [
        stmt('control_if', {}, { CONDITION: block('operator_and', {}, { OPERAND1: block('platformer_onground'), OPERAND2: block('sensing_keypressed', {}, { KEY_OPTION: lit('space') }) }) }, [[setSpeed('y', 12)]]),
        stmt('control_wait', {}, { DURATION: lit(0) }),
      ],
    ]),
  )
  const jumper = brick('j', 'Jumper', 20, 20, [onFlag(gravityOn), jumpScript])

  it('jumps to a predictable height (66 steps) and lands back at the same y after 23 ticks', () => {
    const rt = play(level([jumper], [{ id: 'j', brickId: 'j', x: 100, y: 10 }]))
    const j = copyOf(rt, 'j')
    run(rt, 3)
    expect(j.body!.onGround).toBe(true)
    expect(j.y).toBe(10)

    rt.pressKey('space')
    rt.step()
    rt.releaseKey('space')
    // The jump script ran before physics this tick, so physics moved it 11 (12 minus one gravity).
    expect(j.y).toBe(21)
    expect(j.body!.onGround).toBe(false)

    let apex = j.y
    let landedAfter = -1
    for (let i = 1; i <= 40; i++) {
      rt.step()
      apex = Math.max(apex, j.y)
      if (j.body!.onGround) {
        landedAfter = i
        break
      }
    }
    expect(apex).toBe(10 + 66)
    expect(j.y).toBe(10)
    expect(landedAfter).toBe(23)
  })

  it('cannot jump in the air: pressing space mid-jump does nothing', () => {
    const rt = play(level([jumper], [{ id: 'j', brickId: 'j', x: 100, y: 10 }]))
    run(rt, 3)
    rt.pressKey('space')
    run(rt, 12) // held through the whole rise
    expect(copyOf(rt, 'j').y).toBeLessThanOrEqual(76)
    rt.releaseKey('space')
    run(rt, 30)
    expect(copyOf(rt, 'j').y).toBe(10)
  })
})

describe('what blocks you', () => {
  it('passes through bricks that are not solid', () => {
    const ghost = brick('g', 'Ghost', 100, 20, [])
    const rt = play(level([ghost, faller()], [{ id: 'g', brickId: 'g', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 60)
    expect(copyOf(rt, 'f').y).toBe(10)
  })

  it('passes through a platform once it turns solid off', () => {
    const flicker = brick('p', 'Platform', 100, 20, [onFlag(solidOn, stmt('control_wait', {}, { DURATION: lit(2) }), stmt('platformer_setsolid', { SOLID: 'off' }))])
    const rt = play(level([flicker, faller()], [{ id: 'p', brickId: 'p', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(70)
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(10)
  })

  it('hidden solids do not block', () => {
    const hiddenPlat = brick('p', 'Platform', 100, 20, [onFlag(solidOn, stmt('looks_hide'))])
    const rt = play(level([hiddenPlat, faller()], [{ id: 'p', brickId: 'p', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 60)
    expect(copyOf(rt, 'f').y).toBe(10)
  })

  it('a hidden body does not move', () => {
    const ghostFaller = brick('f', 'Faller', 20, 20, [onFlag(gravityOn, stmt('looks_hide'))])
    const rt = play(level([ghostFaller], [{ id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 30)
    expect(copyOf(rt, 'f').y).toBe(200)
  })

  it('copies of a solid brick are all solid', () => {
    const rt = play(level([platform, faller()], [
      { id: 'p1', brickId: 'plat', x: 100, y: 50 },
      { id: 'p2', brickId: 'plat', x: 300, y: 50 },
      { id: 'f1', brickId: 'f', x: 100, y: 200 },
      { id: 'f2', brickId: 'f', x: 300, y: 200 },
    ]))
    run(rt, 40)
    expect([copyOf(rt, 'f1').y, copyOf(rt, 'f2').y]).toEqual([70, 70])
  })

  it('a body does not ride or push: solids stay where Scratch blocks put them', () => {
    const rt = play(level([platform, faller()], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 60)
    expect([copyOf(rt, 'p').x, copyOf(rt, 'p').y]).toEqual([100, 50])
  })
})

describe('bump hats', () => {
  const counter = (id: string): BrickDef['program']['variables'][number] => ({ id, name: id, value: 0 })
  const inc = (id: string) => stmt('data_changevariableby', { VARIABLE: id }, { VALUE: lit(1) })

  it('fires with the right side and brick: top of Platform when it lands, and not the other sides', () => {
    const f = faller(
      [
        whenBump('top', 'Platform', inc('topPlat')),
        whenBump('top', '_edge_', inc('topEdge')),
        whenBump('bottom', 'Platform', inc('bottomPlat')),
        whenBump('left', '_any_', inc('leftAny')),
        whenBump('_any_', '_any_', inc('any')),
      ],
      ['topPlat', 'topEdge', 'bottomPlat', 'leftAny', 'any'].map(counter),
    )
    const rt = play(level([platform, f], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 120 }]))
    run(rt, 30)
    const v = copyOf(rt, 'f').variables
    expect(v.topPlat).toBeGreaterThan(0)
    expect(v.any).toBe(v.topPlat)
    expect([v.topEdge, v.bottomPlat, v.leftAny]).toEqual([0, 0, 0])
  })

  it('fires once per tick while resting, never more (30 ticks resting adds exactly 30)', () => {
    const f = faller([whenBump('top', 'Platform', inc('n')), whenBump('_any_', '_any_', inc('all'))], [counter('n'), counter('all')])
    const rt = play(level([platform, f], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 70 }]))
    run(rt, 3)
    const t = copyOf(rt, 'f')
    const before = t.variables.n as number
    const allBefore = t.variables.all as number
    for (let i = 1; i <= 30; i++) {
      rt.step()
      expect(t.variables.n).toBe(before + i)
    }
    expect(t.variables.all).toBe(allBefore + 30)
  })

  it('the floor counts as an edge: "when I bump top of edge" fires on the floor, not on a platform', () => {
    const f = faller([whenBump('top', '_edge_', inc('floor')), whenBump('top', 'Platform', inc('plat'))], [counter('floor'), counter('plat')])
    const rt = play(level([platform, f], [{ id: 'p', brickId: 'plat', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 300, y: 120 }]))
    run(rt, 40)
    expect(copyOf(rt, 'f').variables.floor).toBeGreaterThan(0)
    expect(copyOf(rt, 'f').variables.plat).toBe(0)
  })

  it('running into a solid fires its left side once (the bump zeroes the speed, so there is no repeat)', () => {
    const wall = brick('w', 'Wall', 20, 100, [onFlag(solidOn)])
    const runner = brick('r', 'Runner', 20, 20, [onFlag(setSpeed('x', 7)), whenBump('left', 'Wall', inc('hits')), whenBump('right', 'Wall', inc('wrong'))], [counter('hits'), counter('wrong')])
    const rt = play(level([wall, runner], [{ id: 'w', brickId: 'w', x: 200, y: 150 }, { id: 'r', brickId: 'r', x: 100, y: 150 }]))
    run(rt, 60)
    const v = copyOf(rt, 'r').variables
    expect(v.hits).toBe(1) // vx was zeroed by the bump, so nothing pushes again
    expect(v.wrong).toBe(0)
  })

  it('"when I bump right of edge" fires at the left wall; "left of edge" at the right wall', () => {
    const l = brick('l', 'L', 20, 20, [onFlag(setSpeed('x', -9)), whenBump('right', '_edge_', inc('n'))], [counter('n')])
    const r = brick('r', 'R', 20, 20, [onFlag(setSpeed('x', 9)), whenBump('left', '_edge_', inc('n'))], [counter('n')])
    const rt = play(level([l, r], [{ id: 'l', brickId: 'l', x: 100, y: 150 }, { id: 'r', brickId: 'r', x: 300, y: 250 }]))
    run(rt, 60)
    expect(copyOf(rt, 'l').variables.n).toBe(1)
    expect(copyOf(rt, 'r').variables.n).toBe(1)
  })

  it('bumping the head fires "bottom of <brick>"', () => {
    const ceiling = brick('c', 'Ceiling', 100, 20, [onFlag(solidOn)])
    const up = brick('u', 'Up', 20, 20, [onFlag(setSpeed('y', 5)), whenBump('bottom', 'Ceiling', inc('n'))], [counter('n')])
    const rt = play(level([ceiling, up], [{ id: 'c', brickId: 'c', x: 100, y: 110 }, { id: 'u', brickId: 'u', x: 100, y: 50 }]))
    run(rt, 30)
    expect(copyOf(rt, 'u').variables.n).toBe(1)
  })

  it('a bump hat matches clones of the brick by name', () => {
    const maker = brick('m', 'Maker', 100, 20, [onFlag(solidOn, stmt('control_create_clone_of', { CLONE_OPTION: '_myself_' }), stmt('looks_hide'))])
    const f = faller([whenBump('top', 'Maker', inc('n'))], [counter('n')])
    // The original Maker hides itself, so the only solid left is its clone.
    const rt = play(level([maker, f], [{ id: 'm', brickId: 'm', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 120 }]))
    run(rt, 30)
    expect(copyOf(rt, 'f').variables.n).toBeGreaterThan(0)
    expect(copyOf(rt, 'f').y).toBe(70)
  })
})

describe('clones', () => {
  it('a clone keeps its body (gravity, solid, speeds) and moves on its own from there', () => {
    const f = brick('f', 'F', 20, 20, [onFlag(gravityOn, setSpeed('x', 3), stmt('control_create_clone_of', { CLONE_OPTION: '_myself_' }))])
    const rt = play(level([f], [{ id: 'f', brickId: 'f', x: 100, y: 200 }]))
    rt.step()
    const clone = rt.world.targets.find((t) => t.isClone)!
    const orig = copyOf(rt, 'f')
    // The clone was made mid-tick with the original's body; physics then moved both by the same amount.
    expect(clone.body).toEqual({ gravity: true, solid: false, vx: 3, vy: -1, onGround: false })
    expect([clone.x, clone.y]).toEqual([103, 199])
    expect(clone.body).not.toBe(orig.body)
    run(rt, 60)
    expect(clone.y).toBe(10)
    expect(orig.y).toBe(10)
    expect(clone.x).toBe(orig.x)
  })

  it('a clone of a solid brick is solid', () => {
    const maker = brick('m', 'Maker', 100, 20, [onFlag(solidOn, stmt('control_create_clone_of', { CLONE_OPTION: '_myself_' }), stmt('looks_hide'))])
    const rt = play(level([maker, faller()], [{ id: 'm', brickId: 'm', x: 100, y: 50 }, { id: 'f', brickId: 'f', x: 100, y: 200 }]))
    run(rt, 40)
    expect(copyOf(rt, 'f').y).toBe(70)
  })

  it('a target without a body clones without one', () => {
    const f = brick('f', 'F', 20, 20, [onFlag(stmt('control_create_clone_of', { CLONE_OPTION: '_myself_' }))])
    const rt = play(level([f], [{ id: 'f', brickId: 'f', x: 100, y: 200 }]))
    rt.step()
    expect(rt.world.targets.find((t) => t.isClone)!.body).toBeUndefined()
  })
})

describe('replay', () => {
  it('the same inputs give the same positions for 300 ticks', () => {
    const jumpScript = onFlag(
      stmt('control_forever', {}, {}, [
        [
          stmt('control_if', {}, { CONDITION: block('operator_and', {}, { OPERAND1: block('platformer_onground'), OPERAND2: block('sensing_keypressed', {}, { KEY_OPTION: lit('space') }) }) }, [[setSpeed('y', 12)]]),
          stmt('control_if', {}, { CONDITION: block('sensing_keypressed', {}, { KEY_OPTION: lit('right arrow') }) }, [[setSpeed('x', 4)]]),
          stmt('control_wait', {}, { DURATION: lit(0) }),
        ],
      ]),
    )
    const hero = brick('h', 'Hero', 20, 20, [onFlag(gravityOn), jumpScript])
    const d = level([platform, hero], [{ id: 'p', brickId: 'plat', x: 200, y: 50 }, { id: 'p2', brickId: 'plat', x: 300, y: 90 }, { id: 'h', brickId: 'h', x: 60, y: 10 }])
    const once = () => {
      const rt = play(d)
      const trace: number[][] = []
      for (let i = 0; i < 300; i++) {
        if (i % 40 === 5) rt.pressKey('space')
        if (i % 40 === 6) rt.releaseKey('space')
        if (i === 10) rt.pressKey('right arrow')
        if (i === 200) rt.releaseKey('right arrow')
        rt.step()
        const h = copyOf(rt, 'h')
        trace.push([h.x, h.y, h.body!.vx, h.body!.vy, h.body!.onGround ? 1 : 0])
      }
      return trace
    }
    const a = once()
    expect(a).toEqual(once())
    // It really moved and really jumped (the replay is not just standing still).
    expect(new Set(a.map((p) => p[0])).size).toBeGreaterThan(20)
    expect(Math.max(...a.map((p) => p[1]))).toBeGreaterThan(70)
  })
})
