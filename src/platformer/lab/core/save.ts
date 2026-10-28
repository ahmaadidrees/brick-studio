/**
 * Save format envelope and parser (docs/CODE-LAB-BRICK-MODEL.md, §03 & decision 1).
 *
 * Saves carry:
 * - schemaVersion: format version of this envelope.
 * - engineSemanticsVersion: tick/runtime rule version.
 * - editorVersion: Blockly/editor version.
 * - pluginVersions: exact versions of pinned Blockly plugins.
 * - design: LevelDesign (bricks, stage, painted copy placements, bounds, seed).
 * - workspaces: per-brick Blockly workspace JSON.
 * - ir: per-brick compiled IR (BrickProgram).
 * - originalPayload: raw payload preserved before any schema migration.
 *
 * `serialize` is deterministic (stable key ordering, base64-encoded costume masks).
 * `parse` handles untrusted input safely: caps size, caps depth, never calls eval,
 * rejects prototype pollution keys, decodes masks, runs migrations, and validates.
 */

import type { BrickProgram, Costume, LevelDesign } from './contracts'
import { FORBIDDEN_KEYS, validateDesign } from './project'
import type { DesignProblem } from './project'

export const CURRENT_SCHEMA_VERSION = 1
export const CURRENT_ENGINE_SEMANTICS_VERSION = 1
export const CURRENT_EDITOR_VERSION = '13.3.0'

export const DEFAULT_PLUGIN_VERSIONS: Readonly<Record<string, string>> = Object.freeze({
  '@blockly/block-shareable-procedures': '13.3.0',
  '@blockly/continuous-toolbox': '13.3.0',
})

/** Maximum save file size: 5 MB */
export const MAX_SAVE_BYTES = 5 * 1024 * 1024
/** Maximum JSON object/array nesting depth */
export const MAX_PARSE_DEPTH = 128

export interface SavedProjectEnvelope {
  schemaVersion: number
  engineSemanticsVersion: number
  editorVersion: string
  pluginVersions: Record<string, string>
  design: LevelDesign
  workspaces?: Record<string, unknown>
  ir?: Record<string, BrickProgram>
  originalPayload?: unknown
}

export type ParseResult =
  | { ok: true; save: SavedProjectEnvelope; migrated: boolean; problems: DesignProblem[] }
  | { ok: false; problems: DesignProblem[] }

export type MigrationFn = (envelope: SavedProjectEnvelope) => SavedProjectEnvelope

const migrationRegistry = new Map<number, MigrationFn>()

export function registerMigration(fromVersion: number, fn: MigrationFn): void {
  migrationRegistry.set(fromVersion, fn)
}

// Default v0 -> v1 migration: elevates unversioned or v0 envelope to v1
registerMigration(0, (envelope: SavedProjectEnvelope): SavedProjectEnvelope => {
  return {
    ...envelope,
    schemaVersion: 1,
    engineSemanticsVersion:
      typeof envelope.engineSemanticsVersion === 'number'
        ? envelope.engineSemanticsVersion
        : CURRENT_ENGINE_SEMANTICS_VERSION,
    editorVersion:
      typeof envelope.editorVersion === 'string' ? envelope.editorVersion : CURRENT_EDITOR_VERSION,
    pluginVersions:
      envelope.pluginVersions && typeof envelope.pluginVersions === 'object'
        ? envelope.pluginVersions
        : { ...DEFAULT_PLUGIN_VERSIONS },
    workspaces: envelope.workspaces ?? {},
    ir: envelope.ir ?? {},
  }
})

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const B64_LOOKUP = new Uint8Array(256)
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_LOOKUP[B64_CHARS.charCodeAt(i)] = i
}

