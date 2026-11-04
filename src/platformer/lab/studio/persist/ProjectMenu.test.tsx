import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStarterProject } from '../starter'
import { createRaceStarterProject } from '../race/raceProject'
import { createStarter3dProject } from '../three/project3d'
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

  it('renders Save File, Open File, and Start over buttons with accessible names', () => {
    render(<ProjectMenu store={store} />)

    const saveBtn = screen.getByRole('button', { name: /save project to file/i })
    const openBtn = screen.getByRole('button', { name: /open project from file/i })
    const resetBtn = screen.getByRole('button', { name: /start over with the starter level/i })

    expect(saveBtn).toBeDefined()
    expect(openBtn).toBeDefined()
    expect(resetBtn).toBeDefined()
  })

  it('Open File offers the .brickgineers files My projects downloads, as well as .json', () => {
    render(<ProjectMenu store={store} />)
    const accept = screen.getByLabelText('Upload project file').getAttribute('accept')!.split(',')
    expect(accept).toEqual(expect.arrayContaining(['.brickgineers', '.json']))
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

    const resetBtn = screen.getByRole('button', { name: /start over with the starter level/i })
    fireEvent.click(resetBtn)

    // Confirm dialog is shown
    expect(screen.getByText(/Start over with the starter level\? You can undo it right after\./i)).toBeDefined()
    expect(loadSpy).not.toHaveBeenCalled()

    // Clicking confirm reset
    const confirmResetBtn = screen.getByRole('button', { name: /^start over$/i })
    fireEvent.click(confirmResetBtn)

    expect(loadSpy).toHaveBeenCalled()
    expect(screen.queryByText(/Start over with the starter level/i)).toBeNull()
  })

  it('Start over keeps the project’s name, and Undo puts the project back', () => {
    store.renameProject('Lava jump')
    store.addCopy('brick_coin', 640, 120)
    const before = store.getState().project
    render(<><StorageNoticeBar /><ProjectMenu store={store} /></>)
    fireEvent.click(screen.getByRole('button', { name: /start over with the starter level/i }))
    fireEvent.click(screen.getByRole('button', { name: /^start over$/i }))
    expect(store.getState().project.design.name).toBe('Lava jump')
    expect(store.getState().project.design.copies).toHaveLength(createStarterProject().design.copies.length)

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project).toBe(before)
    expect(getStorageNotice()?.message).toBe('Put back the project you had before.')
  })

  it('Open File can be undone too, and the Undo offer does not fade away', async () => {
    vi.useFakeTimers()
    const before = store.getState().project
    const other = createStarterProject()
    other.design.name = 'Other level'
    vi.spyOn(projectIo, 'importProjectFile').mockResolvedValue({ ok: true, project: other })
    render(<><StorageNoticeBar /><ProjectMenu store={store} /></>)
    fireEvent.change(screen.getByLabelText(/upload project file/i), { target: { files: [new File(['{}'], 'x.json')] } })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.click(screen.getByRole('button', { name: /open it/i }))
    expect(store.getState().project.design.name).toBe('Other level')
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000) })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(store.getState().project).toBe(before)
    vi.useRealTimers()
  })

  it('in a race project, Start over goes back to the beginner track, still a race track, keeping its name', () => {
    const race = new StudioStore(createRaceStarterProject())
    race.renameProject('Ice ring')
    render(<><StorageNoticeBar /><ProjectMenu store={race} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Start over with the beginner track' }))
    expect(screen.getByText('Start over with the beginner track? You can undo it right after.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /^start over$/i }))
    const design = race.getState().project.design
    expect(design.kit).toBe('race')
    expect(design.name).toBe('Ice ring')
    expect(design.copies).toHaveLength(createRaceStarterProject().design.copies.length)
    expect(getStorageNotice()?.message).toBe('Started over with the beginner track.')
  })

  it('Open File tells the file which game this project is', async () => {
    const opened = vi.spyOn(projectIo, 'importProjectFile').mockResolvedValue({ ok: false, error: 'nope' })
    const race = new StudioStore(createRaceStarterProject())
    render(<ProjectMenu store={race} />)
    fireEvent.change(screen.getByLabelText(/upload project file/i), { target: { files: [new File(['{}'], 'x.json')] } })
    await act(async () => { await Promise.resolve() })
    expect(opened).toHaveBeenCalledWith(expect.anything(), 'race')
    cleanup()
    render(<ProjectMenu store={store} />)
    fireEvent.change(screen.getByLabelText(/upload project file/i), { target: { files: [new File(['{}'], 'x.json')] } })
    await act(async () => { await Promise.resolve() })
    expect(opened).toHaveBeenLastCalledWith(expect.anything(), 'platformer')
  })

  it('in a Hackable 3D project, Start over goes back to the starter world, still 3D, keeping its name', () => {
    const world = new StudioStore(createStarter3dProject())
    world.renameProject('Sky castle')
    render(<><StorageNoticeBar /><ProjectMenu store={world} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Start over with the starter world' }))
    expect(screen.getByText('Start over with the starter world? You can undo it right after.')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /^start over$/i }))
    const design = world.getState().project.design
    expect(design.kit).toBe('3d')
    expect(design.name).toBe('Sky castle')
    expect(design.copies).toHaveLength(createStarter3dProject().design.copies.length)
    expect(getStorageNotice()?.message).toBe('Started over with the starter world.')
  })

  it('Open File in a 3D project tells the file it is 3D, and a file of another game is refused with its name', async () => {
    const opened = vi.spyOn(projectIo, 'importProjectFile')
    const world = new StudioStore(createStarter3dProject())
    render(<><StorageNoticeBar /><ProjectMenu store={world} /></>)
    const platformerFile = new File([projectIo.exportProjectJson(createStarterProject())], 'level.json')
    fireEvent.change(screen.getByLabelText(/upload project file/i), { target: { files: [platformerFile] } })
    await vi.waitFor(() => expect(getStorageNotice()?.id).toBe('import-error'))
    expect(opened).toHaveBeenCalledWith(expect.anything(), '3d')
    expect(getStorageNotice()?.message).toBe('That file is a Hackable Platformer project. Open it from My projects.')
    expect(world.getState().project.design.kit).toBe('3d')
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
