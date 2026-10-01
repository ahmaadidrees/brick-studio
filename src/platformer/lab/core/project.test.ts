import { describe, expect, it } from 'vitest'
import { CLONE_LIMIT } from './contracts'
import type { BrickDef, BrickProgram, Costume, LevelDesign, Script, Value } from './contracts'
import { instantiate, validateDesign } from './project'
import { nextFloat, seedState } from './rng'
import { makeTarget } from './testkit'

function costume(name = 'costume1', w = 32, h = 32): Costume {
  return { name, width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }
}

function program(over: Partial<BrickProgram> = {}): BrickProgram {
  return { scripts: [], procedures: [], variables: [], lists: [], ...over }
}

function stageBrick(over: Partial<BrickDef> = {}): BrickDef {
  return {
    id: 'stage',
    name: 'Stage',
    isStage: true,
    costumes: [costume('backdrop1', 480, 360)],
    sounds: [],
    program: program({
      variables: [{ id: 'g-score', name: 'score', value: 0 }],
      lists: [{ id: 'g-log', name: 'log', value: [1] }],
    }),
    ...over,
  }
}

function walkerBrick(over: Partial<BrickDef> = {}): BrickDef {
  return {
    id: 'walker',
    name: 'Walker',
    costumes: [costume(), costume('walk2')],
    sounds: [{ name: 'jump', durationMs: 200 }],
    program: program({
      variables: [
        { id: 'v-speed', name: 'speed', value: 4, showInBuild: true },
        { id: 'v-label', name: 'label', value: '02' },
      ],
      lists: [{ id: 'l-path', name: 'path', value: [1, 'a', true] }],
    }),
    ...over,
  }
}

function level(over: Partial<LevelDesign> = {}): LevelDesign {
  return {
    id: 'lvl-1',
    name: 'First level',
    seed: 7,
    bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: stageBrick(),
    bricks: [walkerBrick()],
    copies: [
      { id: 'copy-a', brickId: 'walker', x: 12, y: 8, knobs: { 'v-speed': 9 } },
      { id: 'copy-b', brickId: 'walker', x: 40, y: 8 },
    ],
    ...over,
  }
}

/** The lookup the data lane must use: own record, then the stage (D02). */
function readVar(world: ReturnType<typeof instantiate>, targetIndex: number | 'stage', id: string): Value | undefined {
  const target = targetIndex === 'stage' ? world.stage : world.targets[targetIndex]
  if (Object.hasOwn(target.variables, id)) return target.variables[id]
  if (Object.hasOwn(world.stage.variables, id)) return world.stage.variables[id]
  return undefined
}

function readList(world: ReturnType<typeof instantiate>, targetIndex: number | 'stage', id: string): Value[] | undefined {
  const target = targetIndex === 'stage' ? world.stage : world.targets[targetIndex]
  if (Object.hasOwn(target.lists, id)) return target.lists[id]
  if (Object.hasOwn(world.stage.lists, id)) return world.stage.lists[id]
  return undefined
}

