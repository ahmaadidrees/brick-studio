import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrickStore } from '../../brick/store'
import ExploreRidePrompt from './ExploreRidePrompt'
import { SEAT_ID } from './rideFixtures'
import { resetExploreRideForTests, useExploreRideStore } from './rideStore'

/** The ride card as the studio mounts it in the Explore HUD, driven by the ride store's state. */
const candidate = { creationId: 'rover', name: 'Buggy', status: 'rideable' as const, seatIds: [SEAT_ID], program: { source: 'starter' as const, name: 'Joystick drive' } }

/** A touch screen, as the card asks (`(pointer: coarse)`); jsdom has no matchMedia of its own. */
function touchScreen(coarse: boolean) {
  const matchMedia = (query: string) => ({ matches: coarse && query === '(pointer: coarse)', media: query, addEventListener: () => {}, removeEventListener: () => {} })
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia })
}

beforeEach(() => {
  resetExploreRideForTests()
  useBrickStore.setState({ exploreKeyboardMode: 'standard' })
})
afterEach(() => {
  cleanup()
  resetExploreRideForTests()
  delete (window as { matchMedia?: unknown }).matchMedia
})

describe('the ride card', () => {
  it('shows nothing until a seat is near, then “Press E to ride …” with a Ride button that presses the ride key and keeps no focus', () => {
    useExploreRideStore.setState({ active: true, candidates: [candidate] })
    render(<ExploreRidePrompt />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('data-visible', 'false')
    act(() => useExploreRideStore.setState({ nearestId: 'rover' }))
    expect(status).toHaveAttribute('data-visible', 'true')
    expect(status).toHaveTextContent('Buggy')
    expect(status).toHaveTextContent('Press E to ride Buggy')
    // The program made on the fly is how riding works, not something to read about.
    expect(status).not.toHaveTextContent(/program|not saved|Joystick drive/)
    const pressRideKey = vi.fn(() => true)
    useExploreRideStore.setState({ pressRideKey })
    const button = screen.getByRole('button', { name: 'Ride' })
    button.focus()
    fireEvent.click(button)
    expect(pressRideKey).toHaveBeenCalledTimes(1)
    // The movement keys must keep working after a click or a tap: no button keeps focus.
    expect(document.activeElement).not.toBe(button)
  })

  it('says what to do when a seat cannot be ridden, and gives the live-room line from the studio', () => {
    useExploreRideStore.setState({ active: true, candidates: [{ ...candidate, status: 'unplugged', program: null }], nearestId: 'rover' })
    const { rerender } = render(<ExploreRidePrompt />)
    expect(screen.getByRole('status')).toHaveTextContent('Plug its motors into the hub to ride it.')
    expect(screen.queryByRole('button')).toBeNull()
    act(() => useExploreRideStore.setState({ candidates: [candidate] }))
    rerender(<ExploreRidePrompt liveRoom />)
    expect(useExploreRideStore.getState().liveRoom).toBe(true)
    expect(screen.getByRole('status')).toHaveTextContent('Riding is off in a shared world for now.')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('while riding: “Riding Buggy”, which keys drive (the keyboard setting), Hop off', () => {
    useExploreRideStore.setState({ active: true, candidates: [candidate], riding: 'rover', phase: 'riding' })
    render(<ExploreRidePrompt />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Riding Buggy')
    expect(status).toHaveTextContent('Drive with the arrow keys or WASD.')
    expect(status).toHaveTextContent('Press E to hop off')
    expect(status).not.toHaveTextContent(/program|not saved|Joystick drive|reads/)
    expect(screen.getByRole('button', { name: 'Hop off' })).toBeInTheDocument()
    // The arrows are set to turn the camera: WASD drives.
    act(() => useBrickStore.setState({ exploreKeyboardMode: 'arrow-camera' }))
    expect(status).toHaveTextContent('Drive with the WASD keys.')
    // Sent back to the start: the rider is still riding, and the card says so for a while.
    act(() => useExploreRideStore.setState({ notice: { text: 'Back to the start!', nonce: 1 } }))
    expect(status).toHaveTextContent('Riding Buggy')
    expect(status).toHaveTextContent('Back to the start!')
    expect(screen.getByRole('button', { name: 'Hop off' })).toBeInTheDocument()
    act(() => useExploreRideStore.setState({ notice: null, phase: 'dismounting' }))
    expect(status).toHaveTextContent('Hopping off Buggy…')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('on a touch screen the stick drives', () => {
    touchScreen(true)
    useExploreRideStore.setState({ active: true, candidates: [candidate], riding: 'rover', phase: 'riding' })
    render(<ExploreRidePrompt />)
    expect(screen.getByRole('status')).toHaveTextContent('Drive with the stick.')
    expect(screen.getByRole('button', { name: 'Hop off' })).toBeInTheDocument()
  })
})
