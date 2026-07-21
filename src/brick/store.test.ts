import { describe, expect, it } from 'vitest'
import { draftIsValid } from './store'
import type { BrickDraft, BrickInstance } from './types'

const base: BrickInstance = { id: 'a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }

describe('brick placement', () => {
  it('rejects overlapping volumes', () => {
    const draft: BrickDraft = { partId: 'brick_2x2', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }
    expect(draftIsValid(draft, [base])).toBe(false)
  })

  it('allows stacking above an existing brick', () => {
    const draft: BrickDraft = { partId: 'brick_2x2', x: 10, y: 3, z: 10, rotation: 0, color: '#fff' }
    expect(draftIsValid(draft, [base])).toBe(true)
  })

  it('rejects bricks outside the build plate', () => {
    const draft: BrickDraft = { partId: 'brick_2x4', x: 63, y: 0, z: 63, rotation: 0, color: '#fff' }
    expect(draftIsValid(draft, [])).toBe(false)
  })
})
