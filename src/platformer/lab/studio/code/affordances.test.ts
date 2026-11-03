import * as Blockly from 'blockly'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { compileWorkspace } from '../../core/editor/compile'
import { registerEditorBlocks } from '../../core/editor/definitions'
import { attachAffordances, focusView, foldLongDefinitions, getLabel, isShownIn, LABEL_BAND, listDefinitions, SectionTracker, setLabel, setWorkspaceHandlers, takesLabel, READABLE_SCALE, READABLE_SCALE_NARROW } from './affordances'
import { createHeroWorkspace, HERO_BRICK_ID } from '../hero/heroBrick'
import { ALL_SCRIPTS, drillInto, openScript, openSection, TOP_VIEW } from './layers'
import { sectionsForBrick } from './sections'

const WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: 'event_whenflagclicked',
        id: 'flag',
        x: 20,
        y: 20,
        data: 'label:Walk back and forth',
        next: {
          block: {
            type: 'procedures_call',
            id: 'call',
            extraState: { proccode: 'walk at %s', argumentNames: ['speed'] },
            inputs: { speed: { shadow: { type: 'math_number', id: 'n', fields: { NUM: 2 } } } },
            next: { block: { type: 'platformer_setgravity', id: 'grav', fields: { GRAVITY: 'on' } } },
          },
        },
      },
      {
        type: 'platformer_whenbump',
        id: 'bump',
        x: 20,
        y: 200,
        fields: { SIDE: '_any_', BRICK: '_any_' },
        data: 'label:Turn around at a wall',
      },
      {
        type: 'procedures_definition',
        id: 'def',
        x: 20,
        y: 400,
        extraState: { proccode: 'walk at %s', argumentNames: ['speed'], warp: false },
        next: { block: { type: 'platformer_setspeed', id: 'sp', fields: { AXIS: 'x' }, inputs: { SPEED: { shadow: { type: 'math_number', fields: { NUM: 3 } } } } } },
      },
    ],
  },
}

