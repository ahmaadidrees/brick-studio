import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { InviteSheet, inviteAudienceLabel, type InviteSheetProps } from './InviteSheet'
import type { ClassroomClassmate } from './contracts'

afterEach(cleanup)

const jayden: ClassroomClassmate = { id: 'student-jayden', displayName: 'Jayden' }
const maya: ClassroomClassmate = { id: 'student-maya', displayName: 'Maya' }
const zoe: ClassroomClassmate = { id: 'student-zoe', displayName: 'Zoe' }
const classmates = [jayden, maya, zoe]
const privateWorld: InviteSheetProps['world'] = { id: 'world-1', title: 'Lava Maze', visibility: 'private', classCanEdit: false }

function open(overrides: Partial<InviteSheetProps> = {}) {
  const props: InviteSheetProps = { world: privateWorld, className: 'Period 3', classmates, busy: false, onInvite: vi.fn(), onClose: vi.fn(), ...overrides }
  const view = render(<InviteSheet {...props} />)
  const dialog = screen.getByRole('dialog', { name: 'Who do you want to build with?' })
  const tile = (name: string) => within(dialog).getByRole('button', { name })
  const everyone = () => within(dialog).getByRole('button', { name: 'Everyone in class' })
  const lookSwitch = () => within(dialog).getByRole('switch', { name: 'Just let them look' })
  const primary = () => within(dialog).getByRole('button', { name: /^Invite |^Pick someone first$/ })
  return { ...view, props, dialog, tile, everyone, lookSwitch, primary }
}

