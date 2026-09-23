import { BRICK_PART_MAP, GRID_SIZE, rotatedSize } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import { ROLE_LABELS, roboticsSpec } from '../parts/catalog'

/**
 * Kid basics (Robot Workshop prototype only): parts sit on something. The studio's own layout
 * rules only forbid overlaps and leaving the plate, so a moved part could hang in the air where
 * it looked right from above (the motor "at Height 6" a tester dragged). These pure helpers give
 * every move the rule a student expects from real bricks: a part rests on the highest thing under
 * it (or the ground), and when it cannot go somewhere, one short line says why and which brick
 * is in the way. Nothing here reads or writes the store; callers pass what they have.
 */
export type PlacedLike = Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>
type Identified = PlacedLike & { id: string }
type Parts = Readonly<Record<string, BrickPart | undefined>>

type Box = { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }

function boxOf(brick: PlacedLike, parts: Parts): Box | null {
  const part = parts[brick.partId]
  if (!part) return null
  const size = rotatedSize(part, brick.rotation)
  return { x0: brick.x, x1: brick.x + size.width, z0: brick.z, z1: brick.z + size.depth, y0: brick.y, y1: brick.y + part.height }
}

const overlapsXZ = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
const overlapsY = (a: Box, b: Box) => a.y0 < b.y1 && a.y1 > b.y0

/** Robot parts held up by what they connect to, not by what is under them: an axle in a socket, a wheel on an axle. */
export function isConnectorPart(partId: string): boolean {
  const role = roboticsSpec(partId)?.role
  return role === 'axle' || role === 'wheel'
}

/**
 * How far a rigid group (or one part) falls when let go where it is: each piece would land on
 * the highest top at or below its own base inside its footprint (the ground at 0 otherwise), and
 * the group stops as soon as one piece lands. 0 when something already carries it.
 */
export function restingFall(pieces: readonly PlacedLike[], others: readonly PlacedLike[], parts: Parts = BRICK_PART_MAP): number {
  let fall = Number.POSITIVE_INFINITY
  const otherBoxes = others.map((brick) => boxOf(brick, parts)).filter((box): box is Box => box !== null)
  for (const piece of pieces) {
    const box = boxOf(piece, parts)
    if (!box) continue
    let floor = 0
    for (const other of otherBoxes) if (other.y1 <= box.y0 && other.y1 > floor && overlapsXZ(box, other)) floor = other.y1
    fall = Math.min(fall, box.y0 - floor)
  }
  return Number.isFinite(fall) ? Math.max(0, fall) : 0
}

/**
 * The pieces let go and settled. `stepUp` lifts them first (in plates), so a part pushed
 * sideways with an arrow steps up onto a plate's edge instead of refusing, and still drops off
 * any edge; anything taller than the step stays in the way.
 */
export function settlePieces<T extends PlacedLike>(pieces: readonly T[], others: readonly PlacedLike[], parts: Parts = BRICK_PART_MAP, stepUp = 0): T[] {
  const lifted = pieces.map((piece) => ({ ...piece, y: piece.y + stepUp }))
  const fall = restingFall(lifted, others, parts)
  return lifted.map((piece) => ({ ...piece, y: piece.y - fall }))
}

/** True when nothing carries the pieces: they would fall if let go. */
export function isFloating(pieces: readonly PlacedLike[], others: readonly PlacedLike[], parts: Parts = BRICK_PART_MAP): boolean {
  return restingFall(pieces, others, parts) > 0
}

export type Blocked = {
  /** A piece reaches past the build plate's edge (or below the ground). */
  offPlate: boolean
  /** The placed bricks a piece would overlap, in the order they appear. */
  ids: string[]
}

