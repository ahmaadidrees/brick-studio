import type {
  Bubble,
  CopyPlacement,
  Costume,
  LevelDesign,
  RotationStyle,
  StageBounds,
  Target,
  World,
} from '../../core/contracts'
import { boundsFor, opaqueRect, transformOf } from '../../core/geometry'
import { getCameraZoom, snapToGrid, worldToScreen, type Camera, type Viewport } from './camera'
import { parseGridCopyId, TILE_SIZE } from '../../core/contracts'
import { cellCostumeIndex, drawCellOutline, gridBrickIndex, visibleCells } from './gridCells'
import { drawSky } from './sky'

/** The Brickgineers look: cream outside the level, a sky-blue level. */
const OUTSIDE = '#efe9da'
const SKY = '#cfe8f7'

export class ImageCache {
  private cache = new Map<string, HTMLImageElement>()
  private listeners = new Set<() => void>()

  getImage(assetUrl: string): HTMLImageElement | undefined {
    let img = this.cache.get(assetUrl)
    if (!img) {
      if (typeof Image === 'undefined') return undefined
      img = new Image()
      img.src = assetUrl
      img.onload = () => {
        for (const l of this.listeners) l()
      }
      this.cache.set(assetUrl, img)
    }
    return img.complete && img.naturalWidth > 0 ? img : undefined
  }

