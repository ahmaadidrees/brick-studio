import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useBrickStore } from '../../brick/store'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import { readRoboticsSection } from '../model/section'
import { usePaintMode } from '../paint/paint'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { RoboticsPanel } from '../ui/RoboticsPanel'
import { useRobotFocus } from '../ui/robotFocus'
import { runStepAction } from './actions'
import { oneShotPartId, resetOneShotForTests, usePlacedFlash } from './oneShot'

/**
 * A part armed from a next step or an idea is placed once (lane P): once it lands the brush is put
 * down (nothing still says "Placing Seat") and the part flashes; the drawer's parts and rows that
 * ask for several keep the studio's repeat placement. The other ideas paint, rename and open Code.
 */
beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})
afterEach(cleanup)
beforeEach(() => {
  resetOneShotForTests()
  usePaintMode.getState().stop()
  useRoboticsStore.getState().resetSim()
  useBrickStore.getState().newBuild()
  useBrickStore.setState({ undoStack: [], redoStack: [], toast: null })
  useRoboticsStore.setState({ card: null, wiringNote: null, frameRequest: null })
  useRoboticsStore.getState().refreshModel()
  useRobotFocus.setState({ creationId: null })
  useCodeView.setState({ creationId: null })
  useDriveView.setState({ creationId: null })
})

function place(partId: string, x: number, y: number, z: number, rotation = 0) {
  act(() => {
    const state = useBrickStore.getState()
    state.choosePart(partId)
    for (let turn = 0; turn < rotation; turn += 1) state.rotate()
    state.setDraftPosition(x, y, z)
    expect(state.placeDraft()).toBe(true)
    useBrickStore.getState().cancelInteraction()
  })
  return useBrickStore.getState().bricks.at(-1)!.id
}
/** Places whatever is armed at (x, y, z), as a click on the plate does. */
function placeArmed(x: number, y: number, z: number) {
  act(() => {
    useBrickStore.getState().setDraftPosition(x, y, z)
    expect(useBrickStore.getState().placeDraft()).toBe(true)
  })
  return useBrickStore.getState().bricks.at(-1)!
}

describe('a part armed from a step or an idea is placed once', () => {
  it('lands, the brush is put down and the part flashes', () => {
    act(() => runStepAction({ kind: 'arm', partId: ROBOTICS_PART_IDS.seat, rotation: 1 }))
    expect(useBrickStore.getState().draft).toMatchObject({ partId: ROBOTICS_PART_IDS.seat, rotation: 1 })
    expect(oneShotPartId()).toBe(ROBOTICS_PART_IDS.seat)
    const seat = placeArmed(30, 0, 30)
    expect(seat.partId).toBe(ROBOTICS_PART_IDS.seat)
    expect(useBrickStore.getState().draft).toBeNull()
    expect(useBrickStore.getState().activePartId).toBeNull()
    expect(usePlacedFlash.getState().flash?.brickId).toBe(seat.id)
    expect(oneShotPartId()).toBeNull()
  })

  it('a row that asks for several (stacking) keeps the brush, as the drawer does', () => {
    act(() => runStepAction({ kind: 'arm', partId: 'brick_2x2', rotation: 0, repeat: true }))
    expect(oneShotPartId()).toBeNull()
    placeArmed(30, 0, 30)
    expect(useBrickStore.getState().draft?.partId).toBe('brick_2x2')
  })

  it('choosing another part or putting it down makes it an ordinary brush again', () => {
    act(() => runStepAction({ kind: 'arm', partId: ROBOTICS_PART_IDS.light, rotation: 0 }))
    act(() => useBrickStore.getState().choosePart('brick_2x4'))
    expect(oneShotPartId()).toBeNull()
    placeArmed(30, 0, 30)
    expect(useBrickStore.getState().draft?.partId).toBe('brick_2x4')
    act(() => runStepAction({ kind: 'arm', partId: ROBOTICS_PART_IDS.light, rotation: 0 }))
    act(() => useBrickStore.getState().cancelInteraction())
    expect(oneShotPartId()).toBeNull()
  })
})

