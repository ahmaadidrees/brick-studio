import { canonicalNumber, createDeterministicCustomPartId } from './canonical'
import { CUSTOM_PART_ENGINE_ENABLED_BY_DEFAULT, CUSTOM_PART_WORLD_UNITS } from './limits'
import type {
  CompiledCustomPart,
  CustomPartCompileResult,
  CustomPartMaterialSlot,
  CustomPartSource,
} from './types'
import { validateCustomPartSource } from './validate'

export type CompileCustomPartOptions = {
  enabled?: boolean
}

function worldTuple(tuple: [number, number, number]) {
  return [
    canonicalNumber(tuple[0] * CUSTOM_PART_WORLD_UNITS.stud),
    canonicalNumber(tuple[1] * CUSTOM_PART_WORLD_UNITS.plate),
    canonicalNumber(tuple[2] * CUSTOM_PART_WORLD_UNITS.stud),
  ] as [number, number, number]
}

function freezeCompiledPart(part: CompiledCustomPart): CompiledCustomPart {
  for (const box of part.source.boxes) {
    Object.freeze(box.center)
    Object.freeze(box.size)
    Object.freeze(box)
  }
  for (const box of part.render.boxes) {
    Object.freeze(box.center)
    Object.freeze(box.size)
    Object.freeze(box)
  }
  for (const collider of part.physics.colliders) {
    Object.freeze(collider.center)
    Object.freeze(collider.halfExtents)
    Object.freeze(collider)
  }
  Object.freeze(part.source.bounds)
  Object.freeze(part.source.boxes)
  Object.freeze(part.source)
  Object.freeze(part.schemaV2Part)
  Object.freeze(part.boundsWorld)
  Object.freeze(part.render.boxes)
  Object.freeze(part.render.materials)
  Object.freeze(part.render)
  Object.freeze(part.physics.colliders)
  Object.freeze(part.physics)
  return Object.freeze(part)
}

export function compileCustomPart(
  source: unknown,
  options: CompileCustomPartOptions = {},
): CustomPartCompileResult {
  if ((options.enabled ?? CUSTOM_PART_ENGINE_ENABLED_BY_DEFAULT) !== true) {
    return {
      ok: false,
      error: {
        code: 'feature-disabled',
        message: 'Custom-part compilation is disabled until an integrator explicitly enables it.',
      },
    }
  }

  const validated = validateCustomPartSource(source)
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        code: 'invalid-source',
        message: 'Custom part did not pass the bounded primitive contract.',
        issues: validated.issues,
      },
    }
  }

  const value: CustomPartSource = validated.value
  const id = createDeterministicCustomPartId(value)
  const materials: CustomPartMaterialSlot[] = []
  for (const box of value.boxes) {
    if (!materials.includes(box.material)) materials.push(box.material)
  }
  materials.sort()

  const part: CompiledCustomPart = {
    compilerVersion: 1,
    id,
    source: value,
    schemaV2Part: {
      id,
      name: value.name,
      template: 'solid',
      width: value.bounds.width,
      depth: value.bounds.depth,
      height: value.bounds.height,
      studs: value.studs,
    },
    boundsWorld: {
      width: canonicalNumber(value.bounds.width * CUSTOM_PART_WORLD_UNITS.stud),
      depth: canonicalNumber(value.bounds.depth * CUSTOM_PART_WORLD_UNITS.stud),
      height: canonicalNumber(value.bounds.height * CUSTOM_PART_WORLD_UNITS.plate),
    },
    render: {
      boxes: value.boxes.map((box) => ({
        kind: 'box',
        center: worldTuple(box.center),
        size: worldTuple(box.size),
        material: box.material,
      })),
      materials,
    },
    physics: {
      colliders: value.boxes.filter((box) => box.collider).map((box) => {
        const size = worldTuple(box.size)
        return {
          shape: 'cuboid',
          center: worldTuple(box.center),
          halfExtents: size.map((axis) => canonicalNumber(axis / 2)) as [number, number, number],
        }
      }),
    },
  }
  return { ok: true, part: freezeCompiledPart(part) }
}
