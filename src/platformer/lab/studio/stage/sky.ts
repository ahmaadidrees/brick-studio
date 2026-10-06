/**
 * The Brickgineers day sky (the one stage drawing that is not a brick). Step 7 removed the tile drawing and the coin pop
 * that used to live here: every painted cell is a brick drawn with its own costume (stage/gridCells.ts, renderer.ts).
 */
import { Atlas } from '../../../render/atlas'
import type { StageBounds } from '../../core/contracts'
import { getCameraZoom, worldToScreen, type Camera, type Viewport } from './camera'

let atlas: Atlas | null = null

// ---------------------------------------------------------------- the Brickgineers day sky

const SKY_BLUE = '#79b8ff'
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}
const SKY_LAYERS: { key: string; spacing: number; par: number; lift: (h: number) => number; salt: number }[] = [
  { key: 'cloud:big', spacing: 300, par: 0.15, lift: () => 216, salt: 1 },
  { key: 'cloud:small', spacing: 220, par: 0.22, lift: () => 166, salt: 2 },
  { key: 'hill:big:far', spacing: 380, par: 0.3, lift: (h) => 16 + h - 14, salt: 3 },
  { key: 'hill:small:near', spacing: 260, par: 0.55, lift: (h) => 16 + h - 4, salt: 4 },
]

/**
 * The real builder's day sky and studded hills, used when the stage has no backdrop picture. The scenery scrolls more
 * slowly than the level. It is clipped to the level, and the ground line is one tile above the level's floor.
 */
export function drawSky(ctx: CanvasRenderingContext2D, bounds: StageBounds, camera: Camera, viewport: Viewport): void {
  const [lX, tY] = worldToScreen(camera, viewport, bounds.left, bounds.top)
  const [rX, bY] = worldToScreen(camera, viewport, bounds.right, bounds.bottom)
  ctx.fillStyle = SKY_BLUE
  ctx.fillRect(lX, tY, rX - lX, bY - tY)
  let sheet: Atlas
  try {
    sheet = atlas ??= new Atlas()
  } catch {
    return
  }
  const zoom = getCameraZoom(camera, viewport)
  const viewLeft = camera.x - viewport.width / 2 / zoom
  const viewW = viewport.width / zoom
  ctx.save()
  ctx.beginPath()
  ctx.rect(lX, tY, rX - lX, bY - tY)
  ctx.clip()
  ctx.imageSmoothingEnabled = false
  try {
    for (const L of SKY_LAYERS) {
      const img = sheet.get(L.key)
      const offset = viewLeft * L.par
      const first = Math.floor((offset - img.width) / L.spacing)
      const last = Math.ceil((offset + viewW) / L.spacing)
      for (let i = first; i <= last; i++) {
        const r = hash(i * 7 + L.salt)
        if (r < 0.25) continue
        // World x of the picture's left edge; it parallax-scrolls relative to the camera's left edge.
        const wx = viewLeft + (Math.round(i * L.spacing + r * L.spacing * 0.5) - offset)
        const top = bounds.bottom + L.lift(img.height)
        const [sx, sy] = worldToScreen(camera, viewport, wx, top)
        ctx.drawImage(img, Math.round(sx), Math.round(sy), Math.ceil(img.width * zoom), Math.ceil(img.height * zoom))
      }
    }
  } catch {
    /* no canvas */
  }
  ctx.restore()
}
