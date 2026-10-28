import { describe, expect, it } from 'vitest'
import type { BrickDef } from '../bricks/builtins'
import { starterDoc } from '../level/doc'
import { compileProgram } from '../program/compile'
import { programText } from '../program/text'
import type { WorkspaceBlockJson } from '../program/workspaceJson'
import { deserializeLabWorld, serializeLabWorld } from '../sim/world'
import { flatLevel, labHarness } from '../testHarness'

let nextId = 0
const block = (type: string, fields: Record<string, string | number> = {}, inputs: Record<string, WorkspaceBlockJson> = {}): WorkspaceBlockJson => ({
  id: `author-${++nextId}`, type, fields,
  inputs: Object.fromEntries(Object.entries(inputs).map(([name, child]) => [name, { block: child }])),
})
const number = (n: number) => block('lab_number', { NUM: n })
const hat = (type: string, body: WorkspaceBlockJson[], fields: Record<string, string | number> = {}) => {
  for (let i = 0; i + 1 < body.length; i++) body[i].next = { block: body[i + 1] }
  return { ...block(type, fields), next: body[0] ? { block: body[0] } : undefined }
}
const program = (...roots: WorkspaceBlockJson[]) => ({ blocks: { languageVersion: 0, blocks: roots } })

function harness(code: ReturnType<typeof program>) {
  const base = starterDoc()
  const appearance = {
    version: 1 as const, width: 1, height: 1, fps: 10,
    frames: [
      { id: 'a', name: 'A', pixels: 'ff0000ff' },
      { id: 'b', name: 'B', pixels: '00ff00ff' },
      { id: 'c', name: 'C', pixels: '0000ffff' },
    ],
  }
  const brick: BrickDef = { id: 'author', name: 'Author', costume: 'crate', appearance, basedOn: null, origin: 'mine', program: code, blurb: '' }
  const doc = { ...base, bricks: { ...base.bricks, author: brick } }
  const h = labHarness(doc, flatLevel(40, 16, [{ id: 1, brick: 'author', x: 10, y: 13, dir: 1 }]))
  return { h, thing: h.ofBrick('author')[0], code }
}

describe('Scratch-like authoring primitives', () => {
  it('lets generic blocks take over and restore player motion', () => {
    const { h } = harness(program(
      hat('lab_when_appear', [
        block('lab_set_controls', { WHO: 'player', ENABLED: 'false' }),
        block('lab_set_physics', { WHO: 'player', ENABLED: 'false' }),
      ]),
      hat('lab_when_key', [
        block('lab_set_physics', { WHO: 'player', ENABLED: 'true' }),
        block('lab_set_controls', { WHO: 'player', ENABLED: 'true' }),
      ], { KEY: 'z' }),
    ))
    h.step()
    expect(h.player.controlsEnabled).toBe(false)
    expect(h.player.physicsEnabled).toBe(false)
    const before = [h.player.x, h.player.y]
    h.run(10, { right: true })
    expect([h.player.x, h.player.y]).toEqual(before)
    h.step({ right: true }, ['z'])
    expect(h.player.controlsEnabled).toBe(true)
    expect(h.player.physicsEnabled).toBe(true)
    h.run(5, { right: true })
    expect(h.player.x).toBeGreaterThan(before[0])
  })

  it('lets a moving thing place the player using generic position and motion blocks', () => {
    const { h, thing } = harness(program(hat('lab_when_appear', [
      block('lab_set_controls', { WHO: 'player', ENABLED: 'false' }),
      block('lab_set_physics', { WHO: 'player', ENABLED: 'false' }),
      block('lab_set_speed', { WHO: 'me', DIR: 'forward' }, { VALUE: number(2) }),
      block('lab_forever', {}, { DO: block('lab_move_xy', { WHO: 'player' }, {
        X: block('lab_position', { WHO: 'me', AXIS: 'x' }),
        Y: block('lab_position', { WHO: 'me', AXIS: 'y' }),
      }) }),
    ])))
    const start = thing.x
    h.run(8)
    expect(thing.x).toBeGreaterThan(start)
    const carCenter = thing.x + thing.w / 2
    const playerCenter = h.player.x + h.player.w / 2
    expect(Math.abs(carCenter - playerCenter)).toBeLessThanOrEqual(2 * 256)
    expect(h.player.physicsEnabled).toBe(false)
    expect(h.player.controlsEnabled).toBe(false)
  })

  it('bounds frames and free speech, advances animation, and serializes the state', () => {
    const code = program(hat('lab_when_appear', [
      block('lab_frame', {}, { FRAME: number(999) }),
      block('lab_next_frame'),
      block('lab_play_frames', {}, { FPS: number(30) }),
      block('lab_say_text', { TEXT: '<hello>\nworld' }, { SECONDS: number(2) }),
      block('lab_hide_thing', { WHO: 'me' }),
    ]))
    const { h, thing } = harness(code)
    const compiled = compileProgram(code, { bricks: [{ id: 'author', name: 'Author' }] })
    expect(compiled.ok).toBe(true)
    expect(programText(compiled.ir, 'js', []).includes('"<hello> world"')).toBe(true)
    h.step()
    expect(thing.costumeFrame).toBe(1)
    expect(thing.costumePlaying).toBe(true)
    expect(thing.visible).toBe(false)
    expect(thing.say).toBe('<hello> world')
    h.run(3)
    expect(thing.costumeFrame).toBe(2)
    const copy = deserializeLabWorld(serializeLabWorld(h.world)).things.find((t) => t.id === thing.id)!
    expect([copy.costumeFrame, copy.costumePlaying, copy.visible, copy.say]).toEqual([2, true, false, '<hello> world'])
  })

  it('shows a chosen built-in costume, then returns to custom frames', () => {
    const { h, thing } = harness(program(
      hat('lab_when_appear', [block('lab_costume', { COSTUME: 'rocket' })]),
      hat('lab_when_key', [block('lab_frame', {}, { FRAME: number(2) })], { KEY: 'z' }),
    ))
    expect(thing.useCustomCostume).toBe(true)
    h.step()
    expect([thing.costume, thing.useCustomCostume, thing.costumePlaying]).toEqual(['rocket', false, false])
    h.step({}, ['z'])
    expect([thing.costumeFrame, thing.useCustomCostume]).toEqual([2, true])
  })

  it('starts a clicked hat only for the clicked thing', () => {
    const { h, thing } = harness(program(hat('lab_when_clicked', [block('lab_say_text', { TEXT: 'Clicked!' }, { SECONDS: number(1) })])))
    h.step()
    expect(thing.say).toBeNull()
    thing.events.push({ kind: 'clicked' })
    h.step()
    expect(thing.say).toBe('Clicked!')
    expect(h.player.say).toBeNull()
  })
})