export function encodeBase64(bytes: Uint8Array): string {
  let result = ''
  const len = bytes.length
  let i = 0
  for (; i + 2 < len; i += 3) {
    const b0 = bytes[i]
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    result += B64_CHARS[b0 >> 2]
    result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)]
    result += B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)]
    result += B64_CHARS[b2 & 63]
  }
  if (i < len) {
    const b0 = bytes[i]
    if (i + 1 < len) {
      const b1 = bytes[i + 1]
      result += B64_CHARS[b0 >> 2]
      result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)]
      result += B64_CHARS[(b1 & 15) << 2]
      result += '='
    } else {
      result += B64_CHARS[b0 >> 2]
      result += B64_CHARS[(b0 & 3) << 4]
      result += '=='
    }
  }
  return result
}

export function decodeBase64(str: string): Uint8Array | null {
  const clean = str.replace(/[\s\r\n]+/g, '')
  if (clean.length % 4 !== 0) return null
  const len = clean.length
  if (len === 0) return new Uint8Array(0)
  let padding = 0
  if (clean[len - 1] === '=') {
    padding++
    if (clean[len - 2] === '=') padding++
  }
  const byteLen = (len * 3) / 4 - padding
  const bytes = new Uint8Array(byteLen)
  let byteIndex = 0
  for (let i = 0; i < len; i += 4) {
    const c0 = clean.charCodeAt(i)
    const c1 = clean.charCodeAt(i + 1)
    const c2 = clean.charCodeAt(i + 2)
    const c3 = clean.charCodeAt(i + 3)
    const v0 = B64_LOOKUP[c0]
    const v1 = B64_LOOKUP[c1]
    const v2 = c2 === 61 ? 0 : B64_LOOKUP[c2]
    const v3 = c3 === 61 ? 0 : B64_LOOKUP[c3]
    bytes[byteIndex++] = (v0 << 2) | (v1 >> 4)
    if (clean[i + 2] !== '=') bytes[byteIndex++] = ((v1 & 15) << 4) | (v2 >> 2)
    if (clean[i + 3] !== '=') bytes[byteIndex++] = ((v2 & 3) << 6) | v3
  }
  return bytes
}

/** Check bracket nesting depth without constructing full object tree. */
export function checkJsonDepth(text: string, maxDepth: number): boolean {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '{' || ch === '[') {
      depth++
      if (depth > maxDepth) return false
    } else if (ch === '}' || ch === ']') {
      depth--
    }
  }
  return true
}

/** Recursively stringify an object with alphabetically sorted keys and standard 2-space indentation. */
export function deterministicStringify(value: unknown, indent = 2): string {
  const space = ' '.repeat(indent)

  function format(val: unknown, currentIndent: string): string {
    if (val === null) return 'null'
    if (typeof val === 'boolean') return val ? 'true' : 'false'
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) return 'null'
      return Object.is(val, -0) ? '0' : String(val)
    }
    if (typeof val === 'string') return JSON.stringify(val)
    if (Array.isArray(val)) {
      if (val.length === 0) return '[]'
      const nextIndent = currentIndent + space
      const items = val.map((item) => format(item === undefined ? null : item, nextIndent))
      return `[\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${currentIndent}]`
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val)
        .filter((k) => (val as Record<string, unknown>)[k] !== undefined)
        .sort()
      if (keys.length === 0) return '{}'
      const nextIndent = currentIndent + space
      const entries = keys.map((key) => {
        const itemVal = (val as Record<string, unknown>)[key]
        return `${JSON.stringify(key)}: ${format(itemVal, nextIndent)}`
      })
      return `{\n${nextIndent}${entries.join(`,\n${nextIndent}`)}\n${currentIndent}}`
    }
    return 'null'
  }

  return format(value, '') + '\n'
}

/** Prepare costume masks by encoding any Uint8Array to base64 before JSON output. */
function prepareSerializableCostumes(costumes: Costume[] | undefined): unknown[] {
  if (!Array.isArray(costumes)) return []
  return costumes.map((costume) => {
    if (!costume || typeof costume !== 'object') return costume
    if (costume.mask && costume.mask.data instanceof Uint8Array) {
      return {
        ...costume,
        mask: {
          width: costume.mask.width,
          height: costume.mask.height,
          data: encodeBase64(costume.mask.data),
        },
      }
    }
    return costume
  })
}

