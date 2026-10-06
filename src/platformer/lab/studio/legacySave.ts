/**
 * Step 7: convert step 6/6b saves. Before step 7 a tiles layer held engine tile characters (G H S L - B Q O U) with built-in
 * rules and no bricks behind them. Now every character must belong to a grid brick, so a save whose tiles use characters
 * no grid brick owns gets the standard grid bricks from `LEGACY_TILE_BRICKS` (with their workspaces), and 'U' cells (a
 * used ? block) are rewritten to 'Q' (a ? block starts fresh on Play, like everything else in a design).
 *
 * This works on the save's JSON text, BEFORE `parse` validates it, because after step 7 validation rejects tile characters
 * that no grid brick owns. Hero code that still uses `platformer_touchingtile` is left exactly as it was (the workspace
 * JSON is not touched, and the compiler keeps loading it).
 */
import { encodeBase64 } from '../core/save'
import { LEGACY_TILE_BRICKS, gridBrickTemplate, type GridBrickKey } from './gridBricks'

interface JsonBrick {
  id?: unknown
  grid?: { char?: unknown }
  [key: string]: unknown
}
interface JsonDesign {
  bricks?: JsonBrick[]
  tiles?: { data?: unknown }
  [key: string]: unknown
}
interface JsonEnvelope {
  design?: JsonDesign
  workspaces?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * Returns the save text with the standard grid bricks added and 'U' cells rewritten, or the same text when there is
 * nothing to convert (already step 7, no tiles, not JSON, or a standard brick cannot be built).
 */
export function upgradeLegacySaveText(text: string): string {
  if (typeof text !== 'string' || !text.includes('"tiles"')) return text
  try {
    const env = JSON.parse(text) as JsonEnvelope
    const design = env?.design
    const data = design?.tiles?.data
    if (!design || !Array.isArray(data) || !Array.isArray(design.bricks)) return text

    const owned = new Set<string>()
    for (const b of design.bricks) if (typeof b?.grid?.char === 'string') owned.add(b.grid.char)
    const used = new Set<string>()
    for (const row of data) if (typeof row === 'string') for (const ch of row) if (ch !== '.') used.add(ch)
    // 'U' only needs the ? block, which 'Q' already stands for.
    const needed = new Set<string>()
    for (const ch of used) {
      const target = ch === 'U' && !owned.has('U') ? 'Q' : ch
      if (!owned.has(target) && LEGACY_TILE_BRICKS[target]) needed.add(target)
    }
    const rewriteU = used.has('U') && !owned.has('U')
    if (needed.size === 0 && !rewriteU) return text

    const taken = new Set(design.bricks.map((b) => String(b?.id)))
    const workspaces = (env.workspaces && typeof env.workspaces === 'object' ? env.workspaces : {}) as Record<string, unknown>
    const keys = [...needed].map((ch) => LEGACY_TILE_BRICKS[ch] as GridBrickKey)
    // Build every template first, so a failure leaves the save untouched rather than half-converted.
    const made = keys.map((key) => ({ key, template: gridBrickTemplate(key) }))
    for (const { key, template } of made) {
      let id = `brick_${key}`
      for (let n = 2; taken.has(id); n++) id = `brick_${key}${n}`
      taken.add(id)
      design.bricks.push({
        ...template.brick,
        id,
        costumes: template.brick.costumes.map((c) => (c.mask?.data instanceof Uint8Array ? { ...c, mask: { width: c.mask.width, height: c.mask.height, data: encodeBase64(c.mask.data) } } : c)),
      } as unknown as JsonBrick)
      workspaces[id] = template.workspace
    }
    env.workspaces = workspaces
    if (rewriteU) design.tiles!.data = data.map((row) => (typeof row === 'string' ? row.replaceAll('U', 'Q') : row))
    return JSON.stringify(env)
  } catch (err) {
    console.warn('Code Lab: could not convert an older save (it is loaded as it is):', err)
    return text
  }
}
