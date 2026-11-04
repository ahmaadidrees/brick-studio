import { Minus, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { computeRaceLoop, RACE_LOOP_REASON_TEXT } from '../../../core/race'
import type { BrickDef, TileLayer } from '../../../core/contracts'
import { RACE_GLOBALS } from '../carBrick'
import { STAGE_ID, useStudio, type StudioStore } from '../../store'
import './race.css'

/** Laps −/+ in Build, like the classic race kit: 1 to 9. */
export const MIN_LAPS = 1
export const MAX_LAPS = 9

export const LAPS_WORK = 'Laps work'

/**
 * Whether laps can count on this track, in the kid's words: "Laps work", or why not (core/race.ts's three reasons).
 * Worked out from the saved design the way Play will, so it changes as the kid paints or turns the finish arrow.
 */
export function lapsStatus(tiles: TileLayer | undefined, bricks: readonly BrickDef[]): { ok: boolean; text: string } {
  const loop = computeRaceLoop(tiles, bricks)
  return loop.ok ? { ok: true, text: LAPS_WORK } : { ok: false, text: RACE_LOOP_REASON_TEXT[loop.reason] }
}

/**
 * Build's chip saying whether the track laps (kitParts.tsx puts it over the level in Build), and how many laps a race
 * is: − and + set the Stage's "laps to win" (before parity bucket A only its code or a slider could).
 */
export function LapsChip({ store }: { store: StudioStore }) {
  const tiles = useStudio(store, (s) => s.project.design.tiles)
  const bricks = useStudio(store, (s) => s.project.design.bricks)
  const lapsVar = useStudio(store, (s) => s.project.design.stage.program.variables.find((v) => v.id === RACE_GLOBALS.lapsToWin))
  const status = useMemo(() => lapsStatus(tiles, bricks), [tiles, bricks])
  const laps = lapsVar && Number.isFinite(Number(lapsVar.value)) ? Math.round(Number(lapsVar.value)) : null
  const setLaps = (n: number) => store.setBrickSlider(STAGE_ID, RACE_GLOBALS.lapsToWin, Math.max(MIN_LAPS, Math.min(MAX_LAPS, n)))
  return (
    <div className="rc-laps" data-ok={status.ok ? 'yes' : 'no'}>
      <span className="rc-laps-status" data-ok={status.ok ? 'yes' : 'no'} role="status" aria-live="polite">
        <span className="rc-laps-dot" aria-hidden="true">{status.ok ? '✓' : '!'}</span>
        {status.text}
      </span>
      {laps !== null && (
        <span className="rc-laps-count" role="group" aria-label="Laps in a race">
          <button type="button" aria-label="Fewer laps" disabled={laps <= MIN_LAPS} onClick={() => setLaps(laps - 1)}><Minus size={14} aria-hidden="true" /></button>
          <b aria-live="polite">{laps === 1 ? '1 lap' : `${laps} laps`}</b>
          <button type="button" aria-label="More laps" disabled={laps >= MAX_LAPS} onClick={() => setLaps(laps + 1)}><Plus size={14} aria-hidden="true" /></button>
        </span>
      )}
    </div>
  )
}
