import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BUILTIN_BRICKS } from '../bricks/builtins'
import { pixelAt, type CostumeSet } from '../costumes/model'
import { CostumePanel } from './CostumePanel'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('undoes a stroke whose first touched pixel already had the paint color', () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: vi.fn(), drawImage: vi.fn(), clearRect: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AA==')
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100 } as DOMRect)
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn()
  const appearance: CostumeSet = {
    version: 1, width: 2, height: 1, fps: 8,
    frames: [{ id: 'one', name: 'Stand', pixels: 'e7473cff00000000' }],
  }
  const definition = { ...BUILTIN_BRICKS[0], appearance }
  const onChange = vi.fn()
  render(<CostumePanel definition={definition} onChange={onChange} />)
  const canvas = screen.getByLabelText('Paint Stand')
  fireEvent.pointerDown(canvas, { clientX: 25, clientY: 50, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 75, clientY: 50, pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
  expect(onChange).toHaveBeenCalledTimes(1)
  const painted = onChange.mock.calls[0][0] as CostumeSet
  expect(pixelAt(painted, painted.frames[0], 1, 0)).toBe('e7473cff')
  fireEvent.click(screen.getByRole('button', { name: 'Undo costume edit' }))
  const restored = onChange.mock.calls[1][0] as CostumeSet
  expect(restored).toEqual(appearance)
})