describe('the ideas, from the panel', () => {
  function readyBuggyWithIdeasDone() {
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
    for (const [partId, x, y, z, rotation] of [
      [ROBOTICS_PART_IDS.motor, 31, 1, 31, 0], [ROBOTICS_PART_IDS.motor, 28, 1, 31, 2], [ROBOTICS_PART_IDS.axleShort, 34, 0, 32, 0], [ROBOTICS_PART_IDS.axleShort, 26, 0, 32, 0],
      [ROBOTICS_PART_IDS.wheel, 36, 0, 31, 0], [ROBOTICS_PART_IDS.wheel, 25, 0, 31, 0], [ROBOTICS_PART_IDS.distanceSensor, 30, 1, 26, 0],
      [ROBOTICS_PART_IDS.light, 29, 7, 27, 0], [ROBOTICS_PART_IDS.seat, 30, 7, 29, 0],
      // Five bricks stacked on the hub (the stack idea counts to five).
      ['brick_2x2', 31, 7, 27, 0], ['brick_2x2', 31, 10, 27, 0], ['brick_2x2', 31, 13, 27, 0], ['brick_2x2', 31, 16, 27, 0], ['brick_2x2', 31, 19, 27, 0],
    ] as const) place(partId, x, y, z, rotation)
  }

  it('an idea row arms its part once: placed, the Make it yours list ticks it and nothing is left armed', () => {
    render(<RoboticsPanel />)
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
    for (const [partId, x, y, z, rotation] of [
      [ROBOTICS_PART_IDS.motor, 31, 1, 31, 0], [ROBOTICS_PART_IDS.motor, 28, 1, 31, 2], [ROBOTICS_PART_IDS.axleShort, 34, 0, 32, 0], [ROBOTICS_PART_IDS.axleShort, 26, 0, 32, 0],
      [ROBOTICS_PART_IDS.wheel, 36, 0, 31, 0], [ROBOTICS_PART_IDS.wheel, 25, 0, 31, 0],
    ] as const) place(partId, x, y, z, rotation)
    fireEvent.click(within(screen.getByTestId('robotics-ideas')).getByRole('button', { name: /Add a light on top/ }))
    expect(useBrickStore.getState().draft?.partId).toBe(ROBOTICS_PART_IDS.light)
    placeArmed(29, 7, 27)
    expect(useBrickStore.getState().draft).toBeNull()
    expect(screen.getByTestId('robotics-ideas').querySelector('[data-step="idea-light"]')).toHaveAttribute('data-state', 'done')
  })

  it('the seat idea: armed on the robot’s top; placed on bare ground it goes back into the hand, on top again; Place puts it on', () => {
    render(<RoboticsPanel />)
    place('plate_6x8', 28, 0, 26)
    place(ROBOTICS_PART_IDS.hub, 29, 1, 27)
    fireEvent.click(screen.getByRole('button', { name: 'Keep building' }))
    for (const [partId, x, y, z, rotation] of [
      [ROBOTICS_PART_IDS.motor, 31, 1, 31, 0], [ROBOTICS_PART_IDS.motor, 28, 1, 31, 2], [ROBOTICS_PART_IDS.axleShort, 34, 0, 32, 0], [ROBOTICS_PART_IDS.axleShort, 26, 0, 32, 0],
      [ROBOTICS_PART_IDS.wheel, 36, 0, 31, 0], [ROBOTICS_PART_IDS.wheel, 25, 0, 31, 0],
    ] as const) place(partId, x, y, z, rotation)
    act(() => useBrickStore.setState({ undoStack: [], redoStack: [], toast: null }))
    fireEvent.click(within(screen.getByTestId('robotics-ideas')).getByRole('button', { name: /Add a seat/ }))
    const armed = useBrickStore.getState().draft!
    expect(armed.partId).toBe(ROBOTICS_PART_IDS.seat)
    // On the hub's top (six plates up on a one-plate plate), not wherever the camera happened to look.
    expect(armed.y).toBe(7)
    const bricksBefore = useBrickStore.getState().bricks.length
    // Moved to bare ground in front of the car and placed there: it cannot join the robot.
    placeArmed(20, 0, 20)
    const state = useBrickStore.getState()
    expect(state.bricks).toHaveLength(bricksBefore)
    expect(state.bricks.some((brick) => brick.partId === ROBOTICS_PART_IDS.seat)).toBe(false)
    expect(state.undoStack).toHaveLength(0)
    expect(state.draft).toMatchObject({ partId: ROBOTICS_PART_IDS.seat, x: armed.x, y: armed.y, z: armed.z })
    expect(state.toast).toBe('The seat goes on Robot. It is back on top: press Place.')
    expect(oneShotPartId()).toBe(ROBOTICS_PART_IDS.seat)
    // Place (as the strip's Place button does): on the robot, ticked, and nothing left in hand.
    act(() => { expect(useBrickStore.getState().placeDraft()).toBe(true) })
    expect(useBrickStore.getState().draft).toBeNull()
    expect(useRoboticsStore.getState().model.creations[0].seats).toHaveLength(1)
    expect(screen.getByTestId('robotics-ideas').querySelector('[data-step="idea-seat"]')).toHaveAttribute('data-state', 'done')
  })

  it('all four done: "More ideas", a line saying so, and rows that paint, rename and open Code', () => {
    render(<RoboticsPanel />)
    readyBuggyWithIdeasDone()
    const ideas = screen.getByTestId('robotics-ideas')
    expect(screen.getByRole('heading', { name: 'More ideas' })).toBeInTheDocument()
    expect(within(ideas).getAllByRole('listitem').map((item) => item.dataset.step)).toEqual(['ideas-done', 'idea-paint', 'idea-name', 'idea-taller', 'idea-code'])
    expect(ideas).toHaveTextContent('You did all 4 ideas!')

    fireEvent.click(within(ideas).getByRole('button', { name: /Paint it your colors/ }))
    expect(usePaintMode.getState().painting).toBe(true)
    fireEvent.click(within(screen.getByTestId('robotics-paint-bar')).getByRole('button', { name: 'Done painting' }))

    fireEvent.click(within(ideas).getByRole('button', { name: /Give it a name of your own/ }))
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Robot name' }))

    fireEvent.click(within(ideas).getByRole('button', { name: /Make it stop at a wall/ }))
    const section = readRoboticsSection(useBrickStore.getState().documentMetadata.robotics)
    const buggy = section.creations[0]
    expect(useCodeView.getState().creationId).toBe(buggy.id)
    const made = section.programs.filter((program) => program.creationId === buggy.id)
    expect(made.map((program) => program.starter)).toEqual(['stop-before-wall'])
    // A second tap opens the same program rather than making another.
    act(() => useCodeView.getState().closeCode())
    fireEvent.click(within(screen.getByTestId('robotics-ideas')).getByRole('button', { name: /Make it stop at a wall/ }))
    expect(readRoboticsSection(useBrickStore.getState().documentMetadata.robotics).programs).toHaveLength(1)
  })

  it('a done idea stays a button with its tick (paint it again), so the list never ends empty-handed', () => {
    render(<RoboticsPanel />)
    readyBuggyWithIdeasDone()
    fireEvent.click(within(screen.getByTestId('robotics-paint')).getByRole('button', { name: 'Paint red' }))
    fireEvent.click(screen.getByRole('button', { name: /Paint all of/ }))
    const paintIdea = screen.getByTestId('robotics-ideas').querySelector('[data-step="idea-paint"]')!
    expect(paintIdea).toHaveAttribute('data-state', 'done')
    expect(within(paintIdea as HTMLElement).getByRole('button', { name: /Paint it your colors/ })).toBeEnabled()
  })
})
