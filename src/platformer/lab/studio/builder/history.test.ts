import { describe, expect, it } from 'vitest'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore, emptyProject } from '../store'
import { History, addCopyEdit, knobEdit, moveCopyEdit, removeCopyEdit, tileStrokeEdit } from './history'

function setup() {
  const p = emptyProject()
  const store = new StudioStore(p)
  const id = store.addBrick('Box', costumeFromImage('c', imageFromRows(['##', '##'], { '#': '#336699' })))
  return { store, history: new History(store), brickId: id }
}

const row0 = (s: StudioStore) => s.getState().project.design.tiles!.data[0]

describe('builder undo and redo', () => {
  it('a tile stroke is one undo step and one redo step', () => {
    const { store, history } = setup()
    const changes = [0, 1, 2].map((col) => ({ col, row: 0, from: '.', to: 'G' }))
    for (const c of changes) store.setTile(c.col, c.row, c.to)
    history.push(tileStrokeEdit(store, changes))
    expect(row0(store).slice(0, 4)).toBe('GGG.')
    history.undo()
    expect(row0(store).slice(0, 4)).toBe('....')
    history.redo()
    expect(row0(store).slice(0, 4)).toBe('GGG.')
  })

  it('undo of a stroke leaves a cell alone if something else changed it since', () => {
    const { store, history } = setup()
    store.setTile(0, 0, 'G')
    history.push(tileStrokeEdit(store, [{ col: 0, row: 0, from: '.', to: 'G' }]))
    store.setTile(0, 0, 'S')
    history.undo()
    expect(row0(store)[0]).toBe('S')
  })

  it('pushing a new edit clears redo; canUndo and canRedo follow', () => {
    const { store, history } = setup()
    expect(history.canUndo).toBe(false)
    store.setTile(0, 0, 'G')
    history.push(tileStrokeEdit(store, [{ col: 0, row: 0, from: '.', to: 'G' }]))
    history.undo()
    expect(history.canRedo).toBe(true)
    history.push(tileStrokeEdit(store, [{ col: 1, row: 0, from: '.', to: 'G' }]))
    expect(history.canRedo).toBe(false)
  })

  it('placing a copy undoes (removed) and redoes (back)', () => {
    const { store, history, brickId } = setup()
    const id = store.addCopy(brickId, 40, 40)
    history.push(addCopyEdit(history, store.getState().project.design.copies[0]))
    history.undo()
    expect(store.getState().project.design.copies).toHaveLength(0)
    history.redo()
    expect(store.getState().project.design.copies).toHaveLength(1)
    expect(store.getState().project.design.copies[0]).toMatchObject({ brickId, x: 40, y: 40 })
    expect(id).toBeTruthy()
  })

  it('removing a copy undoes with its knobs, and an older move still finds the copy after it comes back', () => {
    const { store, history, brickId } = setup()
    const id = store.addCopy(brickId, 8, 8)
    store.setKnob(id, 'v', 5)
    store.addCopy(brickId, 100, 100) // copy2, so the restored copy may not get its old id back
    store.updateCopy(id, { x: 16 })
    history.push(moveCopyEdit(history, id, { x: 8, y: 8 }, { x: 16, y: 8 }))
    const copy = store.getState().project.design.copies.find((c) => c.id === id)!
    history.push(removeCopyEdit(history, copy))
    store.deleteCopy(id)

    history.undo() // restores the copy
    const back = store.getState().project.design.copies.find((c) => c.brickId === brickId && c.x === 16)!
    expect(back.knobs).toEqual({ v: 5 })
    history.undo() // the earlier move, on the restored copy
    expect(store.getState().project.design.copies.some((c) => c.x === 8 && c.y === 8)).toBe(true)
  })

  it('the history is capped so it cannot grow forever', () => {
    const { store, history } = setup()
    for (let i = 0; i < 260; i++) history.push(tileStrokeEdit(store, []))
    let n = 0
    while (history.canUndo) {
      history.undo()
      n++
    }
    expect(n).toBe(200)
  })
})

describe('knob edits in the undo history', () => {
  it('a slider drag is one step from the first value to the last, and redo goes to the last', () => {
    const { store, history, brickId } = setup()
    const copy = store.addCopy(brickId, 10, 10)
    store.setKnob(copy, 'v', 5)
    const knobs = () => store.getState().project.design.copies.find((c) => c.id === copy)!.knobs?.v
    let prev: number | undefined = 5
    for (const n of [6, 7, 8, 9]) {
      history.push(knobEdit(history, copy, 'v', prev, n))
      store.setKnob(copy, 'v', n)
      prev = n
    }
    expect(knobs()).toBe(9)
    history.undo()
    expect(knobs()).toBe(5)
    expect(history.canUndo).toBe(false)
    history.redo()
    expect(knobs()).toBe(9)
  })

  it('a copy with no override goes back to following the brick when the first edit is undone', () => {
    const { store, history, brickId } = setup()
    const copy = store.addCopy(brickId, 10, 10)
    history.push(knobEdit(history, copy, 'v', undefined, 3))
    store.setKnob(copy, 'v', 3)
    history.undo()
    expect(store.getState().project.design.copies.find((c) => c.id === copy)!.knobs?.v).toBeUndefined()
  })

  it('different knobs, or another copy, are separate steps', () => {
    const { store, history, brickId } = setup()
    const a = store.addCopy(brickId, 10, 10)
    const b = store.addCopy(brickId, 20, 10)
    history.push(knobEdit(history, a, 'v', undefined, 1))
    history.push(knobEdit(history, a, 'w', undefined, 1))
    history.push(knobEdit(history, b, 'v', undefined, 1))
    for (const id of [a, a, b]) store.setKnob(id, id === a ? 'v' : 'v', 1)
    history.undo()
    history.undo()
    history.undo()
    expect(history.canUndo).toBe(false)
  })
})
