import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRICK_STUDIO_MAX_CUSTOM_PARTS } from '../brickDocument'
import { CreateBrickSheet, CREATE_BRICK_TEMPLATES, CUSTOM_PART_CAP_MESSAGE, MATCHING_FOOTPRINT_MESSAGE, STUD_OPTIONS, createCustomPartDefinition } from './CreateBrickSheet'

vi.mock('./CreateBrickPreview', () => ({
  CreateBrickPreview: ({ draft, hint }: { draft: { width: number; depth: number; height: number; template: string; studs: string }; hint: string | null }) => (
    <div data-testid="preview">{JSON.stringify(draft)}{hint}</div>
  ),
}))

afterEach(cleanup)

const width = () => screen.getByRole('spinbutton', { name: 'Width (studs)' })
const depth = () => screen.getByRole('spinbutton', { name: 'Depth (studs)' })
const height = () => screen.getByRole('spinbutton', { name: 'Height (plates)' })

describe('CreateBrickSheet', () => {
  it('previews and creates a brick at the expanded dimension limits', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)
    for (const [input, value] of [[width(), '64'], [depth(), '64'], [height(), '192']] as const) {
      expect(input.getAttribute('max')).toBe(value)
      fireEvent.change(input, { target: { value } })
    }
    expect(screen.getByTestId('preview').textContent).toContain('"height":192')
    fireEvent.click(screen.getByRole('button', { name: 'Create and place' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ width: 64, depth: 64, height: 192 }))
  })

  it('creates one deterministic bounded part from the visible form', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Race ramp' } })
    fireEvent.change(screen.getByLabelText('Shape'), { target: { value: 'slope' } })
    fireEvent.change(width(), { target: { value: '4' } })
    fireEvent.change(depth(), { target: { value: '6' } })
    fireEvent.change(height(), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and place' }))

    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.stringMatching(/^custom_race-ramp_/),
      name: 'Race ramp',
      template: 'slope',
      width: 4,
      depth: 6,
      height: 5,
      studs: 'auto',
    }))
  })

  it('offers every real template and the three-way studs choice, with sliders paired to each number field', () => {
    render(<CreateBrickSheet open onCreate={vi.fn()} onClose={vi.fn()} />)
    const shape = screen.getByLabelText('Shape') as HTMLSelectElement
    expect([...shape.options].map((option) => option.value)).toEqual(CREATE_BRICK_TEMPLATES.map((template) => template.value))
    const studs = screen.getByLabelText('Studs on top') as HTMLSelectElement
    expect([...studs.options].map((option) => option.textContent)).toEqual(['Match the shape', 'Full grid', 'Smooth top'])
    expect([...studs.options].map((option) => option.value)).toEqual(STUD_OPTIONS.map((option) => option.value))
    expect(screen.getAllByRole('slider')).toHaveLength(3)
    fireEvent.change(screen.getByRole('slider', { name: 'Slide width' }), { target: { value: '9' } })
    expect(width()).toHaveValue(9)
    expect(screen.getByTestId('preview').textContent).toContain('"width":9')
    expect(screen.getByText('Max 64 studs wide')).toBeInTheDocument()
    expect(screen.getByText('Max 192 plates high')).toBeInTheDocument()
  })

  it('previews valid edits without creating a part and preserves the last valid shape during invalid input', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)
    fireEvent.change(width(), { target: { value: '5' } })
    expect(screen.getByTestId('preview').textContent).toContain('"width":5')
    fireEvent.change(width(), { target: { value: '' } })
    expect(screen.getByTestId('preview').textContent).toContain('"width":5')
    expect(screen.getByTestId('preview').textContent).toContain('whole-number')
    fireEvent.change(width(), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Shape'), { target: { value: 'round' } })
    fireEvent.change(screen.getByLabelText('Studs on top'), { target: { value: 'none' } })
    expect(screen.getByTestId('preview').textContent).toContain('"template":"round"')
    expect(screen.getByTestId('preview').textContent).toContain('"studs":"none"')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('shows dimension and name errors inline and moves focus to the first invalid field on submit', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)
    fireEvent.change(height(), { target: { value: '0' } })
    expect(height()).toHaveAttribute('aria-invalid', 'true')
    expect(height()).toHaveAccessibleDescription(/Enter a whole number from 1 to 192\..*Max 192 plates high/)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and place' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Give your brick a name'),
      expect.stringContaining('Enter a whole number from 1 to 192.'),
      'Fix the highlighted fields to create your brick.',
    ]))
    expect(screen.getByRole('dialog', { name: 'Create a brick' })).toBeInTheDocument()
  })

  it('explains the matching-footprint rule for round and cone bricks before and on submit', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Shape'), { target: { value: 'cone' } })
    expect(screen.getByRole('status')).toHaveTextContent(MATCHING_FOOTPRINT_MESSAGE)
    fireEvent.click(screen.getByRole('button', { name: 'Create and place' }))
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(MATCHING_FOOTPRINT_MESSAGE)
    expect(depth()).toHaveFocus()
    fireEvent.change(depth(), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create and place' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ template: 'cone', width: 2, depth: 2 }))
  })

  it('disables creation at the custom-part cap and says why', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open existingCount={BRICK_STUDIO_MAX_CUSTOM_PARTS} onCreate={onCreate} onClose={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Create and place' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(`${CUSTOM_PART_CAP_MESSAGE} This world already has ${BRICK_STUDIO_MAX_CUSTOM_PARTS}.`)
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('uses the same id for the same normalized definition', () => {
    const draft = { name: ' My brick ', template: 'solid', width: 2, depth: 4, height: 3, studs: 'auto' } as const
    expect(createCustomPartDefinition(draft)).toEqual(createCustomPartDefinition({ ...draft, name: 'My brick' }))
  })

  it('is a labelled modal dialog with a persistent footer that closes through the backdrop, the close button and Escape', () => {
    const onClose = vi.fn()
    render(<CreateBrickSheet open onCreate={vi.fn()} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Create a brick' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Design your own brick to use in this world.')
    expect(dialog).toHaveFocus()
    const footer = dialog.querySelector('.ui-sheet-footer')!
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Create and place' })).toBeInTheDocument()

    fireEvent.pointerDown(document.querySelector('.ui-sheet-backdrop')!)
    fireEvent.click(screen.getByRole('button', { name: 'Close create a brick' }))
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('restores focus to the opener and resets the form when reopened', () => {
    const opener = document.createElement('button')
    opener.textContent = 'Create a brick'
    document.body.append(opener)
    opener.focus()
    const view = render(<CreateBrickSheet open onCreate={vi.fn()} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tower' } })
    view.rerender(<CreateBrickSheet open={false} onCreate={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    view.rerender(<CreateBrickSheet open onCreate={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByLabelText('Name')).toHaveValue('My brick')
    opener.remove()
  })
})
