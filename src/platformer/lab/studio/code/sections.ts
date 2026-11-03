/**
 * Brick sections (pure, no Blockly): a built-in brick's long run of engine scripts, folded into one entry on its code's
 * top view ("How I move · 23 scripts") and opened like a My Block. View only: nothing is moved, added or saved.
 *
 * A script belongs to a section by its hat and its one-line label (layers.ts), so a script a kid writes (no label, or a
 * label of their own) always stays on the top view, and an old save whose labels differ simply shows as it always did.
 */
import { HERO_BRICK_ID, HERO_MOVEMENT_HATS, heroMovementLabels } from '../hero/heroBrick'

export interface ScriptSection {
  readonly id: string
  /** Kid words, shown on the entry and in the breadcrumb. */
  readonly title: string
  /** Hats a folded script may have. */
  readonly hats: readonly string[]
  /** Labels a folded script may have. */
  labels(): ReadonlySet<string>
}

/** Sections by the catalog brick they belong to (a remix keeps its original's). The Racing Car can add its own here. */
const BRICK_SECTIONS: Readonly<Record<string, readonly ScriptSection[]>> = {
  [HERO_BRICK_ID]: [{ id: 'how-i-move', title: 'How I move', hats: HERO_MOVEMENT_HATS, labels: heroMovementLabels }],
}

export function sectionsForBrick(brick: { id: string; remixOf?: string } | null | undefined): readonly ScriptSection[] {
  if (!brick) return []
  return BRICK_SECTIONS[brick.remixOf ?? brick.id] ?? []
}

/** The section a top-level script folds into, or null for a top-view script. */
export function sectionOfScript(hat: string, label: string, sections: readonly ScriptSection[]): string | null {
  if (!label) return null
  return sections.find((s) => s.hats.includes(hat) && s.labels().has(label))?.id ?? null
}

export interface SectionEntry {
  id: string
  title: string
  count: number
}

/** One entry per section that holds at least one script, in the brick's own order. */
export function sectionEntries(sections: readonly ScriptSection[], sectionIds: ReadonlyArray<string | null>): SectionEntry[] {
  return sections
    .map((s) => ({ id: s.id, title: s.title, count: sectionIds.filter((id) => id === s.id).length }))
    .filter((e) => e.count > 0)
}

export function sectionTitle(sections: readonly ScriptSection[], id: string): string {
  return sections.find((s) => s.id === id)?.title ?? id
}

/** "1 script", "23 scripts". */
export function scriptCount(n: number): string {
  return `${n} ${n === 1 ? 'script' : 'scripts'}`
}
