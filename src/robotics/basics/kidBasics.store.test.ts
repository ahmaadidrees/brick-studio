import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initialBrush, useBrickStore } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { setRoboticsPrototypeOverride } from '../flag'
import { installRoboticsParts } from '../parts/install'
import { useBasicsStore } from './basicsState'
import { isFarSpot, keepsStudioPlacement, publishBuildView, settledPosition, surfaceHeight } from './sceneSupport'
import { REFUSAL_TEXT } from './support'

/**
 * The studio's move and placement commands with and without the Robot Workshop prototype: with the
 * flag, arrows settle a part on what is under it, Raise/Lower never leave it in the air and a
 * refusal says why in kid words with the bricks in the way; without it, everything is as before.
 */
const initialState = useBrickStore.getInitialState()
const at = (id: string, partId: string, x: number, y: number, z: number): BrickInstance => ({ id, partId, x, y, z, rotation: 0, color: '#fff' })
const plate = at('plate', 'plate_6x8', 28, 0, 26)
const base = at('base', 'brick_2x2', 28, 1, 27)
const onTop = at('top', 'brick_1x2', 29, 4, 28)

function reset(bricks: BrickInstance[], selected: string[] = []) {
  useBrickStore.setState({ ...initialState, bricks, draft: null, activePartId: null, selectedIds: selected, selectedId: selected.at(-1) ?? null, undoStack: [], redoStack: [], toast: null }, true)
  useBasicsStore.setState({ refusal: null, flash: null, farNotice: null, farHover: false })
}
const find = (id: string) => useBrickStore.getState().bricks.find((brick) => brick.id === id)!

beforeAll(() => installRoboticsParts(true))
afterEach(() => setRoboticsPrototypeOverride(null))

describe('the first brush', () => {
  it('the studio starts with a 2 × 4 brick in hand; the prototype with nothing', () => {
    const studio = initialBrush(false)
    expect(studio.activePartId).toBe('brick_2x4')
    expect(studio.draft?.partId).toBe('brick_2x4')
    expect(studio.toast).toBe('Pick a brick, position it over the plate, then place it.')
    expect(initialBrush(true)).toEqual({ activePartId: null, draft: null, toast: null })
  })
})

describe('without the prototype the studio moves exactly as before', () => {
  beforeEach(() => { setRoboticsPrototypeOverride(false); reset([plate, base, onTop], ['top']) })

  it('an arrow keeps the height (the part may hang in the air) and Raise lifts one plate', () => {
    useBrickStore.getState().nudge(1, 0, 0)
    useBrickStore.getState().nudge(1, 0, 0)
    expect(find('top')).toMatchObject({ x: 31, y: 4 })
    useBrickStore.getState().nudge(0, 1, 0)
    expect(find('top').y).toBe(5)
  })

  it('a blocked placement keeps the studio words', () => {
    useBrickStore.setState({ draft: { partId: 'brick_2x2', x: 28, y: 1, z: 27, rotation: 0, color: '#fff' } })
    expect(useBrickStore.getState().placeDraft()).toBe(false)
    expect(useBrickStore.getState().toast).toBe('That placement overlaps another brick or falls outside the plate.')
    expect(useBasicsStore.getState().refusal).toBeNull()
  })
})

