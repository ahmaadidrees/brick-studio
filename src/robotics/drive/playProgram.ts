import { chooseRideProgram } from '../explore/rideModel'
import type { DerivedCreation } from '../model/creations'
import type { RoboticsSection } from '../model/section'
import { compileContextFor, compileProgram } from '../program/compile'
import { activeProgramOf, programsOf } from '../program/programs'
import { defaultStarterFor } from '../program/starters'
import type { Expr, ProgramIR, RoboticsProgram, Stmt } from '../program/types'
import type { PlayKind } from './readiness'

/**
 * Which program Drive or Try it runs (docs/robotics/KID-UX.md §D). Pure: it reads the
 * document's programs and never writes one, so pressing Drive saves nothing.
 *
 * - **Drive** runs what a ride in Explore runs (`chooseRideProgram`): the robot's own program
 *   that reads the joystick, if one compiles, else a Joystick drive program made on the fly.
 * - **Try it** runs the robot's own program that reacts to its sensor, if one compiles (the
 *   active program first, then the others in the order they were made), else its starter
 *   (Smart gate, Signal post) made on the fly.
 */
export type PlayProgramChoice = {
  kind: PlayKind
  source: 'saved' | 'starter'
  /** The program's name, or the starter's. */
  name: string
  /** The saved program, when it runs one. */
  programId: string | null
  ir: ProgramIR
}

export function choosePlayProgram(kind: PlayKind, section: RoboticsSection, creation: DerivedCreation, worldBrickIds?: ReadonlySet<string>): PlayProgramChoice | null {
  if (kind === 'drive') {
    const ride = chooseRideProgram(section, creation, worldBrickIds)
    return ride ? { kind, source: ride.source, name: ride.name, programId: ride.programId, ir: ride.ir } : null
  }
  return chooseTryProgram(section, creation, worldBrickIds)
}

export function chooseTryProgram(section: RoboticsSection, creation: DerivedCreation, worldBrickIds?: ReadonlySet<string>): PlayProgramChoice | null {
  const active = activeProgramOf(section, creation.id)
  const ordered: RoboticsProgram[] = active ? [active, ...programsOf(section, creation.id).filter((program) => program.id !== active.id)] : []
  for (const program of ordered) {
    const compiled = compileProgram(program.workspace, compileContextFor(creation, program, worldBrickIds))
    if (compiled.ok && readsSensor(compiled.ir)) return { kind: 'try', source: 'saved', name: program.name, programId: program.id, ir: compiled.ir }
  }
  const starter = defaultStarterFor(creation)
  if (starter.id === 'blank') return null
  const compiled = compileProgram(starter.workspace, compileContextFor(creation, null, worldBrickIds))
  if (!compiled.ok || !readsSensor(compiled.ir)) return null
  return { kind: 'try', source: 'starter', name: starter.name, programId: null, ir: compiled.ir }
}

/** The program reacts to a sensor: a `when … sees something` script, or a block anywhere that reads one. */
export function readsSensor(ir: ProgramIR): boolean {
  return ir.scripts.some((script) => script.trigger.kind === 'sensorSees' || script.body.some(statementReadsSensor))
}

function statementReadsSensor(statement: Stmt): boolean {
  switch (statement.op) {
    case 'runMotor': return exprReadsSensor(statement.percent)
    case 'turnMotorTo': return exprReadsSensor(statement.degrees)
    case 'wait': return exprReadsSensor(statement.seconds)
    case 'waitUntil': return exprReadsSensor(statement.condition)
    case 'repeat': return exprReadsSensor(statement.count) || statement.body.some(statementReadsSensor)
    case 'forever': return statement.body.some(statementReadsSensor)
    case 'if': return exprReadsSensor(statement.condition) || statement.then.some(statementReadsSensor) || Boolean(statement.else?.some(statementReadsSensor))
    case 'setVariable': return exprReadsSensor(statement.value)
    case 'changeVariable': return exprReadsSensor(statement.by)
    default: return false
  }
}

function exprReadsSensor(expr: Expr): boolean {
  switch (expr.kind) {
    case 'sensorDistance': return true
    case 'sensorSees': return true
    case 'binary': return exprReadsSensor(expr.left) || exprReadsSensor(expr.right)
    case 'not': return exprReadsSensor(expr.operand)
    default: return false
  }
}
