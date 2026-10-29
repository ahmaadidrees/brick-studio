import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
    noisyFill.on = false

    expect(store.getState().project.design.stage.costumes[0]).toBe(saved)
    expect(screen.getByRole('alert')).toHaveTextContent(/too much detail to save/)
    expect(saveProject(store.getState().project, memoryStorage())).toBe(true)
  })
})