function prepareSerializableDesign(design: LevelDesign): unknown {
  const serializableStage = design.stage
    ? {
        ...design.stage,
        costumes: prepareSerializableCostumes(design.stage.costumes),
      }
    : design.stage

  const serializableBricks = Array.isArray(design.bricks)
    ? design.bricks.map((brick) => ({
        ...brick,
        costumes: prepareSerializableCostumes(brick.costumes),
      }))
    : design.bricks

  return {
    ...design,
    stage: serializableStage,
    bricks: serializableBricks,
  }
}

/**
 * Deterministically serializes a project save file to JSON.
 * Sorts object keys alphabetically at every level and encodes masks as base64.
 */
export function serialize(save: SavedProjectEnvelope): string {
  const serializableDesign = save.design ? prepareSerializableDesign(save.design) : save.design
  const envelope: Record<string, unknown> = {
    schemaVersion: save.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    engineSemanticsVersion: save.engineSemanticsVersion ?? CURRENT_ENGINE_SEMANTICS_VERSION,
    editorVersion: save.editorVersion ?? CURRENT_EDITOR_VERSION,
    pluginVersions: save.pluginVersions ?? { ...DEFAULT_PLUGIN_VERSIONS },
    design: serializableDesign,
    workspaces: save.workspaces ?? {},
    ir: save.ir ?? {},
  }
  if (save.originalPayload !== undefined) {
    envelope.originalPayload = save.originalPayload
  }
  return deterministicStringify(envelope)
}

/** Decode base64 costume masks in a parsed design object into Uint8Arrays. */
function decodeDesignMasks(design: LevelDesign): DesignProblem[] {
  const problems: DesignProblem[] = []
  const processCostumes = (costumes: Costume[] | undefined, prefix: string) => {
    if (!Array.isArray(costumes)) return
    costumes.forEach((costume, idx) => {
      if (!costume || typeof costume !== 'object' || !costume.mask) return
      const mask = costume.mask as { width?: unknown; height?: unknown; data?: unknown }
      if (typeof mask.data === 'string') {
        const decoded = decodeBase64(mask.data)
        if (!decoded) {
          problems.push({
            code: 'bad-value',
            path: `${prefix}[${idx}].mask.data`,
            message: 'Failed to decode base64 mask data.',
          })
          return
        }
        ;(costume.mask as { data: Uint8Array }).data = decoded
      }
    })
  }

  if (design.stage) processCostumes(design.stage.costumes, 'stage.costumes')
  if (Array.isArray(design.bricks)) {
    design.bricks.forEach((brick, i) => {
      if (brick) processCostumes(brick.costumes, `bricks[${i}].costumes`)
    })
  }
  return problems
}

/**
 * Parse an untrusted save file string.
 *
 * Safety guarantees:
 * - Rejects files exceeding MAX_SAVE_BYTES.
 * - Rejects JSON nesting deeper than MAX_PARSE_DEPTH.
 * - Rejects prototype pollution keys (__proto__, constructor, prototype).
 * - Never calls eval().
 * - Rejects future schema versions.
 * - Applies migrations if older schema version, preserving originalPayload.
 * - Decodes base64 masks.
 * - Validates the design with validateDesign().
 * - Never throws.
 */
