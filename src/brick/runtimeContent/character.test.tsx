import type { ComponentProps } from 'react'
import { render, renderHook, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlockAvatar } from '../BlockAvatar'
import type { MotionSnapshotRef } from '../avatarMotion'
import type { CharacterId } from '../types'

const blockAvatarProps = vi.hoisted(() => vi.fn())

vi.mock('../BlockAvatar', () => ({
  BlockAvatar: (props: ComponentProps<typeof BlockAvatar>) => {
    blockAvatarProps(props)
    return <div data-testid="classic-avatar" />
  },
}))

import {
  RuntimeCharacterAvatar,
  loadRuntimeCharacter,
  useRuntimeCharacter,
} from './character'

const motion = { current: {} } as MotionSnapshotRef

describe('runtime characters', () => {
  beforeEach(() => blockAvatarProps.mockClear())

  it.each<CharacterId>(['classic', 'toy-figure', 'cc0-hero'])(
    'resolves %s through the lazy registry',
    async (characterId) => {
      const content = await loadRuntimeCharacter(characterId)
      expect(content.descriptor.id).toBe(characterId)
      expect(['function', 'object']).toContain(typeof content.Avatar)
    },
  )

  it('falls back to the classic avatar for a stale ID', () => {
    const { result } = renderHook(() => useRuntimeCharacter('retired-character' as CharacterId))
    expect(result.current.resolvedId).toBe('classic')
    expect(result.current.loading).toBe(false)
  })

  it('passes palette, motion, scale, and reduced-motion settings to the classic fallback', async () => {
    render(
      <RuntimeCharacterAvatar
        characterId="classic"
        motion={motion}
        compact
        reducedMotion
        scale={0.42}
        palette={{ primary: '#123456', accent: '#abcdef' }}
      />,
    )

    await waitFor(() => expect(screen.getByTestId('classic-avatar')).toBeInTheDocument())
    expect(blockAvatarProps).toHaveBeenLastCalledWith(expect.objectContaining({
      motion,
      reducedMotion: true,
      scale: 0.42,
      color: '#123456',
    }))
  })
})
