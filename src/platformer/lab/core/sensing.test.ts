import { describe, expect, it } from 'vitest'
import { YIELD } from './contracts'
import type { Costume, Primitive, Target, Value } from './contracts'
import { makeClone } from './clones'
import {
  activeQuestion,
  clearQuestions,
  clearTargetQuestions,
  resetAnswer,
  sensingPrimitives,
  setDragged,
  setHostClock,
  submitAnswer,
} from './sensing'
import { boxBrick, callPrimitive, fakeRuntime, makeTarget, makeWorld, type FakeRuntime } from './testkit'

const P = sensingPrimitives

function ask(rt: FakeRuntime, target: Target, frame: Record<string, unknown>, question?: string) {
  return P.sensing_askandwait({
    target,
    runtime: rt,
    thread: { id: 1, target, done: false },
    arg: (name) => (name === 'QUESTION' && question !== undefined ? question : ''),
    field: () => '',
    frame,
    warp: false,
  })
}

function run(prim: Primitive, rt: FakeRuntime, opts: { target?: Target; args?: Record<string, Value>; fields?: Record<string, string> } = {}) {
  return callPrimitive(prim, { runtime: rt, ...opts }).result
}

function dotCostume(): Costume {
  return { name: 'dot', width: 2, height: 2, rotationCenterX: 1, rotationCenterY: 1 }
}

