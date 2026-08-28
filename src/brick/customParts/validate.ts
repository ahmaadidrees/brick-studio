import { canonicalNumber, canonicalizeCustomPartSource } from './canonical'
import { CUSTOM_PART_LIMITS } from './limits'
import type {
  CustomPartBoxSource,
  CustomPartMaterialSlot,
  CustomPartSource,
  CustomPartValidationIssue,
  CustomPartValidationResult,
} from './types'

const SOURCE_FIELDS = new Set(['schemaVersion', 'name', 'bounds', 'studs', 'boxes'])
const BOUNDS_FIELDS = new Set(['width', 'depth', 'height'])
const BOX_FIELDS = new Set(['kind', 'center', 'size', 'material', 'collider'])
const STUD_MODES = new Set(['auto', 'full', 'none'])
const MATERIALS = new Set<CustomPartMaterialSlot>(['body', 'accent', 'clear', 'rubber'])
const EPSILON = 10 ** -CUSTOM_PART_LIMITS.maxDecimalPlaces

function ownDataRecord(
  value: unknown,
  path: string,
  fields: Set<string>,
  issues: CustomPartValidationIssue[],
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    addIssue(issues, 'invalid-type', path, 'Must be a plain object.')
    return null
  }
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    addIssue(issues, 'invalid-type', path, 'Must not use a custom prototype.')
    return null
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !fields.has(key)) {
      addIssue(issues, 'unexpected-field', `${path}.${String(key)}`, 'Field is not supported.')
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (!('value' in descriptor)) {
      addIssue(issues, 'invalid-type', `${path}.${key}`, 'Accessors are not accepted as data.')
    }
  }
  const record: Record<string, unknown> = Object.create(null)
  for (const key of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (descriptor && 'value' in descriptor) record[key] = descriptor.value
  }
  return record
}

function addIssue(
  issues: CustomPartValidationIssue[],
  code: CustomPartValidationIssue['code'],
  path: string,
  message: string,
) {
  if (issues.length < CUSTOM_PART_LIMITS.maxValidationIssues) issues.push({ code, path, message })
}

function finiteNumber(
  value: unknown,
  path: string,
  issues: CustomPartValidationIssue[],
): number | null {
  if (typeof value !== 'number') {
    addIssue(issues, 'invalid-type', path, 'Must be a number.')
    return null
  }
  if (!Number.isFinite(value)) {
    addIssue(issues, 'non-finite-number', path, 'Must be finite.')
    return null
  }
  const normalized = canonicalNumber(value)
  if (Math.abs(value - normalized) > Number.EPSILON) {
    addIssue(
      issues,
      'precision-limit',
      path,
      `Must use at most ${CUSTOM_PART_LIMITS.maxDecimalPlaces} decimal places.`,
    )
    return null
  }
  return normalized
}

function boundedInteger(
  value: unknown,
  min: number,
  max: number,
  path: string,
  issues: CustomPartValidationIssue[],
): number | null {
  const parsed = finiteNumber(value, path, issues)
  if (parsed === null) return null
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    addIssue(issues, 'size-limit', path, `Must be a whole number from ${min} through ${max}.`)
    return null
  }
  return parsed
}

function tuple3(
  value: unknown,
  path: string,
  issues: CustomPartValidationIssue[],
): [number, number, number] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length !== 3) {
    addIssue(issues, 'invalid-type', path, 'Must be a three-number array.')
    return null
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key !== '0' && key !== '1' && key !== '2' && key !== 'length') {
      addIssue(issues, 'unexpected-field', `${path}.${String(key)}`, 'Array property is not supported.')
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if (key !== 'length' && !('value' in descriptor)) {
      addIssue(issues, 'invalid-type', `${path}.${String(key)}`, 'Accessors are not accepted as data.')
    }
  }
  const result: number[] = []
  for (let index = 0; index < 3; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor || !('value' in descriptor)) {
      addIssue(issues, 'invalid-type', `${path}[${index}]`, 'Must be plain numeric data.')
      return null
    }
    const parsed = finiteNumber(descriptor.value, `${path}[${index}]`, issues)
    if (parsed === null) return null
    result.push(parsed)
  }
  return result as [number, number, number]
}

