import { TILE } from '@brick-studio/platformer-core/engine/constants'
import type { EditOp } from '@brick-studio/platformer-core/engine/events'
import { SINGLETON_KINDS, randomObjectId, type LevelObject, type ObjKind } from '@brick-studio/platformer-core/engine/level'
import { C, T, holdsContent } from '@brick-studio/platformer-core/engine/tiles'
import type { World } from '@brick-studio/platformer-core/engine/world'
import type { SoundName } from '../audio/sound'
import type { Atlas } from '../render/atlas'
import { PALETTE, type PaletteItem } from './palette'

/*
 * The level editor. It never changes the world directly: every placement becomes an edit op,
 * sent through the same event pipeline as stomps and coins, so solo editing and co-editing a
 * shared room work the same way. Ops made within one tick are sent together.
 */

export interface EditorHost {
  world(): World
  sound(name: SoundName): void
}

interface Stroke {
  erase: boolean
  last: [number, number] | null
  redo: EditOp[]
  undo: EditOp[]
}

interface UndoEntry {
  redo: EditOp[]
  undo: EditOp[]
}

const MAX_UNDO = 200

/** Tile bounds an object covers on screen, used for hit-testing. */
export function footprint(o: LevelObject): [number, number, number, number] {
  switch (o.kind) {
    case 'platform':
      return [o.x, o.y, o.x + 2, o.y]
    case 'goal':
      return [o.x, o.y - 9, o.x, o.y]
    case 'checkpoint':
      return [o.x, o.y - 1, o.x, o.y]
    default:
      return [o.x, o.y, o.x, o.y]
  }
}

export class Editor {
  item: PaletteItem = PALETTE[0]
  erasing = false
  /** Direction for newly placed enemies and platforms (R flips it). */
  dir: 1 | -1 = -1
  hover: [number, number] | null = null
  undoStack: UndoEntry[] = []
  redoStack: UndoEntry[] = []
  /** Something changed that the UI shows (tool, item, undo availability). */
  onChange: (() => void) | null = null
  private stroke: Stroke | null = null
  private pending: EditOp[] = []
  /**
   * Tile edits sent but not yet visible in the world, so a fast drag sees its own work. Each entry
   * remembers when it was made; in a room someone else may overwrite the tile, so entries expire.
   */
  private overlay = new Map<number, [number, number, number]>()

  constructor(private readonly host: EditorHost) {}

  select(item: PaletteItem) {
    this.item = item
    this.erasing = false
    this.onChange?.()
  }

  setErasing(on: boolean) {
    this.erasing = on
    this.onChange?.()
  }

  flip() {
    this.dir = this.dir === 1 ? -1 : 1
    this.onChange?.()
  }

  // --- Pointer --------------------------------------------------------------------------------

  pointerDown(wx: number, wy: number, erase: boolean) {
    const cell = this.cell(wx, wy)
    this.stroke = { erase: erase || this.erasing, last: null, redo: [], undo: [] }
    this.redoStack = []
    if (cell) this.applyAt(cell[0], cell[1], true)
  }

  pointerMove(wx: number, wy: number) {
    const cell = this.cell(wx, wy)
    this.hover = cell
    if (!this.stroke || !cell) return
    const [x, y] = cell
    const last = this.stroke.last
    if (last && last[0] === x && last[1] === y) return
    // Only tiles are painted by dragging; objects are placed one click at a time.
    if (!this.stroke.erase && this.item.place.kind !== 'tile' && !(this.item.place.kind === 'content' && this.item.place.fallback.kind === 'tile')) return
    if (last) for (const [lx, ly] of line(last[0], last[1], x, y).slice(1)) this.applyAt(lx, ly, false)
    else this.applyAt(x, y, false)
  }

  pointerUp() {
    const s = this.stroke
    this.stroke = null
    if (!s || s.redo.length === 0) return
    this.undoStack.push({ redo: s.redo, undo: s.undo.reverse() })
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift()
    this.onChange?.()
  }

  cancelStroke() {
    this.pointerUp()
  }

  /** Throw away the stroke in progress, undoing what it placed (a second finger became a pan). */
  abortStroke() {
    const s = this.stroke
    this.stroke = null
    if (s && s.undo.length) this.send([...s.undo].reverse())
  }

