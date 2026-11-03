/**
 * What opening a project tells the kid about things in it the game could not use: blocks this version does not have
 * (they stay in the project and do nothing, core/editor/compile.ts says so on each block) and pictures or sounds that
 * were put right as it opened (persist/repairSave.ts). The project itself opens exactly as before.
 */
import type { Expr, Stmt } from '../../core/contracts'
import { isRemovedBlockType } from '../../core/editor/compile'
import { isKnownBlockType } from '../../core/editor/knownBlocks'
import type { StudioProject } from '../store'
import { setStorageNotice } from './notice'
import type { Replaced } from './repairSave'

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const unknownType = (type: unknown) => typeof type === 'string' && !isKnownBlockType(type) && !isRemovedBlockType(type)

/** Blocks in a Blockly workspace save whose type this version does not have. */
function unknownInWorkspace(workspace: unknown, found: Set<string>): void {
  let ws = workspace
  if (typeof ws === 'string') {
    try { ws = JSON.parse(ws) } catch { return }
  }
  if (!isRecord(ws)) return
  const top = isRecord(ws.blocks) ? ws.blocks.blocks : ws.blocks
  const walk = (block: unknown, depth: number): void => {
    if (!isRecord(block) || depth > 200) return
    if (unknownType(block.type)) found.add(typeof block.id === 'string' ? block.id : `${String(block.type)}:${found.size}`)
    const conns = [...(isRecord(block.inputs) ? Object.values(block.inputs) : []), block.next]
    for (const conn of conns) {
      if (!isRecord(conn)) continue
      walk(conn.block, depth + 1)
      walk(conn.shadow, depth + 1)
    }
  }
  if (Array.isArray(top)) for (const block of top) walk(block, 0)
}

/** Compiled blocks (what Play runs) whose opcode this version does not have. */
function unknownInProgram(stmts: Stmt[] | undefined, found: Set<string>, key: string): void {
  const expr = (e: Expr | undefined): void => {
    if (!e || e.kind !== 'block') return
    if (unknownType(e.opcode)) found.add(e.id ?? `${key}:${e.opcode}:${found.size}`)
    Object.values(e.inputs ?? {}).forEach(expr)
  }
  const stmt = (s: Stmt): void => {
    if (unknownType(s.opcode)) found.add(s.id ?? `${key}:${s.opcode}:${found.size}`)
    Object.values(s.inputs ?? {}).forEach(expr)
    s.branches?.forEach((branch) => branch.forEach(stmt))
  }
  stmts?.forEach(stmt)
}

/** How many blocks in the project this version does not have (each block once, in its code or in what Play runs). */
export function unknownBlockCount(project: StudioProject): number {
  const found = new Set<string>()
  for (const brick of [project.design.stage, ...project.design.bricks]) {
    unknownInWorkspace(project.workspaces[brick.id], found)
    for (const script of brick.program.scripts) unknownInProgram(script.body, found, brick.id)
    for (const proc of brick.program.procedures) unknownInProgram(proc.body, found, brick.id)
  }
  return found.size
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : many.replace('#', n.toLocaleString('en-US')))

/** What to tell the kid about a project just opened, or null when everything in it could be used. */
export function openedNote(project: StudioProject, replaced?: Replaced): string | null {
  const notes: string[] = []
  const unknown = unknownBlockCount(project)
  if (unknown > 0) {
    notes.push(count(unknown, 'One block in this project isn’t part of Brickgineers, so it can’t run.', '# blocks in this project aren’t part of Brickgineers, so they can’t run.'))
  }
  if (replaced?.pictures) {
    notes.push(count(replaced.pictures, 'A picture in this project couldn’t be used, so a gray one is in its place.', '# pictures in this project couldn’t be used, so gray ones are in their place.'))
  }
  if (replaced?.sounds) {
    notes.push(count(replaced.sounds, 'A sound in this project couldn’t be used, so it is quiet now.', '# sounds in this project couldn’t be used, so they are quiet now.'))
  }
  return notes.length ? notes.join(' ') : null
}

/** Tell the kid (the notice bar) about anything in a project just opened that the game could not use. */
export function announceOpened(project: StudioProject, replaced?: Replaced): void {
  const message = openedNote(project, replaced)
  if (message) setStorageNotice({ id: 'opened-checks', type: 'info', message })
}
