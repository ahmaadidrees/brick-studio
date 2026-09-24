import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'

type GeneratedId = Exclude<CharacterId, 'classic'>
type Point = { x: number; y: number }
type Rect = readonly [x: number, y: number, width: number, height: number]
type Part = 'body' | 'arm' | 'thigh' | 'shin' | 'foot'

export interface GaitLeg {
  hip: Point
  knee: Point
  ankle: Point
  planted: boolean
  footAngle: number
}

/** A foot stays on the floor during stance, then lifts and travels forward during recovery. */
export function gaitLeg(phase: number, gait: 'walk' | 'run', height: number, hipY: number): GaitLeg {
  const p = ((phase % 1) + 1) % 1
  const stance = gait === 'walk' ? 0.62 : 0.38
  const stride = height * (gait === 'walk' ? 0.16 : 0.23)
  const planted = p < stance
  const t = planted ? p / stance : (p - stance) / (1 - stance)
  const ankle: Point = {
    x: planted ? stride * (1 - 2 * t) : -stride * Math.cos(Math.PI * t),
    y: -height * 0.088 - (planted ? 0 : Math.sin(Math.PI * t) * height * (gait === 'walk' ? 0.11 : 0.26)),
  }
  const hip = { x: 0, y: hipY }
  const upper = height * 0.20
  const lower = height * 0.20
  const dx = ankle.x - hip.x
  const dy = ankle.y - hip.y
  const distance = Math.min(upper + lower - 0.0001, Math.max(Math.hypot(dx, dy), 0.0001))
  // Choose the knee solution on the forward side of the leg, never a backwards-bending knee.
  const angle = Math.atan2(dy, dx) - Math.acos(Math.max(-1, Math.min(1, (upper * upper + distance * distance - lower * lower) / (2 * upper * distance))))
  const knee = { x: hip.x + Math.cos(angle) * upper, y: hip.y + Math.sin(angle) * upper }
  return { hip, knee, ankle, planted, footAngle: planted ? (t < 0.16 ? -0.16 * (1 - t / 0.16) : t > 0.8 ? (t - 0.8) * 1.7 : 0) : -0.12 }
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
  x: number, y: number, facing: 1 | -1, height: number,
): number | null {
  const image = warmLocomotion(id)
  if (!image) return null
  const cycle = phase * Math.PI * 2
  const bob = Math.sin(cycle * 2) * height * (gait === 'walk' ? 0.018 : 0.04)
  const hipY = -height * 0.35 + bob
  const near = gaitLeg(phase, gait, height, hipY)
  const far = gaitLeg(phase + 0.5, gait, height, hipY)
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
    ctx.rotate(Math.cos(cycle + offset) * (gait === 'run' ? 0.85 : 0.45))
    part('arm', 0, 0, height * 0.2, height * 0.30, 0.48, 0.06)
    ctx.restore()
  }
  ctx.save()
  ctx.translate(x, y)
  if (facing < 0) ctx.scale(-1, 1)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.filter = 'brightness(0.78)'
  arm(Math.PI, true)
  leg(far)
  ctx.filter = 'none'
  leg(near)
  const bodyHeight = height * 0.67
  const bodyRect = rects.body
  const bodyWidth = bodyHeight * bodyRect[2] / bodyRect[3]
  part('body', 0, hipY, bodyWidth, bodyHeight, id === 'brick-fox' ? 0.69 : 0.5, 0.92)
  arm(0, false)
  ctx.restore()
  return y + hipY - bodyHeight * 0.92
}
