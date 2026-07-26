import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PartThumbnail } from './PartThumbnail'
import { createBrickGeometry } from './geometry'
import { BRICK_PARTS, BRICK_PART_MAP } from './parts'
import { useBrickStore } from './store'

afterEach(() => {
  cleanup()
})

describe('PartThumbnail without WebGL', () => {
  it('falls back to the projected SVG for every part', () => {
    const { container } = render(
      <>{BRICK_PARTS.map((part) => <PartThumbnail key={part.id} part={part} />)}</>,
    )

    expect(container.querySelectorAll('img.part-thumbnail')).toHaveLength(0)
    for (const part of BRICK_PARTS) {
      const thumbnail = container.querySelector<SVGElement>(`svg.part-thumbnail[data-part-id="${part.id}"]`)
      expect(thumbnail, part.id).not.toBeNull()
      expect(thumbnail!.getAttribute('aria-hidden')).toBe('true')
      expect(thumbnail!.querySelectorAll('polygon').length, part.id).toBeGreaterThan(0)
      expect(Number(thumbnail!.dataset.vertexCount), part.id)
        .toBe(createBrickGeometry(part).getAttribute('position').count)
    }
  })

  it('keeps the same element when the active colour changes', () => {
    const part = BRICK_PART_MAP.brick_2x4
    const { container } = render(<PartThumbnail part={part} />)
    const before = container.querySelector('.part-thumbnail')
    expect(before).not.toBeNull()

    act(() => {
      useBrickStore.getState().setActiveColor('#65b85a')
    })

    const after = container.querySelector('.part-thumbnail')
    expect(after).toBe(before)
    expect(useBrickStore.getState().activeColor).toBe('#65b85a')
  })
})
