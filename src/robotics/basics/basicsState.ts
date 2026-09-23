import { create } from 'zustand'

/**
 * Kid basics (Robot Workshop prototype only): the short-lived things the studio shows about a
 * placement or a move that the brick store does not keep: which bricks were in the way of a
 * refused move (outlined for a moment), which bricks were just placed (flashed for about a
 * second), and a placement that landed where the student cannot see it. Written by the studio's
 * placement and move paths when the prototype is on; drawn by `BasicsLayer` and `BasicsOverlay`.
 */
export type Refusal = { ids: string[]; text: string; nonce: number }
export type Flash = { ids: string[]; nonce: number }
export type FarNotice = { ids: string[]; nonce: number }

export type BasicsState = {
  refusal: Refusal | null
  flash: Flash | null
  farNotice: FarNotice | null
  /** The pointer is over a spot too far away to place at (the ghost stays put and says so). */
  farHover: boolean
}

export const useBasicsStore = create<BasicsState>(() => ({ refusal: null, flash: null, farNotice: null, farHover: false }))

let nonce = 0
const next = () => { nonce += 1; return nonce }

/** A move or placement was refused: say why (the store's toast) and outline what is in the way. */
export function reportRefusal(text: string, ids: readonly string[]) {
  useBasicsStore.setState({ refusal: { ids: [...ids], text, nonce: next() } })
}

export function clearRefusal() {
  if (useBasicsStore.getState().refusal) useBasicsStore.setState({ refusal: null })
}

export function reportPlaced(ids: readonly string[]) {
  if (!ids.length) return
  useBasicsStore.setState({ flash: { ids: [...ids], nonce: next() } })
}

export function reportFarPlacement(ids: readonly string[]) {
  useBasicsStore.setState({ farNotice: ids.length ? { ids: [...ids], nonce: next() } : null })
}

export function clearFarNotice() {
  if (useBasicsStore.getState().farNotice) useBasicsStore.setState({ farNotice: null })
}
