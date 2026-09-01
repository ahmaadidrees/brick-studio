import { BRICK_PART_MAP } from '../parts'
import type { BrickInstance, BrickKind, CustomPartDefinition, CustomPartTemplate } from '../types'
import { createCustomPartDefinition } from './definition'
import type { ResizeDelta } from './ResizeBrickSheet'

const TEMPLATE_BY_KIND: Record<BrickKind, CustomPartTemplate> = {
  brick: 'solid',
  plate: 'solid',
  slope: 'slope',
  invertedSlope: 'invertedSlope',
  corner: 'corner',
  round: 'round',
  cone: 'cone',
  stair: 'stairs',
  arch: 'arch',
  window: 'window',
  door: 'door',
}

export type ResizeSelectionResult =
  | { ok: true; definitions: CustomPartDefinition[]; partIdsByBrickId: Record<string, string> }
  | { ok: false; message: string }

export function resizeSelectionDefinitions(
  bricks: BrickInstance[],
  delta: ResizeDelta,
  existingDefinitions: CustomPartDefinition[],
): ResizeSelectionResult {
  if (!bricks.length) return { ok: false, message: 'Select at least one brick to resize.' }
  const definitions = new Map(existingDefinitions.map((definition) => [definition.id, definition]))
  const partIdsByBrickId: Record<string, string> = {}

  for (const brick of bricks) {
    const part = BRICK_PART_MAP[brick.partId]
    if (!part) return { ok: false, message: 'One selected brick is not available in this project.' }
    const width = part.width + delta.width
    const depth = part.depth + delta.depth
    const height = part.height + delta.height
    if (width < 1 || width > 8 || depth < 1 || depth > 8 || height < 1 || height > 12) {
      return { ok: false, message: 'Brick sizes stay between 1–8 studs wide/deep and 1–12 plates high.' }
    }
    const definition = createCustomPartDefinition({
      name: `${part.name} ${width}×${depth}×${height}`,
      template: TEMPLATE_BY_KIND[part.kind],
      width,
      depth,
      height,
      studs: part.kind === 'plate' ? 'full' : 'auto',
    })
    definitions.set(definition.id, definition)
    partIdsByBrickId[brick.id] = definition.id
  }

  return { ok: true, definitions: [...definitions.values()], partIdsByBrickId }
}
