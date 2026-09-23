import { Armchair } from 'lucide-react'
import { requestExploreMode } from '../../brick/modeCommands'
import { readiness } from '../drive/readiness'
import type { DerivedCreation } from '../model/creations'
import { clearRideRequest, requestRide } from './rideRequest'
import './explore.css'

/**
 * "Ride it in Explore" in the robot panel (a novice tester's own ask): shown for a robot with a
 * seat that is ready to drive, outside a shared room (riding is off there). One click opens
 * Explore with the student already on the seat.
 */
export function RideInExploreButton({ creation, live }: { creation: DerivedCreation; live: boolean }) {
  const status = readiness(creation)
  if (live || !creation.seats.length || !status.ready || status.kind !== 'drive') return null
  const ride = () => {
    requestRide(creation.id)
    if (!requestExploreMode()) clearRideRequest()
  }
  return (
    <button type="button" className="robotics-big-button robotics-ride-button" onClick={ride} data-testid="robotics-ride-button">
      <Armchair size={21} aria-hidden="true" />
      Ride it in Explore
    </button>
  )
}
