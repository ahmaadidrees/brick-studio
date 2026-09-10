import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THUMBNAIL_CACHE_CHARACTER_LIMIT,
  THUMBNAIL_CACHE_LIMIT,
  disposePartThumbnails,
  getCachedPartThumbnail,
  partThumbnailCacheSize,
  renderPartThumbnail,
} from './brickThumbnails'
import { BRICK_PART_MAP } from './parts'

const { renderSpy } = vi.hoisted(() => ({ renderSpy: vi.fn() }))
vi.mock('three', async (importOriginal) => ({
  ...await importOriginal<typeof import('three')>(),
  WebGLRenderer: class {
    domElement: HTMLCanvasElement
    constructor({ canvas }: { canvas: HTMLCanvasElement }) { this.domElement = canvas }
    setSize() {}
    setClearColor() {}
    render = renderSpy
    dispose() {}
    forceContextLoss() {}
  },
}))

const part = BRICK_PART_MAP.brick_2x4
const colorAt = (index: number) => `#${index.toString(16).padStart(6, '0')}`

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as ReturnType<HTMLCanvasElement['getContext']>)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;encoded')
  renderSpy.mockClear()
})

afterEach(() => {
  disposePartThumbnails()
  vi.restoreAllMocks()
})

describe('bounded thumbnail PNG cache', () => {
  it('reuses colours without rendering, evicts the least recently used entry, and can render it again', () => {
    for (let index = 0; index < THUMBNAIL_CACHE_LIMIT; index++) renderPartThumbnail(part, colorAt(index))
    expect(partThumbnailCacheSize()).toBe(THUMBNAIL_CACHE_LIMIT)
    expect(renderSpy).toHaveBeenCalledTimes(THUMBNAIL_CACHE_LIMIT)
    renderPartThumbnail(part, colorAt(0))
    expect(renderSpy).toHaveBeenCalledTimes(THUMBNAIL_CACHE_LIMIT)
    renderPartThumbnail(part, colorAt(THUMBNAIL_CACHE_LIMIT))
    expect(getCachedPartThumbnail(part, colorAt(1))).toBeUndefined()
    expect(getCachedPartThumbnail(part, colorAt(0))).toBeDefined()
    expect(partThumbnailCacheSize()).toBe(THUMBNAIL_CACHE_LIMIT)
    renderPartThumbnail(part, colorAt(1))
    expect(renderSpy).toHaveBeenCalledTimes(THUMBNAIL_CACHE_LIMIT + 2)
  })

  it('also bounds encoded storage when individual PNGs are unusually large', () => {
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue('x'.repeat(THUMBNAIL_CACHE_CHARACTER_LIMIT / 2 + 1))
    renderPartThumbnail(part, colorAt(0))
    renderPartThumbnail(part, colorAt(1))
    expect(partThumbnailCacheSize()).toBe(1)
    expect(getCachedPartThumbnail(part, colorAt(0))).toBeUndefined()
    expect(getCachedPartThumbnail(part, colorAt(1))).toBeDefined()
  })

  it('returns oversized images without retaining them and resets storage accounting on disposal', () => {
    const large = 'x'.repeat(THUMBNAIL_CACHE_CHARACTER_LIMIT + 1)
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue(large)
    expect(renderPartThumbnail(part, colorAt(0))).toBe(large)
    expect(partThumbnailCacheSize()).toBe(0)
    vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockReturnValue('small')
    renderPartThumbnail(part, colorAt(0))
    disposePartThumbnails()
    expect(partThumbnailCacheSize()).toBe(0)
    renderPartThumbnail(part, colorAt(1))
    expect(partThumbnailCacheSize()).toBe(1)
  })
})
