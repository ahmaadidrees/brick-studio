import { beforeEach, describe, expect, it } from 'vitest'
import { HACKABLE_FILE_MAX_BYTES, PROJECT_FILE_FORMAT, PROJECT_FILE_MAX_BYTES, projectFile, readProjectFile } from '../../../../projects/projectFile'
import { importProject, listLocalProjects, localProject } from '../../../../projects/projects'
import { MAX_SAVE_BYTES } from '../../core/save'
import { blankImage, costumeFromImage } from '../pixels'
import { createStarterProject } from '../starter'
import type { StudioProject } from '../store'
import { loadProject } from '../storage'
import { HACKABLE_SAVE_MAX_CHARS, projectKey } from './hackableProjects'
import { hackableDocument, saveHackableProject } from './hackableSave'
import { FILE_ERRORS, exportProjectJson, importProjectJson } from './projectIo'

beforeEach(() => localStorage.clear())

/** A project of about `chars` characters: the starter plus busy costumes on the Hero (noise does not compress). */
function bigProject(chars: number): StudioProject {
  const project = createStarterProject()
  project.design.name = 'Big one'
  const hero = project.design.bricks[0]
  const costumes = [...hero.costumes]
  let seed = 3
  for (let n = 0; exportProjectJson(project).length < chars && n < 60; n++) {
    const img = blankImage(150, 150)
    for (let i = 0; i < img.data.length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      img.data[i] = i % 4 === 3 ? 255 : seed >>> 24
    }
    costumes.push(costumeFromImage(`busy${n}`, img))
    project.design.bricks[0] = { ...hero, costumes: [...costumes] }
  }
  return project
}

/** What My projects' "Download a copy" writes for a project kept in this browser. */
function downloadFromMyProjects(id: string): string {
  const item = listLocalProjects().find((p) => p.id === id)!
  return JSON.stringify(projectFile(localProject(item)!))
}

describe('a Hackable Platformer goes out as a file and comes back', () => {
  it('limits are explicit and agree with the game', () => {
    expect(HACKABLE_SAVE_MAX_CHARS).toBe(MAX_SAVE_BYTES)
    expect(HACKABLE_FILE_MAX_BYTES).toBeGreaterThan(MAX_SAVE_BYTES)
    expect(PROJECT_FILE_MAX_BYTES).toBe(3_000_000)
    expect(PROJECT_FILE_FORMAT).toBe('brickgineers')
  })

  it('My projects’ download opens with Hackable’s Open File', () => {
    const project = createStarterProject()
    project.design.name = 'Coin cave'
    saveHackableProject('h1', project)
    const opened = importProjectJson(downloadFromMyProjects('h1'))
    expect(opened.ok).toBe(true)
    if (!opened.ok) return
    expect(exportProjectJson(opened.project)).toBe(exportProjectJson(project))
  })

  it('a 3.5 MB project round-trips: Hackable → My projects download → My projects import and Hackable Open File', async () => {
    const project = bigProject(3_500_000)
    const text = exportProjectJson(project)
    expect(text.length).toBeGreaterThan(3_500_000)
    expect(text.length).toBeLessThan(MAX_SAVE_BYTES)
    saveHackableProject('big', project)

    const file = downloadFromMyProjects('big')
    expect(file.length).toBeGreaterThan(PROJECT_FILE_MAX_BYTES)
    const read = readProjectFile(file, 'big-one.brickgineers')
    expect(read.ok).toBe(true)
    if (!read.ok) return

    localStorage.clear()
    const imported = await importProject(read.project, { signedIn: false })
    expect(imported.ok).toBe(true)
    const id = new URLSearchParams((imported as { href: string }).href.split('?')[1]).get('draft')!
    expect(exportProjectJson(loadProject(undefined, projectKey(id)))).toBe(text)

    const opened = importProjectJson(file)
    expect(opened.ok && exportProjectJson(opened.project)).toBe(text)
    // Its own "Save File" opens in My projects too.
    expect(readProjectFile(text, 'big-one.json').ok).toBe(true)
  })

  it('other files get a reason in kid words', () => {
    const three = JSON.stringify({ format: 'brickgineers', version: 1, kind: '3d', title: 'Tower', document: {} })
    expect(importProjectJson(three)).toMatchObject({ ok: false, error: 'That file is a 3D build. Open it from My projects.' })
    const race = JSON.stringify({ format: 'brickgineers', version: 1, kind: 'race', title: 'Zoom', document: {} })
    expect(importProjectJson(race)).toMatchObject({ ok: false, error: FILE_ERRORS.otherKind('a race track') })
    expect(importProjectJson(JSON.stringify({ format: 'brickgineers', version: 4, kind: 'hackable' }))).toMatchObject({ ok: false, error: FILE_ERRORS.newer })
    expect(importProjectJson(JSON.stringify({ kind: 'brickgineers-power', version: 1, name: 'Dash' }))).toMatchObject({ ok: false, error: FILE_ERRORS.power })
    const newer = JSON.parse(exportProjectJson(createStarterProject()))
    newer.schemaVersion = 7
    expect(importProjectJson(JSON.stringify(newer))).toMatchObject({ ok: false, error: FILE_ERRORS.newer })
    expect(importProjectJson('x'.repeat(HACKABLE_FILE_MAX_BYTES + 1))).toMatchObject({ ok: false, error: FILE_ERRORS.tooBig })
    expect(importProjectJson(JSON.stringify({ format: 'brickgineers', version: 1, kind: 'hackable', document: { format: 'brickgineers-hackable', version: 1 } }))).toMatchObject({ ok: false, error: FILE_ERRORS.damaged })
  })

  it('My projects keeps the smaller limit for 3D and 2D files, and names it', () => {
    const big3d = JSON.stringify({ format: 'brickgineers', version: 1, kind: '3d', title: 'Tower', document: { pad: 'x'.repeat(PROJECT_FILE_MAX_BYTES) } })
    const read = readProjectFile(big3d)
    expect(read.ok).toBe(false)
    expect(!read.ok && read.message).toBe('That file is too big to open. 3D builds and 2D projects can be up to 3 MB.')
    expect(readProjectFile('x'.repeat(HACKABLE_FILE_MAX_BYTES + 1))).toMatchObject({ ok: false, message: expect.stringContaining('too big') })
  })

  it('a project saved in the account downloads and reopens the same way', () => {
    const project = createStarterProject()
    const file = JSON.stringify(projectFile({ title: 'Mine', content: { kind: 'hackable', document: hackableDocument(project) } }))
    const opened = importProjectJson(file)
    expect(opened.ok && exportProjectJson(opened.project)).toBe(exportProjectJson(project))
  })
})
