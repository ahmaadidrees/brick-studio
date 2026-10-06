import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createStarterProject } from '../starter'
import { fitCamera, worldToScreen } from '../stage/camera'
import { StudioStore, emptyProject } from '../store'
import { Builder } from './Builder'
import { fakeTemplate } from './testTemplates'
import { costumeFromImage, imageFromRows } from '../pixels'

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

  it('lists the tiles and the level\'s bricks, and categories filter them', () => {
    const { store } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    const grid = screen.getByLabelText('Brick shapes')
    for (const name of ['Ground', 'Hard block', 'Spikes', 'Lava', 'Brick', '? block', 'Walker', '+ New brick']) {
      expect(within(grid).getByRole('button', { name })).toBeTruthy()
    }
    fireEvent.change(screen.getByLabelText('Brick category'), { target: { value: 'terrain' } })
    expect(within(screen.getByLabelText('Brick shapes')).queryByRole('button', { name: 'Walker' })).toBeNull()
    expect(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'Spikes' })).toBeTruthy()
  })

  it('choosing a tile arms it for painting; choosing a brick arms it for placing', () => {
    const { store, id } = storeWithBrick()
    render(<Builder store={store} templates={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Spikes' }))
    expect(store.getState().brushTile).toBe('S')
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    expect(store.getState().brushTile).toBeNull()
    expect(store.getState().brushBrickId).toBe(id)
    expect(within(screen.getByRole('group', { name: 'Placing' })).getByText('Walker')).toBeTruthy()
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
    fireEvent.click(screen.getByRole('button', { name: 'Remove this Walker' }))
    expect(store.getState().project.design.copies.some((c) => c.id === copy.id)).toBe(false)
    expect(store.getState().selectedCopyId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project.design.copies.some((c) => c.brickId === 'brick_walker' && c.x === copy.x && c.y === copy.y)).toBe(true)
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
    const { store } = storeWithBrick()
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
