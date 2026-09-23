import { Atlas } from '../render/atlas'

/* The game's own pixel art as images for the interface (the build bar, cards, decorations). */

const atlas = new Atlas()
const urls = new Map<string, string>()

/** A sprite or tile from the game art, as an image URL. */
export function artSrc(key: string): string {
  let url = urls.get(key)
  if (!url) {
    url = atlas.get(key).toDataURL()
    urls.set(key, url)
  }
  return url
}

/** Natural size of a piece of art, in pixels. */
export function artSize(key: string): { width: number; height: number } {
  const canvas = atlas.get(key)
  return { width: canvas.width, height: canvas.height }
}

/** A piece of game art shown crisp: whole-number scaling when it fits the box, otherwise shrunk to fit. */
export function Art({ k, box, scale, className }: { k: string; box?: number; scale?: number; className?: string }) {
  const { width, height } = artSize(k)
  const big = Math.max(width, height)
  const s = scale ?? (box === undefined ? 1 : big * 2 <= box ? 2 : big <= box ? 1 : box / big)
  return <img className={['p2d-art', className].filter(Boolean).join(' ')} src={artSrc(k)} width={Math.round(width * s)} height={Math.round(height * s)} alt="" draggable={false} />
}
