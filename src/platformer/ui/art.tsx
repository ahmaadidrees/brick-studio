import type { LevelStyle } from '@brick-studio/platformer-core/engine/level'
import { Atlas } from '../render/atlas'
import { CartoonSkin } from '../render/cartoon/cartoonSkin'

/* The game's own art as images for the interface (the block drawer, cards, decorations), in either look. */

const atlas = new Atlas()
/** Interface pictures in the cartoon look are drawn at 3× so they stay sharp on any screen. */
let cartoon: CartoonSkin | null = null
const urls = new Map<string, string>()

function picture(key: string, look: LevelStyle): { canvas: HTMLCanvasElement; width: number; height: number } {
  if (look === 'cartoon') {
    cartoon ??= new CartoonSkin(3)
    const s = cartoon.sprite(key)
    return { canvas: s.img as HTMLCanvasElement, width: s.w, height: s.h }
  }
  const canvas = atlas.get(key)
  return { canvas, width: canvas.width, height: canvas.height }
}

/** A sprite or tile from the game art, as an image URL. */
export function artSrc(key: string, look: LevelStyle = 'pixel'): string {
  const id = `${look}:${key}`
  let url = urls.get(id)
  if (!url) {
    url = picture(key, look).canvas.toDataURL()
    urls.set(id, url)
  }
  return url
}

/** Natural size of a piece of art, in world pixels. */
export function artSize(key: string, look: LevelStyle = 'pixel'): { width: number; height: number } {
  const { width, height } = picture(key, look)
  return { width, height }
}

/**
 * A piece of game art. Pixel art is shown crisp at the largest whole-number scale that fits the box; the cartoon look
 * is smooth, so it simply fits the box (up to the 3× it was drawn at).
 */
export function Art({ k, box, scale, className, look = 'pixel' }: { k: string; box?: number; scale?: number; className?: string; look?: LevelStyle }) {
  const { width, height } = artSize(k, look)
  const big = Math.max(width, height)
  const fit = box === undefined ? 1 : box / big
  const s = scale ?? (look === 'cartoon' ? Math.min(fit, 3) : fit >= 1 ? Math.floor(fit) : fit)
  return (
    <img
      className={['p2d-art', look === 'cartoon' && 'p2d-art-cartoon', className].filter(Boolean).join(' ')}
      src={artSrc(k, look)}
      width={Math.round(width * s)}
      height={Math.round(height * s)}
      alt=""
      draggable={false}
    />
  )
}
