import { beforeEach, describe, expect, it } from 'vitest'
import { exportProjectJson } from './persist/projectIo'
import { HACKABLE_INDEX_KEY, projectKey } from './persist/hackableProjects'
import { createStarterProject } from './starter'
import { openStudioRoute } from './StudioApp'

beforeEach(() => localStorage.clear())

const named = (name: string) => ({ ...createStarterProject(), design: { ...createStarterProject().design, name } })

describe('opening /2d/hackable?draft=', () => {
  it('opens a project whose save is here even when the list lost it', async () => {
    localStorage.setItem(projectKey('h1'), exportProjectJson(named('Rocket run')))
    localStorage.setItem(HACKABLE_INDEX_KEY, '[]')
    const opened = await openStudioRoute({ draft: 'h1', fresh: false })
    expect(opened).toMatchObject({ kind: 'local', id: 'h1' })
    expect(opened.kind === 'local' && opened.project.design.name).toBe('Rocket run')
  })

  it('says so when the save is not on this computer', async () => {
    const opened = await openStudioRoute({ draft: 'gone', fresh: false })
    expect(opened).toMatchObject({ kind: 'problem', title: 'That project isn’t on this computer' })
  })
})
