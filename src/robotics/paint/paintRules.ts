import { BRICK_COLORS } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import type { DerivedCreation } from '../model/creations'
import { roboticsSpec, type RoboticsPartRole } from '../parts/catalog'

/**
 * What painting a robot means, without any store (lane P): the colours' names, which of a
 * robot's bricks "Paint all" paints, and whether a robot looks painted. `paint.ts` does the
 * painting; the next-steps guide reads `robotLooksPainted` for its "Paint it" idea.
 */

/** The studio's twelve colours in a third grader's words (for the chips' names, the bar and Undo). */
const COLOR_NAMES: Readonly<Record<string, string>> = {
  '#e7473c': 'red',
  '#ef8d32': 'orange',
  '#f4ca3a': 'yellow',
  '#65b85a': 'green',
  '#2eaa9d': 'teal',
  '#3e83d7': 'blue',
  '#6857d9': 'purple',
  '#d765ae': 'pink',
  '#f5eee0': 'white',
  '#a9b7bd': 'gray',
  '#52636c': 'dark gray',
  '#7b5238': 'brown',
}

/** A colour's name, or null for one picked with "Any color". */
export function colorName(color: string): string | null {
  return COLOR_NAMES[color.toLowerCase()] ?? null
}

export const PAINT_COLORS: readonly string[] = BRICK_COLORS

export const sameColor = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * The parts "Paint all" leaves as they are, because their colour says what they do: black tyres,
 * gray axle rods, the sensor's yellow eyes, the light and the button. Everything else of the
 * robot is painted: its plain bricks and plates, and also its hub, motors, hinge motor and seat,
 * because on a Buggy those are the car (its only plain brick is the plate underneath).
 */
const KEEPS_ITS_COLOR: ReadonlySet<RoboticsPartRole> = new Set<RoboticsPartRole>(['wheel', 'axle', 'distance-sensor', 'light', 'button'])

/** True for a part whose colour says what it does (a wheel, an axle, a sensor, a light, a button). */
export function keepsItsColor(partId: string): boolean {
  const role = roboticsSpec(partId)?.role
  return Boolean(role && KEEPS_ITS_COLOR.has(role))
}

/** The robot's bricks "Paint all" paints (pure). */
export function robotPaintTargets(creation: Pick<DerivedCreation, 'brickIds'>, bricks: readonly BrickInstance[]): string[] {
  const members = new Set(creation.brickIds)
  return bricks.filter((brick) => {
    if (!members.has(brick.id)) return false
    const role = roboticsSpec(brick.partId)?.role
    return !role || !KEEPS_ITS_COLOR.has(role)
  }).map((brick) => brick.id)
}

/** The parts of a robot whose own colour is known (its hub, motors, hinge motor, seat): one of them repainted means it was painted. */
const BODY_ROLES: ReadonlySet<RoboticsPartRole> = new Set<RoboticsPartRole>(['hub', 'motor', 'hinge-motor', 'seat'])

/** True once one of the robot's body parts wears a colour that is not its own (pure; the "Paint it" idea's tick). */
export function robotLooksPainted(creation: Pick<DerivedCreation, 'brickIds'>, bricks: readonly BrickInstance[]): boolean {
  const members = new Set(creation.brickIds)
  return bricks.some((brick) => {
    if (!members.has(brick.id)) return false
    const spec = roboticsSpec(brick.partId)
    return Boolean(spec && BODY_ROLES.has(spec.role) && spec.part.defaultColor && !sameColor(spec.part.defaultColor, brick.color))
  })
}
