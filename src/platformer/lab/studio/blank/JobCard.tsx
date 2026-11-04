/**
 * The brick card in a game from nothing (docs/qa/blank-2d, boards 3a and 3c): a brick with no code shows "Give Zip a
 * job" instead of an empty Sliders tab; a brick with a job shows it ("Job: Collect", Change) above its sliders.
 */
import { ArrowDownToLine, Car, Code2, Footprints, Goal, Move, PlusCircle, Square, Star, Zap } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { BrickDef } from '../../core/contracts'
import type { StudioStore } from '../store'
import { giveJob, JOB_LINES, jobChoices, JOBS, jobSnaps, PLAYER_WAY_INFO } from './jobs'
import type { JobId, PlayerWay } from './blankRules'

const JOB_ICONS: Readonly<Record<JobId, ReactNode>> = {
  player: <Move size={22} aria-hidden="true" />,
  wall: <Square size={22} aria-hidden="true" />,
  collect: <PlusCircle size={22} aria-hidden="true" />,
  goal: <Goal size={22} aria-hidden="true" />,
  hurts: <Zap size={22} aria-hidden="true" />,
  falls: <ArrowDownToLine size={22} aria-hidden="true" />,
}
const WAY_ICONS: Readonly<Record<PlayerWay, ReactNode>> = {
  walk: <Footprints size={22} aria-hidden="true" />,
  jump: <Star size={22} aria-hidden="true" />,
  drive: <Car size={22} aria-hidden="true" />,
}

/**
 * Board 3a. Tap Player, then a way to move, and the game plays at once: picture to moving in three taps. The other jobs
 * stay in Build. A grid brick (tiles) can't be the player.
 */
export function GiveJob({ store, brick, noCode, onDone, heading = true }: { store: StudioStore; brick: BrickDef; noCode: boolean; onDone?: () => void; heading?: boolean }) {
  const [player, setPlayer] = useState(false)
  const give = (job: JobId, way?: PlayerWay) => {
    giveJob(store, brick.id, job, way)
    onDone?.()
    if (job === 'player') store.setScreen('play')
  }
  const jobs = JOBS.filter((j) => !(j.id === 'player' && brick.grid))
  return (
    <div className="cl-blank-jobs" role="group" aria-label={`Give ${brick.name} a job`}>
      {heading && <div>
        <h3 className="cl-blank-jobs-title">Give {brick.name} a job</h3>
        <p className="cl-muted">{brick.name} doesn’t do anything yet.</p>
      </div>}
      {jobs.map((job) => job.id === 'player'
        ? <div key={job.id} className={`cl-blank-player${player ? ' is-open' : ''}`}>
          <button type="button" className="cl-blank-job is-player" aria-expanded={player} onClick={() => setPlayer(!player)}>
            {JOB_ICONS.player}<span><b>Player</b><small>{job.what}</small></span>
          </button>
          {player && <div className="cl-blank-ways" role="group" aria-label="How does it move?">
            <span className="cl-blank-ways-title">How does it move?</span>
            {PLAYER_WAY_INFO.map((way) => (
              <button key={way.id} type="button" className="cl-blank-way" onClick={() => give('player', way.id)}>
                {WAY_ICONS[way.id]}<span><b>{way.name}</b><small>{way.what}</small></span>
              </button>
            ))}
          </div>}
        </div>
        : null)}
      <div className="cl-blank-jobgrid">
        {jobs.filter((j) => j.id !== 'player').map((job) => (
          <button key={job.id} type="button" className="cl-blank-job" onClick={() => give(job.id)}>
            {JOB_ICONS[job.id]}<span><b>{job.name}</b><small>{job.what}</small></span>
          </button>
        ))}
      </div>
      {!noCode && <button type="button" className="cl-btn cl-btn-primary cl-open-code" onClick={() => store.setScreen('code', brick.id)}>
        <Code2 size={17} aria-hidden="true" /> See inside: write my own
      </button>}
    </div>
  )
}

/** Board 3c: what the brick's jobs are, each with Change (take it off and pick again). */
export function JobChips({ store, brick, noCode }: { store: StudioStore; brick: BrickDef; noCode: boolean }) {
  const [picking, setPicking] = useState(false)
  const jobs = jobSnaps(brick)
  if (picking) return <div className="cl-blank-change">
    <GiveJob store={store} brick={brick} noCode={noCode} heading={false} onDone={() => setPicking(false)} />
    <button type="button" className="cl-link" onClick={() => setPicking(false)}>Keep its jobs</button>
  </div>
  return (
    <div className="cl-blank-chips" role="group" aria-label={`${brick.name}’s jobs`}>
      {jobs.map(({ job, snap }) => (
        <div key={snap.id} className={`cl-blank-chip${store.isPowerOn(brick.id, snap.id) ? '' : ' is-off'}`}>
          {JOB_ICONS[job]}
          <span><b>Job: {snap.name}</b><small>{store.isPowerOn(brick.id, snap.id) ? JOB_LINES[job] : 'Switched off in Code'}</small></span>
          <button type="button" className="cl-link" aria-label={`Change ${brick.name}’s ${snap.name} job`} onClick={() => { store.takeOffPower(brick.id, snap.id); setPicking(true) }}>Change</button>
        </div>
      ))}
      <button type="button" className="cl-link" onClick={() => setPicking(true)}>{jobs.length ? 'Add another job' : 'Give it a job'}</button>
    </div>
  )
}

/** Code's "Start from…" in a game from nothing: a fresh brick starts from a job (lane D). Its blocks appear at once. */
export function JobStarts({ store, brick }: { store: StudioStore; brick: BrickDef }) {
  return (
    <div className="cl-start cl-fade" role="group" aria-label="Start from a job">
      <span>Drag blocks under the hat, or start from a job:</span>
      <div className="cl-row">
        {jobChoices(brick).map((c) => <button key={c.key} type="button" className="cl-chip-btn" title={c.what} onClick={() => giveJob(store, brick.id, c.job, c.way)}>{c.name}</button>)}
      </div>
    </div>
  )
}
