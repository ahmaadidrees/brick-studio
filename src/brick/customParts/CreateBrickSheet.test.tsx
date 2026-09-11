import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateBrickSheet, createCustomPartDefinition } from './CreateBrickSheet'

vi.mock('./CreateBrickPreview', () => ({
  CreateBrickPreview: ({ draft, hint }: { draft: { width: number; depth: number; height: number; template: string; studs: string }; hint: string | null }) => (
    <div data-testid="preview">{JSON.stringify(draft)}{hint}</div>
  ),
}))

afterEach(cleanup)

describe('CreateBrickSheet', () => {
  it('previews and creates a brick at the expanded dimension limits', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)
    for (const [label, value] of [[/Width/, '32'], [/Depth/, '32'], [/Height/, '96']] as const) {
      const input = screen.getByLabelText(label)
      expect(input.getAttribute('max')).toBe(value)
      fireEvent.change(input, { target: { value } })
    }
    expect(screen.getByTestId('preview').textContent).toContain('"height":96')
    fireEvent.click(screen.getByRole('button', { name: 'Create and place' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ width: 32, depth: 32, height: 96 }))
  })

  it('creates one deterministic bounded part from the visible form', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Race ramp' } })
    fireEvent.change(screen.getByLabelText(/Shape/), { target: { value: 'slope' } })
    fireEvent.change(screen.getByLabelText(/Width/), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(/Depth/), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText(/Height/), { target: { value: '5' } })
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

  it('previews valid edits without creating a part and preserves the last valid shape during invalid input', () => {
    const onCreate = vi.fn()
    render(<CreateBrickSheet open onCreate={onCreate} onClose={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/Width/), { target: { value: '5' } })
    expect(screen.getByTestId('preview').textContent).toContain('"width":5')
    fireEvent.change(screen.getByLabelText(/Width/), { target: { value: '' } })
    expect(screen.getByTestId('preview').textContent).toContain('"width":5')
    expect(screen.getByTestId('preview').textContent).toContain('whole-number')
    fireEvent.change(screen.getByLabelText(/Width/), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(/Shape/), { target: { value: 'round' } })
    fireEvent.change(screen.getByLabelText(/Top studs/), { target: { value: 'none' } })
    expect(screen.getByTestId('preview').textContent).toContain('"template":"round"')
    expect(screen.getByTestId('preview').textContent).toContain('"studs":"none"')
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('uses the same id for the same normalized definition', () => {
    const draft = { name: ' My brick ', template: 'solid', width: 2, depth: 4, height: 3, studs: 'auto' } as const
    expect(createCustomPartDefinition(draft)).toEqual(createCustomPartDefinition({ ...draft, name: 'My brick' }))
  })

  it('closes through the labeled backdrop and Escape', () => {
    const onClose = vi.fn()
    render(<CreateBrickSheet open onCreate={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel creating a brick' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
