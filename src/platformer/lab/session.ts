import { SUB, TICK_MS, TILE, TS } from '@brick-studio/platformer-core/engine/constants'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { T } from '@brick-studio/platformer-core/engine/tiles'
import { createWorld, type World } from '@brick-studio/platformer-core/engine/world'
import { Sound, type SoundName } from '../audio/sound'
import { Camera } from '../game/camera'
import { Renderer, type Particle } from '../render/renderer'
import { ProgramBook } from './book'
import { PLAYER_ID } from './bricks/builtins'
import { brickDef, levelFromJson, moveThing, placeThing, removeThing, setStart, setTiles, type LabDoc } from './level/doc'
import { MEMORY_ICONS, type LabDiagnostic, type LabKey, type LabSound, type MemoryName } from './program/types'
import { CostumeArt } from './render/costumes'
import { drawStage } from './render/stage'
import { COSTUME_BOX, findThing, placedSpot, spawnThing } from './sim/things'
import { NO_KEYS, type LabInput, type LabWorld, type Thing, type Trace } from './sim/types'
import { advance, createLabWorld } from './sim/world'
import { unride } from './runtime/runtime'

/*
 * A lab in progress: the lab document, the world (a still picture of the level while building, the running level
 * while playing), the camera, sound and keys, and the build tools. The page shows it and changes it through here;
 * code edits reach running things through the program book (see ProgramBook.update).
 */

export type LabMode = 'build' | 'play'
export type BuildTool = { kind: 'select' } | { kind: 'tile'; tile: number } | { kind: 'brick'; brick: string } | { kind: 'erase' } | { kind: 'start' }

const KEYMAP: Record<string, LabKey> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'space',
  KeyZ: 'z',
  KeyX: 'x',
  ShiftLeft: 'x',
  ShiftRight: 'x',
}

const SOUNDS: Record<LabSound, SoundName> = {
  hop: 'jump',
  boing: 'spring',
  coin: 'coin',
  squish: 'stomp',
  kick: 'kick',
  whoosh: 'throw',
  bounce: 'bounce',
  ouch: 'hurt',
  powerup: 'powerup',
  bump: 'bump',
  poof: 'poof',
  tada: 'goal',
  crash: 'break',
  thud: 'thud',
}

/** The keyboard, for the stage only: keys pressed while the code has focus are the code's. */
class LabKeys {
  private held = new Set<LabKey>()
  private pressed = new Set<LabKey>()
  private handlers: [string, (e: Event) => void][] = []

  constructor(private readonly enabled: () => boolean) {}

  attach(target: Window) {
    const down = (e: Event) => {
      const k = e as KeyboardEvent
      const key = KEYMAP[k.code]
      if (!key || k.metaKey || k.ctrlKey || k.altKey || !this.enabled() || typing(k.target)) return
      k.preventDefault()
      if (!this.held.has(key) && !k.repeat) this.pressed.add(key)
      this.held.add(key)
    }
    const up = (e: Event) => {
      const key = KEYMAP[(e as KeyboardEvent).code]
      if (key) this.held.delete(key)
    }
    const blur = () => this.clear()
    this.handlers = [
      ['keydown', down],
      ['keyup', up],
      ['blur', blur],
    ]
    for (const [n, h] of this.handlers) target.addEventListener(n, h)
  }

  detach(target: Window) {
    for (const [n, h] of this.handlers) target.removeEventListener(n, h)
    this.handlers = []
  }

  clear() {
    this.held.clear()
    this.pressed.clear()
  }

  isHeld(k: LabKey) {
    return this.held.has(k)
  }

  frame(): LabInput {
    const held = { left: false, right: false, up: false, down: false, space: false, z: false, x: false }
    for (const k of this.held) held[k] = true
    for (const k of this.pressed) held[k] = true
    const input = { held, pressed: [...this.pressed] }
    this.pressed.clear()
    if (held.left && held.right) held.left = held.right = false
    return input
  }
}

function typing(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  return !!t.closest('.lab-code, [role="menu"], [role="dialog"], .blocklyWidgetDiv, .blocklyDropDownDiv')
}

export interface WatchValue {
  key: string
  label: string
  value: string
  /** A memory that can be shown over the thing on the stage. */
  shown?: boolean
}

export interface WatchInfo {
  id: number
  brick: string
  values: WatchValue[]
}

