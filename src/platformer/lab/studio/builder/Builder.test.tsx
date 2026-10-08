import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { fitCamera, worldToScreen } from '../stage/camera'
import { StudioStore, emptyProject } from '../store'
import { Builder } from './Builder'
import { builderSession } from './session'
import { removeCopyEdit } from './history'
import { fakeTemplate } from './testTemplates'
import { costumeFromImage, imageFromRows } from '../pixels'

// gridBrickTemplate is a stub until the step 7 bricks lane merges: these tests use the builder's test double.
vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('./testGridBricks')).fakeGridTemplate }))

afterEach(cleanup)

function storeWithBrick() {
  const store = new StudioStore(emptyProject())
  const id = store.addBrick('Walker', costumeFromImage('c', imageFromRows(['####', '####', '####', '####'], { '#': '#336699' })))
  return { store, id }
}

/** Where a world point is on the canvas in jsdom (no layout: the canvas is at 0,0 and the viewport is the stage's default 480 by 360). */
function screenOf(store: StudioStore, wx: number, wy: number) {
  const bounds = store.getState().project.design.bounds
  const vp = { width: 480, height: 360 }
  const [x, y] = worldToScreen(fitCamera(bounds, vp), vp, wx, wy)
  return { clientX: x, clientY: y }
}

describe('Builder chrome', () => {
  it('shows the header, the Bricks drawer, history and the Placing strip', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    expect(screen.getByRole('banner', { name: 'Studio toolbar' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Brick drawer' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Edit history' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Placing' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erase' })).toBeTruthy()
    // the Stage's own Brush/Select toolbar is gone
    expect(screen.queryByRole('button', { name: /Brush tool/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Select tool/ })).toBeNull()
  })

  it('lists the standard grid bricks (even before the level has them) and the level\'s bricks, and categories filter them', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    const grid = screen.getByLabelText('Brick shapes')
    for (const name of ['Ground', 'Hard block', 'Spikes', 'Lava', 'One-way platform', 'Brick', '? block', 'Bounce block', 'Walker', '+ New brick']) {
      expect(within(grid).getByRole('button', { name })).toBeTruthy()
    }
    // none of them is in the level yet: only Walker is
    expect(store.getState().project.design.bricks.map((b) => b.name)).toEqual(['Walker'])
    fireEvent.change(screen.getByLabelText('Brick category'), { target: { value: 'terrain' } })
    expect(within(screen.getByLabelText('Brick shapes')).queryByRole('button', { name: 'Walker' })).toBeNull()
    expect(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'Spikes' })).toBeTruthy()
  })

  it('choosing a grid brick the level lacks adds it (addBrickFrom) and arms it to paint; choosing it again adds nothing', () => {
    const { store, id } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Spikes' }))
    const spikes = store.getState().project.design.bricks.find((b) => b.name === 'Spikes')!
    expect(spikes.grid?.char).toBe('S')
    expect(store.getState().brushBrickId).toBe(spikes.id)
    expect(store.getState().project.workspaces[spikes.id]).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    expect(store.getState().brushBrickId).toBe(id)
    fireEvent.click(screen.getByRole('button', { name: 'Spikes' }))
    expect(store.getState().brushBrickId).toBe(spikes.id)
    expect(store.getState().project.design.bricks.filter((b) => b.name === 'Spikes')).toHaveLength(1)
    expect(within(screen.getByRole('group', { name: 'Placing' })).getByText('Spikes')).toBeTruthy()
  })

  it('upgrades a save without tiles so painting works', () => {
    const p = emptyProject()
    delete p.design.tiles
    const store = new StudioStore(p)
    render(<Builder store={store} templates={[]} />)
    expect(store.getState().project.design.tiles).toBeTruthy()
  })
})

