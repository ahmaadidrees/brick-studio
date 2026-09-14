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
  const valleyDescriptor = {
    id: 'brick-valley',
    name: 'Brick Valley',
    description: 'Healthy test world',
    previewKey: 'environment:brick-valley',
  }
  const valleySurface = { plateColor: '#b9d98a', showStuds: true, finish: 'matte' }
  return {
    ADDITIVE_ENVIRONMENT_BY_ID: new Map([
      [
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
      ],
      [
        'brick-valley',
        {
          descriptor: valleyDescriptor,
          load: async () => ({
            descriptor: valleyDescriptor,
            surface: valleySurface,
            Rig: () => <div data-testid="valley-rig" />,
            World: () => <div data-testid="valley-world" />,
          }),
        },
      ],
    ]),
  }
})

import { useBrickStore } from '../store'
import {
  CLASSIC_ENVIRONMENT_SURFACE,
  ENVIRONMENT_UNAVAILABLE_TOAST,
  RuntimeEnvironmentBoundary,
  RuntimeEnvironmentRig,
  RuntimeEnvironmentWorld,
  clearRuntimeEnvironmentRenderFailures,
  useRuntimeEnvironment,
} from './environment'

const initialState = useBrickStore.getInitialState()

beforeEach(() => {
  rigRenders.mockClear()
  clearRuntimeEnvironmentRenderFailures()
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

  it('switches the whole world to Classic Studio after a render failure and leaves other worlds alone', async () => {
    function Probe({ id }: { id: 'sky-island' | 'brick-valley' }) {
      const environment = useRuntimeEnvironment(id)
      return (
        <div
          data-testid={`probe-${id}`}
          data-resolved={environment.resolvedId}
          data-error={environment.error ? 'yes' : 'no'}
          data-plate={environment.surface.plateColor}
        />
      )
    }
    render(
      <>
        <RuntimeEnvironmentRig environmentId="sky-island" compact={false} reducedMotion={false} />
        <RuntimeEnvironmentWorld environmentId="sky-island" compact={false} reducedMotion={false} />
        <Probe id="sky-island" />
        <Probe id="brick-valley" />
      </>,
    )

    await waitFor(() => expect(rigRenders).toHaveBeenCalled())
    // The failed world resolves to Classic Studio as a whole: id, surface and both slots.
    await waitFor(() => expect(screen.getByTestId('probe-sky-island')).toHaveAttribute('data-resolved', 'classic'))
    expect(screen.getByTestId('probe-sky-island')).toHaveAttribute('data-error', 'yes')
    expect(screen.getByTestId('probe-sky-island')).toHaveAttribute('data-plate', CLASSIC_ENVIRONMENT_SURFACE.plateColor)
    await waitFor(() => expect(screen.queryByTestId('sky-world')).toBeNull())
    expect(useBrickStore.getState().toast).toBe(ENVIRONMENT_UNAVAILABLE_TOAST)
    // A different world is unaffected.
    await waitFor(() => expect(screen.getByTestId('probe-brick-valley')).toHaveAttribute('data-resolved', 'brick-valley'))
    expect(screen.getByTestId('probe-brick-valley')).toHaveAttribute('data-error', 'no')
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
