import { useBrickStore } from '../../brick/store'
import type { DerivedCreation } from '../model/creations'
import { readRoboticsSection, writeRoboticsSection, type RoboticsSection } from '../model/section'
import { activeProgramOf, createProgram, deleteProgram, programsOf, renameProgram, saveProgramWorkspace, setActiveProgram, type SaveProgramResult } from '../program/programs'
import { defaultStarterFor, type Starter } from '../program/starters'
import { PROGRAM_LIMITS, type RoboticsProgram } from '../program/types'

/**
 * The Code view's writes (CP2-PLAN §3). Every one goes through the lane P helpers and
 * lands with `setRoboticsSection(…, label, { history: false })`: program edits never
 * enter the studio's Undo (Blockly has its own), and studio Undo never reverts them
 * (the history merge hook). Each reads the section fresh from the document, so a
 * write can never resurrect an older copy.
 */
export function currentSection(): RoboticsSection {
  return readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
}

function write(section: RoboticsSection, label: string) {
  useBrickStore.getState().setRoboticsSection(writeRoboticsSection(section), label, { history: false })
}

/**
 * The program the Code view opens for a creation. A creation with none gets its default
 * starter (rover: "Stop before the wall", gate: "Smart gate", signal post: "Signal post",
 * else blank), which is its first run. Safe to call twice (Strict Mode): the second call
 * finds the program the first one wrote.
 */
export function ensureProgramFor(creation: DerivedCreation): { program: RoboticsProgram; created: boolean } | null {
  const section = currentSection()
  const existing = activeProgramOf(section, creation.id)
  if (existing) return { program: existing, created: false }
  const result = createProgram(section, creation, defaultStarterFor(creation))
  if (!result.ok) return null
  write(result.section, `New program ${result.program.name}`)
  return { program: result.program, created: true }
}

export type AddProgramResult = { ok: true; program: RoboticsProgram } | { ok: false; reason: string }

/** A new program begun as `starter`, made the creation's active program. */
export function addProgram(creation: DerivedCreation, starter: Starter): AddProgramResult {
  const result = createProgram(currentSection(), creation, starter)
  if (!result.ok) {
    return { ok: false, reason: result.reason === 'full' ? `A creation can have ${PROGRAM_LIMITS.maxProgramsPerCreation} programs. Delete one first.` : 'That program could not be made.' }
  }
  write(result.section, `New program ${result.program.name}`)
  return { ok: true, program: result.program }
}

/** Saves an edited workspace (bumps the revision) unless it is identical to what is stored. */
export function saveWorkspace(programId: string, workspace: unknown, creation: DerivedCreation | null): SaveProgramResult {
  const result = saveProgramWorkspace(currentSection(), programId, workspace, creation)
  if (result.ok && result.changed) write(result.section, 'Edit program')
  return result
}

export function renameProgramTo(programId: string, name: string) {
  const section = currentSection()
  const next = renameProgram(section, programId, name)
  if (next !== section) write(next, 'Rename program')
}

/** Deletes a program; the next one (else the previous) becomes the creation's active program. */
export function removeProgram(programId: string) {
  const section = currentSection()
  const next = deleteProgram(section, programId)
  if (next !== section) write(next, 'Delete program')
}

export function activateProgram(creationId: string, programId: string) {
  const section = currentSection()
  const next = setActiveProgram(section, creationId, programId)
  if (next !== section) write(next, 'Switch program')
}

export { activeProgramOf, programsOf }

