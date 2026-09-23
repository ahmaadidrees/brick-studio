import { act, cleanup, render } from '@testing-library/react'
import * as Blockly from 'blockly/core'
import { StrictMode, createRef } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { ROVER_IDS, roverBricks } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import type { CompileResult, RoboticsProgram } from '../program/types'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { moveDeviceToPort } from '../wiring/actions'
import { BlocklyWorkspace, SAVE_DEBOUNCE_MS, diagnosticsByBlock, paletteFloats, type BlocklyWorkspaceHandle } from './BlocklyWorkspace'
import { RAIL_PRESS_FOCUS_MS, RailToolbox } from './blocklySetup'
import { ROVER_SECTION, loadWorld, programRecord, storedPrograms, stubBlocklyLayout } from './codeTestFixtures'

/**
 * The workspace component on its own, over the real stores. Saves run on real timers
 * (Blockly's event queue ignores fake ones).
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})
beforeEach(() => {
  stubBlocklyLayout()
  useBrickStore.getState().newBuild()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const wait = (ms: number) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)) })
const workspace = () => Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
const runMotor = (motor: string) => ({ blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_run', id: 'hat', x: 40, y: 40, next: { block: { type: 'robo_run_motor', id: 'run', fields: { MOTOR: motor }, inputs: { POWER: { shadow: { type: 'robo_number', id: 'power', fields: { NUM: 50 } } } } } } }] } })

function setup(program: RoboticsProgram) {
  loadWorld(roverBricks(), { ...ROVER_SECTION, programs: [program] })
  const creation = useRoboticsStore.getState().model.creations[0]
  return { creation, program: storedPrograms()[0] }
}

function Harness({ program, handle, onCompiled }: { program: RoboticsProgram; handle?: React.Ref<BlocklyWorkspaceHandle>; onCompiled?: (result: CompileResult) => void }) {
  const creation = useRoboticsStore((state) => state.model.creations[0])
  const live = useRoboticsStore((state) => state.model.section.programs.find((candidate) => candidate.id === program.id)) ?? program
  return <BlocklyWorkspace ref={handle} program={live} creation={creation} firstRun={false} paletteCollapsed={false} onCompiled={onCompiled} />
}

describe('<BlocklyWorkspace>', () => {
  it('injects once under Strict Mode and leaves nothing behind on unmount', () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor)))
    const { unmount } = render(<StrictMode><Harness program={program} /></StrictMode>)
    expect(document.querySelectorAll('.injectionDiv')).toHaveLength(1)
    expect(workspace().getAllBlocks(false).map((block) => block.id).sort()).toEqual(['hat', 'power', 'run'])
    unmount()
    expect(document.querySelectorAll('.injectionDiv')).toHaveLength(0)
  })

  it('does not write anything just for opening a program', async () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor)))
    const before = JSON.stringify(useBrickStore.getState().documentMetadata)
    render(<Harness program={program} />)
    await wait(SAVE_DEBOUNCE_MS + 150)
    expect(JSON.stringify(useBrickStore.getState().documentMetadata)).toBe(before)
  })

  it('saves a burst of edits once, after the debounce, with history off, and never touches studio Undo', async () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor), { revision: 0 }))
    // A construction edit first, so there is something for studio Undo to undo.
    act(() => { useBrickStore.getState().selectBrick(ROVER_IDS.sensor); useBrickStore.getState().nudge(1, 0, 0) })
    const undoBefore = useBrickStore.getState().undoStack.length
    expect(undoBefore).toBe(1)
    const setSection = vi.spyOn(useBrickStore.getState(), 'setRoboticsSection')
    render(<Harness program={program} />)
    act(() => {
      Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'a' }, workspace())
      Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'b' }, workspace())
    })
    await wait(SAVE_DEBOUNCE_MS - 150)
    expect(setSection).not.toHaveBeenCalled()
    expect(storedPrograms()[0].revision).toBe(0)
    await wait(300)
    expect(setSection).toHaveBeenCalledTimes(1)
    expect(setSection.mock.calls[0][2]).toEqual({ history: false })
    expect(storedPrograms()[0].revision).toBe(1)
    expect(JSON.stringify(storedPrograms()[0].workspace)).toContain('"id":"b"')
    expect(useBrickStore.getState().undoStack).toHaveLength(undoBefore)
    // Studio Undo takes the construction edit back and leaves the code alone.
    const sensorX = () => useBrickStore.getState().bricks.find((brick) => brick.id === ROVER_IDS.sensor)!.x
    const moved = sensorX()
    act(() => useBrickStore.getState().undo())
    expect(sensorX()).toBe(moved - 1)
    expect(JSON.stringify(storedPrograms()[0].workspace)).toContain('"id":"b"')
    expect(storedPrograms()[0].revision).toBe(1)
  })

  it('flushes a pending edit on demand and on unmount', async () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor), { revision: 0 }))
    const handle = createRef<BlocklyWorkspaceHandle>()
    const { unmount } = render(<Harness program={program} handle={handle} />)
    act(() => { Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'a' }, workspace()) })
    await wait(20)
    act(() => handle.current!.flush())
    expect(storedPrograms()[0].revision).toBe(1)
    act(() => { Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'c' }, workspace()) })
    await wait(20)
    unmount()
    expect(storedPrograms()[0].revision).toBe(2)
    expect(JSON.stringify(storedPrograms()[0].workspace)).toContain('"id":"c"')
  })

  it('keeps a missing device’s value in its dropdown (never jumps to another part) and saves it back', async () => {
    const { program } = setup(programRecord('p1', runMotor('deleted-motor'), { deviceNames: { 'deleted-motor': 'Arm motor' }, revision: 0 }))
    const results: CompileResult[] = []
    render(<Harness program={program} onCompiled={(result) => results.push(result)} />)
    const field = workspace().getBlockById('run')!.getField('MOTOR') as Blockly.FieldDropdown
    expect(field.getValue()).toBe('deleted-motor')
    expect(field.getText()).toBe('Arm motor (missing)')
    // The creation's own motors are still offered.
    expect(field.getOptions(false).map(([label]) => label)).toEqual(['Left motor · A', 'Right motor · B', 'Arm motor (missing)'])
    expect(results.at(-1)!.diagnostics.map((diagnostic) => diagnostic.message)).toContain('Arm motor is missing')
    act(() => { Blockly.serialization.blocks.append({ type: 'robo_stop_motors', id: 'x' }, workspace()) })
    await wait(SAVE_DEBOUNCE_MS + 150)
    expect(JSON.stringify(storedPrograms()[0].workspace)).toContain('"MOTOR":"deleted-motor"')
    expect(storedPrograms()[0].deviceNames).toEqual({ 'deleted-motor': 'Arm motor' })
  })

  it('relabels a device dropdown when its cable moves, without re-injecting', () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor)))
    render(<Harness program={program} />)
    const injection = document.querySelector('.injectionDiv')
    const label = () => (workspace().getBlockById('run')!.getField('MOTOR') as Blockly.FieldDropdown).getText()
    expect(label()).toBe('Left motor · A')
    act(() => { expect(moveDeviceToPort(ROVER_IDS.leftMotor, 'D')).toBe(true) })
    expect(label()).toBe('Left motor · D')
    expect(document.querySelector('.injectionDiv')).toBe(injection)
  })

  it('shows errors, warnings and notes on their blocks, distinguishably', () => {
    const { program } = setup(programRecord('p1', { blocks: { languageVersion: 0, blocks: [
      { type: 'robo_when_run', id: 'hat', x: 40, y: 40, next: { block: { type: 'robo_run_motor', id: 'run', fields: { MOTOR: ROVER_IDS.leftMotor }, inputs: { POWER: { shadow: { type: 'robo_number', id: 'power', fields: { NUM: 50 } } } } } } },
      { type: 'robo_stop_motors', id: 'loose', x: 300, y: 300 },
    ] } }))
    loadWorld(roverBricks(), { ...ROVER_SECTION, connections: ROVER_SECTION.connections.filter((cable) => cable.deviceId !== ROVER_IDS.leftMotor), programs: [program] })
    render(<Harness program={program} />)
    const classes = (id: string) => workspace().getBlockById(id)!.getSvgRoot().classList
    expect(classes('run').contains('robo-diag-warning')).toBe(true)
    expect(classes('loose').contains('robo-diag-info')).toBe(true)
    expect(classes('hat').contains('robo-diag-warning')).toBe(false)
    const warning = workspace().getBlockById('run')!.getIcon(Blockly.icons.IconType.WARNING)
    expect(warning?.getText()).toBe('Left motor is not plugged in')
  })

  it('floats the palette over a narrow scripts area (an iPad) and pins it beside a wide one', () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor)))
    // jsdom lays nothing out, so the scripts area reads 0 px wide: narrow.
    render(<Harness program={program} />)
    expect(paletteFloats(0)).toBe(true)
    expect(workspace().getToolbox()!.getFlyout()!.autoClose).toBe(true)
    expect(workspace().getToolbox()!.getSelectedItem()).toBeNull()
    cleanup()
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('robo-code-blockly') ? 820 : 0 })
    render(<Harness program={program} />)
    expect(workspace().getToolbox()!.getFlyout()!.autoClose).toBe(false)
    expect(workspace().getToolbox()!.getSelectedItem()).not.toBeNull()
  })

  it('a tap on the open rail row closes the palette even though iPadOS Safari focuses the row after the tap', () => {
    const { program } = setup(programRecord('p1', runMotor(ROVER_IDS.leftMotor)))
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('robo-code-blockly') ? 820 : 0 })
    render(<Harness program={program} />)
    const toolbox = workspace().getToolbox() as RailToolbox
    expect(toolbox).toBeInstanceOf(RailToolbox)
    const open = toolbox.getSelectedItem() as Blockly.ToolboxCategory
    expect(open).not.toBeNull()
    // The press: Blockly's pointerdown handler finds the row by its id and, since it is open, closes it.
    const press = (row: Blockly.ToolboxCategory) => (toolbox as unknown as { onClick_: (event: PointerEvent) => void }).onClick_({ target: row.getClickTarget(), button: 0, preventDefault() {} } as unknown as PointerEvent)
    act(() => press(open))
    expect(toolbox.getSelectedItem()).toBeNull()
    // WebKit then focuses the tapped row, after the finger has lifted: the palette stays closed.
    act(() => Blockly.getFocusManager().focusNode(open))
    expect(toolbox.getSelectedItem()).toBeNull()
    expect(toolbox.getFlyout()!.isVisible()).toBe(false)
    // Focus that is not a tap's (the keyboard, a moment later) still opens a row.
    const now = performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(now + RAIL_PRESS_FOCUS_MS + 1)
    const scrollIntoView = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = () => {}
    try {
      const next = toolbox.getToolboxItems().find((item) => item !== open && item.isSelectable()) as Blockly.ToolboxCategory
      act(() => Blockly.getFocusManager().focusNode(next))
      expect(toolbox.getSelectedItem()).toBe(next)
    } finally {
      Element.prototype.scrollIntoView = scrollIntoView
    }
  })

  it('groups diagnostics by block with the worst severity first', () => {
    const grouped = diagnosticsByBlock([
      { code: 'device.unplugged', severity: 'warning', message: 'Left motor is not plugged in', blockId: 'a' },
      { code: 'device.missing', severity: 'error', message: 'Front sensor is missing', blockId: 'a' },
      { code: 'device.unplugged', severity: 'warning', message: 'Left motor is not plugged in', blockId: 'a' },
      { code: 'program.no-scripts', severity: 'warning', message: 'Add a “when run” block', blockId: null },
    ])
    expect([...grouped.entries()]).toEqual([['a', { severity: 'error', messages: ['Left motor is not plugged in', 'Front sensor is missing'] }]])
  })
})
