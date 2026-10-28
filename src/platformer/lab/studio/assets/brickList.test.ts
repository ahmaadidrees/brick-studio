import { describe, expect, it } from 'vitest'
import { blankImage, costumeFromImage } from '../pixels'
import { emptyProject, STAGE_ID, StudioStore } from '../store'
import { chooseUniqueName } from './words'

describe('BrickList and brick store actions', () => {
  it('chooses unique names when names collide', () => {
    const existing = ['Hero', 'Hero 2', 'Coin']
    expect(chooseUniqueName('Star', existing)).toBe('Star')
    expect(chooseUniqueName('Hero', existing)).toBe('Hero 3')
  })

  it('adds a new brick with blank costume, selects it, and arms the brush', () => {
    const store = new StudioStore(emptyProject())
    expect(store.getState().project.design.bricks.length).toBe(0)

    const costume = costumeFromImage('Coin', blankImage(32, 32))
    const id = store.addBrick('Coin', costume)

    const state = store.getState()
    expect(state.project.design.bricks.length).toBe(1)
    expect(state.project.design.bricks[0].name).toBe('Coin')
    expect(state.project.design.bricks[0].costumes[0].width).toBe(32)
    expect(state.project.design.bricks[0].costumes[0].height).toBe(32)
    expect(state.selectedBrickId).toBe(id)
    expect(state.brushBrickId).toBe(id)
  })

  it('renames an existing brick', () => {
    const store = new StudioStore(emptyProject())
    const costume = costumeFromImage('Walker', blankImage(32, 32))
    const id = store.addBrick('Walker', costume)

    store.renameBrick(id, 'Monster')
    const brick = store.brick(id)
    expect(brick?.name).toBe('Monster')
  })

  it('deletes a brick, its copies, and cleans up selection', () => {
    const store = new StudioStore(emptyProject())
    const costume1 = costumeFromImage('Hero', blankImage(32, 32))
    const costume2 = costumeFromImage('Platform', blankImage(32, 32))

    const id1 = store.addBrick('Hero', costume1)
    const id2 = store.addBrick('Platform', costume2)

    // Add copies
    store.addCopy(id1, 100, 100)
    store.addCopy(id2, 200, 100)
    store.addCopy(id1, 300, 100)

    expect(store.getState().project.design.copies.length).toBe(3)

    // Select brick 1
    store.selectBrick(id1)
    store.setBrush(id1)

    // Delete brick 1
    store.deleteBrick(id1)

    const state = store.getState()
    expect(state.project.design.bricks.length).toBe(1)
    expect(state.project.design.bricks[0].id).toBe(id2)
    // Copies of id1 are removed
    expect(state.project.design.copies.length).toBe(1)
    expect(state.project.design.copies[0].brickId).toBe(id2)
    // Selection fell back to another brick or stage
    expect(state.selectedBrickId).toBe(id2)
  })

  it('selects the Stage tile correctly', () => {
    const store = new StudioStore(emptyProject())
    const id = store.addBrick('Hero', costumeFromImage('Hero', blankImage(32, 32)))
    expect(store.getState().selectedBrickId).toBe(id)

    store.selectBrick(STAGE_ID)
    store.setBrush(null)

    expect(store.getState().selectedBrickId).toBe(STAGE_ID)
    expect(store.getState().brushBrickId).toBeNull()
  })
})
