/** Catalog bricks are copied into each level. A remix changes that level's definition, never the catalog. */
import { designKit, type BrickDef } from '../core/contracts'
import { compileWorkspace, isTurnedOff, type Diagnostic } from '../core/editor/compile'
import { createStarterProject, WALKER_SPEED, WALKER_SPEED_BEFORE } from './starter'
import { createRaceStarterProject } from './race/raceProject'
import { HERO_OLD_VARIABLE_NAMES } from './hero/heroBrick'
import type { StudioProject } from './store'

type Original = { brick: BrickDef; workspace: unknown }

/**
 * The built-in bricks of every kit's starter (docs/qa/hackable-modes/R1-SCREENS.md): the Platformer's and Hackable
 * Racing's. Their ids never collide, so one catalog serves both. Each starter is built the first time it is needed.
 */
const STARTERS: ReadonlyArray<() => StudioProject> = [createStarterProject, createRaceStarterProject]
const originals: Array<Map<string, Original> | undefined> = []

function catalogOf(index: number): Map<string, Original> {
  let map = originals[index]
  if (!map) {
    const starter = STARTERS[index]()
    map = originals[index] = new Map(starter.design.bricks.map((brick) => [brick.id, { brick, workspace: starter.workspaces[brick.id] }]))
  }
  return map
}

/** Only catalog ids establish provenance; a custom brick with a similar name or grid character stays custom. */
export function catalogOriginal(brick: BrickDef): Original | undefined {
  const id = brick.remixOf ?? brick.id
  for (let i = 0; i < STARTERS.length; i++) {
    const found = catalogOf(i).get(id)
    if (found) return found
  }
  return undefined
}

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
function workspaceObject(workspace: unknown): unknown {
  if (typeof workspace !== 'string') return workspace
  try { return JSON.parse(workspace) as unknown } catch { return null }
}

/** Stable JSON also handles costume masks without depending on object insertion order. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (ArrayBuffer.isView(v)) return Array.from(v as Uint8Array)
    if (record(v)) return Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]]))
    return v
  })
}

function clone<T>(value: T): T {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value as unknown as Uint8Array) as T
  if (Array.isArray(value)) return value.map(clone) as T
  if (record(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) as T
  return value
}

/** Blockly may reorder top-level blocks and add layout/UI defaults on its first save. Those are not code edits. */
function workspaceShape(workspace: unknown, values = false): unknown {
  const ws = workspaceObject(workspace)
  if (!record(ws)) return null
  const blockArea = ws.blocks
  const roots = Array.isArray(blockArea) ? blockArea : record(blockArea) && Array.isArray(blockArea.blocks) ? blockArea.blocks : []
  const node = (b: unknown): unknown => {
    if (!record(b)) return null
    const inputs = record(b.inputs) ? b.inputs : {}
    const connections = Object.entries(inputs).flatMap(([name, conn]) => {
      if (!record(conn)) return []
      // Blockly can serialize a connected shadow under both keys. It is still the same connection.
      const block = conn.block ?? conn.shadow
      return block ? [[name, node(block)]] : []
    })
    const next = record(b.next) ? b.next.block ?? b.next.shadow : undefined
    const extra = record(b.extraState) ? b.extraState : {}
    // Empty argument arrays/warp=false are serialization defaults, not new procedure structure.
    const extraState = Object.fromEntries(Object.entries(extra).filter(([key, val]) => !(key === 'warp' && val === false) && !(Array.isArray(val) && val.length === 0)))
    const fields = values && record(b.fields) ? Object.fromEntries(Object.entries(b.fields).filter(([key]) => key !== 'LABEL').map(([key, val]) => [key, String(record(val) ? val.id ?? val.name ?? '' : val)])) : undefined
    // A script switched off is a change from the original (Back to the original undoes it), but not a remix.
    const off = values && isTurnedOff(b) ? { off: true } : {}
    return { id: b.id, type: b.type, inputs: Object.fromEntries(connections), ...(next ? { next: node(next) } : {}), ...(Object.keys(extraState).length ? { extraState } : {}), ...(fields && Object.keys(fields).length ? { fields } : {}), ...off }
  }
  return roots.map(node).sort((a, b) => stable(a).localeCompare(stable(b)))
}

