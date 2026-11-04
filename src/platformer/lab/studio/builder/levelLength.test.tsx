/**
 * Level length (parity bucket B): Build's chip makes a Platformer longer or shorter a screen (20 tiles) at a time, up to
 * the classic 160 and beyond (400). It never loses a painted cell or a placed brick, and the floor carries on.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TILE_SIZE } from '../../core/contracts'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { HERO_BRICK_ID } from '../hero/heroBrick'
import { createStarterProject, STARTER_COLS } from '../starter'
import { StudioStore } from '../store'
import { LengthChip } from '../screen/LengthChip'
import { partsFor } from '../screen/kitParts'
import { createRaceStarterProject } from '../race/raceProject'
import { LENGTH_STEP, MAX_LENGTH, levelLength, shortestLength, withLength } from './levelLength'

afterEach(cleanup)

describe('level length', () => {
  it('the starter is 60 tiles; it can grow to the classic 160 and back, getting the same level', () => {
    const d = createStarterProject().design
    expect(levelLength(d)).toBe(STARTER_COLS)
    const long = withLength(d, 160)
    expect(levelLength(long)).toBe(160)
    expect(long.bounds.right).toBe(160 * TILE_SIZE)
    expect(long.tiles!.data.every((row) => row.length === 160)).toBe(true)
    expect(validateDesign(long)).toEqual([])
    expect(withLength(long, STARTER_COLS)).toEqual(d)
  })

  it('the floor carries on: the bottom row repeats its last cell; nothing else is added', () => {
    const d = createStarterProject().design
    const long = withLength(d, 80)
    const bottom = long.tiles!.data[0]!
    expect(bottom.slice(STARTER_COLS)).toBe(bottom[STARTER_COLS - 1]!.repeat(20))
    for (const row of long.tiles!.data.slice(1)) expect(row.slice(STARTER_COLS)).toBe('.'.repeat(20))
  })

  it("never shorter than the last thing painted or placed (but the floor's last stretch), and never past 400", () => {
    const d = createStarterProject().design
    // The starter's Goal stands in column 57: 58 tiles is the shortest (its ground just stops sooner).
    expect(shortestLength(d)).toBe(58)
    expect(withLength(d, 57)).toBe(d)
    expect(levelLength(withLength(d, 58))).toBe(58)
    // Grown, the added floor doesn't hold it back: back to 58 again.
    expect(shortestLength(withLength(d, 160))).toBe(58)
    // A brick placed far out does.
    const long = withLength(d, 120)
    const far = { ...long, copies: long.copies.map((c) => (c.brickId === 'brick_goal' ? { ...c, x: 100 * TILE_SIZE + 8 } : c)) }
    expect(shortestLength(far)).toBe(101)
    expect(withLength(far, 100)).toBe(far)
    // So does a painted cell up in the air.
    const painted = { ...long, tiles: { ...long.tiles!, data: long.tiles!.data.map((row, r) => (r === 5 ? row.slice(0, 110) + 'H' + row.slice(111) : row)) } }
    expect(shortestLength(painted)).toBe(111)
    expect(withLength(d, MAX_LENGTH + LENGTH_STEP)).toBe(d)
    expect(levelLength(withLength(d, MAX_LENGTH))).toBe(MAX_LENGTH)
  })

  it('the Hero can run into the new part of the level', () => {
    const long = withLength(createStarterProject().design, 100)
    // (No Goal: touching it ends the level.)
    const copies = long.copies.filter((c) => c.brickId !== 'brick_goal').map((c) => (c.brickId === HERO_BRICK_ID ? { ...c, x: STARTER_COLS * TILE_SIZE - 40, y: 40 } : c))
    const rt = play({ ...long, copies })
    const hero = rt.world.targets.find((t) => t.brickId === HERO_BRICK_ID && !t.isClone)!
    for (let k = 0; k < 5; k++) rt.step()
    rt.pressKey('right arrow')
    for (let k = 0; k < 90; k++) rt.step()
    expect(hero.x).toBeGreaterThan(STARTER_COLS * TILE_SIZE + 100)
    expect(hero.body?.onGround).toBe(true)
  })
})

describe('the length chip', () => {
  it('is the Platformer\'s Build chip; Racing keeps its laps chip', () => {
    expect(partsFor(createStarterProject().design).BuildChip).toBe(LengthChip)
    expect(partsFor(createRaceStarterProject().design).BuildChip).not.toBe(LengthChip)
  })

  it('shows the length; + adds a screen; − takes it away again, and is off when it would cut something', () => {
    const store = new StudioStore(createStarterProject())
    render(<LengthChip store={store} />)
    expect(screen.getByRole('group', { name: 'Level length' })).toHaveTextContent('60 tiles')
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Longer level' })) })
    expect(screen.getByRole('group', { name: 'Level length' })).toHaveTextContent('80 tiles')
    expect(levelLength(store.getState().project.design)).toBe(80)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Shorter level' })) })
    expect(levelLength(store.getState().project.design)).toBe(60)
    // Past the Goal (column 57) it stops: 58, then − is off.
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Shorter level' })) })
    expect(levelLength(store.getState().project.design)).toBe(58)
    expect(screen.getByRole('button', { name: 'Shorter level' })).toBeDisabled()
  })
})