function validateBox(
  value: unknown,
  index: number,
  issues: CustomPartValidationIssue[],
): CustomPartBoxSource | null {
  const path = `$.boxes[${index}]`
  const box = ownDataRecord(value, path, BOX_FIELDS, issues)
  if (!box) return null
  if (box.kind !== 'box') addIssue(issues, 'invalid-value', `${path}.kind`, 'Only box primitives are supported.')
  const center = tuple3(box.center, `${path}.center`, issues)
  const size = tuple3(box.size, `${path}.size`, issues)
  if (typeof box.material !== 'string' || !MATERIALS.has(box.material as CustomPartMaterialSlot)) {
    addIssue(issues, 'invalid-value', `${path}.material`, 'Must use a built-in material slot.')
  }
  if (typeof box.collider !== 'boolean') {
    addIssue(issues, 'invalid-type', `${path}.collider`, 'Must be true or false.')
  }
  if (!center || !size || box.kind !== 'box' || !MATERIALS.has(box.material as CustomPartMaterialSlot)
    || typeof box.collider !== 'boolean') return null
  size.forEach((axis, axisIndex) => {
    if (axis < CUSTOM_PART_LIMITS.minBoxAxis) {
      addIssue(
        issues,
        'size-limit',
        `${path}.size[${axisIndex}]`,
        `Must be at least ${CUSTOM_PART_LIMITS.minBoxAxis}.`,
      )
    }
  })
  return {
    kind: 'box',
    center,
    size,
    material: box.material as CustomPartMaterialSlot,
    collider: box.collider,
  }
}

