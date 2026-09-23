import { useRoboticsStore } from '../state/roboticsStore'
import { setWiringMode } from './actions'
import './wiring.css'

/**
 * The project's wiring mode (contract §5: "Wiring: assisted (default) / manual", shown
 * in the creation card and in Code). Assisted plugs a placed device into the first free
 * port; manual leaves it for the student to plug in from its panel. Switching is an
 * undoable edit like any other wiring change.
 */
export function WiringModeToggle() {
  const mode = useRoboticsStore((state) => state.model.section.settings.wiring)
  return (
    <div className="robotics-space wiring-mode" role="group" aria-label="Wiring" data-testid="wiring-mode">
      <span>Wiring</span>
      <button type="button" className={`robotics-chip${mode === 'assisted' ? ' active' : ''}`} aria-pressed={mode === 'assisted'} onClick={() => setWiringMode('assisted')}>assisted</button>
      <button type="button" className={`robotics-chip${mode === 'manual' ? ' active' : ''}`} aria-pressed={mode === 'manual'} onClick={() => setWiringMode('manual')}>manual</button>
    </div>
  )
}
