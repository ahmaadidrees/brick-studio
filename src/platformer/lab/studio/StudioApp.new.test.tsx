import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listHackableProjects } from './persist/hackableProjects'
import type { StudioStore } from './store'
import StudioApp from './StudioApp'

vi.mock('./gridBricks', async (orig) => ({ ...(await orig<typeof import('./gridBricks')>()), gridBrickTemplate: (await import('./builder/testGridBricks')).fakeGridTemplate }))
vi.mock('./CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))

afterEach(() => { cleanup(); localStorage.clear() })

const studio = () => (window as unknown as { __studio: StudioStore }).__studio

describe('/2d/hackable?new=1 in the page', () => {
  it('opens a project without keeping it, then keeps it (and names it in the address) at the first change', async () => {
    window.history.replaceState(null, '', '/2d/hackable?new=1')
    render(<StudioApp route={{ fresh: true }} />)
    await screen.findByRole('radio', { name: 'Build' })
    expect(listHackableProjects()).toEqual([])
    expect(window.location.search).toBe('?new=1')

    await act(async () => { studio().addCopy('brick_coin', 400, 140) })
    // The first keep is quick but not instant; wait for it rather than a fixed delay (a loaded machine can miss 20 ms).
    await waitFor(() => expect(listHackableProjects()[0]?.title).toBe('My platformer'))
    const [entry] = listHackableProjects()
    expect(window.location.search).toBe(`?draft=${entry.id}`)

    // Later changes save under it as usual.
    await act(async () => { studio().addCopy('brick_coin', 420, 140); await new Promise((r) => setTimeout(r, 700)) })
    expect(localStorage.getItem(`code-lab.project.v1:${entry.id}`)).toContain('"x":420')
  })
})
