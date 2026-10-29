import { isHatOpcode } from '../../core/editor/definitions'
import { readLabel } from '../code/layers'

/** A brick's top-level scripts (hats) and their one-line labels, read from its saved workspace, in order. */
export function getLabelText(workspace: unknown): Array<{ id: string; label: string }> {
  const ws = typeof workspace === 'string' ? safeParse(workspace) : workspace
  const blocks = (ws as { blocks?: { blocks?: unknown[] } } | null)?.blocks?.blocks
  if (!Array.isArray(blocks)) return []
  return blocks.flatMap((b) => {
    const r = b as { id?: unknown; type?: unknown; data?: unknown }
    return typeof r.id === 'string' && typeof r.type === 'string' && isHatOpcode(r.type) ? [{ id: r.id, label: readLabel(typeof r.data === 'string' ? r.data : '') }] : []
  })
}

function safeParse(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}
