import { SUB, TS } from '@brick-studio/platformer-core/engine/constants'
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { ProgramBook } from './book'
import { levelFromJson, starterDoc, type LabDoc } from './level/doc'
import type { LabKey } from './program/types'
import { findThing } from './sim/things'
import type { LabInput, LabWorld, Thing, Trace } from './sim/types'
import { advance, createLabWorld, type LabLevel } from './sim/world'

/** A lab world stepped exactly like the page does it, for tests and tools. */
export function labHarness(doc: LabDoc = starterDoc(), level?: LabLevel) {
  const book = new ProgramBook(doc)
  const world = createLabWorld(level ?? levelFromJson(doc.level), book)
  const held: Record<LabKey, boolean> = { left: false, right: false, up: false, down: false, space: false, z: false, x: false }
  const h = {
    book,
    world,
    trace: null as Trace | null,
    /** One frame with these keys held; `press` lists keys that went down this frame (they are held too). */
    step(hold: Partial<Record<LabKey, boolean>> = {}, press: LabKey[] = []) {
      for (const k of Object.keys(held) as LabKey[]) held[k] = !!hold[k] || press.includes(k)
      const input: LabInput = { held: { ...held }, pressed: [...press] }
      advance(h.world, book, input, h.trace)
    },
    run(frames: number, hold: Partial<Record<LabKey, boolean>> = {}) {
      for (let i = 0; i < frames; i++) h.step(hold)
    },
    get player(): Thing {
      return findThing(h.world, h.world.playerId)!
    },
    thing(id: number): Thing | undefined {
      return findThing(h.world, id)
    },
    ofBrick(brick: string): Thing[] {
      return h.world.things.filter((t) => t.brick === brick && !t.removed)
    },
    setDoc(next: LabDoc) {
      book.update(next, h.world)
    },
  }
  return h
}

export type LabHarness = ReturnType<typeof labHarness>

/** Tile column of a thing's middle. */
export const tileX = (t: Thing) => Math.floor((t.x + t.w / 2) / TS)
/** Tile row of a thing's feet. */
export const tileY = (t: Thing) => Math.floor((t.y + t.h - 1) / TS)
export const px = (v: number) => v / SUB

export function placeAt(w: LabWorld, t: Thing, tx: number, ty: number) {
  t.x = tx * TS + Math.round((TS - t.w) / 2)
  t.y = (ty + 1) * TS - t.h
  t.vx = 0
  t.vy = 0
  t.ox = t.x
  t.oy = t.y
}

/** A flat level, ground two bricks deep, you at column 3 and nothing else (plus whatever `things` lists). */
export function flatLevel(width = 60, height = 16, things: LabLevel['things'] = []): LabLevel {
  const tiles = new Uint8Array(width * height)
  for (let y = height - 2; y < height; y++) for (let x = 0; x < width; x++) tiles[y * width + x] = T.GROUND
  return { width, height, theme: 'day', tiles, start: { x: 3, y: height - 3 }, things }
}
