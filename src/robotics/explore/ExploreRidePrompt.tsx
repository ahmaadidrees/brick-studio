import { useEffect, useState, type MouseEvent } from 'react'
import { useBrickStore } from '../../brick/store'
import { Button } from '../../ui'
import { ridePrompt, type RideKeyboardMode, type RidePromptInput } from './rideModel'
import { liveRide, useExploreRideStore, type ExploreRideState } from './rideStore'
import './explore.css'

/**
 * The ride card in the Explore HUD (checkpoint 4, worded for a third grader in the kid-UX pass):
 * "Buggy · Press E to ride Buggy" with a Ride button for touch; "Riding Buggy · Drive with the
 * arrow keys or WASD. · Press E to hop off" with a Hop off button ("Drive with the stick." on a
 * touch screen, "Using your code: …" when the student's own program drives it); why a robot with
 * a seat cannot be ridden; the one line for a live room; and a short notice ("Back to the start!").
 * `liveRoom` comes from the studio (it knows whether this Explore is a shared room). Polite live
 * region; the buttons never keep focus, so the movement keys keep working after a tap or a click.
 */
export default function ExploreRidePrompt({ liveRoom = false }: { liveRoom?: boolean }) {
  useEffect(() => { useExploreRideStore.getState().setLiveRoom(liveRoom) }, [liveRoom])
  const touch = useCoarsePointer()
  const keys = useBrickStore((state) => state.exploreKeyboardMode)
  const prompt = useExploreRideStore((state) => JSON.stringify(ridePrompt(promptInput(state, { touch, keys }))))
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
            {view.code && <span className="explore-ride-prompt-code">{view.code}</span>}
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

/** A touch screen (the same test as the card's touch layout in explore.css): the stick drives, there is no E key. */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(() => (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches) || false)
  useEffect(() => {
    const query = window.matchMedia?.('(pointer: coarse)')
    if (!query) return
    const update = () => setCoarse(query.matches)
    update()
    query.addEventListener?.('change', update)
    return () => query.removeEventListener?.('change', update)
  }, [])
  return coarse
}

export function promptInput(state: ExploreRideState, device: { touch?: boolean; keys?: RideKeyboardMode } = {}): RidePromptInput {
  const ride = state.riding ? liveRide(state.riding) : null
  const candidate = state.riding ? state.candidates.find((entry) => entry.creationId === state.riding) : null
  return {
    active: state.active,
    liveRoom: state.liveRoom,
    riding: state.riding
      ? { name: ride?.name ?? candidate?.name ?? 'your robot', program: ride?.program ? { source: ride.program.source, name: ride.program.name } : null, stopped: state.programStopped }
      : null,
    dismounting: state.phase === 'dismounting',
    near: state.phase === 'walking' && state.nearestId ? state.candidates.find((entry) => entry.creationId === state.nearestId) ?? null : null,
    notice: state.notice?.text ?? null,
    touch: device.touch ?? false,
    keys: device.keys ?? 'standard',
  }
}
