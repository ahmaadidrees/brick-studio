import { describe, expect, it } from 'vitest'
import type { Costume, CostumeMask, Target } from './contracts'
import { boxBrick, makeTarget, makeWorld } from './testkit'
import { opaqueAt, targetsTouch, touchingEdge, touchingPoint } from './touching'

function mask(width: number, height: number, fill: (x: number, y: number) => boolean): CostumeMask {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y) ? 1 : 0
  }
  return { width, height, data }
}

function painted(
  width: number,
  height: number,
  fill: (x: number, y: number) => boolean,
  centerX = width / 2,
  centerY = height / 2,
): Costume {
  return { name: 'paint', width, height, rotationCenterX: centerX, rotationCenterY: centerY, mask: mask(width, height, fill) }
}

function pair(a: Target, b: Target, costumeA: Costume, costumeB: Costume) {
  const brickA = boxBrick('a', 'A')
  const brickB = boxBrick('b', 'B')
  brickA.costumes = [costumeA]
  brickB.costumes = [costumeB]
  a.brickId = 'a'
  b.brickId = 'b'
  return makeWorld({ bricks: [brickA, brickB], targets: [a, b] })
}

describe('touching', () => {
  it('S01 · ordinary fencing of pixels, not just boxes', () => {
    const left = painted(4, 4, (x) => x === 0)
    const right = painted(4, 4, (x) => x === 3)
    const a = makeTarget({ id: 'a', x: 0, y: 0 })
    const b = makeTarget({ id: 'b', x: 0, y: 0 })
    const world = pair(a, b, left, right)
    // Identical boxes, opaque columns on opposite sides.
    expect(targetsTouch(world, a, b)).toBe(false)
    // Shift B so its right column lands on A's left column (pixel centers at x = -1.5).
    b.x = -3
    expect(targetsTouch(world, a, b)).toBe(true)
  })

  it('S01 · separated costumes fail the broad phase', () => {
    const solid = painted(4, 4, () => true)
    const a = makeTarget({ id: 'a', x: 0, y: 0 })
    const b = makeTarget({ id: 'b', x: 100, y: 0 })
    const world = pair(a, b, solid, solid)
    expect(targetsTouch(world, a, b)).toBe(false)
  })

  it('S01 · a shared boundary with no area is not a hit', () => {
    const brick = boxBrick('a', 'A', 20, 20)
    const a = makeTarget({ id: 'a', brickId: 'a', x: 100, y: 100 })
    const b = makeTarget({ id: 'b', brickId: 'a', x: 120, y: 100 })
    const world = makeWorld({ bricks: [brick], targets: [a, b] })
    // 20px boxes centered 20 apart meet at x = 110 and share no step center.
    expect(targetsTouch(world, a, b)).toBe(false)
    b.x = 110
    expect(targetsTouch(world, a, b)).toBe(true)
  })

  it('falls back to the opaque rectangle when a costume has no mask', () => {
    const corner: Costume = {
      name: 'corner',
      width: 20,
      height: 20,
      rotationCenterX: 10,
      rotationCenterY: 10,
      opaque: { left: 0, top: 0, right: 2, bottom: 2 },
    }
    const dot = painted(2, 2, () => true, 1, 1)
    const a = makeTarget({ id: 'a', x: 0, y: 0 })
    const b = makeTarget({ id: 'b', x: 15, y: -15 })
    const world = pair(a, b, corner, dot)
    // Full-image boxes would overlap; the opaque corner does not reach B.
    expect(targetsTouch(world, a, b)).toBe(false)
    b.x = -9
    b.y = 9
    expect(targetsTouch(world, a, b)).toBe(true)
  })

  it('L06 · ghost does not stop sprite touching', () => {
    const solid = painted(4, 4, () => true)
    const a = makeTarget({ id: 'a', x: 0, y: 0, effects: { ...makeTarget().effects, ghost: 100 } })
    const b = makeTarget({ id: 'b', x: 1, y: 0 })
    const world = pair(a, b, solid, solid)
    expect(targetsTouch(world, a, b)).toBe(true)
  })

  it('S03 · a hidden participant does not touch', () => {
    const solid = painted(4, 4, () => true)
    const a = makeTarget({ id: 'a', x: 0, y: 0, visible: false })
    const b = makeTarget({ id: 'b', x: 1, y: 0 })
    const world = pair(a, b, solid, solid)
    expect(targetsTouch(world, a, b)).toBe(false)
    a.visible = true
    b.visible = false
    expect(targetsTouch(world, a, b)).toBe(false)
  })

  it('samples a rotated costume and a left-right flip', () => {
    const bar = painted(3, 1, () => true, 1.5, 0.5)
    const a = makeTarget({ id: 'a', x: 20, y: 30, direction: 90 })
    const world = pair(a, makeTarget({ id: 'b' }), bar, bar)
    expect(opaqueAt(world, a, 19, 30)).toBe(true)
    expect(opaqueAt(world, a, 20, 29)).toBe(false)
    a.direction = 0
    expect(opaqueAt(world, a, 20, 29)).toBe(true)
    expect(opaqueAt(world, a, 19, 30)).toBe(false)

    const leftPixel = painted(3, 3, (x, y) => x === 0 && y === 1, 1, 1)
    const probe = painted(1, 1, () => true, 0.5, 0.5)
    const body = makeTarget({ id: 'body', x: 10, y: 10, direction: -90, rotationStyle: 'left-right' })
    const dot = makeTarget({ id: 'dot', x: 10.5, y: 9.5 })
    const flipped = pair(body, dot, leftPixel, probe)
    expect(targetsTouch(flipped, body, dot)).toBe(true)
    dot.x = 9.5
    expect(targetsTouch(flipped, body, dot)).toBe(false)
  })

  it('M13 · touching edge is strict past the level bounds', () => {
    const brick = boxBrick('a', 'A', 20, 20)
    const sprite = makeTarget({ id: 'a', brickId: 'a', x: 470, y: 180 })
    const world = makeWorld({
      bricks: [brick],
      targets: [sprite],
      bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    })
    // Half-width 10, so the right edge of the costume sits on 480.
    expect(touchingEdge(world, sprite)).toBe(false)
    sprite.x = 470.1
    expect(touchingEdge(world, sprite)).toBe(true)
    sprite.x = 240
    sprite.y = 180
    expect(touchingEdge(world, sprite)).toBe(false)
    sprite.y = 10
    expect(touchingEdge(world, sprite)).toBe(false)
    sprite.y = 9.9
    expect(touchingEdge(world, sprite)).toBe(true)
    sprite.visible = false
    expect(touchingEdge(world, sprite)).toBe(true)
  })

  it('touching a point uses the costume pixel and ignores hide', () => {
    const ring = painted(5, 5, (x, y) => x === 0 || y === 0 || x === 4 || y === 4, 2.5, 2.5)
    const brick = boxBrick('a', 'A')
    brick.costumes = [ring]
    const sprite = makeTarget({ id: 'a', brickId: 'a', x: 40, y: 50, visible: false })
    const world = makeWorld({ bricks: [brick], targets: [sprite] })
    // Center of the ring is the transparent hole. A border pixel center is two steps left.
    expect(touchingPoint(world, sprite, 40, 50)).toBe(false)
    expect(touchingPoint(world, sprite, 38, 50)).toBe(true)
    expect(touchingPoint(world, sprite, Number.NaN, 50)).toBe(false)
  })

  it('a missing costume does not touch', () => {
    const sprite = makeTarget({ costumeIndex: 3 })
    const world = makeWorld({ targets: [sprite] })
    expect(touchingEdge(world, sprite)).toBe(false)
    expect(touchingPoint(world, sprite, sprite.x, sprite.y)).toBe(false)
    expect(targetsTouch(world, sprite, sprite)).toBe(false)
  })
})
