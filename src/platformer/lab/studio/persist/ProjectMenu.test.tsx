import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { clearStorageNotice, getStorageNotice, setStorageNotice } from './notice'
import { StorageNoticeBar } from './StorageNoticeBar'
import { ProjectMenu } from './ProjectMenu'
import * as projectIo from './projectIo'

describe('ProjectMenu UI (ProjectMenu.tsx)', () => {
  let store: StudioStore

  beforeEach(() => {
    store = new StudioStore(createStarterProject())
    clearStorageNotice()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders Save File, Open File, and Reset buttons with accessible names', () => {
    render(<ProjectMenu store={store} />)

    const saveBtn = screen.getByRole('button', { name: /save project to file/i })
    const openBtn = screen.getByRole('button', { name: /open project from file/i })
    const resetBtn = screen.getByRole('button', { name: /reset project to starter/i })

    expect(saveBtn).toBeDefined()
    expect(openBtn).toBeDefined()
    expect(resetBtn).toBeDefined()
  })

  it('triggers exportProjectFile when clicking Save File', () => {
    const exportSpy = vi.spyOn(projectIo, 'exportProjectFile').mockImplementation(() => {})
    render(<ProjectMenu store={store} />)

    const saveBtn = screen.getByRole('button', { name: /save project to file/i })
    fireEvent.click(saveBtn)

    expect(exportSpy).toHaveBeenCalledWith(store.getState().project)
  })

  it('imports a project when file is picked', async () => {
    const customProject = createStarterProject()
    customProject.design.name = 'Custom Level'

    vi.spyOn(projectIo, 'importProjectFile').mockResolvedValue({
      ok: true,
      project: customProject,
    })

    const loadSpy = vi.spyOn(store, 'load')
    render(<ProjectMenu store={store} />)

    const fileInput = screen.getByLabelText(/upload project file/i)
    const file = new File(['{}'], 'custom.json', { type: 'application/json' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    // Wait for async import
    // Asks first: nothing is replaced until the kid says so
    const confirm = await screen.findByRole('dialog', { name: /confirm open/i })
    expect(confirm.textContent).toMatch(/Custom Level/)
    expect(loadSpy).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /open it/i }))
    expect(loadSpy).toHaveBeenCalledWith(customProject)

    // Shows the notice (on the bar a kid can see, not in the menu)
    expect(getStorageNotice()?.message).toMatch(/Opened Custom Level/)
  })

  it('shows error banner when imported file is invalid', async () => {
    vi.spyOn(projectIo, 'importProjectFile').mockResolvedValue({
      ok: false,
      error: 'Invalid project format',
    })

    render(<ProjectMenu store={store} />)

    const fileInput = screen.getByLabelText(/upload project file/i)
    const file = new File(['{bad'], 'bad.json', { type: 'application/json' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await vi.waitFor(() => {
      expect(getStorageNotice()?.message).toMatch(/Invalid project format/i)
    })
  })

  it('confirms reset before loading starter project', () => {
    const loadSpy = vi.spyOn(store, 'load')
    render(<ProjectMenu store={store} />)

    const resetBtn = screen.getByRole('button', { name: /reset project to starter/i })
    fireEvent.click(resetBtn)

    // Confirm dialog is shown
    expect(screen.getByText(/Start over\? Your changes will be lost\./i)).toBeDefined()
    expect(loadSpy).not.toHaveBeenCalled()

    // Clicking confirm reset
    const confirmResetBtn = screen.getByRole('button', { name: /^reset$/i })
    fireEvent.click(confirmResetBtn)

    expect(loadSpy).toHaveBeenCalled()
    expect(screen.queryByText(/Start over\? Your changes will be lost\./i)).toBeNull()
  })

  it('shows storage notices on the visible bar (menu closed) and allows dismissing them', () => {
    // The bar is mounted by the builder and the workshop, not by the menu, so it shows with the menu closed.
    render(<StorageNoticeBar />)

    act(() => {
      setStorageNotice({
        id: 'test-warning',
        type: 'corrupt',
        message: 'Safe copy preserved!',
      })
    })

    expect(screen.getByText('Safe copy preserved!')).toBeDefined()

    const dismissBtn = screen.getByRole('button', { name: /dismiss message/i })
    fireEvent.click(dismissBtn)

    expect(screen.queryByText('Safe copy preserved!')).toBeNull()
  })
})
