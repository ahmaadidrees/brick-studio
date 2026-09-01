import { BRICK_PART_MAP, createPartMap } from './parts'
import { BrickLayoutIndex } from './brickRules'
import type { BrickInstance, CustomPartDefinition, CustomPartTemplate, EnvironmentId } from './types'

export const BRICK_STUDIO_SCHEMA_VERSION = 2
export const BRICK_STUDIO_PART_LIBRARY_VERSION = 1
export const BRICK_STUDIO_FILE_EXTENSION = '.brickstudio.json'
/** Shared document/live-world capacity. Rendering quality may adapt by device. */
export const BRICK_STUDIO_MAX_BRICKS = 1_000
export const BRICK_STUDIO_MAX_CUSTOM_PARTS = 24
export const BRICK_STUDIO_MAX_JSON_LENGTH = 800_000
export const BRICK_STUDIO_MAX_Y = 1_024
export const DEFAULT_ENVIRONMENT_ID: EnvironmentId = 'classic'
export const ENVIRONMENT_IDS: readonly EnvironmentId[] = ['classic', 'toy-room', 'brick-valley', 'sky-island']

export type BrickStudioDocumentV1 = {
  schemaVersion: 1
  partLibraryVersion: number
  bricks: BrickInstance[]
}

export type BrickStudioDocument = {
  schemaVersion: typeof BRICK_STUDIO_SCHEMA_VERSION
  partLibraryVersion: number
  environmentId: EnvironmentId
  customParts: CustomPartDefinition[]
  bricks: BrickInstance[]
}

export type BrickStudioDocumentErrorCode =
  | 'invalid-json'
  | 'invalid-document'
  | 'unsupported-schema'
  | 'unsupported-library'
  | 'brick-limit'
  | 'custom-part-limit'
  | 'invalid-custom-part'
  | 'invalid-environment'
  | 'invalid-brick'
  | 'invalid-layout'

export type BrickStudioDocumentError = {
  code: BrickStudioDocumentErrorCode
  message: string
}

export type BrickStudioDocumentResult =
  | { ok: true; document: BrickStudioDocument }
  | { ok: false; error: BrickStudioDocumentError }

type ValidationOptions = {
  maxBricks?: number
}

const COLOR_PATTERN = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
const CUSTOM_PART_ID_PATTERN = /^custom_[A-Za-z0-9_-]{1,64}$/
const CUSTOM_PART_TEMPLATES = new Set<CustomPartTemplate>([
  'solid', 'slope', 'invertedSlope', 'corner', 'round',
  'cone', 'stairs', 'arch', 'window', 'door',
])

