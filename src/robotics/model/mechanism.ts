import type { BrickInstance } from '../../brick/types'
import { roboticsSpec } from '../parts/catalog'
import { armNode } from './assembly'
import { brickFrame, toWorldDirection, toWorldPoint, type PartMap } from './grid'
import { add, distance, parallel, sameDirection, samePoint, scale, sub, type Vec3 } from './vec'

/**
 * Mechanism (contract §2, "Can it move?"): motor output → axle, axle → wheel, and
 * the hinge between a base body and an arm body. Every link is read off the
 * geometry the parts carry (`parts/catalog.ts`): an axle end that touches a motor's
 * socket point, coming in along the socket normal, is *in* that socket; an axle end
 * that touches a wheel's face at the hole, parallel to the hole, is *through* that
 * wheel. Nothing is inferred from names, selection or nearness: half a plate off is
 * off, and the card says so.
 */
export type AxleEnd = {
  index: 0 | 1
  /** The end point on the axle's grid extent, world units. */
  point: Vec3
  /** Unit vector pointing out of the axle at this end. */
  outward: Vec3
  motorId: string | null
  wheelId: string | null
}

export type AxleLink = {
  axleId: string
  axis: Vec3
  center: Vec3
  radius: number
  halfLength: number
  ends: [AxleEnd, AxleEnd]
}

export type MotorLink = {
  motorId: string
  socket: { point: Vec3; normal: Vec3 }
  axleId: string | null
  axleEnd: 0 | 1 | null
}

export type WheelLink = {
  wheelId: string
  center: Vec3
  axis: Vec3
  radius: number
  halfThickness: number
  axleId: string | null
  axleEnd: 0 | 1 | null
  /** The closest free axle end when the wheel is not on one (for the card's hint). */
  nearest: { axleId: string; end: 0 | 1; gap: Vec3 } | null
}

export type HingeLink = {
  hingeId: string
  pivot: Vec3
  axis: Vec3
  fixedNode: string
  movingNode: string
}

export type SensorLink = { sensorId: string; point: Vec3; normal: Vec3 }

export type Mechanisms = {
  motors: MotorLink[]
  axles: AxleLink[]
  wheels: WheelLink[]
  hinges: HingeLink[]
  sensors: SensorLink[]
  motorById: Map<string, MotorLink>
  axleById: Map<string, AxleLink>
  wheelById: Map<string, WheelLink>
  hingeById: Map<string, HingeLink>
}

export function deriveMechanisms(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): Mechanisms {
  const motors: MotorLink[] = []
  const axles: AxleLink[] = []
  const wheels: WheelLink[] = []
  const hinges: HingeLink[] = []
  const sensors: SensorLink[] = []

  for (const brick of bricks) {
    const part = partMap[brick.partId]
    const spec = roboticsSpec(brick.partId)
    if (!part || !spec) continue
    const frame = brickFrame(brick, part, plateSize)
    if (spec.socket) {
      motors.push({ motorId: brick.id, socket: { point: toWorldPoint(frame, spec.socket.point), normal: toWorldDirection(frame, spec.socket.normal) }, axleId: null, axleEnd: null })
    }
    if (spec.axle) {
      const axis = toWorldDirection(frame, spec.axle.axis)
      const center = toWorldPoint(frame, spec.axle.center)
      const half = scale(axis, spec.axle.halfLength)
      axles.push({
        axleId: brick.id,
        axis,
        center,
        radius: spec.axle.radius,
        halfLength: spec.axle.halfLength,
        ends: [
          { index: 0, point: sub(center, half), outward: scale(axis, -1), motorId: null, wheelId: null },
          { index: 1, point: add(center, half), outward: axis, motorId: null, wheelId: null },
        ],
      })
    }
    if (spec.wheel) {
      wheels.push({
        wheelId: brick.id,
        center: toWorldPoint(frame, spec.wheel.center),
        axis: toWorldDirection(frame, spec.wheel.axis),
        radius: spec.wheel.radius,
        halfThickness: spec.wheel.halfThickness,
        axleId: null,
        axleEnd: null,
        nearest: null,
      })
    }
    if (spec.hinge) {
      hinges.push({ hingeId: brick.id, pivot: toWorldPoint(frame, spec.hinge.pivot), axis: toWorldDirection(frame, spec.hinge.axis), fixedNode: brick.id, movingNode: armNode(brick.id) })
    }
    if (spec.sensor) {
      sensors.push({ sensorId: brick.id, point: toWorldPoint(frame, spec.sensor.point), normal: toWorldDirection(frame, spec.sensor.normal) })
    }
  }

  // Motor sockets: the axle end must sit on the socket point, pointing into the motor.
  for (const axle of axles) {
    for (const end of axle.ends) {
      const motor = motors.find((candidate) => candidate.axleId === null && samePoint(candidate.socket.point, end.point) && sameDirection(candidate.socket.normal, scale(end.outward, -1)))
      if (!motor) continue
      motor.axleId = axle.axleId
      motor.axleEnd = end.index
      end.motorId = motor.motorId
    }
  }

  // Wheel holes: the axle end must sit on one of the wheel's two faces, parallel to the hole.
  for (const wheel of wheels) {
    const faces = [add(wheel.center, scale(wheel.axis, wheel.halfThickness)), sub(wheel.center, scale(wheel.axis, wheel.halfThickness))]
    let best: { axle: AxleLink; end: AxleEnd; gap: number } | null = null
    for (const axle of axles) {
      if (!parallel(axle.axis, wheel.axis)) continue
      for (const end of axle.ends) {
        if (end.motorId !== null || end.wheelId !== null) continue
        const gap = Math.min(...faces.map((face) => distance(face, end.point)))
        if (!best || gap < best.gap) best = { axle, end, gap }
      }
    }
    if (!best) continue
    if (samePoint(faces[0], best.end.point) || samePoint(faces[1], best.end.point)) {
      wheel.axleId = best.axle.axleId
      wheel.axleEnd = best.end.index
      best.end.wheelId = wheel.wheelId
    } else {
      const face = faces.reduce((closest, candidate) => (distance(candidate, best.end.point) < distance(closest, best.end.point) ? candidate : closest))
      wheel.nearest = { axleId: best.axle.axleId, end: best.end.index, gap: sub(best.end.point, face) }
    }
  }

  return {
    motors,
    axles,
    wheels,
    hinges,
    sensors,
    motorById: new Map(motors.map((motor) => [motor.motorId, motor])),
    axleById: new Map(axles.map((axle) => [axle.axleId, axle])),
    wheelById: new Map(wheels.map((wheel) => [wheel.wheelId, wheel])),
    hingeById: new Map(hinges.map((hinge) => [hinge.hingeId, hinge])),
  }
}

/** Wheels riding on the axle in a motor's socket, in axle-end order. */
export function wheelsOnMotor(mechanisms: Mechanisms, motorId: string): WheelLink[] {
  const motor = mechanisms.motorById.get(motorId)
  if (!motor?.axleId) return []
  const axle = mechanisms.axleById.get(motor.axleId)
  if (!axle) return []
  return axle.ends.flatMap((end) => (end.wheelId ? [mechanisms.wheelById.get(end.wheelId)!] : []))
}
