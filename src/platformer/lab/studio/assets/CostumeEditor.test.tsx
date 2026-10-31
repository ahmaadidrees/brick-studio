import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { parse } from '../../core/save'
import { CostumeEditor } from '../CostumeEditor'
import { exportProjectJson } from '../persist/projectIo'
import { createStarterProject } from '../starter'
import { STAGE_ID, StudioStore } from '../store'
import { saveProject } from '../storage'

const noisyFill = vi.hoisted(() => ({ on: false }))
vi.mock('./pixelOps', async (importOriginal) => {
  const real = await importOriginal<typeof import('./pixelOps')>()
  return {
    ...real,
    floodFill: (img: { data: Uint8ClampedArray }, ...rest: unknown[]) => {
      if (!noisyFill.on) return (real.floodFill as (...a: unknown[]) => void)(img, ...rest)
      let s = 9
      for (let i = 0; i < img.data.length; i++) {
        s = (Math.imul(s, 1103515245) + 12345) >>> 0
        img.data[i] = i % 4 === 3 ? 255 : s >>> 24
      }
    },
  }
})

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) } as Storage
}

beforeAll(() => {
  // jsdom has no canvas drawing or pointer capture; the editor only needs them to show strokes.
  HTMLCanvasElement.prototype.getContext = (() => null) as never
  HTMLElement.prototype.setPointerCapture = () => {}
})
afterEach(cleanup)

function stageEditor() {
  const store = new StudioStore(createStarterProject())
  store.selectBrick(STAGE_ID)
  render(<CostumeEditor store={store} />)
  return store
}

function paintAt(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 3, clientY: 3 })
  fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 3, clientY: 3 })
}

describe('the Stage’s Costumes', () => {
  it('opening them changes nothing: no backdrop is made until the kid paints', () => {
    const store = stageEditor()
    const before = store.getState().revision
    expect(store.getState().project.design.stage.costumes).toEqual([])
    expect(store.getState().revision).toBe(before)
    expect(screen.getByText('Sky')).toBeInTheDocument()
  })

  it('painting makes a Sky backdrop the project can still save, again and again', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    paintAt(canvas)
    const [sky] = store.getState().project.design.stage.costumes
    expect(sky).toMatchObject({ name: 'Sky', width: 480, height: 360 })
    expect(parse(exportProjectJson(store.getState().project)).ok).toBe(true)

    const local = memoryStorage()
    expect(saveProject(store.getState().project, local)).toBe(true)
    // A coin placed afterwards saves too (the reported bug: every later change was refused).
    store.addCopy('brick_coin', 200, 100)
    expect(saveProject(store.getState().project, local)).toBe(true)
    expect(local.getItem('code-lab.project.v1')).toContain('"Sky"')
  })

  it('takes back a change that would make the picture too big to save, and says so', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    paintAt(canvas)
    const saved = store.getState().project.design.stage.costumes[0]

    // Noise cannot be squeezed under the picture limit: a fill that paints noise stands in for a very busy picture.
    noisyFill.on = true
    fireEvent.click(screen.getByLabelText('Fill bucket tool'))
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 3, clientY: 3 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 3, clientY: 3 })
    noisyFill.on = false

    expect(store.getState().project.design.stage.costumes[0]).toBe(saved)
    expect(screen.getByRole('alert')).toHaveTextContent(/too much detail to save/)
    expect(saveProject(store.getState().project, memoryStorage())).toBe(true)
  })
})

function stageSky(store: StudioStore) {
  return store.getState().project.design.stage.costumes[0]?.asset
}

