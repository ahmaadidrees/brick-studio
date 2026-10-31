import { afterEach, describe, expect, it } from 'vitest'
import { DESIGN_LIMITS } from '../../core/project'
import { clearStorageNotice, getStorageNotice } from '../persist/notice'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { History } from './history'
import { LEVEL_FULL, limitedStore } from './limits'

afterEach(() => clearStorageNotice())

describe('a level holds as many bricks as it can save, and no more', () => {
  it('refuses the brick after the last one that fits, says so, and saves nothing new', () => {
    const project = createStarterProject()
    const brickId = project.design.copies.find((c) => !project.design.bricks.find((b) => b.id === c.brickId)?.limit)!.brickId
    const filler = Array.from({ length: DESIGN_LIMITS.maxCopies - project.design.copies.length - 1 }, (_, i) => ({ id: `fill${i}`, brickId, x: 16 * (i % 100), y: 16 * Math.floor(i / 100) }))
    const store = new StudioStore({ ...project, design: { ...project.design, copies: [...project.design.copies, ...filler] } })
    const stage = limitedStore(store, new History(store))
    // The last brick that fits is placed.
    expect(stage.addCopy(brickId, 4000, 64)).not.toBe('')
    expect(store.getState().project.design.copies).toHaveLength(DESIGN_LIMITS.maxCopies)
    expect(getStorageNotice()).toBeNull()
    // The next one is not, and the kid is told why.
    expect(stage.addCopy(brickId, 4016, 64)).toBe('')
    expect(store.getState().project.design.copies).toHaveLength(DESIGN_LIMITS.maxCopies)
    expect(getStorageNotice()).toMatchObject({ id: 'level-full', message: LEVEL_FULL })
    expect(LEVEL_FULL).toMatch(/This level is full/)
  })
})
