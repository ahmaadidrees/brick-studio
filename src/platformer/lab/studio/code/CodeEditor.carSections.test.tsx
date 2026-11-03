/**
 * The Car's Code opens like the Hero's (docs/qa/hackable-modes/R1-SCREENS.md, lane 3): its start, countdown and
 * last-lap scripts on top, and one "How I drive" entry that opens its driving scripts as a list.
 */
import * as Blockly from 'blockly/core'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkspaceBlockJson, WorkspaceJson } from '../../core/editor/compile'
import { CodeEditor } from '../CodeEditor'
import { CAR_BRICK_ID, carDrivingLabels } from '../race/carBrick'
import { createRaceStarterProject } from '../race/raceProject'
import { compileBrickEdit } from '../remix'
import { StudioStore, type StudioProject } from '../store'
import { getLabel } from './affordances'

afterEach(cleanup)

/** "My Car": the Car with one block of the kid's own, as the editor's first change makes it. */
function remixCar(project: StudioProject): StudioProject {
  const workspace = structuredClone(project.workspaces[CAR_BRICK_ID]) as WorkspaceJson
  const roots = (Array.isArray(workspace.blocks) ? workspace.blocks : workspace.blocks!.blocks!) as WorkspaceBlockJson[]
  roots.push({ id: 'kid_block', type: 'event_whenkeypressed', x: 900, y: 20, next: { block: { id: 'kid_say', type: 'looks_show' } } } as WorkspaceBlockJson)
  return compileBrickEdit(project, CAR_BRICK_ID, workspace).project
}

async function openCar(project = createRaceStarterProject()) {
  const store = new StudioStore(project)
  store.openCode(CAR_BRICK_ID)
  const view = render(<CodeEditor store={store} docked />)
  await act(async () => { await Blockly.renderManagement.finishQueuedRenders() })
  const ws = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg
  return { store, ws, view }
}

const isDriving = (b: Blockly.Block) => carDrivingLabels().has(getLabel(b))
const shownIds = (ws: Blockly.WorkspaceSvg) => ws.getTopBlocks(false).filter((b) => b.getSvgRoot().style.display !== 'none').map((b) => b.id)
const shownTypes = (ws: Blockly.WorkspaceSvg) => shownIds(ws).map((id) => ws.getBlockById(id)!.type)

describe('the Car\'s code: driving folded into "How I drive"', () => {
  it('opens on the start, the countdown and the last lap, and one "How I drive" entry that opens as a list', async () => {
    const { ws } = await openCar()
    const driving = ws.getTopBlocks(false).filter(isDriving)
    expect(driving.length).toBe(carDrivingLabels().size)

    const entry = screen.getByRole('button', { name: /How I drive/ })
    expect(entry).toHaveTextContent(`How I drive · ${driving.length} scripts`)
    expect(shownTypes(ws).sort()).toEqual(['event_whenbroadcastreceived', 'event_whenflagclicked', 'race_whenlap'])

    fireEvent.click(entry)
    const trail = () => screen.getByRole('navigation', { name: 'Where you are' })
    expect(within(trail()).getByRole('button', { name: "Car's scripts" })).toBeInTheDocument()
    expect(within(trail()).getByText('How I drive')).toHaveAttribute('aria-current', 'page')
    const list = screen.getByRole('region', { name: /How I drive: \d+ scripts/ })
    expect(within(list).getAllByRole('listitem')).toHaveLength(driving.length)
    expect(list).toHaveTextContent('Split my speed')
    expect(list).not.toHaveTextContent(/\btick\b/)
    expect(shownIds(ws)).toEqual([])

    // A row: that script alone, with its short name in the trail.
    const steer = driving.find((b) => getLabel(b).startsWith('Steer:'))!
    fireEvent.click(within(list).getByRole('button', { name: /^Steer\b/ }))
    expect(shownIds(ws)).toEqual([steer.id])
    expect(within(trail()).getByText('Steer')).toHaveAttribute('aria-current', 'page')
    expect(trail()).toHaveTextContent(/Car's scripts.*How I drive.*Steer/)

    // Back: the list, then the top.
    fireEvent.click(within(trail()).getByRole('button', { name: /Back/ }))
    fireEvent.click(within(trail()).getByRole('button', { name: /Back/ }))
    expect(screen.queryByRole('navigation', { name: 'Where you are' })).toBeNull()
  }, 60000)

  it('folds "My Car" too, and keeps the kid\'s own script on the top view', async () => {
    const project = remixCar(createRaceStarterProject())
    const car = project.design.bricks.find((b) => b.id === CAR_BRICK_ID)!
    expect(car.name).toBe('My Car')
    const { ws } = await openCar(project)
    expect(screen.getByRole('button', { name: /How I drive/ })).toHaveTextContent(`How I drive · ${carDrivingLabels().size} scripts`)
    expect(shownIds(ws)).toContain('kid_block')
    fireEvent.click(screen.getByRole('button', { name: /How I drive/ }))
    expect(within(screen.getByRole('navigation', { name: 'Where you are' })).getByRole('button', { name: "My Car's scripts" })).toBeInTheDocument()
    expect(shownIds(ws)).not.toContain('kid_block')
  }, 60000)
})