describe('painting and selecting on the canvas', () => {
  it('a tile click paints the cell under it (row 0 is the bottom) and Undo takes it back', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    // world (40, 5): column 2, bottom row
    fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, 40, 5) })
    fireEvent.pointerUp(canvas, { button: 0 })
    expect(store.getState().project.design.tiles!.data[0].slice(0, 4)).toBe('..G.')
    // a click near the top paints a high row, not row 0
    fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, 40, 100) })
    fireEvent.pointerUp(canvas, { button: 0 })
    expect(store.getState().project.design.tiles!.data[6][2]).toBe('G')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project.design.tiles!.data[6][2]).toBe('.')
    expect(store.getState().project.design.tiles!.data[0][2]).toBe('G')
  })

  it('right-click erases a tile', () => {
    const { store } = storeWithBrick()
    store.setTile(2, 0, 'G')
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    fireEvent.pointerDown(canvas, { button: 2, ...screenOf(store, 40, 5) })
    fireEvent.pointerUp(canvas, { button: 2 })
    expect(store.getState().project.design.tiles!.data[0][2]).toBe('.')
  })

  it('clicking an existing copy selects it (and shows See inside) instead of painting', () => {
    const { store, id } = storeWithBrick()
    const copyId = store.addCopy(id, 200, 100)
    store.selectCopy(null)
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    const before = store.getState().project.design.tiles
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, 200, 100) })
    fireEvent.pointerUp(canvas, { button: 0 })
    expect(store.getState().selectedCopyId).toBe(copyId)
    expect(store.getState().project.design.tiles).toBe(before)
    expect(store.getState().project.design.copies).toHaveLength(1)
  })

  it('a brick click places one copy, snapped to the 8-step grid, and does not select it', () => {
    const { store, id } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, 405, 77) })
    fireEvent.pointerUp(canvas, { button: 0 })
    const copies = store.getState().project.design.copies
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ brickId: id, x: 408, y: 80 })
    expect(store.getState().selectedCopyId).toBeNull()
  })
})

