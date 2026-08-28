import { render, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EnvironmentId } from '../types'
import {
  CLASSIC_ENVIRONMENT_SURFACE,
  RuntimeEnvironmentRig,
  RuntimeEnvironmentWorld,
  preloadRuntimeEnvironment,
  useRuntimeEnvironment,
} from './environment'

describe('runtime environments', () => {
  it.each<EnvironmentId>(['classic', 'toy-room', 'brick-valley', 'sky-island'])(
    'resolves %s through the lazy registry',
    async (environmentId) => {
      const content = await preloadRuntimeEnvironment(environmentId)
      expect(content.descriptor.id).toBe(environmentId)
      expect(content.Rig).toBeTypeOf('function')
      expect(content.World).toBeTypeOf('function')
      expect(content.surface.plateColor).toMatch(/^#[\da-f]{6}$/i)
    },
  )

  it('falls back to classic/no-op slots for a missing or stale ID', () => {
    const { result } = renderHook(() => useRuntimeEnvironment('retired-world' as EnvironmentId))

    expect(result.current.resolvedId).toBe('classic')
    expect(result.current.surface).toBe(CLASSIC_ENVIRONMENT_SURFACE)
    expect(result.current.loading).toBe(false)
    const rig = render(
      <RuntimeEnvironmentRig environmentId="classic" compact={false} reducedMotion={false} />,
    )
    const world = render(
      <RuntimeEnvironmentWorld environmentId="classic" compact={false} reducedMotion={false} />,
    )
    expect(rig.container).toBeEmptyDOMElement()
    expect(world.container).toBeEmptyDOMElement()
  })

  it('publishes surface and respawn metadata only from the resolved selection', async () => {
    const { result, rerender } = renderHook(
      ({ id }) => useRuntimeEnvironment(id),
      { initialProps: { id: 'classic' as EnvironmentId } },
    )

    rerender({ id: 'sky-island' })
    expect(result.current.resolvedId).toBe('classic')
    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.resolvedId).toBe('sky-island'))
    expect(result.current.surface.showStuds).toBe(false)
    expect(result.current.respawnBelowY).toBeLessThan(-1)
  })
})
