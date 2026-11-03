/**
 * Build's laps chip: "Laps work", or exactly one of core/race.ts's three reasons, and it changes as the kid paints and
 * turns the finish arrow.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RACE_LOOP_REASON_TEXT } from '../../../core/race'
import { StudioStore } from '../../store'
import { createRaceStarterProject } from '../raceProject'
import { LAPS_WORK, LapsChip, lapsStatus } from './LapsChip'

afterEach(cleanup)

const FINISH = 'F'
const ROAD = 'R'

function cellsOf(store: StudioStore, ch: string): Array<[number, number]> {
  const tiles = store.getState().project.design.tiles!
  const out: Array<[number, number]> = []
  tiles.data.forEach((row, r) => [...row].forEach((c, col) => { if (c === ch) out.push([col, r]) }))
  return out
}

const chipText = () => screen.getByRole('status').textContent ?? ''

describe('the laps chip', () => {
  it('says "Laps work" on the beginner track', () => {
    const store = new StudioStore(createRaceStarterProject())
    render(<LapsChip store={store} />)
    expect(chipText()).toContain(LAPS_WORK)
    expect(screen.getByRole('status').getAttribute('data-ok')).toBe('yes')
  })

  it('says why not, in the engine’s exact words, as the kid paints: no finish line, a gap, no loop', () => {
    const store = new StudioStore(createRaceStarterProject())
    render(<LapsChip store={store} />)
    const finish = cellsOf(store, FINISH)
    expect(finish.length).toBeGreaterThan(2)

    // A gap in the finish line: traffic leaks round its end.
    const middle = finish[Math.floor(finish.length / 2)]
    act(() => store.setTile(middle[0], middle[1], ROAD))
    expect(chipText()).toContain(RACE_LOOP_REASON_TEXT['finish-gap'])
    expect(screen.getByRole('status').getAttribute('data-ok')).toBe('no')

    // No finish line at all.
    act(() => { for (const [c, r] of finish) store.setTile(c, r, ROAD) })
    expect(chipText()).toContain(RACE_LOOP_REASON_TEXT['no-finish'])

    // The line back, then the top straight cut with grass: the road no longer loops.
    act(() => { for (const [c, r] of finish) store.setTile(c, r, FINISH) })
    expect(chipText()).toContain(LAPS_WORK)
    const tiles = store.getState().project.design.tiles!
    act(() => { for (let r = Math.floor(tiles.rows / 2); r < tiles.rows; r++) store.setTile(Math.floor(tiles.cols / 2), r, '.') })
    expect(chipText()).toContain(RACE_LOOP_REASON_TEXT['no-loop'])
  })

  it('follows the finish arrow', () => {
    const store = new StudioStore(createRaceStarterProject())
    const design = () => store.getState().project.design
    render(<LapsChip store={store} />)
    act(() => store.setFinishDirection('brick_finish', 0))
    const up = lapsStatus(design().tiles, design().bricks)
    expect(up.ok).toBe(false)
    expect(chipText()).toContain(up.text)
    act(() => store.setFinishDirection('brick_finish', 90))
    expect(chipText()).toContain(LAPS_WORK)
  })

  it('has only the four things to say', () => {
    const texts = new Set([LAPS_WORK, ...Object.values(RACE_LOOP_REASON_TEXT)])
    expect(texts.size).toBe(4)
    const { design } = createRaceStarterProject()
    expect(texts.has(lapsStatus(design.tiles, design.bricks).text)).toBe(true)
    expect(lapsStatus(undefined, design.bricks).text).toBe(RACE_LOOP_REASON_TEXT['no-finish'])
  })
})
