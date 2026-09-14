import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND_MARK_COLORS, BRAND_NAME, BRAND_PALETTE } from '../brand/brand'

/**
 * Link previews and icons live in index.html + public/, none of which the app's component
 * tests touch. This reads the committed sources off disk (paths are relative to the vitest
 * root) and checks that a shared link resolves to real files: every og:/twitter: URL is
 * built from the one public-origin placeholder, and every referenced asset exists in public/
 * with the dimensions the tags declare. It does not run `vite build`; the placeholder
 * substitution itself is Vite's documented HTML env replacement.
 */
declare module 'node:fs' {
  /** Binary read (no encoding), used to check PNG headers in public/. */
  export function readFileSync(path: string): Uint8Array
}

const ORIGIN_PLACEHOLDER = '%VITE_PUBLIC_ORIGIN%'
const html = readFileSync('index.html', 'utf8')
const head = new DOMParser().parseFromString(html, 'text/html').head

function attribute(selector: string, name: string) {
  const element = head.querySelector(selector)
  if (!element) throw new Error(`index.html <head> is missing ${selector}`)
  const value = element.getAttribute(name)
  if (value === null) throw new Error(`${selector} has no ${name} attribute`)
  return value
}

const meta = (property: string) => attribute(`meta[property="${property}"]`, 'content')
const twitter = (name: string) => attribute(`meta[name="${name}"]`, 'content')

/** Maps a root-relative or placeholder-prefixed URL to the file that serves it. */
function publicPath(url: string) {
  const path = url.startsWith(ORIGIN_PLACEHOLDER) ? url.slice(ORIGIN_PLACEHOLDER.length) : url
  expect(path, `${url} must be root-relative so it maps into public/`).toMatch(/^\/[a-z0-9][a-z0-9./-]*$/)
  return `public${path}`
}

