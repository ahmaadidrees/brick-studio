import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import * as Blockly from 'blockly/core'
import { StrictMode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { ROVER_IDS, roverBricks } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import { STARTER_GOALS } from '../program/starters'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { resetStageStoreForTests, useStageStore } from '../state/stageStore'
import { RoboticsPanel } from '../ui/RoboticsPanel'
import { SAVE_DEBOUNCE_MS } from './BlocklyWorkspace'
import CodeView from './CodeView'
import { LIVE_ROOM_CODE_LINE, useCodeView } from './codeViewState'
import { ROVER_SECTION, loadWorld, programRecord, storedPrograms, storedSection, stubBlocklyLayout } from './codeTestFixtures'
import { studioShortcutsSuspended } from './studioKeys'

/**
 * The Code view through the real stores: the brick store holds the document, the
 * robotics store derives the creation, the stage store opens a real run controller
 * (Rapier in Node). Blockly is injected into jsdom. Saves are on real timers: Blockly
 * flushes its event queue through a timer it captured at import time, which fake
 * timers cannot drive.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})

beforeEach(() => {
  stubBlocklyLayout()
  resetStageStoreForTests()
  useCodeView.setState({ creationId: null })
  useBrickStore.getState().newBuild()
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
})

afterEach(() => {
  cleanup()
  resetStageStoreForTests()
  vi.restoreAllMocks()
})

const settle = async (ms = SAVE_DEBOUNCE_MS + 150) => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
}
const mainWorkspace = () => Blockly.getMainWorkspace() as Blockly.WorkspaceSvg

async function openCode(creationId = 'rover', { strict = false } = {}) {
  act(() => useCodeView.getState().openCode(creationId))
  const view = strict ? <StrictMode><CodeView /></StrictMode> : <CodeView />
  const utils = render(view)
  await screen.findByTestId('robo-code')
  await waitFor(() => expect(useStageStore.getState().stage).not.toBeNull())
  return utils
}

describe('opening a creation for the first time', () => {
  it('creates its default starter and opens it in the first-run state', async () => {
    loadWorld()
    expect(storedPrograms()).toHaveLength(0)
    await openCode('rover', { strict: true })

    const programs = storedPrograms()
    expect(programs.map((program) => [program.name, program.starter, program.revision])).toEqual([['Stop before the wall', 'stop-before-wall', 0]])
    expect(storedSection().creations[0].activeProgramId).toBe(programs[0].id)
    // Strict Mode mounts twice: one program, one workspace.
    expect(document.querySelectorAll('.robo-code-blockly .injectionDiv')).toHaveLength(1)

    const workspace = mainWorkspace()
    expect(workspace.getTopBlocks(false).map((block) => block.type)).toEqual(['robo_when_run'])
    // Palette collapsed: no category selected, flyout closed, rail visible.
    expect(workspace.getToolbox()!.getSelectedItem()).toBeNull()
    expect(workspace.getToolbox()!.getFlyout()!.isVisible()).toBe(false)
    expect(document.querySelectorAll('.blocklyToolboxCategory')).toHaveLength(9)
    // The first-run palette leaves the controller blocks out.
    const input = (workspace.getToolbox() as Blockly.Toolbox).getToolboxItemById('input') as Blockly.ToolboxCategory
    expect(input.getContents()).toEqual([])
    expect(screen.getByTestId('robo-goal')).toHaveTextContent(STARTER_GOALS['stop-before-wall'])
    expect(screen.getByRole('button', { name: 'More blocks' })).toBeInTheDocument()
    expect(screen.getByTestId('robo-status')).toHaveTextContent('Ready')
    // The sensor dropdown names the part and its port.
    expect(screen.getByTestId('robo-readings')).toHaveTextContent('Front sensor')
    expect(workspace.getBlockById('stop-before-wall:sees')!.getField('SENSOR')!.getText()).toBe('Front sensor · C')
  })

  it('reopens an edited program with the full palette, open when the scripts area is wide', async () => {
    // jsdom lays nothing out: give the Blockly host the width it has at 1366×768.
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('robo-code-blockly') ? 820 : 0 })
    loadWorld()
    await openCode()
    const [program] = storedPrograms()
    act(() => { Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'extra' }, mainWorkspace()) })
    await settle()
    expect(storedPrograms()[0].revision).toBe(program.revision + 1)
    cleanup()
    resetStageStoreForTests()
    await openCode()
    const workspace = mainWorkspace()
    expect(workspace.getToolbox()!.getSelectedItem()).not.toBeNull()
    const input = (workspace.getToolbox() as Blockly.Toolbox).getToolboxItemById('input') as Blockly.ToolboxCategory
    expect((input.getContents() as unknown[]).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'More blocks' })).toBeNull()
  })

  it('suspends the studio shortcuts while open and restores them on Back to build', async () => {
    loadWorld()
    expect(studioShortcutsSuspended()).toBe(false)
    await openCode()
    expect(studioShortcutsSuspended()).toBe(true)
    fireEvent.click(screen.getByTestId('robo-back'))
    expect(useCodeView.getState().creationId).toBeNull()
  })
})

describe('program tabs', () => {
  it('adds a starter from +, switches, renames and deletes with a confirm', async () => {
    loadWorld()
    await openCode()
    fireEvent.click(screen.getByRole('button', { name: 'New program' }))
    const menu = screen.getByTestId('robo-starters-menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.querySelector('strong')!.textContent)).toEqual(['Stop before the wall', 'Joystick drive', 'Blank'])
    fireEvent.click(within(menu).getByText('Joystick drive'))

    let programs = storedPrograms()
    expect(programs.map((program) => program.name)).toEqual(['Stop before the wall', 'Joystick drive'])
    expect(storedSection().creations[0].activeProgramId).toBe(programs[1].id)
    await waitFor(() => expect(mainWorkspace().getTopBlocks(false).map((block) => block.type)).toEqual(['robo_when_joystick_moves']))
    expect(screen.getAllByRole('tab').map((tab) => [tab.textContent, tab.getAttribute('aria-selected')])).toEqual([['Stop before the wall', 'false'], ['Joystick drive', 'true']])
    // A controller starter shows its joystick; its first-run palette includes the controller blocks.
    expect(screen.getByTestId('robo-joystick')).toBeInTheDocument()
    const input = (mainWorkspace().getToolbox() as Blockly.Toolbox).getToolboxItemById('input') as Blockly.ToolboxCategory
    expect((input.getContents() as { type: string }[]).map((item) => item.type)).toContain('robo_when_joystick_moves')

    fireEvent.click(screen.getByRole('tab', { name: 'Stop before the wall' }))
    expect(storedSection().creations[0].activeProgramId).toBe(programs[0].id)
    await waitFor(() => expect(mainWorkspace().getTopBlocks(false)[0].type).toBe('robo_when_run'))

    fireEvent.doubleClick(screen.getByRole('tab', { name: 'Stop before the wall' }))
    const field = screen.getByLabelText('Program name')
    fireEvent.change(field, { target: { value: 'Brake early' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(storedPrograms()[0].name).toBe('Brake early')

    fireEvent.click(screen.getByRole('button', { name: 'Brake early options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    const confirm = screen.getByTestId('robo-delete-confirm')
    expect(confirm).toHaveTextContent('Delete “Brake early”?')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep it' }))
    expect(storedPrograms()).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Brake early options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }))
    fireEvent.click(within(screen.getByTestId('robo-delete-confirm')).getByRole('button', { name: 'Delete' }))
    programs = storedPrograms()
    expect(programs.map((program) => program.name)).toEqual(['Joystick drive'])
    expect(storedSection().creations[0].activeProgramId).toBe(programs[0].id)
    // The last program cannot be deleted.
    fireEvent.click(screen.getByRole('button', { name: 'Joystick drive options' }))
    expect(screen.getByRole('menuitem', { name: 'Delete…' })).toBeDisabled()
  })

  it('never enters program edits in the studio’s Undo', async () => {
    loadWorld()
    await openCode()
    fireEvent.click(screen.getByRole('button', { name: 'New program' }))
    fireEvent.click(within(screen.getByTestId('robo-starters-menu')).getByText('Blank'))
    act(() => { Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'extra' }, mainWorkspace()) })
    await settle()
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
    expect(storedPrograms().map((program) => program.name)).toEqual(['Stop before the wall', 'My program'])
  })
})

describe('Run', () => {
  it('is blocked, with a line, when a block names a part that is gone', async () => {
    const sees = { type: 'robo_sensor_sees', id: 'sees', fields: { SENSOR: 'gone-sensor' }, inputs: { STUDS: { shadow: { type: 'robo_number', id: 'studs', fields: { NUM: 3 } } } } }
    const workspace = { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_run', id: 'hat', x: 40, y: 40, next: { block: { type: 'robo_wait_until', id: 'wait', inputs: { CONDITION: { block: sees } } } } }] } }
    loadWorld(roverBricks(), { ...ROVER_SECTION, programs: [programRecord('p1', workspace, { deviceNames: { 'gone-sensor': 'Old sensor' } })] })
    await openCode()
    const runOnStage = vi.spyOn(useStageStore.getState(), 'runOnStage')
    expect(screen.getByTestId('robo-problems')).toHaveTextContent('Old sensor is missing')
    // The dropdown keeps the missing part rather than jumping to the sensor the creation has.
    const field = mainWorkspace().getBlockById('sees')!.getField('SENSOR')!
    expect(field.getValue()).toBe('gone-sensor')
    expect(field.getText()).toBe('Old sensor (missing)')
    expect(mainWorkspace().getBlockById('sees')!.getSvgRoot().classList.contains('robo-diag-error')).toBe(true)

    fireEvent.click(screen.getByTestId('robo-run'))
    expect(screen.getByTestId('robo-run-blocked')).toHaveTextContent('Can’t run yet: Old sensor is missing')
    expect(runOnStage).not.toHaveBeenCalled()
    expect(useStageStore.getState().stageObservation?.phase).toBe('ready')
  })

  it('runs the saved revision and says "Changed" when the program is edited while it runs', async () => {
    loadWorld()
    await openCode()
    fireEvent.click(screen.getByTestId('robo-run'))
    expect(useStageStore.getState().stageObservation?.phase).toBe('running')
    expect(screen.getByTestId('robo-status')).toHaveTextContent('Running · 0.0 s')
    expect(screen.queryByTestId('robo-changed')).toBeNull()

    const number = mainWorkspace().getBlockById('stop-before-wall:studs')!
    act(() => { number.setFieldValue(6, 'NUM') })
    await settle()
    expect(storedPrograms()[0].revision).toBe(1)
    expect(useStageStore.getState().stageObservation?.phase).toBe('running')
    expect(screen.getByTestId('robo-changed')).toHaveTextContent('Changed · press Run to use it')

    fireEvent.click(screen.getByTestId('robo-run'))
    expect(screen.queryByTestId('robo-changed')).toBeNull()
    fireEvent.click(screen.getByTestId('robo-stop'))
    expect(screen.getByTestId('robo-status')).toHaveTextContent('Stopped')
    fireEvent.click(screen.getByTestId('robo-reset'))
    expect(screen.getByTestId('robo-status')).toHaveTextContent('Ready')
  })

  it('says "Not plugged in" on the blocks of an unplugged motor, and still runs', async () => {
    loadWorld(roverBricks(), { ...ROVER_SECTION, connections: ROVER_SECTION.connections.filter((connection) => connection.deviceId !== ROVER_IDS.leftMotor) })
    await openCode()
    expect(screen.getByTestId('robo-problems')).toHaveTextContent('Left motor is not plugged in')
    expect(mainWorkspace().getBlockById('stop-before-wall:drive')!.getSvgRoot().classList.contains('robo-diag-warning')).toBe(true)
    expect(screen.getByTestId('robo-readings')).toHaveTextContent('Left motor not plugged in')
    fireEvent.click(screen.getByTestId('robo-run'))
    expect(screen.queryByTestId('robo-run-blocked')).toBeNull()
    expect(useStageStore.getState().stageObservation?.phase).toBe('running')
  })
})

describe('in a live room', () => {
  it('offers no Code: the button is off with one line saying why, and an open view closes', async () => {
    loadWorld()
    act(() => useBrickStore.getState().selectBrick(ROVER_IDS.hub))
    const { rerender } = render(<RoboticsPanel live />)
    expect(screen.getByTestId('robotics-code-button')).toBeDisabled()
    expect(screen.getByTestId('robotics-live-code-line')).toHaveTextContent(LIVE_ROOM_CODE_LINE)

    act(() => useCodeView.getState().openCode('rover'))
    rerender(<RoboticsPanel live />)
    await waitFor(() => expect(useCodeView.getState().creationId).toBeNull())
    expect(screen.queryByTestId('robo-code')).toBeNull()

    rerender(<RoboticsPanel />)
    expect(screen.getByTestId('robotics-code-button')).toBeEnabled()
    fireEvent.click(screen.getByTestId('robotics-code-button'))
    expect(await screen.findByTestId('robo-code')).toBeInTheDocument()
  })
})