it('describes the sheet, the class and the defaults: building, nobody picked yet', () => {
  const { dialog, lookSwitch, primary, everyone } = open()
  expect(dialog).toHaveAccessibleDescription('They get a note on their Worlds page and can jump into “Lava Maze” with you.')
  expect(within(dialog).getByText('Period 3 · 3 classmates')).toBeInTheDocument()
  expect(within(dialog).getByRole('group', { name: 'Period 3 · 3 classmates' }).querySelectorAll('button')).toHaveLength(3)
  expect(lookSwitch()).toHaveAttribute('aria-checked', 'false')
  expect(everyone()).toHaveAttribute('aria-pressed', 'false')
  expect(primary()).toHaveTextContent('Pick someone first')
  expect(primary()).toBeDisabled()
  expect(within(dialog).getByText('Your teacher can see it too.')).toBeInTheDocument()
  expect(within(dialog).queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
})

it('invites the picked classmates to build', () => {
  const { props, tile, primary } = open()
  fireEvent.click(tile('Jayden'))
  fireEvent.click(tile('Maya'))
  expect(tile('Jayden')).toHaveAttribute('aria-pressed', 'true')
  expect(primary()).toHaveTextContent('Invite Jayden and Maya and build')
  expect(primary()).toBeEnabled()
  fireEvent.click(primary())
  expect(props.onInvite).toHaveBeenCalledWith({ visibility: 'members', canEdit: true, members: [jayden.id, maya.id] })
})

it('invites everyone in class to look when the chip is pressed and the switch is on', () => {
  const { props, everyone, lookSwitch, primary } = open()
  fireEvent.click(everyone())
  expect(everyone()).toHaveAttribute('aria-pressed', 'true')
  expect(primary()).toHaveTextContent('Invite the class and build')
  fireEvent.click(lookSwitch())
  expect(lookSwitch()).toHaveAttribute('aria-checked', 'true')
  expect(primary()).toHaveTextContent('Invite the class to look')
  fireEvent.click(primary())
  expect(props.onInvite).toHaveBeenCalledWith({ visibility: 'class', canEdit: false })
})

it('keeps the primary button disabled and silent while nobody is chosen', () => {
  const { props, tile, primary } = open()
  fireEvent.click(primary())
  expect(props.onInvite).not.toHaveBeenCalled()
  fireEvent.click(tile('Zoe'))
  fireEvent.click(tile('Zoe'))
  expect(primary()).toHaveTextContent('Pick someone first')
  expect(primary()).toBeDisabled()
  fireEvent.click(primary())
  expect(props.onInvite).not.toHaveBeenCalled()
})

it('lets the Everyone chip override the picks, and a tile tap turns the chip back off', () => {
  const { tile, everyone, primary } = open()
  fireEvent.click(tile('Jayden'))
  fireEvent.click(everyone())
  expect(tile('Jayden')).toHaveAttribute('aria-pressed', 'false')
  expect(primary()).toHaveTextContent('Invite the class and build')
  fireEvent.click(tile('Maya'))
  expect(everyone()).toHaveAttribute('aria-pressed', 'false')
  expect(tile('Maya')).toHaveAttribute('aria-pressed', 'true')
  expect(primary()).toHaveTextContent('Invite Maya and build')
  fireEvent.click(tile('Jayden'))
  fireEvent.click(tile('Zoe'))
  expect(primary()).toHaveTextContent('Invite Maya and 2 more and build')
})

it('reopened on a members world it preloads the picks, the look-only switch and offers Stop sharing', () => {
  const onStopSharing = vi.fn()
  const { props, tile, lookSwitch, primary, dialog } = open({
    world: { ...privateWorld, visibility: 'members', classCanEdit: false, members: [jayden, zoe] },
    onStopSharing,
  })
  expect(tile('Jayden')).toHaveAttribute('aria-pressed', 'true')
  expect(tile('Maya')).toHaveAttribute('aria-pressed', 'false')
  expect(tile('Zoe')).toHaveAttribute('aria-pressed', 'true')
  expect(lookSwitch()).toHaveAttribute('aria-checked', 'true')
  expect(primary()).toHaveTextContent('Invite Jayden and Zoe to look')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Stop sharing' }))
  expect(onStopSharing).toHaveBeenCalledTimes(1)
  fireEvent.click(lookSwitch())
  fireEvent.click(primary())
  expect(props.onInvite).toHaveBeenCalledWith({ visibility: 'members', canEdit: true, members: [jayden.id, zoe.id] })
})

it('reopened on a class world it preloads the chip, and hides Stop sharing without a handler', () => {
  const { everyone, lookSwitch, primary, dialog } = open({ world: { ...privateWorld, visibility: 'class', classCanEdit: true } })
  expect(everyone()).toHaveAttribute('aria-pressed', 'true')
  expect(lookSwitch()).toHaveAttribute('aria-checked', 'false')
  expect(primary()).toHaveTextContent('Invite the class and build')
  expect(within(dialog).queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
})

it('never offers Stop sharing on a private world even with a handler, and reports loading, empty and failed rosters', () => {
  const { dialog, rerender } = open({ onStopSharing: vi.fn(), classmates: null })
  expect(within(dialog).queryByRole('button', { name: 'Stop sharing' })).not.toBeInTheDocument()
  expect(within(dialog).getByRole('status')).toHaveTextContent('Loading classmates…')
  expect(within(dialog).getByText('Period 3')).toBeInTheDocument()
  rerender(<InviteSheet world={privateWorld} className="Period 3" classmates={[]} busy={false} onInvite={vi.fn()} onClose={vi.fn()} />)
  expect(within(dialog).getByText('Nobody else is in Period 3 yet.')).toBeInTheDocument()
  expect(within(dialog).getByText('Period 3 · 0 classmates')).toBeInTheDocument()
  rerender(<InviteSheet world={privateWorld} className="Period 3" classmates={null} classmatesError="Could not load your class." busy={false} onInvite={vi.fn()} onClose={vi.fn()} />)
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Could not load your class.')
  // The whole-class choice still works without a roster.
  fireEvent.click(within(dialog).getByRole('button', { name: 'Everyone in class' }))
  expect(within(dialog).getByRole('button', { name: 'Invite the class and build' })).toBeEnabled()
})

it('closes from Cancel, the close button and Escape, and blocks everything while busy', () => {
  const { props, dialog, tile, lookSwitch, everyone, primary, rerender } = open()
  // The header close button and the footer Cancel both read "Cancel".
  const cancels = within(dialog).getAllByRole('button', { name: 'Cancel' })
  expect(cancels).toHaveLength(2)
  cancels.forEach(button => fireEvent.click(button))
  expect(props.onClose).toHaveBeenCalledTimes(2)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(props.onClose).toHaveBeenCalledTimes(3)
  fireEvent.click(tile('Jayden'))
  rerender(<InviteSheet {...props} busy />)
  expect(tile('Jayden')).toBeDisabled()
  expect(lookSwitch()).toBeDisabled()
  expect(everyone()).toBeDisabled()
  expect(within(dialog).getByRole('button', { name: 'Inviting…' })).toHaveAttribute('aria-busy', 'true')
  expect(primary).toThrow()
})

it('reads the audience back the way the toasts do', () => {
  expect(inviteAudienceLabel({ visibility: 'class', canEdit: true }, classmates)).toBe('the class')
  expect(inviteAudienceLabel({ visibility: 'members', canEdit: true, members: [] }, classmates)).toBe('classmates')
  expect(inviteAudienceLabel({ visibility: 'members', canEdit: true, members: [maya.id] }, classmates)).toBe('Maya')
  expect(inviteAudienceLabel({ visibility: 'members', canEdit: true, members: [maya.id, 'gone'] }, classmates)).toBe('Maya and a classmate')
  expect(inviteAudienceLabel({ visibility: 'members', canEdit: true, members: [jayden.id, maya.id, zoe.id] }, classmates)).toBe('Jayden and 2 more')
})