describe('instantiate', () => {
  it('builds the stage and one non-clone target per copy, back to front', () => {
    const world = instantiate(level())
    expect(world.stage.isStage).toBe(true)
    expect(world.stage.isClone).toBe(false)
    expect(world.stage.id).toBe('stage')
    expect(world.stage.copyId).toBeUndefined()
    expect(world.stage.x).toBe(0)
    expect(world.stage.y).toBe(0)
    expect(world.targets.map((t) => t.id)).toEqual(['copy-a', 'copy-b'])
    for (const target of world.targets) {
      expect(target.isClone).toBe(false)
      expect(target.isStage).toBe(false)
      expect(target.copyId).toBe(target.id)
      expect(target.brickId).toBe('walker')
    }
    expect(world.targets).not.toContain(world.stage)
  })

  it('applies placement pose and brick defaults', () => {
    const design = level({
      copies: [
        { id: 'copy-a', brickId: 'walker', x: 12, y: 3, direction: -90, size: 50, costume: 1, visible: false },
      ],
    })
    const target = instantiate(design).targets[0]
    expect(target).toMatchObject({
      x: 12,
      y: 3,
      direction: -90,
      size: 50,
      costumeIndex: 1,
      visible: false,
      draggable: false,
      rotationStyle: 'all around',
      volume: 100,
      bubble: null,
    })
    expect(target.soundEffects).toEqual({ pitch: 0, pan: 0 })
    expect(target.effects.ghost).toBe(0)
    expect(target.edgeHatState).toEqual({})
  })

  it('fills missing pose fields and wraps direction into (-180, 180]', () => {
    const design = level({
      copies: [
        { id: 'copy-a', brickId: 'walker', x: 1, y: 2, direction: 450 },
        { id: 'copy-b', brickId: 'walker', x: 3, y: 4, direction: -180 },
        { id: 'copy-c', brickId: 'walker', x: 5, y: 6 },
      ],
    })
    const [a, b, c] = instantiate(design).targets
    expect(a.direction).toBe(90)
    expect(b.direction).toBe(180)
    expect(c).toMatchObject({ direction: 90, size: 100, visible: true, costumeIndex: 0 })
  })

  it('keeps a showInBuild knob on that copy only, including 0 and false', () => {
    const design = level({
      bricks: [
        walkerBrick({
          program: program({
            variables: [
              { id: 'v-speed', name: 'speed', value: 4, showInBuild: true },
              { id: 'v-on', name: 'on', value: true, showInBuild: true },
              { id: 'v-label', name: 'label', value: '02' },
            ],
            lists: [],
          }),
        }),
      ],
      copies: [
        { id: 'copy-a', brickId: 'walker', x: 0, y: 0, knobs: { 'v-speed': 0, 'v-on': false, 'v-label': 'no' } },
        { id: 'copy-b', brickId: 'walker', x: 1, y: 0 },
      ],
    })
    const world = instantiate(design)
    expect(world.targets[0].variables['v-speed']).toBe(0)
    expect(world.targets[0].variables['v-on']).toBe(false)
    expect(world.targets[0].variables['v-label']).toBe('02')
    expect(world.targets[1].variables['v-speed']).toBe(4)
    expect(world.targets[1].variables['v-on']).toBe(true)
    expect(world.bricks['walker'].program.variables.map((v) => v.value)).toEqual([4, true, '02'])
  })

  it('does not let a session mutate the design, the brick defaults, or another play', () => {
    const mask = new Uint8Array([1, 0, 0, 1])
    const design = level()
    design.bricks[0].costumes[0].mask = { width: 2, height: 2, data: mask }
    design.bricks[0].program.scripts = [
      {
        id: 'scr-flag',
        hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
        body: [{ opcode: 'motion_movesteps', inputs: { STEPS: { kind: 'lit', value: 10 } }, fields: {} }],
      },
    ]
    const first = instantiate(design)
    first.targets[0].x = 99
    first.targets[0].variables['v-speed'] = 0
    first.targets[0].lists['l-path'].push(2)
    first.stage.lists['g-log'].push(5)
    first.bounds.right = 1
    first.bricks['walker'].program.scripts[0].body[0].opcode = 'motion_turnright'
    first.bricks['walker'].costumes[0].mask!.data[0] = 0
    first.bricks['walker'].program.lists[0].value.push(8)
    design.copies[0].knobs!['v-speed'] = 3

    expect(design.copies[0].x).toBe(12)
    expect(design.bricks[0].program.variables[0].value).toBe(4)
    expect(design.bricks[0].program.lists[0].value).toEqual([1, 'a', true])
    expect(design.stage.program.lists[0].value).toEqual([1])
    expect(design.bounds.right).toBe(480)
    expect(design.bricks[0].program.scripts[0].body[0].opcode).toBe('motion_movesteps')
    expect(Array.from(mask)).toEqual([1, 0, 0, 1])

    const second = instantiate(design)
    expect(second.targets[0].x).toBe(12)
    expect(second.targets[0].variables['v-speed']).toBe(3)
    expect(second.targets[0].lists['l-path']).toEqual([1, 'a', true])
    expect(second).not.toBe(first)
    expect(second.targets[0].lists['l-path']).not.toBe(first.targets[0].lists['l-path'])
    expect(first.targets[0].x).toBe(99)
  })

  it('gives every target its own effects, lists, and edge-hat map', () => {
    const world = instantiate(level())
    world.targets[0].effects.ghost = 40
    world.targets[0].edgeHatState['timer'] = true
    expect(world.targets[1].effects.ghost).toBe(0)
    expect(world.stage.effects.ghost).toBe(0)
    expect(world.targets[1].edgeHatState).toEqual({})
  })

  it('seeds the RNG from the design and starts a quiet session', () => {
    const design = level({ seed: 7 })
    const a = instantiate(design)
    const b = instantiate(design)
    expect(a.rngState).toBe(seedState(7))
    expect([nextFloat(a), nextFloat(a), nextFloat(a)]).toEqual([nextFloat(b), nextFloat(b), nextFloat(b)])
    const other = instantiate(level({ seed: 8 }))
    expect(nextFloat(other)).not.toBe(nextFloat(instantiate(design)))
    expect(a.tick).toBe(0)
    expect(a.timerStartTick).toBe(0)
    expect(a.answer).toBe('')
    expect(a.mouse).toEqual({ x: 0, y: 0, down: false })
    expect([...a.keysDown]).toEqual([])
    expect(a.cloneCount).toBe(0)
  })

  it('keeps painted copies out of the clone counter', () => {
    const copies = Array.from({ length: CLONE_LIMIT + 1 }, (_, i) => ({
      id: `copy-${i}`,
      brickId: 'walker',
      x: i,
      y: 0,
    }))
    const world = instantiate(level({ copies }))
    expect(world.targets).toHaveLength(CLONE_LIMIT + 1)
    expect(world.cloneCount).toBe(0)
    expect(world.targets.every((t) => !t.isClone)).toBe(true)
  })

  it('numbers runtime ids above any decimal target id', () => {
    const world = instantiate(level({ copies: [{ id: '5', brickId: 'walker', x: 0, y: 0 }] }))
    expect(world.nextTargetId).toBe(6)
    expect(instantiate(level()).nextTargetId).toBe(1)
  })

  it('keeps an unknown brick as an empty copy instead of dropping it', () => {
    const world = instantiate(
      level({ copies: [{ id: 'copy-z', brickId: 'missing', x: 4, y: 5 }] }),
    )
    expect(world.targets[0]).toMatchObject({ id: 'copy-z', brickId: 'missing', x: 4, y: 5, costumeIndex: 0 })
    expect(world.targets[0].variables).toEqual({})
    expect(world.bricks['missing']).toBeUndefined()
  })

  it('throws when the design has no structure to copy', () => {
    expect(() => instantiate(undefined as unknown as LevelDesign)).toThrow(/stage/)
  })
})

