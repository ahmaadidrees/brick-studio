import { artSize, artSrc } from '../../../ui/art'
import type { CSSProperties } from 'react'

/** Drawer art for tiles: the real builder's own pictures. Quietly shows a colour chip where canvases are unavailable (tests). */
export function TileArt({ k, box = 40, fallback = '#9bb7d4' }: { k: string; box?: number; fallback?: string }) {
  let src: string | null = null
  let w = box
  let h = box
  try {
    src = artSrc(k)
    const size = artSize(k)
    const scale = Math.max(1, Math.floor(box / Math.max(size.width, size.height)))
    w = size.width * scale
    h = size.height * scale
  } catch {
    src = null
  }
  if (!src) {
    const style: CSSProperties = { width: box * 0.8, height: box * 0.8, background: fallback, borderRadius: 4 }
    return <span className="p2d-part-art" style={style} aria-hidden="true" />
  }
  return <img className="p2d-part-art" src={src} width={w} height={h} alt="" draggable={false} />
}

/** A brick's first costume as a drawer thumbnail. */
export function CostumeThumb({ asset, box = 40 }: { asset?: string; box?: number }) {
  if (!asset) return <span className="p2d-part-art" style={{ width: box * 0.6, height: box * 0.6, background: '#d3d9e4', borderRadius: 4 }} aria-hidden="true" />
  return <img className="p2d-part-art builder-costume-thumb" src={asset} alt="" draggable={false} style={{ maxWidth: box, maxHeight: box }} />
}
