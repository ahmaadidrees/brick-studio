import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { browserClassroomClient } from './client'
import TeacherGoogleCallback from './TeacherGoogleCallback'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('Try again goes straight to teacher sign-in, not through the 3D builder', async () => {
  vi.spyOn(browserClassroomClient, 'finishGoogleTeacher').mockRejectedValue(new Error('This account is not configured as a teacher.'))
  render(<TeacherGoogleCallback />)
  expect(await screen.findByRole('alert')).toHaveTextContent('not configured as a teacher')
  expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute('href', '/join?mode=teacher')
  expect(screen.getByRole('link', { name: 'Keep building' })).toHaveAttribute('href', '/build')
})