describe('grid bricks: paint, select a cell, See inside, Remove', () => {
  const canvasOf = () => document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
  const row = (store: StudioStore, r: number) => store.getState().project.design.tiles!.data[r]

  /** Arm ? block and drag across five cells of row 2 (world y 40). */
  function paintRowOfQ() {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '? block' }))
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 2, 40) })
    fireEvent.pointerMove(canvasOf(), { ...screenOf(store, 8 + 16 * 6, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    return store
  }

  it('dragging with ? block armed paints a row of its character, as one undo step', () => {
    const store = paintRowOfQ()
    expect(row(store, 2).slice(0, 8)).toBe('..QQQQQ.')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(row(store, 2).slice(0, 8)).toBe('........')
  })

  it('clicking a painted cell selects it as cell:<col>:<row>; the card shows its icon, name and "N in this level", with no knobs', () => {
    const store = paintRowOfQ()
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 4, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    expect(store.getState().selectedCopyId).toBe('cell:4:2')
    // the press did not change the cells
    expect(row(store, 2).slice(0, 8)).toBe('..QQQQQ.')
    const card = screen.getByRole('region', { name: '? block copy' })
    expect(within(card).getByText('5 in this level')).toBeTruthy()
    expect(within(card).getByText('? block')).toBeTruthy()
    expect(card.querySelector('img')).toBeTruthy()
    expect(within(card).queryByRole('slider')).toBeNull()
    expect(within(card).queryByRole('group', { name: /knobs/ })).toBeNull()
  })

  it('See inside opens the workshop on the ? block brick, and Done brings the builder back with the cell still selected', () => {
    const store = paintRowOfQ()
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 4, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    fireEvent.click(within(screen.getByRole('region', { name: '? block copy' })).getByRole('button', { name: /See inside/ }))
    const q = store.getState().project.design.bricks.find((b) => b.name === '? block')!
    expect(store.getState().workshopBrickId).toBe(q.id)
    act(() => store.closeWorkshop())
    expect(store.getState().selectedCopyId).toBe('cell:4:2')
    expect(screen.getByRole('region', { name: '? block copy' })).toBeTruthy()
  })

  it('Remove clears just that cell (one undo step, and Undo puts it back)', () => {
    const store = paintRowOfQ()
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 4, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Remove this ? block' }))
    expect(row(store, 2).slice(0, 8)).toBe('..QQ.QQ.')
    expect(store.getState().selectedCopyId).toBeNull()
    expect(screen.queryByRole('region', { name: '? block copy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(row(store, 2).slice(0, 8)).toBe('..QQQQQ.')
  })

  it('the Delete key removes the selected cell too, and a deleteCopy-style path never throws on a cell id', () => {
    const store = paintRowOfQ()
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 3, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    fireEvent.keyDown(screen.getByLabelText('Level Stage'), { key: 'Delete' })
    expect(row(store, 2).slice(0, 8)).toBe('..Q.QQQ.')
    // arrows do not nudge a cell
    act(() => store.selectCopy('cell:2:2'))
    fireEvent.keyDown(screen.getByLabelText('Level Stage'), { key: 'ArrowRight' })
    expect(row(store, 2).slice(0, 8)).toBe('..Q.QQQ.')
    expect(() => act(() => store.deleteCopy('cell:2:2'))).not.toThrow()
  })

  it('with a normal brick armed (or the eraser off and nothing armed), a press on a painted cell selects it; right-click still erases it', () => {
    const store = paintRowOfQ()
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 3, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    expect(store.getState().selectedCopyId).toBe('cell:3:2')
    expect(store.getState().project.design.copies).toHaveLength(0)
    fireEvent.pointerDown(canvasOf(), { button: 2, ...screenOf(store, 8 + 16 * 3, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 2 })
    expect(row(store, 2).slice(0, 8)).toBe('..Q.QQQ.')
    expect(store.getState().selectedCopyId).toBeNull()
  })

  it('a Hero standing in front of a cell still wins the click', () => {
    const { store, id } = storeWithBrick()
    store.setTile(5, 2, 'Q')
    const hero = store.addCopy(id, 5 * 16 + 8, 2 * 16 + 8)
    store.selectCopy(null)
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '? block' }))
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 5 * 16 + 8, 2 * 16 + 8) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    expect(store.getState().selectedCopyId).toBe(hero)
  })

  it('painting a different grid brick over a cell replaces it; clicking elsewhere deselects', () => {
    const store = paintRowOfQ()
    fireEvent.click(screen.getByRole('button', { name: 'Hard block' }))
    fireEvent.pointerDown(canvasOf(), { button: 0, ...screenOf(store, 8 + 16 * 2, 40) })
    fireEvent.pointerUp(canvasOf(), { button: 0 })
    expect(row(store, 2).slice(0, 8)).toBe('..HQQQQ.')
    expect(store.getState().selectedCopyId).toBeNull()
  })
})

describe('See inside card', () => {
  it('shows the brick, how many copies, and opens the workshop', () => {
    const p = createStarterProject()
    const store = new StudioStore(p)
    const walkers = p.design.copies.filter((c) => c.brickId === 'brick_walker')
    store.selectCopy(walkers[0].id)
    render(<Builder store={store} templates={[]} />)
    const card = screen.getByRole('region', { name: 'Walker copy' })
    expect(within(card).getByText(`${walkers.length} in this level`)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /See inside/ }))
    expect(store.getState().workshopBrickId).toBe('brick_walker')
  })

  it('edits this copy\'s knob with a slider, and Remove deletes the copy (undoable)', () => {
    const store = new StudioStore(createStarterProject())
    const copy = store.getState().project.design.copies.find((c) => c.brickId === 'brick_walker')!
    store.selectCopy(copy.id)
    render(<Builder store={store} templates={[]} />)
    const slider = screen.getByRole('slider', { name: 'speed' })
    fireEvent.change(slider, { target: { value: '1' } })
    const speedId = store.getState().project.design.bricks.find((b) => b.id === 'brick_walker')!.program.variables.find((v) => v.name === 'speed')!.id
    expect(store.getState().project.design.copies.find((c) => c.id === copy.id)!.knobs?.[speedId]).toBe(1)
    // the slider edit is on the undo history
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project.design.copies.find((c) => c.id === copy.id)!.knobs?.[speedId]).toBe(copy.knobs?.[speedId])
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(store.getState().project.design.copies.find((c) => c.id === copy.id)!.knobs?.[speedId]).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove this Walker' }))
    expect(store.getState().project.design.copies.some((c) => c.id === copy.id)).toBe(false)
    expect(store.getState().selectedCopyId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project.design.copies.some((c) => c.brickId === 'brick_walker' && c.x === copy.x && c.y === copy.y)).toBe(true)
  })
})

