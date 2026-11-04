import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateDesign } from '../../core/project'
import { createRuntime } from '../../core'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore } from '../store'
import { StudioShell } from '../screen/StudioShell'
import { createBlankProject } from './blankProject'
import { BORROWABLE, borrowedBrick, freeGridChar } from './borrow'
import { nextStep } from './nextStep'
import { resizedLayout, whatResizeLoses } from './stageLayout'

vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))
vi.mock('../CostumeEditor', () => ({
  CostumeEditor: ({ store }: { store: StudioStore }) => (
    <button type="button" onClick={() => store.setCostumes(store.getState().selectedBrickId, [costumeFromImage('drawn', imageFromRows(['##', '##'], { '#': '#34c77b' }))])}>Paint</button>
  ),
}))

afterEach(() => { cleanup(); localStorage.clear() })

const art = (side = 2) => costumeFromImage('c', imageFromRows(Array.from({ length: side }, () => '#'.repeat(side)), { '#': '#336699' }))
const state = { brushBrickId: null, cardBrickId: null, played: false }

describe('Start from nothing: the next-step line', () => {
  it('walks a kid from an empty stage to Play together, one step at a time', () => {
    const store = new StudioStore(createBlankProject())
    const step = () => nextStep(store.getState().project.design, { ...state, brushBrickId: store.getState().brushBrickId })
    expect(step()?.text).toBe('Start by drawing a brick.')
    const zip = store.addBrick('Zip', art())
    expect(step()?.text).toBe('Tap the stage to place Zip.')
    store.setBrush(null)
    expect(step()?.text).toBe('Pick Zip in My bricks, then tap the stage.')
    store.addCopy(zip, 40, 40)
    expect(step()?.text).toBe('Tap Zip to give it a job.')
    expect(nextStep(store.getState().project.design, { ...state, cardBrickId: zip })?.text).toBe('Pick a job, then press Play.')
  })

  it('suggests the Goal job once something is collected and nothing is the goal', () => {
    const { design } = createBlankProject()
    const brick = (id: string, name: string, job?: string) => ({ id, name, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] }, ...(job ? { powers: [{ id: 'pw1', name: job, credits: ['Brickgineers'], blockIds: [], variableIds: [], job }] } : {}) })
    const d = { ...design, bricks: [brick('a', 'Zip', 'player:walk'), brick('b', 'Star', 'collect'), brick('c', 'Flag')], copies: ['a', 'b', 'c'].map((id, i) => ({ id: `c${i}`, brickId: id, x: 20 + i * 20, y: 20 })) }
    expect(nextStep(d, state)?.id).toBe('play')
    expect(nextStep(d, { ...state, played: true })?.text).toBe('Next: give Flag the Goal job.')
    const done = { ...d, bricks: [d.bricks[0], d.bricks[1], brick('c', 'Flag', 'goal')] }
    expect(nextStep(done, { ...state, played: true })?.id).toBe('together')
  })
})

describe('Start from nothing: the Stage card', () => {
  it('grows and shrinks by whole cells; shrinking cuts painted cells and moves bricks back inside', () => {
    const { design } = createBlankProject()
    const painted = { ...design, tiles: { ...design.tiles!, data: design.tiles!.data.map((row, r) => (r === 0 ? 'A'.repeat(30) : row)) }, copies: [{ id: 'c1', brickId: 'b', x: 470, y: 340 }] }
    const wide = resizedLayout(painted, 60, 22)
    expect(wide.bounds).toEqual({ left: 0, bottom: 0, right: 960, top: 352 })
    expect(wide.tiles.data[0]).toBe('A'.repeat(30) + '.'.repeat(30))
    expect(wide.copies[0]).toBe(painted.copies[0])
    const small = resizedLayout({ ...painted, ...wide }, 30, 22)
    expect(small.tiles.data[0]).toBe('A'.repeat(30))
    expect(whatResizeLoses({ ...painted, tiles: { cols: 60, rows: 22, data: wide.tiles.data.map((r, i) => (i === 0 ? r.replace(/\.$/, 'A') : r)) }, copies: [{ id: 'c1', brickId: 'b', x: 900, y: 20 }] }, 30, 22)).toEqual({ cells: 1, moved: 1 })
    expect(resizedLayout({ ...painted, copies: [{ id: 'c1', brickId: 'b', x: 900, y: 20 }] }, 30, 22).copies[0]).toMatchObject({ x: 472, y: 20 })
  })

  it('keeps the backdrop in the design (paper is the default and is not written)', () => {
    const store = new StudioStore(createBlankProject())
    store.setBackdrop('night')
    expect(store.getState().project.design.backdrop).toBe('night')
    store.setBackdrop('paper')
    expect('backdrop' in store.getState().project.design).toBe(false)
  })
})