/** A short fingerprint of a workspace's blocks, values included (FNV-1a over the stable shape), to recognise a known version. */
export function workspaceFingerprint(workspace: unknown): string {
  const text = stable(workspaceShape(workspace, true))
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function isStructuralWorkspaceChange(before: unknown, after: unknown): boolean {
  return stable(workspaceShape(before)) !== stable(workspaceShape(after))
}

// These menu sockets identify another brick by its displayed name. Never rewrite arbitrary text/broadcasts.
const TARGET_FIELDS = new Set(['TO', 'TOWARDS', 'TOUCHINGOBJECTMENU', 'DISTANCETOMENU', 'OBJECT', 'CLONE_OPTION', 'BRICK'])

function rewriteReferences(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => rewriteReferences(entry, from, to))
  if (!record(value) || ArrayBuffer.isView(value)) return value
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(value)) {
    if (key === 'fields' && record(val)) {
      result[key] = Object.fromEntries(Object.entries(val).map(([field, fieldValue]) => {
        if (!TARGET_FIELDS.has(field)) return [field, fieldValue]
        if (fieldValue === from) return [field, to]
        if (record(fieldValue)) return [field, Object.fromEntries(Object.entries(fieldValue).map(([k, v]) => [k, (k === 'id' || k === 'name') && v === from ? to : v]))]
        return [field, fieldValue]
      }))
    } else if (key === 'inputs' && record(val)) {
      result[key] = Object.fromEntries(Object.entries(val).map(([input, expression]) => {
        let updated = expression
        if (TARGET_FIELDS.has(input) && record(expression)) {
          if (expression.kind === 'lit' && expression.value === from) updated = { ...expression, value: to }
          else {
            // Workspace menu sockets may use text literals instead of a menu reporter.
            updated = Object.fromEntries(Object.entries(expression).map(([connection, child]) => [connection, record(child) && child.type === 'text' && record(child.fields) && child.fields.TEXT === from ? { ...child, fields: { ...child.fields, TEXT: to } } : child]))
          }
        }
        return [input, rewriteReferences(updated, from, to)]
      }))
    } else result[key] = rewriteReferences(val, from, to)
  }
  return result
}

/** Keep sensing, bump, clone and motion menus pointing at the same brick after a display-name change. */
function renameReferences(project: StudioProject, from: string, to: string): StudioProject {
  if (from === to) return project
  const programOf = (brick: BrickDef): BrickDef => ({ ...brick, program: rewriteReferences(brick.program, from, to) as BrickDef['program'] })
  return {
    design: { ...project.design, stage: programOf(project.design.stage), bricks: project.design.bricks.map(programOf) },
    workspaces: Object.fromEntries(Object.entries(project.workspaces).map(([id, workspace]) => [id, rewriteReferences(workspaceObject(workspace), from, to)])),
  }
}

function replaceBrick(project: StudioProject, brick: BrickDef, workspace: unknown): StudioProject {
  return {
    design: brick.isStage ? { ...project.design, stage: brick } : { ...project.design, bricks: project.design.bricks.map((b) => b.id === brick.id ? brick : b) },
    workspaces: { ...project.workspaces, [brick.id]: workspace },
  }
}

function retainOwnValues(project: StudioProject, brick: BrickDef): StudioProject {
  const sliders = new Set(brick.program.variables.filter((v) => v.showInBuild).map((v) => v.id))
  let changed = false
  const copies = project.design.copies.map((copy) => {
    if (copy.brickId !== brick.id || !copy.knobs) return copy
    const own = Object.entries(copy.knobs).filter(([id]) => sliders.has(id))
    if (own.length === Object.keys(copy.knobs).length) return copy
    changed = true
    return { ...copy, knobs: Object.fromEntries(own) }
  })
  return changed ? { ...project, design: { ...project.design, copies } } : project
}

