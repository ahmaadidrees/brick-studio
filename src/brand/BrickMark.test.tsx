import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BRAND_MARK_COLORS, BRAND_NAME, BRAND_TAGLINE } from './brand'
import { BrickMark, MARK } from './BrickMark'
import { BrandLockup, Wordmark } from './Wordmark'

afterEach(cleanup)

describe('brand constants', () => {
  it('names the product without any domain string', () => {
    expect(BRAND_NAME).toBe('Brickgineers')
    expect(BRAND_TAGLINE).toBe('A room full of possibilities')
    for (const value of Object.values({ BRAND_NAME, BRAND_TAGLINE })) expect(value).not.toMatch(/https?:|\.(com|app|org|dev)\b/)
  })
})

describe('BrickMark', () => {
  it('draws two equal lobes with exactly two aligned studs each, blue over coral', () => {
    const { container } = render(<BrickMark size={48} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('role', 'img')
    expect(screen.getByRole('img', { name: BRAND_NAME })).toBe(svg)
    const lobes = svg.querySelectorAll('path')
    expect(lobes).toHaveLength(2)
    expect(lobes[0].getAttribute('fill')?.toUpperCase()).toBe(BRAND_MARK_COLORS.upper.toUpperCase())
    expect(lobes[1].getAttribute('fill')?.toUpperCase()).toBe(BRAND_MARK_COLORS.lower.toUpperCase())
    // Both lobes use the same outline shape, so they are equal by construction.
    expect(lobes[0].getAttribute('d')?.replace(/\d+(\.\d+)?/g, 'n')).toBe(lobes[1].getAttribute('d')?.replace(/\d+(\.\d+)?/g, 'n'))

    const studs = Array.from(svg.querySelectorAll('circle'))
    expect(studs).toHaveLength(4)
    const upperStuds = studs.filter((stud) => Number(stud.getAttribute('cy')) < MARK.lowerY)
    const lowerStuds = studs.filter((stud) => Number(stud.getAttribute('cy')) >= MARK.lowerY)
    expect(upperStuds).toHaveLength(2)
    expect(lowerStuds).toHaveLength(2)
    // Same columns top and bottom: nothing is tilted or offset.
    expect(upperStuds.map((stud) => stud.getAttribute('cx'))).toEqual(lowerStuds.map((stud) => stud.getAttribute('cx')))
    expect(new Set(upperStuds.map((stud) => stud.getAttribute('cy'))).size).toBe(1)
    expect(new Set(lowerStuds.map((stud) => stud.getAttribute('cy'))).size).toBe(1)
    expect(svg.getAttribute('transform')).toBeNull()
    expect(svg).toHaveAttribute('width', '48')
    expect(svg).toHaveAttribute('height', '48')
  })

  it('offers monochrome and outline variants that use currentColor', () => {
    const { container: mono } = render(<BrickMark variant="mono" />)
    expect(mono.querySelectorAll('path[fill="currentColor"]')).toHaveLength(2)
    expect(mono.querySelectorAll('circle')).toHaveLength(4)
    const { container: outline } = render(<BrickMark variant="outline" />)
    expect(outline.querySelector('g')).toHaveAttribute('stroke', 'currentColor')
    expect(outline.querySelectorAll('circle')).toHaveLength(4)
  })

  it('is decorative when the title is null', () => {
    const { container } = render(<BrickMark title={null} />)
    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg.querySelector('title')).toBeNull()
  })
})

describe('Wordmark and BrandLockup', () => {
  it('renders the wordmark as real text', () => {
    render(<Wordmark size={30} />)
    const text = screen.getByText(BRAND_NAME)
    expect(text.tagName).toBe('SPAN')
    expect(text).toHaveStyle({ fontSize: '30px' })
  })

  it('renders the lockup as a link with a single accessible name', () => {
    render(<BrandLockup href="/" srSuffix="Home" />)
    const link = screen.getByRole('link', { name: `${BRAND_NAME} Home` })
    expect(link).toHaveAttribute('href', '/')
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps the brand name on the mark when the wordmark is hidden', () => {
    render(<BrandLockup wordmark="never" />)
    expect(screen.getByRole('img', { name: BRAND_NAME })).toBeInTheDocument()
    expect(document.querySelector('.brand-wordmark')).toBeNull()
  })
})
