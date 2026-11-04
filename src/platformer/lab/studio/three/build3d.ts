/**
 * Hackable 3D's Build (docs/qa/hackable-3d/D1.md): what is armed (a build brick and its colour, or a code brick), where
 * a click puts it, and the edits themselves, each one undo step.
 *
 * - A build brick goes on the stud under the pointer, on top of whatever is built there (the classic builder stacks
 *   the same way), turned by Turn (R). It joins the build (scenery): plain, no code.
 * - A code brick is a copy of the project's brick (made from its template the first time), standing on whatever is
 *   under its footprint. The Hero and the Goal are one per world: placing one again moves it.
 */
import { BRICK_COLORS } from '../../../../../packages/brick-core/src/parts'
import type { LevelDesign } from '../../core/contracts'
import { MAX_SCENERY3D, PLATE, STUD, plateOf, type BrickDef3, type CopyPlacement3, type LevelDesign3, type SceneryBrick } from '../../kit3d/contracts3d'
import { DEFAULT_SHAPE3, HERO3D } from '../../kit3d/engine3d'
import { partsOf, supportTop } from '../../kit3d/parts3d'
import { addCopyEdit, removeCopyEdit, type History } from '../builder/history'
import type { StudioStore } from '../store'
import { CODE_BRICKS_3D, createHero3d, type CodeBrick3 } from './bricks3d'
import { brickFor, missingBricks, partFootprint } from './project3d'

/** The build bricks the drawer offers (the mock's nine), with their short names. */
export const BUILD_PARTS_3D: ReadonlyArray<{ partId: string; label: string }> = [
  { partId: 'brick_2x4', label: '2 × 4' },
  { partId: 'brick_2x2', label: '2 × 2' },
  { partId: 'brick_1x4', label: '1 × 4' },
  { partId: 'plate_2x4', label: 'Plate' },
  { partId: 'plate_6x8', label: 'Big plate' },
  { partId: 'pillar_1x1', label: 'Pillar' },
  { partId: 'slope_2x2', label: 'Slope' },
  { partId: 'stair_2x3', label: 'Steps' },
  { partId: 'door_1x4', label: 'Door' },
]

export const COLORS_3D: readonly string[] = BRICK_COLORS

export type Armed3 =
  | { kind: 'part'; partId: string; label: string; color: string; rotation: 0 | 1 | 2 | 3 }
  | { kind: 'code'; key: CodeBrick3['key'] | 'hero'; label: string }
  /** A code brick of the kid's own (made with + New brick). */
  | { kind: 'own'; brickId: string; label: string }

/** What the drawer has armed, per studio (shared by the drawer, the Stage and the placing chip). */
export class Build3State {
  armed: Armed3 | null = null
  color: string = COLORS_3D[0]
  rotation: 0 | 1 | 2 | 3 = 0
  private listeners = new Set<() => void>()
  private version = 0
  subscribe = (l: () => void): (() => void) => { this.listeners.add(l); return () => this.listeners.delete(l) }
  getVersion = (): number => this.version
  private bump() { this.version++; for (const l of this.listeners) l() }
  arm(armed: Armed3 | null) { this.armed = armed && armed.kind === 'part' ? { ...armed, color: this.color, rotation: this.rotation } : armed; this.bump() }
  setColor(color: string) { this.color = color; if (this.armed?.kind === 'part') this.armed = { ...this.armed, color }; this.bump() }
  turn() { this.rotation = ((this.rotation + 1) % 4) as 0 | 1 | 2 | 3; if (this.armed?.kind === 'part') this.armed = { ...this.armed, rotation: this.rotation }; this.bump() }
}

const states = new WeakMap<StudioStore, Build3State>()
export function build3d(store: StudioStore): Build3State {
  let s = states.get(store)
  if (!s) { s = new Build3State(); states.set(store, s) }
  return s
}

const d3 = (store: StudioStore): LevelDesign3 => store.getState().project.design as LevelDesign3

/** A point on the plate or on top of something, and which way the face there points. */
export interface Surface { x: number; y: number; z: number; nx: number; ny: number; nz: number }

