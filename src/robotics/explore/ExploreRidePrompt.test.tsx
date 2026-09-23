import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExploreRidePrompt from './ExploreRidePrompt'
import { SEAT_ID } from './rideFixtures'
import { resetExploreRideForTests, useExploreRideStore } from './rideStore'

/** The prompt as the studio mounts it in the Explore HUD, driven by the ride store's state. */
const candidate = { creationId: 'rover', name: 'Mars buggy', status: 'rideable' as const, seatIds: [SEAT_ID], program: { source: 'starter' as const, name: 'Joystick drive' } }

beforeEach(() => resetExploreRideForTests())
afterEach(() => {
  cleanup()
  resetExploreRideForTests()
})

describe('the ride prompt', () => {
  it('shows nothing until a seat is near, then “Press E to ride …” with a Ride button that presses the ride key and keeps no focus', () => {
    useExploreRideStore.setState({ active: true, candidates: [candidate] })
    render(<ExploreRidePrompt />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('data-visible', 'false')
    act(() => useExploreRideStore.setState({ nearestId: 'rover' }))
    expect(status).toHaveAttribute('data-visible', 'true')
    expect(status).toHaveTextContent('Mars buggy')
    expect(status).toHaveTextContent('Press E to ride Mars buggy')
    expect(status).toHaveTextContent('Drives with a new Joystick drive program (not saved)')
    const pressRideKey = vi.fn(() => true)
    useExploreRideStore.setState({ pressRideKey })
    const button = screen.getByRole('button', { name: 'Ride' })
    button.focus()
    fireEvent.click(button)
    expect(pressRideKey).toHaveBeenCalledTimes(1)
    // The movement keys must keep working after a click or a tap: no button keeps focus.
    expect(document.activeElement).not.toBe(button)
  })

  it('says why a seat cannot be ridden, and gives the live-room line from the studio', () => {
    useExploreRideStore.setState({ active: true, candidates: [{ ...candidate, status: 'unplugged', program: null }], nearestId: 'rover' })
    const { rerender } = render(<ExploreRidePrompt />)
    expect(screen.getByRole('status')).toHaveTextContent('Its drive motors aren’t plugged in')
    expect(screen.queryByRole('button')).toBeNull()
    act(() => useExploreRideStore.setState({ candidates: [candidate] }))
    rerender(<ExploreRidePrompt liveRoom />)
    expect(useExploreRideStore.getState().liveRoom).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('Riding isn’t available in a shared room yet.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('while riding: Hop off', () => {
    useExploreRideStore.setState({ active: true, candidates: [candidate], riding: 'rover', phase: 'riding' })
    render(<ExploreRidePrompt />)
    expect(screen.getByRole('status')).toHaveTextContent('Riding Mars buggy')
    expect(screen.getByRole('status')).toHaveTextContent('Press E to hop off')
    expect(screen.getByRole('button', { name: 'Hop off' })).toBeInTheDocument()
    act(() => useExploreRideStore.setState({ phase: 'dismounting' }))
    expect(screen.getByRole('status')).toHaveTextContent('Hopping off Mars buggy…')
    expect(screen.queryByRole('button')).toBeNull()
  })
})
