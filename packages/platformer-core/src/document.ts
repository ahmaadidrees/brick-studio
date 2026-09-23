import { levelFromJson, levelToJson, type LevelDesign, type LevelJson } from './engine/level'

/**
 * A 2D level as it is stored in an account world (`brick_worlds.document`). The `format` field is what tells it
 * apart from a 3D brick document, which has none: everything that opens, saves, copies or hosts a world reads it
 * first, so a 2D level never reaches the 3D editor or a 3D room and a brick build never reaches the 2D ones.
 */
export const PLATFORMER_FORMAT = 'brickgineers-2d'
export const PLATFORMER_DOCUMENT_VERSION = 1

export interface PlatformerDocument {
  format: typeof PLATFORMER_FORMAT
  version: typeof PLATFORMER_DOCUMENT_VERSION
  level: LevelJson
}

/** Cheap check of the marker only; use `validatePlatformerDocument` before trusting the contents. */
export function isPlatformerDocument(value: unknown): boolean {
  return !!value && typeof value === 'object' && (value as { format?: unknown }).format === PLATFORMER_FORMAT
}

export function createPlatformerDocument(level: LevelDesign): PlatformerDocument {
  return { format: PLATFORMER_FORMAT, version: PLATFORMER_DOCUMENT_VERSION, level: levelToJson(level) }
}

export type PlatformerValidation =
  | { ok: true; document: PlatformerDocument; level: LevelDesign }
  | { ok: false; reason: string }

/**
 * Full validation. The result is rebuilt from the parsed level, so unknown fields are dropped and the stored copy is
 * always in canonical form.
 */
export function validatePlatformerDocument(value: unknown): PlatformerValidation {
  if (!isPlatformerDocument(value)) return { ok: false, reason: 'not a 2D level' }
  const doc = value as { version?: unknown; level?: unknown }
  if (doc.version !== PLATFORMER_DOCUMENT_VERSION) return { ok: false, reason: 'unsupported 2D level version' }
  try {
    const level = levelFromJson(doc.level)
    return { ok: true, level, document: createPlatformerDocument(level) }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid 2D level' }
  }
}
