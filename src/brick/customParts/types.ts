import type { CustomPartDefinition } from '@brick-studio/core/types'

export type CustomPartMaterialSlot = 'body' | 'accent' | 'clear' | 'rubber'

export type CustomPartBoxSource = {
  kind: 'box'
  center: [number, number, number]
  size: [number, number, number]
  material: CustomPartMaterialSlot
  collider: boolean
}

/**
 * Authoring coordinates are deliberately boring: x/z are studs, y is plates,
 * the origin is centered on the footprint, and y=0 is the part's base.
 */
export type CustomPartSource = {
  schemaVersion: 1
  name: string
  bounds: {
    width: number
    depth: number
    height: number
  }
  studs: 'auto' | 'full' | 'none'
  boxes: CustomPartBoxSource[]
}

export type CustomPartValidationCode =
  | 'invalid-type'
  | 'unexpected-field'
  | 'invalid-value'
  | 'non-finite-number'
  | 'precision-limit'
  | 'size-limit'
  | 'primitive-limit'
  | 'material-limit'
  | 'collider-limit'
  | 'out-of-bounds'
  | 'volume-limit'

export type CustomPartValidationIssue = {
  code: CustomPartValidationCode
  path: string
  message: string
}

export type CustomPartValidationResult =
  | { ok: true; value: CustomPartSource }
  | { ok: false; issues: CustomPartValidationIssue[] }

export type CustomPartRenderBox = {
  kind: 'box'
  center: [number, number, number]
  size: [number, number, number]
  material: CustomPartMaterialSlot
}

export type CustomPartPhysicsBox = {
  shape: 'cuboid'
  center: [number, number, number]
  halfExtents: [number, number, number]
}

export type CompiledCustomPart = {
  compilerVersion: 1
  id: string
  source: CustomPartSource
  schemaV2Part: CustomPartDefinition
  boundsWorld: {
    width: number
    depth: number
    height: number
  }
  render: {
    boxes: CustomPartRenderBox[]
    materials: CustomPartMaterialSlot[]
  }
  physics: {
    colliders: CustomPartPhysicsBox[]
  }
}

export type CustomPartCompileError =
  | { code: 'feature-disabled'; message: string }
  | { code: 'invalid-source'; message: string; issues: CustomPartValidationIssue[] }

export type CustomPartCompileResult =
  | { ok: true; part: CompiledCustomPart }
  | { ok: false; error: CustomPartCompileError }

export type CustomPartPreviewDescriptor = {
  kind: 'custom-part-preview-v1'
  partId: string
  boundsWorld: CompiledCustomPart['boundsWorld']
  boxes: CustomPartRenderBox[]
  camera: {
    target: [number, number, number]
    distance: number
  }
}
