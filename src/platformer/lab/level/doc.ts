import type { Theme } from '@brick-studio/platformer-core/engine/level'
import { decodeRuns, encodeRuns } from '@brick-studio/platformer-core/engine/level'
import { TILE_ID_COUNT } from '@brick-studio/platformer-core/engine/tiles'
import { BUILTIN_BRICKS, PLAYER_ID, blankProgram, builtinBrick, type BrickDef } from '../bricks/builtins'
import { scriptsJson, type BlockJson } from '../bricks/dsl'
import { carProgram, doubleJumpScripts, ledgeWalkerProgram, rocketProgram, throwScripts, type RecipeId } from '../bricks/recipes'
import { COSTUME_LABELS } from '../program/catalog'
import type { Costume } from '../program/types'
import { topBlocks } from '../program/workspaceJson'
import type { LabLevel, PlacedThing } from '../sim/world'
import { starterLevel } from './starter'

/*
 * A lab: its level and the bricks it changed or made. Built-in bricks live in code; editing one here makes this
 * lab's own copy (same id, origin "copy": every thing of that brick in the level runs the copy, and "Back to the
 * original" drops it). "Save as a new brick" turns a brick's code into a brick of its own with a picked name.
 * Everything is plain data and saved in this browser.
 */

export interface LabLevelJson {
  width: number
  height: number
  theme: Theme
  tiles: string
  start: { x: number; y: number }
  things: PlacedThing[]
}

export interface LabDoc {
  v: 1
  level: LabLevelJson
  bricks: Record<string, BrickDef>
  nextBrick: number
  nextThing: number
}

export const levelToJson = (l: LabLevel): LabLevelJson => ({ width: l.width, height: l.height, theme: l.theme, tiles: encodeRuns(l.tiles), start: { ...l.start }, things: l.things.map((t) => ({ ...t })) })

export const levelFromJson = (j: LabLevelJson): LabLevel => ({
  width: j.width,
  height: j.height,
  theme: j.theme,
  tiles: decodeRuns(j.tiles, j.width * j.height, TILE_ID_COUNT),
  start: { ...j.start },
  things: j.things.map((t) => ({ ...t })),
})

export function starterDoc(): LabDoc {
  const level = starterLevel()
  return { v: 1, level: levelToJson(level), bricks: {}, nextBrick: 1, nextThing: level.things.reduce((m, t) => Math.max(m, t.id), 0) + 1 }
}

export const brickDef = (doc: LabDoc, id: string): BrickDef | undefined => doc.bricks[id] ?? builtinBrick(id)

/** Every brick the lab knows: built-ins (or this lab's copies of them), then the lab's own, in the order made. */
export function allBricks(doc: LabDoc): BrickDef[] {
  const out = BUILTIN_BRICKS.map((b) => doc.bricks[b.id] ?? b)
  for (const b of Object.values(doc.bricks)) if (b.origin === 'mine') out.push(b)
  return out
}