export function compileBrickEdit(project: StudioProject, brickId: string, workspace: unknown): { project: StudioProject; diagnostics: Diagnostic[]; remixed?: string } {
  const brick = project.design.stage.id === brickId ? project.design.stage : project.design.bricks.find((b) => b.id === brickId)
  if (!brick) return { project, diagnostics: [] }
  // An editor already mounted when a brick remixes can still hold its previous menu labels until its next load.
  // Normalize those references on every save, including saves of other bricks and cleanup/debounced saves.
  workspace = workspaceObject(workspace)
  const referenceText = JSON.stringify(workspace) ?? ''
  for (const target of project.design.bricks) {
    const original = catalogOriginal(target)
    if (!original) continue
    for (const alias of [original.brick.name, `My ${original.brick.name}`]) {
      if (alias !== target.name && referenceText.includes(JSON.stringify(alias)) && !project.design.bricks.some((b) => b.id !== target.id && b.name === alias)) workspace = rewriteReferences(workspace, alias, target.name)
    }
  }
  const before = workspaceObject(project.workspaces[brickId])
  const declarations = (value: unknown): Set<string> => new Set(record(value) && Array.isArray(value.variables) ? value.variables.flatMap((v: unknown) => record(v) && typeof v.id === 'string' ? [v.id] : []) : [])
  const previousDeclarations = declarations(before)
  const currentDeclarations = declarations(workspace)
  // The compiler's context supplies defaults, not an undeletable second variable list. Preserve legacy declarations
  // absent from both workspaces, while respecting deletions from a real Blockly variable map (including its last item).
  const retained = (id: string) => !previousDeclarations.has(id) || currentDeclarations.has(id)
  const result = compileWorkspace(workspace, { variables: brick.program.variables.filter((v) => retained(v.id)), lists: brick.program.lists.filter((v) => retained(v.id)) })
  const original = catalogOriginal(brick)
  const remix = original && !brick.remixOf && project.workspaces[brickId] !== undefined && isStructuralWorkspaceChange(project.workspaces[brickId], workspace)
  const edited: BrickDef = { ...brick, program: result.program, ...(remix ? { name: `My ${original.brick.name}`, remixOf: original.brick.id } : {}) }
  let next = retainOwnValues(replaceBrick(project, edited, workspace), edited)
  if (remix) next = renameReferences(next, brick.name, edited.name)
  return { project: next, diagnostics: result.diagnostics, ...(remix ? { remixed: edited.name } : {}) }
}

/** Adapt a fresh catalog brick's menus to any other catalog bricks already remixed in this level. */
function originalInLevel(project: StudioProject, brick: BrickDef, original: Original): Original {
  let result = { brick: { ...original.brick, id: brick.id }, workspace: original.workspace }
  for (const other of project.design.bricks) {
    if (other.id === brick.id) continue
    const baseline = catalogOriginal(other)
    if (baseline && baseline.brick.name !== other.name) result = rewriteReferences(result, baseline.brick.name, other.name) as Original
  }
  return result
}

const resetStatus = new WeakMap<StudioProject, Map<string, boolean>>()

export function canResetBrick(project: StudioProject, brickId: string): boolean {
  let statuses = resetStatus.get(project)
  if (!statuses) resetStatus.set(project, statuses = new Map())
  const cached = statuses.get(brickId)
  if (cached !== undefined) return cached
  const brick = project.design.bricks.find((b) => b.id === brickId)
  const original = brick && catalogOriginal(brick)
  if (!brick || !original) return false
  if (brick.remixOf) return true
  const baseline = originalInLevel(project, brick, original)
  const changed = stable(brick) !== stable(baseline.brick) || stable(workspaceShape(project.workspaces[brickId], true)) !== stable(workspaceShape(baseline.workspace, true))
  statuses.set(brickId, changed)
  return changed
}

export function restoreBrickOriginal(project: StudioProject, brickId: string): StudioProject {
  const brick = project.design.bricks.find((b) => b.id === brickId)
  const original = brick && catalogOriginal(brick)
  if (!brick || !original) return project
  const baseline = originalInLevel(project, brick, original)
  // Clone catalog arrays and masks as well: consumers must never mutate the cached original through the reset result.
  const restored = clone(baseline)
  const next = retainOwnValues(replaceBrick(project, restored.brick, restored.workspace), restored.brick)
  return renameReferences(next, brick.name, restored.brick.name)
}

