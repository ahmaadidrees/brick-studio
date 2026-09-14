import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rigRenders = vi.hoisted(() => vi.fn())

vi.mock('../environments/index', () => {
  const descriptor = {
    id: 'sky-island',
    name: 'Sky Island',
    description: 'Test world',
    previewKey: 'environment:sky-island',
  }
  const surface = { plateColor: '#a1c8ef', showStuds: false, finish: 'matte' }
  return {
    ADDITIVE_ENVIRONMENT_BY_ID: new Map([[
      'sky-island',
      {
        descriptor,
        load: async () => ({
          descriptor,
          surface,
          Rig: () => {
            rigRenders()
            throw new Error('Could not compile the sky shader')
          },
          World: () => <div data-testid="sky-world" />,
        }),
      },
    ]]),
  }
})

import { useBrickStore } from '../store'
import {
  ENVIRONMENT_UNAVAILABLE_TOAST,
  RuntimeEnvironmentBoundary,
  RuntimeEnvironmentRig,
  RuntimeEnvironmentWorld,
} from './environment'

const initialState = useBrickStore.getInitialState()

beforeEach(() => {
  rigRenders.mockClear()
  useBrickStore.setState({ ...initialState }, true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('runtime environment boundary', () => {
  it('keeps the scene mounted and toasts when a loaded world rig throws', async () => {
    render(
      <div data-testid="scene">
        <RuntimeEnvironmentRig environmentId="sky-island" compact={false} reducedMotion={false} />
        <div data-testid="sibling" />
      </div>,
    )

    await waitFor(() => expect(rigRenders).toHaveBeenCalled())
    await waitFor(() => expect(useBrickStore.getState().toast).toBe(ENVIRONMENT_UNAVAILABLE_TOAST))
    expect(screen.getByTestId('scene')).toBeInTheDocument()
    expect(screen.getByTestId('sibling')).toBeInTheDocument()

    const attempts = rigRenders.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(rigRenders.mock.calls.length).toBe(attempts)
  })

  it('still renders the healthy slot of the same world', async () => {
    render(<RuntimeEnvironmentWorld environmentId="sky-island" compact={false} reducedMotion={false} />)
    await waitFor(() => expect(screen.getByTestId('sky-world')).toBeInTheDocument())
    expect(useBrickStore.getState().toast).toBe(initialState.toast)
  })

  it('renders the supplied classic fallback and routes the error to a custom handler', () => {
    const onError = vi.fn()
    function BrokenRig(): never {
      throw new Error('rig exploded')
    }
    render(
      <RuntimeEnvironmentBoundary resetKey="sky-island" fallback={<div data-testid="classic-rig" />} onError={onError}>
        <BrokenRig />
      </RuntimeEnvironmentBoundary>,
    )
    expect(screen.getByTestId('classic-rig')).toBeInTheDocument()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(useBrickStore.getState().toast).toBe(initialState.toast)
  })
})
