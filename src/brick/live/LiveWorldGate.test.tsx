import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LiveWorldGate } from './LiveWorldGate'

afterEach(cleanup)

it('links classroom sign-in straight to the sign-in page, not through the 3D builder', () => {
  render(<LiveWorldGate kind="join" onSubmit={vi.fn()} />)
  expect(screen.getByRole('link', { name: /Classroom sign in/ })).toHaveAttribute('href', '/join?mode=signin')
})
