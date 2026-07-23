import { BRICK_PART_MAP, GRID_SIZE, rotatedSize } from './parts'
import type { BrickInstance } from './types'

export const BRICK_STUDIO_SCHEMA_VERSION = 1
export const BRICK_STUDIO_PART_LIBRARY_VERSION = 1
export const BRICK_STUDIO_FILE_EXTENSION = '.brickstudio.json'
export const BRICK_STUDIO_MAX_BRICKS = 250
export const BRICK_STUDIO_MAX_JSON_LENGTH = 1_000_000
export const BRICK_STUDIO_MAX_Y = 1_024

export type BrickStudioDocument = {
  schemaVersion: typeof BRICK_STUDIO_SCHEMA_VERSION
  partLibraryVersion: typeof BRICK_STUDIO_PART_LIBRARY_VERSION
  bricks: BrickInstance[]
}

export type BrickStudioDocumentErrorCode =
  | 'invalid-json'
  | 'invalid-document'
  | 'unsupported-schema'
  | 'unsupported-library'
  | 'brick-limit'
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

function fail(code: BrickStudioDocumentErrorCode, message: string): BrickStudioDocumentResult {
  return { ok: false, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneBrick(brick: BrickInstance): BrickInstance {
  return { ...brick }
}

function validateBrick(value: unknown, index: number): BrickStudioDocumentResult | BrickInstance {
  if (!isRecord(value)) return fail('invalid-brick', `Brick ${index + 1} must be an object.`)

  const { id, partId, x, y, z, rotation, color } = value
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    return fail('invalid-brick', `Brick ${index + 1} has an invalid id.`)
  }
  if (typeof partId !== 'string' || !BRICK_PART_MAP[partId]) {
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

function brickFitsLayout(brick: BrickInstance, staged: BrickInstance[]) {
  const part = BRICK_PART_MAP[brick.partId]
  const size = rotatedSize(part, brick.rotation)
  if (brick.x + size.width > GRID_SIZE || brick.z + size.depth > GRID_SIZE) return false

  for (const otherBrick of staged) {
    const otherPart = BRICK_PART_MAP[otherBrick.partId]
    const otherSize = rotatedSize(otherPart, otherBrick.rotation)
    const overlapX = brick.x < otherBrick.x + otherSize.width && brick.x + size.width > otherBrick.x
    const overlapZ = brick.z < otherBrick.z + otherSize.depth && brick.z + size.depth > otherBrick.z
    const overlapY = brick.y < otherBrick.y + otherPart.height && brick.y + part.height > otherBrick.y
    if (overlapX && overlapZ && overlapY) return false
  }
  return true
}

export function createBrickStudioDocument(bricks: BrickInstance[]): BrickStudioDocument {
  return {
    schemaVersion: BRICK_STUDIO_SCHEMA_VERSION,
    partLibraryVersion: BRICK_STUDIO_PART_LIBRARY_VERSION,
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
  if (value.schemaVersion !== BRICK_STUDIO_SCHEMA_VERSION) {
    return fail('unsupported-schema', `Unsupported Brick Studio schema version: ${String(value.schemaVersion)}.`)
  }
  if (value.partLibraryVersion !== BRICK_STUDIO_PART_LIBRARY_VERSION) {
    return fail('unsupported-library', `Unsupported Brick Studio part library version: ${String(value.partLibraryVersion)}.`)
  }

  const maxBricks = Math.max(0, Math.min(options.maxBricks ?? BRICK_STUDIO_MAX_BRICKS, BRICK_STUDIO_MAX_BRICKS))
  if (value.bricks.length > maxBricks) {
    return fail('brick-limit', `This project has ${value.bricks.length} bricks, exceeding the ${maxBricks}-brick limit for this device.`)
  }

  const bricks: BrickInstance[] = []
  const ids = new Set<string>()
  for (let index = 0; index < value.bricks.length; index += 1) {
    const validated = validateBrick(value.bricks[index], index)
    if ('ok' in validated) return validated
    if (ids.has(validated.id)) return fail('invalid-brick', `Brick ${index + 1} repeats the id "${validated.id}".`)
    if (!brickFitsLayout(validated, bricks)) {
      return fail('invalid-layout', `Brick ${index + 1} overlaps another brick or falls outside the build plate.`)
    }
    ids.add(validated.id)
    bricks.push(validated)
  }

  return { ok: true, document: createBrickStudioDocument(bricks) }
}

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
