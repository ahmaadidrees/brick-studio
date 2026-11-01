/**
 * What the Hackable Platformer accepts from outside: picture and sound sources, and power files. Project files, power
 * files and the class shelf are written by classmates now (and maybe by a helper later), so the app checks them here
 * whatever wrote them.
 *
 * No browser and no app imports: the Worker checks class shelf powers with this same module
 * (multiplayer/worker/src/classroom/shelf.ts), so the shelf and the app can never disagree about what a power is.
 */
import { isKnownBlockType } from './editor/knownBlocks'

// ------------------------------------------------------------------------------------------------ pictures and sounds

/** Characters one picture or sound may take in a save (core/project.ts DESIGN_LIMITS.maxAssetChars). */
export const MAX_ASSET_CHARS = 200_000

/**
 * A costume or backdrop picture: a base64 data URL of a raster image. Never a web address (it would load from someone
 * else's server) and never SVG (it can carry script). Built-in art is made as PNG data URLs too (studio/pixels.ts).
 */
const COSTUME_SOURCE = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/
/** A sound: a base64 data URL of audio. The sound library makes WAV data URLs (studio/assets/soundLibrary.ts). */
const SOUND_SOURCE = /^data:audio\/[a-z0-9][a-z0-9.+-]{0,40};base64,[A-Za-z0-9+/]+={0,2}$/

export function isCostumeSource(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ASSET_CHARS && COSTUME_SOURCE.test(value)
}

export function isSoundSource(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_ASSET_CHARS && SOUND_SOURCE.test(value)
}

// ------------------------------------------------------------------------------------------------ power files

export const POWER_KIND = 'brickgineers-power'
/** A power file opened from the computer. Bigger than any power made from a brick's scripts; the shelf takes less. */
export const POWER_FILE_MAX_CHARS = 512 * 1024
/** Top-level blocks (scripts and My Block definitions) one power may add. */
export const POWER_MAX_SCRIPTS = 100
/** Blocks in all, counting every block inside the scripts. A brick can hold 5,000 (DESIGN_LIMITS.maxStatements). */
export const POWER_MAX_BLOCKS = 2_000
export const POWER_MAX_VARIABLES = 100
const MAX_DEPTH = 64
const MAX_LIST_ITEMS = 20_000
const MAX_TEXT = 20_000
/** The fields a power file has (studio/powers/powers.ts PowerBrick). `game` is optional: missing means the platformer. */
const POWER_KEYS = new Set(['kind', 'version', 'id', 'name', 'credits', 'what', 'fits', 'game', 'blocks', 'variables'])
/** Blockly's own keys on a saved block. */
const BLOCK_KEYS = new Set(['type', 'id', 'x', 'y', 'enabled', 'disabledReasons', 'collapsed', 'deletable', 'movable', 'editable', 'inline', 'inputsInline', 'extraState', 'data', 'icons', 'fields', 'inputs', 'next'])
const FORBIDDEN = new Set(['__proto__', 'constructor', 'prototype'])

export type PowerRefusal = 'not-power' | 'damaged' | 'other-game' | 'unknown-blocks' | 'pictures' | 'too-big'

/** What the kid reads for each refusal. */
export const POWER_REFUSALS: Readonly<Record<PowerRefusal, string>> = {
  'not-power': 'That file isn’t a power. Power files end in .power.json.',
  damaged: 'That power is damaged, so it can’t snap on.',
  'other-game': 'That power is for a different game, so it can’t snap on here.',
  'unknown-blocks': 'That power uses blocks that aren’t part of Brickgineers, so it can’t snap on.',
  pictures: 'That power has pictures or sounds in it. A power holds only blocks, so it can’t snap on.',
  'too-big': 'That power is too big to snap on.',
}

/** A power that passed every check, holding only a power's own fields. */
export interface CheckedPower {
  kind: typeof POWER_KIND
  version: 1
  id?: string
  name: string
  credits: string[]
  what?: string
  fits: 'brick' | 'stage'
  game?: 'platformer'
  blocks: Array<Record<string, unknown>>
  variables: Array<{ id: string; name: string; value: unknown; list?: boolean; showInBuild?: boolean }>
}

export type PowerCheck =
  | { ok: true; power: CheckedPower; blockCount: number }
  | { ok: false; refusal: PowerRefusal; message: string; detail: string }

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const hasControlChar = (text: string) => /[\u0000-\u001f\u007f]/.test(text)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !hasControlChar(v)
const isValue = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= MAX_TEXT)
/** Blockly's variable and block ids use punctuation; they are opaque keys (core/project.ts isEditorId). */
const isEditorId = (v: unknown): v is string => typeof v === 'string' && v.length >= 1 && v.length <= 64 && !hasControlChar(v) && !FORBIDDEN.has(v)

class Refused extends Error {
  constructor(readonly refusal: PowerRefusal, readonly detail: string) {
    super(detail)
  }
}
const refuse = (refusal: PowerRefusal, detail: string): never => { throw new Refused(refusal, detail) }

/**
 * Check a whole power, as parsed JSON: its shape and types, what it is for, its size, and every block in it. A power
 * holding a block this version does not know is refused (it could only sit there doing nothing). Never throws.
 */
export function checkPowerPayload(value: unknown): PowerCheck {
  try {
    return checked(value)
  } catch (error) {
    if (error instanceof Refused) return { ok: false, refusal: error.refusal, message: POWER_REFUSALS[error.refusal], detail: error.detail }
    return { ok: false, refusal: 'damaged', message: POWER_REFUSALS.damaged, detail: String(error) }
  }
}

