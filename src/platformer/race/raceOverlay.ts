import { gridSpots } from '@brick-studio/platformer-core/engine/car'
import { TILE } from '@brick-studio/platformer-core/engine/constants'
import { RT } from '@brick-studio/platformer-core/engine/raceTiles'
import type { World } from '@brick-studio/platformer-core/engine/world'
import type { Editor } from '../editor/editor'
import { drawArrow, drawRaceTile } from './raceArt'

export interface BuildCursor {
  x: number
  y: number
  name: string
  color: string
}

/**
 * What building a race track shows over it: which way laps count at the finish line, the starting grid, the brick in
 * hand under the pointer, and other builders' cursors.
 */
export function drawRaceBuildOverlay(ctx: CanvasRenderingContext2D, editor: Editor, w: World, frame: number, cursors: BuildCursor[]) {
  const race = editor.raceSettings
  const { tiles, width } = w.design
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== RT.FINISH) continue
    drawArrow(ctx, (i % width + 0.5) * TILE, (Math.floor(i / width) + 0.5) * TILE, race.finishDir, 4.5, 'rgba(63,210,107,.95)')
  }
  const design = { ...w.design, race }
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,.9)'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 1.5])
  for (const s of gridSpots(design, 4)) {
    ctx.save()
    ctx.translate(s.x, s.y)
    ctx.rotate(s.a)
    ctx.strokeRect(-8, -5.5, 16, 11)
    ctx.restore()
  }
  ctx.restore()
  const start = w.design.objects.find((o) => o.kind === 'start')
  if (start) drawArrow(ctx, (start.x + 0.5) * TILE, (start.y + 0.5) * TILE, race.startDir, 6, '#ffffff')

  const h = editor.hover
  if (h) {
    const [x, y] = h
    const place = editor.item.place
    if (!editor.erasing && place.kind === 'tile') {
      const t = place.tile === RT.BOOST_R ? RT.BOOST_R + editor.boostDir : place.tile
      ctx.save()
      ctx.globalAlpha = 0.6
      drawRaceTile(ctx, x, y, t, () => RT.ROAD)
      ctx.restore()
    } else if (!editor.erasing && place.kind === 'object') {
      drawArrow(ctx, (x + 0.5) * TILE, (y + 0.5) * TILE, race.startDir, 6, 'rgba(255,255,255,.7)')
    }
    ctx.strokeStyle = editor.erasing ? '#ef4b3f' : (frame >> 4) % 2 ? '#ffffff' : '#ffe36b'
    ctx.lineWidth = 1.2
    ctx.strokeRect(x * TILE + 0.5, y * TILE + 0.5, TILE - 1, TILE - 1)
  }

  for (const c of cursors) {
    ctx.strokeStyle = c.color
    ctx.lineWidth = 1.5
    ctx.strokeRect(c.x * TILE + 1, c.y * TILE + 1, TILE - 2, TILE - 2)
    ctx.font = '800 6px Nunito, ui-rounded, system-ui, sans-serif'
    const tw = ctx.measureText(c.name).width + 6
    ctx.fillStyle = c.color
    ctx.beginPath()
    ctx.roundRect(c.x * TILE + TILE / 2 - tw / 2, c.y * TILE - 10, tw, 9, 3)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.fillText(c.name, c.x * TILE + TILE / 2, c.y * TILE - 3.5)
  }
}
