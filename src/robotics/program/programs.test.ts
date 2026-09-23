import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { parseBrickStudioDocument, serializeBrickStudioDocument } from '../../brick/brickDocument'
import { registerRoboticsHistoryMerge, useBrickStore } from '../../brick/store'
import { connect, disconnect } from '../model/control'
import { ROVER_IDS, fixtureDocument, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection, isEmptyRoboticsSection, readRoboticsSection, writeRoboticsSection, type RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, resetRoboticsWatcherForTests } from '../state/roboticsStore'
import {
  activeProgramOf, createProgram, deleteProgram, deleteProgramsOf, mergeRoboticsHistory, programsOf, renameProgram, saveProgramWorkspace, setActiveProgram, uniqueProgramName,
} from './programs'
import { startersFor, type Starter } from './starters'
import { wiredRover } from './testFixtures'
import { PROGRAM_LIMITS, type RoboticsProgram } from './types'

beforeAll(() => { installRoboticsParts(true) })

const program = (id: string, creationId = 'c1', extra: Partial<RoboticsProgram> = {}): RoboticsProgram => ({
  id, creationId, name: `Program ${id}`, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_run', id: `${id}-hat`, x: 0, y: 0 }] } }, deviceNames: {}, revision: 0, ...extra,
})

const withPrograms = (programs: RoboticsProgram[], active?: string): RoboticsSection => ({
  ...emptyRoboticsSection(),
  creations: [{ id: 'c1', name: 'Buggy', anchorBrickIds: [ROVER_IDS.hub], ...(active ? { activeProgramId: active } : {}) }],
  connections: [{ deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' }],
  programs,
})

describe('programs in the robotics section', () => {
  it('round-trip through the document byte for byte, in stable key order', () => {
    const section = withPrograms([program('p1', 'c1', { starter: 'stop-before-wall', revision: 3, deviceNames: { b: 'Right motor', a: 'Left motor' } }), program('p2')], 'p2')
    const document = fixtureDocument(roverBricks(), section)
    const serialized = serializeBrickStudioDocument(document)
    const parsed = parseBrickStudioDocument(serialized)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(serializeBrickStudioDocument(parsed.document)).toBe(serialized)
    const read = readRoboticsSection(parsed.document.robotics)
    expect(read).toEqual({ ...section, programs: [{ ...section.programs[0], deviceNames: { a: 'Left motor', b: 'Right motor' } }, section.programs[1]] })
    const written = writeRoboticsSection(read)
    expect(Object.keys(written)).toEqual(['version', 'settings', 'creations', 'devices', 'connections', 'programs'])
    expect(Object.keys((written.programs as object[])[0])).toEqual(['id', 'creationId', 'name', 'starter', 'revision', 'deviceNames', 'workspace'])
    expect(Object.keys((written.creations as object[])[0])).toEqual(['id', 'name', 'anchorBrickIds', 'activeProgramId'])
    expect(JSON.stringify(writeRoboticsSection(readRoboticsSection(written)))).toBe(JSON.stringify(written))
  })

  it('a section without programs is written exactly as before; programs make it non-empty', () => {
    expect(writeRoboticsSection(withPrograms([]))).not.toHaveProperty('programs')
    expect(readRoboticsSection(writeRoboticsSection(withPrograms([]))).programs).toEqual([])
    expect(isEmptyRoboticsSection({ ...emptyRoboticsSection(), programs: [program('p1')] })).toBe(false)
    expect(isEmptyRoboticsSection(emptyRoboticsSection())).toBe(true)
  })

  it('drops malformed programs one at a time and enforces the limits', () => {
    const envelope = {
      ...writeRoboticsSection(withPrograms([])),
      creations: [{ id: 'c1', name: 'Buggy', anchorBrickIds: [], activeProgramId: 'nope' }, { id: 'c2', name: 'Gate', anchorBrickIds: [], activeProgramId: 'g1' }],
      programs: [
        program('ok'),
        program('ok', 'c1', { name: 'duplicate id' }),
        { ...program('no-creation'), creationId: 'unknown' },
        { ...program('bad-workspace'), workspace: 'text' },
        { ...program('huge'), workspace: { padding: 'x'.repeat(PROGRAM_LIMITS.maxWorkspaceBytes) } },
        { id: '', creationId: 'c1', name: 'x', workspace: {} },
        'not a program',
        { id: 'loose', creationId: 'c1', name: '  ', workspace: {}, deviceNames: { good: 'Eye', bad: '', worse: 3 }, revision: -2, starter: 7 },
        { ...program('long'), name: 'n'.repeat(80) },
        program('g1', 'c2'),
        ...Array.from({ length: PROGRAM_LIMITS.maxProgramsPerCreation + 2 }, (_, index) => program(`many-${index}`)),
      ],
    }
    const section = readRoboticsSection(envelope)
    expect(section.programs.map((entry) => entry.id)).toEqual(['ok', 'loose', 'long', 'g1', ...Array.from({ length: PROGRAM_LIMITS.maxProgramsPerCreation - 3 }, (_, index) => `many-${index}`)])
    expect(programsOf(section, 'c1')).toHaveLength(PROGRAM_LIMITS.maxProgramsPerCreation)
    const loose = section.programs.find((entry) => entry.id === 'loose')!
    expect(loose).toEqual({ id: 'loose', creationId: 'c1', name: 'Program', workspace: {}, deviceNames: { good: 'Eye' }, revision: 0 })
    expect(section.programs.find((entry) => entry.id === 'long')!.name).toHaveLength(PROGRAM_LIMITS.maxNameLength)
    // An active program must be the creation's own.
    expect(section.creations.map((creation) => creation.activeProgramId)).toEqual([undefined, 'g1'])
    // Programs of a foreign version or a non-array are ignored, not fatal.
    expect(readRoboticsSection({ ...envelope, programs: 'x' }).programs).toEqual([])
  })

  it('reading never shares mutable records with the stored section', () => {
    const envelope = writeRoboticsSection(withPrograms([program('p1', 'c1', { deviceNames: { a: 'A' } })]))
    const first = readRoboticsSection(envelope)
    first.programs[0].deviceNames.a = 'changed'
    first.programs[0].name = 'changed'
    expect(readRoboticsSection(envelope).programs[0]).toMatchObject({ name: 'Program p1', deviceNames: { a: 'A' } })
  })
})

describe('program helpers', () => {
  const rover = () => {
    const fixture = wiredRover()
    return { ...fixture, starters: startersFor(fixture.creation) }
  }

  it('create from a starter: copies its workspace, remembers device names, becomes active, names stay unique', () => {
    const { section, creation, starters } = rover()
    const first = createProgram(section, creation, starters[0], { id: 'p1' })
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(first.program).toMatchObject({ id: 'p1', creationId: 'c1', name: 'Stop before the wall', starter: 'stop-before-wall', revision: 0, deviceNames: { [ROVER_IDS.sensor]: 'Front sensor' } })
    expect(first.program.workspace).toEqual(starters[0].workspace)
    expect(first.program.workspace).not.toBe(starters[0].workspace)
    expect(activeProgramOf(first.section, 'c1')?.id).toBe('p1')
    const second = createProgram(first.section, creation, starters[0], { id: 'p2' })
    expect(second.ok && second.program.name).toBe('Stop before the wall 2')
    expect(second.ok && activeProgramOf(second.section, 'c1')?.id).toBe('p2')
    expect(createProgram(first.section, creation, starters[0], { id: 'p1' })).toMatchObject({ ok: false, reason: 'duplicate-id' })
    expect(createProgram({ ...section, creations: [] }, creation, starters[0])).toMatchObject({ ok: false, reason: 'no-creation' })
    // It survives the codec.
    expect(readRoboticsSection(writeRoboticsSection(first.section))).toEqual(first.section)
  })

  it('at most eight programs per creation', () => {
    const { section, creation, starters } = rover()
    let current = section
    for (let index = 0; index < PROGRAM_LIMITS.maxProgramsPerCreation; index += 1) {
      const result = createProgram(current, creation, starters.at(-1)!, { id: `p${index}` })
      expect(result.ok).toBe(true)
      if (result.ok) current = result.section
    }
    expect(createProgram(current, creation, starters[0], { id: 'one-more' })).toMatchObject({ ok: false, reason: 'full' })
    expect(uniqueProgramName(current, 'c1', 'My program')).toBe('My program 9')
  })

  it('save bumps the revision and refreshes names; an identical workspace is not an edit; too big is refused', () => {
    const { section, creation, starters } = rover()
    const created = createProgram(section, creation, starters[0], { id: 'p1' })
    if (!created.ok) throw new Error('create failed')
    const edited = JSON.parse(JSON.stringify(created.program.workspace)) as { blocks: { blocks: { next: { block: { inputs: { POWER: { shadow: { fields: { NUM: number } } } } } } }[] } }
    edited.blocks.blocks[0].next.block.inputs.POWER.shadow.fields.NUM = 60
    const saved = saveProgramWorkspace(created.section, 'p1', edited, creation)
    expect(saved).toMatchObject({ ok: true, changed: true, program: { revision: 1 } })
    if (!saved.ok) return
    expect(saved.program.workspace).toEqual(edited)
    const again = saveProgramWorkspace(saved.section, 'p1', edited, creation)
    expect(again).toMatchObject({ ok: true, changed: false })
    expect(again.section).toBe(saved.section)
    expect(saveProgramWorkspace(saved.section, 'p1', { padding: 'x'.repeat(PROGRAM_LIMITS.maxWorkspaceBytes) }, creation)).toMatchObject({ ok: false, reason: 'too-big' })
    expect(saveProgramWorkspace(saved.section, 'nope', edited, creation)).toMatchObject({ ok: false, reason: 'not-found' })
    // A rename in Build reaches deviceNames on the next save.
    const renamed = { ...creation, sensors: creation.sensors.map((sensor) => ({ ...sensor, name: 'Nose' })) }
    const named = saveProgramWorkspace(saved.section, 'p1', edited, renamed)
    expect(named).toMatchObject({ ok: true, changed: true, program: { revision: 2, deviceNames: { [ROVER_IDS.sensor]: 'Nose' } } })
  })

  it('rename, set active, delete (the next program becomes active) and delete a creation’s programs', () => {
    let section = withPrograms([program('p1'), program('p2'), program('p3'), program('g1', 'c2')], 'p2')
    section = { ...section, creations: [...section.creations, { id: 'c2', name: 'Gate', anchorBrickIds: [] }] }
    expect(renameProgram(section, 'p1', '  Race  ').programs[0].name).toBe('Race')
    expect(renameProgram(section, 'p1', '   ')).toBe(section)
    expect(renameProgram(section, 'p1', 'x'.repeat(99)).programs[0].name).toHaveLength(PROGRAM_LIMITS.maxNameLength)
    expect(setActiveProgram(section, 'c1', 'g1')).toBe(section)
    expect(activeProgramOf(setActiveProgram(section, 'c1', 'p3'), 'c1')?.id).toBe('p3')
    const deleted = deleteProgram(section, 'p2')
    expect(programsOf(deleted, 'c1').map((entry) => entry.id)).toEqual(['p1', 'p3'])
    expect(deleted.creations[0].activeProgramId).toBe('p3')
    expect(deleteProgram(deleteProgram(deleted, 'p3'), 'p1').creations[0]).not.toHaveProperty('activeProgramId')
    expect(activeProgramOf(deleteProgram(section, 'p1'), 'c1')?.id).toBe('p2')
    const gone = deleteProgramsOf(section, 'c1')
    expect(gone.programs.map((entry) => entry.id)).toEqual(['g1'])
    expect(gone.creations[0]).not.toHaveProperty('activeProgramId')
  })
})

describe('the history merge', () => {
  const envelope = (section: RoboticsSection) => writeRoboticsSection(section)

  it('with no programs on either side it returns the restored section itself', () => {
    const restored = envelope(withPrograms([]))
    expect(mergeRoboticsHistory(restored, envelope(emptyRoboticsSection()))).toBe(restored)
    expect(mergeRoboticsHistory(undefined, undefined)).toBeUndefined()
  })

  it('restores everything but the programs and the active program, which stay as they are now', () => {
    const before = withPrograms([program('p1', 'c1', { revision: 1 })], 'p1')
    const now = { ...disconnect(before, ROVER_IDS.leftMotor), programs: [program('p1', 'c1', { revision: 7 }), program('p2')], creations: [{ ...before.creations[0], activeProgramId: 'p2' }] }
    const merged = readRoboticsSection(mergeRoboticsHistory(envelope(before), envelope(now)))
    expect(merged.connections).toEqual(before.connections)
    expect(merged.programs.map((entry) => [entry.id, entry.revision])).toEqual([['p1', 7], ['p2', 0]])
    expect(merged.creations[0].activeProgramId).toBe('p2')
  })

  it('a program deleted silently stays deleted when an older entry is restored', () => {
    const before = withPrograms([program('p1'), program('p2')], 'p2')
    const now = { ...connect(before, ROVER_IDS.rightMotor, ROVER_IDS.hub, 'B'), programs: [program('p1')], creations: [{ ...before.creations[0], activeProgramId: 'p1' }] }
    const merged = readRoboticsSection(mergeRoboticsHistory(envelope(before), envelope(now)))
    expect(merged.programs.map((entry) => entry.id)).toEqual(['p1'])
    expect(merged.creations[0].activeProgramId).toBe('p1')
  })

  it('undoing a creation’s deletion brings its programs back; undoing its naming keeps them for Redo', () => {
    const named = withPrograms([program('p1')], 'p1')
    const unnamed: RoboticsSection = { ...named, creations: [], programs: [] }
    // Undo of a deletion: the creation comes back with its programs.
    const restoredDeletion = readRoboticsSection(mergeRoboticsHistory(envelope(named), envelope(unnamed)))
    expect(restoredDeletion.programs.map((entry) => entry.id)).toEqual(['p1'])
    expect(restoredDeletion.creations[0].activeProgramId).toBe('p1')
    // Undo of the naming: the creation goes, its program is kept out of sight…
    const undone = mergeRoboticsHistory(envelope(unnamed), envelope(named))
    expect(readRoboticsSection(undone).programs).toEqual([])
    expect(readRoboticsSection(undone).creations).toEqual([])
    // …and Redo brings both back.
    const redone = readRoboticsSection(mergeRoboticsHistory(envelope(named), undone))
    expect(redone.programs.map((entry) => entry.id)).toEqual(['p1'])
    expect(redone.creations[0].activeProgramId).toBe('p1')
  })
})

describe('studio history (brick store)', () => {
  const store = () => useBrickStore.getState()
  const section = () => readRoboticsSection(store().documentMetadata.robotics)
  const write = (next: RoboticsSection, label: string, options?: { history?: boolean }) => store().setRoboticsSection(writeRoboticsSection(next), label, options)
  let starter: Starter

  beforeEach(() => {
    registerRoboticsHistoryMerge(null)
    store().newBuild()
    useBrickStore.setState({ undoStack: [], redoStack: [] })
    starter = startersFor(wiredRover().creation)[0]
  })
  afterEach(() => registerRoboticsHistoryMerge(null))

  function setUpCableThenSilentEdit() {
    const { section: base, creation } = wiredRover({ unplug: [ROVER_IDS.sensor] })
    const created = createProgram(base, creation, starter, { id: 'p1' })
    if (!created.ok) throw new Error('create failed')
    write(created.section, 'Name creation')
    // A cable change: an ordinary undoable edit.
    write(connect(section(), ROVER_IDS.sensor, ROVER_IDS.hub, 'C'), 'Plug in Front sensor')
    // A program edit in between, written silently.
    const saved = saveProgramWorkspace(section(), 'p1', { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_run', id: 'edited', x: 0, y: 0 }] } }, creation)
    if (!saved.ok) throw new Error('save failed')
    const depth = store().undoStack.length
    write(saved.section, 'Edit program', { history: false })
    expect(store().undoStack).toHaveLength(depth)
    expect(section().programs[0].revision).toBe(1)
  }

  it('history: false updates the document without an undo entry and leaves Redo alone', () => {
    write(withPrograms([program('p1')]), 'Name creation')
    store().undo()
    const redo = store().redoStack.length
    write({ ...emptyRoboticsSection() }, 'Silent', { history: false })
    expect(store().undoStack).toHaveLength(0)
    expect(store().redoStack).toHaveLength(redo)
    // The default still records an entry.
    write(withPrograms([program('p1')]), 'Recorded')
    expect(store().undoStack.at(-1)?.label).toBe('Recorded')
    expect(store().redoStack).toHaveLength(0)
  })

  it('with the merge registered, studio Undo of a cable change keeps a program edited silently in between, and Redo too', () => {
    registerRoboticsHistoryMerge(mergeRoboticsHistory)
    setUpCableThenSilentEdit()
    store().undo()
    expect(section().connections.some((connection) => connection.deviceId === ROVER_IDS.sensor)).toBe(false)
    expect(section().programs[0]).toMatchObject({ id: 'p1', revision: 1 })
    store().redo()
    expect(section().connections.some((connection) => connection.deviceId === ROVER_IDS.sensor)).toBe(true)
    expect(section().programs[0]).toMatchObject({ id: 'p1', revision: 1 })
  })

  it('with nothing registered, Undo restores the section exactly as recorded (the old behaviour)', () => {
    setUpCableThenSilentEdit()
    const recorded = store().undoStack.at(-1)!.documentBefore!.robotics
    store().undo()
    expect(store().documentMetadata.robotics).toBe(recorded)
    expect(section().programs[0].revision).toBe(0)
  })

  it('the robotics watcher installs the merge', () => {
    resetRoboticsWatcherForTests()
    installRoboticsWatcher()
    setUpCableThenSilentEdit()
    store().undo()
    expect(section().programs[0].revision).toBe(1)
  })
})
