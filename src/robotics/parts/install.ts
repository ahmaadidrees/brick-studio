import { registerPartGeometryBuilder } from '../../brick/geometry'
import { registerExtensionParts } from '../../brick/parts'
import { isRoboticsPrototypeEnabled } from '../flag'
import { ROBOTICS_PARTS } from './catalog'
import { ROBOTICS_GEOMETRY_BUILDERS } from './geometry'

let installed = false

/**
 * Registers the robotics parts with the studio's part library and renderer. Safe to
 * call more than once; a no-op unless the prototype flag is on (so importing this
 * module never changes an unflagged studio).
 */
export function installRoboticsParts(force = false): boolean {
  if (installed) return true
  if (!force && !isRoboticsPrototypeEnabled()) return false
  registerExtensionParts(ROBOTICS_PARTS)
  for (const [partId, builder] of Object.entries(ROBOTICS_GEOMETRY_BUILDERS)) registerPartGeometryBuilder(partId, builder)
  installed = true
  return true
}

export const roboticsPartsInstalled = () => installed
