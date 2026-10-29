import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from '../editor/editor'
import { hintFor, PALETTE } from '../editor/palette'
import { RACE_PALETTE } from '../editor/racePalette'
import { BuildShell } from './BuildShell'

// The game's pixel art is drawn on canvases, which jsdom does not have.
vi.mock('./art', () => ({ Art: ({ k, look }: { k: string; look?: string }) => <img alt="" data-art={k} data-look={look} /> }))

function fakeEditor(overrides: Partial<Editor> = {}) {
  const editor = {
    item: PALETTE[0],
    erasing: false,
    dir: -1,
    undoStack: [],
    redoStack: [],
    select: vi.fn(),
    setErasing: vi.fn(),
    flip: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides,
  }
  return editor as unknown as Editor & typeof editor
}

const shell = (editor: Editor, props: Partial<Parameters<typeof BuildShell>[0]> = {}) =>
  render(<BuildShell editor={editor} theme="day" look="cartoon" compact={false} touch={false} drawerOpen onDrawerOpen={vi.fn()} {...props} />)

describe('2D build shell', () => {
  afterEach(cleanup)

  it('picks blocks from the same drawer as the 3D bricks', () => {
    const editor = fakeEditor()
    shell(editor)
    const drawer = screen.getByRole('complementary', { name: 'Brick drawer' })
    expect(within(drawer).getByRole('heading', { name: 'Bricks' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Ground' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(within(drawer).getByRole('searchbox', { name: 'Search bricks' }), { target: { value: 'critter' } })
    expect(within(drawer).getByRole('button', { name: 'Walker' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Ground' })).toBeNull()
    // The older word still finds them.
    fireEvent.change(within(drawer).getByRole('searchbox', { name: 'Search bricks' }), { target: { value: 'enem' } })
    expect(within(drawer).getByRole('button', { name: 'Walker' })).toBeInTheDocument()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Walker' }))
    expect(editor.select).toHaveBeenCalledWith(PALETTE.find((p) => p.id === 'walker'))
  })

  it('narrows the drawer by category and says when nothing matches', () => {
    shell(fakeEditor())
    const drawer = screen.getByRole('complementary', { name: 'Brick drawer' })
    fireEvent.change(within(drawer).getByRole('combobox', { name: 'Brick category' }), { target: { value: 'course' } })
    expect(within(drawer).getAllByRole('button').map((b) => b.getAttribute('title')).filter(Boolean)).toEqual(['Start', 'Checkpoint', 'Goal'])
    fireEvent.change(within(drawer).getByRole('searchbox', { name: 'Search bricks' }), { target: { value: 'lava' } })
    expect(within(drawer).getByRole('status')).toHaveTextContent('No bricks match “lava”.')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Show all bricks' }))
    expect(within(drawer).getByRole('button', { name: 'Ground' })).toBeInTheDocument()
  })

  it('says what a click places, and flips and erases from the strip', () => {
    const editor = fakeEditor({ item: PALETTE.find((p) => p.id === 'walker')! })
    const { rerender } = shell(editor)
    const strip = screen.getByRole('group', { name: 'Placing' })
    expect(strip).toHaveTextContent('PlacingWalker')
    fireEvent.click(within(strip).getByRole('button', { name: /Facing left/ }))
    expect(editor.flip).toHaveBeenCalled()
    fireEvent.click(within(strip).getByRole('button', { name: 'Erase' }))
    expect(editor.setErasing).toHaveBeenCalledWith(true)

    const erasing = fakeEditor({ erasing: true })
    rerender(<BuildShell editor={erasing} theme="day" look="cartoon" compact={false} touch={false} drawerOpen onDrawerOpen={vi.fn()} />)
    expect(screen.getByRole('group', { name: 'Placing' })).toHaveTextContent('ErasingEraser')
    expect(screen.getByRole('button', { name: 'Erase' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('has Undo and Redo beside the drawer, enabled when there is history', () => {
    const editor = fakeEditor({ undoStack: [{}] as never, redoStack: [] })
    shell(editor)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(editor.undo).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('collapses the drawer to a toggle', () => {
    const onDrawerOpen = vi.fn()
    const { rerender } = shell(fakeEditor(), { onDrawerOpen })
    fireEvent.click(screen.getByRole('button', { name: 'Collapse brick drawer' }))
    expect(onDrawerOpen).toHaveBeenCalledWith(false)
    rerender(<BuildShell editor={fakeEditor()} theme="day" look="cartoon" compact={false} touch={false} drawerOpen={false} onDrawerOpen={onDrawerOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open brick drawer' }))
    expect(onDrawerOpen).toHaveBeenCalledWith(true)
  })

  it('uses a button and a bottom sheet on compact screens', () => {
    const editor = fakeEditor()
    shell(editor, { compact: true, touch: true })
    expect(screen.queryByRole('complementary', { name: 'Brick drawer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open brick drawer' }))
    const sheet = screen.getByRole('dialog', { name: 'Bricks' })
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Items' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Coin' }))
    expect(editor.select).toHaveBeenCalledWith(PALETTE.find((p) => p.id === 'coin'))
    expect(screen.queryByRole('dialog', { name: 'Bricks' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Placing' })).toHaveTextContent('Tap or drag to place')
  })

  it('words every brick’s hint for touch: tap, and the Flip or Turn button, never click or R', () => {
    const items = [...PALETTE, ...RACE_PALETTE].filter((item) => item.hint)
    expect(items.length).toBeGreaterThan(10)
    for (const item of items) {
      expect(hintFor(item, true), item.id).toBeTruthy()
      expect(hintFor(item, true), item.id).not.toMatch(/\bclick|\bR\b|press/i)
      expect(hintFor(item, false), item.id).toBe(item.hint)
    }
    expect(hintFor(RACE_PALETTE.find((p) => p.id === 'race-start')!, true)).toMatch(/^Tap .*Turn/)
  })

  it('keeps keyboard words on a computer', () => {
    shell(fakeEditor({ item: PALETTE.find((p) => p.id === 'lift')! }))
    expect(screen.getByRole('group', { name: 'Placing' })).toHaveTextContent('Press R')
  })

  it('points touch builders at the Flip button for a moving platform', () => {
    const { container } = shell(fakeEditor({ item: PALETTE.find((p) => p.id === 'lift')! }), { touch: true })
    const hint = container.querySelector('.p2d-strip-hint')!.textContent
    expect(hint).toMatch(/Flip/)
    expect(hint).not.toMatch(/Press R/)
  })
})
