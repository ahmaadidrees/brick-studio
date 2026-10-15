import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import type { ClassroomWorld } from '../../classroom/contracts'
import { CloudLevelSaver } from './cloudLevel'

const state = vi.hoisted(() => ({ id: 'first', request: vi.fn() }))
vi.mock('../../classroom/client', () => ({
  browserClassroomClient: { getSession: () => ({ user: { id: state.id } }), request: state.request },
  ClassroomError: class extends Error {},
}))
beforeEach(() => { state.id = 'first'; state.request.mockReset(); vi.useFakeTimers() })
afterEach(() => vi.useRealTimers())
const world = { id: 'world', revision: 1 } as ClassroomWorld

it('keeps pending edits out of a newly signed-in account and allows retry in the original account', async () => {
  const saver = new CloudLevelSaver(world, vi.fn())
  saver.schedule(createBlankLevel())
  state.id = 'second'
  expect(await saver.flush()).toBe(false)
  expect(state.request).not.toHaveBeenCalled()
  expect(saver.error).toContain('Your account changed')
  state.id = 'first'
  state.request.mockResolvedValue({ world: { ...world, revision: 2 } })
  expect(await saver.flush()).toBe(true)
  expect(saver.world.revision).toBe(2)
})

it('does not report an old account save as saved after an account switch', async () => {
  let finish!: (value: unknown) => void
  state.request.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const saver = new CloudLevelSaver(world, vi.fn())
  saver.schedule(createBlankLevel())
  const pending = saver.flush()
  state.id = 'second'
  finish({ world: { ...world, revision: 2 } })
  expect(await pending).toBe(false)
  expect(saver.status).toBe('error')
  expect(saver.world.revision).toBe(1)
})
