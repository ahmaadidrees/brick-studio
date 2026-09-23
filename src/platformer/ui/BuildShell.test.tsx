import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Editor } from '../editor/editor'
import { PALETTE } from '../editor/palette'
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
    const drawer = screen.getByRole('complementary', { name: 'Block drawer' })
    expect(within(drawer).getByRole('heading', { name: 'Blocks' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Ground' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(within(drawer).getByRole('searchbox', { name: 'Search blocks' }), { target: { value: 'enem' } })
    expect(within(drawer).getByRole('button', { name: 'Walker' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Ground' })).toBeNull()

    fireEvent.click(within(drawer).getByRole('button', { name: 'Walker' }))
    expect(editor.select).toHaveBeenCalledWith(PALETTE.find((p) => p.id === 'walker'))
  })

  it('narrows the drawer by category and says when nothing matches', () => {
    shell(fakeEditor())
    const drawer = screen.getByRole('complementary', { name: 'Block drawer' })
    fireEvent.change(within(drawer).getByRole('combobox', { name: 'Block category' }), { target: { value: 'course' } })
    expect(within(drawer).getAllByRole('button').map((b) => b.getAttribute('title')).filter(Boolean)).toEqual(['Start', 'Checkpoint', 'Goal'])
    fireEvent.change(within(drawer).getByRole('searchbox', { name: 'Search blocks' }), { target: { value: 'lava' } })
    expect(within(drawer).getByRole('status')).toHaveTextContent('No blocks match “lava”.')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Show all blocks' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Collapse block drawer' }))
    expect(onDrawerOpen).toHaveBeenCalledWith(false)
    rerender(<BuildShell editor={fakeEditor()} theme="day" look="cartoon" compact={false} touch={false} drawerOpen={false} onDrawerOpen={onDrawerOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open block drawer' }))
    expect(onDrawerOpen).toHaveBeenCalledWith(true)
  })

  it('uses a button and a bottom sheet on compact screens', () => {
    const editor = fakeEditor()
    shell(editor, { compact: true, touch: true })
    expect(screen.queryByRole('complementary', { name: 'Block drawer' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open block drawer' }))
    const sheet = screen.getByRole('dialog', { name: 'Blocks' })
    fireEvent.click(within(sheet).getByRole('tab', { name: 'Items' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Coin' }))
    expect(editor.select).toHaveBeenCalledWith(PALETTE.find((p) => p.id === 'coin'))
    expect(screen.queryByRole('dialog', { name: 'Blocks' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Placing' })).toHaveTextContent('Tap or drag to place')
  })
})
