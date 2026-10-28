import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { buildCamera, worldToScreen } from '../stage/camera'
import { StudioStore, emptyProject } from '../store'
import { StudioShell } from './StudioShell'
import { builderSession } from '../builder/session'
import { removeCopyEdit } from '../builder/history'
import { fakeTemplate } from '../builder/testTemplates'
import { costumeFromImage, imageFromRows } from '../pixels'

// gridBrickTemplate is a stub until the step 7 bricks lane merges: these tests use the builder's test double.
vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('../builder/testGridBricks')).fakeGridTemplate }))

vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function storeWithBrick() {
  const store = new StudioStore(emptyProject())
  const id = store.addBrick('Walker', costumeFromImage('c', imageFromRows(['####', '####', '####', '####'], { '#': '#336699' })))
  // addBrick arms the new brick; the studio itself starts on Select.
  store.setBrush(null)
  return { store, id }
}

/** Where a world point is on the canvas in jsdom (no layout: the canvas is at 0,0 and the viewport is the stage's default 480 by 360). */
function screenOf(store: StudioStore, wx: number, wy: number) {
  const bounds = store.getState().project.design.bounds
  const vp = { width: 480, height: 360 }
  const [x, y] = worldToScreen(buildCamera(bounds, vp), vp, wx, wy)
  return { clientX: x, clientY: y }
}

const canvasOf = () => document.querySelector('canvas.stage-canvas') as HTMLCanvasElement
const press = (store: StudioStore, wx: number, wy: number, button = 0) => {
  fireEvent.pointerDown(canvasOf(), { button, ...screenOf(store, wx, wy) })
  fireEvent.pointerUp(canvasOf(), { button })
}
const slot = (name: string) => document.querySelector(`.cl-slot-${name}`) as HTMLElement
const mode = (name: 'Build' | 'Code' | 'Play') => fireEvent.click(screen.getByRole('radio', { name }))

describe('the shell: Build · Code · Play', () => {
  it('starts in Build with the Select tool, the Bricks drawer and no paint strip', () => {
    const { store } = storeWithBrick()
    const { container } = render(<StudioShell store={store} />)
    expect(container.querySelector('.cl-shell')!.getAttribute('data-screen')).toBe('build')
    expect(screen.getByRole('radio', { name: 'Build' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('region', { name: 'Bricks' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Select' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('group', { name: 'Painting' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Erase' })).toBeTruthy()
  })

  it('a fresh studio does not have Ground armed, so clicking the level never paints by surprise', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    expect(store.getState().brushBrickId).toBeNull()
    const before = store.getState().project.design.tiles
    press(store, 300, 200)
    expect(store.getState().project.design.tiles).toBe(before)
  })

  it('Code opens on the Hero when nothing is selected, and on the selected brick otherwise', () => {
    const store = new StudioStore(createStarterProject())
    const { container } = render(<StudioShell store={store} />)
    mode('Code')
    expect(container.querySelector('.cl-shell')!.getAttribute('data-screen')).toBe('code')
    expect(store.getState().selectedBrickId).toBe('brick_hero')
    expect(screen.getByLabelText('Docked code editor')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'In this level' })).toBeTruthy()
    mode('Build')
    act(() => store.selectCopy('copy_walker_fast'))
    mode('Code')
    expect(store.getState().selectedBrickId).toBe('brick_walker')
  })

  it('keys 1, 2 and 3 switch screens, but not while typing', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    fireEvent.keyDown(window, { key: '2' })
    expect(store.getState().cardTab).toBe('code')
    fireEvent.keyDown(window, { key: '1' })
    expect(store.getState().cardTab).toBe('sliders')
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    const search = screen.getByRole('searchbox', { name: 'Search bricks' })
    fireEvent.keyDown(search, { key: '3' })
    expect(store.getState().mode).toBe('build')
    fireEvent.keyDown(window, { key: '3' })
    expect(store.getState().mode).toBe('play')
  })

  it('Code hides the drawer and the zoom tools, and shows its own preview bar', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    mode('Code')
    expect(slot('drawer').hasAttribute('inert')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Zoom in' })).toBeNull()
    const bar = screen.getByRole('toolbar', { name: 'Level preview' })
    expect(within(bar).getByRole('button', { name: 'Pause' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Restart' })).toBeTruthy()
    fireEvent.click(within(bar).getByRole('button', { name: 'Just this brick' }))
    expect(store.getState().codeSolo).toBe(true)
    expect(screen.getByLabelText('Hero on its own')).toBeTruthy()
    mode('Build')
    expect(slot('drawer').hasAttribute('inert')).toBe(false)
    expect(store.getState().runtime).toBeNull()
  })

  it('double-clicking a selected brick opens its code', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    press(store, 60, 40)
    expect(store.getState().selectedCopyId).toBe('copy_hero')
    fireEvent.doubleClick(canvasOf())
    expect(store.getState().cardTab).toBe('code')
    expect(store.getState().selectedBrickId).toBe('brick_hero')
  })

  it('Play starts the run and Build comes back; the drawer is put away while playing', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    mode('Play')
    expect(store.getState().mode).toBe('play')
    expect(slot('drawer').hasAttribute('inert')).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause level' })).toBeTruthy()
    mode('Build')
    expect(store.getState().mode).toBe('build')
    expect(slot('drawer').hasAttribute('inert')).toBe(false)
  })

  it('Play from Code comes back to Build, not to a stale code view', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    mode('Code')
    mode('Play')
    expect(store.getState().mode).toBe('play')
    mode('Build')
    expect(store.getState().cardTab).toBe('sliders')
  })

  it('a phone keeps Code out of reach and says why', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    expect(screen.getByRole('radio', { name: 'Code' }).getAttribute('aria-disabled')).toBe('true')
    mode('Code')
    expect(store.getState().cardTab).toBe('sliders')
    expect(screen.getByText('Code needs a bigger screen')).toBeTruthy()
  })
})

