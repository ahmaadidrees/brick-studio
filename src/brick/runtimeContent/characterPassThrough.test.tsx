import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MotionSnapshotRef } from '../avatarMotion'
import type { CharacterVisualProps } from '../characters/types'

const receivedProps = vi.hoisted(() => vi.fn())
const preload = vi.hoisted(() => vi.fn())

vi.mock('../BlockAvatar', () => ({ BlockAvatar: () => null }))
vi.mock('../characters/index', () => ({
  ADDITIVE_CHARACTER_BY_ID: new Map([
    ['toy-figure', {
      descriptor: {
        id: 'toy-figure',
        name: 'Toy Figure',
        description: 'Test adapter',
        previewKey: 'character:toy-figure',
        customizable: true,
      },
      load: async () => ({
        descriptor: {
          id: 'toy-figure',
          name: 'Toy Figure',
          description: 'Test adapter',
          previewKey: 'character:toy-figure',
          customizable: true,
        },
        Avatar: (props: CharacterVisualProps) => {
          receivedProps(props)
          return null
        },
        preload,
      }),
    }],
  ]),
}))

import { RuntimeCharacterAvatar } from './character'

describe('runtime character adapter props', () => {
  it('warms the selected adapter and passes its complete controlled visual props', async () => {
    const motion = { current: {} } as MotionSnapshotRef
    const palette = { primary: '#112233', accent: '#ffee00', skin: '#d8a06a' }

    render(
      <RuntimeCharacterAvatar
        characterId="toy-figure"
        motion={motion}
        palette={palette}
        compact
        reducedMotion
        scale={0.37}
      />,
    )

    await waitFor(() => expect(receivedProps).toHaveBeenCalled())
    expect(preload).toHaveBeenCalledTimes(1)
    expect(receivedProps).toHaveBeenLastCalledWith({
      motion,
      palette,
      compact: true,
      reducedMotion: true,
      scale: 0.37,
    })
  })
})