/**
 * Earlier built-in Heroes' blocks, as generated and after a trip through the editor: the two My Blocks versions, and the
 * first feel-scripts version (moved by the Platformer, before "move and collide" was open). Only these are upgraded:
 * older saves predate "My Hero", so a Hero with other blocks may hold a kid's own edits. '88bce6fb' is the Hero just
 * before pits (2026-11-03).
 */
export const EARLIER_HERO_FINGERPRINTS: readonly string[] = ['e9c867ad', '2317e33b', '8fd9195b', 'be2651d7', 'a8bbd0b8', '6cf36812', 'f9ce2b65', '88bce6fb']

let currentHeroFingerprint: string | undefined

/**
 * Built-in bricks other than the Hero, by catalog id: the fingerprints of their blocks as earlier versions made them
 * (as generated; Blockly's own save keeps the same fingerprint). The first entry of each is what production had before
 * parity bucket A (2026-11-03).
 */
export const EARLIER_BUILT_IN_FINGERPRINTS: Readonly<Record<string, readonly string[]>> = {
  // Before W A S D.
  brick_car: ['f3157bf8'],
}

/**
 * What a save opens with: every untouched built-in brick moved to today's original (the Hero by `upgradeUntouchedHero`,
 * the rest here). A built-in brick whose blocks are exactly an earlier original, with its variables still named as
 * that original named them, gets today's blocks; the values the kid set on its sliders, its costumes, sounds and name
 * stay. A brick with any other blocks, a renamed variable, or a remix is the kid's and is left as it is.
 */
export function upgradeUntouchedBricks(project: StudioProject): StudioProject {
  return upgradeUntouchedHero(upgradeBuiltIns(project))
}

/**
 * Slider defaults a built-in brick changed. A brick with today's blocks whose slider still holds the old default gets the
 * new one; a value the kid moved, and a copy's own value ("Just this one"), stay.
 */
export const BUILT_IN_DEFAULT_CHANGES: Readonly<Record<string, ReadonlyArray<{ variable: string; from: number; to: number }>>> = {
  // Parity bucket A (2026-11-03): the classic Walker's 30 steps a second.
  brick_walker: [{ variable: 'brick_walker_speed', from: WALKER_SPEED_BEFORE, to: WALKER_SPEED }],
}

function newDefaults(project: StudioProject): StudioProject {
  let next = project
  for (const brick of project.design.bricks) {
    const changes = !brick.remixOf ? BUILT_IN_DEFAULT_CHANGES[brick.id] : undefined
    const original = changes && catalogOriginal(brick)
    if (!changes || !original || workspaceFingerprint(project.workspaces[brick.id]) !== workspaceFingerprint(original.workspace)) continue
    const moved = (v: BrickDef['program']['variables'][number]) => changes.find((c) => c.variable === v.id && v.value === c.from)
    if (!brick.program.variables.some(moved)) continue
    const variables = brick.program.variables.map((v) => (moved(v) ? { ...v, value: moved(v)!.to } : v))
    const updated: BrickDef = { ...brick, program: { ...brick.program, variables } }
    next = { ...next, design: { ...next.design, bricks: next.design.bricks.map((b) => (b.id === brick.id ? updated : b)) } }
  }
  return next
}

function upgradeBuiltIns(project: StudioProject): StudioProject {
  return newDefaults(upgradeBuiltInBlocks(project))
}