describe('the Bricks drawer', () => {
  it('lists the standard grid bricks (even before the level has them) and the level\'s bricks, and categories filter them', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
    const grid = screen.getByLabelText('Brick shapes')
    for (const name of ['Ground', 'Hard block', 'Spikes', 'Lava', 'One-way platform', 'Brick', '? block', 'Bounce block', 'Walker', 'New brick']) {
      expect(within(grid).getByRole('button', { name })).toBeTruthy()
    }
    expect(store.getState().project.design.bricks.map((b) => b.name)).toEqual(['Walker'])
    fireEvent.change(screen.getByLabelText('Brick category'), { target: { value: 'terrain' } })
    expect(within(screen.getByLabelText('Brick shapes')).queryByRole('button', { name: 'Walker' })).toBeNull()
    expect(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'Spikes' })).toBeTruthy()
  })

  it('choosing a grid brick the level lacks adds it and arms it to paint; choosing another arms that; the strip says what paints', () => {
    const { store, id } = storeWithBrick()
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Spikes' }))
    const spikes = store.getState().project.design.bricks.find((b) => b.name === 'Spikes')!
    expect(spikes.grid?.char).toBe('S')
    expect(store.getState().brushBrickId).toBe(spikes.id)
    expect(store.getState().project.workspaces[spikes.id]).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Painting' })).getByText('Painting Spikes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    expect(store.getState().brushBrickId).toBe(id)
    fireEvent.click(screen.getByRole('button', { name: 'Spikes' }))
    expect(store.getState().brushBrickId).toBe(spikes.id)
    expect(store.getState().project.design.bricks.filter((b) => b.name === 'Spikes')).toHaveLength(1)
  })

  it('picking the armed brick again, Done, or Esc goes back to Select', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    expect(store.getState().brushBrickId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Painting' })).getByRole('button', { name: 'Done' }))
    expect(store.getState().brushBrickId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(store.getState().brushBrickId).toBeNull()
    expect(screen.queryByRole('group', { name: 'Painting' })).toBeNull()
  })

  it('E toggles the eraser, and the strip says Erasing', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
    fireEvent.keyDown(window, { key: 'e' })
    expect(screen.getByRole('group', { name: 'Erasing' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Erase' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(window, { key: 'e' })
    expect(screen.queryByRole('group', { name: 'Erasing' })).toBeNull()
  })

  it('upgrades a save without tiles so painting works', () => {
    const p = emptyProject()
    delete p.design.tiles
    const store = new StudioStore(p)
    render(<StudioShell store={store} />)
    expect(store.getState().project.design.tiles).toBeTruthy()
  })
})

describe('painting and selecting on the canvas', () => {
  it('a tile click paints the cell under it (row 0 is the bottom) and Undo takes it back', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    press(store, 40, 5)
    expect(store.getState().project.design.tiles!.data[0].slice(0, 4)).toBe('..G.')
    press(store, 40, 100)
    expect(store.getState().project.design.tiles!.data[6][2]).toBe('G')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project.design.tiles!.data[6][2]).toBe('.')
    expect(store.getState().project.design.tiles!.data[0][2]).toBe('G')
  })

  it('right-click erases a tile', () => {
    const { store } = storeWithBrick()
    store.setTile(2, 0, 'G')
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    press(store, 40, 5, 2)
    expect(store.getState().project.design.tiles!.data[0][2]).toBe('.')
  })

  it('clicking an existing copy selects it (and opens the inspector) instead of painting', () => {
    const { store, id } = storeWithBrick()
    const copyId = store.addCopy(id, 200, 100)
    store.selectCopy(null)
    const { container } = render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }))
    const before = store.getState().project.design.tiles
    press(store, 200, 100)
    expect(store.getState().selectedCopyId).toBe(copyId)
    expect(store.getState().project.design.tiles).toBe(before)
    expect(store.getState().project.design.copies).toHaveLength(1)
    expect(container.querySelector('.cl-shell')!.getAttribute('data-inspecting')).toBe('yes')
  })

  it('a brick click places one copy, snapped to the 8-step grid, and does not select it', () => {
    const { store, id } = storeWithBrick()
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    press(store, 405, 77)
    const copies = store.getState().project.design.copies
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ brickId: id, x: 408, y: 80 })
    expect(store.getState().selectedCopyId).toBeNull()
  })
})

