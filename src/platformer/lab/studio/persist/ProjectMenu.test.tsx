import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { StudioStore } from '../store'
import { clearStorageNotice, setStorageNotice } from './notice'
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
    await vi.waitFor(() => {
      expect(loadSpy).toHaveBeenCalledWith(customProject)
    })

    // Shows success banner
    expect(screen.getByText(/Loaded "Custom Level" successfully!/i)).toBeDefined()
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
      expect(screen.getByText(/Invalid project format/i)).toBeDefined()
    })
  })

  it('confirms reset before loading starter project', () => {
    const loadSpy = vi.spyOn(store, 'load')
    render(<ProjectMenu store={store} />)

    const resetBtn = screen.getByRole('button', { name: /reset project to starter/i })
    fireEvent.click(resetBtn)

    // Confirm dialog is shown
    expect(screen.getByText(/Start over with the fresh starter playground\?/i)).toBeDefined()
    expect(loadSpy).not.toHaveBeenCalled()

    // Clicking confirm reset
    const confirmResetBtn = screen.getByRole('button', { name: /^reset$/i })
    fireEvent.click(confirmResetBtn)

    expect(loadSpy).toHaveBeenCalled()
    expect(screen.queryByText(/Start over with the fresh starter playground\?/i)).toBeNull()
  })

  it('displays storage notices (e.g. corrupt save or quota) and allows dismissing them', () => {
    render(<ProjectMenu store={store} />)

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