/** Why pieces cannot go where they are: off the plate, and which bricks are in the way. */
export function blockersOf(pieces: readonly PlacedLike[], others: readonly Identified[], plateSize: number = GRID_SIZE, parts: Parts = BRICK_PART_MAP): Blocked {
  let offPlate = false
  const ids: string[] = []
  const otherBoxes = others.map((brick) => ({ id: brick.id, box: boxOf(brick, parts) }))
  for (const piece of pieces) {
    const box = boxOf(piece, parts)
    if (!box) continue
    if (box.x0 < 0 || box.z0 < 0 || box.y0 < 0 || box.x1 > plateSize || box.z1 > plateSize) offPlate = true
    for (const other of otherBoxes) {
      if (other.box && !ids.includes(other.id) && overlapsXZ(box, other.box) && overlapsY(box, other.box)) ids.push(other.id)
    }
  }
  return { offPlate, ids }
}

/** Kid words (docs/robotics/KID-UX.md copy guide): what stops a part, never blame. */
export const REFUSAL_TEXT = {
  inTheWay: 'Something is in the way.',
  offPlate: "That's off the plate.",
  tooFar: 'Too far away. Zoom in to build there.',
  cannotFloat: "Parts can't float. Put something under it.",
  cannotGoLower: "It can't go any lower.",
} as const

export function refusalText(blocked: Blocked): string | null {
  if (blocked.offPlate) return REFUSAL_TEXT.offPlate
  if (blocked.ids.length) return REFUSAL_TEXT.inTheWay
  return null
}

/**
 * The heights (as offsets from where the pieces are now, in plates) at which the group can sit:
 * a piece on the ground or on top of a brick in its column, nothing overlapping, on the plate.
 * Raise and Lower hop between these instead of leaving a part in the air. Sorted ascending.
 */
export function restOffsets(pieces: readonly PlacedLike[], others: readonly Identified[], plateSize: number = GRID_SIZE, parts: Parts = BRICK_PART_MAP): number[] {
  if (!pieces.length) return []
  const candidates = new Set<number>([-Math.min(...pieces.map((piece) => piece.y))])
  const otherBoxes = others.map((brick) => boxOf(brick, parts)).filter((box): box is Box => box !== null)
  for (const piece of pieces) {
    const box = boxOf(piece, parts)
    if (!box) continue
    for (const other of otherBoxes) if (overlapsXZ(box, other)) candidates.add(other.y1 - piece.y)
  }
  return [...candidates]
    .filter((offset) => {
      const moved = pieces.map((piece) => ({ ...piece, y: piece.y + offset }))
      const blocked = blockersOf(moved, others, plateSize, parts)
      return !blocked.offPlate && !blocked.ids.length && restingFall(moved, others, parts) === 0
    })
    .sort((a, b) => a - b)
}

/**
 * Where the height handle lands for a requested offset: the highest resting height at or below
 * it (a part pulled into the air drops back onto what is under it), or the lowest one when the
 * request is below them all. Null when the pieces have nowhere to sit in their column.
 */
export function handleOffset(requested: number, offsets: readonly number[]): number | null {
  if (!offsets.length) return null
  let best: number | null = null
  for (const offset of offsets) if (offset <= requested) best = offset
  return best ?? offsets[0]
}

/** What the part rests on, in a few words, for the caption shown from the top view ("On the plate"). */
export function restingOnText(pieces: readonly PlacedLike[], others: readonly PlacedLike[], parts: Parts = BRICK_PART_MAP): string {
  if (isFloating(pieces, others, parts)) return 'In the air'
  const under: PlacedLike[] = []
  for (const piece of pieces) {
    const box = boxOf(piece, parts)
    if (!box) continue
    for (const other of others) {
      const otherBox = boxOf(other, parts)
      if (otherBox && otherBox.y1 === box.y0 && overlapsXZ(box, otherBox)) under.push(other)
    }
  }
  if (!under.length) return 'On the ground'
  const spec = roboticsSpec(under[0].partId)
  if (spec) return `On the ${ROLE_LABELS[spec.role]}`
  const part = parts[under[0].partId]
  if (part?.kind === 'plate') return 'On the plate'
  return 'On a brick'
}
