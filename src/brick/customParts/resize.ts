import { BRICK_STUDIO_MAX_CUSTOM_PARTS, CUSTOM_BRICK_MAX_WIDTH, CUSTOM_BRICK_MAX_DEPTH, CUSTOM_BRICK_MAX_HEIGHT } from '../brickDocument'
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
    if (width < 1 || width > CUSTOM_BRICK_MAX_WIDTH || depth < 1 || depth > CUSTOM_BRICK_MAX_DEPTH || height < 1 || height > CUSTOM_BRICK_MAX_HEIGHT) {
      return { ok: false, message: `Brick sizes stay between 1–${CUSTOM_BRICK_MAX_WIDTH} studs wide, 1–${CUSTOM_BRICK_MAX_DEPTH} studs deep and 1–${CUSTOM_BRICK_MAX_HEIGHT} plates high.` }
    }
    if ((part.kind === 'round' || part.kind === 'cone') && width !== depth) {
      return { ok: false, message: 'Round and cone bricks need matching width and depth.' }
    }
    const suffix = ` ${width}×${depth}×${height}`
    const baseName = part.name.replace(/(?: \d+×\d+×\d+)+$/, '')
    const definition = createCustomPartDefinition({
      name: `${baseName.slice(0, 40 - suffix.length)}${suffix}`,
      template: TEMPLATE_BY_KIND[part.kind],
      width,
      depth,
      height,
      studs: part.kind === 'plate' ? 'full' : 'auto',
    })
    if (!definitions.has(definition.id) && definitions.size >= BRICK_STUDIO_MAX_CUSTOM_PARTS) {
      return { ok: false, message: `This world supports up to ${BRICK_STUDIO_MAX_CUSTOM_PARTS} custom parts.` }
    }
    definitions.set(definition.id, definition)
    partIdsByBrickId[brick.id] = definition.id
  }

  return { ok: true, definitions: [...definitions.values()], partIdsByBrickId }
}
