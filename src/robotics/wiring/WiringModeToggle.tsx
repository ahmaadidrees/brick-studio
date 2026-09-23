import { useRoboticsStore } from '../state/roboticsStore'
import { setWiringMode } from './actions'
import './wiring.css'

/**
 * The project's wiring mode (contract §5: "Wiring: assisted (default) / manual", shown
 * in the robot panel's More and in Code), in a third grader's words (lane P): "Plug in by
 * itself: On / Off". On plugs a placed device into the first free port; off leaves it for
 * the student to plug in from its panel. Switching is an undoable edit like any other
 * wiring change.
 */
export function WiringModeToggle() {
  const mode = useRoboticsStore((state) => state.model.section.settings.wiring)
  return (
    <div className="robotics-space wiring-mode" role="group" aria-label="Plug in by itself" data-testid="wiring-mode">
      <span>Plug in by itself</span>
      <button type="button" className={`robotics-chip${mode === 'assisted' ? ' active' : ''}`} aria-pressed={mode === 'assisted'} onClick={() => setWiringMode('assisted')}>On</button>
      <button type="button" className={`robotics-chip${mode === 'manual' ? ' active' : ''}`} aria-pressed={mode === 'manual'} onClick={() => setWiringMode('manual')}>Off</button>
    </div>
  )
}
