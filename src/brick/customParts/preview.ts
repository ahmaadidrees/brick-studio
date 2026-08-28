import { canonicalNumber } from './canonical'
import type { CompiledCustomPart, CustomPartPreviewDescriptor } from './types'

/** Creates renderer-agnostic data only; it never allocates Three.js objects. */
export function createCustomPartPreviewDescriptor(part: CompiledCustomPart): CustomPartPreviewDescriptor {
  const largestAxis = Math.max(part.boundsWorld.width, part.boundsWorld.depth, part.boundsWorld.height)
  return {
    kind: 'custom-part-preview-v1',
    partId: part.id,
    boundsWorld: { ...part.boundsWorld },
    boxes: part.render.boxes.map((box) => ({
      kind: 'box',
      center: [...box.center],
      size: [...box.size],
      material: box.material,
    })),
    camera: {
      target: [0, canonicalNumber(part.boundsWorld.height / 2), 0],
      distance: canonicalNumber(Math.max(1, largestAxis * 2.25)),
    },
  }
}
