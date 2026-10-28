import { SUB, TS, fdiv } from '@brick-studio/platformer-core/engine/constants'
import { tileAt } from '@brick-studio/platformer-core/engine/collide'
import { T, isSolid } from '@brick-studio/platformer-core/engine/tiles'
import type { TileKind, TouchSide, TouchTarget } from '../program/types'
import { findThing, isOfBrick } from './things'
import { SOLID_NONE, type ContactSide, type LabHost, type LabWorld, type Thing } from './types'

/*
 * Touching. After everything has moved, each thing works out what it touches (things overlapping or flush against
 * it, and tiles) and on which of its sides. What it did not touch last frame is news: a "touch" event, and a
 * "stomped" event when something came down on the top of a thing that is not solid. Contacts are kept as short
 * string keys on each thing, so "touching …?" can be answered any time and the state stays plain data.
 */

const TOL = 2 * SUB

/** Where `b` is, seen from `a`, judged from where both were when this frame's movement began. */
export function sideOf(a: Thing, b: Thing): ContactSide {
  if (b.oy + b.h <= a.oy + TOL) return 'top'
  if (b.oy >= a.oy + a.h - TOL) return 'bottom'
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (overlapY < overlapX) return b.y + b.h / 2 < a.y + a.h / 2 ? 'top' : 'bottom'
  return 'side'
}

const opposite = (s: ContactSide): ContactSide => (s === 'top' ? 'bottom' : s === 'bottom' ? 'top' : 'side')

/** Flush counts as touching: boxes one sub-pixel apart or overlapping. */
const touches = (a: Thing, b: Thing) => a.x - 1 < b.x + b.w && b.x - 1 < a.x + a.w && a.y - 1 < b.y + b.h && b.y - 1 < a.y + a.h

function tileKeys(w: LabWorld, t: Thing, out: string[]) {
  const x0 = t.x
  const x1 = t.x + t.w
  const y0 = t.y
  const y1 = t.y + t.h
  const seen = new Set<string>()
  const add = (kind: TileKind, side: ContactSide) => {
    const key = `t:${kind}:${side}`
    if (!seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  const c0 = fdiv(x0 - 1, TS)
  const c1 = fdiv(x1, TS)
  const r0 = fdiv(y0 - 1, TS)
  const r1 = fdiv(y1, TS)
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const tile = tileAt(w, c, r)
      if (tile === T.EMPTY) continue
      const left = c * TS
      const right = left + TS
      const top = r * TS
      const bottom = top + TS
      const inX = left < x1 && right > x0
      const inY = top < y1 && bottom > y0
      if (tile === T.LAVA) {
        // Lava counts only inside it.
        if (inX && inY) add('lava', top >= y0 + t.h / 2 ? 'bottom' : 'side')
        continue
      }
      if (!isSolid(tile)) continue
      let side: ContactSide | null = null
      if (top >= y1 && inX) side = 'bottom'
      else if (bottom <= y0 && inX) side = 'top'
      else if ((right <= x0 || left >= x1) && inY) side = 'side'
      else if (inX && inY) side = 'side'
      if (!side) continue
      add('solid', side)
      if (tile === T.SPIKES) add('spikes', side)
    }
  }
}

/** Work out every thing's contacts; queue touch and stomp events for what is new. */
export function updateContacts(w: LabWorld) {
  const live = w.things.filter((t) => !t.removed && !t.riding && !t.system)
  const keys = new Map<number, string[]>()
  for (const t of live) keys.set(t.id, [])
  const stomps: [Thing, Thing][] = []
  // Sweep along x: only neighbours can touch.
  const byX = live.slice().sort((a, b) => a.x - b.x || a.id - b.id)
  for (let i = 0; i < byX.length; i++) {
    const a = byX[i]
    for (let j = i + 1; j < byX.length; j++) {
      const b = byX[j]
      if (b.x - 1 >= a.x + a.w) break
      if (!touches(a, b)) continue
      const sideA = sideOf(a, b)
      keys.get(a.id)!.push(`n:${b.id}:${sideA}`)
      keys.get(b.id)!.push(`n:${a.id}:${opposite(sideA)}`)
      if (sideA === 'top' && a.solid === SOLID_NONE && b.y > b.oy) stomps.push([a, b])
      else if (sideA === 'bottom' && b.solid === SOLID_NONE && a.y > a.oy) stomps.push([b, a])
    }
  }
  for (const t of live) tileKeys(w, t, keys.get(t.id)!)
  for (const t of live) {
    const now = keys.get(t.id)!
    const before = new Set(t.contacts)
    for (const key of now) {
      if (before.has(key)) continue
      const [kind, what, side] = key.split(':')
      if (kind === 'n') t.events.push({ kind: 'touch', other: Number(what), tile: null, side: side as ContactSide })
      else t.events.push({ kind: 'touch', other: 0, tile: what as TileKind, side: side as ContactSide })
    }
    t.contacts = now
  }
  for (const [under, onTop] of stomps) {
    // Only a new top contact is a stomp (its touch event was just queued above).
    if (under.events.some((e) => e.kind === 'touch' && e.other === onTop.id && e.side === 'top')) under.events.push({ kind: 'stomped', other: onTop.id })
  }
  for (const t of w.things) if (t.removed || t.riding || t.system) t.contacts = []
}

/** Does a touch (a thing, or a tile kind) match what a script looks for? */
export function matchesTarget(w: LabWorld, host: LabHost, target: TouchTarget, other: Thing | undefined, tile: TileKind | null): boolean {
  if (target === 'player') return !!other && other.id === w.playerId
  if (target === 'any') return !!other
  if (target.startsWith('tile:')) return tile === target.slice(5)
  if (target.startsWith('brick:')) return !!other && isOfBrick(host, other, target.slice(6))
  return false
}

export const sideMatches = (want: TouchSide, got: ContactSide) => want === 'any' || want === got

/** Am I touching it now? */
export function isTouching(w: LabWorld, host: LabHost, me: Thing, target: TouchTarget): boolean {
  for (const key of me.contacts) {
    const [kind, what] = key.split(':')
    if (kind === 'n') {
      if (matchesTarget(w, host, target, findThing(w, Number(what)), null)) return true
    } else if (matchesTarget(w, host, target, undefined, what as TileKind)) return true
  }
  return false
}
