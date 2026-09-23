import type { RoboticsSectionEnvelope } from '../../brick/brickDocument'
import type { DerivedCreation } from '../model/creations'
import { readRoboticsPrograms, readRoboticsSection, writeRoboticsSection, type RoboticsCreation, type RoboticsSection } from '../model/section'
import { rememberDeviceNames } from './devices'
import type { Starter } from './starters'
import { PROGRAM_LIMITS, type RoboticsProgram } from './types'
import { utf8Bytes, workspaceText } from './workspaceJson'

/**
 * Programs in the section (CP2-PLAN §3). Pure: each helper takes a section and returns a
 * new one (or the same object when nothing changed, so a caller can skip the write). The
 * Code view writes the result with `setRoboticsSection(…, label, { history: false })`:
 * program edits never enter the studio's Undo (Blockly has its own).
 */

export const makeProgramId = () => `program-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function programsOf(section: RoboticsSection, creationId: string): RoboticsProgram[] {
  return section.programs.filter((program) => program.creationId === creationId)
}

/** The program the Code view opens for a creation: its active program, else its first, else none. */
export function activeProgramOf(section: RoboticsSection, creationId: string): RoboticsProgram | null {
  const own = programsOf(section, creationId)
  const activeId = section.creations.find((creation) => creation.id === creationId)?.activeProgramId
  return own.find((program) => program.id === activeId) ?? own[0] ?? null
}

/** `base`, or `base 2`, `base 3`… so no two programs of a creation share a name. */
export function uniqueProgramName(section: RoboticsSection, creationId: string, base: string): string {
  const names = new Set(programsOf(section, creationId).map((program) => program.name))
  const trimmed = base.trim().slice(0, PROGRAM_LIMITS.maxNameLength) || 'Program'
  if (!names.has(trimmed)) return trimmed
  for (let counter = 2; ; counter += 1) {
    const suffix = ` ${counter}`
    const candidate = `${trimmed.slice(0, PROGRAM_LIMITS.maxNameLength - suffix.length)}${suffix}`
    if (!names.has(candidate)) return candidate
  }
}

const withCreation = (section: RoboticsSection, creationId: string, update: (creation: RoboticsCreation) => RoboticsCreation): RoboticsSection =>
  ({ ...section, creations: section.creations.map((creation) => (creation.id === creationId ? update(creation) : creation)) })

const setActive = (creation: RoboticsCreation, programId: string | undefined): RoboticsCreation => {
  const { activeProgramId: _previous, ...rest } = creation
  return programId ? { ...rest, activeProgramId: programId } : rest
}

export type CreateProgramResult =
  | { ok: true; section: RoboticsSection; program: RoboticsProgram }
  | { ok: false; section: RoboticsSection; reason: 'no-creation' | 'full' | 'duplicate-id' }

/**
 * A new program for a saved creation, begun as `starter` (its workspace is copied), made
 * the creation's active program. At most `PROGRAM_LIMITS.maxProgramsPerCreation` each.
 */
export function createProgram(section: RoboticsSection, creation: DerivedCreation, starter: Starter, options: { id?: string; name?: string } = {}): CreateProgramResult {
  if (!section.creations.some((record) => record.id === creation.id)) return { ok: false, section, reason: 'no-creation' }
  if (programsOf(section, creation.id).length >= PROGRAM_LIMITS.maxProgramsPerCreation) return { ok: false, section, reason: 'full' }
  const id = options.id ?? makeProgramId()
  if (section.programs.some((program) => program.id === id)) return { ok: false, section, reason: 'duplicate-id' }
  const draft: RoboticsProgram = {
    id,
    creationId: creation.id,
    name: uniqueProgramName(section, creation.id, options.name ?? starter.name),
    workspace: JSON.parse(JSON.stringify(starter.workspace)) as unknown,
    deviceNames: {},
    starter: starter.id,
    revision: 0,
  }
  const program = rememberDeviceNames(draft, creation)
  const next = withCreation({ ...section, programs: [...section.programs, program] }, creation.id, (record) => setActive(record, id))
  return { ok: true, section: next, program }
}

export type SaveProgramResult =
  | { ok: true; section: RoboticsSection; program: RoboticsProgram; changed: boolean }
  | { ok: false; section: RoboticsSection; reason: 'not-found' | 'too-big' | 'unreadable' }

/**
 * Saves an edited workspace: bumps `revision` and refreshes `deviceNames` from the build.
 * An identical workspace is not an edit (`changed: false`, same section). A workspace over
 * `PROGRAM_LIMITS.maxWorkspaceBytes` is refused rather than written, because the reader
 * would drop it on the next load.
 */
export function saveProgramWorkspace(section: RoboticsSection, programId: string, workspace: unknown, creation: DerivedCreation | null): SaveProgramResult {
  const current = section.programs.find((program) => program.id === programId)
  if (!current) return { ok: false, section, reason: 'not-found' }
  const text = workspaceText(workspace)
  if (text === null) return { ok: false, section, reason: 'unreadable' }
  if (utf8Bytes(text) > PROGRAM_LIMITS.maxWorkspaceBytes) return { ok: false, section, reason: 'too-big' }
  const sameWorkspace = text === workspaceText(current.workspace)
  const draft: RoboticsProgram = sameWorkspace ? current : { ...current, workspace: JSON.parse(text) as unknown }
  const named = creation ? rememberDeviceNames(draft, creation) : draft
  if (named === current) return { ok: true, section, program: current, changed: false }
  const program: RoboticsProgram = { ...named, revision: current.revision + 1 }
  return { ok: true, section: { ...section, programs: section.programs.map((candidate) => (candidate.id === programId ? program : candidate)) }, program, changed: true }
}

/** Refreshes a program's remembered device names from the build (for example after a rename in Build). */
export function refreshDeviceNames(section: RoboticsSection, programId: string, creation: DerivedCreation): RoboticsSection {
  const current = section.programs.find((program) => program.id === programId)
  if (!current) return section
  const program = rememberDeviceNames(current, creation)
  return program === current ? section : { ...section, programs: section.programs.map((candidate) => (candidate.id === programId ? program : candidate)) }
}

export function renameProgram(section: RoboticsSection, programId: string, name: string): RoboticsSection {
  const current = section.programs.find((program) => program.id === programId)
  const trimmed = name.trim().slice(0, PROGRAM_LIMITS.maxNameLength)
  if (!current || !trimmed || trimmed === current.name) return section
  return { ...section, programs: section.programs.map((program) => (program.id === programId ? { ...program, name: trimmed } : program)) }
}

/** Deletes a program. When it was the creation's active program, the next one (else the previous) becomes active. */
export function deleteProgram(section: RoboticsSection, programId: string): RoboticsSection {
  const current = section.programs.find((program) => program.id === programId)
  if (!current) return section
  const siblings = programsOf(section, current.creationId)
  const index = siblings.findIndex((program) => program.id === programId)
  const replacement = siblings[index + 1] ?? siblings[index - 1] ?? null
  const next = { ...section, programs: section.programs.filter((program) => program.id !== programId) }
  const owner = section.creations.find((creation) => creation.id === current.creationId)
  if (!owner || owner.activeProgramId !== programId) return next
  return withCreation(next, current.creationId, (creation) => setActive(creation, replacement?.id))
}

export function setActiveProgram(section: RoboticsSection, creationId: string, programId: string): RoboticsSection {
  const owner = section.creations.find((creation) => creation.id === creationId)
  if (!owner || owner.activeProgramId === programId) return section
  if (!section.programs.some((program) => program.id === programId && program.creationId === creationId)) return section
  return withCreation(section, creationId, (creation) => setActive(creation, programId))
}

/** Deleting a creation deletes its programs (CP2-PLAN §3). Removing hardware never does. */
export function deleteProgramsOf(section: RoboticsSection, creationId: string): RoboticsSection {
  if (!section.programs.some((program) => program.creationId === creationId)) return section
  return withCreation({ ...section, programs: section.programs.filter((program) => program.creationId !== creationId) }, creationId, (creation) => setActive(creation, undefined))
}

/**
 * The studio history merge (CP2-PLAN §1: studio Undo/Redo never reverts code). When
 * Undo or Redo restores a document-level entry, the robotics section becomes the
 * restored one except for programs:
 *
 * - every program the current document has is kept as it is now, with each creation's
 *   current `activeProgramId`;
 * - a creation the restore brings back that the current document does not have (Undo
 *   of a deletion) gets its programs back from the restored section;
 * - a program whose creation the restore removes (Undo of naming it) is kept in the
 *   stored section, invisible to readers, so Redo brings it back with its creation.
 *
 * Returns `restored` itself when there are no programs on either side, so a document
 * without programs undoes exactly as it did before this hook existed.
 */
export function mergeRoboticsHistory(restored: RoboticsSectionEnvelope | undefined, current: RoboticsSectionEnvelope | undefined): RoboticsSectionEnvelope | undefined {
  const currentPrograms = readRoboticsPrograms(current, null)
  const restoredPrograms = readRoboticsPrograms(restored, null)
  if (!currentPrograms.length && !restoredPrograms.length) return restored
  if (restored && restored.version !== 1) return restored
  const restoredSection = readRoboticsSection(restored)
  const currentSection = readRoboticsSection(current)
  const currentCreations = new Map(currentSection.creations.map((creation) => [creation.id, creation]))
  const kept = new Set(currentPrograms.map((program) => program.id))
  const programs = [
    ...currentPrograms,
    ...restoredPrograms.filter((program) => !currentCreations.has(program.creationId) && !kept.has(program.id)),
  ]
  const creations = restoredSection.creations.map((creation) => {
    const now = currentCreations.get(creation.id)
    const activeId = now ? now.activeProgramId : creation.activeProgramId
    const valid = activeId && programs.some((program) => program.id === activeId && program.creationId === creation.id) ? activeId : undefined
    return setActive(creation, valid)
  })
  const merged = writeRoboticsSection({ ...restoredSection, creations, programs })
  return restored && JSON.stringify(merged) === JSON.stringify(restored) ? restored : merged
}
