import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { play } from '../../core/index'
import type { Runtime } from '../../core/runtime'
import { HERO_KEYS, powerKeys } from '../builder/playRules'
import { builtInPowers } from '../powers/powers'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { PlayTouchControls, TOUCH_KEYS } from './PlayTouchControls'

afterEach(cleanup)

const power = (id: string) => builtInPowers().find((p) => p.id === id)!
const emptyWorld = { stage: { brickId: 'stage' }, targets: [], bricks: {} }

describe('touch buttons in Play', () => {
  it('press and release the keys the Hero reads, and let go of everything when Play stops', () => {
    const runtime = { pressKey: vi.fn(), releaseKey: vi.fn(), world: emptyWorld }
    const { getByRole, unmount } = render(<PlayTouchControls runtime={runtime as unknown as Runtime} />)
    fireEvent.pointerDown(getByRole('button', { name: 'Jump' }), { pointerId: 1 })
    expect(runtime.pressKey).toHaveBeenLastCalledWith('space')
    fireEvent.pointerUp(getByRole('button', { name: 'Jump' }), { pointerId: 1 })
    expect(runtime.releaseKey).toHaveBeenLastCalledWith('space')
    fireEvent.pointerDown(getByRole('button', { name: 'Run' }), { pointerId: 2 })
    expect(runtime.pressKey).toHaveBeenLastCalledWith('x')
    runtime.releaseKey.mockClear()
    unmount()
    expect(runtime.releaseKey).toHaveBeenCalledWith('x')
  })

  it('with no power that needs its own key there is no extra button', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', power('double-jump')) // reads space: Jump already presses it
    const { queryByRole } = render(<PlayTouchControls runtime={play(store.getState().project.design)} />)
    expect(queryByRole('group', { name: 'Power buttons' })).toBeNull()
  })

  it('Dash on the Hero gets a Dash button that holds z, and the Hero dashes', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', power('dash'))
    const runtime = play(store.getState().project.design)
    const hero = () => runtime.world.targets.find((t) => t.brickId === 'brick_hero' && !t.isClone)!
    const { getByRole, unmount } = render(<PlayTouchControls runtime={runtime} />)
    for (let i = 0; i < 30; i++) runtime.step() // land and settle
    const before = hero().x
    const dash = getByRole('button', { name: 'Dash (Z key)' })
    expect(dash.textContent).toBe('Dash')
    fireEvent.pointerDown(dash, { pointerId: 3 })
    expect(runtime.world.keysDown.has('z')).toBe(true)
    for (let i = 0; i < 4; i++) runtime.step()
    expect(Math.abs(hero().x - before)).toBeGreaterThan(10)
    fireEvent.pointerUp(dash, { pointerId: 3 })
    expect(runtime.world.keysDown.has('z')).toBe(false)
    fireEvent.pointerDown(dash, { pointerId: 4 })
    unmount()
    expect(runtime.world.keysDown.has('z')).toBe(false)
  })

  it('a switched-off Dash has no button', () => {
    const store = new StudioStore(createStarterProject())
    const snap = store.snapPower('brick_hero', power('dash'))!
    store.setPowerOn('brick_hero', snap.id, false)
    const { queryByRole } = render(<PlayTouchControls runtime={play(store.getState().project.design)} />)
    expect(queryByRole('button', { name: /Dash/ })).toBeNull()
  })
})

describe('keys a power reads', () => {
  it('Dash reads z; Double jump and Hop need no key of their own', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', power('dash'))
    store.snapPower('brick_hero', power('double-jump'))
    store.snapPower('brick_walker', power('hop'))
    expect(powerKeys(store.getState().project.design)).toEqual([{ key: 'z', power: 'Dash' }])
  })

  it('follows a kid who changes Dash to read c', () => {
    const store = new StudioStore(createStarterProject())
    store.snapPower('brick_hero', power('dash'))
    const ws = JSON.parse(JSON.stringify(store.getState().project.workspaces.brick_hero).replace('"KEY_OPTION":"z"', '"KEY_OPTION":"c"'))
    store.setWorkspace('brick_hero', ws)
    expect(powerKeys(store.getState().project.design)).toEqual([{ key: 'c', power: 'Dash' }])
  })

  it('only counts powers on bricks placed in the level', () => {
    const store = new StudioStore(createStarterProject())
    const id = store.addBrick('Rocket', { name: 'c1', width: 16, height: 16, rotationCenterX: 8, rotationCenterY: 8 })
    store.snapPower(id, power('dash'))
    expect(powerKeys(store.getState().project.design)).toEqual([])
    store.addCopy(id, 0, 0)
    expect(powerKeys(store.getState().project.design)).toEqual([{ key: 'z', power: 'Dash' }])
  })

  it('the Hero\'s own touch keys are never given a second button', () => {
    for (const key of Object.values(TOUCH_KEYS)) expect(HERO_KEYS.has(key!)).toBe(true)
  })
})
