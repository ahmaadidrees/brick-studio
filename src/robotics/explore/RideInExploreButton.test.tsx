import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { fixtureDocument } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import { computeModel } from '../state/roboticsStore'
import { RideInExploreButton } from './RideInExploreButton'
import { RIDE_CREATION_ID, SEAT_ID, seatedRoverBricks, seatedRoverSection } from './rideFixtures'
import { clearRideRequest, takeRideRequest } from './rideRequest'

/** The robot panel's "Ride it in Explore", with the robot as the studio derives it. */
beforeAll(() => installRoboticsParts(true))
beforeEach(() => {
  clearRideRequest()
  useBrickStore.getState().newBuild()
})
afterEach(() => {
  cleanup()
  clearRideRequest()
})

function robot(bricks = seatedRoverBricks(), section = seatedRoverSection()) {
  expect(useBrickStore.getState().restoreDocument(fixtureDocument(bricks, section)).ok).toBe(true)
  useBrickStore.setState({ mode: 'build' })
  return computeModel(useBrickStore.getState()).creations.find((creation) => creation.id === RIDE_CREATION_ID)!
}

describe('Ride it in Explore', () => {
  it('a ready robot with a seat: one click opens Explore and asks for the ride', () => {
    render(<RideInExploreButton creation={robot()} live={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ride it in Explore' }))
    expect(useBrickStore.getState().mode).toBe('explore')
    expect(takeRideRequest()).toBe(RIDE_CREATION_ID)
  })

  it('not shown without a seat, when it cannot drive yet, or in a shared world', () => {
    const { rerender } = render(<RideInExploreButton creation={robot(seatedRoverBricks().filter((brick) => brick.id !== SEAT_ID))} live={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<RideInExploreButton creation={robot(seatedRoverBricks(), seatedRoverSection({ connections: [] }))} live={false} />)
    expect(screen.queryByRole('button')).toBeNull()
    rerender(<RideInExploreButton creation={robot()} live />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
