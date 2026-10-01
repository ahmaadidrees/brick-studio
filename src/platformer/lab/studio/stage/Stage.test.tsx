import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('renders canvas and controls in Build mode', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)

    expect(screen.getByRole('toolbar', { name: 'Stage controls' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play simulation' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Brush tool/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Select tool/ })).toBeTruthy()
    expect(screen.getByText('BUILD')).toBeTruthy()
  })

  it('toggles mode to Play when Play button is clicked', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)

    const playBtn = screen.getByRole('button', { name: 'Play simulation' })
    fireEvent.click(playBtn)

    expect(store.getState().mode).toBe('play')
    expect(screen.getByRole('button', { name: 'Stop simulation' })).toBeTruthy()
    expect(screen.getByText('PLAY')).toBeTruthy()
  })

  it('shows KnobPanel with showInBuild variables when a copy is selected', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    store.selectCopy('c1')
    render(<Stage store={store} />)

    expect(screen.getByLabelText('Copy settings')).toBeTruthy()
    expect(screen.getByText('Hero')).toBeTruthy()
    expect(screen.getByText('Speed')).toBeTruthy()
    // Secret is showInBuild: false, so it must not be present
    expect(screen.queryByText('Secret')).toBeNull()

    // Stepper increases knob value
    const incBtn = screen.getByRole('button', { name: 'Increase Speed' })
    fireEvent.click(incBtn)
    expect(store.getState().project.design.copies[0].knobs?.speed).toBe(9)
  })

  it('deletes copy from KnobPanel delete button', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    store.selectCopy('c1')
    render(<Stage store={store} />)

    const delBtn = screen.getByRole('button', { name: 'Delete copy' })
    fireEvent.click(delBtn)

    expect(store.getState().project.design.copies.length).toBe(0)
    expect(store.getState().selectedCopyId).toBeNull()
  })

  it('Play shows a "camera follows" choice: whole level by default, switchable to follow brick', () => {
    const store = new StudioStore({ design: makeTestDesign(), workspaces: {} })
    render(<Stage store={store} />)
    expect(screen.queryByRole('group', { name: 'Camera follows' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Play simulation' }))
    const whole = screen.getByRole('button', { name: 'Camera shows the whole level' })
    const follow = screen.getByRole('button', { name: 'Camera follows the selected brick' })
    expect(whole.getAttribute('aria-pressed')).toBe('true')
    expect(follow.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(follow)
    expect(follow.getAttribute('aria-pressed')).toBe('true')
    expect(whole.getAttribute('aria-pressed')).toBe('false')
  })
})