/** Where an armed build brick would go for a surface point, or null off the plate. */
export function partPlacement(design: LevelDesign3, at: Surface, partId: string, rotation: 0 | 1 | 2 | 3, color: string): SceneryBrick | null {
  const plate = plateOf(design)
  const f = partFootprint(design, partId, rotation)
  // A side face: step just off it, so the brick goes beside, not inside.
  const px = at.x + at.nx * 0.05
  const pz = at.z + at.nz * 0.05
  const x = Math.round(px / STUD + plate / 2 - f.w / 2)
  const z = Math.round(pz / STUD + plate / 2 - f.d / 2)
  if (x < 0 || z < 0 || x + f.w > plate || z + f.d > plate) return null
  const support = supportTop(design.scenery3d, partsOf(design), x, z, f.w, f.d)
  // On the top of a code brick (a pad, a Mover): stand on that top, to the nearest plate.
  const y = at.ny > 0.5 ? Math.max(support, Math.round(at.y / PLATE)) : support
  return { partId, x, y, z, rotation, color }
}

/** The world box a build brick fills (for the ghost). */
export function partBox(design: LevelDesign3, b: SceneryBrick): { x: number; y: number; z: number; w: number; h: number; d: number } {
  const plate = plateOf(design)
  const f = partFootprint(design, b.partId, b.rotation)
  return { x: (b.x + f.w / 2 - plate / 2) * STUD, y: b.y * PLATE, z: (b.z + f.d / 2 - plate / 2) * STUD, w: f.w * STUD, h: f.h * PLATE, d: f.d * STUD }
}

/** Where a code brick of this size would stand for a surface point: centred on the stud grid, on top of the build. */
export function codePlacement(design: LevelDesign3, at: Surface, size: { w: number; d: number }, hover = 0): { x: number; y: number; z: number } | null {
  const plate = plateOf(design)
  const ws = Math.max(1, Math.round(size.w / STUD))
  const ds = Math.max(1, Math.round(size.d / STUD))
  const x0 = Math.round(at.x / STUD + plate / 2 - ws / 2)
  const z0 = Math.round(at.z / STUD + plate / 2 - ds / 2)
  if (x0 < 0 || z0 < 0 || x0 + ws > plate || z0 + ds > plate) return null
  const top = supportTop(design.scenery3d, partsOf(design), x0, z0, ws, ds) * PLATE
  // Standing on another code brick's top (a coin on a pad): the surface itself, when it is higher than the build.
  const y = Math.max(top, at.ny > 0.5 ? at.y : 0)
  return { x: (x0 + ws / 2 - plate / 2) * STUD, y: y + hover, z: (z0 + ds / 2 - plate / 2) * STUD }
}

// ------------------------------------------------------------------------------------------------ edits

function setScenery(store: StudioStore, scenery: SceneryBrick[]) {
  store.updateDesign((d) => ({ ...d, scenery3d: scenery } as LevelDesign))
}

/** Add a build brick (one undo step). Returns false at the 2,000-brick limit. */
export function addScenery(store: StudioStore, history: History | undefined, brick: SceneryBrick): boolean {
  const before = d3(store).scenery3d
  if (before.length >= MAX_SCENERY3D) return false
  const after = [...before, brick]
  setScenery(store, after)
  history?.push({ undo: () => setScenery(store, d3(store).scenery3d.filter((b) => b !== brick)), redo: () => setScenery(store, [...d3(store).scenery3d, brick]) })
  return true
}

/** Remove one build brick (one undo step). */
export function removeScenery(store: StudioStore, history: History | undefined, index: number): void {
  const before = d3(store).scenery3d
  const brick = before[index]
  if (!brick) return
  setScenery(store, before.filter((_, i) => i !== index))
  history?.push({
    undo: () => { const now = d3(store).scenery3d; setScenery(store, [...now.slice(0, index), brick, ...now.slice(index)]) },
    redo: () => setScenery(store, d3(store).scenery3d.filter((b) => b !== brick)),
  })
}

const uniqueCopyId = (design: LevelDesign3): string => {
  const taken = new Set(design.copies.map((c) => c.id))
  for (let n = 1; ; n++) if (!taken.has(`copy${n}`)) return `copy${n}`
}

