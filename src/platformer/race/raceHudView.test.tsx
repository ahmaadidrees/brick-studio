import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RaceHudView } from './RaceHudView'
import type { RaceHud } from './raceRun'

const HUD: RaceHud = {
  phase: 'racing', lights: 0, laps: 3, lap: 1, time: 0, bestLap: 0, place: 1, racers: 3, youDone: false,
  standings: [], loopProblem: null, itemsOn: false, item: null, coins: 0,
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RaceHudView computer racers', () => {
  it('keeps the menu open when clicked, and lets go of it once a number is picked', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { cb(0); return 0 })
    const onRivals = vi.fn()
    render(<RaceHudView hud={HUD} rivals={2} onRivals={onRivals} onRaceAgain={() => {}} onExit={() => {}} exitLabel="Exit" touch={false} />)
    const select = screen.getByRole('combobox')
    select.focus()
    fireEvent.click(select)
    expect(document.activeElement).toBe(select)

    fireEvent.change(select, { target: { value: '3' } })
    expect(onRivals).toHaveBeenCalledWith(3)
    expect(document.activeElement).not.toBe(select)
  })
})