describe('grid bricks: paint, select a cell, open code, Remove', () => {
  const row = (store: StudioStore, r: number) => store.getState().project.design.tiles!.data[r]

  /** Arm ? block and drag across five cells of row 2 (world y 40). */
  function paintRowOfQ() {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
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

  it('clicking a painted cell selects it as cell:<col>:<row>; the inspector shows its icon, name and "N in this level", with no sliders', () => {
    const store = paintRowOfQ()
    press(store, 8 + 16 * 4, 40)
    expect(store.getState().selectedCopyId).toBe('cell:4:2')
    expect(row(store, 2).slice(0, 8)).toBe('..QQQQQ.')
    const card = screen.getByRole('region', { name: '? block in this level' })
    expect(within(card).getByText(/5 in this level/)).toBeTruthy()
    expect(within(card).getByText('? block')).toBeTruthy()
    expect(card.querySelector('img')).toBeTruthy()
    expect(within(card).queryByRole('slider')).toBeNull()
  })

  it('Open its code goes to Code on that brick; Build comes back with the cell still selected', () => {
    const store = paintRowOfQ()
    press(store, 8 + 16 * 4, 40)
    fireEvent.click(within(screen.getByRole('region', { name: '? block in this level' })).getByRole('button', { name: /Open its code/ }))
    const q = store.getState().project.design.bricks.find((b) => b.name === '? block')!
    expect(store.getState().selectedBrickId).toBe(q.id)
    expect(store.getState().runtime).not.toBeNull()
    expect(screen.getByLabelText('Docked code editor')).toBeTruthy()
    mode('Build')
    expect(store.getState().cardTab).toBe('sliders')
    expect(store.getState().selectedCopyId).toBe('cell:4:2')
    expect(screen.getByRole('region', { name: '? block in this level' })).toBeTruthy()
  })

  it('Remove clears just that cell (one undo step, and Undo puts it back)', () => {
    const store = paintRowOfQ()
    press(store, 8 + 16 * 4, 40)
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove this ? block' }))
    expect(row(store, 2).slice(0, 8)).toBe('..QQ.QQ.')
    expect(store.getState().selectedCopyId).toBeNull()
    expect(screen.queryByRole('region', { name: '? block in this level' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(row(store, 2).slice(0, 8)).toBe('..QQQQQ.')
  })

  it('the Delete key removes the selected cell too, and a deleteCopy-style path never throws on a cell id', () => {
    const store = paintRowOfQ()
    press(store, 8 + 16 * 3, 40)
    fireEvent.keyDown(screen.getByLabelText('Level Stage'), { key: 'Delete' })
    expect(row(store, 2).slice(0, 8)).toBe('..Q.QQQ.')
    act(() => store.selectCopy('cell:2:2'))
    fireEvent.keyDown(screen.getByLabelText('Level Stage'), { key: 'ArrowRight' })
    expect(row(store, 2).slice(0, 8)).toBe('..Q.QQQ.')
    expect(() => act(() => store.deleteCopy('cell:2:2'))).not.toThrow()
  })

  it('with a normal brick armed, a press on a painted cell selects it; right-click still erases it', () => {
    const store = paintRowOfQ()
    fireEvent.click(screen.getByRole('button', { name: 'Walker' }))
    press(store, 8 + 16 * 3, 40)
    expect(store.getState().selectedCopyId).toBe('cell:3:2')
    expect(store.getState().project.design.copies).toHaveLength(0)
    press(store, 8 + 16 * 3, 40, 2)
    expect(row(store, 2).slice(0, 8)).toBe('..Q.QQQ.')
    expect(store.getState().selectedCopyId).toBeNull()
  })

  it('a Hero standing in front of a cell still wins the click', () => {
    const { store, id } = storeWithBrick()
    store.setTile(5, 2, 'Q')
    const hero = store.addCopy(id, 5 * 16 + 8, 2 * 16 + 8)
    store.selectCopy(null)
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: '? block' }))
    press(store, 5 * 16 + 8, 2 * 16 + 8)
    expect(store.getState().selectedCopyId).toBe(hero)
  })

  it('painting a different grid brick over a cell replaces it; clicking elsewhere deselects', () => {
    const store = paintRowOfQ()
    fireEvent.click(screen.getByRole('button', { name: 'Hard block' }))
    press(store, 8 + 16 * 2, 40)
    expect(row(store, 2).slice(0, 8)).toBe('..HQQQQ.')
    expect(store.getState().selectedCopyId).toBeNull()
  })
})

describe('the inspector in the shell', () => {
  it('edits this copy\'s slider, which is on the undo history, and Remove deletes the copy (undoable)', () => {
    const store = new StudioStore(createStarterProject())
    const copy = store.getState().project.design.copies.find((c) => c.brickId === 'brick_walker')!
    store.selectCopy(copy.id)
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Just this one' }))
    fireEvent.change(screen.getByRole('slider', { name: 'speed' }), { target: { value: '1' } })
    const speedId = store.getState().project.design.bricks.find((b) => b.id === 'brick_walker')!.program.variables.find((v) => v.name === 'speed')!.id
    const knob = () => store.getState().project.design.copies.find((c) => c.id === copy.id)!.knobs?.[speedId]
    expect(knob()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(knob()).toBe(copy.knobs?.[speedId])
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(knob()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove this Walker' }))
    expect(store.getState().project.design.copies.some((c) => c.id === copy.id)).toBe(false)
    expect(store.getState().selectedCopyId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project.design.copies.some((c) => c.brickId === 'brick_walker' && c.x === copy.x && c.y === copy.y)).toBe(true)
  })
})

describe('one Hero, one Goal (limit 1)', () => {
  const heroOf = (store: StudioStore) => store.getState().project.design.copies.filter((c) => c.brickId === 'brick_hero')

  it('clicking the Hero selects it; its inspector says one per level, has four sliders and no "which ones" choice', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    expect(screen.queryByRole('region', { name: 'Hero in this level' })).toBeNull()
    press(store, 60, 40)
    expect(store.getState().selectedCopyId).toBe('copy_hero')
    const card = screen.getByRole('region', { name: 'Hero in this level' })
    expect(within(card).getByText(/One per level/)).toBeTruthy()
    expect(within(card).getAllByRole('slider')).toHaveLength(4)
    expect(within(card).queryByRole('group', { name: 'Which ones change' })).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: /Open its code/ }))
    expect(store.getState().selectedBrickId).toBe('brick_hero')
    expect(store.getState().cardTab).toBe('code')
  })

  it('the Hero inspector stays small; the Walker still has its speed slider', () => {
    const store = new StudioStore(createStarterProject())
    store.selectCopy('copy_hero')
    render(<StudioShell store={store} />)
    expect(screen.getAllByRole('slider')).toHaveLength(4)
    act(() => store.selectCopy('copy_walker_fast'))
    expect(screen.getAllByRole('slider')).toHaveLength(1)
  })

  it('the Bricks drawer calls it Hero, not Start', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    const grid = screen.getByLabelText('Brick shapes')
    expect(within(grid).getByRole('button', { name: 'Hero' })).toBeTruthy()
    expect(within(grid).queryByRole('button', { name: 'Start' })).toBeNull()
  })

  it('placing the Hero again moves the one you have; the strip says so; Undo moves it back', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    fireEvent.click(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'Hero' }))
    expect(within(screen.getByRole('group', { name: 'Painting' })).getByText(/move your Hero/)).toBeTruthy()
    const before = store.getState().project.design.copies.length
    press(store, 405, 200)
    expect(store.getState().project.design.copies).toHaveLength(before)
    expect(heroOf(store)).toHaveLength(1)
    expect(heroOf(store)[0]).toMatchObject({ id: 'copy_hero', x: 408, y: 200 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(heroOf(store)[0]).toMatchObject({ id: 'copy_hero', x: 60, y: 40 })
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(heroOf(store)[0]).toMatchObject({ x: 408, y: 200 })
  })

  it('the Goal is one per level too, but the Walker is not', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    const grid = screen.getByLabelText('Brick shapes')
    const place = (name: string, wx: number, wy: number) => {
      fireEvent.click(within(grid).getByRole('button', { name }))
      press(store, wx, wy)
    }
    place('Goal', 300, 200)
    place('Walker', 400, 200)
    const copies = store.getState().project.design.copies
    expect(copies.filter((c) => c.brickId === 'brick_goal')).toHaveLength(1)
    expect(copies.filter((c) => c.brickId === 'brick_goal')[0]).toMatchObject({ x: 304, y: 200 })
    expect(copies.filter((c) => c.brickId === 'brick_walker')).toHaveLength(3)
  })

  it('the Hero and the Goal have no Remove (a level needs them); the Walker does', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
    act(() => store.selectCopy('copy_hero'))
    expect(screen.getByText(/One per level: place it again to move it/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    expect(screen.queryByRole('button', { name: 'Remove this Hero' })).toBeNull()
    const goal = store.getState().project.design.copies.find((c) => c.brickId === 'brick_goal')!
    act(() => store.selectCopy(goal.id))
    expect(screen.queryByRole('button', { name: 'Remove this Goal' })).toBeNull()
    const walker = store.getState().project.design.copies.find((c) => c.brickId === 'brick_walker')!
    act(() => store.selectCopy(walker.id))
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    expect(screen.getByRole('button', { name: 'Remove this Walker' })).toBeTruthy()
  })

  it('Undo of a removed Hero does not bring back a second one when another was placed since', () => {
    const store = new StudioStore(createStarterProject())
    render(<StudioShell store={store} />)
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
})

describe('+ New brick: one step, then type its name', () => {
  it('New brick in the drawer makes "My brick 1", opens it in Code, and selects the name to type over', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
    fireEvent.click(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'New brick' }))
    const s = store.getState()
    const made = s.project.design.bricks.find((b) => b.name === 'My brick 1')!
    expect(made).toBeTruthy()
    expect(s.cardTab).toBe('code')
    expect(s.selectedBrickId).toBe(made.id)
    // Select stays the Build tool: making a brick does not arm it.
    expect(s.brushBrickId).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    const name = screen.getByRole('textbox', { name: 'Brick name' }) as HTMLInputElement
    expect(document.activeElement).toBe(name)
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 'My brick 1'.length])
    fireEvent.change(name, { target: { value: 'Robot' } })
    fireEvent.keyDown(name, { key: 'Enter' })
    expect(store.brick(made.id)!.name).toBe('Robot')
  })

  it('a second new brick is "My brick 2"; a taken name gets a hint and becomes "Walker 2"', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} />)
    mode('Code')
    fireEvent.click(within(screen.getByRole('region', { name: 'In this level' })).getByRole('button', { name: 'New brick' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Brick name' }), { key: 'Enter' })
    fireEvent.click(within(screen.getByRole('region', { name: 'In this level' })).getByRole('button', { name: 'New brick' }))
    const id = store.getState().selectedBrickId
    expect(store.brick(id)!.name).toBe('My brick 2')
    const name = screen.getByRole('textbox', { name: 'Brick name' })
    fireEvent.change(name, { target: { value: 'walker' } })
    expect(screen.getByText(/already a walker here, so this one will be “walker 2”/)).toBeTruthy()
    fireEvent.blur(name)
    expect(store.brick(id)!.name).toBe('walker 2')
  })

  it('"Start from…" gives the fresh brick a template\'s blocks and look, and it keeps its name', () => {
    const { store } = storeWithBrick()
    render(<StudioShell store={store} templates={[fakeTemplate]} />)
    fireEvent.click(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'New brick' }))
    const id = store.getState().selectedBrickId
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Brick name' }), { key: 'Escape' })
    const start = screen.getByRole('group', { name: 'Start from a brick that works' })
    fireEvent.click(within(start).getByRole('button', { name: 'Start from Fake' }))
    const brick = store.brick(id)!
    expect(brick.name).toBe('My brick 1')
    expect(brick.program.variables.map((v) => v.name)).toEqual(['speed'])
    expect((store.getState().project.workspaces[id] as { marker?: string }).marker).toMatch(/^fake_/)
  })
})