function upgradeBuiltInBlocks(project: StudioProject): StudioProject {
  let next = project
  for (const brick of project.design.bricks) {
    const earlier = !brick.remixOf ? EARLIER_BUILT_IN_FINGERPRINTS[brick.id] : undefined
    if (!earlier || !earlier.includes(workspaceFingerprint(project.workspaces[brick.id]))) continue
    const original = catalogOriginal(brick)
    if (!original) continue
    const fresh = clone(original)
    const freshNames = new Map(fresh.brick.program.variables.map((v) => [v.id, v.name]))
    if (brick.program.variables.some((v) => freshNames.has(v.id) && freshNames.get(v.id) !== v.name)) continue
    const tuned = new Map(brick.program.variables.map((v) => [v.id, v.value]))
    const variables = fresh.brick.program.variables.map((v) => (tuned.has(v.id) ? { ...v, value: tuned.get(v.id)! } : v))
    const upgraded: BrickDef = { ...brick, program: { ...fresh.brick.program, variables } }
    next = {
      design: { ...next.design, bricks: next.design.bricks.map((b) => (b.id === brick.id ? upgraded : b)) },
      workspaces: { ...next.workspaces, [brick.id]: fresh.workspace },
    }
  }
  return next
}

/**
 * Saves made before the Hero was rebuilt still hold the old Hero (My Blocks). A built-in Hero whose blocks are exactly
 * an earlier original moves to the current original. Slider values the kid tuned are kept for every variable that
 * still exists, and so are its costumes and sounds.
 *
 * A built-in Hero whose blocks are exactly the current original but whose variables still have their old engine-word
 * names ("p speed") gets the plain names; nothing else about it changes. Blocks point at variables by id, so no block
 * loses its variable either way. A Hero with other blocks keeps the names it has (`HERO_OLD_VARIABLE_NAMES`).
 */
export function upgradeUntouchedHero(project: StudioProject): StudioProject {
  return withPits(upgradeHeroBlocks(project))
}

/**
 * A Platformer whose Hero is the built-in one that knows about pits gets an open floor (LevelDesign.pits). A Hero a kid
 * changed may not have the "Fall into a pit" script, so its level keeps the solid floor it was built on; so does a
 * level that already says either way.
 */
function withPits(project: StudioProject): StudioProject {
  const design = project.design
  if (design.pits !== undefined || designKit(design) !== 'platformer') return project
  const hero = design.bricks.find((b) => b.id === 'brick_hero')
  const original = hero && !hero.remixOf ? catalogOriginal(hero) : undefined
  if (!hero || !original) return project
  currentHeroFingerprint ??= workspaceFingerprint(original.workspace)
  if (workspaceFingerprint(project.workspaces[hero.id]) !== currentHeroFingerprint) return project
  return { ...project, design: { ...design, pits: true } }
}

function upgradeHeroBlocks(project: StudioProject): StudioProject {
  const hero = project.design.bricks.find((b) => b.id === 'brick_hero')
  const original = hero && !hero.remixOf ? catalogOriginal(hero) : undefined
  if (!hero || !original) return project
  const fingerprint = workspaceFingerprint(project.workspaces[hero.id])
  currentHeroFingerprint ??= workspaceFingerprint(original.workspace)
  if (fingerprint === currentHeroFingerprint) return plainHeroNames(project, hero)
  if (!EARLIER_HERO_FINGERPRINTS.includes(fingerprint)) return project
  // A kid who renamed one of its variables has made the Hero their own, like changing a block.
  if (renamedByKid(project, hero)) return project
  const tuned = new Map(hero.program.variables.map((v) => [v.id, v.value]))
  const fresh = clone(original)
  // A brick that reads a Hero variable by its old name ("p speed of Hero") keeps it working: the Hero keeps old names.
  const keepOld = readsByName(project, hero.program.variables.filter((v) => HERO_OLD_VARIABLE_NAMES[v.id] === v.name).map((v) => v.name))
  const named = <T extends { id: string; name: string }>(v: T): T => (keepOld && HERO_OLD_VARIABLE_NAMES[v.id] ? { ...v, name: HERO_OLD_VARIABLE_NAMES[v.id] } : v)
  const variables = fresh.brick.program.variables.map((v) => named(tuned.has(v.id) ? { ...v, value: tuned.get(v.id)! } : v))
  // Today's blocks may play a sound the old Hero didn't have ("Ouch"): add it, keeping every sound the kid added.
  const sounds = [...hero.sounds, ...fresh.brick.sounds.filter((s) => !hero.sounds.some((h) => h.name === s.name))]
  const upgraded: BrickDef = { ...hero, sounds, program: { ...fresh.brick.program, variables } }
  const workspace = keepOld ? renameWorkspaceVariables(fresh.workspace, named) : fresh.workspace
  return {
    design: { ...project.design, bricks: project.design.bricks.map((b) => (b.id === hero.id ? upgraded : b)) },
    workspaces: { ...project.workspaces, [hero.id]: workspace },
  }
}