function pngDimensions(path: string) {
  const bytes = readFileSync(path)
  expect(Array.from(bytes.subarray(0, 8)), `${path} PNG signature`).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(String.fromCharCode(...bytes.subarray(12, 16)), `${path} IHDR chunk`).toBe('IHDR')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

describe('index.html link previews', () => {
  it('keeps the base document tags', () => {
    expect(attribute('meta[charset]', 'charset').toUpperCase()).toBe('UTF-8')
    expect(attribute('meta[name="viewport"]', 'content')).toContain('width=device-width')
    expect(attribute('meta[name="theme-color"]', 'content')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(attribute('meta[name="description"]', 'content').trim()).not.toBe('')
    expect(head.querySelector('title')?.textContent).toBe(BRAND_NAME)
    expect(html).not.toContain('Brick Studio') // the display name comes from src/brand/brand.ts
  })

  it('declares Open Graph and Twitter card tags built from the single origin placeholder', () => {
    expect(meta('og:type')).toBe('website')
    expect(meta('og:title')).toBe(head.querySelector('title')?.textContent)
    expect(meta('og:description').length).toBeGreaterThan(20)
    expect(meta('og:description').length).toBeLessThanOrEqual(200)
    expect(meta('og:url')).toBe(`${ORIGIN_PLACEHOLDER}/`)
    expect(meta('og:image')).toBe(`${ORIGIN_PLACEHOLDER}/og-image.png`)
    expect(meta('og:image:width')).toBe('1200')
    expect(meta('og:image:height')).toBe('630')
    expect(meta('og:image:alt').trim()).not.toBe('')
    expect(twitter('twitter:card')).toBe('summary_large_image')
    expect(twitter('twitter:title')).toBe(meta('og:title'))
    expect(twitter('twitter:description')).toBe(meta('og:description'))
    expect(twitter('twitter:image')).toBe(meta('og:image'))
  })

  it('uses the placeholder only where an absolute URL is required', () => {
    const placeholderUses = [...html.matchAll(/%VITE_PUBLIC_ORIGIN%/g)].length
    expect(placeholderUses).toBe(3) // og:url, og:image, twitter:image
    expect(html).not.toMatch(/%(?!VITE_PUBLIC_ORIGIN%)[A-Z_]+%/)
    for (const link of head.querySelectorAll('link[href]')) {
      const rel = link.getAttribute('rel') ?? ''
      if (rel === 'preconnect' || rel === 'dns-prefetch') {
        // Resource hints for the Google Fonts hosts named by the @import in src/styles.css.
        expect(link.getAttribute('href')).toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com$/)
        continue
      }
      expect(link.getAttribute('href'), `${link.outerHTML} should be root-relative`).toMatch(/^\//)
    }
  })

  it('resolves og:image to a real 1200x630 PNG in public/', () => {
    const dimensions = pngDimensions(publicPath(meta('og:image')))
    expect(dimensions).toEqual({ width: Number(meta('og:image:width')), height: Number(meta('og:image:height')) })
  })

  it('ships the production origin default so `vite build` emits absolute URLs without setup', () => {
    const env = readFileSync('.env.production', 'utf8')
    const match = env.match(/^VITE_PUBLIC_ORIGIN=(\S+)$/m)
    if (!match) throw new Error('.env.production must define VITE_PUBLIC_ORIGIN')
    const origin = match[1]
    expect(origin).toMatch(/^https:\/\/[a-z0-9.-]+$/)
    expect(new URL(`${origin}${meta('og:image').slice(ORIGIN_PLACEHOLDER.length)}`).href).toBe(`${origin}/og-image.png`)
  })
})

describe('index.html icons and manifest', () => {
  it('links an SVG favicon with a PNG fallback that exist in public/', () => {
    const svg = readFileSync(publicPath(attribute('link[rel="icon"][type="image/svg+xml"]', 'href')), 'utf8')
    expect(svg).toContain('<svg')
    expect(svg).not.toMatch(/<text/i) // wordmark-free: a rename must not require new artwork
    // The favicon is the brand mark: blue upper lobe, coral lower lobe, two studs per lobe.
    expect(svg.toUpperCase()).toContain(BRAND_MARK_COLORS.upper.toUpperCase())
    expect(svg.toUpperCase()).toContain(BRAND_MARK_COLORS.lower.toUpperCase())
    expect(svg.match(/<circle/g)).toHaveLength(4)

    const png = head.querySelector('link[rel="icon"][type="image/png"]')
    if (!png) throw new Error('index.html is missing the PNG favicon fallback')
    const [width, height] = (png.getAttribute('sizes') ?? '').split('x').map(Number)
    expect(pngDimensions(publicPath(png.getAttribute('href') ?? ''))).toEqual({ width, height })
  })

  it('links a 180x180 apple-touch-icon', () => {
    expect(pngDimensions(publicPath(attribute('link[rel="apple-touch-icon"]', 'href')))).toEqual({ width: 180, height: 180 })
  })

  it('links a web app manifest whose icons exist at their declared sizes', () => {
    const manifest = JSON.parse(readFileSync(publicPath(attribute('link[rel="manifest"]', 'href')), 'utf8')) as {
      name: string
      short_name: string
      theme_color: string
      icons: Array<{ src: string; sizes: string; type: string }>
    }
    expect(manifest.name).toBe(BRAND_NAME)
    expect(manifest.short_name).toBe(BRAND_NAME)
    expect(manifest.theme_color.toUpperCase()).toBe(BRAND_PALETTE.warmWhite.toUpperCase())
    expect(manifest.theme_color.toUpperCase()).toBe(attribute('meta[name="theme-color"]', 'content').toUpperCase())
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2)
    for (const icon of manifest.icons) {
      const path = publicPath(icon.src)
      if (icon.type === 'image/png') {
        const [width, height] = icon.sizes.split('x').map(Number)
        expect(pngDimensions(path), icon.src).toEqual({ width, height })
      } else {
        expect(readFileSync(path, 'utf8'), icon.src).toContain('<svg')
      }
    }
  })

  it('allows crawlers via robots.txt', () => {
    expect(readFileSync('public/robots.txt', 'utf8')).toMatch(/^User-agent: \*\s*\nAllow: \/\s*$/m)
  })
})