describe('H01 · Play reloads the saved design', () => {
  it('H01 · Play reloads the saved design', () => {
    // Decision 1. Inside a session, green flag keeps x and v (scheduler H01).
    // Play discards that session and builds from the design again.
    const design = level({
      stage: stageBrick({ program: program({ variables: [{ id: 'g', name: 'g', value: 0 }], lists: [] }) }),
      bricks: [
        walkerBrick({
          program: program({
            variables: [{ id: 'v', name: 'v', value: 7 }],
            lists: [{ id: 'L', name: 'L', value: [1] }],
          }),
        }),
      ],
      copies: [{ id: 'copy-a', brickId: 'walker', x: 12, y: 4 }],
    })
    const session = instantiate(design)
    session.targets[0].x = 99
    session.targets[0].variables['v'] = 0
    session.targets[0].effects.ghost = 50
    session.targets[0].size = 80
    session.targets[0].costumeIndex = 1
    session.targets[0].lists['L'] = [9]
    session.stage.variables['g'] = 5
    session.tick = 40
    session.timerStartTick = 3
    session.answer = 'hi'
    session.cloneCount = 1
    session.targets.push(makeTarget({ id: 'clone-1', brickId: 'walker', isClone: true, x: 50, copyId: 'copy-a' }))

    expect(design.copies[0].x).toBe(12)
    expect(design.bricks[0].program.variables[0].value).toBe(7)
    expect(design.bricks[0].program.lists[0].value).toEqual([1])

    const played = instantiate(design)
    expect(played.targets).toHaveLength(1)
    expect(played.targets[0].isClone).toBe(false)
    expect(played.targets[0].x).toBe(12)
    expect(played.targets[0].variables['v']).toBe(7)
    expect(played.targets[0].lists['L']).toEqual([1])
    expect(played.targets[0].effects.ghost).toBe(0)
    expect(played.targets[0].size).toBe(100)
    expect(played.targets[0].costumeIndex).toBe(0)
    expect(played.stage.variables['g']).toBe(0)
    expect(played.tick).toBe(0)
    expect(played.timerStartTick).toBe(0)
    expect(played.answer).toBe('')
    expect(played.cloneCount).toBe(0)
    expect(session.targets[0].x).toBe(99)
    expect(session.targets[0].variables['v']).toBe(0)
  })
})