/** Read a power file's text and check it. */
export function checkPowerText(text: string): PowerCheck {
  if (typeof text !== 'string') return checkPowerPayload(null)
  if (text.length > POWER_FILE_MAX_CHARS) return { ok: false, refusal: 'too-big', message: POWER_REFUSALS['too-big'], detail: `over ${POWER_FILE_MAX_CHARS} characters` }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, refusal: 'not-power', message: POWER_REFUSALS['not-power'], detail: 'not JSON' }
  }
  return checkPowerPayload(value)
}

function checked(v: unknown): PowerCheck {
  if (!isRecord(v) || v.kind !== POWER_KIND) refuse('not-power', 'kind')
  const p = v as Json
  if (p.version !== 1) refuse('not-power', 'version')
  if (p.game !== undefined && p.game !== 'platformer') refuse('other-game', `game ${String(p.game)}`)
  // Powers carry no pictures or sounds (a brick's own costumes are used), so none can come in from somewhere else this way.
  if (p.costumes !== undefined || p.sounds !== undefined) refuse('pictures', 'costumes or sounds')
  for (const key of Object.keys(p)) if (!POWER_KEYS.has(key)) refuse('damaged', `unexpected field ${key}`)
  if (p.id !== undefined && !isText(p.id, 80)) refuse('damaged', 'id')
  if (!isText(p.name, 80) || !p.name.trim()) refuse('damaged', 'name')
  if (p.what !== undefined && !isText(p.what, 1_000)) refuse('damaged', 'what')
  if (p.fits !== 'brick' && p.fits !== 'stage') refuse('damaged', 'fits')
  if (!Array.isArray(p.credits) || p.credits.length > 50 || !p.credits.every((c) => isText(c, 80))) refuse('damaged', 'credits')
  if (!Array.isArray(p.variables) || !Array.isArray(p.blocks)) refuse('damaged', 'blocks or variables')
  const variables = p.variables as unknown[]
  const blocks = p.blocks as unknown[]
  if (variables.length > POWER_MAX_VARIABLES) refuse('too-big', `${variables.length} variables`)
  const ids = new Set<string>()
  for (const x of variables) {
    if (!isRecord(x) || !isEditorId(x.id) || ids.has(x.id) || !isText(x.name, 80) || !x.name.trim()) refuse('damaged', 'variable')
    const variable = x as Json
    ids.add(variable.id as string)
    if (variable.list !== undefined && typeof variable.list !== 'boolean') refuse('damaged', 'variable list flag')
    if (variable.showInBuild !== undefined && typeof variable.showInBuild !== 'boolean') refuse('damaged', 'variable showInBuild')
    const value = variable.value
    const ok = Array.isArray(value) ? value.length <= MAX_LIST_ITEMS && value.every(isValue) : isValue(value)
    if (!ok) refuse('damaged', 'variable value')
  }
  if (blocks.length > POWER_MAX_SCRIPTS) refuse('too-big', `${blocks.length} scripts`)
  const unknown = new Set<string>()
  let count = 0
  const walk = (block: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) refuse('too-big', 'blocks nested too deep')
    if (!isRecord(block) || typeof block.type !== 'string') refuse('damaged', 'a block has no type')
    const b = block as Json
    if (++count > POWER_MAX_BLOCKS) refuse('too-big', `over ${POWER_MAX_BLOCKS} blocks`)
    if (!isKnownBlockType(b.type)) unknown.add(String(b.type).slice(0, 64))
    for (const key of Object.keys(b)) if (!BLOCK_KEYS.has(key)) refuse('damaged', `unexpected block field ${key}`)
    if (b.id !== undefined && !isEditorId(b.id)) refuse('damaged', 'block id')
    if (b.fields !== undefined) {
      if (!isRecord(b.fields)) refuse('damaged', 'block fields')
      for (const [name, field] of Object.entries(b.fields as Json)) {
        if (FORBIDDEN.has(name)) refuse('damaged', 'field name')
        // A field is a value, or Blockly's { id } / { id, name, type } for a variable.
        const fine = isValue(field) || (isRecord(field) && Object.values(field).every((f) => f === undefined || isValue(f)))
        if (!fine) refuse('damaged', 'field value')
      }
    }
    if (b.inputs !== undefined && !isRecord(b.inputs)) refuse('damaged', 'block inputs')
    // Inputs and the block underneath are connections: { block, shadow }. Every block in them is checked too.
    const conns = [...Object.entries((b.inputs ?? {}) as Json), ...(b.next !== undefined ? [['next', b.next] as const] : [])]
    for (const [name, conn] of conns) {
      if (FORBIDDEN.has(name)) refuse('damaged', 'input name')
      if (conn === undefined || conn === null) continue
      if (!isRecord(conn)) refuse('damaged', 'connection')
      const c = conn as Json
      for (const k of Object.keys(c)) if (k !== 'block' && k !== 'shadow') refuse('damaged', 'connection field')
      if (c.block !== undefined) walk(c.block, depth + 1)
      if (c.shadow !== undefined) walk(c.shadow, depth + 1)
    }
  }
  for (const block of blocks) walk(block, 0)
  if (unknown.size > 0) refuse('unknown-blocks', [...unknown].join(', '))

  const power: CheckedPower = {
    kind: POWER_KIND,
    version: 1,
    ...(p.id !== undefined ? { id: p.id as string } : {}),
    name: p.name as string,
    credits: p.credits as string[],
    ...(p.what !== undefined ? { what: p.what as string } : {}),
    fits: p.fits as 'brick' | 'stage',
    ...(p.game !== undefined ? { game: 'platformer' as const } : {}),
    blocks: blocks as Array<Record<string, unknown>>,
    variables: variables as CheckedPower['variables'],
  }
  return { ok: true, power, blockCount: count }
}
