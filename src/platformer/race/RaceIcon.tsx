import { RT, isRaceBoost } from '@brick-studio/platformer-core/engine/raceTiles'
import type { Dir4 } from '@brick-studio/platformer-core/engine/raceTiles'
import { drawArrow, drawRaceCar, drawRaceTile } from './raceArt'

const cache = new Map<string, string>()

/** A race brick's picture as an image URL: `race:<tile id>` or `race:start`, optionally turned (boost pads). */
export function raceIconUrl(key: string, dir: Dir4 = 0): string {
  const id = `${key}:${dir}`
  const hit = cache.get(id)
  if (hit !== undefined) return hit
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  let url = ''
  if (g) {
    g.scale(4, 4)
    const what = key.slice('race:'.length)
    if (what === 'start') {
      drawRaceTile(g, 0, 0, RT.ROAD, () => RT.ROAD)
      drawRaceCar(g, { x: 8, y: 8, a: (dir * Math.PI) / 2 }, '#3e6fd8')
    } else {
      let t = Number(what)
      if (isRaceBoost(t)) t = RT.BOOST_R + dir
      // Ground shows itself all round; road-like bricks show plain road beside them, so no kerbs in the icon.
      const around = t === RT.GRASS || t === RT.FLOWERS || t === RT.TREE || t === RT.TIRES || t === RT.BUMPER ? RT.GRASS : t === RT.BARRIER || t === RT.STAND || t === RT.WATER || t === RT.ICE || t === RT.DIRT ? t : RT.ROAD
      drawRaceTile(g, 0, 0, t, () => around)
      if (t === RT.FINISH) drawArrow(g, 8, 8, dir, 4.5, '#3fd26b')
    }
    try {
      url = c.toDataURL('image/png')
    } catch {
      // Test browsers without canvas: no picture.
    }
  }
  cache.set(id, url)
  return url
}

export function RaceIcon({ k, box, dir = 0, className }: { k: string; box: number; dir?: Dir4; className?: string }) {
  const url = raceIconUrl(k, dir)
  return url ? <img src={url} width={box} height={box} alt="" draggable={false} className={className} style={{ borderRadius: 6 }} /> : <span style={{ display: 'inline-block', width: box, height: box }} />
}
