import { CircleCheck, Flag, Focus, Lightbulb, Octagon, PersonStanding, RotateCcw } from 'lucide-react'
import { BeamArrow } from '../drive/BeamArrow'
import type { TryLine, TryVerdict } from '../drive/tryOutcome'
import type { DerivedCreation } from '../model/creations'
import type { ProgramKey } from '../program/types'
import type { RunObservation, RunSpace } from '../run/types'
import { StageInput } from './StageInput'
import { readingChips, stageStatus } from './stageReadings'

/**
 * The stage's controls over the right part of the canvas (the mock's Code board): Run,
 * Stop, the status with its time, Reset, Test plate / My world, the readings the blocks
 * read, the lines that explain what the stage is doing, the inputs, "Someone walks up"
 * when there is a visitor, and the goal line. The 3D canvas behind it is the stage.
 */
export type StagePanelProps = {
  creation: DerivedCreation
  observation: RunObservation | null
  loading: boolean
  space: RunSpace
  hasVisitor: boolean
  showInput: boolean
  /** The program drives with the helpers only: sides running opposite ways are a turn it asked for (see `programTurnsOnPurpose`). */
  turnsOnPurpose?: boolean
  /** Why Run did not start (a compile error), in the student's words. */
  runBlocked: string | null
  /** The saved program is newer than the one running. */
  changed: boolean
  /** Something reset the stage without being asked (an edit). */
  notice: string | null
  goal: string | null
  highlightGoal: boolean
  onRun: () => void
  onStop: () => void
  onReset: () => void
  onSpace: (space: RunSpace) => void
  onVisitor: () => void
  onFrame: () => void
  onJoystick: (up: number, right: number) => void
  onKey: (key: ProgramKey, down: boolean) => void
  /** What the last walk-up said (kid lane Y): it worked, or why not. */
  walkLine?: TryLine | null
  walkVerdict?: TryVerdict | null
  /** Someone is walking up and there is no verdict yet. */
  walking?: boolean
}

export function StagePanel(props: StagePanelProps) {
  const { creation, observation, loading, space, hasVisitor, showInput, runBlocked, changed, notice, goal, highlightGoal } = props
  const status = stageStatus(observation, loading)
  const running = observation?.phase === 'running'
  const chips = readingChips(creation, observation, { turnsOnPurpose: props.turnsOnPurpose })
  const visitorBusy = observation?.visitorPhase === 'arriving' || observation?.visitorPhase === 'here' || observation?.visitorPhase === 'leaving'
  return (
    <section className="robo-code-stage" aria-label="Stage" data-testid="robo-stage">
      <div className="robo-code-stagebar">
        <button type="button" className="robo-run" aria-label="Run" title="Run the program" onClick={props.onRun} disabled={loading && !observation} data-testid="robo-run">
          <Flag size={20} aria-hidden="true" /><span>Run</span>
        </button>
        <button type="button" className="robo-stop" aria-label="Stop" title="Stop: the program ends and every motor brakes" onClick={props.onStop} disabled={!running} data-testid="robo-stop">
          <Octagon size={18} aria-hidden="true" /><span>Stop</span>
        </button>
        <span className={`robo-status ${status.tone}`} role="status" title={status.detail} data-testid="robo-status"><span className="robo-status-dot" aria-hidden="true" />{status.text}</span>
        <span className="robo-spacer" />
        <button type="button" className="robo-button" onClick={props.onReset} disabled={loading && !observation} title="Back to the built pose, program stopped" data-testid="robo-reset">
          <RotateCcw size={15} aria-hidden="true" />Reset
        </button>
        {/* Always a second row: the bar keeps one height whatever the status says. */}
        <span className="robo-break" aria-hidden="true" />
        <div className="robo-seg" role="group" aria-label="Where to test">
          <button type="button" className={space === 'testPlate' ? 'on' : ''} aria-pressed={space === 'testPlate'} onClick={() => props.onSpace('testPlate')}>Test plate</button>
          <button type="button" className={space === 'myWorld' ? 'on' : ''} aria-pressed={space === 'myWorld'} onClick={() => props.onSpace('myWorld')}>My world</button>
        </div>
      </div>
      <div className="robo-code-lines">
        {runBlocked && <p className="robo-line bad" role="alert" data-testid="robo-run-blocked"><strong>Can’t run yet:</strong> {runBlocked}</p>}
        {changed && <p className="robo-line changed" data-testid="robo-changed"><strong>Your code changed.</strong> Press Run to try it.</p>}
        {notice && <p className="robo-line" data-testid="robo-stage-notice">{notice}</p>}
        {props.walkLine
          ? (
            <p className={`robo-line walk ${props.walkLine.tone}`} role="status" data-testid="robo-try-result" data-verdict={props.walkVerdict ?? undefined}>
              {props.walkLine.tone === 'good' && <CircleCheck size={17} aria-hidden="true" />}
              <span>{props.walkLine.text}</span>
              {props.walkLine.pointsAtBeam && <BeamArrow />}
            </p>
          )
          : props.walking && <p className="robo-line walk" role="status" data-testid="robo-try-result">Here they come. Watch the sensor.</p>}
      </div>
      <div className="robo-code-readings" aria-label="Readings" data-testid="robo-readings">
        {chips.map((chip) => (
          <div key={chip.id} className={`robo-read ${chip.tone}`} data-reading={chip.id}>
            <small>{chip.label}</small>
            <strong>{chip.swatch && <span className="robo-swatch" style={{ background: chip.swatch }} aria-hidden="true" />}{chip.value}</strong>
            {chip.detail && <span>{chip.detail}</span>}
          </div>
        ))}
      </div>
      <div className="robo-code-stagefoot">
        <div className="robo-code-stage-actions">
          <button type="button" className="robo-icon-button" aria-label="Frame the creation" title="Frame the creation" onClick={props.onFrame}><Focus size={17} aria-hidden="true" /></button>
          {hasVisitor && (
            <button type="button" className="robo-button robo-visitor" onClick={props.onVisitor} disabled={visitorBusy} data-testid="robo-visitor">
              <PersonStanding size={16} aria-hidden="true" />Someone walks up
            </button>
          )}
        </div>
        {showInput && <StageInput onJoystick={props.onJoystick} onKey={props.onKey} />}
      </div>
      {goal && (
        <footer className={`robo-code-goal${highlightGoal ? ' first-run' : ''}`} data-testid="robo-goal">
          <span className="robo-goal-icon" aria-hidden="true"><Lightbulb size={17} /></span>
          <span>{goal.startsWith('Try it:') ? <><strong>Try it:</strong>{goal.slice('Try it:'.length)}</> : goal}</span>
        </footer>
      )}
    </section>
  )
}