describe('Start from nothing: Borrow a brick', () => {
  it('every borrowable brick joins the game as the kid’s own copy, and the game still checks out and runs', () => {
    for (const item of BORROWABLE) {
      const store = new StudioStore(createBlankProject())
      store.addBrickFrom({ name: 'Ground', costumes: [art()], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] }, grid: { char: 'G' } }, { blocks: { languageVersion: 0, blocks: [] } })
      const made = borrowedBrick(store.getState().project.design, item)
      if (item.needs) store.ensureStageData(item.needs.variables ?? [], item.needs.lists ?? [])
      const id = store.addBrickFrom(made.brick, made.workspace)
      const design = store.getState().project.design
      const brick = design.bricks.find((b) => b.id === id)!
      expect(brick.remixOf).toBeUndefined()
      if (brick.grid) expect(design.bricks.filter((b) => b.grid?.char === brick.grid!.char)).toHaveLength(1)
      expect(new Set(design.bricks.map((b) => b.name)).size).toBe(design.bricks.length)
      expect(validateDesign(design), item.id).toEqual([])
      store.addCopy(id, 100, 100)
      const runtime = createRuntime(store.getState().project.design)
      runtime.greenFlag()
      for (let i = 0; i < 30; i++) runtime.step()
    }
  })

  it('hands out a free grid character, the wanted one when it is free', () => {
    const { design } = createBlankProject()
    expect(freeGridChar(design, 'G')).toBe('G')
    const taken = { ...design, bricks: [{ id: 'g', name: 'G', costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] }, grid: { char: 'G' } }] }
    expect(freeGridChar(taken, 'G')).toBe('A')
    expect(freeGridChar(taken, '.')).toBe('A')
  })

  it('a borrowed Hero or Car becomes the player of a game that has none (in the drawer)', () => {
    const store = new StudioStore(createBlankProject())
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /Borrow a brick/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Borrow the Hero: runs, jumps' }))
    const design = store.getState().project.design
    expect(design.bricks.map((b) => b.name)).toEqual(['Hero'])
    expect(design.player).toBe(design.bricks[0].id)
    expect(store.getState().brushBrickId).toBe(design.bricks[0].id)
    // Back on My bricks, with the Hero in it.
    expect(screen.getByRole('button', { name: /Stage/ })).toBeTruthy()
  })
})

describe('Start from nothing: the empty stage and the name step', () => {
  it('an empty stage has one obvious action: Draw a brick, then One thing or Tiles', () => {
    const store = new StudioStore(createBlankProject())
    render(<StudioShell store={store} />)
    expect(screen.getByRole('heading', { name: 'Your stage is empty' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Next step' }).textContent).toContain('Start by drawing a brick.')
    fireEvent.click(screen.getByRole('button', { name: 'Draw a brick' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Paint' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }))
    // A drawn brick is One thing.
    expect(within(dialog).getByRole('button', { name: /One thing/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Brick name' }), { target: { value: 'Zip' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make my brick' }))
    const design = store.getState().project.design
    expect(design.bricks).toHaveLength(1)
    expect(design.bricks[0]).toMatchObject({ name: 'Zip' })
    expect(design.bricks[0].grid).toBeUndefined()
    expect(store.getState().brushBrickId).toBe(design.bricks[0].id)
    expect(screen.queryByRole('heading', { name: 'Your stage is empty' })).toBeNull()
  })

  it('a tile picture is already Tiles: the brick paints on the grid with a character of its own', () => {
    const store = new StudioStore(createBlankProject())
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'or pick a picture' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stone' }))
    expect(within(dialog).getByRole('button', { name: /Tiles/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Make my brick' }))
    const brick = store.getState().project.design.bricks[0]
    expect(brick.grid?.char).toBe('A')
    expect(validateDesign(store.getState().project.design)).toEqual([])
  })

  it('a picture too big for one square cannot be Tiles', () => {
    const store = new StudioStore(createBlankProject())
    render(<StudioShell store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'or pick a picture' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Flag' }))
    expect((within(dialog).getByRole('button', { name: /Tiles/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('the kits keep their tips and their plain name step', () => {
    const store = new StudioStore(createBlankProject())
    store.load({ ...createBlankProject(), design: { ...createBlankProject().design, kit: undefined } })
    render(<StudioShell store={store} />)
    expect(screen.queryByRole('heading', { name: 'Your stage is empty' })).toBeNull()
    expect(screen.queryByRole('status', { name: 'Next step' })).toBeNull()
  })
})
