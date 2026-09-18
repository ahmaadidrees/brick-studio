import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ClassroomClass, ClassroomStudent } from './contracts'
import { RosterSection } from './RosterView'

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
