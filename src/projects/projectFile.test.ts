import { describe, expect, it } from 'vitest'
import { createPlatformerDocument } from '@brick-studio/platformer-core/document'
import { createBlankLevel, createBlankRaceLevel } from '@brick-studio/platformer-core/engine/level'
import { brickSpeedway } from '@brick-studio/platformer-core/levels/raceCourses'
import { createBrickStudioDocument } from '../brick/brickDocument'
import { projectFile, projectFileName, readProjectFile } from './projectFile'

const roundTrip = (text: string, name = '') => {
  const r = readProjectFile(text, name)
  if (!r.ok) throw new Error(r.message)
  return r.project
}

describe('one project file for every kind', () => {
  it('a 3D build, a platformer and a race track each come back as what they were, with their names', () => {
    const doc = createBrickStudioDocument([])
    const three = roundTrip(JSON.stringify(projectFile({ title: 'Castle', content: { kind: '3d', document: doc } })))
    expect(three).toMatchObject({ title: 'Castle', content: { kind: '3d' } })
    const plat = roundTrip(JSON.stringify(projectFile({ title: 'Jumps', content: { kind: 'platformer', level: createBlankLevel(40, 20, 'Jumps') } })))
    expect(plat).toMatchObject({ title: 'Jumps', content: { kind: 'platformer' } })
    const race = roundTrip(JSON.stringify(projectFile({ title: 'Speedy', content: { kind: 'race', level: brickSpeedway() } })))
    expect(race.content.kind).toBe('race')
    if (race.content.kind === 'race') expect(race.content.level.objects.filter((o) => o.kind === 'walker')).toHaveLength(2)
  })

  it('opens older files: a .brickstudio.json build (named from the file) and a room’s 2D recovery copy', () => {
    const old = roundTrip(JSON.stringify(createBrickStudioDocument([])), 'my-tower.brickstudio.json')
    expect(old).toMatchObject({ title: 'my tower', content: { kind: '3d' } })
    const recovery = roundTrip(JSON.stringify(createPlatformerDocument(createBlankRaceLevel(72, 44, 'Room track'))), 'room-recovery-v3.json')
    expect(recovery).toMatchObject({ title: 'Room track', content: { kind: 'race' } })
  })

  it('says plainly when a file is not a project, is damaged, or comes from a newer version', () => {
    expect(readProjectFile('hello')).toMatchObject({ ok: false, message: 'That file is not a project file.' })
    expect(readProjectFile(JSON.stringify({ format: 'brickgineers', version: 99, kind: '3d', document: {} }))).toMatchObject({ ok: false, message: expect.stringContaining('newer version') })
    expect(readProjectFile(JSON.stringify({ format: 'brickgineers', version: 1, kind: 'race', document: { format: 'brickgineers-2d', version: 1, level: {} } })).ok).toBe(false)
    expect(readProjectFile(JSON.stringify({ format: 'brickgineers', version: 1, kind: 'robots', document: {} })).ok).toBe(false)
  })

  it('a Hackable Platformer travels as a file, and its own "Save file" opens too', () => {
    const save = { schemaVersion: 1, design: { name: 'Hacky' }, workspaces: {} }
    const document = { format: 'brickgineers-hackable' as const, version: 1 as const, save }
    const file = projectFile({ title: 'Hacky', content: { kind: 'hackable', document } })
    expect(file).toMatchObject({ kind: 'hackable', document })
    expect(readProjectFile(JSON.stringify(file))).toEqual({ ok: true, project: { title: 'Hacky', content: { kind: 'hackable', document } } })
    expect(readProjectFile(JSON.stringify(save), 'whatever.json')).toEqual({ ok: true, project: { title: 'Hacky', content: { kind: 'hackable', document } } })
    expect(readProjectFile(JSON.stringify({ ...file, document: { format: 'brickgineers-hackable', version: 1 } })).ok).toBe(false)
  })

  it('names files safely', () => {
    expect(projectFileName('Maya’s Big Race!')).toBe('maya-s-big-race.brickgineers')
    expect(projectFileName('   ')).toBe('my-project.brickgineers')
  })
})
