import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BrickDef, LevelDesign } from '../../core/contracts'
import { costumeFromImage, imageFromRows } from '../pixels'
import { Stage } from '../Stage'
import { StudioStore } from '../store'

afterEach(() => {
  cleanup()
})

function makeTestBrick(id: string, name: string): BrickDef {
  return {
    id,
    name,
    costumes: [
      costumeFromImage(
        'costume1',
        imageFromRows(['####', '####', '####', '####'], { '#': '#336699' }),
      ),
    ],
    sounds: [],
    program: {
      scripts: [],
      procedures: [],
      variables: [
        { id: 'speed', name: 'Speed', value: 5, showInBuild: true },
        { id: 'secret', name: 'Secret', value: 10, showInBuild: false },
      ],
      lists: [],
    },
  }
}

function makeTestDesign(): LevelDesign {
  const heroBrick = makeTestBrick('hero', 'Hero')
  return {
    id: 'test-lvl',
    name: 'Test Level',
    bounds: { left: 0, right: 960, bottom: 0, top: 360 },
    stage: {
      id: 'stage',
      name: 'Stage',
      costumes: [],
      sounds: [],
      program: { scripts: [], procedures: [], variables: [], lists: [] },
    },
    bricks: [heroBrick],
    copies: [
      { id: 'c1', brickId: 'hero', x: 100, y: 100, knobs: { speed: 8 } },
    ],
    seed: 42,
  }
}

describe('Stage Component', () => {
  it('has no toolbar of its own in Build: just the view tools (the builder chrome replaces the rest)', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)

    expect(screen.getByRole('toolbar', { name: 'Stage view' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset view to fit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Brush tool/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Select tool/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Play simulation' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Green flag/ })).toBeNull()
    // the old knob card is the builder's See inside card now
    expect(screen.queryByLabelText('Copy settings')).toBeNull()
  })

  it('Play (started from the store) shows pause/restart and the camera choice; Stop hides them', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)

    act(() => store.play())
    expect(screen.queryByRole('button', { name: /Green flag/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause level' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restart level' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Camera follows' })).toBeTruthy()
    act(() => store.stop())
    expect(screen.queryByRole('button', { name: /Green flag/ })).toBeNull()
  })

  it('Play shows a "camera follows" choice: Follow the Hero by default, switchable to whole level', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)
    expect(screen.queryByRole('group', { name: 'Camera follows' })).toBeNull()

    act(() => store.play())
    const whole = screen.getByRole('button', { name: 'Camera shows the whole level' })
    const follow = screen.getByRole('button', { name: 'Follow the Hero' })
    expect(whole.getAttribute('aria-pressed')).toBe('false')
    expect(follow.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(whole)
    expect(follow.getAttribute('aria-pressed')).toBe('false')
    expect(whole.getAttribute('aria-pressed')).toBe('true')
  })

  it('Pause holds the same run and Restart makes a fresh one without leaving Play', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)
    act(() => store.play())
    const original = store.getState().runtime
    fireEvent.click(screen.getByRole('button', { name: 'Pause level' }))
    expect(store.getState().previewPaused).toBe(true)
    expect(store.getState().runtime).toBe(original)
    fireEvent.click(screen.getByRole('button', { name: 'Play level' }))
    expect(store.getState().previewPaused).toBe(false)
    expect(store.getState().runtime).toBe(original)
    fireEvent.click(screen.getByRole('button', { name: 'Restart level' }))
    expect(store.getState().runtime).not.toBe(original)
    expect(store.getState().mode).toBe('play')
  })

  it('preview keys reach the Hero only in the stage and release when focus leaves', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    store.openCode('hero')
    render(<><Stage store={store} /><input aria-label="Editor field" /></>)
    const stage = screen.getByLabelText('Level Stage')
    const runtime = store.getState().runtime!
    fireEvent.keyDown(screen.getByLabelText('Editor field'), { key: 'ArrowRight' })
    expect(runtime.world.keysDown.has('right arrow')).toBe(false)
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(runtime.world.keysDown.has('right arrow')).toBe(true)
    fireEvent.blur(stage)
    expect(runtime.world.keysDown.has('right arrow')).toBe(false)
  })

  it('Delete removes the selected copy from the stage, and the arrow keys nudge it by 8', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    store.selectCopy('c1')
    render(<Stage store={store} />)
    const stage = screen.getByLabelText('Level Stage')
    fireEvent.keyDown(stage, { key: 'ArrowRight' })
    expect(store.getState().project.design.copies[0].x).toBe(108)
    fireEvent.keyDown(stage, { key: 'Delete' })
    expect(store.getState().project.design.copies).toHaveLength(0)
  })
})
