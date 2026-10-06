import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import { APPROVED_MOTION } from './approvedMotionData'

type GeneratedId = Exclude<CharacterId, 'classic'>
const images = new Map<string, HTMLImageElement>()
const requested = new Set<string>()

export function warmApprovedMotion(id: GeneratedId) {
  for (const loop of Object.values(APPROVED_MOTION[id])) for (const frame of loop.frames) {
    if (requested.has(frame.url)) continue
    requested.add(frame.url)
    const image = new Image()
    image.onload = () => images.set(frame.url, image)
    image.src = frame.url
  }
}

export function approvedFrameIndex(phase: number, count: number): number {
  return Math.min(count - 1, Math.floor((((phase % 1) + 1) % 1) * count))
}

export function drawApprovedMotion(ctx: CanvasRenderingContext2D, id: GeneratedId, phase: number, gait: 'walk' | 'run', x: number, floor: number, facing: number, height: number): number | null {
  const loop = APPROVED_MOTION[id][gait]
  // Wait for the complete loop so a late frame cannot flash a different character pose.
  if (!loop.frames.every(frame => images.has(frame.url))) return null
  const frame = loop.frames[approvedFrameIndex(phase, loop.frames.length)]
  const image = images.get(frame.url)!
  const scale = height / loop.referenceHeight * frame.scale
  ctx.save()
  ctx.translate(x, floor)
  ctx.scale(facing, 1)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, -frame.anchorX * scale, -frame.baseline * scale, image.naturalWidth * scale, image.naturalHeight * scale)
  ctx.restore()
  return floor + (frame.sourceTop - frame.baseline) * scale
}