function fail(code: BrickStudioDocumentErrorCode, message: string): BrickStudioDocumentResult {
  return { ok: false, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneBrick(brick: BrickInstance): BrickInstance {
  return { ...brick }
}

function cloneCustomPart(definition: CustomPartDefinition): CustomPartDefinition {
  return { ...definition }
}

function validateCustomPart(value: unknown, index: number): BrickStudioDocumentResult | CustomPartDefinition {
  if (!isRecord(value)) return fail('invalid-custom-part', `Custom part ${index + 1} must be an object.`)
  const { id, name, template, width, depth, height, studs } = value
  if (typeof id !== 'string' || !CUSTOM_PART_ID_PATTERN.test(id) || BRICK_PART_MAP[id]) {
    return fail('invalid-custom-part', `Custom part ${index + 1} has an invalid id.`)
  }
  if (typeof name !== 'string' || !name.trim() || name.length > 40) {
    return fail('invalid-custom-part', `Custom part ${index + 1} has an invalid name.`)
  }
  if (typeof template !== 'string' || !CUSTOM_PART_TEMPLATES.has(template as CustomPartTemplate)) {
    return fail('invalid-custom-part', `Custom part ${index + 1} has an invalid template.`)
  }
  if (![width, depth, height].every(Number.isInteger)
      || typeof width !== 'number' || width < 1 || width > 8
      || typeof depth !== 'number' || depth < 1 || depth > 8
      || typeof height !== 'number' || height < 1 || height > 12) {
    return fail('invalid-custom-part', `Custom part ${index + 1} has dimensions outside the supported range.`)
  }
  if (studs !== 'auto' && studs !== 'full' && studs !== 'none') {
    return fail('invalid-custom-part', `Custom part ${index + 1} has an invalid stud pattern.`)
  }
  if ((template === 'round' || template === 'cone') && width !== depth) {
    return fail('invalid-custom-part', `Custom part ${index + 1} must be square for its selected template.`)
  }
  return { id, name: name.trim(), template: template as CustomPartTemplate, width, depth, height, studs }
}

function validateBrick(
  value: unknown,
  index: number,
  partMap: ReturnType<typeof createPartMap>,
): BrickStudioDocumentResult | BrickInstance {
  if (!isRecord(value)) return fail('invalid-brick', `Brick ${index + 1} must be an object.`)

  const { id, partId, x, y, z, rotation, color } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    return fail('invalid-brick', `Brick ${index + 1} has an invalid id.`)
  }
  if (typeof partId !== 'string' || !partMap[partId]) {
    return fail('invalid-brick', `Brick ${index + 1} uses an unknown part id.`)
  }
  if (![x, y, z].every((coordinate) => Number.isInteger(coordinate))) {
    return fail('invalid-brick', `Brick ${index + 1} coordinates must be whole grid values.`)
  }
  if (
    typeof x !== 'number'
    || typeof y !== 'number'
    || typeof z !== 'number'
    || x < 0
    || z < 0
    || y < 0
    || y > BRICK_STUDIO_MAX_Y
  ) {
    return fail('invalid-brick', `Brick ${index + 1} has coordinates outside the supported build range.`)
  }
  if (rotation !== 0 && rotation !== 1 && rotation !== 2 && rotation !== 3) {
    return fail('invalid-brick', `Brick ${index + 1} has an invalid rotation.`)
  }
  if (typeof color !== 'string' || !COLOR_PATTERN.test(color)) {
    return fail('invalid-brick', `Brick ${index + 1} has an invalid color.`)
  }

  return { id, partId, x, y, z, rotation, color }
}

export type CreateBrickStudioDocumentOptions = {
  environmentId?: EnvironmentId
  customParts?: CustomPartDefinition[]
}

export function createBrickStudioDocument(
  bricks: BrickInstance[],
  options: CreateBrickStudioDocumentOptions = {},
): BrickStudioDocument {
  return {
    schemaVersion: BRICK_STUDIO_SCHEMA_VERSION,
    partLibraryVersion: BRICK_STUDIO_PART_LIBRARY_VERSION,
    environmentId: options.environmentId ?? DEFAULT_ENVIRONMENT_ID,
    customParts: (options.customParts ?? []).map(cloneCustomPart),
    bricks: bricks.map(cloneBrick),
  }
}

export function validateBrickStudioDocument(
  value: unknown,
  options: ValidationOptions = {},
): BrickStudioDocumentResult {
  if (!isRecord(value) || !Array.isArray(value.bricks)) {
    return fail('invalid-document', 'This is not a Brick Studio document.')
  }
  if (value.schemaVersion !== 1 && value.schemaVersion !== BRICK_STUDIO_SCHEMA_VERSION) {
    return fail('unsupported-schema', `Unsupported Brick Studio schema version: ${String(value.schemaVersion)}.`)
  }
  if (!Number.isInteger(value.partLibraryVersion)
      || typeof value.partLibraryVersion !== 'number'
      || value.partLibraryVersion < 1
      || value.partLibraryVersion > BRICK_STUDIO_PART_LIBRARY_VERSION) {
    return fail('unsupported-library', `Unsupported Brick Studio part library version: ${String(value.partLibraryVersion)}.`)
  }

  const environmentId = value.schemaVersion === 1 ? DEFAULT_ENVIRONMENT_ID : value.environmentId
  if (typeof environmentId !== 'string' || !ENVIRONMENT_IDS.includes(environmentId as EnvironmentId)) {
    return fail('invalid-environment', `Unsupported Brick Studio environment: ${String(environmentId)}.`)
  }
  const rawCustomParts = value.schemaVersion === 1 ? [] : value.customParts
  if (!Array.isArray(rawCustomParts)) {
    return fail('invalid-document', 'This document is missing its custom-parts collection.')
  }
  if (rawCustomParts.length > BRICK_STUDIO_MAX_CUSTOM_PARTS) {
    return fail('custom-part-limit', `This project exceeds the ${BRICK_STUDIO_MAX_CUSTOM_PARTS}-custom-part limit.`)
  }
  const customParts: CustomPartDefinition[] = []
  const customIds = new Set<string>()
  for (let index = 0; index < rawCustomParts.length; index += 1) {
    const validated = validateCustomPart(rawCustomParts[index], index)
    if ('ok' in validated) return validated
    if (customIds.has(validated.id)) {
      return fail('invalid-custom-part', `Custom part ${index + 1} repeats the id "${validated.id}".`)
    }
    customIds.add(validated.id)
    customParts.push(validated)
  }
  const partMap = createPartMap(customParts)

  const maxBricks = Math.max(0, Math.min(options.maxBricks ?? BRICK_STUDIO_MAX_BRICKS, BRICK_STUDIO_MAX_BRICKS))
  if (value.bricks.length > maxBricks) {
    return fail('brick-limit', `This project has ${value.bricks.length} bricks, exceeding the ${maxBricks}-brick world limit.`)
  }

  const bricks: BrickInstance[] = []
  const ids = new Set<string>()
  const layout = new BrickLayoutIndex(partMap)
  for (let index = 0; index < value.bricks.length; index += 1) {
    const validated = validateBrick(value.bricks[index], index, partMap)
    if ('ok' in validated) return validated
    if (ids.has(validated.id)) return fail('invalid-brick', `Brick ${index + 1} repeats the id "${validated.id}".`)
    if (!layout.add(validated)) {
      return fail('invalid-layout', `Brick ${index + 1} overlaps another brick or falls outside the build plate.`)
    }
    ids.add(validated.id)
    bricks.push(validated)
  }

  return {
    ok: true,
    document: createBrickStudioDocument(bricks, {
      environmentId: environmentId as EnvironmentId,
      customParts,
    }),
  }
}

export const normalizeBrickStudioDocument = validateBrickStudioDocument

export function parseBrickStudioDocument(
  serialized: string,
  options: ValidationOptions = {},
): BrickStudioDocumentResult {
  if (typeof serialized !== 'string' || serialized.length > BRICK_STUDIO_MAX_JSON_LENGTH) {
    return fail('invalid-json', 'The selected file is too large or is not text.')
  }
  try {
    return validateBrickStudioDocument(JSON.parse(serialized) as unknown, options)
  } catch {
    return fail('invalid-json', 'The selected file is not valid JSON.')
  }
}

export function serializeBrickStudioDocument(document: BrickStudioDocument) {
  return `${JSON.stringify(document, null, 2)}\n`
}
