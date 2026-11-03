/**
 * What a project may hold from outside (core/contentRules.ts), checked as it opens from this computer, the account or a
 * file: pictures and sounds from a web address or an SVG are put right (just that costume or sound) and the kid is told;
 * blocks this version does not have stay in the project and the kid is told. Every project this app made opens as before.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { Expr, Stmt } from '../../core/contracts'
import { isCostumeSource, isSoundSource } from '../../core/contentRules'
import { isRemovedBlockType } from '../../core/editor/compile'
import { isKnownBlockType } from '../../core/editor/knownBlocks'
import { validateDesign } from '../../core/project'
import { parse } from '../../core/save'
import minimal from '../../core/__fixtures__/minimal.json'
import complex from '../../core/__fixtures__/complex.json'
import step6b from '../__fixtures__/step6b-save.json'
import heroBeforeFeel from '../__fixtures__/hero-before-feel-scripts.json'
import heroBeforeRespawn from '../hero/__fixtures__/hero-before-start-respawn.json'
import { decodePngSync } from '../assets/pixelOps'
import { getSoundLibrary } from '../assets/soundLibrary'
import { standardTemplates } from '../builder/catalog'
import { createCoinBrick, createEmptyBrick, createGoalBrick, createSpringBrick, createStarterProject, createWalkerBrick } from '../starter'
import { clearStorageNotice, getStorageNotice, loadProject } from '../storage'
import { LEGACY_KEY } from './hackableProjects'
import { projectFromDocument } from './hackableSave'
import { unknownBlockCount } from './openChecks'
import { exportProjectJson, importProjectJson } from './projectIo'
import { parseSaveText } from './repairSave'

beforeEach(() => {
  localStorage.clear()
  clearStorageNotice()
})

/** Every block type in a Blockly workspace save, and every opcode in a compiled program. */
function typesIn(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => typesIn(v, out))
  else if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>
    if (typeof v.type === 'string' && ('id' in v || 'fields' in v || 'inputs' in v || 'next' in v || v.type.includes('_'))) out.add(v.type)
    if (typeof v.opcode === 'string') out.add(v.opcode)
    Object.values(v).forEach((x) => typesIn(x, out))
  }
  return out
}
const blockOnly = (types: Set<string>) => [...types].filter((t) => t.includes('_'))
const notKnown = (types: Set<string>) => blockOnly(types).filter((t) => !isKnownBlockType(t) && !isRemovedBlockType(t))

describe('everything this app made holds only blocks it knows', () => {
  const saves = { minimal, complex, step6b }
  for (const [name, save] of Object.entries(saves)) {
    it(`golden save ${name}`, () => {
      const types = typesIn({ workspaces: save.workspaces, ir: save.ir, programs: [save.design.stage, ...save.design.bricks].map((b) => b.program) })
      if (name !== 'minimal') expect(blockOnly(types).length).toBeGreaterThan(0)
      expect(notKnown(types)).toEqual([])
      const opened = parseSaveText(JSON.stringify(save))
      expect(opened.ok).toBe(true)
      if (opened.ok) {
        expect(opened.replaced).toBeUndefined()
        expect(unknownBlockCount({ design: opened.save.design, workspaces: opened.save.workspaces ?? {} })).toBe(0)
      }
    })
  }

  it('the Hero fixtures from before the feel and respawn changes', () => {
    for (const fixture of [heroBeforeFeel, heroBeforeRespawn]) expect(notKnown(typesIn(fixture))).toEqual([])
  })

  it('the starter project, the catalog bricks and the grid bricks', () => {
    const starter = createStarterProject()
    expect(unknownBlockCount(starter)).toBe(0)
    expect(notKnown(typesIn(starter.workspaces))).toEqual([])
    const made = [createWalkerBrick('w', 'Walker'), createCoinBrick('c', 'Coin'), createSpringBrick('s', 'Spring'), createGoalBrick('g', 'Goal'), createEmptyBrick('e', 'Empty')]
    for (const { brick, workspace } of made) expect(notKnown(typesIn([workspace, brick.program])), brick.name).toEqual([])
    for (const { key, template } of standardTemplates()) expect(notKnown(typesIn([template.workspace, template.brick.program])), key).toEqual([])
  })

  it('every picture and sound they hold is one the game takes', () => {
    const project = createStarterProject()
    expect(validateDesign(project.design)).toEqual([])
    const costumes = [project.design.stage, ...project.design.bricks, ...standardTemplates().map((t) => t.template.brick)].flatMap((b) => b.costumes)
    expect(costumes.length).toBeGreaterThan(5)
    expect(costumes.filter((c) => c.asset !== undefined && !isCostumeSource(c.asset)).map((c) => c.name)).toEqual([])
    const sounds = getSoundLibrary()
    expect(sounds.length).toBeGreaterThan(0)
    expect(sounds.filter((s) => !isSoundSource(s.asset)).map((s) => s.name)).toEqual([])
  })
})