describe('C11 · painted copies keep independent local lists', () => {
  it('C11 · painted copies keep independent local lists', () => {
    const design = level()
    const world = instantiate(design)
    const localA = world.targets[0].lists['l-path']
    const localB = world.targets[1].lists['l-path']
    const global = world.stage.lists['g-log']
    localA.push(2)
    global.push(2)

    expect(localA).toEqual([1, 'a', true, 2])
    expect(localB).toEqual([1, 'a', true])
    expect(localA).not.toBe(localB)
    expect(world.bricks['walker'].program.lists[0].value).toEqual([1, 'a', true])
    expect(design.bricks[0].program.lists[0].value).toEqual([1, 'a', true])
    expect(Object.hasOwn(world.targets[0].lists, 'g-log')).toBe(false)
    expect(Object.hasOwn(world.targets[1].lists, 'g-log')).toBe(false)
    expect(readList(world, 0, 'g-log')).toBe(global)
    expect(readList(world, 1, 'g-log')).toEqual([1, 2])
    expect(readList(world, 'stage', 'g-log')).toBe(global)
    expect(design.stage.program.lists[0].value).toEqual([1])
    expect(world.bricks['stage'].program.lists[0].value).toEqual([1])
    expect(world.bricks['stage'].program.lists[0].value).not.toBe(global)
  })
})

describe('D02 · locals are per copy and globals stay on the stage', () => {
  it('D02 · locals are per copy and globals stay on the stage', () => {
    const design = level({
      stage: stageBrick({
        program: program({
          variables: [{ id: 'g-speed', name: 'speed', value: 9 }],
          lists: [],
        }),
      }),
      bricks: [
        walkerBrick({
          program: program({
            variables: [{ id: 'v-speed', name: 'speed', value: 1, showInBuild: true }],
            lists: [],
          }),
        }),
      ],
      copies: [
        { id: 'copy-a', brickId: 'walker', x: 0, y: 0, knobs: { 'v-speed': 3 } },
        { id: 'copy-b', brickId: 'walker', x: 10, y: 0 },
      ],
    })
    expect(validateDesign(design)).toEqual([])
    const world = instantiate(design)
    world.targets[0].variables['v-speed'] = 8

    expect(world.targets[1].variables['v-speed']).toBe(1)
    expect(world.stage.variables['g-speed']).toBe(9)
    expect(Object.hasOwn(world.targets[0].variables, 'g-speed')).toBe(false)
    expect(readVar(world, 0, 'v-speed')).toBe(8)
    expect(readVar(world, 1, 'v-speed')).toBe(1)
    expect(readVar(world, 0, 'g-speed')).toBe(9)
    expect(readVar(world, 1, 'g-speed')).toBe(9)

    world.stage.variables['g-speed'] = 4
    expect(readVar(world, 0, 'g-speed')).toBe(4)
    expect(readVar(world, 1, 'g-speed')).toBe(4)
    expect(world.targets[0].variables['v-speed']).toBe(8)
    expect(world.targets[1].variables['v-speed']).toBe(1)
  })
})