export function validateCustomPartSource(value: unknown): CustomPartValidationResult {
  const issues: CustomPartValidationIssue[] = []
  const source = ownDataRecord(value, '$', SOURCE_FIELDS, issues)
  if (!source) return { ok: false, issues }

  if (source.schemaVersion !== 1) {
    addIssue(issues, 'invalid-value', '$.schemaVersion', 'Only custom-part schema version 1 is supported.')
  }
  if (typeof source.name !== 'string' || !source.name.trim()
    || source.name.trim().length > CUSTOM_PART_LIMITS.maxNameLength) {
    addIssue(
      issues,
      'invalid-value',
      '$.name',
      `Must contain 1 through ${CUSTOM_PART_LIMITS.maxNameLength} characters after trimming.`,
    )
  }
  if (typeof source.studs !== 'string' || !STUD_MODES.has(source.studs)) {
    addIssue(issues, 'invalid-value', '$.studs', 'Must be auto, full, or none.')
  }

  const bounds = ownDataRecord(source.bounds, '$.bounds', BOUNDS_FIELDS, issues)
  const width = bounds
    ? boundedInteger(bounds.width, 1, CUSTOM_PART_LIMITS.maxWidthStuds, '$.bounds.width', issues)
    : null
  const depth = bounds
    ? boundedInteger(bounds.depth, 1, CUSTOM_PART_LIMITS.maxDepthStuds, '$.bounds.depth', issues)
    : null
  const height = bounds
    ? boundedInteger(bounds.height, 1, CUSTOM_PART_LIMITS.maxHeightPlates, '$.bounds.height', issues)
    : null

  if (!Array.isArray(source.boxes) || Object.getPrototypeOf(source.boxes) !== Array.prototype) {
    addIssue(issues, 'invalid-type', '$.boxes', 'Must be an array of box primitives.')
    return { ok: false, issues }
  }
  if (source.boxes.length < 1 || source.boxes.length > CUSTOM_PART_LIMITS.maxBoxes) {
    addIssue(
      issues,
      'primitive-limit',
      '$.boxes',
      `Must contain 1 through ${CUSTOM_PART_LIMITS.maxBoxes} boxes.`,
    )
  }

  const boxes: CustomPartBoxSource[] = []
  const materialSlots = new Set<CustomPartMaterialSlot>()
  let colliderCount = 0
  let boxVolume = 0
  let colliderVolume = 0
  const boxDescriptors = Object.getOwnPropertyDescriptors(source.boxes)
  for (const key of Reflect.ownKeys(boxDescriptors)) {
    const numericIndex = typeof key === 'string' && /^(?:0|[1-9]\d*)$/.test(key) ? Number(key) : -1
    if (key !== 'length' && (numericIndex < 0 || numericIndex >= source.boxes.length)) {
      addIssue(issues, 'unexpected-field', `$.boxes.${String(key)}`, 'Array property is not supported.')
    }
    const descriptor = Object.getOwnPropertyDescriptor(source.boxes, key)!
    if (key !== 'length' && !('value' in descriptor)) {
      addIssue(issues, 'invalid-type', `$.boxes.${String(key)}`, 'Accessors are not accepted as data.')
    }
  }
  const inspectedCount = Math.min(source.boxes.length, CUSTOM_PART_LIMITS.maxBoxes + 1)
  for (let index = 0; index < inspectedCount; index += 1) {
    const descriptor = boxDescriptors[String(index)]
    if (!descriptor || !('value' in descriptor)) {
      addIssue(issues, 'invalid-type', `$.boxes[${index}]`, 'Must be plain data without holes or accessors.')
      continue
    }
    const box = validateBox(descriptor.value, index, issues)
    if (!box) continue
    boxes.push(box)
    materialSlots.add(box.material)
    if (box.collider) colliderCount += 1
    const volume = box.size[0] * box.size[1] * box.size[2]
    boxVolume += volume
    if (box.collider) colliderVolume += volume

    if (width !== null && depth !== null && height !== null) {
      const half = box.size.map((axis) => axis / 2)
      const lower = box.center.map((center, axis) => center - half[axis])
      const upper = box.center.map((center, axis) => center + half[axis])
      if (lower[0] < -width / 2 - EPSILON || upper[0] > width / 2 + EPSILON
        || lower[1] < -EPSILON || upper[1] > height + EPSILON
        || lower[2] < -depth / 2 - EPSILON || upper[2] > depth / 2 + EPSILON) {
        addIssue(issues, 'out-of-bounds', `$.boxes[${index}]`, 'Box must fit entirely inside declared bounds.')
      }
    }
  }

  if (materialSlots.size > CUSTOM_PART_LIMITS.maxMaterials) {
    addIssue(issues, 'material-limit', '$.boxes', `Uses more than ${CUSTOM_PART_LIMITS.maxMaterials} materials.`)
  }
  if (colliderCount < 1 || colliderCount > CUSTOM_PART_LIMITS.maxColliders) {
    addIssue(
      issues,
      'collider-limit',
      '$.boxes',
      `Must generate 1 through ${CUSTOM_PART_LIMITS.maxColliders} colliders.`,
    )
  }
  if (width !== null && depth !== null && height !== null) {
    const boundsVolume = width * depth * height
    if (boxVolume > boundsVolume * CUSTOM_PART_LIMITS.maxCombinedBoxVolumeMultiplier + EPSILON) {
      addIssue(issues, 'volume-limit', '$.boxes', 'Combined box volume exceeds the render budget.')
    }
    if (colliderVolume > boundsVolume * CUSTOM_PART_LIMITS.maxCombinedColliderVolumeMultiplier + EPSILON) {
      addIssue(issues, 'volume-limit', '$.boxes', 'Combined collider volume exceeds the physics budget.')
    }
  }

  if (issues.length > 0 || width === null || depth === null || height === null
    || typeof source.name !== 'string' || typeof source.studs !== 'string') {
    return { ok: false, issues }
  }

  return {
    ok: true,
    value: canonicalizeCustomPartSource({
      schemaVersion: 1,
      name: source.name,
      bounds: { width, depth, height },
      studs: source.studs as CustomPartSource['studs'],
      boxes,
    }),
  }
}