describe('one Hero, one Goal (limit 1)', () => {
  const heroOf = (store: StudioStore) => store.getState().project.design.copies.filter((c) => c.brickId === 'brick_hero')

  it('clicking the Hero in the starter selects it and shows See inside, with no per-copy knobs', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    expect(screen.queryByRole('region', { name: 'Hero copy' })).toBeNull()
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    // the Hero's copy sits at (60, 40): with the Brush on any brick, the press must select it, not place or paint
    fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, 60, 40) })
    fireEvent.pointerUp(canvas, { button: 0 })
    expect(store.getState().selectedCopyId).toBe('copy_hero')
    const card = screen.getByRole('region', { name: 'Hero copy' })
    expect(within(card).getByText('One per level')).toBeTruthy()
    expect(within(card).queryByRole('slider')).toBeNull()
    expect(within(card).queryByRole('group', { name: /knobs/ })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: /See inside/ }))
    expect(store.getState().workshopBrickId).toBe('brick_hero')
  })

  it('the Hero card stays small: it is not a wall of sliders (the Walker still has its speed knob)', () => {
    const store = new StudioStore(createStarterProject())
    store.selectCopy('copy_hero')
    render(<Builder store={store} templates={[]} />)
    expect(screen.queryAllByRole('slider')).toHaveLength(0)
    act(() => store.selectCopy('copy_walker_fast'))
    expect(screen.getAllByRole('slider')).toHaveLength(1)
  })

  it('the Bricks drawer calls it Hero, not Start', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    const grid = screen.getByLabelText('Brick shapes')
    expect(within(grid).getByRole('button', { name: 'Hero' })).toBeTruthy()
    expect(within(grid).queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('placing the Hero again moves the one you have; the strip says so; Undo moves it back', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'Hero' }))
    expect(within(screen.getByRole('group', { name: 'Placing' })).getByText(/Moves your Hero/)).toBeTruthy()
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    const before = store.getState().project.design.copies.length
    fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, 405, 200) })
    fireEvent.pointerUp(canvas, { button: 0 })
    expect(store.getState().project.design.copies).toHaveLength(before)
    expect(heroOf(store)).toHaveLength(1)
    expect(heroOf(store)[0]).toMatchObject({ id: 'copy_hero', x: 408, y: 200 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(heroOf(store)).toHaveLength(1)
    expect(heroOf(store)[0]).toMatchObject({ id: 'copy_hero', x: 60, y: 40 })
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(heroOf(store)[0]).toMatchObject({ x: 408, y: 200 })
  })

  it('the Goal is one per level too, but the Walker is not', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    const grid = screen.getByLabelText('Brick shapes')
    const canvas = document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
    const place = (name: string, wx: number, wy: number) => {
      fireEvent.click(within(grid).getByRole('button', { name }))
      fireEvent.pointerDown(canvas, { button: 0, ...screenOf(store, wx, wy) })
      fireEvent.pointerUp(canvas, { button: 0 })
    }
    place('Goal', 300, 200)
    place('Walker', 400, 200)
    const copies = store.getState().project.design.copies
    expect(copies.filter((c) => c.brickId === 'brick_goal')).toHaveLength(1)
    expect(copies.filter((c) => c.brickId === 'brick_goal')[0]).toMatchObject({ x: 304, y: 200 })
    expect(copies.filter((c) => c.brickId === 'brick_walker')).toHaveLength(3)
  })

  it('the Hero and the Goal have no Remove on their card (a level needs them); the Walker does', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    act(() => store.selectCopy('copy_hero'))
    expect(screen.getByText('One per level')).toBeTruthy()
    expect(screen.getByText('Place it again to move it')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove this Hero' })).toBeNull()
    expect(screen.getByRole('button', { name: /See inside/ })).toBeTruthy()
    const goal = store.getState().project.design.copies.find((c) => c.brickId === 'brick_goal')!
    act(() => store.selectCopy(goal.id))
    expect(screen.queryByRole('button', { name: 'Remove this Goal' })).toBeNull()
    const walker = store.getState().project.design.copies.find((c) => c.brickId === 'brick_walker')!
    act(() => store.selectCopy(walker.id))
    expect(screen.getByRole('button', { name: 'Remove this Walker' })).toBeTruthy()
  })

  it('Undo of a removed Hero does not bring back a second one when another was placed since', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    const hero = store.getState().project.design.copies.find((c) => c.id === 'copy_hero')!
    act(() => {
      builderSession(store).history.push(removeCopyEdit(builderSession(store).history, hero))
      store.deleteCopy('copy_hero')
    })
    expect(heroOf(store)).toHaveLength(0)
    act(() => {
      store.addCopy('brick_hero', 200, 100)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(heroOf(store)).toHaveLength(1)
  })

  it('keeps the stage clear of the Bricks drawer, so a Hero at the far left is never under it', () => {
    const store = new StudioStore(createStarterProject())
    const { container } = render(<Builder store={store} templates={[]} />)
    const root = container.querySelector('.builder')!
    expect(root.classList.contains('builder-drawer-open')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Collapse|Hide/ }))
    expect(root.classList.contains('builder-drawer-open')).toBe(false)
  })
})

