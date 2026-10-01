import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'

type GeneratedId = Exclude<CharacterId, 'classic'>
export type Point = { x: number; y: number }
type Rect = readonly [x: number, y: number, width: number, height: number]
type Part = 'body' | 'arm' | 'thigh' | 'shin' | 'foot'

export interface GaitLeg {
  hip: Point
  knee: Point
  ankle: Point
  planted: boolean
  footAngle: number
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Grounded feet sweep backwards; a low recovery arc keeps running from looking like pedaling. */
export function gaitLeg(phase: number, gait: 'walk' | 'run', height: number, hipY: number, blend = gait === 'run' ? 1 : 0, weight = 1, neutralX = height * 0.035, floorY = -height * 0.088): GaitLeg {
  const p = ((phase % 1) + 1) % 1
  const run = clamp(blend)
  const amplitude = clamp(weight)
  const stance = mix(0.60, 0.44, run)
  const stride = height * mix(0.17, 0.205, run)
  const planted = p < stance
  const t = planted ? p / stance : (p - stance) / (1 - stance)
  const ankle: Point = {
    x: mix(neutralX, planted ? stride * (1 - 2 * t) : -stride * Math.cos(Math.PI * t), amplitude),
    y: floorY - (planted ? 0 : Math.sin(Math.PI * t) * height * mix(0.045, 0.11, run) * amplitude),
  }
  const hip = { x: 0, y: hipY }
  const upper = height * 0.215
  const lower = height * 0.215
  const dx = ankle.x - hip.x
  const dy = ankle.y - hip.y
  const distance = Math.min(upper + lower - 0.0001, Math.max(Math.hypot(dx, dy), 0.0001))
  const angle = Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance))))
  const knee = { x: hip.x + Math.cos(angle) * upper, y: hip.y + Math.sin(angle) * upper }
  return { hip, knee, ankle, planted, footAngle: planted ? 0 : -0.10 * amplitude }
}

export interface LocomotionOptions {
  blend?: number
  weight?: number
}

/** Common head/hip anchors for idle, walk and run, with a restrained character-specific bounce. */
export function locomotionAnchors(id: GeneratedId, phase: number, height: number, blend: number, weight = 1) {
  const run = clamp(blend)
  const amplitude = clamp(weight)
  const bounce = id === 'bolt-bot' ? 0.013 : id === 'brick-fox' ? 0.009 : 0.007
  const bob = (1 - Math.cos(phase * Math.PI * 4)) * height * mix(0.003, bounce, run) * amplitude
  const hipY = -height * 0.44 + bob
  const top = -height + bob
  return { hipY, top, bodyHeight: (hipY - top) / 0.92, lean: mix(0.018, id === 'brick-fox' ? 0.095 : 0.075, run) * amplitude }
}

// Source rectangles are measured from the opaque connected part in each generated atlas cell.
// The files stay unchanged; rendering attaches these parts at their hidden joint ends.
const PARTS: Record<GeneratedId, Record<Part, Rect>> = {
  builder: { body: [103, 12, 393, 489], arm: [701, 81, 203, 402], thigh: [1199, 72, 179, 398], shin: [186, 550, 140, 407], foot: [592, 639, 379, 262] },
  'bolt-bot': { body: [95, 10, 368, 483], arm: [669, 66, 232, 419], thigh: [1199, 71, 147, 406], shin: [190, 546, 141, 400], foot: [605, 655, 354, 252] },
  'brick-fox': { body: [25, 17, 471, 478], arm: [711, 57, 209, 437], thigh: [1166, 41, 192, 423], shin: [170, 529, 173, 439], foot: [599, 640, 366, 247] },
}

const images = new Map<GeneratedId, { image: HTMLImageElement; ready: boolean }>()

export function warmLocomotion(id: GeneratedId): HTMLImageElement | null {
  let entry = images.get(id)
  if (!entry) {
    if (typeof Image === 'undefined') return null
    const image = new Image()
    entry = { image, ready: false }
    const state = entry
    image.onload = () => { state.ready = image.naturalWidth === 1536 && image.naturalHeight === 1024 }
    image.decoding = 'async'
    image.src = `/platformer/characters/${id}-rig-v1.png`
    images.set(id, entry)
  }
  return entry.ready ? entry.image : null
}

export function drawLocomotion(
  ctx: CanvasRenderingContext2D, id: GeneratedId, phase: number, gait: 'walk' | 'run',
  x: number, y: number, facing: 1 | -1, height: number, options: LocomotionOptions = {},
): number | null {
  const image = warmLocomotion(id)
  if (!image) return null
  const cycle = phase * Math.PI * 2
  const blend = clamp(options.blend ?? (gait === 'run' ? 1 : 0))
  const weight = clamp(options.weight ?? 1)
  const { hipY, top, bodyHeight, lean } = locomotionAnchors(id, phase, height, blend, weight)
  const near = gaitLeg(phase, gait, height, hipY, blend, weight)
  const far = gaitLeg(phase + 0.5, gait, height, hipY, blend, weight, -height * 0.035)
  const rects = PARTS[id]
  const part = (name: Part, px: number, py: number, w: number, h: number, anchorX = 0.5, anchorY = 0) => {
    const [sx, sy, sw, sh] = rects[name]
    ctx.drawImage(image, sx, sy, sw, sh, px - w * anchorX, py - h * anchorY, w, h)
  }
  const segment = (name: 'thigh' | 'shin', from: Point, to: Point, width: number) => {
    ctx.save()
    ctx.translate(from.x, from.y)
    ctx.rotate(Math.atan2(to.y - from.y, to.x - from.x) - Math.PI / 2)
    part(name, 0, -width * 0.15, width, Math.hypot(to.x - from.x, to.y - from.y) + width * 0.3)
    ctx.restore()
  }
  const leg = (p: GaitLeg) => {
    segment('thigh', p.hip, p.knee, height * (id === 'bolt-bot' ? 0.105 : 0.12))
    segment('shin', p.knee, p.ankle, height * (id === 'bolt-bot' ? 0.095 : 0.1))
    ctx.save(); ctx.translate(p.ankle.x, p.ankle.y); ctx.rotate(p.footAngle)
    part('foot', 0, 0, height * 0.24, height * 0.16, 0.34, 0.45)
    ctx.restore()
  }
  const arm = (offset: number, back: boolean) => {
    ctx.save()
    ctx.translate(back ? height * 0.06 : -height * 0.055, hipY - height * 0.205)
    ctx.rotate(Math.cos(cycle + offset) * mix(0.40, id === 'bolt-bot' ? 0.65 : 0.78, blend) * weight)
    part('arm', 0, 0, height * 0.2, height * 0.30, 0.48, 0.06)
    ctx.restore()
  }
  ctx.save()
  ctx.translate(x, y)
  if (facing < 0) ctx.scale(-1, 1)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = 'brightness(0.78)'
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY)
  arm(Math.PI, true)
  ctx.restore()
  leg(far)
  ctx.filter = 'none'
  leg(near)
  ctx.save(); ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY)
  const bodyRect = rects.body
  const bodyWidth = bodyHeight * bodyRect[2] / bodyRect[3]
  part('body', 0, hipY, bodyWidth, bodyHeight, id === 'brick-fox' ? 0.69 : 0.5, 0.92)
  arm(0, false)
  ctx.restore()
  ctx.restore()
  return y + top
}
