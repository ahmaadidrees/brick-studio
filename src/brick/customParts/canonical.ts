import { CUSTOM_PART_LIMITS } from './limits'
import type { CompiledCustomPart, CustomPartSource } from './types'

const PRECISION_FACTOR = 10 ** CUSTOM_PART_LIMITS.maxDecimalPlaces
const FNV_PRIME_64 = 0x100000001b3n
const FNV_MASK_64 = 0xffffffffffffffffn

export function canonicalNumber(value: number) {
  const rounded = Math.round(value * PRECISION_FACTOR) / PRECISION_FACTOR
  return Object.is(rounded, -0) ? 0 : rounded
}

export function canonicalizeCustomPartSource(source: CustomPartSource): CustomPartSource {
  const boxes = source.boxes.map((box) => ({
    kind: 'box' as const,
    center: box.center.map(canonicalNumber) as [number, number, number],
    size: box.size.map(canonicalNumber) as [number, number, number],
    material: box.material,
    collider: box.collider,
  }))
  // Box order is not semantic. Sorting it makes IDs and persisted cache data
  // stable when editors rebuild the same assembly in a different order.
  boxes.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  return {
    schemaVersion: 1,
    name: source.name.trim(),
    bounds: {
      width: source.bounds.width,
      depth: source.bounds.depth,
      height: source.bounds.height,
    },
    studs: source.studs,
    boxes,
  }
}

export function serializeCustomPartSource(source: CustomPartSource) {
  return JSON.stringify(canonicalizeCustomPartSource(source))
}

function fnv1a64(value: string, offset: bigint) {
  let hash = offset
  // Hash both bytes of each UTF-16 code unit. This is platform-independent and
  // intentionally does not depend on TextEncoder or host crypto availability.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    hash ^= BigInt(code & 0xff)
    hash = (hash * FNV_PRIME_64) & FNV_MASK_64
    hash ^= BigInt(code >>> 8)
    hash = (hash * FNV_PRIME_64) & FNV_MASK_64
  }
  return hash.toString(16).padStart(16, '0')
}

export function createDeterministicCustomPartId(source: CustomPartSource) {
  const serialized = serializeCustomPartSource(source)
  const left = fnv1a64(serialized, 0xcbf29ce484222325n)
  const right = fnv1a64(serialized, 0x84222325cbf29ce4n)
  return `custom_box_v1_${left}${right}`
}

export function serializeCompiledCustomPart(part: CompiledCustomPart) {
  // Rebuild every level in a declared order instead of serializing caller-owned
  // property order. The newline matches Brick Studio document serialization.
  const stable = {
    compilerVersion: 1 as const,
    id: part.id,
    source: canonicalizeCustomPartSource(part.source),
    schemaV2Part: {
      id: part.schemaV2Part.id,
      name: part.schemaV2Part.name,
      template: part.schemaV2Part.template,
      width: part.schemaV2Part.width,
      depth: part.schemaV2Part.depth,
      height: part.schemaV2Part.height,
      studs: part.schemaV2Part.studs,
    },
    boundsWorld: {
      width: part.boundsWorld.width,
      depth: part.boundsWorld.depth,
      height: part.boundsWorld.height,
    },
    render: {
      boxes: part.render.boxes.map((box) => ({
        kind: 'box' as const,
        center: [...box.center] as [number, number, number],
        size: [...box.size] as [number, number, number],
        material: box.material,
      })),
      materials: [...part.render.materials],
    },
    physics: {
      colliders: part.physics.colliders.map((collider) => ({
        shape: 'cuboid' as const,
        center: [...collider.center] as [number, number, number],
        halfExtents: [...collider.halfExtents] as [number, number, number],
      })),
    },
  }
  return `${JSON.stringify(stable)}\n`
}
