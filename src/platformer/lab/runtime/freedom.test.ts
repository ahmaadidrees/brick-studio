import { describe, expect, it } from 'vitest'
import type { BrickDef } from '../bricks/builtins'
import { starterDoc, type LabDoc } from '../level/doc'
import { compileProgram } from '../program/compile'
import { programText } from '../program/text'
import type { WorkspaceBlockJson } from '../program/workspaceJson'
import { flatLevel, labHarness } from '../testHarness'
import { advance, deserializeLabWorld, serializeLabWorld } from '../sim/world'
import { NO_KEYS } from '../sim/types'

let serial = 0
const node = (type: string, fields: Record<string, string | number> = {}, inputs: Record<string, WorkspaceBlockJson> = {}): WorkspaceBlockJson => ({
  type, id: `freedom-${++serial}`, fields, inputs: Object.fromEntries(Object.entries(inputs).map(([key, block]) => [key, { block }])),
})
const number = (value: number) => node('lab_number', { NUM: value })
const chain = (...blocks: WorkspaceBlockJson[]): WorkspaceBlockJson => {
  for (let i = 0; i + 1 < blocks.length; i++) blocks[i].next = { block: blocks[i + 1] }
  return blocks[0]
}
const set = (scope: string, name: string, value: WorkspaceBlockJson) => node('lab_set_variable', { SCOPE: scope, NAME: name }, { VALUE: value })
const change = (scope: string, name: string, by: WorkspaceBlockJson) => node('lab_change_variable', { SCOPE: scope, NAME: name }, { BY: by })
const variable = (scope: string, name: string) => node('lab_variable', { SCOPE: scope, NAME: name })
const argument = (name: string) => node('lab_argument', { NAME: name })
const call = (name: string, ...args: WorkspaceBlockJson[]) => node('lab_call', { NAME: name }, Object.fromEntries(args.map((arg, i) => [`ARG${i + 1}`, arg])))
const hat = (type: string, fields: Record<string, string | number>, ...body: WorkspaceBlockJson[]) => ({ ...node(type, fields), next: body.length ? { block: chain(...body) } : undefined })
const define = (name: string, params: string[], ...body: WorkspaceBlockJson[]) => node('lab_define', { NAME: name, ARG1: params[0] ?? '', ARG2: params[1] ?? '', ARG3: params[2] ?? '' }, body.length ? { DO: chain(...body) } : {})
const workspace = (...roots: WorkspaceBlockJson[]) => ({ blocks: { languageVersion: 0, blocks: roots } })

function tester(program: ReturnType<typeof workspace>, count = 1) {
  const base = starterDoc()
  const brick: BrickDef = { id: 'freedom', name: 'Freedom', costume: 'crate', basedOn: null, origin: 'mine', program: program as BrickDef['program'], blurb: '' }
  const doc: LabDoc = { ...base, bricks: { ...base.bricks, freedom: brick } }
  const placed = Array.from({ length: count }, (_, i) => ({ id: i + 1, brick: 'freedom', x: 10 + i * 3, y: 13, dir: 1 as const }))
  const h = labHarness(doc, flatLevel(40, 16, placed))
  return { h, things: h.ofBrick('freedom'), doc }
}