  leave() {
    this.hover = null
  }

  undo() {
    if (this.stroke) return
    const e = this.undoStack.pop()
    if (!e) return
    this.redoStack.push(e)
    this.send(e.undo)
    this.host.sound('erase')
    this.onChange?.()
  }

  redo() {
    if (this.stroke) return
    const e = this.redoStack.pop()
    if (!e) return
    this.undoStack.push(e)
    this.send(e.redo)
    this.host.sound('place')
    this.onChange?.()
  }

  /** Ops to send this tick. */
  flush(): EditOp[] {
    const ops = this.pending
    this.pending = []
    // Forget overlay entries the world has caught up with, or that are old enough to be stale.
    const w = this.host.world()
    for (const [i, [t, c, at]] of this.overlay) {
      if ((w.design.tiles[i] === t && w.design.contents[i] === c) || w.tick - at > 30) this.overlay.delete(i)
    }
    return ops
  }

  // --- Placement ------------------------------------------------------------------------------

  private cell(wx: number, wy: number): [number, number] | null {
    const w = this.host.world()
    const x = Math.floor(wx / TILE)
    const y = Math.floor(wy / TILE)
    if (x < 0 || y < 0 || x >= w.width || y >= w.height) return null
    return [x, y]
  }

  private send(ops: EditOp[]) {
    const w = this.host.world()
    for (const op of ops) {
      if (op.o === 'tile') this.overlay.set(op.y * w.width + op.x, [op.t, op.c, w.tick])
      this.pending.push(op)
    }
  }

  private record(op: EditOp, inverse: EditOp[]) {
    this.send([op])
    if (this.stroke) {
      this.stroke.redo.push(op)
      this.stroke.undo.push(...inverse)
    }
  }

  private tileAt(x: number, y: number): [number, number] {
    const w = this.host.world()
    const i = y * w.width + x
    const o = this.overlay.get(i)
    return o ? [o[0], o[1]] : [w.design.tiles[i], w.design.contents[i]]
  }

  private objectAt(x: number, y: number): LevelObject | undefined {
    const objs = this.host.world().design.objects
    for (let k = objs.length - 1; k >= 0; k--) {
      const [x0, y0, x1, y1] = footprint(objs[k])
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return objs[k]
    }
    return undefined
  }

  private setTile(x: number, y: number, t: number, c: number) {
    const [ct, cc] = this.tileAt(x, y)
    const content = holdsContent(t) ? c : 0
    if (ct === t && cc === content) return false
    this.record({ o: 'tile', x, y, t, c: content }, [{ o: 'tile', x, y, t: ct, c: cc }])
    return true
  }

  private deleteObject(o: LevelObject) {
    this.record({ o: 'del', id: o.id }, [{ o: 'add', obj: { ...o } }])
  }

  private applyAt(x: number, y: number, click: boolean) {
    if (!this.stroke) return
    this.stroke.last = [x, y]
    const before = this.stroke.redo.length
    if (this.stroke.erase) this.eraseAt(x, y)
    else this.placeAt(x, y, click)
    if (this.stroke.redo.length > before) this.host.sound(this.stroke.erase ? 'erase' : 'place')
  }

  private eraseAt(x: number, y: number) {
    const o = this.objectAt(x, y)
    if (o) {
      this.deleteObject(o)
      return
    }
    const [t] = this.tileAt(x, y)
    if (t === T.PIPE_L || t === T.PIPE_R) this.erasePipe(x, y)
    else if (t !== T.EMPTY) this.setTile(x, y, T.EMPTY, 0)
  }

  private erasePipe(x: number, y: number) {
    const [t] = this.tileAt(x, y)
    const left = t === T.PIPE_L ? x : x - 1
    const w = this.host.world()
    // Walk up and down the pipe's two columns.
    let top = y
    while (top > 0 && this.tileAt(left, top - 1)[0] === T.PIPE_L) top--
    let bottom = y
    while (bottom < w.height - 1 && this.tileAt(left, bottom + 1)[0] === T.PIPE_L) bottom++
    for (let r = top; r <= bottom; r++) {
      if (this.tileAt(left, r)[0] === T.PIPE_L) this.setTile(left, r, T.EMPTY, 0)
      if (left + 1 < w.width && this.tileAt(left + 1, r)[0] === T.PIPE_R) this.setTile(left + 1, r, T.EMPTY, 0)
    }
  }