describe('pictures and sounds from outside', () => {
  const env = () => JSON.parse(exportProjectJson(createStarterProject()))

  it('the game refuses a web address, an SVG, or a sound that is not audio', () => {
    for (const [asset, code] of [
      ['https://example.com/hero.png', 'bad-costume'],
      ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'bad-costume'],
    ] as const) {
      const project = createStarterProject()
      project.design.bricks[0].costumes[0] = { ...project.design.bricks[0].costumes[0], asset }
      expect(validateDesign(project.design)).toEqual([expect.objectContaining({ code, path: 'bricks[0].costumes[0].asset' })])
    }
    const project = createStarterProject()
    project.design.bricks[0].sounds = [{ name: 'boom', durationMs: 100, asset: 'https://example.com/boom.wav' }]
    expect(validateDesign(project.design)).toEqual([expect.objectContaining({ code: 'bad-sound', path: 'bricks[0].sounds[0].asset' })])
  })

  it('a save holding one opens with just that picture gray, same size and shape, and says so', () => {
    const save = env()
    const hero = save.design.bricks[0]
    const before = structuredClone(hero.costumes)
    hero.costumes[0].asset = 'https://tracker.example.com/pixel.png'
    expect(parse(JSON.stringify(save)).ok).toBe(false)

    const opened = parseSaveText(JSON.stringify(save))
    expect(opened.ok && opened.replaced).toEqual({ pictures: 1, sounds: 0 })
    if (!opened.ok) return
    const costume = opened.save.design.bricks[0].costumes[0]
    expect(costume.asset).toMatch(/^data:image\/png;base64,/)
    const img = decodePngSync(costume.asset!)!
    expect([img.width, img.height]).toEqual([before[0].width, before[0].height])
    // Everything but the picture is the kid's own: name, size, center, mask (so it stands and bumps the same).
    const { asset: _a, mask, ...rest } = costume
    const { asset: _b, mask: beforeMask, ...beforeRest } = before[0]
    expect(rest).toEqual(beforeRest)
    expect(mask && { width: mask.width, height: mask.height }).toEqual({ width: beforeMask.width, height: beforeMask.height })
    // The other costumes are untouched.
    expect(opened.save.design.bricks[0].costumes.slice(1).map((c) => c.asset)).toEqual(before.slice(1).map((c: { asset: string }) => c.asset))
  })

  it('an SVG backdrop and a sound from the web are put right too', () => {
    const save = env()
    save.design.stage.costumes = [{ ...save.design.bricks[0].costumes[0], name: 'Sky', asset: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+' }]
    save.design.bricks[0].sounds = [{ name: 'boom', durationMs: 250, asset: 'https://example.com/boom.wav' }]
    const opened = parseSaveText(JSON.stringify(save))
    expect(opened.ok && opened.replaced).toEqual({ pictures: 1, sounds: 1 })
    if (!opened.ok) return
    expect(opened.save.design.stage.costumes[0].asset).toMatch(/^data:image\/png;base64,/)
    expect(opened.save.design.bricks[0].sounds).toEqual([{ name: 'boom', durationMs: 250 }])
  })

  it('on this computer: the notice bar says what was put right', () => {
    const save = env()
    save.design.bricks[0].costumes[0].asset = 'https://example.com/hero.png'
    save.design.bricks[1].costumes[0].asset = 'https://example.com/walker.png'
    localStorage.setItem(LEGACY_KEY, JSON.stringify(save))
    const project = loadProject(undefined, LEGACY_KEY)
    expect(project.design.bricks[0].costumes[0].asset).toMatch(/^data:image\/png/)
    expect(getStorageNotice()).toMatchObject({ id: 'opened-checks', type: 'info', message: '2 pictures in this project couldn’t be used, so gray ones are in their place.' })
  })

  it('from the account: the same', () => {
    const save = env()
    save.design.bricks[0].sounds = [{ name: 'boom', durationMs: 250, asset: 'data:image/png;base64,AAAA' }]
    expect(projectFromDocument({ format: 'brickgineers-hackable', version: 1, save })).not.toBeNull()
    expect(getStorageNotice()?.message).toBe('A sound in this project couldn’t be used, so it is quiet now.')
  })
})

describe('blocks this version does not have', () => {
  /** A starter save whose Hero has one block from somewhere else, in its code and in what Play runs. */
  function withUnknownBlock(): string {
    const save = JSON.parse(exportProjectJson(createStarterProject()))
    const hero = save.design.bricks[0]
    const top = save.workspaces[hero.id].blocks.blocks
    top.push({ type: 'event_whenflagclicked', id: 'zz_hat', x: 0, y: 0, next: { block: { type: 'hack_teleport', id: 'zz_bad' } } })
    hero.program.scripts.push({ id: 'zz_hat', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: [{ opcode: 'hack_teleport', inputs: {}, fields: {}, id: 'zz_bad' }] })
    return JSON.stringify(save)
  }

  it('a file holding one opens, keeps it, and says so', () => {
    const result = importProjectJson(withUnknownBlock())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.notice).toBe('One block in this project isn’t part of Brickgineers, so it can’t run.')
    const kept = result.project.design.bricks[0].program.scripts.at(-1)!.body[0] as Stmt
    expect(kept.opcode).toBe('hack_teleport')
  })

  it('counts each block once, in its code or in what Play runs, reporters included', () => {
    const project = createStarterProject()
    const hero = project.design.bricks[0]
    const reporter: Expr = { kind: 'block', opcode: 'mystery_reporter', inputs: {}, fields: {} }
    hero.program.scripts = [...hero.program.scripts, { id: 'q', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: [{ opcode: 'looks_say', inputs: { MESSAGE: reporter }, fields: {} }] }]
    expect(unknownBlockCount(project)).toBe(1)
    expect(unknownBlockCount({ ...project, workspaces: { ...project.workspaces, stage: { blocks: { blocks: [{ type: 'logic_compare', id: 'c' }, { type: 'text_join', id: 'j' }] } } } })).toBe(3)
  })

  it('a clean file opens with no notice', () => {
    const result = importProjectJson(exportProjectJson(createStarterProject()))
    expect(result.ok && result.notice).toBeUndefined()
  })

  it('on this computer the notice bar says so', () => {
    localStorage.setItem(LEGACY_KEY, withUnknownBlock())
    loadProject(undefined, LEGACY_KEY)
    expect(getStorageNotice()?.message).toBe('One block in this project isn’t part of Brickgineers, so it can’t run.')
  })
})
