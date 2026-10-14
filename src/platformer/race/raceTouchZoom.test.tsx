import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Camera } from '../game/camera'
import { Input } from '../input/input'
import { RaceTouchControls } from './RaceTouchControls'
import { RaceZoom } from './RaceZoom'

afterEach(cleanup)

describe('driving on a touch screen', () => {
  it('Gas, Brake and the item button press the same actions as the arrow keys and Space', () => {
    const input = new Input()
    render(<RaceTouchControls input={input} items itemName="Bouncy ball" />)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Gas' }), { pointerId: 1 })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Use Bouncy ball' }), { pointerId: 2 })
    let f = input.frame()
    expect([f.up, f.down, f.jumpPressed]).toEqual([true, false, true])
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Gas' }), { pointerId: 1 })
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Brake' }), { pointerId: 3 })
    f = input.frame()
    expect([f.up, f.down]).toEqual([false, true])
  })

  it('the steering pad steers left or right by where the thumb is, and lets go', () => {
    const input = new Input()
    render(<RaceTouchControls input={input} items={false} />)
    expect(screen.queryByRole('button', { name: /Use/ })).toBeNull()
    const pad = screen.getByRole('group', { name: /Steer/ })
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.pointerDown(pad, { pointerId: 1, clientX: 20, clientY: 50 })
    expect([input.frame().left, input.frame().right]).toEqual([true, false])
    fireEvent.pointerMove(pad, { pointerId: 1, clientX: 180, clientY: 50, buttons: 1 })
    expect([input.frame().left, input.frame().right]).toEqual([false, true])
    fireEvent.pointerUp(pad, { pointerId: 1 })
    expect([input.frame().left, input.frame().right]).toEqual([false, false])
  })
})

describe('seeing the whole track while building', () => {
  it('zooms out in steps, then all the way with Whole track, and back close up', () => {
    const onZoom = vi.fn()
    const { rerender } = render(<RaceZoom zoom={1} max={3} onZoom={onZoom} />)
    expect(screen.getByRole('button', { name: 'Zoom in' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(onZoom).toHaveBeenLastCalledWith(1.4)
    fireEvent.click(screen.getByRole('button', { name: /Whole track/ }))
    expect(onZoom).toHaveBeenLastCalledWith(3)
    rerender(<RaceZoom zoom={3} max={3} onZoom={onZoom} />)
    expect(screen.getByRole('button', { name: 'Zoom out' })).toHaveProperty('disabled', true)
    fireEvent.click(screen.getByRole('button', { name: /Close up/ }))
    expect(onZoom).toHaveBeenLastCalledWith(1)
  })

  it('a track that fits sits in the middle of the free space', () => {
    const c = new Camera()
    c.centerY = true
    c.bottomPad = 40
    c.pan(0, 0, 1200, 800, 1000, 600)
    // Building keeps a tile clear above the bar as well.
    expect(c.y).toBe((600 - 800 + 40 + 16) / 2)
    c.centerY = false
    c.pan(0, 0, 1200, 800, 1000, 600)
    expect(c.y).not.toBe((600 - 800 + 40 + 16) / 2)
  })
})
