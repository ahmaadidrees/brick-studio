import { useMemo } from 'react'
import { fixWheel, removePart } from '../guide/fixes'
import type { DerivedCreation } from '../model/creations'
import { planWheelFix } from '../model/fixPlans'
import { looseWheelsByRobot, spinningWheelIds, wheelSpins, wheelSummary, type WheelSpin } from '../model/looseWheels'
import { deriveMechanisms } from '../model/mechanism'
import { useRoboticsStore, type RoboticsModel } from '../state/roboticsStore'

/**
 * Loose wheels in the robot panel (kid-UX lane W): under the steps (right under "Ready to drive!"
 * once the robot can drive), "2 wheels spin. 3 wheels aren't on an axle." and, for each wheel that
 * can't spin, its number (the same number the scene shows on the wheel), a Fix button (the one-tap
 * fix: onto an axle end, onto a waiting motor, or a new motor and axle for it) and Take it off.
 * Drive stays on: the loose wheels stay behind in the build when the robot drives, and the line
 * says so before the student presses Drive.
 */
export type LooseWheel = WheelSpin & { number: number; label: string }

/** The robot's loose wheels, numbered as the scene numbers them, each with what its Fix button does. */
export function looseWheelsOf(model: Pick<RoboticsModel, 'input' | 'creations'>, creation: DerivedCreation): LooseWheel[] {
  const { input } = model
  const mechanisms = deriveMechanisms(input.bricks, input.partMap, input.plateSize)
  const ids = looseWheelsByRobot(input, model.creations, mechanisms).get(creation.id) ?? []
  const spins = new Map(wheelSpins(mechanisms).map((wheel) => [wheel.wheelId, wheel]))
  return ids.map((id, index) => {
    const fix = planWheelFix(input, id, mechanisms)
    return { ...spins.get(id)!, number: index + 1, label: fix.ok ? fix.label : 'Fix it' }
  })
}

export function useLooseWheels(creation: DerivedCreation): LooseWheel[] {
  const model = useRoboticsStore((state) => state.model)
  return useMemo(() => looseWheelsOf(model, creation), [model, creation])
}

/** One loose wheel: its number, Fix and Take it off (44 px targets). */
export function LooseWheelRow({ wheel, only }: { wheel: LooseWheel; only: boolean }) {
  const name = only ? 'the wheel' : `wheel ${wheel.number}`
  return (
    <li className="robotics-loose-row" data-brick-id={wheel.wheelId} data-testid="robotics-loose-wheel">
      {!only && <span className="robotics-loose-number" aria-hidden="true">{wheel.number}</span>}
      <button type="button" className="robotics-loose-fix" onClick={() => fixWheel(wheel.wheelId)} title={wheel.label} aria-label={`Fix ${name}: ${wheel.label}`}>
        {only ? 'Fix it' : `Fix wheel ${wheel.number}`}
      </button>
      <button type="button" className="robotics-loose-remove" onClick={() => removePart(wheel.wheelId)} aria-label={`Take ${name} off`}>Take it off</button>
    </li>
  )
}

/** "2 wheels spin. 3 wheels aren't on an axle." and a row per loose wheel. Nothing when every wheel spins. */
export function LooseWheels({ creation, ready }: { creation: DerivedCreation; ready: boolean }) {
  const loose = useLooseWheels(creation)
  if (!loose.length) return null
  const spinning = spinningWheelIds(creation).length
  return (
    <section className="robotics-loose" aria-label="Loose wheels" data-testid="robotics-loose-wheels">
      <p className="robotics-loose-line" data-testid="robotics-loose-line">{wheelSummary(spinning, loose, ready)}</p>
      <ul className="robotics-loose-list">
        {loose.map((wheel) => <LooseWheelRow key={wheel.wheelId} wheel={wheel} only={loose.length === 1} />)}
      </ul>
    </section>
  )
}
