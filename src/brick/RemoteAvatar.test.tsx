import { act } from 'react'
import { createRoot, extend, type RootStore } from '@react-three/fiber'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import type { RemoteRaceAvatar } from './BrickStudioScene'
import { RemoteAvatar } from './RemoteAvatar'

extend({ Group: THREE.Group, Mesh: THREE.Mesh })

const roots: ReturnType<typeof createRoot>[] = []
afterEach(async () => {
  await act(async () => { roots.splice(0).forEach(root => root.unmount()) })
})

async function renderAvatar(overrides: Partial<RemoteRaceAvatar> = {}) {
  let avatar: RemoteRaceAvatar = {
    id: 'builder', color: '#ff8844', position: [1, 2, 3],
    facingYaw: 0, horizontalSpeed: 0, grounded: true, ...overrides,
  }
  const root = createRoot(document.createElement('canvas'))
  roots.push(root)
  // Keep the real R3F reconciler, Three objects, and avatar animation. Only GPU
  // drawing is stubbed: a prop-driven position reset must remain observable.
  await root.configure({
    frameloop: 'never',
    size: { width: 800, height: 600, top: 0, left: 0 },
    gl: {
      render: vi.fn(), setSize: vi.fn(), setPixelRatio: vi.fn(),
      xr: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    } as unknown as THREE.WebGLRenderer,
  })
  let store!: RootStore
  const update = async (changes: Partial<RemoteRaceAvatar>) => {
    avatar = { ...avatar, ...changes }
    await act(async () => { store = root.render(<RemoteAvatar avatar={avatar} compact />) })
  }
  await update({})
  const group = store.getState().scene.children[0] as THREE.Group
  let elapsed = 0
  const frame = (delta = 1 / 60) => {
    elapsed += delta
    store.getState().advance(elapsed)
  }
  return { group, frame, update }
}

describe('remote avatar rendering', () => {
  it('keeps its rendered position between packets and interpolates without snapping', async () => {
    const { group, frame, update } = await renderAvatar()
    expect(group.position.toArray()).toEqual([1, 2, 3])
    await update({ position: [2, 2, 3], horizontalSpeed: 1 })
    expect(group.position.x).toBe(1)
    frame()
    expect(group.position.x).toBeGreaterThan(1)
    expect(group.position.x).toBeLessThan(2)
    const previousX = group.position.x
    await update({ position: [3, 2, 3] })
    expect(group.position.x).toBe(previousX)
    frame()
    expect(group.position.x).toBeGreaterThan(previousX)
    expect(group.position.x).toBeLessThan(3)
  })

  it('settles exactly at the last idle position and holds it through profile updates', async () => {
    const { group, frame, update } = await renderAvatar()
    await update({ position: [2, 2, 3], horizontalSpeed: 0 })
    for (let i = 0; i < 90; i++) frame()
    expect(group.position.toArray()).toEqual([2, 2, 3])
    await update({ name: 'New name', color: '#4488ff' })
    frame()
    expect(group.position.toArray()).toEqual([2, 2, 3])
  })

  it('catches up on resume and then smoothly follows new packets', async () => {
    const { group, frame, update } = await renderAvatar()
    await update({ position: [9, 2, 3] })
    frame(5)
    expect(group.position.toArray()).toEqual([9, 2, 3])
    await update({ position: [10, 2, 3] })
    expect(group.position.x).toBe(9)
    frame()
    expect(group.position.x).toBeGreaterThan(9)
    expect(group.position.x).toBeLessThan(10)
  })

  it('preserves shortest-arc character turning across the yaw wrap', async () => {
    const { group, frame, update } = await renderAvatar({ facingYaw: Math.PI - 0.1 })
    const facing = group.children[0].children[0]
    frame()
    const initial = facing.rotation.y
    await update({ facingYaw: -Math.PI + 0.1 })
    frame()
    expect(facing.rotation.y).toBeGreaterThan(initial)
    expect(facing.rotation.y - initial).toBeLessThan(0.1)
    for (let i = 0; i < 60; i++) frame()
    expect(facing.rotation.y).toBeCloseTo(Math.PI + 0.1, 3)
  })
})
