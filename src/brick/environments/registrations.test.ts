import { describe, expect, it } from 'vitest'
import {
  ADDITIVE_ENVIRONMENT_BY_ID,
  ADDITIVE_ENVIRONMENT_REGISTRATIONS,
} from './index'

describe('additive environment registrations', () => {
  it('exposes every contracted environment exactly once', () => {
    expect(ADDITIVE_ENVIRONMENT_REGISTRATIONS.map(({ descriptor }) => descriptor.id)).toEqual([
      'toy-room',
      'brick-valley',
      'sky-island',
    ])
    expect(ADDITIVE_ENVIRONMENT_BY_ID.size).toBe(3)
  })

  it('lazy-loads adapters without losing descriptor identity', async () => {
    for (const registration of ADDITIVE_ENVIRONMENT_REGISTRATIONS) {
      const module = await registration.load()
      expect(module.descriptor).toBe(registration.descriptor)
      expect(module.Rig).toBeTypeOf('function')
      expect(module.World).toBeTypeOf('function')
      expect(module.surface.plateColor).toMatch(/^#[\da-f]{6}$/i)
    }
  })

  it('publishes the sky-island recovery boundary for the shared controller', async () => {
    const skyIsland = await ADDITIVE_ENVIRONMENT_BY_ID.get('sky-island')?.load()
    expect(skyIsland?.respawnBelowY).toBeTypeOf('number')
    expect(skyIsland?.respawnBelowY).toBeLessThan(-1)
  })
})
