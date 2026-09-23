import { GRID_SIZE } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { REFUSAL_TEXT, blockersOf, isConnectorPart, refusalText, restOffsets, settlePieces, type PlacedLike } from './support'

/**
 * Kid basics (Robot Workshop prototype only): the studio's move commands with "parts sit on
 * something". The brick store calls these when the prototype is on and applies the answer through
 * its own history and validation, so Undo, grouping and the unflagged studio are untouched.
 *
 * - Arrows (left, right, forward, back) slide one stud and the part settles on what is under it:
 *   it steps up onto something at most STEP_UP_PLATES high (a plate's edge), drops off any edge,
 *   and stops at anything taller, saying what is in the way.
 * - Raise and Lower hop to the next height the part can sit at in its own column (on the ground or
 *   on top of a brick under it); with none, they say why instead of leaving it in the air.
 */
export const STEP_UP_PLATES = 1

export type KidNudge = { ok: true; offset: [number, number, number] } | { ok: false; text: string; ids: string[] }

/** Parts that follow the studio's own free nudge: an axle or a wheel alone (held by what they connect to). */
export function keepsStudioNudge(pieces: readonly PlacedLike[]): boolean {
  return pieces.length === 1 && isConnectorPart(pieces[0].partId)
}

export function kidNudge(pieces: readonly PlacedLike[], others: readonly BrickInstance[], dx: number, dy: number, dz: number, plateSize: number = GRID_SIZE): KidNudge | null {
  if (!pieces.length || keepsStudioNudge(pieces)) return null
  if (dy === 0) {
    const shifted = pieces.map((piece) => ({ ...piece, x: piece.x + dx, z: piece.z + dz }))
    const settled = settlePieces(shifted, others, undefined, STEP_UP_PLATES)
    const blocked = blockersOf(settled, others, plateSize)
    const text = refusalText(blocked)
    if (text) return { ok: false, text, ids: blocked.ids }
    return { ok: true, offset: [dx, settled[0].y - pieces[0].y, dz] }
  }
  const offsets = restOffsets(pieces, others, plateSize)
  const next = dy > 0 ? offsets.find((offset) => offset > 0) : [...offsets].reverse().find((offset) => offset < 0)
  if (next !== undefined) return { ok: true, offset: [0, next, 0] }
  if (dy > 0) return { ok: false, text: REFUSAL_TEXT.cannotFloat, ids: [] }
  // Already as low as it goes: show what it is sitting on.
  const below = blockersOf(pieces.map((piece) => ({ ...piece, y: piece.y - 1 })), others, plateSize).ids
  return { ok: false, text: REFUSAL_TEXT.cannotGoLower, ids: below }
}

/** Why a placement or move is refused, in kid words, and which bricks to outline. */
export function kidRefusal(pieces: readonly PlacedLike[], others: readonly BrickInstance[], plateSize: number = GRID_SIZE): { text: string; ids: string[] } {
  const blocked = blockersOf(pieces, others, plateSize)
  return { text: refusalText(blocked) ?? REFUSAL_TEXT.inTheWay, ids: blocked.ids }
}