export function parse(text: string): ParseResult {
  if (typeof text !== 'string') {
    return { ok: false, problems: [{ code: 'bad-value', path: '', message: 'Input must be a string.' }] }
  }
  if (text.length > MAX_SAVE_BYTES) {
    return {
      ok: false,
      problems: [{ code: 'limit', path: '', message: `Save exceeds maximum size of ${MAX_SAVE_BYTES} bytes.` }],
    }
  }

  if (!checkJsonDepth(text, MAX_PARSE_DEPTH)) {
    return {
      ok: false,
      problems: [{ code: 'limit', path: '', message: `Save JSON exceeds nesting limit of ${MAX_PARSE_DEPTH} levels.` }],
    }
  }

  let forbiddenKey: string | null = null
  let parsed: unknown
  try {
    parsed = JSON.parse(text, (key, value) => {
      if (FORBIDDEN_KEYS.includes(key)) {
        forbiddenKey = key
      }
      return value
    })
  } catch (err) {
    return {
      ok: false,
      problems: [{ code: 'bad-value', path: '', message: `Invalid JSON: ${(err as Error).message}` }],
    }
  }

  if (forbiddenKey) {
    return {
      ok: false,
      problems: [{ code: 'unsafe-id', path: forbiddenKey, message: `Save contains forbidden property "${forbiddenKey}".` }],
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, problems: [{ code: 'bad-value', path: '', message: 'Save must be an object envelope.' }] }
  }

  const rawEnv = parsed as Partial<SavedProjectEnvelope>
  if (
    typeof rawEnv.schemaVersion !== 'number' ||
    !Number.isInteger(rawEnv.schemaVersion) ||
    rawEnv.schemaVersion < 0
  ) {
    return {
      ok: false,
      problems: [{ code: 'bad-value', path: 'schemaVersion', message: 'schemaVersion must be a non-negative integer.' }],
    }
  }

  if (rawEnv.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      problems: [
        {
          code: 'bad-value',
          path: 'schemaVersion',
          message: `Unsupported future schema version ${rawEnv.schemaVersion} (highest supported is ${CURRENT_SCHEMA_VERSION}).`,
        },
      ],
    }
  }

  let migrated = false
  let envelope = rawEnv as SavedProjectEnvelope

  if (envelope.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const originalPayload = structuredClone(envelope)
    let ver = envelope.schemaVersion
    while (ver < CURRENT_SCHEMA_VERSION) {
      const migration = migrationRegistry.get(ver)
      if (!migration) {
        return {
          ok: false,
          problems: [
            {
              code: 'bad-value',
              path: 'schemaVersion',
              message: `No migration available from schemaVersion ${ver}.`,
            },
          ],
        }
      }
      envelope = migration(envelope)
      ver = envelope.schemaVersion
    }
    envelope.originalPayload = originalPayload
    migrated = true
  }

  if (typeof envelope.engineSemanticsVersion !== 'number' || !Number.isInteger(envelope.engineSemanticsVersion)) {
    return {
      ok: false,
      problems: [{ code: 'bad-value', path: 'engineSemanticsVersion', message: 'engineSemanticsVersion must be an integer.' }],
    }
  }
  if (typeof envelope.editorVersion !== 'string') {
    return {
      ok: false,
      problems: [{ code: 'bad-value', path: 'editorVersion', message: 'editorVersion must be a string.' }],
    }
  }
  if (!envelope.pluginVersions || typeof envelope.pluginVersions !== 'object' || Array.isArray(envelope.pluginVersions)) {
    return {
      ok: false,
      problems: [{ code: 'bad-value', path: 'pluginVersions', message: 'pluginVersions must be an object.' }],
    }
  }
  if (!envelope.design || typeof envelope.design !== 'object') {
    return {
      ok: false,
      problems: [{ code: 'bad-value', path: 'design', message: 'design must be an object.' }],
    }
  }

  // Ensure workspaces and ir defaults
  if (!envelope.workspaces) envelope.workspaces = {}
  if (!envelope.ir) envelope.ir = {}

  // Decode masks
  const maskProblems = decodeDesignMasks(envelope.design)
  if (maskProblems.length > 0) {
    return { ok: false, problems: maskProblems }
  }

  // Validate the design
  const designProblems = validateDesign(envelope.design)
  if (designProblems.length > 0) {
    return { ok: false, problems: designProblems }
  }

  return {
    ok: true,
    save: envelope,
    migrated,
    problems: [],
  }
}