describe('sensing', () => {
  it('S01 · sprite touching follows opaque pixels', () => {
    const hollow: Costume = {
      name: 'hollow',
      width: 4,
      height: 4,
      rotationCenterX: 2,
      rotationCenterY: 2,
      mask: {
        width: 4,
        height: 4,
        data: Uint8Array.from([
          1, 1, 1, 1,
          1, 0, 0, 1,
          1, 0, 0, 1,
          1, 1, 1, 1,
        ]),
      },
    }
    const column: Costume = {
      name: 'column',
      width: 4,
      height: 4,
      rotationCenterX: 2,
      rotationCenterY: 2,
      mask: {
        width: 4,
        height: 4,
        data: Uint8Array.from([
          0, 0, 0, 0,
          0, 0, 0, 1,
          0, 0, 0, 1,
          0, 0, 0, 0,
        ]),
      },
    }
    const brickA = boxBrick('a', 'A')
    const brickB = boxBrick('b', 'B')
    brickA.costumes = [hollow]
    brickB.costumes = [column]
    const a = makeTarget({ id: 'a', brickId: 'a', x: 0, y: 0 })
    // B's right column sits in A's center hole: centers around x = 1.5, inside the 4px hole.
    const b = makeTarget({ id: 'b', brickId: 'b', x: 0, y: 0 })
    const world = makeWorld({ bricks: [brickA, brickB], targets: [a, b] })
    const rt = fakeRuntime(world)
    // Same origin: B's column is on A's right border, so the borders touch.
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: 'B' } })).toBe(true)
    b.x = -2
    // Column moves into the hole (local x of those samples is 1 or 2 on A).
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: 'B' } })).toBe(false)
    b.x = -3
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: 'B' } })).toBe(true)
  })

  it('S02 · named sprite includes clones and skips a dragged candidate', () => {
    const brickA = boxBrick('a', 'A', 10, 10)
    const brickB = boxBrick('b', 'B', 10, 10)
    const a = makeTarget({ id: 'a', brickId: 'a', x: 0, y: 0 })
    const original = makeTarget({ id: 'b', brickId: 'b', x: 200, y: 0 })
    const world = makeWorld({ bricks: [brickA, brickB], targets: [a, original] })
    const clone = makeClone(world, original)
    clone.x = 0
    clone.y = 0
    world.targets.push(clone)
    world.cloneCount = 1
    const rt = fakeRuntime(world)
    expect(run(P.sensing_touchingobject, rt, { target: a, args: { TOUCHINGOBJECTMENU: 'B' } })).toBe(true)
    setDragged(clone, true)
    expect(run(P.sensing_touchingobject, rt, { target: a, args: { TOUCHINGOBJECTMENU: 'B' } })).toBe(false)
    // The dragged clone can still sense A.
    expect(run(P.sensing_touchingobject, rt, { target: clone, args: { TOUCHINGOBJECTMENU: 'A' } })).toBe(true)
    setDragged(clone, false)
    expect(run(P.sensing_touchingobject, rt, { target: a, args: { TOUCHINGOBJECTMENU: 'B' } })).toBe(true)
    expect(run(P.sensing_touchingobject, rt, { target: a, args: { TOUCHINGOBJECTMENU: 'A' } })).toBe(false)
    expect(run(P.sensing_touchingobject, rt, { target: a, args: { TOUCHINGOBJECTMENU: 'Missing' } })).toBe(false)
  })

  it('S03 · hidden asymmetry', () => {
    const brickA = boxBrick('a', 'A', 10, 10)
    const brickB = boxBrick('b', 'B', 10, 10)
    const a = makeTarget({ id: 'a', brickId: 'a', x: 0, y: 0, visible: false })
    const b = makeTarget({ id: 'b', brickId: 'b', x: 0, y: 0 })
    const world = makeWorld({ bricks: [brickA, brickB], targets: [a, b] })
    world.mouse = { x: 0, y: 0, down: false }
    const rt = fakeRuntime(world)
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: 'B' } })).toBe(false)
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: '_mouse_' } })).toBe(true)
    expect(run(P.sensing_touchingcolor, rt, { target: a, args: { COLOR: '#fff' } })).toBe(false)
    a.visible = true
    b.visible = false
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: 'B' } })).toBe(false)
    world.mouse = { x: 1000, y: 1000, down: false }
    expect(run(P.sensing_touchingobject, rt, { target: a, fields: { TOUCHINGOBJECTMENU: '_mouse_' } })).toBe(false)
  })

  it('M13 · touching edge uses the level bounds', () => {
    const sprite = makeTarget({ x: 470, y: 180 })
    const world = makeWorld({ targets: [sprite], bounds: { left: 0, right: 480, bottom: 0, top: 360 } })
    const rt = fakeRuntime(world)
    expect(run(P.sensing_touchingobject, rt, { fields: { TOUCHINGOBJECTMENU: '_edge_' } })).toBe(false)
    sprite.x = 470.1
    expect(run(P.sensing_touchingobject, rt, { fields: { TOUCHINGOBJECTMENU: '_edge_' } })).toBe(true)
    sprite.visible = false
    expect(run(P.sensing_touchingobject, rt, { fields: { TOUCHINGOBJECTMENU: '_edge_' } })).toBe(true)
  })

  it('S07 · distance', () => {
    const brickB = boxBrick('b', 'B')
    const a = makeTarget({ id: 'a', brickId: 'a', x: 0, y: 0 })
    const b = makeTarget({ id: 'b', brickId: 'b', x: 3, y: 4 })
    const world = makeWorld({ bricks: [boxBrick('a', 'A'), brickB], targets: [a, b] })
    const rt = fakeRuntime(world)
    expect(run(P.sensing_distanceto, rt, { target: a, fields: { DISTANCETOMENU: 'B' } })).toBe(5)
    expect(run(P.sensing_distanceto, rt, { target: a, fields: { DISTANCETOMENU: 'Nope' } })).toBe(10000)
    expect(run(P.sensing_distanceto, rt, { target: world.stage, fields: { DISTANCETOMENU: 'B' } })).toBe(10000)
    const clone = makeClone(world, b)
    clone.x = 99
    clone.y = 99
    world.targets.push(clone)
    expect(run(P.sensing_distanceto, rt, { target: a, fields: { DISTANCETOMENU: 'B' } })).toBe(5)
    world.mouse = { x: 6, y: 8, down: false }
    expect(run(P.sensing_distanceto, rt, { target: a, fields: { DISTANCETOMENU: '_mouse_' } })).toBe(10)
    expect(run(P.sensing_distanceto, rt, { target: world.stage, fields: { DISTANCETOMENU: '_mouse_' } })).toBe(10000)
  })

  it('S08 · attribute of', () => {
    const cat = boxBrick('cat', 'Cat', 20, 20, {
      program: {
        scripts: [],
        procedures: [],
        variables: [{ id: 'hp', name: 'HP', value: 0 }],
        lists: [{ id: 'bag', name: 'bag', value: [1] }],
      },
    })
    cat.costumes = [
      { name: 'walk', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
      { name: 'jump', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
    ]
    const stageBrick = boxBrick('stage', 'Stage')
    stageBrick.isStage = true
    stageBrick.costumes = [
      dotCostume(),
      { name: 'night', width: 1, height: 1, rotationCenterX: 0, rotationCenterY: 0 },
    ]
    stageBrick.program = {
      scripts: [],
      procedures: [],
      variables: [{ id: 'score', name: 'score', value: 0 }],
      lists: [],
    }
    const original = makeTarget({
      id: 'cat',
      brickId: 'cat',
      x: 1 + 1e-10,
      y: -4,
      direction: -90,
      size: 75,
      costumeIndex: 1,
      volume: 40,
      variables: { hp: 7 },
      lists: { bag: [1, 2] },
    })
    const other = makeTarget({ id: 'other', brickId: 'cat', x: 50, y: 50, variables: { hp: 1 } })
    const world = makeWorld({ bricks: [cat], targets: [original, other] })
    world.bricks.stage = stageBrick
    world.stage.brickId = 'stage'
    world.stage.costumeIndex = 1
    world.stage.volume = 80
    world.stage.variables = { score: 9 }
    const clone = makeClone(world, original)
    clone.variables.hp = 3
    clone.x = 99
    world.targets.push(clone)
    const rt = fakeRuntime(world)
    const of = (property: string, object: string, target = original) =>
      run(P.sensing_of, rt, { target, args: { OBJECT: object }, fields: { PROPERTY: property } })

    expect(of('HP', 'Cat')).toBe(7)
    expect(of('nope', 'Cat')).toBe(0)
    expect(of('HP', 'Missing')).toBe(0)
    expect(of('bag', 'Cat')).toBe(0)
    expect(of('x position', 'Cat')).toBe(1 + 1e-10)
    expect(of('y position', 'Cat')).toBe(-4)
    expect(of('direction', 'Cat')).toBe(-90)
    expect(of('costume #', 'Cat')).toBe(2)
    expect(of('costume name', 'Cat')).toBe('jump')
    expect(of('size', 'Cat')).toBe(75)
    expect(of('volume', 'Cat')).toBe(40)
    // The second painted copy is not the one a name resolves.
    expect(of('HP', 'Cat', other)).toBe(7)
    expect(of('score', 'Cat')).toBe(0)
    expect(of('score', '_stage_')).toBe(9)
    expect(of('backdrop #', '_stage_')).toBe(2)
    expect(of('backdrop name', '_stage_')).toBe('night')
    expect(of('background #', '_stage_')).toBe(2)
    expect(of('volume', '_stage_')).toBe(80)
    expect(of('x position', '_stage_')).toBe(0)
    expect(of('backdrop #', 'Cat')).toBe(0)
    original.variables.hp = false
    expect(of('HP', 'Cat')).toBe(false)
  })

  it('S09 · timer', () => {
    const world = makeWorld()
    const rt = fakeRuntime(world)
    expect(run(P.sensing_timer, rt)).toBe(0)
    expect(run(P.sensing_timer, rt)).toBe(0)
    world.tick = 15
    expect(run(P.sensing_timer, rt)).toBe(0.5)
    world.tick = 30
    expect(run(P.sensing_timer, rt)).toBe(1)
    const started = world.timerStartTick
    run(P.sensing_answer, rt)
    run(P.sensing_loudness, rt)
    expect(world.timerStartTick).toBe(started)
    run(P.sensing_resettimer, rt)
    expect(world.timerStartTick).toBe(30)
    expect(run(P.sensing_timer, rt)).toBe(0)
    world.tick = 60
    expect(run(P.sensing_timer, rt)).toBe(1)
  })

  it('S10 · key names', () => {
    const world = makeWorld()
    world.keysDown.add('a')
    const rt = fakeRuntime(world)
    const down = (option: Value) => run(P.sensing_keypressed, rt, { args: { KEY_OPTION: option } })
    expect(down('A')).toBe(true)
    expect(down(65)).toBe(true)
    expect(down('apple')).toBe(true)
    expect(down('b')).toBe(false)
    expect(down('Shift')).toBe(false)
    expect(down('Space')).toBe(false)
    world.keysDown.add('s')
    expect(down('Shift')).toBe(true)
    world.keysDown.add('space')
    expect(down('space')).toBe(true)
    expect(down(32)).toBe(true)
    expect(down(' ')).toBe(true)
    expect(down('Space')).toBe(true)
    world.keysDown.add('left arrow')
    expect(run(P.sensing_keypressed, rt, { fields: { KEY_OPTION: 'left arrow' } })).toBe(true)
    expect(down(37)).toBe(true)
    expect(down(38)).toBe(false)
    expect(down(13)).toBe(false)
    world.keysDown.add('enter')
    expect(down('enter')).toBe(true)
    world.keysDown.delete('a')
    world.keysDown.add('A')
    expect(down('a')).toBe(true)
    expect(down('any')).toBe(true)
    world.keysDown.clear()
    expect(down('any')).toBe(false)
  })

  it('S12 · ask queue', () => {
    const a = makeTarget({ id: 'A', brickId: 'a', visible: true })
    const b = makeTarget({ id: 'B', brickId: 'b', visible: false })
    const world = makeWorld({
      bricks: [boxBrick('a', 'A'), boxBrick('b', 'B')],
      targets: [a, b],
    })
    world.answer = 'old'
    const rt = fakeRuntime(world)
    const frameA: Record<string, unknown> = {}
    const frameB: Record<string, unknown> = {}
    expect(ask(rt, a, frameA, 'first')).toBe(YIELD)
    expect(ask(rt, b, frameB, 'second')).toBe(YIELD)
    expect(rt.notes).toEqual([{ kind: 'ask', targetId: 'A', question: 'first' }])
    expect(activeQuestion(world)).toEqual({ targetId: 'A', question: 'first', visible: true, isStage: false })
    expect(world.answer).toBe('old')
    // A bare write does not resolve the ask, so '' can still be a real answer later.
    world.answer = 'typed-only'
    expect(ask(rt, a, frameA)).toBe(YIELD)
    submitAnswer(rt, 'x')
    expect(world.answer).toBe('x')
    expect(rt.notes[1]).toEqual({ kind: 'ask', targetId: 'B', question: 'second' })
    expect(activeQuestion(world)?.visible).toBe(false)
    expect(ask(rt, a, frameA)).toBeUndefined()
    expect(ask(rt, b, frameB)).toBe(YIELD)
    expect(run(P.sensing_answer, rt, { target: a })).toBe('x')
    expect(run(P.sensing_answer, rt, { target: b })).toBe('x')
    submitAnswer(rt, '')
    expect(world.answer).toBe('')
    expect(ask(rt, b, frameB)).toBeUndefined()
    expect(run(P.sensing_answer, rt, { target: a })).toBe('')
    expect(activeQuestion(world)).toBeNull()
  })

  it('S13 · shared answer and reset', () => {
    const a = makeTarget({ id: 'A' })
    const b = makeTarget({ id: 'B', brickId: 'b' })
    const world = makeWorld({ bricks: [boxBrick('b1', 'Brick'), boxBrick('b', 'B')], targets: [a, b] })
    const rt = fakeRuntime(world)
    const frameA: Record<string, unknown> = {}
    const frameB: Record<string, unknown> = {}
    expect(ask(rt, a, frameA, 'one')).toBe(YIELD)
    expect(ask(rt, b, frameB, 'two')).toBe(YIELD)
    submitAnswer(rt, 'x')
    expect(ask(rt, a, frameA)).toBeUndefined()
    submitAnswer(rt, 'y')
    expect(run(P.sensing_answer, rt, { target: a })).toBe('y')
    expect(run(P.sensing_answer, rt, { target: b })).toBe('y')
    const frameA2: Record<string, unknown> = {}
    expect(ask(rt, a, frameA2, 'three')).toBe(YIELD)
    resetAnswer(world)
    expect(world.answer).toBe('')
    expect(activeQuestion(world)?.question).toBe('three')
    clearQuestions(rt)
    expect(activeQuestion(world)).toBeNull()
    expect(world.answer).toBe('')
    expect(ask(rt, b, frameB)).toBeUndefined()

    const frameC: Record<string, unknown> = {}
    const frameD: Record<string, unknown> = {}
    expect(ask(rt, a, frameC, 'keep')).toBe(YIELD)
    expect(ask(rt, b, frameD, 'next')).toBe(YIELD)
    clearTargetQuestions(rt, b)
    expect(activeQuestion(world)?.question).toBe('keep')
    const askNotesBefore = rt.notes.filter((note) => note.kind === 'ask').length
    clearTargetQuestions(rt, a)
    // B's question was already removed, so stopping A shows nothing (no new ask note emitted).
    const askNotesAfter = rt.notes.filter((note) => note.kind === 'ask').length
    expect(askNotesAfter).toBe(askNotesBefore)
    expect(activeQuestion(world)).toBeNull()

    clearQuestions(rt)
    const frameE: Record<string, unknown> = {}
    const frameF: Record<string, unknown> = {}
    expect(ask(rt, b, frameE, 'only-b')).toBe(YIELD)
    expect(ask(rt, a, frameF, 'after')).toBe(YIELD)
    clearTargetQuestions(rt, b)
    expect(rt.notes.at(-1)).toEqual({ kind: 'ask', targetId: 'A', question: 'after' })
    expect(activeQuestion(world)?.targetId).toBe('A')
  })

  it('reads the host clock, mouse, drag mode, and the fixed reporters', () => {
    const sprite = makeTarget({ draggable: false })
    const world = makeWorld({ targets: [sprite] })
    world.mouse = { x: 12, y: 34, down: true }
    const rt = fakeRuntime(world)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'YEAR' } })).toBe(0)
    setHostClock(world, { year: 2026, month: 9, date: 30, dayOfWeek: 4, hour: 8, minute: 5, second: 6 })
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'YEAR' } })).toBe(2026)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'month' } })).toBe(9)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'DATE' } })).toBe(30)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'DAYOFWEEK' } })).toBe(4)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'HOUR' } })).toBe(8)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'MINUTE' } })).toBe(5)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'SECOND' } })).toBe(6)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'nope' } })).toBe(0)
    setHostClock(world, null)
    expect(run(P.sensing_current, rt, { fields: { CURRENTMENU: 'YEAR' } })).toBe(0)
    expect(run(P.sensing_mousex, rt)).toBe(12)
    expect(run(P.sensing_mousey, rt)).toBe(34)
    expect(run(P.sensing_mousedown, rt)).toBe(true)
    expect(run(P.sensing_username, rt)).toBe('')
    expect(run(P.sensing_loudness, rt)).toBe(0)
    expect(run(P.sensing_loud, rt)).toBe(false)
    expect(run(P.sensing_dayssince2000, rt)).toBe(0)
    expect(run(P.sensing_userid, rt)).toBe('')
    expect(run(P.sensing_touchingcolor, rt)).toBe(false)
    expect(run(P.sensing_coloristouchingcolor, rt)).toBe(false)
    run(P.sensing_setdragmode, rt, { fields: { DRAG_MODE: 'draggable' } })
    expect(sprite.draggable).toBe(true)
    run(P.sensing_setdragmode, rt, { fields: { DRAG_MODE: 'not draggable' } })
    expect(sprite.draggable).toBe(false)
    run(P.sensing_setdragmode, rt, { target: world.stage, fields: { DRAG_MODE: 'draggable' } })
    expect(world.stage.draggable).toBe(false)
  })

  it('a numeric question is stored as text', () => {
    const world = makeWorld()
    const rt = fakeRuntime(world)
    const frame: Record<string, unknown> = {}
    expect(ask(rt, world.targets[0]!, frame, 12 as unknown as string)).toBe(YIELD)
    // ask() only forwards strings; call the primitive with a numeric input directly.
    const frameN: Record<string, unknown> = {}
    P.sensing_askandwait({
      target: world.targets[0]!,
      runtime: rt,
      thread: { id: 1, target: world.targets[0]!, done: false },
      arg: (name) => (name === 'QUESTION' ? 12 : ''),
      field: () => '',
      frame: frameN,
      warp: false,
    })
    expect(rt.notes.at(-1)).toEqual({ kind: 'ask', targetId: world.targets[0]!.id, question: '12' })
  })
})
