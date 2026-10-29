import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { MAKER_NAME_KEY, MY_POWERS_KEY, resetPowerCache } from '../powers/library'
import { PowersBar } from './PowersBar'
import { builtInPowers } from '../powers/powers'

afterEach(() => { cleanup(); localStorage.removeItem(MY_POWERS_KEY); localStorage.removeItem(MAKER_NAME_KEY); resetPowerCache() })

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

  it('Take off asks first once the kid changed the power\'s blocks; Keep it keeps them', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', builtInPowers().find((p) => p.id === 'dash')!)!
    // The kid adds a block under Dash's script.
    const ws = structuredClone(store.getState().project.workspaces.brick_hero) as { blocks: { blocks: Array<Record<string, unknown>> } }
    const top = ws.blocks.blocks.find((b) => b.id === snap.blockIds[0])!
    let last = top
    while ((last.next as { block?: Record<string, unknown> } | undefined)?.block) last = (last.next as { block: Record<string, unknown> }).block
    last.next = { block: { type: 'looks_nextcostume', id: 'kid_1' } }
    store.setWorkspace('brick_hero', ws)

    const { rerender } = render(<Bar store={store} />)
    fireEvent.click(screen.getByRole('button', { name: 'Take Dash off' }))
    rerender(<Bar store={store} />)
    const ask = screen.getByRole('group', { name: 'Take Dash off?' })
    expect(within(ask).getByText('Your changes to it go too.')).toBeTruthy()
    expect(store.brick('brick_hero')!.powers).toHaveLength(1)
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep it' }))
    rerender(<Bar store={store} />)
    expect(store.brick('brick_hero')!.powers).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Take Dash off' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Take Dash off' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Take Dash off?' })).getByRole('button', { name: 'Take it off' }))
    rerender(<Bar store={store} />)
    expect(store.brick('brick_hero')!.powers).toEqual([])
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

describe('the class shelf in Code', () => {
  const classId = '33333333-3333-4333-8333-000000000001'
  const session = { status: 'student', classes: [{ id: classId }], displayName: 'Ana K.', signOut: async () => {}, switchAccount: async () => {} } as never
  function fakeShelf() {
    const calls: string[] = []
    const items = [
      { id: 'i1', kind: 'power', name: 'Moon jump', what: 'Float down slowly', by: 'Sam R.', mine: false, status: 'approved', uses: 2, createdAt: '' },
      { id: 'i2', kind: 'power', name: 'My dash', what: '', by: 'Ana K.', mine: true, status: 'pending', uses: 0, createdAt: '' },
    ]
    const payload = { ...builtInPowers()[0], name: 'Moon jump', credits: ['Sam R.'] }
    const api = {
      list: async () => { calls.push('list'); return { items, needsReview: true, raceHeroes: 'shelf' } },
      get: async (_c: string, id: string) => { calls.push(`get ${id}`); return { ...items[0], payload } },
      share: async (_c: string, input: { name: string }) => { calls.push(`share ${input.name}`); return { ...items[1], name: input.name } },
      review: async () => items[0],
      remove: async () => ({ removed: true as const }),
      used: async (_c: string, id: string) => { calls.push(`used ${id}`); return { uses: 3 } },
    }
    return { api: api as never, calls }
  }

  it('lists what classmates shared and this kid\'s own waiting ones; snapping one on counts a use', async () => {
    const store = new StudioStore(createStarterProject())
    const { api, calls } = fakeShelf()
    render(<PowersBar store={store} brick={store.brick('brick_hero')!} shelfApi={api} session={session} />)
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    const pick = await screen.findByRole('button', { name: /Moon jump/ })
    expect(pick.textContent).toMatch(/from Sam R\. · 2 using it/)
    expect(screen.getByText('My dash: waiting for your teacher.')).toBeTruthy()
    await act(async () => { fireEvent.click(pick) })
    expect(calls).toEqual(['list', 'get i1', 'used i1'])
    expect(store.brick('brick_hero')!.powers!.map((p) => [p.name, p.credits])).toEqual([['Moon jump', ['Sam R.']]])
  })

  it('a power just made can be shared with the class; a student\'s waits for the teacher', async () => {
    const store = new StudioStore(createStarterProject())
    const { api, calls } = fakeShelf()
    render(<PowersBar store={store} brick={store.brick('brick_hero')!} shelfApi={api} session={session} />)
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make a power from Hero…' }))
    const maker = screen.getByRole('dialog', { name: 'Make a power from Hero' })
    expect((within(maker).getByLabelText(/Made by/) as HTMLInputElement).value).toBe('Ana K.')
    fireEvent.click(within(maker).getByLabelText(/Coyote time/))
    fireEvent.change(within(maker).getByLabelText(/Power name/), { target: { value: 'Late jump' } })
    act(() => { (within(maker).getByRole('button', { name: 'Make the power' }) as HTMLButtonElement).click() })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share with my class' })) })
    expect(calls).toContain('share Late jump')
    expect(screen.getByText(/Sent to your teacher/)).toBeTruthy()
  })

  it('signed out, the shelf says to sign in and nothing is fetched', () => {
    const store = new StudioStore(createStarterProject())
    const { api, calls } = fakeShelf()
    const guest = { status: 'guest', signOut: async () => {}, switchAccount: async () => {} } as never
    render(<PowersBar store={store} brick={store.brick('brick_hero')!} shelfApi={api} session={guest} />)
    fireEvent.click(screen.getByRole('button', { name: 'Power' }))
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy()
    expect(calls).toEqual([])
  })
})