describe('with the prototype parts sit on something', () => {
  beforeEach(() => { setRoboticsPrototypeOverride(true); reset([plate, base, onTop], ['top']) })

  it('an arrow off the brick drops the part onto the plate, in one undo step per press', () => {
    useBrickStore.getState().nudge(1, 0, 0)
    expect(find('top')).toMatchObject({ x: 30, y: 1 })
    expect(useBrickStore.getState().undoStack.at(-1)?.label).toBe('Move brick')
  })

  it('Raise refuses to leave it floating and Lower shows what it sits on', () => {
    useBrickStore.getState().nudge(1, 0, 0)
    useBrickStore.getState().nudge(0, 1, 0)
    expect(find('top')).toMatchObject({ x: 30, y: 1 })
    expect(useBrickStore.getState().toast).toBe(REFUSAL_TEXT.cannotFloat)
    useBrickStore.getState().nudge(0, -1, 0)
    expect(useBrickStore.getState().toast).toBe(REFUSAL_TEXT.cannotGoLower)
    expect(useBasicsStore.getState().refusal?.ids).toEqual(['plate'])
  })

  it('an arrow into a taller brick is refused with the brick outlined', () => {
    reset([plate, base, at('p', 'brick_1x1', 31, 1, 28)], ['p'])
    useBrickStore.getState().nudge(-1, 0, 0)
    useBrickStore.getState().nudge(-1, 0, 0)
    expect(find('p')).toMatchObject({ x: 30, y: 1 })
    expect(useBrickStore.getState().toast).toBe(REFUSAL_TEXT.inTheWay)
    expect(useBasicsStore.getState().refusal?.ids).toEqual(['base'])
  })

  it('a moving ghost slides and settles too (no history until it is placed)', () => {
    useBrickStore.getState().startMove()
    expect(useBrickStore.getState().toast).toBe('Drag it to a new spot.')
    useBrickStore.getState().nudge(1, 0, 0)
    expect(useBrickStore.getState().draft).toMatchObject({ x: 30, y: 1 })
    expect(useBrickStore.getState().undoStack).toHaveLength(0)
    expect(useBrickStore.getState().placeDraft()).toBe(true)
    expect(find('top')).toMatchObject({ x: 30, y: 1 })
  })

  it('a blocked placement says why in kid words and outlines what is in the way', () => {
    useBrickStore.setState({ draft: { partId: 'brick_2x2', x: 28, y: 1, z: 27, rotation: 0, color: '#fff' }, selectedIds: [], selectedId: null })
    expect(useBrickStore.getState().placeDraft()).toBe(false)
    expect(useBrickStore.getState().toast).toBe(REFUSAL_TEXT.inTheWay)
    expect(useBasicsStore.getState().refusal?.ids).toEqual(['base'])
    useBrickStore.setState({ draft: { partId: 'brick_2x2', x: 63, y: 0, z: 10, rotation: 0, color: '#fff' } })
    useBrickStore.getState().placeDraft()
    expect(useBrickStore.getState().toast).toBe(REFUSAL_TEXT.offPlate)
  })

  it('a ghost aimed at the side of a brick drops to what is under it', () => {
    useBrickStore.setState({ draft: { partId: 'brick_1x1', x: 30, y: 2, z: 27, rotation: 0, color: '#fff' }, selectedIds: [], selectedId: null })
    const state = useBrickStore.getState()
    expect(settledPosition(state, state.draft!, { x: 30, y: 2, z: 27 })).toEqual({ x: 30, y: 1, z: 27 })
    // A lone wheel and a kit keep the studio's placement.
    expect(keepsStudioPlacement(state, { ...state.draft!, partId: 'robo_wheel' })).toBe(true)
    expect(keepsStudioPlacement({ movingSelection: { originals: [plate], duplicate: true, name: 'Buggy' } }, state.draft!)).toBe(true)
  })

  it('reads the surface a pointer hit stands for, and knows a far spot once the camera publishes its view', () => {
    // On the 2 × 2's top (4 plates, 0.72 world units) the hit stands for its top; on its side, the rounded height.
    expect(surfaceHeight({ x: 0, y: 0.72 + 0.05, z: 0 }, base)).toBe(4)
    expect(surfaceHeight({ x: 0, y: 0.3, z: 0 }, base)).toBe(2)
    expect(surfaceHeight({ x: 0, y: -0.01, z: 0 }, null)).toBe(0)
    const state = useBrickStore.getState()
    const target = { x: -1, y: 0.5, z: -1 }
    expect(isFarSpot(state, { x: -20, y: 0, z: -24 })).toBe(false)
    publishBuildView({ position: { x: 8, y: 7, z: 9 } }, target)
    expect(isFarSpot(state, { x: -20, y: 0, z: -24 })).toBe(true)
    expect(isFarSpot(state, { x: 0, y: 0.18, z: 0 })).toBe(false)
    publishBuildView(null)
    expect(isFarSpot(state, { x: -20, y: 0, z: -24 })).toBe(false)
  })
})
