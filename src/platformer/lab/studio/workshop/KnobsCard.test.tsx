import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HERO_BRICK_ID, HERO_KNOB_GROUPS, HERO_KNOBS, HERO_MORE_TUNING_COUNT } from '../hero/heroBrick'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { KnobsCard } from './KnobsCard'
import { knobList, sliderRange } from './knobs'

afterEach(cleanup)

describe('Knobs card', () => {
  it('Hero: four sliders, then a collapsed "More tuning (N)" with the rest grouped Walking / Running / Jumping / Falling / Walls', () => {
    const store = new StudioStore(createStarterProject())
    render(<KnobsCard store={store} brickId={HERO_BRICK_ID} />)
    const card = screen.getByRole('region', { name: 'Knobs' })
    expect(within(card).getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['walk top speed', 'run top speed', 'jump standing', 'fall gravity'])
    const toggle = within(card).getByRole('button', { name: `More tuning (${HERO_MORE_TUNING_COUNT})` })
    expect(HERO_MORE_TUNING_COUNT).toBe(HERO_KNOBS.length - 4)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(card).queryByRole('heading', { name: 'Walking' })).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(card).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Walking', 'Running', 'Jumping', 'Falling', 'Walls'])
    expect(within(card).getAllByRole('slider')).toHaveLength(4 + HERO_MORE_TUNING_COUNT)
    expect(within(within(card).getByRole('region', { name: 'Walls' })).getAllByRole('slider')).toHaveLength(HERO_KNOB_GROUPS.find((g) => g.id === 'walls')!.knobIds.length)
  })

  it('a "More tuning" slider changes the Hero variable but does not turn it into a Build knob', () => {
    const store = new StudioStore(createStarterProject())
    render(<KnobsCard store={store} brickId={HERO_BRICK_ID} />)
    fireEvent.click(screen.getByRole('button', { name: /More tuning/ }))
    fireEvent.change(screen.getByRole('slider', { name: 'wall slide speed' }), { target: { value: '3' } })
    const v = store.getState().project.design.bricks.find((b) => b.id === HERO_BRICK_ID)!.program.variables.find((x) => x.id === 'wall_slide')!
    expect([v.value, v.showInBuild]).toEqual([3, false])
    // the four Build knobs stay Build knobs
    fireEvent.change(screen.getByRole('slider', { name: 'walk top speed' }), { target: { value: '2' } })
    const w = store.getState().project.design.bricks.find((b) => b.id === HERO_BRICK_ID)!.program.variables.find((x) => x.id === 'walk_top')!
    expect([w.value, w.showInBuild]).toEqual([2, true])
  })

  it('another brick lists its Build knobs and has no "More tuning"', () => {
    const store = new StudioStore(createStarterProject())
    render(<KnobsCard store={store} brickId="brick_walker" />)
    expect(screen.getAllByRole('slider').map((s) => s.getAttribute('aria-label'))).toEqual(['speed'])
    expect(screen.queryByRole('button', { name: /More tuning/ })).toBeNull()
  })

  it('a Hero slider range comes from the built-in value, so it does not stretch as you drag', () => {
    const hero = createStarterProject().design.bricks.find((b) => b.id === HERO_BRICK_ID)!
    const { main } = knobList(hero.program.variables)
    const walk = main.find((v) => v.id === 'walk_top')!
    expect(sliderRange(walk)).toEqual({ min: 0, max: 6, step: 1 })
    expect(sliderRange({ ...walk, value: 6 })).toEqual({ min: 0, max: 6, step: 1 })
    expect(sliderRange({ ...walk, value: 9 }).max).toBe(9)
  })
})
