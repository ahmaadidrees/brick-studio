/**
 * "Move me with my own blocks": a brick that moves itself with "move until I hit something", "hit something?", "tell what
 * I hit" and "set on ground?" must land exactly where the Platformer engine would put it, tick for tick, with the same
 * bumps and landings. Each case runs one level twice: once moved by the engine, once by those blocks.
 */
import { describe, expect, it } from 'vitest'
import type { BrickDef, CopyPlacement, Expr, LevelDesign, Script, Stmt, Target } from './contracts'
import { play } from './index'
import { validateDesign } from './project'
import type { Runtime } from './runtime'

const lit = (value: number | string): Expr => ({ kind: 'lit', value })
const blk = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}): Expr => ({ kind: 'block', opcode, fields, inputs })
const stmt = (opcode: string, fields: Record<string, string> = {}, inputs: Record<string, Expr> = {}, branches?: Stmt[][]): Stmt => ({ opcode, fields, inputs, ...(branches ? { branches } : {}) })
const v = (id: string) => blk('data_variable', { VARIABLE: `m_${id}` })
const set = (id: string, value: Expr) => stmt('data_setvariableto', { VARIABLE: id }, { VALUE: value })
const inc = (id: string) => stmt('data_changevariableby', { VARIABLE: id.includes('_') ? id : `m_${id}` }, { VALUE: lit(1) })
const op = (opcode: string, a: Expr, b: Expr, names = ['NUM1', 'NUM2']) => blk(opcode, {}, { [names[0]]: a, [names[1]]: b })
const ifThen = (cond: Expr, then: Stmt[]) => stmt('control_if', {}, { CONDITION: cond }, [then])
const speed = (axis: 'x' | 'y') => blk('platformer_speed', { AXIS: axis })
const setSpeed = (axis: 'x' | 'y', value: Expr) => stmt('platformer_setspeed', { AXIS: axis }, { SPEED: value })
const changeSpeed = (axis: 'x' | 'y', value: Expr) => stmt('platformer_changespeed', { AXIS: axis }, { SPEED: value })

let sid = 0
const hat = (opcode: Script['hat']['opcode'], body: Stmt[], fields: Record<string, string> = {}): Script => ({ id: `s${sid++}`, hat: { opcode, fields, inputs: {} }, body })

function brick(id: string, name: string, w: number, h: number, scripts: Script[], variables: BrickDef['program']['variables'] = []): BrickDef {
  return { id, name, costumes: [{ name: 'c', width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }], sounds: [], program: { scripts, procedures: [], variables, lists: [] } }
}

const COUNTERS = ['t', 'bumpLeft', 'bumpRight', 'bumpTop', 'bumpBottom', 'bumpWall', 'landed', 'left']

/** The mover: own gravity, a wandering x speed and a jump every so often, all from a tick counter (no randomness). */
function mover(selfMove: boolean, a: number, b: number): BrickDef {
  // A wobble around a drift that turns every 90 ticks, so the mover crosses the level and meets walls and platforms.
  const wobble = op('operator_divide', op('operator_subtract', op('operator_mod', op('operator_multiply', v('t'), lit(a)), lit(13)), lit(6)), lit(4))
  const turn = op('operator_lt', op('operator_mod', v('t'), lit(180)), lit(90), ['OPERAND1', 'OPERAND2'])
  const jumpTime = op('operator_lt', op('operator_mod', v('t'), lit(b)), lit(4), ['OPERAND1', 'OPERAND2'])
  const jump = ifThen(op('operator_and', blk('platformer_onground'), jumpTime, ['OPERAND1', 'OPERAND2']), [setSpeed('y', lit(11))])
  const speeds = hat('platformer_everytick', [
    inc('t'),
    stmt('control_if_else', {}, { CONDITION: turn }, [[setSpeed('x', op('operator_add', wobble, lit(2.5)))], [setSpeed('x', op('operator_subtract', wobble, lit(2.5)))]]),
    changeSpeed('y', lit(-0.75)),
    jump,
  ])
  // Exactly what the engine does in one physics step, as blocks.
  const moveSelf = hat('platformer_everytick', [
    stmt('platformer_setonground', { ONGROUND: 'no' }),
    stmt('platformer_moveuntilhit', { AXIS: 'x' }, { DISTANCE: speed('x') }),
    ifThen(blk('platformer_hitsomething'), [stmt('platformer_tellhit'), setSpeed('x', lit(0))]),
    stmt('platformer_moveuntilhit', { AXIS: 'y' }, { DISTANCE: speed('y') }),
    ifThen(blk('platformer_hitsomething'), [
      ifThen(op('operator_lt', speed('y'), lit(0), ['OPERAND1', 'OPERAND2']), [stmt('platformer_setonground', { ONGROUND: 'yes' })]),
      stmt('platformer_tellhit'),
      setSpeed('y', lit(0)),
    ]),
  ])
  const flag = hat('event_whenflagclicked', selfMove ? [stmt('platformer_setmover', { MOVER: 'self' })] : [])
  const counters = [
    hat('platformer_whenbump', [inc('bumpLeft')], { SIDE: 'left', BRICK: '_any_' }),
    hat('platformer_whenbump', [inc('bumpRight')], { SIDE: 'right', BRICK: '_any_' }),
    hat('platformer_whenbump', [inc('bumpTop')], { SIDE: 'top', BRICK: '_any_' }),
    hat('platformer_whenbump', [inc('bumpBottom')], { SIDE: 'bottom', BRICK: '_any_' }),
    hat('platformer_whenbump', [inc('bumpWall')], { SIDE: '_any_', BRICK: '_edge_' }),
    hat('platformer_whenland', [inc('landed')]),
    hat('platformer_whenleaveground', [inc('left')]),
  ]
  return brick('m', 'Mover', 12, 14, [flag, speeds, ...(selfMove ? [moveSelf] : []), ...counters], COUNTERS.map((id) => ({ id: `m_${id}`, name: id, value: 0 })))
}