export interface LabStatus {
  mode: LabMode
  active: boolean
  /** Things in the level by brick (the running world's while playing). */
  counts: [string, number][]
  watch: WatchInfo | null
}

const round1 = (v: number) => (Math.abs(v) < 0.05 ? '0' : (Math.round(v * 10) / 10).toString())

export class LabSession {
  readonly renderer: Renderer
  readonly sound = new Sound()
  readonly camera = new Camera()
  readonly keys = new LabKeys(() => this.active)
  readonly book: ProgramBook
  doc: LabDoc
  mode: LabMode = 'build'
  world: LabWorld
  frame = 0
  particles: Particle[] = []
  /** The thing whose code is open and whose values show. */
  watch = 0
  /** The stage has the keys (the last click was on it). */
  active = false
  tool: BuildTool = { kind: 'select' }
  hover: { x: number; y: number } | null = null
  /** Build: the placed thing picked (its level id), or 0. */
  selected = 0
  /** Problems running scripts ran into, by brick. */
  notes = new Map<string, LabDiagnostic[]>()
  onGlow: ((ids: string[]) => void) | null = null
  onStatus: (() => void) | null = null
  onNotes: (() => void) | null = null
  /** The lab changed on the stage (placing, moving, painting). */
  onDoc: ((doc: LabDoc) => void) | null = null
  /** A thing was clicked: open its code. */
  onOpen: ((brick: string) => void) | null = null

  private engine: World
  private art: CostumeArt | null = null
  private glow = new Map<string, number>()
  private glowKey = ''
  private raf = 0
  private acc = 0
  private lastNow = -1
  private lastStatus = 0
  private drag: { kind: 'thing'; id: number; player: boolean } | { kind: 'pan'; x: number; y: number; camX: number; camY: number } | { kind: 'paint' } | null = null
  private handlers: [EventTarget, string, (e: Event) => void][] = []

  constructor(
    readonly canvas: HTMLCanvasElement,
    doc: LabDoc,
  ) {
    this.renderer = new Renderer(canvas)
    this.doc = doc
    this.book = new ProgramBook(doc)
    this.sound.musicOn = false
    this.world = createLabWorld(levelFromJson(doc.level), this.book)
    this.engine = this.engineFor(this.world)
    this.watch = this.world.playerId
  }

  /** The /2d renderer draws the sky and the tiles from an engine world; this one shares the lab world's tiles. */
  private engineFor(w: LabWorld): World {
    const design: LevelDesign = {
      title: 'Code lab',
      width: w.width,
      height: w.height,
      theme: this.doc.level.theme,
      style: 'cartoon',
      tiles: w.tiles,
      contents: new Uint8Array(w.width * w.height),
      objects: [],
    }
    const ew = createWorld(design)
    ew.tiles = w.tiles
    return ew
  }

  /** Remember which placed thing is watched, to find it again in a world made anew. */
  private keepWatch(): () => void {
    const t = findThing(this.world, this.watch)
    const player = !t || t.id === this.world.playerId
    const spawn = t?.spawn ?? 0
    const brick = t?.brick
    return () => {
      const again = player ? undefined : this.world.things.find((x) => (spawn ? x.spawn === spawn : x.brick === brick))
      this.watch = again?.id ?? this.world.playerId
    }
  }

  private fresh() {
    const keep = this.keepWatch()
    this.world = createLabWorld(levelFromJson(this.doc.level), this.book)
    this.engine = this.engineFor(this.world)
    keep()
    this.particles = []
    this.glow.clear()
    this.notes = new Map()
    this.onNotes?.()
  }

