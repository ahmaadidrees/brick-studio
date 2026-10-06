import { describe, expect, it, vi } from 'vitest'
import { StudioStore, emptyProject } from '../store'
import { fakeTemplate } from './testTemplates'
import { activeEntryId, brickEntryId, categoryForBrick, drawerEntries, standardKeyOf } from './catalog'
import { fakeGridTemplate } from './testGridBricks'
import { blankTileLayer, ensureTiles, withTiles } from './ensureTiles'
import { knobRange, snapKnob } from './knobs'
import { createBlankBrick, createBrickFromTemplate } from './newBrick'

// gridBrickTemplate is a stub until the step 7 bricks lane merges: these tests use the builder's test double.
vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('./testGridBricks')).fakeGridTemplate }))

describe('drawer catalog', () => {
  it('has no fixed tiles: Terrain and Blocks list the standard grid bricks by category, in order, whether or not the level has them', () => {
    const entries = drawerEntries([])
    expect(entries.filter((e) => e.category === 'terrain').map((e) => e.name)).toEqual(['Ground', 'Hard block', 'Spikes', 'Lava', 'One-way platform'])
    expect(entries.filter((e) => e.category === 'blocks').map((e) => e.name)).toEqual(['Brick', '? block', 'Bounce block'])
    expect(entries.every((e) => e.id.startsWith('grid:') && !e.brick)).toBe(true)
  })
  it('a standard grid brick the level has is that brick (no second entry); a kid\'s own grid brick is under My bricks; other bricks sort by name', () => {
    const q = { ...fakeGridTemplate('qblock').brick, id: 'q1' }
    const mine = { ...fakeGridTemplate('hard').brick, id: 'm1', name: 'Mud', grid: { char: 'M' } }
    const walker = { ...fakeGridTemplate('hard').brick, id: 'w1', name: 'Walker', grid: undefined }
    const entries = drawerEntries([q, mine, walker])
    expect(entries.find((e) => e.id === 'grid:qblock')?.brick?.id).toBe('q1')
    expect(entries.filter((e) => e.name === '? block')).toHaveLength(1)
    expect(entries.find((e) => e.id === 'brick:m1')).toMatchObject({ name: 'Mud', category: 'mine' })
    expect(entries.find((e) => e.id === 'brick:w1')).toMatchObject({ category: 'critters' })
    expect(standardKeyOf(q)).toBe('qblock')
    expect(standardKeyOf(mine)).toBeUndefined()
  })
  it('sorts bricks into the real categories by name, and anything else is My bricks', () => {
    expect(categoryForBrick({ name: 'Walker' })).toBe('critters')
    expect(categoryForBrick({ name: 'Walker 2' })).toBe('critters')
    expect(categoryForBrick({ name: 'Coin' })).toBe('items')
    expect(categoryForBrick({ name: 'Spring' })).toBe('blocks')
    expect(categoryForBrick({ name: 'Hero' })).toBe('course')
    expect(categoryForBrick({ name: 'Goal' })).toBe('course')
    expect(categoryForBrick({ name: 'Robot' })).toBe('mine')
  })
  it('knows which entry the armed brush is', () => {
    const ground = { ...fakeGridTemplate('ground').brick, id: 'g1' }
    const plain = { ...fakeGridTemplate('hard').brick, id: 'b1', grid: undefined }
    expect(activeEntryId('g1', [ground, plain])).toBe('grid:ground')
    expect(activeEntryId('b1', [ground, plain])).toBe(brickEntryId('b1'))
    expect(activeEntryId(null, [ground])).toBeNull()
    expect(activeEntryId('gone', [ground])).toBeNull()
  })
})

describe('knob slider range', () => {
  it('goes 0 to twice the start, whole steps for whole numbers and 0.05 otherwise', () => {
    expect(knobRange(3)).toEqual({ min: 0, max: 6, step: 1 })
    expect(knobRange(0.5)).toEqual({ min: 0, max: 1, step: 0.05 })
  })
  it('handles zero, negatives and a value outside the range', () => {
    expect(knobRange(0)).toEqual({ min: 0, max: 10, step: 1 })
    expect(knobRange(-4)).toEqual({ min: -8, max: 0, step: 1 })
    expect(knobRange(3, 20).max).toBe(20)
  })
  it('snaps away floating-point noise', () => {
    expect(snapKnob(0.30000000000000004, 0.05)).toBe(0.3)
    expect(snapKnob(4.2, 1)).toBe(4)
  })
})

describe('tile layer for older saves', () => {
  it('covers the 960 by 360 level with 60 by 23 cells, row 0 at the bottom', () => {
    const l = blankTileLayer({ left: 0, right: 960, bottom: 0, top: 360 })
    expect(l.cols).toBe(60)
    expect(l.rows).toBe(23)
    expect(l.data[0]).toBe('.'.repeat(60))
  })
  it('adds a layer only when missing, and painting works afterwards', () => {
    const p = emptyProject()
    delete p.design.tiles
    const store = new StudioStore(p)
    store.setTile(1, 0, 'G')
    expect(store.getState().project.design.tiles).toBeUndefined()
    ensureTiles(store)
    store.setTile(1, 0, 'G')
    expect(store.getState().project.design.tiles!.data[0].slice(0, 3)).toBe('.G.')
    const again = store.getState().project
    expect(withTiles(again)).toBe(again)
  })
})

describe('+ New brick', () => {
  it('a template becomes a selected brick with its workspace, and the workshop opens on it', () => {
    const store = new StudioStore(emptyProject())
    const id = createBrickFromTemplate(store, fakeTemplate, 'Robot')
    const s = store.getState()
    expect(s.workshopBrickId).toBe(id)
    expect(s.selectedBrickId).toBe(id)
    expect(s.brushBrickId).toBe(id)
    const brick = s.project.design.bricks.find((b) => b.id === id)!
    expect(brick.name).toBe('Robot')
    expect(brick.program.variables[0].id).toBe('fake_speed')
    expect(s.project.workspaces[id]).toMatchObject({ marker: 'fake_1' })
  })
  it('names stay unique, and make() gets a fresh id each time', () => {
    const store = new StudioStore(emptyProject())
    createBrickFromTemplate(store, fakeTemplate, 'Robot')
    const id2 = createBrickFromTemplate(store, fakeTemplate, 'Robot')
    const bricks = store.getState().project.design.bricks
    expect(bricks.map((b) => b.name)).toEqual(['Robot', 'Robot 2'])
    expect(store.getState().project.workspaces[id2]).toMatchObject({ marker: 'fake_2' })
  })
  it('with no templates a blank brick still opens the workshop', () => {
    const store = new StudioStore(emptyProject())
    const id = createBlankBrick(store, 'Ghost')
    expect(store.getState().workshopBrickId).toBe(id)
    expect(store.getState().project.design.bricks[0].costumes).toHaveLength(1)
  })
})
