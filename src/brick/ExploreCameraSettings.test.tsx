import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ExploreCameraSettings } from './ExploreCameraSettings'
import { useBrickStore } from './store'
import { exploreKeyboardBlocked } from './explorePreferences'
afterEach(() => { cleanup(); useBrickStore.setState(useBrickStore.getInitialState()); localStorage.clear() })
it('changes local preferences without touching the world or camera pose', () => {
  useBrickStore.setState({ touchYaw: 1.2, touchPitch: 0.4 })
  const document = useBrickStore.getState().getDocumentSnapshot()
  render(<ExploreCameraSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.change(screen.getByLabelText('Explore camera behavior'), { target: { value: 'free-look' } })
  fireEvent.change(screen.getByLabelText('Explore keyboard controls'), { target: { value: 'arrow-camera' } })
  expect(useBrickStore.getState()).toMatchObject({ exploreCameraMode: 'free-look', exploreKeyboardMode: 'arrow-camera', touchYaw: 1.2, touchPitch: 0.4 })
  expect(useBrickStore.getState().getDocumentSnapshot()).toEqual(document)
  expect(exploreKeyboardBlocked(screen.getByLabelText('Explore keyboard controls'))).toBe(true)
})
it('recenter faces behind the current character instead of a fixed world heading', () => {
  useBrickStore.setState({ exploreFacingYaw: 0.7, touchYaw: 2 })
  useBrickStore.getState().recenterCamera()
  expect(useBrickStore.getState().touchYaw).toBe(0.7)
})
it('blocks background controls while a modal is open', () => {
  render(<div role="dialog" aria-modal="true">Settings</div>)
  expect(exploreKeyboardBlocked(document.body)).toBe(true)
})

it('opens a modal, traps focus, closes with Escape and restores the trigger', () => {
  render(<ExploreCameraSettings />)
  const trigger = screen.getByRole('button', { name: 'Settings' })
  trigger.focus()
  fireEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Settings' })
  expect(dialog).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'Close settings' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger).toHaveFocus()
})
it('applies and remembers the existing reduced-motion setting', () => {
  render(<ExploreCameraSettings />)
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  fireEvent.change(screen.getByLabelText('Animation preference'), { target: { value: 'reduced' } })
  expect(useBrickStore.getState().reducedMotion).toBe(true)
  expect(localStorage.getItem('brick-studio-motion-preference-v1')).toBe('reduced')
  fireEvent.click(screen.getByRole('button', { name: 'Done' }))
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
  expect(screen.getByLabelText('Animation preference')).toHaveValue('reduced')
})