  start() {
    this.keys.attach(window)
    const onDown = (e: Event) => {
      const inside = e.target instanceof Node && this.canvas.parentElement?.contains(e.target)
      if (!inside && this.active) {
        this.active = false
        this.keys.clear()
        this.onStatus?.()
      }
    }
    this.listen(document, 'pointerdown', onDown)
    this.listen(this.canvas, 'pointerdown', (e) => this.pointerDown(e as PointerEvent))
    this.listen(this.canvas, 'pointermove', (e) => this.pointerMove(e as PointerEvent))
    this.listen(window, 'pointerup', () => this.pointerUp())
    this.listen(this.canvas, 'contextmenu', (e) => e.preventDefault())
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      this.step(now)
    }
    this.raf = requestAnimationFrame(loop)
    if (import.meta.env.DEV) (window as unknown as { __lab?: LabSession }).__lab = this
  }

  stop() {
    cancelAnimationFrame(this.raf)
    this.keys.detach(window)
    for (const [t, n, h] of this.handlers) t.removeEventListener(n, h)
    this.handlers = []
    this.sound.setMusic(false)
  }

  private listen(target: EventTarget, name: string, h: (e: Event) => void) {
    target.addEventListener(name, h)
    this.handlers.push([target, name, h])
  }

  /** Give the stage the keys. */
  activate() {
    this.active = true
    this.sound.unlock()
    this.canvas.focus({ preventScroll: true })
    this.onStatus?.()
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.renderer.resize(cssW, cssH, dpr)
  }

  // -------------------------------------------------------------------------------------------------------------
  // The lab document

  /**
   * Take a new version of the lab. While playing, running things pick up changed code where they are; a renamed
   * brick (saved as a new one) is renamed in the running level first, so its things keep their code.
   */
  setDoc(doc: LabDoc, opts: { rename?: [string, string] } = {}) {
    if (opts.rename) for (const t of this.world.things) if (t.brick === opts.rename[0]) t.brick = opts.rename[1]
    const playing = this.mode === 'play'
    this.book.update(doc, playing ? this.world : null)
    this.doc = doc
    if (!playing) {
      // Building: the still picture of the level is made again from the new version.
      const keep = this.keepWatch()
      const tick = this.world.tick
      this.world = createLabWorld(levelFromJson(doc.level), this.book)
      this.world.tick = tick
      this.engine = this.engineFor(this.world)
      keep()
    }
    this.onDoc?.(doc)
  }

  setMode(mode: LabMode) {
    if (mode === this.mode) return
    this.mode = mode
    this.fresh()
    this.camera.reset()
    this.drag = null
    this.selected = 0
    if (mode === 'play') this.activate()
    this.sound.play('toggle')
    this.onStatus?.()
  }

  /** Start the level again from how it is built. */
  restart() {
    this.fresh()
    this.camera.reset()
    if (this.mode === 'play') this.activate()
    this.onStatus?.()
  }

  /** Open a brick's code: watch the thing of that brick nearest to you (or you). */
  open(brick: string, thing?: number) {
    if (thing && findThing(this.world, thing)?.brick === brick) {
      this.watch = thing
    } else if (brick === PLAYER_ID) {
      this.watch = this.world.playerId
    } else {
      const p = findThing(this.world, this.world.playerId)
      let best: Thing | undefined
      let bestD = Infinity
      for (const t of this.world.things) {
        if (t.removed || t.brick !== brick) continue
        const d = p ? Math.abs(t.x - p.x) + Math.abs(t.y - p.y) : 0
        if (d < bestD) {
          best = t
          bestD = d
        }
      }
      this.watch = best?.id ?? 0
    }
    this.glow.clear()
    this.glowKey = ''
    this.onGlow?.([])
    this.onStatus?.()
  }

  /**
   * Put a brick in the level near you (or near the middle of the view while building). While playing it also
   * appears in the running level. Returns the running thing's id.
   */
  addNear(brick: string): number {
    const def = brickDef(this.doc, brick)
    if (!def) return 0
    const p = findThing(this.world, this.world.playerId)
    let tx: number
    let ty: number
    if (this.mode === 'play' && p) {
      tx = Math.floor((p.x + p.w / 2) / TS) + 2 * p.facing
      ty = Math.floor((p.y + p.h - 1) / TS)
    } else {
      tx = Math.floor((this.camera.x + this.renderer.width / 2) / TILE)
      ty = Math.floor((this.camera.y + this.renderer.height / 2) / TILE)
    }
    ;[tx, ty] = this.freeSpot(tx, ty, def.costume)
    const placed = placeThing(this.doc, brick, tx, ty, p && p.facing < 0 ? -1 : 1)
    let id = 0
    if (this.mode === 'play') {
      this.book.update(placed.doc, this.world)
      this.doc = placed.doc
      const spot = placedSpot(def.costume, tx, ty)
      id = spawnThing(this.world, this.book, brick, spot.cx, spot.bottom, p && p.facing < 0 ? -1 : 1, placed.id).id
      this.onDoc?.(placed.doc)
    } else {
      this.setDoc(placed.doc)
      id = this.world.things.find((t) => t.spawn === placed.id)?.id ?? 0
      this.selected = placed.id
      if (id) this.watch = id
    }
    return id
  }

  /** A spot on the ground near (tx, ty) where the costume fits: down to the floor, then out of walls. */
  private freeSpot(tx: number, ty: number, costume: Thing['costume']): [number, number] {
    const w = this.world
    const wide = Math.max(1, Math.ceil(COSTUME_BOX[costume].w / TILE))
    const tall = Math.max(1, Math.ceil(COSTUME_BOX[costume].h / TILE))
    const solid = (x: number, y: number) => x < 0 || x >= w.width || (y >= 0 && y < w.height && w.tiles[y * w.width + x] !== T.EMPTY && w.tiles[y * w.width + x] !== T.LAVA)
    const fits = (x: number, y: number) => {
      for (let dx = 0; dx < wide; dx++) for (let dy = 0; dy < tall; dy++) if (solid(x + dx, y - dy)) return false
      return true
    }
    tx = Math.max(0, Math.min(w.width - wide, tx))
    ty = Math.max(tall - 1, Math.min(w.height - 3, ty))
    for (let k = 0; k < 12 && !fits(tx, ty); k++) ty--
    for (let k = 0; k < w.height && fits(tx, ty + 1) && ty + 1 < w.height - 1; k++) ty++
    return [tx, ty]
  }

  /** You hop off whatever you ride (a recipe is about to put something new next to you). */
  dismount() {
    const p = findThing(this.world, this.world.playerId)
    if (p?.riding) unride(this.world, p, true)
  }

  /** Show or hide one of the watched thing's memories over it on the stage. */
  toggleShown(key: string) {
    const t = findThing(this.world, this.watch)
    if (!t) return
    t.shown = t.shown.includes(key) ? t.shown.filter((k) => k !== key) : [...t.shown, key].slice(-3)
    this.onStatus?.()
  }

  status(): LabStatus {
    const counts = new Map<string, number>()
    if (this.mode === 'play') {
      for (const t of this.world.things) if (!t.removed && t.id !== this.world.playerId) counts.set(t.brick, (counts.get(t.brick) ?? 0) + 1)
    } else for (const t of this.doc.level.things) counts.set(t.brick, (counts.get(t.brick) ?? 0) + 1)
    return { mode: this.mode, active: this.active, counts: [...counts], watch: this.watchInfo() }
  }

  private watchInfo(): WatchInfo | null {
    const t = findThing(this.world, this.watch)
    if (!t) return null
    const values: WatchValue[] = []
    values.push({ key: 'speed-x', label: '→ speed', value: round1((t.vx / SUB) * 1) })
    values.push({ key: 'speed-y', label: '↑ speed', value: round1(-t.vy / SUB) })
    values.push({ key: 'ground', label: 'on the ground', value: t.onGround ? 'yes' : 'no' })
    if (t.rider) values.push({ key: 'rider', label: 'rider', value: t.rider === this.world.playerId ? 'you' : 'someone' })
    if (t.riding) {
      const v = findThing(this.world, t.riding)
      values.push({ key: 'riding', label: 'riding', value: v ? (brickDef(this.doc, v.brick)?.name ?? 'something') : 'something' })
    }
    for (const [name, v] of Object.entries(t.mem)) {
      values.push({ key: `my:${name}`, label: `${MEMORY_ICONS[name as MemoryName] ?? ''} ${name}`, value: typeof v === 'boolean' ? (v ? 'yes' : 'no') : round1(v), shown: t.shown.includes(`my:${name}`) })
    }
    return { id: t.id, brick: t.brick, values }
  }

  // -------------------------------------------------------------------------------------------------------------
  // The loop

  private step(now: number) {
    if (this.lastNow < 0) this.lastNow = now
    const dt = Math.min(250, now - this.lastNow)
    this.lastNow = now
    this.acc += dt / TICK_MS
    let n = Math.floor(this.acc)
    this.acc -= n
    if (n > 5) {
      this.acc = 0
      n = 5
    }
    for (let i = 0; i < n; i++) this.tick()
    this.frame++
    this.draw()
    if (this.frame % 4 === 0) this.updateGlow()
    if (now - this.lastStatus > 120) {
      this.lastStatus = now
      this.onStatus?.()
    }
  }

  private tick() {
    if (this.mode === 'play') {
      const input = this.active ? this.keys.frame() : NO_KEYS
      const trace: Trace = { thing: this.watch, blocks: new Set() }
      advance(this.world, this.book, input, trace)
      for (const id of trace.blocks) this.glow.set(id, this.frame)
      this.effects()
      if (this.world.notes.length) this.collectNotes()
      if (!findThing(this.world, this.watch)) this.watch = this.world.playerId
      this.follow()
    } else {
      if (this.active) {
        const input = this.keys.frame()
        const speed = input.held.x ? 10 : 5
        const dx = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0)
        const dy = (input.held.down ? 1 : 0) - (input.held.up ? 1 : 0)
        if (dx || dy) this.camera.pan(dx * speed, dy * speed, this.renderer.width, this.renderer.height, this.world.width * TILE, this.world.height * TILE)
      }
      if (!this.cameraSet) this.centerOnStart()
    }
    this.updateParticles()
  }

  private cameraSet = false

  private centerOnStart() {
    const w = this.world
    this.camera.jumpTo(w.start.x * TILE + TILE / 2, (w.start.y + 1) * TILE, this.renderer.width, this.renderer.height, w.width * TILE, w.height * TILE, 4 * TILE)
    this.cameraSet = true
  }

  private follow() {
    const p = findThing(this.world, this.world.playerId)
    if (!p) return
    const w = this.world
    this.cameraSet = true
    this.camera.follow((p.x + p.w / 2) / SUB, (p.y + p.h) / SUB, p.vx / SUB, p.onGround || !!p.riding, this.renderer.width, this.renderer.height, w.width * TILE, w.height * TILE)
  }

  private effects() {
    const camCx = this.camera.x + this.renderer.width / 2
    const camCy = this.camera.y + this.renderer.height / 2
    for (const e of this.world.effects) {
      const d = Math.max(Math.abs(e.x - camCx) - this.renderer.width / 2, Math.abs(e.y - camCy) - this.renderer.height / 2)
      const vol = d <= 0 ? 1 : Math.max(0, 1 - d / 160)
      if (e.kind === 'sound') {
        if (vol > 0) this.sound.play(SOUNDS[e.sound], vol)
      } else this.addParticle('poof', 3, e.x, e.y, 18)
    }
  }

  private collectNotes() {
    let changed = false
    for (const n of this.world.notes) {
      const list = this.notes.get(n.brick) ?? []
      if (list.some((d) => d.code === n.diagnostic.code && d.blockId === n.diagnostic.blockId)) continue
      list.push(n.diagnostic)
      this.notes.set(n.brick, list)
      changed = true
    }
    if (changed) this.onNotes?.()
  }

  private addParticle(key: string, frames: number, x: number, y: number, life: number) {
    if (this.particles.length > 200) return
    this.particles.push({ key, frames, x, y, vx: 0, vy: 0, g: 0, age: 0, life })
  }

  private updateParticles() {
    let j = 0
    for (const q of this.particles) {
      q.x += q.vx
      q.vy += q.g
      q.y += q.vy
      q.age++
      if (q.age < q.life) this.particles[j++] = q
    }
    this.particles.length = j
  }

  private updateGlow() {
    const ids: string[] = []
    for (const [id, seen] of this.glow) {
      if (this.frame - seen <= 10) ids.push(id)
      else this.glow.delete(id)
    }
    ids.sort()
    const key = ids.join('|')
    if (key === this.glowKey) return
    this.glowKey = key
    this.onGlow?.(ids)
  }

  private draw() {
    const build = this.mode === 'build'
    const ghost = build && this.tool.kind === 'brick' ? brickDef(this.doc, this.tool.brick) : undefined
    this.renderer.draw({
      world: this.engine,
      camX: this.camera.x,
      camY: this.camera.y,
      frame: this.frame,
      players: [],
      particles: this.particles,
      localNum: 1,
      localCheckpoint: 0,
      hud: null,
      overlay: (ctx, skin, camX, camY) => {
        if (!this.art || this.art.scale !== skin.scale) this.art = new CostumeArt(skin.scale)
        drawStage(
          ctx,
          skin,
          this.art,
          {
            world: this.world,
            frame: this.frame,
            watch: this.watch,
            build,
            hover: build ? this.hover : null,
            ghost: ghost ? { costume: ghost.costume, w: COSTUME_BOX[ghost.costume].w } : null,
            erasing: this.tool.kind === 'erase',
            selected: this.selected ? (this.world.things.find((t) => t.spawn === this.selected)?.id ?? 0) : 0,
          },
          camX,
          camY,
          this.renderer.width,
          this.renderer.height,
        )
      },
    })
  }

  // -------------------------------------------------------------------------------------------------------------
  // Pointer

  private cellAt(e: PointerEvent): { x: number; y: number; wx: number; wy: number } {
    const [wx, wy] = this.renderer.toWorld(e.clientX, e.clientY, this.camera.x, this.camera.y)
    return { x: Math.floor(wx / TILE), y: Math.floor(wy / TILE), wx, wy }
  }

  /** The thing under a point: small things get a whole brick to click on. */
  thingAt(wx: number, wy: number): Thing | undefined {
    const px = wx * SUB
    const py = wy * SUB
    const list = this.world.things.filter((t) => !t.removed && !t.riding)
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]
      const w = Math.max(t.w, TS)
      const h = Math.max(t.h, TS)
      const cx = t.x + t.w / 2
      if (px >= cx - w / 2 && px < cx + w / 2 && py >= t.y + t.h - h && py < t.y + t.h) return t
    }
    return undefined
  }

  private pointerDown(e: PointerEvent) {
    this.activate()
    const c = this.cellAt(e)
    const hit = this.thingAt(c.wx, c.wy)
    if (this.mode === 'play') {
      if (hit) {
        this.onOpen?.(hit.brick)
        this.open(hit.brick, hit.id)
      }
      return
    }
    const erase = e.button === 2 || this.tool.kind === 'erase'
    if (erase) {
      if (hit && hit.id !== this.world.playerId && hit.spawn) this.setDoc(removeThing(this.doc, hit.spawn))
      else this.paint(c.x, c.y, T.EMPTY)
      this.drag = { kind: 'paint' }
      this.sound.play('erase')
      return
    }
    switch (this.tool.kind) {
      case 'select':
        if (hit) {
          this.onOpen?.(hit.brick)
          this.open(hit.brick, hit.id)
          this.selected = hit.spawn
          this.drag = { kind: 'thing', id: hit.spawn, player: hit.id === this.world.playerId }
        } else {
          this.selected = 0
          this.drag = { kind: 'pan', x: e.clientX, y: e.clientY, camX: this.camera.x, camY: this.camera.y }
        }
        this.onStatus?.()
        return
      case 'tile':
        this.paint(c.x, c.y, this.tool.tile)
        this.drag = { kind: 'paint' }
        this.sound.play('place')
        return
      case 'brick': {
        const brick = this.tool.brick
        const def = brickDef(this.doc, brick)
        if (!def) return
        const placed = placeThing(this.doc, brick, c.x, c.y, 1)
        this.setDoc(placed.doc)
        this.selected = placed.id
        this.watch = this.world.things.find((t) => t.spawn === placed.id)?.id ?? this.watch
        this.sound.play('place')
        this.onStatus?.()
        return
      }
      case 'start':
        this.setDoc(setStart(this.doc, c.x, c.y))
        this.sound.play('place')
        return
    }
  }

  private pointerMove(e: PointerEvent) {
    const c = this.cellAt(e)
    const changed = !this.hover || this.hover.x !== c.x || this.hover.y !== c.y
    this.hover = { x: c.x, y: c.y }
    const d = this.drag
    if (!d || this.mode !== 'build') return
    if (d.kind === 'pan') {
      const r = this.canvas.getBoundingClientRect()
      const k = r.width > 0 ? this.renderer.width / r.width : 1
      this.camera.x = d.camX - (e.clientX - d.x) * k
      this.camera.y = d.camY - (e.clientY - d.y) * k
      this.camera.pan(0, 0, this.renderer.width, this.renderer.height, this.world.width * TILE, this.world.height * TILE)
      return
    }
    if (!changed) return
    if (d.kind === 'paint') {
      if (this.tool.kind === 'tile') this.paint(c.x, c.y, this.tool.tile)
      else if (this.tool.kind === 'erase' || e.buttons === 2) this.paint(c.x, c.y, T.EMPTY)
      return
    }
    if (d.kind === 'thing') {
      if (d.player) this.setDoc(setStart(this.doc, c.x, c.y))
      else this.setDoc(moveThing(this.doc, d.id, c.x, c.y))
    }
  }

  private pointerUp() {
    this.drag = null
  }

  private paint(x: number, y: number, t: number) {
    const next = setTiles(this.doc, [{ x, y, t }])
    if (next !== this.doc) this.setDoc(next)
  }
}
