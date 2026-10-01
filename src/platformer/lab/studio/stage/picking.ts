import type { CopyPlacement, Costume, LevelDesign, Target, World } from '../../core/contracts'
import { opaqueRect, transformOf, worldToCostume } from '../../core/geometry'
import { touchingPoint } from '../../core/touching'

function maskHit(costume: Costume, px: number, py: number): boolean {
  const rect = opaqueRect(costume)
  if (px < rect.left || px >= rect.right || py < rect.top || py >= rect.bottom) return false
  const mask = costume.mask
  if (!mask) return true
  if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) return false
  return mask.data[py * mask.width + px] !== 0
}

/** Check whether world coordinate (wx, wy) hits an opaque pixel of the painted copy. */
export function copyHitTest(design: LevelDesign, copy: CopyPlacement, wx: number, wy: number): boolean {
  if (copy.visible === false) return false
  const brick = design.bricks.find((b) => b.id === copy.brickId)
  if (!brick) return false
  const costume = brick.costumes[copy.costume ?? 0] ?? brick.costumes[0]
  if (!costume) return false

  // Create target-like transform
  const targetLike: Target = {
    id: copy.id,
    brickId: copy.brickId,
    isStage: false,
    isClone: false,
    x: copy.x,
    y: copy.y,
    direction: copy.direction ?? 90,
    size: copy.size ?? 100,
    visible: copy.visible ?? true,
    draggable: false,
    costumeIndex: copy.costume ?? 0,
    rotationStyle: 'all around',
    effects: { color: 0, fisheye: 0, whirl: 0, pixelate: 0, mosaic: 0, brightness: 0, ghost: 0 },
    volume: 100,
    soundEffects: { pitch: 0, pan: 0 },
    variables: {},
    lists: {},
    bubble: null,
    edgeHatState: {},
  }

  const transform = transformOf(targetLike)
  const [cx, cy] = worldToCostume(transform, costume, wx, wy)
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false
  return maskHit(costume, Math.floor(cx), Math.floor(cy))
}

/**
 * Pick the topmost painted copy under (wx, wy) in Build mode.
 * Copies are ordered back-to-front, so we test in reverse order (topmost first).
 */
export function pickCopy(design: LevelDesign, wx: number, wy: number): CopyPlacement | null {
  for (let i = design.copies.length - 1; i >= 0; i--) {
    const copy = design.copies[i]
    if (copyHitTest(design, copy, wx, wy)) {
      return copy
    }
  }
  return null
}

/**
 * Pick the topmost visible target under (wx, wy) in Play mode.
 * `world.targets` is ordered back-to-front (topmost is last).
 * Returns the topmost visible Target hit, or `world.stage` if none hit.
 */
export function pickTarget(world: World, wx: number, wy: number): Target {
  for (let i = world.targets.length - 1; i >= 0; i--) {
    const target = world.targets[i]
    // Scratch: a fully transparent (ghost 100) sprite can't be clicked.
    if (!target.visible || target.effects.ghost >= 100) continue
    if (touchingPoint(world, target, wx, wy)) {
      return target
    }
  }
  return world.stage
}