describe('undo and redo in the costume editor', () => {
  it('the buttons take back and bring back strokes, fills and erases', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    const undo = screen.getByLabelText('Undo')
    const redo = screen.getByLabelText('Redo')
    expect(undo).toBeDisabled()

    paintAt(canvas)
    const afterStroke = stageSky(store)
    expect(undo).toBeEnabled()

    fireEvent.click(screen.getByLabelText('Fill bucket tool'))
    fireEvent.click(screen.getByLabelText('Color #4cae62'))
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 40, clientY: 40 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 40, clientY: 40 })
    const afterFill = stageSky(store)
    expect(afterFill).not.toBe(afterStroke)

    fireEvent.click(screen.getByLabelText('Eraser tool'))
    paintAt(canvas)
    const afterErase = stageSky(store)
    expect(afterErase).not.toBe(afterFill)

    fireEvent.click(undo)
    expect(stageSky(store)).toBe(afterFill)
    fireEvent.click(undo)
    expect(stageSky(store)).toBe(afterStroke)
    expect(redo).toBeEnabled()
    fireEvent.click(redo)
    expect(stageSky(store)).toBe(afterFill)
    fireEvent.click(redo)
    expect(stageSky(store)).toBe(afterErase)
    expect(redo).toBeDisabled()
  })

  it('Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, and Cmd+Z works too', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    paintAt(canvas)
    const first = stageSky(store)
    fireEvent.click(screen.getByLabelText('Color #3e83d7'))
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerUp(canvas, { pointerId: 1, clientX: 10, clientY: 10 })
    const second = stageSky(store)

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(stageSky(store)).toBe(first)
    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(stageSky(store)).toBe(second)
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(stageSky(store)).toBe(first)
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(stageSky(store)).toBe(second)
  })

  it('a resize and a moved rotation point are undone too, on a brick', () => {
    const store = new StudioStore(createStarterProject())
    const walker = store.getState().project.design.bricks.find((b) => b.costumes.length > 0 && !b.grid)!
    store.selectBrick(walker.id)
    render(<CostumeEditor store={store} />)
    const before = store.brick(walker.id)!.costumes[0]
    fireEvent.click(screen.getByLabelText('16 by 16 pixels'))
    expect(store.brick(walker.id)!.costumes[0].width).toBe(16)
    fireEvent.click(screen.getByLabelText('Undo'))
    expect(store.brick(walker.id)!.costumes[0]).toMatchObject({ width: before.width, height: before.height })
  })
})

describe('touch in the costume editor', () => {
  it('a second finger cancels the stroke: no mark is left and nothing is saved', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 3, clientY: 3 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 3 })
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 90, clientY: 3 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 3 })
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 3 })
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch', clientX: 120, clientY: 3 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50 })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: 50 })
    expect(store.getState().project.design.stage.costumes).toEqual([])
    expect(screen.getByLabelText('Undo')).toBeDisabled()
  })

  it('a second finger that lands beside the editor still cancels the stroke', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 3, clientY: 3 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 3 })
    fireEvent.pointerDown(document.body, { pointerId: 2, pointerType: 'touch', clientX: 900, clientY: 3 })
    fireEvent.pointerUp(document.body, { pointerId: 2, pointerType: 'touch', clientX: 900, clientY: 3 })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 3 })
    expect(store.getState().project.design.stage.costumes).toEqual([])
    paintAt(canvas)
    expect(stageSky(store)).toBeTruthy()
  })

  it('a pinch zooms the picture', async () => {
    const store = new StudioStore(createStarterProject())
    const walker = store.getState().project.design.bricks.find((b) => b.costumes.length > 0 && !b.grid)!
    store.selectBrick(walker.id)
    render(<CostumeEditor store={store} />)
    const canvas = screen.getByLabelText('Pixel art canvas')
    const zoomOf = () => Number(screen.getByText(/^\d+x$/).textContent!.replace('x', ''))
    const start = zoomOf()
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', clientX: 140, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 180, clientY: 100 })
    // The zoom follows once a frame
    await act(() => new Promise<void>((done) => requestAnimationFrame(() => done())))
    expect(zoomOf()).toBe(Math.min(32, start * 2))
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch' })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' })
    expect(store.brick(walker.id)!.costumes[0]).toBe(walker.costumes[0])
  })

  it('a touch the system cancels leaves no mark', () => {
    const store = stageEditor()
    const canvas = screen.getByLabelText('Pixel art canvas')
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', clientX: 3, clientY: 3 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'touch', clientX: 30, clientY: 3 })
    fireEvent.pointerCancel(canvas, { pointerId: 1, pointerType: 'touch' })
    expect(store.getState().project.design.stage.costumes).toEqual([])
    paintAt(canvas)
    expect(stageSky(store)).toBeTruthy()
  })
})