  onImageLoaded(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export const globalImageCache = new ImageCache()

export interface TargetPose {
  x: number
  y: number
  direction: number
  size: number
}

export interface RenderOptions {
  camera: Camera
  viewport: Viewport
  showGrid?: boolean
  gridSnap?: boolean
  selectedCopyId?: string | null
  hoverCopyId?: string | null
  brushBrickId?: string | null
  brushPreviewPos?: { x: number; y: number } | null
  tool?: 'select' | 'brush'
  /** The cell under the pointer with the armed grid brick's first costume (or the eraser, costume null). */
  tileHover?: { col: number; row: number; costume: Costume | null; erase: boolean } | null
  /** Previous tick positions for interpolation during Play. Keyed by target ID. */
  prevPoses?: Map<string, TargetPose>
  /** Interpolation weight in [0, 1). */
  interpAlpha?: number
}

/**
 * Render the level in Build mode from LevelDesign.
 */
export function renderBuildMode(
  ctx: CanvasRenderingContext2D,
  design: LevelDesign,
  opts: RenderOptions,
  imageCache: ImageCache = globalImageCache,
): void {
  const { camera, viewport } = opts
  const zoom = getCameraZoom(camera, viewport)

  // 1. Clear background
  ctx.fillStyle = OUTSIDE
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  // 2. Render level bounds & background
  const bounds = design.bounds
  const [lX, tY] = worldToScreen(camera, viewport, bounds.left, bounds.top)
  const [rX, bY] = worldToScreen(camera, viewport, bounds.right, bounds.bottom)
  const lvlW = rX - lX
  const lvlH = bY - tY

  // Level area
  ctx.fillStyle = SKY
  ctx.fillRect(lX, tY, lvlW, lvlH)

  // Stage backdrop if present, otherwise the Brickgineers day sky and hills
  const backdrop = design.stage.costumes[0]
  if (backdrop?.asset) {
    const img = imageCache.getImage(backdrop.asset)
    if (img) {
      ctx.drawImage(img, lX, tY, lvlW, lvlH)
    }
  } else {
    drawSky(ctx, bounds, camera, viewport)
  }

  // Grid lines
  if (opts.showGrid || opts.gridSnap) {
    drawGrid(ctx, camera, viewport, bounds, 16)
  }

  // Level boundary stroke & outside dimming
  ctx.save()
  ctx.strokeStyle = '#8aa3bb'
  ctx.lineWidth = 2
  ctx.strokeRect(lX, tY, lvlW, lvlH)

  // Corner labels
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillStyle = '#5b7287'
  ctx.fillText(`(0, 0)`, lX + 6, bY - 6)
  const dimText = `${bounds.right - bounds.left} × ${bounds.top - bounds.bottom}`
  ctx.fillText(dimText, rX - ctx.measureText(dimText).width - 6, tY + 14)
  ctx.restore()

  // Grid cells sit behind the copies (a Hero standing in front of a cell is drawn, and picked, first)
  drawGridCells(ctx, design, camera, viewport, imageCache)

  // 3. Render painted copies in design.copies order
  for (const copy of design.copies) {
    if (copy.visible === false) continue
    const brick = design.bricks.find((b) => b.id === copy.brickId)
    if (!brick) continue
    const costume = brick.costumes[copy.costume ?? 0] ?? brick.costumes[0]
    if (!costume) continue

    const isSelected = opts.selectedCopyId === copy.id
    const isHovered = opts.hoverCopyId === copy.id && !isSelected

    drawSprite(ctx, camera, viewport, {
      x: copy.x,
      y: copy.y,
      direction: copy.direction ?? 90,
      size: copy.size ?? 100,
      costume,
      rotationStyle: 'all around',
      imageCache,
    })

    if (isSelected || isHovered) {
      drawCopyOutline(ctx, camera, viewport, copy, costume, isSelected)
    }
  }

  // 4. Brush preview
  if (opts.tileHover) drawCellHover(ctx, camera, viewport, opts.tileHover, imageCache)
  // The selected (or hovered) cell
  for (const [id, selected] of [[opts.hoverCopyId, false], [opts.selectedCopyId, true]] as const) {
    const cell = id ? parseGridCopyId(id) : null
    if (cell && design.tiles?.data[cell.row]?.[cell.col] && design.tiles.data[cell.row][cell.col] !== '.') drawCellOutline(ctx, camera, viewport, cell.col, cell.row, selected)
  }
  if (opts.tool === 'brush' && opts.brushBrickId && opts.brushPreviewPos) {
    const brick = design.bricks.find((b) => b.id === opts.brushBrickId)
    const costume = brick?.costumes[0]
    if (costume) {
      let px = opts.brushPreviewPos.x
      let py = opts.brushPreviewPos.y
      if (opts.gridSnap) {
        px = snapToGrid(px, 8)
        py = snapToGrid(py, 8)
      }
      ctx.save()
      ctx.globalAlpha = 0.55
      drawSprite(ctx, camera, viewport, {
        x: px,
        y: py,
        direction: 90,
        size: 100,
        costume,
        rotationStyle: 'all around',
        imageCache,
      })
      ctx.restore()
    }
  }
}

/**
 * Render the live world in Play mode from World.
 */
export function renderPlayMode(
  ctx: CanvasRenderingContext2D,
  world: World,
  opts: RenderOptions,
  imageCache: ImageCache = globalImageCache,
): void {
  const { camera, viewport, interpAlpha = 0, prevPoses } = opts

  // 1. Clear background
  ctx.fillStyle = OUTSIDE
  ctx.fillRect(0, 0, viewport.width, viewport.height)

  // 2. Stage backdrop
  const bounds = world.bounds
  const [lX, tY] = worldToScreen(camera, viewport, bounds.left, bounds.top)
  const [rX, bY] = worldToScreen(camera, viewport, bounds.right, bounds.bottom)
  const lvlW = rX - lX
  const lvlH = bY - tY

  ctx.fillStyle = SKY
  ctx.fillRect(lX, tY, lvlW, lvlH)

  const stageBrick = world.bricks[world.stage.brickId]
  const stageCostume = stageBrick?.costumes[world.stage.costumeIndex]
  if (stageCostume?.asset) {
    const img = imageCache.getImage(stageCostume.asset)
    if (img) {
      ctx.drawImage(img, lX, tY, lvlW, lvlH)
    }
  } else {
    drawSky(ctx, bounds, camera, viewport)
  }

  // 3. Targets in draw order (world.targets). Grid cells are ordinary targets (step 7), drawn like any copy.
  for (const target of world.targets) {
    if (!target.visible) continue
    const brick = world.bricks[target.brickId]
    if (!brick) continue
    const costume = brick.costumes[target.costumeIndex]
    if (!costume) continue

    // Position interpolation
    let renderX = target.x
    let renderY = target.y
    let renderDir = target.direction
    let renderSize = target.size

    const prev = prevPoses?.get(target.id)
    if (prev) {
      renderX = prev.x + (target.x - prev.x) * interpAlpha
      renderY = prev.y + (target.y - prev.y) * interpAlpha
      renderDir = prev.direction + (target.direction - prev.direction) * interpAlpha
      renderSize = prev.size + (target.size - prev.size) * interpAlpha
    }

    drawSprite(ctx, camera, viewport, {
      x: renderX,
      y: renderY,
      direction: renderDir,
      size: renderSize,
      costume,
      rotationStyle: target.rotationStyle,
      effects: target.effects,
      imageCache,
    })

    // Draw say/think bubble if present
    if (target.bubble && target.bubble.text) {
      drawBubble(ctx, camera, viewport, renderX, renderY, renderSize, costume, target.bubble)
    }
  }
}

/** Build: every filled cell drawn with its brick's costume, by GridSpec's rule (autotile: costume 2 under the same brick). */
export function drawGridCells(
  ctx: CanvasRenderingContext2D,
  design: LevelDesign,
  camera: Camera,
  viewport: Viewport,
  imageCache: ImageCache = globalImageCache,
): void {
  const layer = design.tiles
  if (!layer) return
  const bricks = gridBrickIndex(design)
  if (bricks.size === 0) return
  const { c0, c1, r0, r1 } = visibleCells(layer, camera, viewport)
  for (let row = r0; row <= r1; row++) {
    const line = layer.data[row]
    if (!line) continue
    for (let col = c0; col <= c1; col++) {
      const brick = bricks.get(line[col])
      if (!brick) continue
      const costume = brick.costumes[cellCostumeIndex(layer, brick, col, row)] ?? brick.costumes[0]
      if (!costume) continue
      drawSprite(ctx, camera, viewport, {
        x: col * TILE_SIZE + TILE_SIZE / 2,
        y: row * TILE_SIZE + TILE_SIZE / 2,
        direction: 90,
        size: 100,
        costume,
        rotationStyle: 'all around',
        imageCache,
      })
    }
  }
}

/** A translucent preview of the armed grid brick (or an eraser outline) on the cell under the pointer. */
function drawCellHover(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Viewport,
  hover: { col: number; row: number; costume: Costume | null; erase: boolean },
  imageCache: ImageCache,
): void {
  const zoom = getCameraZoom(camera, viewport)
  if (!hover.erase && hover.costume) {
    ctx.save()
    ctx.globalAlpha = 0.6
    drawSprite(ctx, camera, viewport, {
      x: hover.col * TILE_SIZE + TILE_SIZE / 2,
      y: hover.row * TILE_SIZE + TILE_SIZE / 2,
      direction: 90,
      size: 100,
      costume: hover.costume,
      rotationStyle: 'all around',
      imageCache,
    })
    ctx.restore()
  }
  const [sx, sy] = worldToScreen(camera, viewport, hover.col * TILE_SIZE, (hover.row + 1) * TILE_SIZE)
  const size = TILE_SIZE * zoom
  ctx.save()
  ctx.strokeStyle = hover.erase ? '#d9534f' : '#5888da'
  ctx.lineWidth = 2
  ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2)
  ctx.restore()
}

interface SpriteDrawParams {
  x: number
  y: number
  direction: number
  size: number
  costume: Costume
  rotationStyle: RotationStyle
  effects?: Record<string, number>
  imageCache: ImageCache
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Viewport,
  params: SpriteDrawParams,
): void {
  const { x, y, direction, size, costume, rotationStyle, effects, imageCache } = params
  if (!costume.asset) return
  const img = imageCache.getImage(costume.asset)
  if (!img) return

  const zoom = getCameraZoom(camera, viewport)
  const [screenX, screenY] = worldToScreen(camera, viewport, x, y)

  let angle = 0
  let flipX = 1
  if (rotationStyle === 'all around') {
    angle = direction - 90
  } else if (rotationStyle === 'left-right' && direction < 0) {
    flipX = -1
  }

  const scale = (size / 100) * zoom
  const ghost = effects?.ghost ?? 0
  const brightness = effects?.brightness ?? 0

  // Off screen: nothing to draw (a level can hold thousands of grid cells). The margin covers any rotation.
  const reach = Math.max(img.width, img.height) * scale * 1.5
  if (screenX + reach < 0 || screenY + reach < 0 || screenX - reach > viewport.width || screenY - reach > viewport.height) return

  // Fast path, the common one (upright, same size, no effects): one drawImage, no save/restore, so a screen of
  // 2,000+ cells and walls stays cheap. Edges round outward so neighbouring cells leave no seams.
  if (angle === 0 && flipX === 1 && ghost === 0 && brightness === 0) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      img,
      Math.round(screenX - costume.rotationCenterX * scale),
      Math.round(screenY - costume.rotationCenterY * scale),
      Math.ceil(img.width * scale),
      Math.ceil(img.height * scale),
    )
    return
  }

  ctx.save()
  ctx.imageSmoothingEnabled = false
  ctx.translate(screenX, screenY)

  if (angle !== 0) {
    ctx.rotate((angle * Math.PI) / 180)
  }
  if (flipX === -1) {
    ctx.scale(-1, 1)
  }
  ctx.scale(scale, scale)

  const alpha = Math.max(0, Math.min(1, (100 - ghost) / 100))
  ctx.globalAlpha = alpha

  if (brightness !== 0) {
    const bVal = Math.max(0, 100 + brightness)
    ctx.filter = `brightness(${bVal}%)`
  }

  // Draw with rotation center aligned to local (0, 0)
  ctx.drawImage(img, -costume.rotationCenterX, -costume.rotationCenterY)
  ctx.restore()
}

