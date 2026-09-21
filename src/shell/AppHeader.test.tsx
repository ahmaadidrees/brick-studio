import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BRAND_NAME } from '../brand'
import { AppHeader, type AppHeaderEditorProps } from './AppHeader'
import type { ClassroomSessionState } from './useClassroomSession'

afterEach(cleanup)

const guest: ClassroomSessionState = { status: 'guest', signOut: async () => undefined, switchAccount: async () => undefined }
const student: ClassroomSessionState = {
  status: 'student',
  user: { id: 'u1', username: 'ava', rosterName: 'Ava Rodriguez', role: 'student', resetRequired: false },
  classes: [],
  className: 'Period 2',
  displayName: 'Ava R.',
  signOut: async () => undefined,
  switchAccount: async () => undefined,
}

function editorProps(overrides: Partial<AppHeaderEditorProps> = {}): AppHeaderEditorProps {
  return {
    variant: 'editor',
    onNewBuild: vi.fn(),
    onImportProject: vi.fn(),
    onExportProject: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenHelp: vi.fn(),
    onOpenWorldSetup: vi.fn(),
    onStartLiveWorld: vi.fn(),
    onSaveToAccount: vi.fn(),
    onGoHome: vi.fn(),
    onRequestMode: vi.fn(),
    mode: 'build',
    canExplore: true,
    saveStatus: { source: { kind: 'local' } },
    session: guest,
    ...overrides,
  }
}

describe('AppHeader landing and page', () => {
  it('landing: lockup links Home, navigation slot in the middle, chip in the corner', () => {
    render(<AppHeader variant="landing" session={guest} navigation={<nav aria-label={BRAND_NAME}><a href="#how">How it works</a></nav>} />)
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('link', { name: `${BRAND_NAME} Home` })).toHaveAttribute('href', '/')
    expect(within(banner).getByRole('navigation', { name: BRAND_NAME })).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/join?mode=signin')
    expect(banner.querySelectorAll('svg:not([aria-hidden="true"])')).toHaveLength(0)
  })

  it('page: title and actions beside the chip', () => {
    render(<AppHeader variant="page" title="My worlds" session={student} actions={<button type="button">New</button>} />)
    const banner = screen.getByRole('banner')
    expect(within(banner).getByText('My worlds')).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'New' })).toBeInTheDocument()
    expect(within(banner).getByRole('button', { name: 'Account: Ava R., Period 2' })).toBeInTheDocument()
  })
})