describe('script labels and magnifiers (headless Blockly)', () => {
  let ws: Blockly.Workspace
  beforeAll(() => {
    registerEditorBlocks()
    attachAffordances()
  })
  afterEach(() => ws?.dispose())

  it('labels survive a Blockly save/load round trip, shaped as `data: "label:<text>"` on the hat', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(getLabel(ws.getBlockById('flag')!)).toBe('Walk back and forth')
    expect(getLabel(ws.getBlockById('bump')!)).toBe('Turn around at a wall')

    const saved = Blockly.serialization.workspaces.save(ws) as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    const byId = Object.fromEntries(saved.blocks.blocks.map((b) => [b.id, b.data]))
    expect(byId.flag).toBe('label:Walk back and forth')
    expect(byId.bump).toBe('label:Turn around at a wall')
    expect(byId.def).toBeUndefined()

    // Save, load into a fresh workspace, save again: identical.
    const again = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(saved, again)
      expect(Blockly.serialization.workspaces.save(again)).toEqual(saved)
    } finally {
      again.dispose()
    }
  })

  it('editing a label saves the new text, and clearing it removes the key', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    const flag = ws.getBlockById('flag')!
    setLabel(flag, '  Start walking ')
    const withLabel = Blockly.serialization.workspaces.save(ws) as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    expect(withLabel.blocks.blocks.find((b) => b.id === 'flag')!.data).toBe('label:Start walking')
    setLabel(flag, '')
    const without = Blockly.serialization.workspaces.save(ws) as { blocks: { blocks: Array<{ id: string; data?: string }> } }
    expect('data' in without.blocks.blocks.find((b) => b.id === 'flag')!).toBe(false)
  })

  it('the compiler ignores labels: same program with or without them', () => {
    const { data: _drop, ...bare } = WORKSPACE.blocks.blocks[0] as Record<string, unknown>
    void _drop
    const plain = { blocks: { languageVersion: 0, blocks: [bare, ...WORKSPACE.blocks.blocks.slice(1).map((b) => ({ ...b, data: undefined }))] } }
    const a = compileWorkspace(WORKSPACE)
    const b = compileWorkspace(plain)
    expect(a.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(a.program).toEqual(b.program)
  })

  it('only top-level hats take a label (not definitions or inner blocks)', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(takesLabel(ws.getBlockById('flag')!)).toBe(true)
    expect(takesLabel(ws.getBlockById('bump')!)).toBe(true)
    expect(takesLabel(ws.getBlockById('def')!)).toBe(false)
    expect(takesLabel(ws.getBlockById('call')!)).toBe(false)
  })

  it('puts a magnifier on My Block calls and Platformer blocks, and never saves it', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    for (const id of ['call', 'grav', 'bump', 'sp']) expect(ws.getBlockById(id)!.getField('MAGNIFIER'), id).toBeTruthy()
    expect(ws.getBlockById('flag')!.getField('MAGNIFIER')).toBeNull()
    expect(ws.getBlockById('def')!.getField('MAGNIFIER')).toBeNull()
    expect(JSON.stringify(Blockly.serialization.workspaces.save(ws))).not.toContain('MAGNIFIER')
  })

  it('clicking a call\'s magnifier asks to drill into its definition; a Platformer one asks to explain', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    const drilled: string[] = []
    const explained: string[] = []
    const words: string[] = []
    setWorkspaceHandlers(ws, { drill: (c) => drilled.push(c), explain: (op, text) => { explained.push(op); words.push(text) } })
    ws.getBlockById('call')!.getField('MAGNIFIER')!.showEditor()
    ws.getBlockById('grav')!.getField('MAGNIFIER')!.showEditor()
    ws.getBlockById('bump')!.getField('MAGNIFIER')!.showEditor()
    expect(drilled).toEqual(['walk at %s'])
    expect(explained).toEqual(['platformer_setgravity', 'platformer_whenbump'])
    // The card gets the block's own words, not the button's label.
    for (const text of words) expect(text).not.toMatch(/How this block works|See inside/)
  })

  it('the ? also works in the palette (it asks the editor, not the palette), and the 🔍 stays out of it', () => {
    ws = new Blockly.Workspace()
    const palette = new Blockly.Workspace()
    Object.defineProperty(palette, 'isFlyout', { value: true })
    ;(palette as unknown as { targetWorkspace: Blockly.Workspace }).targetWorkspace = ws
    Blockly.serialization.workspaces.load(WORKSPACE, palette)
    const explained: string[] = []
    setWorkspaceHandlers(ws, { drill: () => {}, explain: (op) => explained.push(op) })
    const help = palette.getBlockById('grav')!.getField('MAGNIFIER')!
    expect(help.isClickableInFlyout(true)).toBe(true)
    help.showEditor()
    expect(explained).toEqual(['platformer_setgravity'])
    expect(palette.getBlockById('call')!.getField('MAGNIFIER')).toBeNull()
    palette.dispose()
  })

  it('folds the Hero definitions on open without changing their compiled program', () => {
    ws = new Blockly.Workspace()
    const json = createHeroWorkspace()
    Blockly.serialization.workspaces.load(json, ws)
    const before = compileWorkspace(Blockly.serialization.workspaces.save(ws)).program
    expect(foldLongDefinitions(ws)).toBe(true)
    expect(listDefinitions(ws).every(({ block }) => block.isCollapsed())).toBe(true)
    expect(compileWorkspace(Blockly.serialization.workspaces.save(ws)).program).toEqual(before)
  })

  it('does not fold a short brick automatically', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(foldLongDefinitions(ws)).toBe(false)
    expect(ws.getBlockById('def')!.isCollapsed()).toBe(false)
  })

  it('the top view hides definitions; drilled in shows only that definition', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    expect(listDefinitions(ws).map((d) => d.proccode)).toEqual(['walk at %s'])
    const shown = (state: typeof TOP_VIEW) => ws.getTopBlocks(true).filter((b) => isShownIn(b, state)).map((b) => b.id)
    expect(shown(TOP_VIEW)).toEqual(['flag', 'bump'])
    expect(shown(drillInto(TOP_VIEW, 'walk at %s'))).toEqual(['def'])
    expect(shown(drillInto(TOP_VIEW, 'missing'))).toEqual([])
  })

  it('opens at a readable size with the first hat\'s label at the top left (not shrunk to fit)', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(WORKSPACE, ws)
    const flag = ws.getBlockById('flag')! as Blockly.BlockSvg
    const blockBounds = new Blockly.utils.Rect(20, 160, 20, 320)
    flag.getBoundingRectangle = () => blockBounds
    const scroll = vi.fn()
    const setScale = vi.fn()
    const displayed = {
      getTopBlocks: () => [flag],
      getMetrics: () => ({ viewWidth: 700, viewHeight: 580 }),
      options: { zoomOptions: { minScale: 0.65, maxScale: 2 } },
      setScale,
      scroll,
    } as unknown as Blockly.WorkspaceSvg
    focusView(displayed, TOP_VIEW)
    expect(setScale).toHaveBeenLastCalledWith(READABLE_SCALE)
    // The label's top (block top minus its band) lands 24 px in: scrollY = 24 - top * scale.
    const [, labelledY] = scroll.mock.calls[0] as [number, number]
    expect(labelledY).toBeCloseTo(24 - (blockBounds.top - LABEL_BAND) * READABLE_SCALE)
    setLabel(flag, '')
    focusView(displayed, TOP_VIEW)
    const [plainX, plainY] = scroll.mock.calls[1] as [number, number]
    expect(labelledY - plainY).toBeCloseTo(LABEL_BAND * READABLE_SCALE)
    expect(plainX).toBeCloseTo(24 - blockBounds.left * READABLE_SCALE)
    // A narrow editor (a Duo) opens a little smaller.
    ;(displayed as unknown as { getMetrics: () => object }).getMetrics = () => ({ viewWidth: 400, viewHeight: 580 })
    focusView(displayed, TOP_VIEW)
    expect(setScale).toHaveBeenLastCalledWith(READABLE_SCALE_NARROW)
    expect(blockBounds.top).toBe(20)
  })

  it('the Hero\'s top view shows its level-start script, its receivers and a kid\'s scripts; "How I move" shows the rest', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(createHeroWorkspace(), ws)
    const kid = ws.newBlock('platformer_everytick', 'kid')
    const tracker = new SectionTracker(sectionsForBrick({ id: HERO_BRICK_ID }))
    const shown = (state: typeof TOP_VIEW) => ws.getTopBlocks(false).filter((b) => isShownIn(b, state, tracker.sectionOf))
    const top = shown(TOP_VIEW)
    expect(top.map((b) => b.type)).toEqual(['event_whenflagclicked', ...Array(4).fill('event_whenbroadcastreceived'), 'platformer_everytick'])
    expect(top[top.length - 1]).toBe(kid)
    // The section's list shows no blocks; "all of them" shows every movement script; one script shows just it.
    expect(shown(openSection('how-i-move'))).toEqual([])
    const section = shown(openScript('how-i-move', ALL_SCRIPTS))
    expect(section.length).toBeGreaterThan(20)
    expect(shown(openScript('how-i-move', section[3].id))).toEqual([section[3]])
    expect(section.every((b) => b.type === 'platformer_everytick' || b.type === 'platformer_whenbump')).toBe(true)
    expect(section).not.toContain(kid)
    // Every script is in exactly one of the two; the definition only shows drilled in.
    const scripts = ws.getTopBlocks(false).filter((b) => b.type !== 'procedures_definition')
    expect(top.length + section.length).toBe(scripts.length)
    expect(shown(drillInto(openSection('how-i-move'), 'move and collide')).map((b) => b.type)).toEqual(['procedures_definition'])
  })

  it('a script pinned to a section stays there for the visit; an inner block never counts as a script', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(createHeroWorkspace(), ws)
    const kid = ws.newBlock('platformer_everytick', 'kid')
    const tracker = new SectionTracker(sectionsForBrick({ id: HERO_BRICK_ID }))
    expect(tracker.sectionOf(kid)).toBeNull()
    tracker.pin('kid', 'how-i-move')
    expect(tracker.sectionOf(kid)).toBe('how-i-move')
    tracker.pin('kid', null)
    expect(tracker.sectionOf(kid)).toBeNull()
    const inner = ws.getTopBlocks(false).find((b) => b.type === 'platformer_everytick')!.getChildren(false)[0]
    expect(tracker.sectionOf(inner)).toBeNull()
  })

  it('a brick without sections shows every script on top, as before', () => {
    ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(createHeroWorkspace(), ws)
    const none = new SectionTracker(sectionsForBrick({ id: 'brick_walker' }))
    const scripts = ws.getTopBlocks(false).filter((b) => b.type !== 'procedures_definition')
    expect(scripts.every((b) => isShownIn(b, TOP_VIEW, none.sectionOf))).toBe(true)
    expect(scripts.every((b) => isShownIn(b, TOP_VIEW))).toBe(true)
  })
})
