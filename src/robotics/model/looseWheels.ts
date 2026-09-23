import { rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import type { DeriveInput, DerivedCreation } from './creations'
import { deriveMechanisms, type Mechanisms } from './mechanism'

/**
 * Wheels that can't spin (kid-UX lane W: "wheels never look connected when they are not").
 * A wheel spins only when it sits on an axle whose other end is in a motor's socket; a wheel
 * standing on a plate, lying beside the robot, or on an axle that no motor holds does not,
 * however much it looks like part of a car. Read off the mechanism geometry, like everything
 * the card says; pure.
 *
 * - `wheelSpins` says, for every wheel in the world, whether it spins and what holds it.
 * - `looseWheelsByRobot` gives every wheel that can't spin to the robot it belongs with: the
 *   robot whose axle end it nearly reaches, else the one it stands on or lies within four studs
 *   of (the nearest one when two are that close). A loose wheel far from any robot belongs to
 *   none; the scene still marks it.
 * - `wheelSummary` is the line under the robot's steps: "2 wheels spin. 3 wheels aren't on an axle."
 */
export type WheelSpin = {
  wheelId: string
  /** On an axle whose other end is in a motor: it turns when the motor runs. */
  spins: boolean
  onAxle: boolean
  axleId: string | null
  motorId: string | null
  /** A free axle end nearly reaches it (the red gap marker shows there). */
  nearAxleId: string | null
}

/** A loose wheel this near a robot's bricks (studs between footprints) is that robot's. */
export const LOOSE_NEAR_STUDS = 4

export function wheelSpins(mechanisms: Mechanisms): WheelSpin[] {
  return mechanisms.wheels.map((wheel) => {
    const axle = wheel.axleId ? mechanisms.axleById.get(wheel.axleId) ?? null : null
    const motorId = axle?.ends.find((end) => end.motorId)?.motorId ?? null
    return { wheelId: wheel.wheelId, spins: Boolean(motorId), onAxle: Boolean(axle), axleId: axle?.axleId ?? null, motorId, nearAxleId: wheel.nearest?.axleId ?? null }
  })
}

type Rect = { x0: number; x1: number; z0: number; z1: number }

function footprint(brick: BrickInstance, input: Pick<DeriveInput, 'partMap'>): Rect | null {
  const part = input.partMap[brick.partId]
  if (!part) return null
  const size = rotatedSize(part, brick.rotation)
  return { x0: brick.x, x1: brick.x + size.width, z0: brick.z, z1: brick.z + size.depth }
}

const gapBetween = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1))

/**
 * Every wheel that can't spin, by the robot it belongs with (robot id → wheel ids, in brick order).
 * `creations` are the derived robots; a wheel that spins is never listed.
 */
export function looseWheelsByRobot(input: DeriveInput, creations: readonly Pick<DerivedCreation, 'id' | 'brickIds'>[], mechanisms: Mechanisms = deriveMechanisms(input.bricks, input.partMap, input.plateSize)): Map<string, string[]> {
  const byId = new Map(input.bricks.map((brick) => [brick.id, brick]))
  const owners = new Map<string, string>()
  for (const creation of creations) for (const id of creation.brickIds) if (!owners.has(id)) owners.set(id, creation.id)
  const result = new Map<string, string[]>(creations.map((creation) => [creation.id, []]))
  const rects = creations.map((creation) => ({ id: creation.id, rects: creation.brickIds.map((id) => byId.get(id)).filter((brick): brick is BrickInstance => Boolean(brick)).map((brick) => footprint(brick, input)).filter((rect): rect is Rect => Boolean(rect)) }))
  for (const wheel of wheelSpins(mechanisms)) {
    if (wheel.spins) continue
    const brick = byId.get(wheel.wheelId)
    const own = brick ? footprint(brick, input) : null
    if (!brick || !own || owners.has(wheel.wheelId)) continue
    // Nearly on one of a robot's axles: that robot's (the card lists it beside its other wheels).
    const nearOwner = wheel.nearAxleId ? owners.get(wheel.nearAxleId) ?? null : null
    let best: { id: string; gap: number } | null = nearOwner ? { id: nearOwner, gap: -1 } : null
    if (!best) {
      for (const robot of rects) {
        for (const rect of robot.rects) {
          const gap = gapBetween(own, rect)
          if (gap <= LOOSE_NEAR_STUDS && (!best || gap < best.gap)) best = { id: robot.id, gap }
        }
      }
    }
    if (best) result.get(best.id)?.push(wheel.wheelId)
  }
  return result
}

/** The robot's wheels that spin: on an axle held by one of its motors. */
export function spinningWheelIds(creation: Pick<DerivedCreation, 'wheels'>): string[] {
  return creation.wheels.filter((wheel) => wheel.onAxle && wheel.motorId).map((wheel) => wheel.brickId)
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * "2 wheels spin. 3 wheels aren't on an axle." In a third grader's words: a wheel on an axle with
 * no motor "can't spin yet"; `driving` adds that the loose ones stay behind when the robot drives.
 */
export function wheelSummary(spinning: number, loose: readonly Pick<WheelSpin, 'onAxle'>[], driving = false): string {
  const parts: string[] = []
  if (spinning > 0) parts.push(`${count(spinning, 'wheel spins', 'wheels spin')}.`)
  const offAxle = loose.every((wheel) => !wheel.onAxle)
  if (loose.length) parts.push(offAxle ? `${count(loose.length, 'wheel isn\'t', 'wheels aren\'t')} on an axle.` : `${count(loose.length, 'wheel can\'t', 'wheels can\'t')} spin yet.`)
  if (loose.length && driving) parts.push(loose.length === 1 ? 'It stays here when you drive.' : 'They stay here when you drive.')
  return parts.join(' ')
}
