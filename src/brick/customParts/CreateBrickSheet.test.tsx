import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateBrickSheet, createCustomPartDefinition } from './CreateBrickSheet'

afterEach(cleanup)

describe('CreateBrickSheet', () => {
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
