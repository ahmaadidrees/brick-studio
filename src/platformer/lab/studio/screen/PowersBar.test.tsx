import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { MY_POWERS_KEY, resetPowerCache } from '../powers/library'
import { PowersBar } from './PowersBar'

afterEach(() => { cleanup(); localStorage.removeItem(MY_POWERS_KEY); resetPowerCache() })

function Bar({ store }: { store: StudioStore }) {
  return <PowersBar store={store} brick={store.brick('brick_hero')!} />
}

describe('Powers row in Code', () => {
  it('+ Power snaps Double jump onto the Hero; its chip credits the maker, switches off and comes off', () => {
    const store = new StudioStore(createStarterProject())
    const { rerender } = render(<Bar store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Snap a power onto Hero' })).getByRole('button', { name: /Double jump/ }))
    rerender(<Bar store={store} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('from Brickgineers')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off Double jump' }))
    rerender(<Bar store={store} />)
    expect(store.isPowerOn('brick_hero', 'pw1')).toBe(false)
    expect(screen.getByRole('button', { name: 'Turn on Double jump' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Take Double jump off' }))
    rerender(<Bar store={store} />)
    expect(store.brick('brick_hero')!.powers).toEqual([])
    expect(screen.queryByText('from Brickgineers')).toBeNull()
  })

  it('makes a power from chosen scripts, keeps it in My powers, and offers it next time', () => {
    const store = new StudioStore(createStarterProject())
    render(<Bar store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make a power from Hero…' }))
    const maker = screen.getByRole('dialog', { name: 'Make a power from Hero' })
    const make = within(maker).getByRole('button', { name: 'Make the power' }) as HTMLButtonElement
    expect(make.disabled).toBe(true)
    fireEvent.click(within(maker).getByLabelText(/Coyote time/))
    fireEvent.change(within(maker).getByLabelText(/Power name/), { target: { value: 'Late jump' } })
    fireEvent.change(within(maker).getByLabelText(/Made by/), { target: { value: 'Ana' } })
    expect(make.disabled).toBe(false)
    act(() => { make.click() })
    expect(screen.getByRole('dialog', { name: 'Power made' })).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(MY_POWERS_KEY)!)[0]).toMatchObject({ name: 'Late jump', credits: ['Ana'] })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    expect(within(screen.getByRole('dialog', { name: 'Snap a power onto Hero' })).getByRole('button', { name: /Late jump/ })).toBeTruthy()
  })
})