function moveEdit(store: StudioStore, copyId: string, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
  const set = (p: { x: number; y: number; z: number }) => store.updateDesign((d) => ({ ...d, copies: d.copies.map((c) => (c.id === copyId ? { ...c, ...p } : c)) }))
  return { undo: () => set(from), redo: () => set(to) }
}

/** The bricks a code entry places, made if the project lacks them (Hero: the 3D Hero). */
function bricksFor(store: StudioStore, armed: Extract<Armed3, { kind: 'code' | 'own' }>): Array<{ brick: BrickDef3; offset: { x: number; y: number; z: number } }> {
  const design = d3(store)
  if (armed.kind === 'own') {
    const brick = design.bricks.find((b) => b.id === armed.brickId) as BrickDef3 | undefined
    return brick ? [{ brick, offset: { x: 0, y: 0, z: 0 } }] : []
  }
  if (armed.key === 'hero') {
    let hero = brickFor(design, HERO3D)
    if (!hero) {
      const made = createHero3d()
      store.updateDesign((d) => ({ ...d, bricks: [...d.bricks, made.brick] }), { [made.brick.id]: made.workspace })
      hero = made.brick
    }
    return [{ brick: hero, offset: { x: 0, y: 0, z: 0 } }]
  }
  const entry = CODE_BRICKS_3D.find((e) => e.key === armed.key)!
  const missing = missingBricks(design, entry)
  if (missing.length > 0) {
    store.updateDesign((d) => ({ ...d, bricks: [...d.bricks, ...missing.map((m) => m.brick)] }), Object.fromEntries(missing.map((m) => [m.brick.id, m.workspace])))
  }
  const now = d3(store)
  return entry.parts.map((p) => ({ brick: brickFor(now, p.id)!, offset: p.offset }))
}

/**
 * Place a code brick (and its partner: Button + Door) at a surface point. One undo step per copy. A one-per-world
 * brick (Hero, Goal) that is already placed moves instead. Returns the copy ids placed or moved.
 */
export function placeCode(store: StudioStore, history: History | undefined, armed: Extract<Armed3, { kind: 'code' | 'own' }>, at: Surface): string[] {
  const out: string[] = []
  // The first brick goes where the pointer is; a partner (the Button's Door) goes exactly its offset from that spot.
  let first: { x: number; z: number } | null = null
  for (const { brick, offset } of bricksFor(store, armed)) {
    const design = d3(store)
    const shape = brick.shape3d ?? DEFAULT_SHAPE3
    let spot: { x: number; y: number; z: number } | null
    if (!first) {
      spot = codePlacement(design, at, shape, offset.y)
      if (!spot) return out
      first = { x: spot.x, z: spot.z }
    } else {
      const x = first.x + offset.x
      const z = first.z + offset.z
      const plate = plateOf(design)
      const x0 = Math.round(x / STUD + plate / 2 - shape.w / STUD / 2)
      const z0 = Math.round(z / STUD + plate / 2 - shape.d / STUD / 2)
      spot = { x, y: supportTop(design.scenery3d, partsOf(design), x0, z0, Math.max(1, Math.round(shape.w / STUD)), Math.max(1, Math.round(shape.d / STUD))) * PLATE + offset.y, z }
    }
    const existing = brick.limit === 1 ? design.copies.find((c) => c.brickId === brick.id) : undefined
    if (existing) {
      const from = { x: existing.x, y: existing.y, z: existing.z }
      const edit = moveEdit(store, existing.id, from, spot)
      edit.redo()
      history?.push(edit)
      out.push(existing.id)
      continue
    }
    const copy: CopyPlacement3 = { id: uniqueCopyId(design), brickId: brick.id, ...spot }
    store.updateDesign((d) => ({ ...d, copies: [...d.copies, copy] }))
    if (history) history.push(addCopyEdit(history, copy))
    out.push(copy.id)
  }
  return out
}

/** Remove a placed code brick (not the Hero: a world keeps its Hero; place it again to move it). */
export function removeCode(store: StudioStore, history: History | undefined, copyId: string): boolean {
  const design = d3(store)
  const copy = design.copies.find((c) => c.id === copyId)
  if (!copy || copy.brickId === HERO3D || brickFor(design, HERO3D)?.id === copy.brickId) return false
  history?.push(removeCopyEdit(history, copy))
  store.deleteCopy(copy.id)
  return true
}
