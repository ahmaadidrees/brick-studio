import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContinuousToolbox, type ToolboxCategory } from '../../core/editor/toolbox'
import { costumeFromImage, imageFromRows } from '../pixels'
import { StudioStore } from '../store'
import { CodeColumn } from '../screen/CodeColumn'
import { createBlankProject } from './blankProject'
import { createEmptyBrick } from '../starter'

vi.mock('../CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))
afterEach(cleanup)

const names = (kit?: 'blank' | 'race') => (createContinuousToolbox(undefined, { kit }).contents as ToolboxCategory[]).map((c) => c.name)
const blocksIn = (cat: ToolboxCategory) => (cat.contents ?? []).flatMap((i) => (i.kind === 'block' ? [i.type] : []))

describe('Start from nothing: Code (lane D)', () => {
  it('has one Game category: touching the player first, then every Platformer and Racing block', () => {
    expect(names('blank')).not.toContain('Platformer')
    expect(names('blank')).not.toContain('Racing')
    expect(names('blank').at(-1)).toBe('Game')
    const game = (createContinuousToolbox(undefined, { kit: 'blank' }).contents as ToolboxCategory[]).find((c) => c.name === 'Game')!
    const blocks = blocksIn(game)
    expect(blocks[0]).toBe('game_touchingplayer')
    const platformer = (createContinuousToolbox().contents as ToolboxCategory[]).find((c) => c.name === 'Platformer')!
    const racing = (createContinuousToolbox(undefined, { kit: 'race' }).contents as ToolboxCategory[]).find((c) => c.name === 'Racing')!
    for (const b of [...blocksIn(platformer), ...blocksIn(racing)]) expect(blocks).toContain(b)
    // The Stage has no body: no Game category there.
    expect((createContinuousToolbox(undefined, { kit: 'blank', isStage: true }).contents as ToolboxCategory[]).map((c) => c.name)).not.toContain('Game')
  })

  it('the kits keep their palettes', () => {
    expect(names()).toContain('Platformer')
    expect(names()).not.toContain('Game')
    expect(names('race')).toEqual(expect.arrayContaining(['Racing', 'Platformer']))
  })

  it('"Start from" offers the jobs, and "+ Job or power" lists them too', () => {
    const store = new StudioStore(createBlankProject())
    const made = createEmptyBrick('fresh', 'Zip')
    const { id: _id, ...brick } = made.brick
    const id = store.addBrickFrom({ ...brick, costumes: [costumeFromImage('c', imageFromRows(['##', '##'], { '#': '#34c77b' }))] }, made.workspace)
    act(() => store.openCode(id))
    render(<CodeColumn store={store} />)
    const starts = screen.getByRole('group', { name: 'Start from a job' })
    for (const name of ['Player · walks around', 'Player · runs and jumps', 'Player · drives', 'Wall', 'Collect', 'Goal', 'Hurts', 'Falls']) expect(within(starts).getByRole('button', { name })).toBeTruthy()
    fireEvent.click(within(starts).getByRole('button', { name: 'Collect' }))
    expect(store.brick(id)!.powers?.map((p) => p.job)).toEqual(['collect'])
    expect(screen.getByText('Jobs and powers')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Job or power/ }))
    const picker = screen.getByRole('dialog', { name: 'Snap a power onto Zip' })
    fireEvent.click(within(picker).getByRole('button', { name: /^Player · walks around/ }))
    expect(store.brick(id)!.powers?.map((p) => p.job)).toEqual(['collect', 'player:walk'])
    expect(store.getState().project.design.player).toBe(id)
    // In Code the game is not started: the kid is reading blocks.
    expect(store.getState().mode).toBe('build')
  })
})
