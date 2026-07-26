import { describe, expect, it } from 'vitest'
import {
  CHARACTER_AUTOSTEP_HEIGHT,
  CHARACTER_JUMP_SPEED,
  CHARACTER_MAX_SLOPE_ANGLE,
} from './characterController'
import {
  BOOK_STACK_HEIGHT,
  DESK_GUARD_HEIGHT,
  DESK_INNER_HALF_X,
  DESK_INNER_HALF_Z,
  DESK_RIM_HEIGHT,
  DESK_TOP_Y,
  PLATE_THICKNESS,
  RAMP_ANGLE,
  RAMP_LENGTH,
  RAMP_THICKNESS,
  TOY_PROPS,
  extentsOverlap,
  plateExtent,
  plateGap,
  propExtent,
  rulerRampPose,
  toyRoomFeatures,
} from './toyRoom'

describe('toy room ground', () => {
  it('drops exactly one plate thickness from the plate to the table', () => {
    expect(0 - DESK_TOP_Y).toBeCloseTo(PLATE_THICKNESS, 6)
  })

  it('lets autostep carry the explorer back up onto the plate', () => {
    expect(0 - DESK_TOP_Y).toBeLessThan(CHARACTER_AUTOSTEP_HEIGHT)
  })

  it('leaves the rail low enough to jump onto for the view', () => {
    const singleApex = (CHARACTER_JUMP_SPEED * CHARACTER_JUMP_SPEED) / (2 * 9.81)
    expect(DESK_RIM_HEIGHT).toBeGreaterThan(CHARACTER_AUTOSTEP_HEIGHT)
    expect(DESK_RIM_HEIGHT).toBeLessThan(singleApex)
  })

  it('guards the drop higher than a double jump from the rail can clear', () => {
    const singleApex = (CHARACTER_JUMP_SPEED * CHARACTER_JUMP_SPEED) / (2 * 9.81)
    expect(DESK_GUARD_HEIGHT).toBeGreaterThan(DESK_RIM_HEIGHT + singleApex * 2)
  })
})

describe('ruler ramp', () => {
  const pose = rulerRampPose()

  it('is gentle enough for the character controller to walk up', () => {
    expect(RAMP_ANGLE).toBeLessThan(CHARACTER_MAX_SLOPE_ANGLE)
  })

  it('meets the top book with no lip', () => {
    const topSurface = pose.y + (RAMP_LENGTH / 2) * Math.sin(RAMP_ANGLE) + (RAMP_THICKNESS / 2) * Math.cos(RAMP_ANGLE)
    expect(topSurface).toBeCloseTo(BOOK_STACK_HEIGHT, 6)
  })

  it('meets the table with no step at the foot', () => {
    const footSurface = pose.y - (RAMP_LENGTH / 2) * Math.sin(RAMP_ANGLE) + (RAMP_THICKNESS / 2) * Math.cos(RAMP_ANGLE)
    expect(footSurface).toBeCloseTo(0, 6)
  })
})

describe('toy room layout', () => {
  it('dresses the table with a diorama-sized cast', () => {
    expect(TOY_PROPS.length).toBeGreaterThanOrEqual(15)
    expect(TOY_PROPS.length).toBeLessThanOrEqual(30)
  })

  it('gives every prop a unique id', () => {
    expect(new Set(TOY_PROPS.map((prop) => prop.id)).size).toBe(TOY_PROPS.length)
  })

  it('keeps every prop inside the table rim', () => {
    for (const prop of TOY_PROPS) {
      const extent = propExtent(prop)
      expect(`${prop.id}:${extent.minX >= -DESK_INNER_HALF_X}`).toBe(`${prop.id}:true`)
      expect(`${prop.id}:${extent.maxX <= DESK_INNER_HALF_X}`).toBe(`${prop.id}:true`)
      expect(`${prop.id}:${extent.minZ >= -DESK_INNER_HALF_Z}`).toBe(`${prop.id}:true`)
      expect(`${prop.id}:${extent.maxZ <= DESK_INNER_HALF_Z}`).toBe(`${prop.id}:true`)
    }
  })

  it('never lets set dressing intrude on the build plate', () => {
    const plate = plateExtent()
    for (const prop of TOY_PROPS) {
      expect(`${prop.id}:${extentsOverlap(propExtent(prop), plate)}`).toBe(`${prop.id}:false`)
    }
  })

  it('spreads props over near, middle and far distances from the plate', () => {
    const gaps = TOY_PROPS.map(plateGap)
    expect(gaps.some((gap) => gap < 14)).toBe(true)
    expect(gaps.some((gap) => gap >= 14 && gap < 30)).toBe(true)
    expect(gaps.some((gap) => gap >= 30)).toBe(true)
  })

  it('only overlaps props that belong to the same arrangement', () => {
    for (let i = 0; i < TOY_PROPS.length; i += 1) {
      for (let j = i + 1; j < TOY_PROPS.length; j += 1) {
        const a = TOY_PROPS[i]
        const b = TOY_PROPS[j]
        if (a.group && a.group === b.group) continue
        const pair = `${a.id}/${b.id}`
        expect(`${pair}:${extentsOverlap(propExtent(a), propExtent(b))}`).toBe(`${pair}:false`)
      }
    }
  })
})

describe('toy room perf ladder', () => {
  it('keeps the per-frame extras off compact renderers', () => {
    const phone = toyRoomFeatures(true, false)
    const desktop = toyRoomFeatures(false, false)
    expect(phone.lightBeam).toBe(false)
    expect(phone.clearcoat).toBe(false)
    expect(phone.shadowMapSize).toBeLessThan(desktop.shadowMapSize)
    expect(phone.dustCount).toBeLessThan(desktop.dustCount)
    expect(phone.contactShadowResolution).toBeLessThan(desktop.contactShadowResolution)
    // Baked once instead of re-rendered every frame.
    expect(Number.isFinite(phone.contactShadowFrames)).toBe(true)
    expect(Number.isFinite(desktop.contactShadowFrames)).toBe(false)
  })

  it('still evokes the theme on a phone', () => {
    const phone = toyRoomFeatures(true, false)
    expect(phone.dustCount).toBeGreaterThan(0)
    expect(phone.distantFurniture).toBe(true)
    expect(phone.contactShadowFrames).toBeGreaterThan(0)
  })

  it('stops every added ambient motion under reduced motion', () => {
    const calm = toyRoomFeatures(false, true)
    expect(calm.animateDust).toBe(false)
    expect(calm.ambientMotion).toBe(false)
    expect(calm.contactShadowResolution).toBe(toyRoomFeatures(false, false).contactShadowResolution)
  })
})