/** This brick and the bricks it was made from, nearest first. */
export function lineage(doc: LabDoc, id: string): string[] {
  const out: string[] = []
  let cur: string | null = id
  while (cur && !out.includes(cur) && out.length < 8) {
    out.push(cur)
    cur = brickDef(doc, cur)?.basedOn ?? null
  }
  return out
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Set a brick's code. A built-in becomes this lab's copy on its first change. */
export function setProgram(doc: LabDoc, id: string, program: unknown): LabDoc {
  const current = brickDef(doc, id)
  if (!current) return doc
  const next: BrickDef = current.origin === 'builtin' ? { ...current, origin: 'copy', program: clone(program) } : { ...current, program: clone(program) }
  return { ...doc, bricks: { ...doc.bricks, [id]: next } }
}

/** Drop this lab's copy of a built-in: the original code comes back. */
export function backToOriginal(doc: LabDoc, id: string): LabDoc {
  if (doc.bricks[id]?.origin !== 'copy') return doc
  const bricks = { ...doc.bricks }
  delete bricks[id]
  return { ...doc, bricks }
}

/** Adjectives for naming a brick (picked, never typed). */
export const NAME_WORDS = ['Smart', 'Speedy', 'Sneaky', 'Bouncy', 'Jumpy', 'Super', 'Mega', 'Tiny', 'Giant', 'Turbo', 'Happy', 'Grumpy', 'Sleepy', 'Silly', 'Brave', 'Lucky', 'Zippy', 'Mighty'] as const
export type NameWord = (typeof NAME_WORDS)[number]

/** The noun a brick's name ends with: its base brick's name ("Walker"), or its costume's for a new one. */
export function baseNoun(doc: LabDoc, id: string): string {
  const chain = lineage(doc, id)
  const root = brickDef(doc, chain[chain.length - 1])
  const words = (root?.name ?? COSTUME_LABELS[brickDef(doc, id)?.costume ?? 'crate']).split(' ')
  const noun = words[words.length - 1] || 'Brick'
  return noun[0].toUpperCase() + noun.slice(1)
}

/**
 * Save a brick's code as a brick of its own. The things in the level that ran it now run the new brick, and a
 * changed built-in goes back to its original code (the new brick keeps the changes).
 */
export function saveAsNewBrick(doc: LabDoc, id: string, word: NameWord): { doc: LabDoc; id: string } {
  const def = brickDef(doc, id)
  if (!def || id === PLAYER_ID) return { doc, id }
  const newId = `my-${doc.nextBrick}`
  const name = `${word} ${baseNoun(doc, id)}`
  const made: BrickDef = { id: newId, name, costume: def.costume, basedOn: id, origin: 'mine', program: clone(def.program), blurb: `Made from ${def.name}.` }
  const bricks = { ...doc.bricks, [newId]: made }
  if (bricks[id]?.origin === 'copy') delete bricks[id]
  const things = doc.level.things.map((t) => (t.brick === id ? { ...t, brick: newId } : t))
  return { doc: { ...doc, bricks, nextBrick: doc.nextBrick + 1, level: { ...doc.level, things } }, id: newId }
}

/** A brand-new brick: a costume, a picked name and an empty "when I appear". */
export function newBrick(doc: LabDoc, costume: Costume, word: NameWord | null): { doc: LabDoc; id: string } {
  const newId = `my-${doc.nextBrick}`
  const noun = COSTUME_LABELS[costume].replace(/^\? /, '').split(' ').map((s) => s[0].toUpperCase() + s.slice(1)).join(' ')
  const made: BrickDef = { id: newId, name: word ? `${word} ${noun}` : noun, costume, basedOn: null, origin: 'mine', program: blankProgram(newId), blurb: 'Made by you.' }
  return { doc: { ...doc, bricks: { ...doc.bricks, [newId]: made }, nextBrick: doc.nextBrick + 1 }, id: newId }
}

// ---------------------------------------------------------------------------------------------------------------
// The level

export function placeThing(doc: LabDoc, brick: string, x: number, y: number, dir: 1 | -1): { doc: LabDoc; id: number } {
  const id = doc.nextThing
  const things = [...doc.level.things, { id, brick, x, y, dir }]
  return { doc: { ...doc, nextThing: id + 1, level: { ...doc.level, things } }, id }
}

export function moveThing(doc: LabDoc, id: number, x: number, y: number): LabDoc {
  return { ...doc, level: { ...doc.level, things: doc.level.things.map((t) => (t.id === id ? { ...t, x, y } : t)) } }
}

export function removeThing(doc: LabDoc, id: number): LabDoc {
  return { ...doc, level: { ...doc.level, things: doc.level.things.filter((t) => t.id !== id) } }
}

export function setTiles(doc: LabDoc, cells: readonly { x: number; y: number; t: number }[]): LabDoc {
  const level = levelFromJson(doc.level)
  let changed = false
  for (const { x, y, t } of cells) {
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue
    const i = y * level.width + x
    if (level.tiles[i] === t) continue
    level.tiles[i] = t
    changed = true
  }
  return changed ? { ...doc, level: { ...doc.level, tiles: encodeRuns(level.tiles) } } : doc
}

export function setStart(doc: LabDoc, x: number, y: number): LabDoc {
  return { ...doc, level: { ...doc.level, start: { x, y } } }
}

/** How many things of each brick are in the level, in first-seen order. */
export function brickCounts(doc: LabDoc): [string, number][] {
  const counts = new Map<string, number>()
  for (const t of doc.level.things) counts.set(t.brick, (counts.get(t.brick) ?? 0) + 1)
  return [...counts]
}

// ---------------------------------------------------------------------------------------------------------------
// Recipes

function withScripts(program: unknown, prefix: string, scripts: ReturnType<typeof doubleJumpScripts>): unknown {
  const current = clone(program) as { blocks?: { languageVersion?: number; blocks?: BlockJson[] } }
  const blocks = (current.blocks?.blocks ?? []) as BlockJson[]
  // Already there (opened before): leave it be.
  if (JSON.stringify(blocks).includes(`"${prefix}-1"`)) return current
  const top = topBlocks(current)
  const bottom = top.reduce((m, b) => Math.max(m, typeof b.y === 'number' ? b.y : 0), 0)
  const added = scriptsJson(prefix, top.length ? bottom + 260 : 0, ...scripts)
  return { ...current, blocks: { languageVersion: 0, blocks: [...blocks, ...added] } }
}

export interface RecipeResult {
  doc: LabDoc
  /** The brick whose code to open. */
  open: string
  /** A thing to place next to the player (in the running world too). */
  place?: string
}

/** Put a recipe's code where it belongs. Vehicles become bricks of the lab's own, placed next to you. */
export function applyRecipe(doc: LabDoc, recipe: RecipeId): RecipeResult {
  switch (recipe) {
    case 'double-jump':
      return { doc: setProgram(doc, PLAYER_ID, withScripts(brickDef(doc, PLAYER_ID)!.program, 'dj', doubleJumpScripts())), open: PLAYER_ID }
    case 'throw':
      return { doc: setProgram(doc, PLAYER_ID, withScripts(brickDef(doc, PLAYER_ID)!.program, 'throw', throwScripts())), open: PLAYER_ID }
    case 'ledge-walker':
      return { doc: setProgram(doc, 'walker', ledgeWalkerProgram()), open: 'walker' }
    case 'car':
    case 'rocket': {
      const id = recipe
      if (doc.bricks[id]) return { doc, open: id, place: id }
      const made: BrickDef = {
        id,
        name: recipe === 'car' ? 'Car' : 'Rocket',
        costume: recipe,
        basedOn: null,
        origin: 'mine',
        program: recipe === 'car' ? carProgram() : rocketProgram(),
        blurb: recipe === 'car' ? 'Get in with ↑, drive with ← →.' : 'Get in with ↑, fly with space.',
      }
      return { doc: { ...doc, bricks: { ...doc.bricks, [id]: made } }, open: id, place: id }
    }
  }
}
