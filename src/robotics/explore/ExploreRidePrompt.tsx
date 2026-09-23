import { useEffect, type MouseEvent } from 'react'
import { Button } from '../../ui'
import { ridePrompt, type RidePromptInput } from './rideModel'
import { liveRide, useExploreRideStore, type ExploreRideState } from './rideStore'
import './explore.css'

/**
 * The ride prompt in the Explore HUD (checkpoint 4): "Press E to ride Mars buggy" with a
 * Ride button for touch, "Riding Mars buggy · Press E to hop off" with a Hop off button,
 * why a creation with a seat cannot be ridden, the one line for a live room, and a short
 * notice when a ride went back to where it was built. `liveRoom` comes from the studio
 * (it knows whether this Explore is a shared room). Polite live region; the buttons never
 * keep focus, so the movement keys keep working after a tap or a click.
 */
export default function ExploreRidePrompt({ liveRoom = false }: { liveRoom?: boolean }) {
  useEffect(() => { useExploreRideStore.getState().setLiveRoom(liveRoom) }, [liveRoom])
  const prompt = useExploreRideStore((state) => JSON.stringify(ridePrompt(promptInput(state))))
  const view = JSON.parse(prompt) as ReturnType<typeof ridePrompt>
  const press = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur()
    useExploreRideStore.getState().pressRideKey()
  }
  return (
    <div className="explore-ride-prompt" role="status" aria-live="polite" data-visible={view ? 'true' : 'false'} data-state={view?.state ?? 'none'}>
      {view && (
        <>
          <span className="explore-ride-prompt-text">
            <strong className="explore-ride-prompt-label">{view.label}</strong>
            {view.detail && <span className="explore-ride-prompt-detail">{view.detail}</span>}
            {view.action && <span className="explore-ride-prompt-hint">Press <kbd>{view.action.key}</kbd> to {view.action.phrase}</span>}
          </span>
          {view.action && (
            <Button variant={view.state === 'riding' ? 'secondary' : 'primary'} size="sm" className="explore-ride-prompt-button" onMouseDown={(event) => event.preventDefault()} onClick={press}>
              {view.action.button}
            </Button>
          )}
        </>
      )}
    </div>
  )
}

export function promptInput(state: ExploreRideState): RidePromptInput {
  const ride = state.riding ? liveRide(state.riding) : null
  const candidate = state.riding ? state.candidates.find((entry) => entry.creationId === state.riding) : null
  return {
    active: state.active,
    liveRoom: state.liveRoom,
    riding: state.riding
      ? { name: ride?.name ?? candidate?.name ?? 'your creation', program: ride?.program ? { source: ride.program.source, name: ride.program.name } : null, stopped: state.programStopped }
      : null,
    dismounting: state.phase === 'dismounting',
    near: state.phase === 'walking' && state.nearestId ? state.candidates.find((entry) => entry.creationId === state.nearestId) ?? null : null,
    notice: state.notice?.text ?? null,
  }
}
