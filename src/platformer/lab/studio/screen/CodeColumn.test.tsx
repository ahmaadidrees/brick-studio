/**
 * Code's left column by kit (docs/qa/hackable-modes/R1-SCREENS.md, lane 3): Hackable Racing has no "+ Power" and none of
 * the Platformer's starting points; the Platformer keeps both.
 */
import * as Blockly from 'blockly/core'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRaceStarterProject } from '../race/raceProject'
import { CAR_BRICK_ID } from '../race/carBrick'
import { createStarterProject } from '../starter'
import { StudioStore, type StudioProject } from '../store'
import { builtInPowers, snapPower } from '../powers/powers'
import { CodeColumn } from './CodeColumn'

afterEach(cleanup)

/** Opens Code on a brick. The Powers row doesn't need the blocks, so `light` opens the Sounds tab and skips Blockly. */
async function open(project: StudioProject, brickId?: (store: StudioStore) => string, light = false) {
  const store = new StudioStore(project)
  const id = brickId ? brickId(store) : project.design.bricks[0].id
  store.openCode(id)
  if (light) store.setEditorTab('sounds')
  render(<CodeColumn store={store} />)
  await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
  return store
}

/** A brand-new brick, as "+ New brick" makes it: the starting points show on its empty script area. */
const freshBrick = (store: StudioStore) => store.addBrick('Thing', store.getState().project.design.bricks[0].costumes[0])
const startingPoints = () => screen.queryByRole('group', { name: 'Start from a brick that works' })

describe('Code column by kit', () => {
  it('a race: the Car has no Powers row and no "+ Power"', async () => {
    await open(createRaceStarterProject(), () => CAR_BRICK_ID, true)
    expect(screen.getByRole('region', { name: 'Car code' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Powers on this brick' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Power' })).toBeNull()
  }, 60000)

  it('a race: a new brick offers no Platformer starting points (no Walker, Coin, Spring or Goal)', async () => {
    await open(createRaceStarterProject(), freshBrick)
    expect(startingPoints()).toBeNull()
    for (const name of ['Walker', 'Coin', 'Spring', 'Goal']) expect(screen.queryByRole('button', { name })).toBeNull()
  }, 60000)

  it('a race: a power a brick already has still shows, to switch off or take off, with no "+ Power"', async () => {
    // "+ Power" refuses the Platformer's powers in a race, so this one is snapped on directly, as an older file could hold.
    const { project, snap } = snapPower(createRaceStarterProject(), CAR_BRICK_ID, builtInPowers()[0])
    expect(project.design.bricks.find((b) => b.id === CAR_BRICK_ID)!.powers).toHaveLength(1)
    await open(project, () => CAR_BRICK_ID, true)
    const row = screen.getByRole('group', { name: 'Powers on this brick' })
    expect(within(row).getByRole('button', { name: `Take ${snap.name} off` })).toBeInTheDocument()
    expect(within(row).queryByRole('button', { name: 'Power' })).toBeNull()
  }, 60000)

  it('the Platformer keeps "+ Power" and its four starting points', async () => {
    await open(createStarterProject(), freshBrick)
    expect(screen.getByRole('button', { name: 'Power' })).toBeInTheDocument()
    const starts = startingPoints()!
    expect(within(starts).getAllByRole('button').map((b) => b.textContent)).toEqual(['Walker', 'Coin', 'Spring', 'Goal'])
  }, 60000)
})
