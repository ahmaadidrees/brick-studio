import type { Costume } from '../../core/contracts'
import { DESIGN_LIMITS } from '../../core/project'
import { checkJsonDepth, encodeBase64, MAX_PARSE_DEPTH, MAX_SAVE_BYTES, parse, type ParseResult } from '../../core/save'
import { upgradeLegacySaveText } from '../legacySave'
import { costumeFromImage, decodePng, type PixelImage } from '../pixels'

/*
 * Pictures that stopped a project from opening, put right.
 *
 * Until 2026-10-29 pictures were saved uncompressed, and a blank picture had an empty "opaque" box. Opening the
 * Stage's Costumes made a 480 × 360 blank backdrop of about 922,000 characters, over the 200,000 one picture may
 * take (core/project.ts), so the game refused the project: on this computer every later save was refused, and an
 * account kept a project that would not open again. Here such a save opens again:
 *   - a backdrop with nothing painted on it is dropped (the stage shows its day sky, as before it was made);
 *   - any other picture that is too big is compressed, and a backdrop that is still too big is shrunk (the stage
 *     stretches its backdrop over the level, so it looks the same, a little blockier);
 *   - an empty opaque box is left out (the costume's mask still says nothing is solid).
 * Nothing else in the save is touched, and a save that opens as it is never comes here.
 */

/** A save this much over the save limit is not an old picture problem: leave it for the kid to save as a file. */
const MAX_REPAIR_CHARS = MAX_SAVE_BYTES * 4

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)

function emptyBox(opaque: unknown): boolean {
  if (!isRecord(opaque)) return false
  const { left, top, right, bottom } = opaque
  return typeof left === 'number' && typeof right === 'number' && typeof top === 'number' && typeof bottom === 'number' && (left >= right || top >= bottom)
}

const blank = (img: PixelImage) => {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0) return false
  return true
}

/** Half the size: each 2 × 2 block becomes its top-left pixel (kid pixel art keeps its colors). */
function halve(img: PixelImage): PixelImage {
  const width = Math.max(1, Math.floor(img.width / 2))
  const height = Math.max(1, Math.floor(img.height / 2))
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (y * 2 * img.width + x * 2) * 4
      data.set(img.data.subarray(from, from + 4), (y * width + x) * 4)
    }
  }
  return { width, height, data }
}

/** A costume as save JSON (its mask as base64, the way core/save.ts writes it). */
function asJson(costume: Costume): Json {
  const { mask, ...rest } = costume
  return { ...rest, ...(mask ? { mask: { width: mask.width, height: mask.height, data: encodeBase64(mask.data) } } : {}) }
}

/** The costume put right; null to drop it; the same object when nothing needed changing. */
function repairCostume(costume: unknown, isStage: boolean): unknown {
  if (!isRecord(costume)) return costume
  let out: Json = costume
  if (emptyBox(out.opaque)) {
    out = { ...out }
    delete out.opaque
  }
  const asset = out.asset
  if (typeof asset !== 'string' || asset.length <= DESIGN_LIMITS.maxAssetChars) return out
  const name = typeof out.name === 'string' ? out.name : 'costume'
  const img = decodePng(asset)
  const fits = !!img && img.width === out.width && img.height === out.height
  if (isStage && (!fits || blank(img!))) return null
  if (!fits) {
    // A brick's picture that cannot be read: keep the costume (its size and mask), without the picture.
    out = { ...out }
    delete out.asset
    return out
  }
  const center = { x: Number(out.rotationCenterX) || img!.width / 2, y: Number(out.rotationCenterY) || img!.height / 2 }
  const squeezed = costumeFromImage(name, img!, center)
  if ((squeezed.asset?.length ?? 0) <= DESIGN_LIMITS.maxAssetChars) return { ...out, asset: squeezed.asset }
  if (!isStage) {
    out = { ...out }
    delete out.asset
    return out
  }
  let small = img!
  for (let tries = 0; tries < 6; tries++) {
    small = halve(small)
    const shrunk = costumeFromImage(name, small)
    if ((shrunk.asset?.length ?? 0) <= DESIGN_LIMITS.maxAssetChars) return asJson(shrunk)
  }
  return null
}

function repairCostumes(brick: unknown, isStage: boolean): boolean {
  if (!isRecord(brick) || !Array.isArray(brick.costumes)) return false
  let changed = false
  const kept: unknown[] = []
  for (const costume of brick.costumes) {
    const fixed = repairCostume(costume, isStage)
    if (fixed !== costume) changed = true
    if (fixed !== null) kept.push(fixed)
  }
  if (changed) brick.costumes = kept
  return changed
}

/** The save text with its pictures put right, or null when there was nothing to put right (or it is not a save). */
export function repairSaveText(text: string): string | null {
  if (typeof text !== 'string' || text.length > MAX_REPAIR_CHARS || !checkJsonDepth(text, MAX_PARSE_DEPTH)) return null
  let envelope: unknown
  try {
    envelope = JSON.parse(text)
  } catch {
    return null
  }
  const design = isRecord(envelope) ? envelope.design : null
  if (!isRecord(design)) return null
  let changed = repairCostumes(design.stage, true)
  if (Array.isArray(design.bricks)) for (const brick of design.bricks) changed = repairCostumes(brick, false) || changed
  return changed ? JSON.stringify(envelope) : null
}

const newerVersion = (result: ParseResult) =>
  !result.ok && result.problems.some((p) => p.path === 'schemaVersion' && p.message.includes('Unsupported future schema version'))

/**
 * Every way into the game reads a save through here (this computer, the account, a file): the game's own parser, and,
 * when it refuses the save, one more try with the pictures put right. A newer version's save is never changed.
 */
export function parseSaveText(text: string): ParseResult & { repaired?: boolean } {
  const first = parse(upgradeLegacySaveText(text))
  if (first.ok || newerVersion(first)) return first
  const fixed = repairSaveText(text)
  if (fixed === null) return first
  const second = parse(upgradeLegacySaveText(fixed))
  return second.ok ? { ...second, repaired: true } : first
}

/**
 * The text to keep for a project: its own save text when the game will open it again, otherwise the same with its
 * pictures put right; null when neither would open (the caller keeps the earlier save and says so).
 */
export function openableSaveText(text: string): string | null {
  if (parse(text).ok) return text
  const fixed = repairSaveText(text)
  return fixed !== null && parse(fixed).ok ? fixed : null
}
