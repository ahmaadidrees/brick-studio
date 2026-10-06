/** A brick's first costume as a drawer thumbnail. */
export function CostumeThumb({ asset, box = 40 }: { asset?: string; box?: number }) {
  if (!asset) return <span className="p2d-part-art" style={{ width: box * 0.6, height: box * 0.6, background: '#d3d9e4', borderRadius: 4 }} aria-hidden="true" />
  return <img className="p2d-part-art builder-costume-thumb" src={asset} alt="" draggable={false} style={{ maxWidth: box, maxHeight: box }} />
}