describe('AppHeader editor', () => {
  it('shows the neutral title for guest drafts, the This build menu and the tools', () => {
    const props = editorProps()
    render(<AppHeader {...props} />)
    const header = screen.getByRole('banner', { name: 'Studio toolbar' })
    expect(within(header).getByText('My build')).toBeInTheDocument()
    expect(within(header).queryByRole('button', { name: 'Rename world' })).toBeNull()
    expect(within(header).getByRole('status')).toHaveTextContent('This browser only')

    fireEvent.click(within(header).getByRole('link', { name: `${BRAND_NAME} Home` }))
    expect(props.onGoHome).toHaveBeenCalledTimes(1)

    fireEvent.click(within(header).getByRole('button', { name: 'Scene' }))
    expect(props.onOpenWorldSetup).toHaveBeenCalledWith('environment')
    fireEvent.click(within(header).getByRole('button', { name: 'Character' }))
    expect(props.onOpenWorldSetup).toHaveBeenCalledWith('character')
    fireEvent.click(within(header).getByRole('button', { name: 'Build together' }))
    expect(props.onStartLiveWorld).toHaveBeenCalledTimes(1)

    fireEvent.click(within(header).getByRole('button', { name: 'This build' }))
    const menu = screen.getByRole('menu', { name: 'This build' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.getAttribute('aria-labelledby') && document.getElementById(item.getAttribute('aria-labelledby')!)?.textContent)).toEqual([
      'Download build', 'Import build', 'New build', 'Settings', 'Help',
    ])
    expect(within(menu).getByRole('menuitem', { name: 'Download build' })).toHaveAccessibleDescription('Save a .brickstudio.json file')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Download build' }))
    expect(props.onExportProject).toHaveBeenCalledTimes(1)
    fireEvent.click(within(header).getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }))
    expect(props.onOpenSettings).toHaveBeenCalledTimes(1)
    fireEvent.click(within(header).getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }))
    expect(props.onOpenHelp).toHaveBeenCalledTimes(1)
    fireEvent.click(within(header).getByRole('button', { name: 'This build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'New build' }))
    expect(props.onNewBuild).toHaveBeenCalledTimes(1)
  })

  it('imports a chosen file through the hidden picker', async () => {
    const props = editorProps()
    render(<AppHeader {...props} />)
    const input = screen.getByLabelText(`Choose ${BRAND_NAME} project file`) as HTMLInputElement
    const file = new File(['{}'], 'castle.brickstudio.json', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(props.onImportProject).toHaveBeenCalledWith(file)
  })

  it('account worlds: title, pencil and Rename open the dialog and submit the new name', async () => {
    const onRenameWorld = vi.fn(async () => undefined)
    render(<AppHeader {...editorProps({ worldTitle: 'Desk Castle', onRenameWorld, saveStatus: { source: { kind: 'cloud', status: 'saved' } } })} />)
    expect(screen.getByText('Desk Castle')).toBeInTheDocument()
    const pencil = screen.getByRole('button', { name: 'Rename world' })
    pencil.focus()
    fireEvent.click(pencil)
    const dialog = screen.getByRole('dialog', { name: 'Rename world' })
    const field = within(dialog).getByLabelText('World name') as HTMLInputElement
    expect(field.value).toBe('Desk Castle')
    fireEvent.change(field, { target: { value: 'Sky Fort' } })
    fireEvent.submit(field.closest('form')!)
    expect(onRenameWorld).toHaveBeenCalledWith('Sky Fort')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(pencil)

    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
  })

  it('mode switch: Explore disabled with the reason until a brick exists; requests the other mode', () => {
    const onRequestMode = vi.fn()
    const { rerender } = render(<AppHeader {...editorProps({ canExplore: false, onRequestMode })} />)
    const group = screen.getByRole('radiogroup', { name: 'Studio mode' })
    expect(within(group).getByRole('radio', { name: 'Explore' })).toBeDisabled()
    expect(group).toHaveAccessibleDescription('Place a brick first, then explore.')
    expect(within(group).getByRole('radio', { name: 'Build' })).toBeChecked()

    rerender(<AppHeader {...editorProps({ canExplore: true, onRequestMode })} />)
    fireEvent.click(within(group).getByRole('radio', { name: 'Explore' }))
    expect(onRequestMode).toHaveBeenCalledWith('explore')
    rerender(<AppHeader {...editorProps({ canExplore: true, onRequestMode, mode: 'explore' })} />)
    expect(within(group).getByRole('radio', { name: 'Explore' })).toBeChecked()
    fireEvent.click(within(group).getByRole('radio', { name: 'Build' }))
    expect(onRequestMode).toHaveBeenCalledWith('build')
  })

  it('live rooms: room title, People headcount, locked modes for guests, no Import / New build', () => {
    const onOpenPeople = vi.fn()
    render(<AppHeader {...editorProps({
      livePolicy: { connection: 'online', isOwner: false, roomTitle: 'Team Red', peopleCount: 4, onOpenPeople },
      saveStatus: { source: { kind: 'live', connection: 'online' } },
    })} />)
    expect(screen.getByText('Team Red')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'People, 4 here' }))
    expect(onOpenPeople).toHaveBeenCalledTimes(1)
    const group = screen.getByRole('radiogroup', { name: 'Studio mode' })
    expect(within(group).getByRole('radio', { name: 'Build' })).toBeDisabled()
    expect(within(group).getByRole('radio', { name: 'Explore' })).toBeDisabled()
    expect(group).toHaveAccessibleDescription('The room owner switches between Build and Explore for everyone.')
    fireEvent.click(screen.getByRole('button', { name: 'This build' }))
    expect(screen.getByRole('menuitem', { name: 'Import build' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'New build' })).toBeDisabled()
  })

  it('the owner of an online room keeps both modes', () => {
    render(<AppHeader {...editorProps({ livePolicy: { connection: 'online', isOwner: true }, saveStatus: { source: { kind: 'live', connection: 'online' } } })} />)
    const group = screen.getByRole('radiogroup', { name: 'Studio mode' })
    expect(within(group).getByRole('radio', { name: 'Build' })).toBeEnabled()
    expect(within(group).getByRole('radio', { name: 'Explore' })).toBeEnabled()
  })

  it('signed-in students get the account menu with Save this build to my account', () => {
    const props = editorProps({ session: student })
    render(<AppHeader {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Account: Ava R., Period 2' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save this build to my account' }))
    expect(props.onSaveToAccount).toHaveBeenCalledTimes(1)
  })
})