  private placeAt(x: number, y: number, click: boolean) {
    const p = this.item.place
    switch (p.kind) {
      case 'tile': {
        const o = this.objectAt(x, y)
        if (o && o.x === x && o.y === y) this.deleteObject(o)
        this.setTile(x, y, p.tile, p.content)
        return
      }
      case 'pipe':
        if (click) this.placePipe(x, y)
        return
      case 'object':
        if (click) this.placeObject(x, y, p.obj, p.alt)
        return
      case 'content': {
        const [t] = this.tileAt(x, y)
        if (t === T.QBLOCK || t === T.BRICK) {
          this.setTile(x, y, t, p.content)
          return
        }
        if (p.fallback.kind === 'tile') {
          const o = this.objectAt(x, y)
          if (o && o.x === x && o.y === y) this.deleteObject(o)
          this.setTile(x, y, p.fallback.tile, 0)
        } else if (click) this.placeObject(x, y, p.fallback.obj, 0)
        return
      }
    }
  }

  private placePipe(x: number, y: number) {
    const w = this.host.world()
    if (x + 1 >= w.width) return
    let bottom = y
    while (bottom < w.height - 1 && bottom - y < 15) {
      const [a] = this.tileAt(x, bottom + 1)
      const [b] = this.tileAt(x + 1, bottom + 1)
      if (a !== T.EMPTY || b !== T.EMPTY) break
      bottom++
    }
    for (let r = y; r <= bottom; r++) {
      this.setTile(x, r, T.PIPE_L, 0)
      this.setTile(x + 1, r, T.PIPE_R, 0)
    }
  }

  private placeObject(x: number, y: number, kind: ObjKind, alt: 0 | 1) {
    const w = this.host.world()
    const [t] = this.tileAt(x, y)
    if (SINGLETON_KINDS.has(kind)) {
      const existing = w.design.objects.find((o) => o.kind === kind)
      if (existing) {
        if (existing.x === x && existing.y === y) return
        if (t !== T.EMPTY) this.setTile(x, y, T.EMPTY, 0)
        this.record({ o: 'move', id: existing.id, x, y }, [{ o: 'move', id: existing.id, x: existing.x, y: existing.y }])
        return
      }
    }
    const here = this.objectAt(x, y)
    if (here) {
      if (here.kind === kind && here.dir === this.dir && here.alt === alt && here.x === x && here.y === y) return
      this.deleteObject(here)
    }
    if (t !== T.EMPTY && t !== T.COIN) this.setTile(x, y, T.EMPTY, 0)
    const obj: LevelObject = { id: randomObjectId(), kind, x, y, dir: kind === 'platform' ? (this.dir === -1 ? 1 : -1) : this.dir, alt }
    this.record({ o: 'add', obj }, [{ o: 'del', id: obj.id }])
  }

  // --- Drawing --------------------------------------------------------------------------------

