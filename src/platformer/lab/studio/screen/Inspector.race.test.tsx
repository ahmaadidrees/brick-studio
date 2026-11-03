/**
 * Build's card in Hackable Racing: the Car's four sliders, Kart / Drifty / On rails and "More sliders"; a Computer
 * racer's sliders; and the finish line's arrow.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { gridCopyId } from '../../core/contracts'
import { History } from '../builder/history'
import { StudioStore } from '../store'
import { createRaceStarterProject } from '../race/raceProject'
import { CAR_BRICK_ID, CAR_KNOBS, RACER_BRICK_ID } from '../race/carBrick'
import { CAR_PRESETS } from '../race/carPresets'
import { LapsChip } from '../race/screens/LapsChip'
import { Inspector } from './Inspector'

afterEach(cleanup)

const carVar = (store: StudioStore, key: string) => store.brick(CAR_BRICK_ID)!.program.variables.find((v) => v.id === `car_${key}`)!.value
const BANNED = /\b(tick|ticks|sprite|kit)\b/i

function selected(copyId: string) {
  const store = new StudioStore(createRaceStarterProject())
  store.selectCopy(copyId)
  return store
}

describe('the Car’s card', () => {
  it('shows the four sliders up front, then Kart / Drifty / On rails, then "More sliders"', () => {
    const store = selected('copy_car')
    render(<Inspector store={store} />)
    const card = screen.getByRole('region', { name: 'Sliders' })
    expect(within(card).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['top speed', 'acceleration', 'steering', 'grip'])
    const presets = within(card).getByRole('group', { name: 'How it drives' })
    expect(within(presets).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Kart', 'true'], ['Drifty', 'false'], ['On rails', 'false']])
    const more = within(card).getByRole('button', { name: 'More sliders (15)' })
    fireEvent.click(more)
    expect(within(card).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Speed', 'Steering', 'Grass, dirt and ice', 'Boost pads'])
    expect(within(card).getAllByRole('slider')).toHaveLength(CAR_KNOBS.length)
    // Plain words only: "boost ticks" shows as "boost time", and no hint says how the code names it.
    expect(within(card).getByRole('slider', { name: 'boost time' })).toBeTruthy()
    expect(card.textContent).not.toMatch(BANNED)
  })

  it('a preset sets the Car’s numbers; Kart puts them back exactly', () => {
    const store = selected('copy_car')
    render(<Inspector store={store} />)
    const drifty = CAR_PRESETS.find((p) => p.id === 'drifty')!
    fireEvent.click(screen.getByRole('button', { name: 'Drifty' }))
    for (const [key, value] of Object.entries(drifty.knobs)) expect(carVar(store, key), key).toBe(value)
    expect(screen.getByRole('button', { name: 'Drifty' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText(drifty.hint)).toBeTruthy()
    // Moving a slider makes it the kid's own mix.
    fireEvent.change(screen.getByRole('slider', { name: 'top speed' }), { target: { value: '9' } })
    expect(screen.queryAllByRole('button', { pressed: true }).filter((b) => ['Kart', 'Drifty', 'On rails'].includes(b.textContent ?? ''))).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Kart' }))
    for (const k of CAR_KNOBS) expect(carVar(store, k.id), k.id).toBe(k.value)
  })

  it('slider ranges are fixed: dragging to the end never stretches them', () => {
    const store = selected('copy_car')
    render(<Inspector store={store} />)
    const top = () => screen.getByRole('slider', { name: 'top speed' }) as HTMLInputElement
    expect([top().min, top().max]).toEqual(['3', '12'])
    fireEvent.change(top(), { target: { value: '12' } })
    expect(carVar(store, 'top')).toBe(12)
    expect([top().min, top().max]).toEqual(['3', '12'])
    const grip = screen.getByRole('slider', { name: 'grip' }) as HTMLInputElement
    expect([grip.min, grip.max]).toEqual(['0.05', '1'])
  })
})

describe('a Computer racer’s card', () => {
  it('has top speed and the other three, on fixed ranges, for every racer or just this one', () => {
    const store = selected('copy_racer_1')
    render(<Inspector store={store} />)
    expect(screen.getByRole('button', { name: 'Every Computer racer' })).toBeTruthy()
    const top = screen.getByRole('slider', { name: 'top speed' }) as HTMLInputElement
    expect([top.min, top.max]).toEqual(['3', '12'])
    fireEvent.change(top, { target: { value: '12' } })
    expect(store.brick(RACER_BRICK_ID)!.program.variables.find((v) => v.id === 'racer_top')!.value).toBe(12)
    expect((screen.getByRole('slider', { name: 'top speed' }) as HTMLInputElement).max).toBe('12')
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['top speed', 'acceleration', 'steering', 'grip'])
  })
})

describe('the finish line’s arrow', () => {
  function finishCell(store: StudioStore): string {
    const tiles = store.getState().project.design.tiles!
    for (let r = 0; r < tiles.rows; r++) {
      const c = tiles.data[r].indexOf('F')
      if (c >= 0) return gridCopyId(c, r)
    }
    throw new Error('no finish line')
  }

  it('says which way cars cross, turns a quarter at a time, undoes, and the laps chip follows', () => {
    const store = new StudioStore(createRaceStarterProject())
    store.selectCopy(finishCell(store))
    const history = new History(store)
    render(<><Inspector store={store} history={history} /><LapsChip store={store} /></>)
    const group = screen.getByRole('group', { name: 'Finish line arrow' })
    expect(group.textContent).toContain('Cars cross it going right')
    expect(screen.queryByText(/No sliders yet/)).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Laps work')

    const finish = () => store.brick('brick_finish')!.grid!.finish
    const turns: number[] = []
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole('button', { name: /^Turn the arrow/ }))
      turns.push(finish()!)
    }
    expect(turns).toEqual([180, -90, 0, 90])
    fireEvent.click(screen.getByRole('button', { name: /^Turn the arrow/ }))
    expect(finish()).toBe(180)
    expect(group.textContent).toContain('Cars cross it going down')
    expect(screen.getByRole('status').textContent).not.toContain('Laps work')
    act(() => history.undo())
    expect(finish()).toBe(90)
    expect(screen.getByRole('status').textContent).toContain('Laps work')
  })

  it('other track bricks have no arrow', () => {
    const store = new StudioStore(createRaceStarterProject())
    const tiles = store.getState().project.design.tiles!
    const r = tiles.data.findIndex((row) => row.includes('R'))
    store.selectCopy(gridCopyId(tiles.data[r].indexOf('R'), r))
    render(<Inspector store={store} />)
    expect(screen.queryByRole('group', { name: 'Finish line arrow' })).toBeNull()
  })
})
