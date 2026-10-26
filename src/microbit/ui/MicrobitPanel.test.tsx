import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ASSIGNMENTS, IDLE_BOARD } from '../assign'
import { useMicrobit } from '../store'
import { MicrobitButton } from './MicrobitButton'
import { MicrobitPanel } from './MicrobitPanel'

beforeEach(() => {
  useMicrobit.setState({ panelOpen: true, status: 'idle', error: '', hello: false, mode: 'platformer', board: IDLE_BOARD, assignments: { ...useMicrobit.getState().assignments, platformer: { ...DEFAULT_ASSIGNMENTS.platformer } } })
})
afterEach(cleanup)

describe('MicrobitPanel', () => {
  it('changing a select updates the assignments', () => {
    render(<MicrobitPanel />)
    fireEvent.change(screen.getByLabelText('Button A'), { target: { value: 'run' } })
    expect(useMicrobit.getState().assignments.platformer.a).toBe('run')
  })

  it('holding virtual A sets the pin and releasing clears it', () => {
    render(<MicrobitPanel />)
    const a = screen.getByRole('button', { name: 'Press Button A' })
    fireEvent.pointerDown(a)
    expect(useMicrobit.getState().board.pins.a).toBe(true)
    fireEvent.pointerUp(a)
    expect(useMicrobit.getState().board.pins.a).toBe(false)
  })

  it('says so when the browser cannot connect over USB', () => {
    act(() => useMicrobit.setState({ status: 'unsupported' }))
    render(<MicrobitPanel />)
    expect(screen.getByText(/can't connect over USB/)).toBeTruthy()
  })

  it('offers to install the remote when the browser has WebUSB, and the file otherwise', () => {
    render(<MicrobitPanel />)
    expect(screen.queryByRole('button', { name: 'Install the remote program' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Get the remote program' })).toBeTruthy()
    cleanup()
    Object.defineProperty(navigator, 'usb', { value: {}, configurable: true })
    try {
      render(<MicrobitPanel />)
      expect(screen.getByRole('button', { name: 'Install the remote program' })).toBeTruthy()
      expect(screen.getByRole('link', { name: 'download the file' })).toBeTruthy()
    } finally {
      delete (navigator as { usb?: unknown }).usb
    }
  })

  it('links to the block editor in a new tab', () => {
    render(<MicrobitPanel />)
    const link = screen.getByRole('link', { name: 'Code your micro:bit' })
    expect(link.getAttribute('href')).toBe('/micro/')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('inside Scrub, finds micro:bits over Bluetooth instead of USB', () => {
    ;(self as unknown as { Scratch?: unknown }).Scratch = { ScratchLinkSafariSocket: class {} }
    try {
      render(<MicrobitPanel />)
      expect(screen.getByRole('button', { name: 'Find micro:bits' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Connect micro:bit' })).toBeNull()
      expect(screen.getByRole('link', { name: 'scratch.mit.edu/microbit' })).toBeTruthy()
    } finally {
      delete (self as unknown as { Scratch?: unknown }).Scratch
    }
  })

  it('closes with Escape and the button toggles it', () => {
    render(<><MicrobitButton /><MicrobitPanel /></>)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useMicrobit.getState().panelOpen).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Remote' }))
    expect(useMicrobit.getState().panelOpen).toBe(true)
  })
})
