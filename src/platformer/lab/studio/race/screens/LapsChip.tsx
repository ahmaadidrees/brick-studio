import { useMemo } from 'react'
import { computeRaceLoop, RACE_LOOP_REASON_TEXT } from '../../../core/race'
import type { BrickDef, TileLayer } from '../../../core/contracts'
import { useStudio, type StudioStore } from '../../store'
import './race.css'

export const LAPS_WORK = 'Laps work'

/**
 * Whether laps can count on this track, in the kid's words: "Laps work", or why not (core/race.ts's three reasons).
 * Worked out from the saved design the way Play will, so it changes as the kid paints or turns the finish arrow.
 */
export function lapsStatus(tiles: TileLayer | undefined, bricks: readonly BrickDef[]): { ok: boolean; text: string } {
  const loop = computeRaceLoop(tiles, bricks)
  return loop.ok ? { ok: true, text: LAPS_WORK } : { ok: false, text: RACE_LOOP_REASON_TEXT[loop.reason] }
}

/** Build's chip saying whether the track laps (kitParts.tsx puts it over the level in Build). */
export function LapsChip({ store }: { store: StudioStore }) {
  const tiles = useStudio(store, (s) => s.project.design.tiles)
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const status = useMemo(() => lapsStatus(tiles, bricks), [tiles, bricks])
  return (
    <span className="rc-laps" data-ok={status.ok ? 'yes' : 'no'} role="status" aria-live="polite">
      <span className="rc-laps-dot" aria-hidden="true">{status.ok ? '✓' : '!'}</span>
      {status.text}
    </span>
  )
}
