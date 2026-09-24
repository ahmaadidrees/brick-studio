import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { deleteDraft, listDrafts, loadDraft, MAX_DRAFTS, saveDraft } from './drafts'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const level = (title: string) => ({ ...createBlankLevel(40, 20), title })

describe('2D drafts in this browser', () => {
  it('never drops a saved world: a new one past the limit is refused, and every old one is kept', () => {
    for (let i = 0; i < MAX_DRAFTS; i++) expect(saveDraft(`world-${i}`, level(`World ${i}`)).ok).toBe(true)
    expect(saveDraft(null, level('One too many'))).toEqual({ ok: false, reason: 'full' })
    expect(saveDraft('world-new', level('One too many'))).toEqual({ ok: false, reason: 'full' })
    expect(listDrafts()).toHaveLength(MAX_DRAFTS)
    for (let i = 0; i < MAX_DRAFTS; i++) expect(loadDraft(`world-${i}`), `world-${i}`).not.toBeNull()
  })

  it('still saves an existing world when the list is full, and moves it to the front', () => {
    for (let i = 0; i < MAX_DRAFTS; i++) saveDraft(`world-${i}`, level(`World ${i}`))
    expect(saveDraft('world-0', level('World 0, edited'))).toEqual({ ok: true, id: 'world-0' })
    expect(loadDraft('world-0')?.title).toBe('World 0, edited')
    const stored = JSON.parse(localStorage.getItem('brick-studio.2d.drafts.v1')!) as { id: string }[]
    expect(stored[0].id).toBe('world-0')
    expect(stored).toHaveLength(MAX_DRAFTS)
  })

  it('makes room once a world is deleted', () => {
    for (let i = 0; i < MAX_DRAFTS; i++) saveDraft(`world-${i}`, level(`World ${i}`))
    expect(deleteDraft('world-3')).toBe(true)
    expect(saveDraft(null, level('Fits now')).ok).toBe(true)
  })

  it('reports a browser that refuses to store instead of claiming a save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(saveDraft(null, level('Nowhere to go'))).toEqual({ ok: false, reason: 'storage' })
    expect(saveDraft('existing', level('Nowhere to go'))).toEqual({ ok: false, reason: 'storage' })
  })
})
