import { act } from 'react'
import { createRoot, extend, type RootStore } from '@react-three/fiber'
import { waitFor } from '@testing-library/react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MotionSnapshotRef } from '../avatarMotion'
import type { CharacterVisualProps } from '../characters/types'
import type { CharacterId } from '../types'

extend({ Group: THREE.Group, Mesh: THREE.Mesh })

const heroRenders = vi.hoisted(() => vi.fn())

vi.mock('../BlockAvatar', () => ({
  BlockAvatar: () => <group name="classic-avatar" />,
}))

vi.mock('../characters/index', () => {
  const descriptor = {
    id: 'cc0-hero',
    name: 'Robot Hero',
    description: 'Test hero',
    previewKey: 'character:cc0-hero',
    customizable: true,
  }
  return {
    ADDITIVE_CHARACTER_BY_ID: new Map([[
      'cc0-hero',
      {
        descriptor,
        load: async () => ({
          descriptor,
          // Mirrors drei's useGLTF once its fetch has rejected: every render rethrows.
          Avatar: (props: CharacterVisualProps) => {
            heroRenders(props)
            throw new Error('Could not load http://localhost/brick-hero.glb: 404 Not Found')
          },
        }),
      },
    ]]),
  }
})

import { useBrickStore } from '../store'
import { CHARACTER_UNAVAILABLE_TOAST, RuntimeCharacterAvatar } from './character'

const motion = { current: {} } as MotionSnapshotRef
const initialState = useBrickStore.getInitialState()
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  heroRenders.mockClear()
  useBrickStore.setState({ ...initialState }, true)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(async () => {
  await act(async () => { roots.splice(0).forEach((root) => root.unmount()) })
  vi.restoreAllMocks()
})

/** Same shape as RemoteAvatar.test.tsx: the real R3F reconciler with only GPU drawing stubbed. */
async function renderExplorer(characterId: CharacterId) {
  const root = createRoot(document.createElement('canvas'))
  roots.push(root)
  await root.configure({
    frameloop: 'never',
    size: { width: 800, height: 600, top: 0, left: 0 },
    gl: {
      render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(),
      xr: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    } as unknown as THREE.WebGLRenderer,
  })
  let store!: RootStore
  const update = async (nextId: CharacterId) => {
    await act(async () => {
      store = root.render(
        <group name="explorer">
          <mesh name="capsule" />
          <RuntimeCharacterAvatar characterId={nextId} motion={motion} compact />
        </group>,
      )
    })
  }
  await update(characterId)
  const scene = () => store.getState().scene
  return { scene, update }
}

describe('runtime character boundary', () => {
  it('keeps the explorer mounted on the classic avatar when the selected character throws', async () => {
    const { scene } = await renderExplorer('cc0-hero')

    await waitFor(() => expect(heroRenders).toHaveBeenCalled())
    await waitFor(() => expect(useBrickStore.getState().toast).toBe(CHARACTER_UNAVAILABLE_TOAST))

    const explorer = scene().getObjectByName('explorer')
    expect(explorer).toBeInstanceOf(THREE.Group)
    expect(explorer?.getObjectByName('capsule')).toBeInstanceOf(THREE.Mesh)
    expect(explorer?.getObjectByName('classic-avatar')).toBeInstanceOf(THREE.Group)

    // A deterministic failure must not bounce between the hero and the fallback.
    const attempts = heroRenders.mock.calls.length
    for (let round = 0; round < 3; round += 1) await act(async () => {})
    expect(heroRenders.mock.calls.length).toBe(attempts)
    expect(scene().getObjectByName('classic-avatar')).toBeInstanceOf(THREE.Group)
  })

  it('retries only when a different character resolves, then falls back again', async () => {
    const { scene, update } = await renderExplorer('cc0-hero')
    await waitFor(() => expect(heroRenders).toHaveBeenCalled())
    await waitFor(() => expect(useBrickStore.getState().toast).toBe(CHARACTER_UNAVAILABLE_TOAST))
    const attempts = heroRenders.mock.calls.length

    await update('classic')
    expect(scene().getObjectByName('classic-avatar')).toBeInstanceOf(THREE.Group)
    expect(heroRenders.mock.calls.length).toBe(attempts)

    useBrickStore.setState({ toast: null })
    await update('cc0-hero')
    await waitFor(() => expect(heroRenders.mock.calls.length).toBeGreaterThan(attempts))
    await waitFor(() => expect(useBrickStore.getState().toast).toBe(CHARACTER_UNAVAILABLE_TOAST))
    expect(scene().getObjectByName('capsule')).toBeInstanceOf(THREE.Mesh)
    expect(scene().getObjectByName('classic-avatar')).toBeInstanceOf(THREE.Group)
  })

  it('lets a caller replace the default toast with its own failure handler', async () => {
    const onLoadError = vi.fn()
    const root = createRoot(document.createElement('canvas'))
    roots.push(root)
    await root.configure({
      frameloop: 'never',
      size: { width: 800, height: 600, top: 0, left: 0 },
      gl: {
        render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(),
        xr: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
      } as unknown as THREE.WebGLRenderer,
    })
    await act(async () => {
      root.render(<RuntimeCharacterAvatar characterId="cc0-hero" motion={motion} onLoadError={onLoadError} />)
    })

    await waitFor(() => expect(onLoadError).toHaveBeenCalledTimes(1))
    expect(onLoadError.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(useBrickStore.getState().toast).toBe(initialState.toast)
  })
})
