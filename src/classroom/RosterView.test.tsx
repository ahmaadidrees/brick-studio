import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ClassroomClass, ClassroomStudent } from './contracts'
import { ManageStudentForm, RosterSection } from './RosterView'

afterEach(cleanup)

const CLASS: ClassroomClass = {
  id: 'class-period-3', name: 'Period 3 Makers', loginCode: 'MAKERS3', enrollmentOpen: true, collaborationOpen: true,
  showNamesOnJoin: true, studentsCanShare: true, buildingNow: 3, teacherName: 'Mr. Idrees',
}
const STUDENTS: ClassroomStudent[] = [
  { id: 'student-ava', username: 'ava_builds', rosterName: 'Ava Rivera', suspended: false, resetRequired: false },
  { id: 'student-ben', username: 'ben_k', rosterName: 'Ben Kim', suspended: true, resetRequired: false },
]

function draw(overrides: Partial<Parameters<typeof RosterSection>[0]> = {}) {
  const onManage = vi.fn()
  const onToggleSuspend = vi.fn()
  const onSearch = vi.fn()
  const onViewCodes = vi.fn()
  render(<RosterSection
    currentClass={CLASS}
    students={STUDENTS}
    loading={false}
    search=""
    busy={false}
    onSearch={onSearch}
    onManage={onManage}
    onViewCodes={onViewCodes}
    actions="menu"
    onToggleSuspend={onToggleSuspend}
    {...overrides}
  />)
  return { onManage, onToggleSuspend, onSearch, onViewCodes }
}

it('replaces the inline buttons with a single ⋯ menu per row', async () => {
  draw()
  expect(screen.queryByRole('button', { name: 'Reset password for Ava Rivera' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Manage Ava Rivera' })).toHaveAttribute('aria-haspopup', 'menu')
})

it('opens the menu and calls onManage for Edit student', async () => {
  const { onManage } = draw()
  fireEvent.click(screen.getByRole('button', { name: 'Manage Ava Rivera' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit student' }))
  expect(onManage).toHaveBeenCalledWith(STUDENTS[0])
})

it('opens the menu and calls onManage with the password focus for Reset password', async () => {
  const { onManage } = draw()
  fireEvent.click(screen.getByRole('button', { name: 'Manage Ava Rivera' }))
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Reset password' }))
  expect(onManage).toHaveBeenCalledWith(STUDENTS[0], 'password')
})

it('offers Suspend for an active student and Reactivate for a suspended one', async () => {
  const { onToggleSuspend } = draw()

  fireEvent.click(screen.getByRole('button', { name: 'Manage Ava Rivera' }))
  expect(await screen.findByRole('menuitem', { name: 'Suspend' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Suspend' }))
  expect(onToggleSuspend).toHaveBeenCalledWith(STUDENTS[0])

  fireEvent.click(screen.getByRole('button', { name: 'Manage Ben Kim' }))
  expect(await screen.findByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reactivate' }))
  expect(onToggleSuspend).toHaveBeenCalledWith(STUDENTS[1])
})

it('hides Suspend/Reactivate when onToggleSuspend is not given', async () => {
  draw({ onToggleSuspend: undefined })
  fireEvent.click(screen.getByRole('button', { name: 'Manage Ava Rivera' }))
  const menu = await screen.findByRole('menu', { name: 'Manage Ava Rivera' })
  expect(within(menu).queryByRole('menuitem', { name: /Suspend|Reactivate/ })).not.toBeInTheDocument()
})

it('still renders the inline buttons when actions is left at the default', async () => {
  draw({ actions: 'buttons' })
  expect(screen.getByRole('button', { name: 'Reset password for Ava Rivera' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Manage Ava Rivera' })).not.toHaveAttribute('aria-haspopup')
})

it('Generate fills in an easy word-and-number password and shows it, so the teacher can read it out', () => {
  render(<ManageStudentForm student={STUDENTS[0]} busy={false} headingRef={{ current: null }} onSubmit={vi.fn()} onToggleSuspend={vi.fn()} onCancel={vi.fn()} />)
  const field = screen.getByLabelText('Temporary password') as HTMLInputElement
  expect(field).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Generate temporary password' }))
  expect(field.value).toMatch(/^[a-z]{4,6}[2-9]{3}$/)
  expect(field).toHaveAttribute('type', 'text')
  expect(field).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Hide temporary password' })).toHaveAttribute('aria-pressed', 'true')
})

it('Generate never makes the password the same as the username being saved', () => {
  const onSubmit = vi.fn()
  render(<ManageStudentForm student={STUDENTS[0]} busy={false} headingRef={{ current: null }} onSubmit={onSubmit} onToggleSuspend={vi.fn()} onCancel={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Generate temporary password' }))
  const password = (screen.getByLabelText('Temporary password') as HTMLInputElement).value
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(onSubmit).toHaveBeenCalledWith({ username: 'ava_builds', rosterName: 'Ava Rivera', temporaryPassword: password })
})