function level(selfMove: boolean, a: number, b: number): LevelDesign {
  const solid = (id: string, name: string, w: number, h: number, mode: 'on' | 'top', extra: Stmt[] = []) =>
    brick(id, name, w, h, [hat('event_whenflagclicked', [stmt('platformer_setsolid', { SOLID: mode }), ...extra]), hat('platformer_whenbump', [inc(`${id}_hits`)], { SIDE: '_any_', BRICK: 'Mover' })], [{ id: `${id}_hits`, name: 'hits', value: 0 }])
  // A solid that patrols left and right, moved by the engine in both runs.
  const patrol = solid('pat', 'Patrol', 40, 10, 'on', [setSpeed('x', lit(1.5))])
  patrol.program.scripts.push(hat('platformer_whenbump', [setSpeed('x', op('operator_multiply', lit(-1), lit(1.5)))], { SIDE: 'left', BRICK: '_any_' }))
  patrol.program.scripts.push(hat('platformer_whenbump', [setSpeed('x', lit(1.5))], { SIDE: 'right', BRICK: '_any_' }))
  const bricks = [mover(selfMove, a, b), solid('plat', 'Platform', 80, 16, 'on'), solid('oneway', 'Ledge', 60, 6, 'top'), solid('wall', 'Pillar', 16, 80, 'on'), patrol]
  const copies: CopyPlacement[] = [
    { id: 'cm', brickId: 'm', x: 120, y: 60 },
    { id: 'p1', brickId: 'plat', x: 200, y: 70 },
    { id: 'p2', brickId: 'plat', x: 330, y: 140 },
    { id: 'o1', brickId: 'oneway', x: 90, y: 110 },
    { id: 'w1', brickId: 'wall', x: 420, y: 40 },
    { id: 'pt', brickId: 'pat', x: 280, y: 20 },
  ]
  return {
    id: 'lvl', name: 'Side by side', seed: 1, bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks, copies,
  }
}

const snapshot = (rt: Runtime): Record<string, unknown> => {
  const m = rt.world.targets.find((t) => t.copyId === 'cm') as Target
  const others = rt.world.targets.filter((t) => t.copyId && t.copyId !== 'cm').map((t) => [t.copyId, t.x, t.y, Object.values(t.variables)])
  return { x: m.x, y: m.y, vx: m.body?.vx, vy: m.body?.vy, onGround: m.body?.onGround, ...Object.fromEntries(COUNTERS.map((c) => [c, m.variables[`m_${c}`]])), others }
}

describe('a brick that moves itself lands exactly where the engine would put it', () => {
  it('both levels are valid designs', () => {
    expect(validateDesign(level(true, 5, 23))).toEqual([])
    expect(validateDesign(level(false, 5, 23))).toEqual([])
  })

  for (const [a, b] of [[5, 23], [3, 17], [7, 31], [11, 9], [2, 40]]) {
    it(`matches tick for tick for 600 ticks (steer x${a}, jump every ${b})`, () => {
      const engine = play(level(false, a, b))
      const blocks = play(level(true, a, b))
      let bumps = 0
      for (let tick = 1; tick <= 600; tick++) {
        engine.step()
        blocks.step()
        const e = snapshot(engine)
        expect(snapshot(blocks), `tick ${tick}`).toEqual(e)
        bumps = (e.bumpLeft as number) + (e.bumpRight as number) + (e.bumpTop as number) + (e.bumpBottom as number)
      }
      // The run really hit things on several sides, so the comparison means something.
      const last = snapshot(engine)
      expect(bumps).toBeGreaterThan(20)
      expect(last.landed as number).toBeGreaterThan(3)
      expect(last.left as number).toBeGreaterThan(3)
      expect((last.bumpLeft as number) + (last.bumpRight as number)).toBeGreaterThan(0)
      // and the other bricks heard about it: "tell what I hit" reaches them like the engine's bumps
      expect((last.others as Array<[string, number, number, number[]]>).some(([, , , vars]) => vars.some((n) => n > 0))).toBe(true)
    })
  }

  it('the engine leaves a self-moving brick alone: speeds alone do not move it', () => {
    const d = level(true, 5, 23)
    d.bricks[0].program.scripts = d.bricks[0].program.scripts.filter((s) => s.hat.opcode !== 'platformer_everytick' || s.body.some((x) => x.opcode === 'data_changevariableby'))
    const rt = play(d)
    for (let i = 0; i < 30; i++) rt.step()
    const m = rt.world.targets.find((t) => t.copyId === 'cm')!
    expect([m.x, m.y]).toEqual([120, 60])
  })
})
