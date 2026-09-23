import type { BrickInstance } from '../../brick/types'
import type { PartMap } from '../model/grid'
import { createSnapContext, type SnapContext } from '../model/snap'

/**
 * One snap context per document state, shared by the snapper (asked on every pointer
 * move) and the target markers, so what glows and what snaps are the same list. A move
 * hands over a freshly filtered brick list on every call, so bricks are compared item by
 * item rather than by array identity.
 */
let cached: SnapContext | null = null

const sameBricks = (a: readonly BrickInstance[], b: readonly BrickInstance[]) => a === b || (a.length === b.length && a.every((brick, index) => brick === b[index]))

export function sharedSnapContext(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): SnapContext {
  if (cached && cached.partMap === partMap && cached.plateSize === plateSize && sameBricks(cached.bricks, bricks)) return cached
  cached = createSnapContext(bricks, partMap, plateSize)
  return cached
}
