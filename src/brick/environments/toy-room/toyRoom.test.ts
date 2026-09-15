import { describe, expect, it } from 'vitest'
import {
  CHARACTER_AUTOSTEP_HEIGHT,
  CHARACTER_JUMP_SPEED,
  CHARACTER_MAX_SLOPE_ANGLE,
} from '../../characterController'
import {
  BOOK_STACK_HEIGHT,
  CLOCK,
  DESK_GUARD_HEIGHT,
  DESK_HALF_X,
  DESK_INNER_HALF_X,
  DESK_INNER_HALF_Z,
  DESK_RIM_HEIGHT,
  DESK_TOP_Y,
  EXPLORE_PLATE_COLOR,
  LAMP_SHADE,
  PLATE_THICKNESS,
  POSTER,
  RAMP_ANGLE,
  RAMP_LENGTH,
  RAMP_THICKNESS,
  ROOM,
  TOY_PROPS,
  TOY_ROOM_PALETTE,
  WINDOW,
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

describe('toy room direction I dressing', () => {
  const HEX = /^#[0-9a-f]{6}$/i
  const brandColors = new Set(Object.values(TOY_ROOM_PALETTE).map((color) => color.toLowerCase()))

  it('keeps every palette entry and the plate colour a six-digit hex', () => {
    for (const [name, color] of Object.entries(TOY_ROOM_PALETTE)) {
      expect(`${name}:${HEX.test(color)}`).toBe(`${name}:true`)
    }
    expect(EXPLORE_PLATE_COLOR).toMatch(HEX)
  })

  it('carries the four brand tokens from the boards unchanged', () => {
    expect(TOY_ROOM_PALETTE.cornflower.toLowerCase()).toBe('#5888da')
    expect(TOY_ROOM_PALETTE.coral.toLowerCase()).toBe('#f17861')
    expect(TOY_ROOM_PALETTE.butter.toLowerCase()).toBe('#f3ca74')
    expect(TOY_ROOM_PALETTE.ink.toLowerCase()).toBe('#263c51')
  })

  it('uses a warm-white plate and a cool blue room', () => {
    const channels = (color: string) => [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
    const [plateRed, , plateBlue] = channels(EXPLORE_PLATE_COLOR)
    expect(plateRed).toBeGreaterThan(plateBlue)
    for (const surface of [TOY_ROOM_PALETTE.wall, TOY_ROOM_PALETTE.fog]) {
      const [red, , blue] = channels(surface)
      expect(blue).toBeGreaterThan(red)
    }
  })

  it('paints every coloured prop in a brand colour', () => {
    for (const prop of TOY_PROPS) {
      if (!prop.color) continue
      expect(`${prop.id}:${brandColors.has(prop.color.toLowerCase())}`).toBe(`${prop.id}:true`)
    }
  })

  it('stacks the books in the board order: navy, coral, butter, cornflower', () => {
    const spines = TOY_PROPS.filter((prop) => prop.kind === 'book').map((prop) => prop.color)
    expect(spines).toEqual([
      TOY_ROOM_PALETTE.navy,
      TOY_ROOM_PALETTE.coral,
      TOY_ROOM_PALETTE.butter,
      TOY_ROOM_PALETTE.cornflower,
    ])
  })

  it('swaps the coffee for a pencil cup and a coaster', () => {
    const kinds = new Set(TOY_PROPS.map((prop) => prop.kind))
    expect(kinds.has('coaster')).toBe(true)
    expect([...kinds]).not.toContain('coffee-ring')
    const mug = TOY_PROPS.find((prop) => prop.id === 'mug')
    const coaster = TOY_PROPS.find((prop) => prop.id === 'coaster')
    expect(mug?.group).toBe('pencil-cup')
    expect(coaster?.group).toBe('pencil-cup')
  })

  it('hangs the clock and poster on the back wall, above the lamp and clear of the window', () => {
    for (const [name, item, halfWidth, halfHeight] of [
      ['clock', CLOCK, CLOCK.radius, CLOCK.radius],
      ['poster', POSTER, POSTER.halfWidth, POSTER.halfHeight],
    ] as const) {
      // Just proud of the wall plane, never inside the desk footprint.
      expect(`${name}:${item.z > ROOM.backWallZ && item.z < ROOM.backWallZ + 2}`).toBe(`${name}:true`)
      // Bottom edge higher than the lamp head so nothing on the wall competes with the key light.
      expect(item.y - halfHeight).toBeGreaterThan(LAMP_SHADE.y + 7)
      expect(item.y + halfHeight).toBeLessThan(ROOM.ceilingY)
      // Inside the back wall, and clear of the window wall's corner.
      expect(item.x - halfWidth).toBeGreaterThan(WINDOW.x + 4)
      expect(item.x + halfWidth).toBeLessThan(DESK_HALF_X + 40)
    }
    // Clock and poster do not overlap each other.
    expect(Math.abs(CLOCK.x - POSTER.x)).toBeGreaterThan(CLOCK.radius + POSTER.halfWidth)
  })

  it('keeps the dust ladder lighter than the pre-brand room', () => {
    expect(toyRoomFeatures(false, false).dustCount).toBeLessThanOrEqual(110)
    expect(toyRoomFeatures(true, false).dustCount).toBeLessThanOrEqual(40)
  })
})
