import { describe, expect, it } from 'vitest'
import { createStarterProject } from '../starter'
import {
  exportProjectJson,
  importProjectFile,
  importProjectJson,
} from './projectIo'

describe('Project IO: Export / Import (projectIo.ts)', () => {
  it('roundtrips project JSON cleanly preserving design and workspaces', () => {
    const original = createStarterProject()
    const json = exportProjectJson(original)

    expect(typeof json).toBe('string')
    expect(json).toContain('"schemaVersion": 1')
    expect(json).toContain('"starter_level"')

    const imported = importProjectJson(json)
    expect(imported.ok).toBe(true)
    if (!imported.ok) return

    expect(imported.project.design.id).toBe(original.design.id)
    expect(imported.project.design.bricks).toHaveLength(original.design.bricks.length)
    expect(imported.project.design.copies).toHaveLength(original.design.copies.length)
    expect(imported.project.workspaces).toEqual(original.workspaces)

    // Verify costume masks decode to Uint8Array
    const originalCostume = original.design.bricks[0].costumes[0]
    const importedCostume = imported.project.design.bricks[0].costumes[0]
    expect(importedCostume.mask?.data).toBeInstanceOf(Uint8Array)
    expect(importedCostume.mask?.data).toEqual(originalCostume.mask?.data)
  })

  it('rejects invalid JSON string with informative error', () => {
    const result = importProjectJson('{ broken json')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('Invalid JSON')
  })

  it('rejects project with missing design', () => {
    const result = importProjectJson(
      JSON.stringify({
        schemaVersion: 1,
        engineSemanticsVersion: 1,
        editorVersion: '13.3.0',
        pluginVersions: {},
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('design must be an object')
  })

  it('imports valid File object via importProjectFile', async () => {
    const original = createStarterProject()
    const json = exportProjectJson(original)
    const file = new File([json], 'playground.json', { type: 'application/json' })

    const result = await importProjectFile(file)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.project.design.id).toBe('starter_level')
  })

  it('handles invalid File reading gracefully', async () => {
    const file = new File(['corrupt data'], 'bad.json', { type: 'application/json' })
    const result = await importProjectFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeDefined()
  })
})
