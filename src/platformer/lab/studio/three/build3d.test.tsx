/**
 * Hackable 3D Build (docs/qa/hackable-3d/D1.md): where a click puts a brick, the edits and their undo, and the drawer.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PLATE, STUD, type LevelDesign3 } from '../../kit3d/contracts3d'
import { HERO3D } from '../../kit3d/engine3d'
import { validateDesign } from '../../core/project'
import { builderSession } from '../builder/session'
import { StudioStore } from '../store'
import { addScenery, build3d, codePlacement, partPlacement, placeCode, removeCode, removeScenery } from './build3d'
import { Drawer3D, PlacingChip3D } from './Drawer3D'
import { createStarter3dProject } from './project3d'

const fresh = () => {
  const store = new StudioStore(createStarter3dProject())
  return { store, history: builderSession(store).history, d: () => store.getState().project.design as LevelDesign3 }
}
const top = { nx: 0, ny: 1, nz: 0 }
afterEach(cleanup)

describe('Hackable 3D Build: where things go', () => {
  it('a build brick goes on the stud under the pointer, stacked on what is there, inside the plate', () => {
    const { d } = fresh()
    // The deck is plate_6x8 × 12 at studs 29..35 × 14..22.
    expect(partPlacement(d(), { x: 0.2, y: 0, z: -12 * STUD, ...top }, 'brick_2x4', 0, '#e7473c')).toEqual({ partId: 'brick_2x4', x: 31, y: 12, z: 18, rotation: 0, color: '#e7473c' })
    // Turned a quarter: 4 studs across, 2 deep, on the plate in front of the Hero.
    expect(partPlacement(d(), { x: 0.2, y: 0, z: 10 * STUD, ...top }, 'brick_2x4', 1, '#e7473c')).toMatchObject({ x: 30, z: 41, y: 0 })
    expect(partPlacement(d(), { x: 19.8, y: 0, z: 0, ...top }, 'brick_2x4', 0, '#e7473c')).toBeNull()
  })

  it('a code brick stands centred on the stud grid, on top of the build', () => {
    const { d } = fresh()
    const at = codePlacement(d(), { x: 0.1, y: 0, z: -12.2 * STUD, ...top }, { w: 2 * STUD, d: 2 * STUD })!
    expect(at.x).toBeCloseTo(0, 9)
    expect(at.y).toBeCloseTo(12 * PLATE, 9)
    expect(at.z).toBeCloseTo(-12 * STUD, 9)
  })
})

describe('Hackable 3D Build: edits and undo', () => {
  it('adds and removes build bricks, each one undo step', () => {
    const { store, history, d } = fresh()
    const n = d().scenery3d.length
    addScenery(store, history, { partId: 'brick_2x2', x: 2, y: 0, z: 2, rotation: 0, color: '#3e83d7' })
    expect(d().scenery3d.length).toBe(n + 1)
    removeScenery(store, history, 0)
    expect(d().scenery3d.length).toBe(n)
    history.undo()
    expect(d().scenery3d.length).toBe(n + 1)
    history.undo()
    expect(d().scenery3d.length).toBe(n)
    history.redo()
    expect(d().scenery3d.at(-1)).toMatchObject({ partId: 'brick_2x2', x: 2, z: 2 })
    expect(validateDesign(d())).toEqual([])
  })

  it('placing a code brick the project lacks adds it (with its code) and a copy; Button + Door adds both', () => {
    const { store, history, d } = fresh()
    const ids = placeCode(store, history, { kind: 'code', key: 'buttonDoor', label: 'a Button and its Door' }, { x: 5 * STUD, y: 0, z: 5 * STUD, ...top })
    expect(ids).toHaveLength(2)
    expect(d().bricks.map((b) => b.id)).toEqual(expect.arrayContaining(['brick3d_button', 'brick3d_door']))
    expect(store.getState().project.workspaces.brick3d_door).toBeDefined()
    const button = d().copies.find((c) => c.brickId === 'brick3d_button')!
    const door = d().copies.find((c) => c.brickId === 'brick3d_door')!
    expect(button.z - door.z).toBeCloseTo(2.5 * STUD, 9)
    expect(door.x).toBeCloseTo(button.x, 9)
    expect(validateDesign(d())).toEqual([])
    history.undo()
    expect(d().copies.some((c) => c.brickId === 'brick3d_door')).toBe(false)
    history.undo()
    expect(d().copies.some((c) => c.brickId === 'brick3d_button')).toBe(false)
    history.redo()
    expect(d().copies.find((c) => c.brickId === 'brick3d_button')!.z).toBeCloseTo(5 * STUD, 9)
    expect(validateDesign(d())).toEqual([])
  })

  it('the Hero and the Goal are one per world: placing again moves them, and the Hero cannot be erased', () => {
    const { store, history, d } = fresh()
    const heroes = () => d().copies.filter((c) => c.brickId === HERO3D)
    placeCode(store, history, { kind: 'code', key: 'hero', label: 'the Hero' }, { x: 3 * STUD, y: 0, z: 3 * STUD, ...top })
    expect(heroes()).toHaveLength(1)
    // A Hero is narrower than a stud: it stands in the middle of the stud under the pointer.
    expect(heroes()[0].x).toBeCloseTo(3.5 * STUD, 9)
    history.undo()
    expect(heroes()[0].z).toBeCloseTo(10 * STUD, 9)
    expect(removeCode(store, history, heroes()[0].id)).toBe(false)
    const goals = () => d().copies.filter((c) => c.brickId === 'brick3d_goal')
    placeCode(store, history, { kind: 'code', key: 'goal', label: 'a Goal' }, { x: -5 * STUD, y: 0, z: 0, ...top })
    expect(goals()).toHaveLength(1)
    expect(removeCode(store, history, goals()[0].id)).toBe(true)
    expect(goals()).toHaveLength(0)
    history.undo()
    expect(goals()).toHaveLength(1)
  })
})

describe('Hackable 3D Build: the drawer', () => {
  it('shows the nine build bricks, the colours and the code bricks; picking arms, and the chip says what a click does', () => {
    const { store, history } = fresh()
    let erasing = false
    render(<>
      <Drawer3D store={store} history={history} erasing={erasing} onErasing={(on) => { erasing = on }} />
      <PlacingChip3D store={store} erasing={false} onErasing={() => undefined} />
    </>)
    for (const label of ['2 × 4', '2 × 2', '1 × 4', 'Plate', 'Big plate', 'Pillar', 'Slope', 'Steps', 'Door']) expect(screen.getByRole('button', { name: new RegExp(`^${label}$`) })).toBeTruthy()
    for (const label of ['Hero', 'Bounce pad', 'Mover', 'Spinner', 'Coin', 'Goal', 'Button + Door']) expect(screen.getByRole('button', { name: new RegExp(label.replace('+', '\\+')) })).toBeTruthy()
    expect(screen.getAllByRole('radio', { name: /Colour/ })).toHaveLength(12)
    fireEvent.click(screen.getByRole('button', { name: /^2 × 4$/ }))
    expect(build3d(store).armed).toMatchObject({ kind: 'part', partId: 'brick_2x4' })
    expect(screen.getByText('Placing a 2 × 4 brick. Click a stud to place it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Turn (R)' }))
    expect(build3d(store).armed).toMatchObject({ rotation: 1 })
    fireEvent.click(screen.getByRole('radio', { name: 'Colour #3e83d7' }))
    expect(build3d(store).armed).toMatchObject({ color: '#3e83d7' })
    fireEvent.click(screen.getByRole('button', { name: /Mover/ }))
    expect(screen.getByText('Placing a Mover. Click where it goes.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(build3d(store).armed).toBeNull()
  })

  it('+ New brick makes a 3D brick of the kid’s own, opens its code, and lists it under Code bricks', () => {
    const { store, history } = fresh()
    render(<Drawer3D store={store} history={history} erasing={false} onErasing={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /New brick/ }))
    const made = store.getState().project.design.bricks.at(-1)! as LevelDesign3['bricks'][number]
    expect(made.name).toBe('My brick 1')
    expect(made.shape3d).toBeDefined()
    expect(store.getState().cardTab).toBe('code')
    expect(screen.getByRole('button', { name: /My brick 1/ })).toBeTruthy()
  })
})