describe('validateDesign', () => {
  it('accepts a level with scripts, a procedure, a mask, and a unicode name', () => {
    const script: Script = {
      id: 'scr-flag',
      hat: { opcode: 'event_whenflagclicked', fields: { KEY_OPTION: 'space' }, inputs: {} },
      body: [
        {
          opcode: 'control_if',
          inputs: {
            CONDITION: {
              kind: 'block',
              opcode: 'operator_gt',
              inputs: {
                OPERAND1: { kind: 'lit', value: '02' },
                OPERAND2: { kind: 'lit', value: 1 },
              },
              fields: {},
            },
          },
          fields: {},
          branches: [[{ opcode: 'motion_movesteps', inputs: { STEPS: { kind: 'param', name: 'height', boolean: false } }, fields: {} }]],
        },
      ],
    }
    const design = level({
      name: 'コイン',
      bricks: [
        walkerBrick({
          program: program({
            variables: [{ id: 'v-speed', name: 'speed', value: 4, showInBuild: true }],
            lists: [{ id: 'l-path', name: 'path', value: [1] }],
            scripts: [script],
            procedures: [{ proccode: 'jump %s', argumentNames: ['height'], warp: true, body: [] }],
          }),
        }),
      ],
    })
    design.bricks[0].costumes[0].mask = { width: 32, height: 32, data: new Uint8Array(32 * 32).fill(1) }
    design.bricks[0].costumes[0].opaque = { left: 1, top: 1, right: 30, bottom: 30 }
    expect(validateDesign(design)).toEqual([])
  })

  it('reports unknown bricks, duplicate ids, bad costumes, and unsafe names together', () => {
    const design = level({
      name: 'bad\nname',
      seed: -1,
      bounds: { left: 10, right: 10, bottom: 0, top: 10 },
      bricks: [
        walkerBrick(),
        walkerBrick({ id: 'walker', name: 'Walker' }),
        walkerBrick({
          id: 'ghost',
          name: 'constructor',
          costumes: [],
          program: program({
            variables: [{ id: 'g-score', name: 'speed', value: 1 }],
            lists: [],
          }),
        }),
      ],
      copies: [
        { id: 'copy-a', brickId: 'walker', x: 0, y: 0, costume: 2 },
        { id: 'copy-a', brickId: 'nope', x: 0, y: 0 },
        { id: 'stage', brickId: 'ghost', x: 0, y: 0, costume: 0 },
        { id: 'copy-c', brickId: 'not an id', x: 1, y: 1 },
      ],
    })
    const codes = validateDesign(design).map((p) => p.code)
    expect(codes).toContain('unsafe-name')
    expect(codes).toContain('bad-seed')
    expect(codes).toContain('bad-bounds')
    expect(codes).toContain('duplicate-id')
    expect(codes).toContain('duplicate-name')
    expect(codes).toContain('bad-costume')
    expect(codes).toContain('unknown-brick')
    expect(codes).toContain('unsafe-id')
  })

  it('rejects knobs that are not showInBuild variables', () => {
    const hidden = level({
      copies: [{ id: 'copy-a', brickId: 'walker', x: 0, y: 0, knobs: { 'v-label': 'no', 'missing': 1 } }],
    })
    const knobCodes = validateDesign(hidden).map((p) => `${p.code} ${p.path}`)
    expect(knobCodes).toContain('bad-knob copies[0].knobs.v-label')
    expect(knobCodes).toContain('bad-knob copies[0].knobs.missing')

    const staged = level({
      stage: stageBrick({
        program: program({
          variables: [{ id: 'g-score', name: 'score', value: 0, showInBuild: true }],
          lists: [],
        }),
      }),
    })
    expect(validateDesign(staged).some((p) => p.code === 'bad-knob' && p.path.includes('showInBuild'))).toBe(true)
  })

  it('rejects a sprite marked as the stage, a bad hat, and a non-finite value', () => {
    const design = level({
      stage: stageBrick({ isStage: false }),
      bricks: [
        walkerBrick({
          isStage: true,
          program: program({
            variables: [{ id: 'v-speed', name: 'speed', value: Number.NaN, showInBuild: true }],
            lists: [{ id: 'l-path', name: 'path', value: [1, { nope: true } as unknown as Value] }],
            scripts: [{ id: 'scr-flag', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: [] }, { id: 'scr-flag', hat: { opcode: 'not_a_hat' as 'event_whenflagclicked', fields: {}, inputs: {} }, body: [] }],
            procedures: [
              { proccode: 'jump %s', argumentNames: ['height'], warp: false, body: [] },
              { proccode: 'jump %s', argumentNames: ['height'], warp: false, body: [] },
            ],
          }),
        }),
      ],
    })
    const codes = validateDesign(design).map((p) => p.code)
    expect(codes).toContain('bad-stage')
    expect(codes).toContain('bad-value')
    expect(codes).toContain('duplicate-id')
  })

  it('rejects an over-long saved list and too many painted copies', () => {
    const design = level({
      bricks: [
        walkerBrick({
          program: program({
            variables: [],
            lists: [{ id: 'l-path', name: 'path', value: Array.from({ length: 20_001 }, () => 1) }],
          }),
        }),
      ],
      copies: Array.from({ length: 2_001 }, (_, i) => ({ id: `copy-${i}`, brickId: 'walker', x: 0, y: 0 })),
    })
    const problems = validateDesign(design)
    expect(problems.some((p) => p.code === 'limit' && p.path.includes('value'))).toBe(true)
    expect(problems.some((p) => p.code === 'limit' && p.path === 'copies')).toBe(true)
  })

  it('rejects a mask that is not 0/1 occupancy of the costume', () => {
    const design = level()
    design.bricks[0].costumes[0].mask = { width: 2, height: 2, data: new Uint8Array([0, 1, 2, 0]) }
    const problems = validateDesign(design)
    expect(problems.some((p) => p.path.includes('mask'))).toBe(true)
  })

  it('returns a problem for a non-object', () => {
    expect(validateDesign(null as unknown as LevelDesign)).toEqual([
      expect.objectContaining({ code: 'bad-value' }),
    ])
  })
})
