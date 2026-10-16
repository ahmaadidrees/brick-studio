/** Catalog bricks are copied into each level. A remix changes that level's definition, never the catalog. */
import type { BrickDef } from '../core/contracts'
import { compileWorkspace, type Diagnostic } from '../core/editor/compile'
import { createStarterProject } from './starter'
import type { StudioProject } from './store'

type Original = { brick: BrickDef; workspace: unknown }
let originals: Map<string, Original> | undefined

function catalog(): Map<string, Original> {
  if (!originals) {
    const starter = createStarterProject()
    originals = new Map(starter.design.bricks.map((brick) => [brick.id, { brick, workspace: starter.workspaces[brick.id] }]))
  }
  return originals
}

/** Only catalog ids establish provenance; a custom brick with a similar name or grid character stays custom. */
export function catalogOriginal(brick: BrickDef): Original | undefined {
  return catalog().get(brick.remixOf ?? brick.id)
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
    return { id: b.id, type: b.type, inputs: Object.fromEntries(connections), ...(next ? { next: node(next) } : {}), ...(Object.keys(extraState).length ? { extraState } : {}), ...(fields && Object.keys(fields).length ? { fields } : {}) }
  }
  return roots.map(node).sort((a, b) => stable(a).localeCompare(stable(b)))
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