describe('+ New brick picker', () => {
  it('with no templates it says so and offers a blank brick', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New brick' }))
    expect(screen.getByRole('dialog', { name: 'Make a new brick' })).toBeTruthy()
    expect(screen.getByText(/Starter bricks are not ready yet/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Blank brick/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Robot' }))
    const s = store.getState()
    expect(s.workshopBrickId).toBe(s.project.design.bricks.find((b) => b.name === 'Robot')!.id)
  })

  it('pick a template, pick a name, and the new brick is added, selected and opened in the workshop', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[fakeTemplate]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New brick' }))
    const picker = screen.getByRole('dialog', { name: 'Make a new brick' })
    fireEvent.click(within(picker).getByRole('button', { name: /Start from Fake/ }))
    expect(screen.getByRole('dialog', { name: 'Pick a name for your brick' })).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Robot' }))
    })
    const s = store.getState()
    const made = s.project.design.bricks.find((b) => b.name === 'Robot')!
    expect(made).toBeTruthy()
    expect(s.workshopBrickId).toBe(made.id)
    expect(s.selectedBrickId).toBe(made.id)
    expect(s.project.workspaces[made.id]).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Cancel makes nothing', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[fakeTemplate]} />)
    fireEvent.click(screen.getByRole('button', { name: '+ New brick' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(store.getState().project.design.bricks).toHaveLength(1)
    expect(store.getState().workshopBrickId).toBeNull()
  })
})

describe('Build and Play from the header', () => {
  it('Play starts the run and Build comes back; the drawer hides while playing', () => {
    const store = new StudioStore(createStarterProject())
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('radio', { name: /Play/ }))
    expect(store.getState().mode).toBe('play')
    expect(screen.queryByRole('complementary', { name: 'Brick drawer' })).toBeNull()
    expect(screen.getByRole('button', { name: /Green flag/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /Build/ }))
    expect(store.getState().mode).toBe('build')
    expect(screen.getByRole('complementary', { name: 'Brick drawer' })).toBeTruthy()
  })
})
