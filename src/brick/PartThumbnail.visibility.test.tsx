import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartThumbnail } from './PartThumbnail'
import * as thumbnails from './brickThumbnails'
import { BRICK_PARTS, BRICK_PART_MAP } from './parts'
import { useBrickStore } from './store'

let observers: Array<{ callback: IntersectionObserverCallback; elements: Set<Element> }>
let frames: Map<number, FrameRequestCallback>
let nextFrame: number

function visibility(element: Element, isIntersecting: boolean) {
  const observer = observers.find((candidate) => candidate.elements.has(element))!
  act(() => observer.callback([{ target: element, isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver))
}

function runFrame() {
  const [id, callback] = frames.entries().next().value!
  frames.delete(id)
  act(() => callback(0))
}

beforeEach(() => {
  observers = []
  frames = new Map()
  nextFrame = 1
  vi.stubGlobal('IntersectionObserver', class {
    readonly elements = new Set<Element>()
    constructor(readonly callback: IntersectionObserverCallback) { observers.push(this) }
    observe(element: Element) { this.elements.add(element) }
    unobserve(element: Element) { this.elements.delete(element) }
    disconnect() { this.elements.clear() }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(thumbnails, 'renderPartThumbnail').mockImplementation((part, color) => `data:image/png;${part.id};${color}`)
  vi.spyOn(thumbnails, 'getCachedPartThumbnail').mockReturnValue(undefined)
  useBrickStore.getState().setActiveColor('#e7473c')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('visible thumbnail generation', () => {
  it('does no render work for an offscreen catalogue, then renders only intersecting cards', () => {
    const { container } = render(<>{BRICK_PARTS.map((part) => <PartThumbnail key={part.id} part={part} />)}</>)
    const cards = Array.from(container.querySelectorAll('.part-thumbnail'))
    expect(cards).toHaveLength(BRICK_PARTS.length)
    expect(thumbnails.renderPartThumbnail).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    expect(observers).toHaveLength(1)

    cards.slice(0, 3).forEach((card) => visibility(card, true))
    for (let rendered = 1; rendered <= 3; rendered++) {
      runFrame()
      expect(thumbnails.renderPartThumbnail).toHaveBeenCalledTimes(rendered)
    }
    expect(frames.size).toBe(0)
    expect(container.querySelectorAll('img.part-thumbnail')).toHaveLength(3)
  })

  it('uses the latest colour when entering and cancels stale queued colours', () => {
    const part = BRICK_PART_MAP.brick_2x4
    const { container } = render(<PartThumbnail part={part} />)
    act(() => useBrickStore.getState().setActiveColor('#65b85a'))
    expect(frames.size).toBe(0)
    visibility(container.querySelector('.part-thumbnail')!, true)
    act(() => useBrickStore.getState().setActiveColor('#478bea'))
    runFrame()
    expect(thumbnails.renderPartThumbnail).toHaveBeenCalledExactlyOnceWith(part, '#478bea')
    expect(container.querySelector('img')?.getAttribute('src')).toContain('#478bea')
  })

  it('pauses generation when leaving, resumes with the current colour, and preserves the image node', () => {
    const part = BRICK_PART_MAP.brick_2x4
    const { container } = render(<PartThumbnail part={part} />)
    visibility(container.querySelector('.part-thumbnail')!, true)
    runFrame()
    const image = container.querySelector('img')!
    visibility(image, false)
    act(() => useBrickStore.getState().setActiveColor('#65b85a'))
    expect(frames.size).toBe(0)
    expect(thumbnails.renderPartThumbnail).toHaveBeenCalledTimes(1)
    visibility(image, true)
    runFrame()
    expect(container.querySelector('img')).toBe(image)
    expect(image.getAttribute('src')).toContain('#65b85a')
  })

  it('does not generate after a queued card leaves the viewport or unmounts', () => {
    const { container, unmount } = render(<PartThumbnail part={BRICK_PART_MAP.brick_2x4} />)
    const card = container.querySelector('.part-thumbnail')!
    visibility(card, true)
    visibility(card, false)
    expect(frames.size).toBe(0)
    visibility(card, true)
    unmount()
    expect(frames.size).toBe(0)
    expect(observers.every((observer) => observer.elements.size === 0)).toBe(true)
    expect(thumbnails.renderPartThumbnail).not.toHaveBeenCalled()
  })

  it('loads a cached colour immediately without a GPU generation frame', () => {
    vi.mocked(thumbnails.getCachedPartThumbnail).mockReturnValue('data:image/png;cached')
    const { container } = render(<PartThumbnail part={BRICK_PART_MAP.brick_2x4} />)
    visibility(container.querySelector('.part-thumbnail')!, true)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/png;cached')
    expect(frames.size).toBe(0)
    expect(thumbnails.renderPartThumbnail).not.toHaveBeenCalled()
  })
})
