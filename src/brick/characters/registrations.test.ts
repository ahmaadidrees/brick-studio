import { describe, expect, it } from 'vitest'
import {
  ADDITIVE_CHARACTER_BY_ID,
  ADDITIVE_CHARACTER_REGISTRATIONS,
} from './index'
import { HERO_MODEL_URL } from './cc0-hero/heroModel'

describe('additive character registrations', () => {
  it('exposes every contracted character exactly once', () => {
    expect(ADDITIVE_CHARACTER_REGISTRATIONS.map(({ descriptor }) => descriptor.id)).toEqual([
      'toy-figure',
      'cc0-hero',
    ])
    expect(ADDITIVE_CHARACTER_BY_ID.size).toBe(2)
  })

  it('lazy-loads render adapters and keeps warmup opt-in', async () => {
    const toyFigure = await ADDITIVE_CHARACTER_BY_ID.get('toy-figure')?.load()
    const hero = await ADDITIVE_CHARACTER_BY_ID.get('cc0-hero')?.load()

    expect(toyFigure?.descriptor.id).toBe('toy-figure')
    expect(toyFigure?.Avatar).toBeDefined()
    expect(toyFigure?.preload).toBeUndefined()
    expect(hero?.descriptor.id).toBe('cc0-hero')
    expect(hero?.Avatar).toBeDefined()
    expect(hero?.preload).toBeTypeOf('function')
  })

  it('keeps the vendored hero model colocated with its lazy module', () => {
    expect(HERO_MODEL_URL).toContain('brick-hero.glb')
  })
})
