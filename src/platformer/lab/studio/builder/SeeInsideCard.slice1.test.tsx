import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { BRICK_TEMPLATES } from '../templates'
import { drawerEntries } from './catalog'
import { NewBrickPicker } from './NewBrickPicker'
import { createBrickFromTemplate } from './newBrick'
import { SeeInsideCard } from './SeeInsideCard'

const walkerId = 'brick_walker'
const speedId = 'brick_walker_speed'
function selectedWalker() {
  const store = new StudioStore(createStarterProject())
  const copies = store.getState().project.design.copies.filter((copy) => copy.brickId === walkerId)
  store.selectCopy(copies[0].id)
  return { store, copies }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Slice 1 brick card', () => {
  it('starts on all copies, creates an own value only in Just this one, and lets it inherit again', () => {
    const { store, copies } = selectedWalker()
    render(<SeeInsideCard store={store} />)
    expect(screen.getByRole('button', { name: 'All copies' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByRole('slider', { name: 'speed' }), { target: { value: '5' } })
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(5)
    expect(store.getState().project.design.copies.find((copy) => copy.id === copies[0].id)!.knobs?.[speedId]).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Just this one' }))
    fireEvent.change(screen.getByRole('slider', { name: 'speed' }), { target: { value: '2' } })
    expect(store.getState().project.design.copies.find((copy) => copy.id === copies[0].id)!.knobs?.[speedId]).toBe(2)
    expect(store.getState().project.design.copies.find((copy) => copy.id === copies[1].id)!.knobs?.[speedId]).toBeUndefined()
    expect(screen.getByText('own value')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Use the brick's value for speed" }))
    expect(screen.queryByText('own value')).toBeNull()
    expect((screen.getByRole('slider', { name: 'speed' }) as HTMLInputElement).value).toBe('5')
  })

  it('shows Hero sliders and a collapsed more group without copy scope or Remove', () => {
    const store = new StudioStore(createStarterProject())
    store.selectCopy('copy_hero')
    render(<SeeInsideCard store={store} />)
    expect(screen.getAllByRole('slider')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /More sliders for the Hero/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group', { name: 'Slider scope' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    expect(screen.queryByRole('button', { name: 'Remove this Hero' })).toBeNull()
  })

  it('keeps code in the supplied card body, Done returns to sliders and Escape closes the selection', () => {
    const { store } = selectedWalker()
    render(<SeeInsideCard store={store}><span>Docked code</span></SeeInsideCard>)
    fireEvent.click(screen.getByRole('button', { name: 'See inside' }))
    expect(screen.getByText('Docked code')).toBeTruthy()
    expect(store.getState().workshopBrickId).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Close code' }))
    expect(screen.getByRole('slider', { name: 'speed' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(store.getState().selectedCopyId).toBeNull()
    expect(screen.queryByRole('region', { name: 'Walker copy' })).toBeNull()
  })

  it('Look lists costumes read-only and opens the existing costume editor', () => {
    const { store } = selectedWalker()
    render(<SeeInsideCard store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Look' }))
    expect(within(screen.getByRole('list', { name: 'Costumes' })).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('slider')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit costumes' }))
    expect(store.getState().editorTab).toBe('costumes')
    expect(store.getState().workshopBrickId).toBe(walkerId)
  })

  it('asks before restoring edited defaults and supports cancelling', () => {
    const { store } = selectedWalker()
    store.setBrickSlider(walkerId, speedId, 5)
    render(<SeeInsideCard store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the original' }))
    expect(screen.getByRole('dialog', { name: 'Back to the original?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep my changes' }))
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(5)
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the original' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore original' }))
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(3)
  })

  it('phones keep sliders and Look but explain that code needs a bigger screen', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    const { store } = selectedWalker()
    render(<SeeInsideCard store={store} />)
    expect((screen.getByRole('button', { name: 'Code needs a bigger screen' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('slider', { name: 'speed' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Look' }))
    expect(screen.getByRole('list', { name: 'Costumes' })).toBeTruthy()
  })

  it('changing selection returns to sliders with all copies selected', () => {
    const { store, copies } = selectedWalker()
    render(<SeeInsideCard store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Just this one' }))
    fireEvent.click(screen.getByRole('button', { name: 'Look' }))
    act(() => store.selectCopy(copies[1].id))
    expect(screen.getByRole('button', { name: 'All copies' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('slider', { name: 'speed' })).toBeTruthy()
  })
})

describe('New brick identity', () => {
  it('places a created Coin under My bricks and arms it', () => {
    const store = new StudioStore(createStarterProject())
    const id = createBrickFromTemplate(store, BRICK_TEMPLATES.find((t) => t.id === 'coin')!, 'Star')
    expect(drawerEntries(store.getState().project.design.bricks).find((entry) => entry.brick?.id === id)?.category).toBe('mine')
    expect(store.getState().brushBrickId).toBe(id)
  })
  it('asks for a free name instead of silently making Coin 2', () => {
    const store = new StudioStore(createStarterProject())
    render(<NewBrickPicker store={store} templates={[BRICK_TEMPLATES.find((t) => t.id === 'coin')!]} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /^Coin/ }))
    const names = screen.getByRole('dialog', { name: 'Pick a name for your brick' })
    expect((within(names).getByRole('button', { name: 'Coin' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(names).getByRole('button', { name: 'Star' }))
    expect(store.getState().project.design.bricks.some((b) => b.name === 'Coin 2')).toBe(false)
    expect(store.getState().project.design.bricks.some((b) => b.name === 'Star')).toBe(true)
  })
})