/** Whether a variable of this Hero has a name that is neither today's nor its name before the plain words. */
function renamedByKid(project: StudioProject, hero: BrickDef): boolean {
  const fresh = new Map(catalogOriginal(hero)!.brick.program.variables.map((v) => [v.id, v.name]))
  const workspace = workspaceObject(project.workspaces[hero.id])
  const declared = record(workspace) && Array.isArray(workspace.variables) ? workspace.variables.filter(record) : []
  const own = (id: unknown, name: unknown) => typeof id === 'string' && fresh.has(id) && name !== fresh.get(id) && name !== HERO_OLD_VARIABLE_NAMES[id]
  return hero.program.variables.some((v) => own(v.id, v.name)) || declared.some((v) => own(v.id, v.name))
}

/**
 * The current Hero saved before its variables had plain names: rename them, only when every one of them still has its
 * old name in both the brick and its blocks (a kid who renamed one has made the names their own) and no brick reads one
 * by name. Values, blocks and everything else stay as they are.
 */
function plainHeroNames(project: StudioProject, hero: BrickDef): StudioProject {
  const fresh = new Map(catalogOriginal(hero)!.brick.program.variables.map((v) => [v.id, v.name]))
  const workspace = workspaceObject(project.workspaces[hero.id])
  const declared = record(workspace) && Array.isArray(workspace.variables) ? workspace.variables.filter(record) : []
  const old = Object.entries(HERO_OLD_VARIABLE_NAMES)
  const holdsOld = (list: ReadonlyArray<Record<string, unknown>>) => old.every(([id, name]) => list.find((v) => v.id === id)?.name === name)
  if (!holdsOld(hero.program.variables as unknown as Array<Record<string, unknown>>) || !holdsOld(declared)) return project
  if (readsByName(project, old.map(([, name]) => name))) return project
  const named = <T extends { id: string; name: string }>(v: T): T => (HERO_OLD_VARIABLE_NAMES[v.id] ? { ...v, name: fresh.get(v.id) ?? v.name } : v)
  const renamed: BrickDef = { ...hero, program: { ...hero.program, variables: hero.program.variables.map(named) } }
  return {
    design: { ...project.design, bricks: project.design.bricks.map((b) => (b.id === hero.id ? renamed : b)) },
    workspaces: { ...project.workspaces, [hero.id]: renameWorkspaceVariables(workspace, named) },
  }
}

function renameWorkspaceVariables(workspace: unknown, named: <T extends { id: string; name: string }>(v: T) => T): unknown {
  if (!record(workspace) || !Array.isArray(workspace.variables)) return workspace
  return { ...workspace, variables: workspace.variables.map((v: unknown) => (record(v) && typeof v.id === 'string' && typeof v.name === 'string' ? named(v as { id: string; name: string }) : v)) }
}

/** Whether any brick's "[property] of [brick]" block names one of these variables (it finds the variable by its name). */
function readsByName(project: StudioProject, names: string[]): boolean {
  if (names.length === 0) return false
  const wanted = new Set(names)
  const found = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(found)
    if (!record(value) || ArrayBuffer.isView(value)) return false
    return Object.entries(value).some(([key, v]) => {
      if (key === 'PROPERTY') return (typeof v === 'string' && wanted.has(v)) || (record(v) && (wanted.has(String(v.name)) || wanted.has(String(v.id))))
      return found(v)
    })
  }
  return found([project.design.stage, ...project.design.bricks].map((b) => b.program)) || found(Object.values(project.workspaces).map(workspaceObject))
}
