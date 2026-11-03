import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore, emptyProject } from '../store'
import { StudioShell } from './StudioShell'
import { brickLooks, freeBrickName } from '../builder/newBrick'

vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('../builder/testGridBricks')).fakeGridTemplate }))
vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))
// The real costume editor paints on a canvas jsdom does not have: this one paints the selected brick in one press.
vi.mock('../CostumeEditor', () => ({
  CostumeEditor: ({ store }: { store: StudioStore }) => (
    <button type="button" onClick={() => store.setCostumes(store.getState().selectedBrickId, [costumeFromImage('drawn', imageFromRows(['##', '##'], { '#': '#e7473c' }))])}>Paint</button>
  ),
}))

afterEach(cleanup)

function studio() {
  const store = new StudioStore(emptyProject())
  store.addBrick('Walker', costumeFromImage('c', imageFromRows(['####', '####'], { '#': '#336699' })))
  store.setBrush(null)
  render(<StudioShell store={store} />)
  return store
}
const openNewBrick = () => fireEvent.click(within(screen.getByLabelText('Brick shapes')).getByRole('button', { name: 'New brick' }))
const sheet = () => screen.getByRole('dialog')
const brickNamed = (store: StudioStore, name: string) => store.getState().project.design.bricks.find((b) => b.name === name)

describe('+ New brick in Build: a picture, a name, and back to Build (no Code)', () => {
  it('offers ready-made pictures from the existing brick art, and Draw my own', () => {
    studio()
    openNewBrick()
    expect(within(sheet()).getByRole('heading', { name: 'New brick' })).toBeTruthy()
    const pictures = within(sheet()).getByRole('list', { name: 'Pictures' })
    for (const name of ['Blob', 'Gold', 'Coil', 'Flag', 'Draw my own']) expect(within(pictures).getByRole('button', { name })).toBeTruthy()
  })

  it('a picture, then a name, lands in Build with the new brick armed to place, never in Code', () => {
    const store = studio()
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Blob' }))
    const name = within(sheet()).getByRole('textbox', { name: 'Brick name' }) as HTMLInputElement
    expect(name.value).toBe('Blob')
    expect(document.activeElement).toBe(name)
    fireEvent.change(name, { target: { value: 'Robot' } })
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Make my brick' }))

    const made = brickNamed(store, 'Robot')!
    expect(made.costumes).toHaveLength(1)
    const s = store.getState()
    expect(s.cardTab).not.toBe('code')
    expect(s.mode).toBe('build')
    expect(s.brushBrickId).toBe(made.id)
    expect(s.selectedBrickId).toBe(made.id)
    expect(screen.getByRole('radio', { name: 'Build' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByLabelText('Docked code editor')).toBeNull()
    // Ready to place: the strip under the level says so.
    expect(screen.getByRole('group', { name: 'Painting' }).textContent).toContain('Painting Robot')
  })

  it('names stay unique: a taken name becomes "Walker 2", with a hint while typing', () => {
    const store = studio()
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Blob' }))
    const name = within(sheet()).getByRole('textbox', { name: 'Brick name' })
    fireEvent.change(name, { target: { value: 'walker' } })
    expect(within(sheet()).getByText(/already a walker here, so this one will be “walker 2”/)).toBeTruthy()
    fireEvent.submit(name)
    expect(brickNamed(store, 'walker 2')).toBeTruthy()
    // A second Blob is "Blob 2" from the start.
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Blob' }))
    fireEvent.submit(within(sheet()).getByRole('textbox', { name: 'Brick name' }))
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Blob' }))
    expect((within(sheet()).getByRole('textbox', { name: 'Brick name' }) as HTMLInputElement).value).toBe('Blob 2')
  })

  it('Draw my own: paint, Next, name, and the drawn brick is armed in Build', () => {
    const store = studio()
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Draw my own' }))
    const next = within(sheet()).getByRole('button', { name: 'Next' }) as HTMLButtonElement
    expect(next.disabled).toBe(true)
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Paint' }))
    expect(next.disabled).toBe(false)
    fireEvent.click(next)
    const name = within(sheet()).getByRole('textbox', { name: 'Brick name' }) as HTMLInputElement
    expect(name.value).toBe('My brick 1')
    fireEvent.change(name, { target: { value: 'Zapper' } })
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Make my brick' }))
    const made = brickNamed(store, 'Zapper')!
    expect(made.costumes.map((c) => c.name)).toEqual(['drawn'])
    expect(store.getState().brushBrickId).toBe(made.id)
    expect(store.getState().cardTab).not.toBe('code')
  })

  it('backing out of drawing, or closing, leaves no half-made brick behind', () => {
    const store = studio()
    const count = () => store.getState().project.design.bricks.length
    const before = count()
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Draw my own' }))
    expect(count()).toBe(before + 1)
    fireEvent.click(within(sheet()).getAllByRole('button', { name: 'Back' }).at(-1)!)
    expect(count()).toBe(before)
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Draw my own' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Paint' }))
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(count()).toBe(before)
    expect(store.getState().brushBrickId).toBeNull()
  })

  it('closing at the pictures changes nothing', () => {
    const store = studio()
    const project = store.getState().project
    openNewBrick()
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }))
    expect(store.getState().project).toBe(project)
  })
})

describe('New brick helpers', () => {
  it('freeBrickName keeps a free name and numbers a taken one', () => {
    expect(freeBrickName(' Robot ', ['Walker'])).toBe('Robot')
    expect(freeBrickName('Walker', ['Walker'])).toBe('Walker 2')
    expect(freeBrickName('walker', ['Walker', 'walker 2'])).toBe('walker 3')
  })

  it('every ready-made look has a picture and its own name', () => {
    const looks = brickLooks()
    expect(looks.length).toBeGreaterThanOrEqual(4)
    expect(new Set(looks.map((l) => l.name)).size).toBe(looks.length)
    for (const look of looks) expect(look.costume.asset).toMatch(/^data:image\/png/)
  })
})
