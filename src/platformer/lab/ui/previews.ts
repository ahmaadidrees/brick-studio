import { CartoonSkin } from '../../render/cartoon/cartoonSkin'
import type { Costume, LabColor } from '../program/types'
import { CostumeArt, costumePreview } from '../render/costumes'

/*
 * Small pictures of costumes for lists, cards and menus, drawn once in the cartoon look and kept as data URLs.
 * Tiles for the build tools come from the same skin.
 */

let skin: CartoonSkin | null = null
let art: CostumeArt | null = null
const cache = new Map<string, string>()

function tools() {
  if (!skin) skin = new CartoonSkin(3)
  if (!art) art = new CostumeArt(3)
  return { skin, art }
}

export function costumeIcon(costume: Costume, color: LabColor = 'none', px = 64): string {
  const key = `${costume}|${color}|${px}`
  let url = cache.get(key)
  if (url === undefined) {
    try {
      const { skin, art } = tools()
      url = costumePreview(skin, art, costume, color, px)
    } catch {
      url = ''
    }
    cache.set(key, url)
  }
  return url
}

/** A tile's picture (a skin art key, like `G:S:1:0:day`). */
export function tileIcon(key: string, px = 48): string {
  const k = `tile|${key}|${px}`
  let url = cache.get(k)
  if (url === undefined) {
    try {
      const { skin } = tools()
      const s = skin.sprite(key)
      const c = document.createElement('canvas')
      c.width = px
      c.height = px
      const g = c.getContext('2d')
      if (g) {
        const scale = (px - 6) / Math.max(s.w, s.h)
        g.drawImage(s.img, (px - s.w * scale) / 2, (px - s.h * scale) / 2, s.w * scale, s.h * scale)
      }
      url = c.toDataURL()
    } catch {
      url = ''
    }
    cache.set(k, url)
  }
  return url
}
