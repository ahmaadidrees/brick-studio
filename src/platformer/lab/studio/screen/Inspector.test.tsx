import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { Inspector } from './Inspector'

const walkerId = 'brick_walker'
const speedId = 'brick_walker_speed'
function selectedWalker() {
  const store = new StudioStore(createStarterProject())
  const copies = store.getState().project.design.copies.filter((copy) => copy.brickId === walkerId)
  store.selectCopy(copies[0].id)
  return { store, copies }
}
afterEach(cleanup)

describe('Build inspector', () => {
  it('starts on every copy, makes its own value only in Just this one, and can go back to the others', () => {
    const { store, copies } = selectedWalker()
    render(<Inspector store={store} />)
    expect(screen.getByRole('button', { name: 'Every Walker' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(screen.getByRole('slider', { name: 'speed' }), { target: { value: '5' } })
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(5)
    expect(store.getState().project.design.copies.find((copy) => copy.id === copies[0].id)!.knobs?.[speedId]).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Just this one' }))
    fireEvent.change(screen.getByRole('slider', { name: 'speed' }), { target: { value: '2' } })
    expect(store.getState().project.design.copies.find((copy) => copy.id === copies[0].id)!.knobs?.[speedId]).toBe(2)
    expect(store.getState().project.design.copies.find((copy) => copy.id === copies[1].id)!.knobs?.[speedId]).toBeUndefined()
    expect(screen.getByText('its own')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: "Use the brick's value for speed" }))
    expect(screen.queryByText('its own')).toBeNull()
    expect((screen.getByRole('slider', { name: 'speed' }) as HTMLInputElement).value).toBe('5')
  })

  it('says how many are in the level in plain words, with Sliders and Look as real tabs', () => {
    const { store, copies } = selectedWalker()
    render(<Inspector store={store} />)
    expect(screen.getByText(`Built-in · ${copies.length} in this level`)).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Sliders' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Look' }))
    expect(screen.getByRole('tab', { name: 'Look' }).getAttribute('aria-selected')).toBe('true')
    expect(within(screen.getByRole('list', { name: 'Costumes' })).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(screen.queryByRole('slider')).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Sliders' }))
    expect(screen.getByRole('slider', { name: 'speed' })).toBeTruthy()
  })

  it('rounds what a slider shows, never the value itself', () => {
    const { store } = selectedWalker()
    store.setBrickSlider(walkerId, speedId, 3.14159)
    render(<Inspector store={store} />)
    expect(screen.getByText('3.1')).toBeTruthy()
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(3.14159)
  })

  it('shows the Hero\'s four sliders and a collapsed more group, without "which ones" or Remove', () => {
    const store = new StudioStore(createStarterProject())
    store.selectCopy('copy_hero')
    render(<Inspector store={store} />)
    expect(screen.getAllByRole('slider')).toHaveLength(4)
    expect(screen.getByRole('button', { name: /More sliders for the Hero/ }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('group', { name: 'Which ones change' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    expect(screen.queryByRole('button', { name: 'Remove this Hero' })).toBeNull()
  })

  it('Open its code goes to Code on this brick; Change costumes opens its Costumes', () => {
    const { store } = selectedWalker()
    render(<Inspector store={store} />)
    fireEvent.click(screen.getByRole('button', { name: /Open its code/ }))
    expect(store.getState().cardTab).toBe('code')
    expect(store.getState().selectedBrickId).toBe(walkerId)
    act(() => store.setScreen('build'))
    fireEvent.click(screen.getByRole('tab', { name: 'Look' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change costumes' }))
    expect(store.getState().cardTab).toBe('code')
    expect(store.getState().editorTab).toBe('costumes')
  })

  it('Escape closes it', () => {
    const { store } = selectedWalker()
    render(<Inspector store={store} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(store.getState().selectedCopyId).toBeNull()
    expect(screen.queryByRole('region', { name: 'Walker in this level' })).toBeNull()
  })

  it('asks before bringing back the original, and Keep my changes keeps them', () => {
    const { store } = selectedWalker()
    store.setBrickSlider(walkerId, speedId, 5)
    render(<Inspector store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the original' }))
    expect(screen.getByRole('dialog', { name: 'Back to the original?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep my changes' }))
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(5)
    fireEvent.click(screen.getByRole('button', { name: 'Brick actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to the original' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bring it back' }))
    expect(store.brick(walkerId)!.program.variables.find((v) => v.id === speedId)!.value).toBe(3)
  })

  it('on a phone, sliders and Look stay, and it explains that code needs a bigger screen', () => {
    const { store } = selectedWalker()
    render(<Inspector store={store} compact />)
    expect(screen.queryByRole('button', { name: /Open its code/ })).toBeNull()
    expect(screen.getByText(/Code needs a bigger screen/)).toBeTruthy()
    expect(screen.getByRole('slider', { name: 'speed' })).toBeTruthy()
  })

  it('changing selection goes back to Sliders and every copy', () => {
    const { store, copies } = selectedWalker()
    render(<Inspector store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Just this one' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Look' }))
    act(() => store.selectCopy(copies[1].id))
    expect(screen.getByRole('button', { name: 'Every Walker' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('slider', { name: 'speed' })).toBeTruthy()
  })

  it('a built-in brick\'s name is not renamed here; a kid\'s own brick is renamed by clicking its name', () => {
    const { store } = selectedWalker()
    const { unmount } = render(<Inspector store={store} />)
    expect((screen.getByRole('button', { name: 'Walker' }) as HTMLButtonElement).disabled).toBe(true)
    unmount()
    const own = store.addBrick('Robot', store.brick(walkerId)!.costumes[0])
    const copy = store.addCopy(own, 100, 100)
    store.selectCopy(copy)
    render(<Inspector store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Robot. Rename' }))
    const input = screen.getByRole('textbox', { name: 'Brick name' })
    fireEvent.change(input, { target: { value: 'Robo' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(store.brick(own)!.name).toBe('Robo')
  })
})