  drawOverlay(ctx: CanvasRenderingContext2D, atlas: Atlas, w: World, camX: number, camY: number, viewW: number, viewH: number, frame: number) {
    camX = Math.round(camX)
    camY = Math.round(camY)
    const x0 = Math.max(0, Math.floor(camX / TILE))
    const y0 = Math.max(0, Math.floor(camY / TILE))
    const x1 = Math.min(w.width - 1, Math.floor((camX + viewW) / TILE))
    const y1 = Math.min(w.height - 1, Math.floor((camY + viewH) / TILE))
    // Grid
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    for (let x = x0; x <= x1 + 1; x++) ctx.fillRect(x * TILE - camX, Math.max(0, -camY), 1, Math.min(viewH, w.height * TILE - camY))
    for (let y = y0; y <= y1 + 1; y++) ctx.fillRect(Math.max(0, -camX), y * TILE - camY, Math.min(viewW, w.width * TILE - camX), 1)
    // Outside the level
    ctx.fillStyle = 'rgba(13,11,22,0.55)'
    if (camX < 0) ctx.fillRect(0, 0, -camX, viewH)
    const right = w.width * TILE - camX
    if (right < viewW) ctx.fillRect(right, 0, viewW - right, viewH)
    const bottom = w.height * TILE - camY
    if (bottom < viewH) ctx.fillRect(0, bottom, viewW, viewH - bottom)
    // What is hidden inside blocks
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w.width + x
        const t = w.tiles[i]
        const c = w.design.contents[i]
        if ((t !== T.QBLOCK && t !== T.BRICK) || c === C.NONE || (t === T.QBLOCK && c === C.COIN)) continue
        const icon = atlas.get(c === C.GROW ? 'grow' : c === C.SPARK ? 'sparkitem:1' : 'coin:0')
        ctx.drawImage(icon, x * TILE - camX + 4, y * TILE - camY + 3, 8, 8)
      }
    }
    // Where enemies and gizmos start (the live ones wander off)
    ctx.globalAlpha = 0.5
    for (const o of w.design.objects) {
      const key = ghostKey(o)
      if (!key) continue
      const img = atlas.get(key)
      const px = o.kind === 'platform' ? o.x * TILE : o.x * TILE + TILE / 2 - img.width / 2
      const py = o.kind === 'platform' ? o.y * TILE : (o.y + 1) * TILE - img.height
      if (px - camX > viewW || px + img.width - camX < 0 || py - camY > viewH || py + img.height - camY < 0) continue
      ctx.drawImage(img, Math.round(px) - camX, Math.round(py) - camY)
      if (o.kind === 'platform') {
        ctx.fillStyle = '#ffcf33'
        const d = o.dir * 5 * TILE
        for (let k = 0; k <= 20; k++) {
          const f = k / 20
          if (o.alt === 0) ctx.fillRect(Math.round(px + 24 + d * f) - camX, Math.round(py + 3) - camY, 1, 1)
          else ctx.fillRect(Math.round(px + 24) - camX, Math.round(py + 3 + d * f) - camY, 1, 1)
        }
      }
    }
    ctx.globalAlpha = 1
    // Cursor
    if (this.hover) {
      const [hx, hy] = this.hover
      const sx = hx * TILE - camX
      const sy = hy * TILE - camY
      if (this.erasing) {
        ctx.strokeStyle = '#ff5a4a'
        ctx.lineWidth = 1
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1)
        ctx.fillStyle = '#ff5a4a'
        for (let k = 3; k < 13; k++) {
          ctx.fillRect(sx + k, sy + k, 1, 1)
          ctx.fillRect(sx + 15 - k, sy + k, 1, 1)
        }
      } else {
        const key = cursorKey(this.item, this.dir)
        const img = atlas.get(key)
        ctx.globalAlpha = 0.6 + 0.2 * Math.sin(frame / 8)
        const ox = this.item.place.kind === 'object' && this.item.place.obj === 'platform' ? 0 : TILE / 2 - img.width / 2
        const oy = this.item.place.kind === 'object' && this.item.place.obj === 'platform' ? 0 : TILE - img.height
        ctx.drawImage(img, Math.round(sx + ox), Math.round(sy + oy))
        ctx.globalAlpha = 1
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1
        ctx.strokeRect(sx + 0.5, sy + 0.5, TILE - 1, TILE - 1)
      }
    }
  }
}

function ghostKey(o: LevelObject): string | null {
  const f = o.dir < 0 ? '|f' : ''
  switch (o.kind) {
    case 'walker':
      return `walker:1${f}`
    case 'shellbug':
      return `shellbug:1${f}`
    case 'spiky':
      return `spiky:1${f}`
    case 'flyer':
      return `flyer:1${f}`
    case 'platform':
      return 'lift'
    case 'grow':
      return 'grow'
    case 'spark':
      return 'sparkitem:1'
    default:
      return null
  }
}

function cursorKey(item: PaletteItem, dir: 1 | -1): string {
  if (item.place.kind === 'object' && ['walker', 'shellbug', 'spiky', 'flyer'].includes(item.place.obj)) return item.icon + (dir < 0 ? '|f' : '')
  if (item.id === 'goal') return 'goal'
  if (item.id === 'pipe') return 'pipe:L:1'
  return item.icon
}

/** Tiles on the line between two cells (Bresenham), inclusive. */
export function line(x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const out: [number, number][] = []
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  let x = x0
  let y = y0
  for (;;) {
    out.push([x, y])
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return out
}
