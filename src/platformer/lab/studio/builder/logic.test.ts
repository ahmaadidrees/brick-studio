import { describe, expect, it } from 'vitest'
import { StudioStore, emptyProject } from '../store'
import { fakeTemplate } from './testTemplates'
import { TILE_ENTRIES, activeEntryId, brickEntryId, categoryForBrick } from './catalog'
import { blankTileLayer, ensureTiles, withTiles } from './ensureTiles'
import { knobRange, snapKnob } from './knobs'
import { createBlankBrick, createBrickFromTemplate } from './newBrick'

describe('drawer catalog', () => {
  it('has the real builder tiles with the contract characters', () => {
    const byLabel = Object.fromEntries(TILE_ENTRIES.map((t) => [t.label, t.ch]))
    expect(byLabel).toMatchObject({ Ground: 'G', 'Hard block': 'H', Spikes: 'S', Lava: 'L', Brick: 'B', '? block': 'Q' })
    expect(TILE_ENTRIES.filter((t) => t.category === 'terrain').map((t) => t.label)).toEqual(['Ground', 'Hard block', 'Spikes', 'Lava', 'One-way platform'])
    expect(TILE_ENTRIES.filter((t) => t.category === 'blocks').map((t) => t.label)).toEqual(['Brick', '? block', 'Bounce block'])
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
    expect(activeEntryId('G', null)).toBe('tile:ground')
    expect(activeEntryId(null, 'b1')).toBe(brickEntryId('b1'))
    expect(activeEntryId(null, null)).toBeNull()
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