function drawCopyOutline(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Viewport,
  copy: CopyPlacement,
  costume: Costume,
  isSelected: boolean,
): void {
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

  const bounds = boundsFor(transformOf(targetLike), costume)
  const [lX, tY] = worldToScreen(camera, viewport, bounds.left, bounds.top)
  const [rX, bY] = worldToScreen(camera, viewport, bounds.right, bounds.bottom)
  const w = rX - lX
  const h = bY - tY

  ctx.save()
  if (isSelected) {
    ctx.strokeStyle = '#5bb2ff'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 3])
    ctx.strokeRect(lX - 2, tY - 2, w + 4, h + 4)

    // Corner handle squares
    ctx.setLineDash([])
    ctx.fillStyle = '#ffffff'
    const corners: [number, number][] = [
      [lX - 4, tY - 4],
      [rX - 2, tY - 4],
      [lX - 4, bY - 2],
      [rX - 2, bY - 2],
    ]
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx, cy, 6, 6)
    }
  } else {
    // Hover outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(lX - 1, tY - 1, w + 2, h + 2)
  }
  ctx.restore()
}

function drawBubble(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Viewport,
  x: number,
  y: number,
  size: number,
  costume: Costume,
  bubble: Bubble,
): void {
  // Approximate top of costume
  const halfH = ((costume.height * size) / 100) / 2
  const topY = y + halfH
  const [bx, by] = worldToScreen(camera, viewport, x, topY)

  const text = bubble.text
  const maxW = 160
  const lineHeight = 16
  const padding = 8

  ctx.save()
  ctx.font = '12px system-ui, sans-serif'
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const w of words) {
    const testLine = currentLine ? `${currentLine} ${w}` : w
    if (ctx.measureText(testLine).width > maxW && currentLine) {
      lines.push(currentLine)
      currentLine = w
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)

  let bubbleW = 0
  for (const line of lines) {
    const lw = ctx.measureText(line).width
    if (lw > bubbleW) bubbleW = lw
  }
  bubbleW = Math.max(36, bubbleW + padding * 2)
  const bubbleH = lines.length * lineHeight + padding * 2

  const rectX = bx - bubbleW / 2
  const rectY = by - bubbleH - 12
  const r = 8

  // Rounded rectangle
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = '#222631'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(rectX, rectY, bubbleW, bubbleH, r)
  ctx.fill()
  ctx.stroke()

  // Tail
  if (bubble.kind === 'say') {
    ctx.beginPath()
    ctx.moveTo(bx - 6, rectY + bubbleH)
    ctx.lineTo(bx, by - 2)
    ctx.lineTo(bx + 4, rectY + bubbleH)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.stroke()
  } else {
    // Think circles
    const circles = [
      { x: bx - 2, y: rectY + bubbleH + 4, r: 3 },
      { x: bx, y: by - 3, r: 2 },
    ]
    for (const c of circles) {
      ctx.beginPath()
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.stroke()
    }
  }

  // Draw text
  ctx.fillStyle = '#161922'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.fillText(line, rectX + padding, rectY + padding + i * lineHeight)
  })

  ctx.restore()
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewport: Viewport,
  bounds: StageBounds,
  gridStep = 16,
): void {
  const zoom = getCameraZoom(camera, viewport)
  if (gridStep * zoom < 6) return // don't draw grid if too dense

  ctx.save()
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
  ctx.lineWidth = 1

  // Vertical lines
  for (let wx = bounds.left; wx <= bounds.right; wx += gridStep) {
    const [sx] = worldToScreen(camera, viewport, wx, bounds.bottom)
    const [, syTop] = worldToScreen(camera, viewport, wx, bounds.top)
    const [, syBottom] = worldToScreen(camera, viewport, wx, bounds.bottom)
    ctx.beginPath()
    ctx.moveTo(sx, syTop)
    ctx.lineTo(sx, syBottom)
    ctx.stroke()
  }

  // Horizontal lines
  for (let wy = bounds.bottom; wy <= bounds.top; wy += gridStep) {
    const [sxLeft, sy] = worldToScreen(camera, viewport, bounds.left, wy)
    const [sxRight] = worldToScreen(camera, viewport, bounds.right, wy)
    ctx.beginPath()
    ctx.moveTo(sxLeft, sy)
    ctx.lineTo(sxRight, sy)
    ctx.stroke()
  }

  ctx.restore()
}