describe('Code Lab freedom', () => {
  it('keeps lexical inputs and nested calls across waits and a world save', () => {
    const program = workspace(
      hat('lab_when_appear', {}, call('outer', number(3)), set('my', 'done', number(1))),
      define('outer', ['amount'], call('inner', argument('amount')), change('world', 'total', variable('my', 'result'))),
      define('inner', ['n'], set('my', 'result', argument('n')), node('lab_wait', {}, { SECONDS: number(0.1) }), change('my', 'result', argument('n'))),
    )
    const { h, things } = tester(program)
    h.step()
    expect(things[0].variables?.result).toBe(3)
    expect(things[0].variables?.done).toBeUndefined()
    const copy = deserializeLabWorld(serializeLabWorld(h.world))
    expect(copy.things.find((t) => t.id === things[0].id)?.fibers.some((f) => f.frames.some((frame) => frame.args?.n === 3))).toBe(true)
    for (let i = 0; i < 6; i++) { h.step(); advance(copy, h.book, NO_KEYS) }
    expect(things[0].variables?.result).toBe(6)
    expect(things[0].variables?.done).toBe(1)
    expect(h.world.variables?.total).toBe(6)
    expect(copy.variables?.total).toBe(6)
  })

  it('shares player/world variables and keeps my variables separate', () => {
    const program = workspace(hat('lab_when_appear', {}, change('my', 'count', number(1)), change('player', 'count', number(1)), change('world', 'count', number(1))))
    const { h, things } = tester(program, 2)
    h.step()
    expect(things.map((t) => t.variables?.count)).toEqual([1, 1])
    expect(h.player.variables?.count).toBe(2)
    expect(h.world.variables?.count).toBe(2)
  })

  it('delivers broadcasts on the next tick with a bounded queue', () => {
    const program = workspace(
      hat('lab_when_appear', {}, node('lab_repeat', {}, { TIMES: number(100), DO: node('lab_broadcast', { MESSAGE: 'ping' }) })),
      hat('lab_when_message', { MESSAGE: 'ping' }, change('my', 'hits', number(1))),
    )
    const { h, things } = tester(program, 2)
    h.step()
    expect(things.map((t) => t.variables?.hits)).toEqual([undefined, undefined])
    expect(h.world.messages).toHaveLength(32)
    expect(h.world.notes.some((n) => n.diagnostic.code === 'runtime.message-limit')).toBe(true)
    h.step()
    expect(things.map((t) => t.variables?.hits)).toEqual([1, 1])
  })

  it('starts receiver hats in broadcast order even when the hats are arranged backward', () => {
    const program = workspace(
      hat('lab_when_message', { MESSAGE: 'close' }, set('my', 'open', number(0))),
      hat('lab_when_message', { MESSAGE: 'open' }, set('my', 'open', number(1))),
      hat('lab_when_appear', {}, node('lab_broadcast', { MESSAGE: 'open' }), node('lab_broadcast', { MESSAGE: 'close' })),
    )
    const { h, things } = tester(program)
    h.step()
    expect(things[0].variables?.open).toBeUndefined()
    expect(h.world.messages?.map((m) => m.name)).toEqual(['open', 'close'])
    h.step()
    expect(things[0].variables?.open).toBe(0)
  })

  it('rejects unknown calls, unsafe names, duplicate inputs and out-of-scope arguments', () => {
    const bad = workspace(
      hat('lab_when_appear', {}, call('missing', number(1)), set('my', '__proto__', number(4)), set('my', 'count', argument('secret'))),
      define('double', ['n', 'n'], set('my', 'count', argument('n'))),
    )
    const compiled = compileProgram(bad, { bricks: [{ id: 'freedom', name: 'Freedom' }] })
    expect(compiled.ok).toBe(false)
    const codes = compiled.diagnostics.map((d) => d.code)
    expect(codes).toContain('program.unknown-procedure')
    expect(codes).toContain('program.bad-name')
    expect(codes).toContain('program.bad-argument')
  })

  it('reports a missing custom input and bounds recursive calls', () => {
    const missing = compileProgram(workspace(hat('lab_when_appear', {}, call('recur')), define('recur', ['n'], call('recur', argument('n')))), { bricks: [] })
    expect(missing.diagnostics.map((d) => d.code)).toContain('program.bad-argument')
    const recursive = workspace(hat('lab_when_appear', {}, call('recur', number(1))), define('recur', ['n'], call('recur', argument('n'))))
    const { h, things } = tester(recursive)
    h.step()
    expect(h.world.notes.map((n) => n.diagnostic.code)).toContain('runtime.call-depth')
    expect(things[0].fibers).toHaveLength(0)
  })

  it('prints exact custom procedure names and awaits JavaScript calls', () => {
    const program = workspace(hat('lab_when_appear', {}, call('patrolAtSpeed', number(3))), define('patrolAtSpeed', ['speedValue'], node('lab_wait', {}, { SECONDS: number(0.1) })))
    const ir = compileProgram(program, { bricks: [] }).ir
    const js = programText(ir, 'js', [])
    const py = programText(ir, 'py', [])
    expect(js).toContain('await patrolAtSpeed(3)')
    expect(js).toContain('async function patrolAtSpeed(speedValue)')
    expect(py).toContain('patrolAtSpeed(3)')
    expect(py).toContain('def patrolAtSpeed(speedValue):')
  })

  it('runs invisible world rules without putting the controller into physics', () => {
    const h = labHarness()
    const controller = h.world.things.find((thing) => thing.id === h.world.worldId)
    expect(controller?.system).toBe(true)
    const before = controller && [controller.x, controller.y]
    h.run(30)
    expect(controller && [controller.x, controller.y]).toEqual(before)
    expect(controller?.contacts).toEqual([])
  })

  it('does not let forged level or program data create a second world controller', () => {
    const forged = compileProgram(workspace(hat('lab_when_appear', {}, node('lab_make', { BRICK: 'world', PLACE: 'here' }))), { bricks: [{ id: 'world', name: 'World' }] })
    expect(forged.ok).toBe(false)
    const h = labHarness(starterDoc(), flatLevel(40, 16, [{ id: 1, brick: 'world', x: 10, y: 13, dir: 1 }]))
    expect(h.ofBrick('world')).toHaveLength(1)
    expect(h.ofBrick('world')[0].system).toBe(true)
    const malicious = tester(workspace(hat('lab_when_appear', {}, node('lab_make', { BRICK: 'world', PLACE: 'here' }), set('my', '__proto__', number(4)))))
    malicious.h.step()
    expect(malicious.h.ofBrick('world')).toHaveLength(1)
    expect(Object.getPrototypeOf(malicious.things[0].variables)).toBe(Object.prototype)
    expect(Object.keys(malicious.things[0].variables ?? {})).toEqual([])
  })

  it('picks up an edited procedure while sleeping and restarts when its past changes', () => {
    const program = workspace(
      hat('lab_when_appear', {}, set('my', 'count', number(0)), call('run')),
      define('run', [], set('my', 'mark', number(1)), node('lab_wait', {}, { SECONDS: number(0.1) }), change('my', 'count', number(1))),
    )
    const { h, things, doc } = tester(program)
    h.step()
    const edited = JSON.parse(JSON.stringify(program)) as typeof program
    const body = (edited.blocks.blocks[1].inputs as Record<string, { block: WorkspaceBlockJson }>).DO.block
    const wait = (body.next as { block: WorkspaceBlockJson }).block
    const after = (wait.next as { block: WorkspaceBlockJson }).block
    ;((after.inputs as Record<string, { block: WorkspaceBlockJson }>).BY.block.fields as Record<string, number>).NUM = 5
    h.setDoc({ ...doc, bricks: { ...doc.bricks, freedom: { ...doc.bricks.freedom, program: edited as BrickDef['program'] } } })
    h.run(6)
    expect(things[0].variables?.count).toBe(5)
    expect(things[0].variables?.mark).toBe(1)

    const later = workspace(hat('lab_when_appear', {}, call('run')), define('run', [], set('my', 'mark', number(1)), node('lab_wait', {}, { SECONDS: number(1) }), change('my', 'count', number(1))))
    // The completed script does not restart on an edit, so start a fresh run to check an edit behind a sleeping frame.
    const fresh = tester(later)
    fresh.h.step()
    const changed = JSON.parse(JSON.stringify(later)) as typeof later
    const changedBody = (changed.blocks.blocks[1].inputs as Record<string, { block: WorkspaceBlockJson }>).DO.block
    ;((changedBody.inputs as Record<string, { block: WorkspaceBlockJson }>).VALUE.block.fields as Record<string, number>).NUM = 2
    fresh.h.setDoc({ ...fresh.doc, bricks: { ...fresh.doc.bricks, freedom: { ...fresh.doc.bricks.freedom, program: changed as BrickDef['program'] } } })
    fresh.h.step()
    expect(fresh.things[0].variables?.mark).toBe(2)
  })

  it('rebinds renamed procedure inputs after a live edit during a wait', () => {
    const program = workspace(
      hat('lab_when_appear', {}, call('remember', number(5))),
      define('remember', ['oldInput'], node('lab_wait', {}, { SECONDS: number(0.1) }), set('my', 'observed', argument('oldInput'))),
    )
    const { h, things, doc } = tester(program)
    h.step()
    expect(things[0].fibers.some((fiber) => fiber.frames.some((frame) => frame.args?.oldInput === 5))).toBe(true)
    const edited = JSON.parse(JSON.stringify(program)) as typeof program
    const definition = edited.blocks.blocks[1]
    ;(definition.fields as Record<string, string>).ARG1 = 'newInput'
    const wait = (definition.inputs as Record<string, { block: WorkspaceBlockJson }>).DO.block
    const after = (wait.next as { block: WorkspaceBlockJson }).block
    const reporter = (after.inputs as Record<string, { block: WorkspaceBlockJson }>).VALUE.block
    ;(reporter.fields as Record<string, string>).NAME = 'newInput'
    h.setDoc({ ...doc, bricks: { ...doc.bricks, freedom: { ...doc.bricks.freedom, program: edited as BrickDef['program'] } } })
    h.run(7)
    expect(things[0].variables?.observed).toBe(5)
    expect(things[0].fibers).toHaveLength(0)
  })

  it('rebinds an active forever procedure when its call input changes live', () => {
    const program = workspace(
      hat('lab_when_appear', {}, call('patrol', number(1.5))),
      define('patrol', ['speed'], node('lab_forever', {}, { DO: chain(
        set('my', 'observed', argument('speed')),
        node('lab_set_speed', { WHO: 'me', DIR: 'right' }, { VALUE: argument('speed') }),
      ) })),
    )
    const { h, things, doc } = tester(program)
    h.step()
    expect(things[0].variables?.observed).toBe(1.5)
    const edited = JSON.parse(JSON.stringify(program)) as typeof program
    const callBlock = (edited.blocks.blocks[0].next as { block: WorkspaceBlockJson }).block
    const numeric = (callBlock.inputs as Record<string, { block: WorkspaceBlockJson }>).ARG1.block
    ;(numeric.fields as Record<string, number>).NUM = 3
    h.setDoc({ ...doc, bricks: { ...doc.bricks, freedom: { ...doc.bricks.freedom, program: edited as BrickDef['program'] } } })
    h.step()
    expect(things[0].variables?.observed).toBe(3)
    expect(things[0].fibers.some((fiber) => fiber.frames.some((frame) => frame.args?.speed === 3))).toBe(true)
    h.run(3)
    expect(things[0].variables?.observed).toBe(3)
  })

  it('reads pixel positions and moves a thing by numeric x/y', () => {
    const program = workspace(hat('lab_when_appear', {}, node('lab_move_xy', { WHO: 'me' }, { X: number(120), Y: number(200) }), set('my', 'x', node('lab_position', { WHO: 'me', AXIS: 'x' })), set('my', 'y', node('lab_position', { WHO: 'me', AXIS: 'y' }))))
    const { h, things } = tester(program)
    h.step()
    expect(things[0].variables?.x).toBe(120)
    expect(things[0].variables?.y).toBe(200)
  })
})
