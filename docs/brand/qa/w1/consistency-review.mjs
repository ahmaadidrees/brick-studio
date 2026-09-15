#!/usr/bin/env node
// W1 consistency review (read-only for other lanes). Opens the landing, the
// three entry intents, and the editor's Scene/Character sheets and
// Create-a-brick / colour dialogs at 1366×768 and 390×844, and records:
// fonts in use, legacy variable overrides, non-token colours, focus-ring
// widths through Tab, blur/shadow layers over the WebGL canvas, animations
// still running under prefers-reduced-motion, non-token radii, sub-44px
// touch targets and a text-contrast scan. Output: review/findings.json and a
// few screenshots under review/.
//
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://127.0.0.1:5191 node docs/brand/qa/w1/consistency-review.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const ORIGIN = process.env.UI_ORIGIN ?? 'http://127.0.0.1:5191'
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'review')
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
const findings = {}

const VIEWPORTS = {
  desktop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}

// Everything below runs inside the page.
function audit(scopeSelector) {
  const root = getComputedStyle(document.documentElement)
  const TOKENS = ['--bg', '--surface', '--surface-2', '--text', '--text-muted', '--primary', '--primary-strong', '--primary-soft', '--primary-contrast', '--accent', '--accent-soft', '--selection', '--border', '--border-strong', '--focus', '--warning', '--warning-soft', '--warning-text', '--danger', '--danger-soft', '--danger-text', '--success', '--success-soft', '--backdrop']
  const parse = (value) => {
    const m = value.match(/rgba?\(([^)]+)\)/)
    if (m) { const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1] }
    const h = value.trim().match(/^#([0-9a-f]{3,8})$/i)
    if (h) { let x = h[1]; if (x.length <= 4) x = x.split('').map((c) => c + c).join(''); return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1] }
    return null
  }
  const key = (rgb) => rgb ? `${rgb[0]},${rgb[1]},${rgb[2]}` : null
  const tokenColors = new Map()
  const probe = document.createElement('div')
  document.body.appendChild(probe)
  for (const token of TOKENS) {
    const raw = root.getPropertyValue(token).trim()
    if (!raw) continue
    probe.style.color = raw
    const rgb = parse(getComputedStyle(probe).color)
    if (rgb) tokenColors.set(key(rgb), token)
  }
  probe.remove()
  tokenColors.set('255,255,255', 'white')
  tokenColors.set('0,0,0', 'black')

  const path = (el) => {
    const parts = []
    let node = el
    while (node && node !== document.body && parts.length < 3) {
      const cls = Array.from(node.classList).slice(0, 2).join('.')
      parts.unshift(node.tagName.toLowerCase() + (node.id ? `#${node.id}` : '') + (cls ? `.${cls}` : ''))
      node = node.parentElement
    }
    return parts.join(' > ')
  }
  const scope = scopeSelector ? document.querySelector(scopeSelector) : document.body
  const all = Array.from((scope ?? document.body).querySelectorAll('*')).filter((el) => {
    if (el.closest('canvas, script, style, svg *')) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight
  })

  // Fonts.
  const fonts = {}
  for (const el of all) {
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue
    const family = getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim()
    fonts[family] = fonts[family] ?? { count: 0, examples: [] }
    fonts[family].count += 1
    if (fonts[family].examples.length < 3) fonts[family].examples.push(path(el))
  }

  // Legacy variables overridden below :root.
  const legacyNames = ['--studio-ink', '--studio-muted', '--studio-blue', '--studio-blue-dark', '--studio-panel', '--studio-panel-border', '--studio-panel-shadow', '--studio-control-height', '--studio-control-radius', '--landing-radius', '--landing-ink', '--landing-accent', '--content-picker-ink', '--content-picker-accent', '--classroom-accent', '--live-ink', '--live-blue', '--live-blue-dark', '--live-muted']
  const overrides = []
  const roots = Array.from(document.querySelectorAll('.brick-studio, .brick-landing, .live-world-page, .content-picker, .classroom-sheet, [class*="content-picker"], [class*="classroom"]')).slice(0, 40)
  for (const el of roots) {
    const cs = getComputedStyle(el)
    for (const name of legacyNames) {
      const local = cs.getPropertyValue(name).trim()
      const global = root.getPropertyValue(name).trim()
      if (local && global && local !== global) overrides.push({ element: path(el), name, local, global })
    }
  }

  // Non-token colours (text, background, border) with counts and examples.
  const colours = {}
  const excluded = (el) => !!el.closest('.color-grid, [class*="swatch"], [class*="thumb"], .character-preview, canvas, [class*="palette"], [class*="preview"]')
  for (const el of all) {
    if (excluded(el)) continue
    const s = getComputedStyle(el)
    const entries = [['color', s.color], ['background', s.backgroundColor], ['border', s.borderTopColor]]
    if (s.borderTopWidth === '0px' || s.borderTopStyle === 'none') entries.pop()
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) entries.shift()
    for (const [kind, value] of entries) {
      const rgb = parse(value)
      if (!rgb || rgb[3] === 0) continue
      const k = key(rgb)
      if (tokenColors.has(k)) continue
      const id = `${kind} rgb(${k})`
      colours[id] = colours[id] ?? { count: 0, alpha: rgb[3], examples: [] }
      colours[id].count += 1
      if (colours[id].examples.length < 3) colours[id].examples.push(path(el))
    }
  }

  // Radii on controls and containers.
  const radii = {}
  for (const el of all) {
    if (!el.matches('button, a, input, select, textarea, [role="dialog"], [class*="card"], [class*="panel"], [class*="sheet"], [class*="pill"], [class*="badge"], [class*="chip"]')) continue
    const r = getComputedStyle(el).borderTopLeftRadius
    if (['0px', '8px', '12px', '16px', '999px', '9999px', '50%'].includes(r)) continue
    radii[r] = radii[r] ?? { count: 0, examples: [] }
    radii[r].count += 1
    if (radii[r].examples.length < 3) radii[r].examples.push(path(el))
  }

  // Layers over the canvas with blur or heavy shadow.
  const canvas = document.querySelector('canvas')
  const overCanvas = []
  if (canvas) {
    const c = canvas.getBoundingClientRect()
    for (const el of all) {
      const s = getComputedStyle(el)
      const blur = (s.backdropFilter && s.backdropFilter !== 'none') || /blur/.test(s.filter)
      const shadow = s.boxShadow && s.boxShadow !== 'none'
      if (!blur && !shadow) continue
      const r = el.getBoundingClientRect()
      const intersects = r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top
      if (!intersects) continue
      overCanvas.push({ element: path(el), backdropFilter: s.backdropFilter, filter: s.filter, boxShadow: shadow ? s.boxShadow.slice(0, 80) : 'none' })
    }
  }

  // Animations running.
  const animations = document.getAnimations().filter((a) => a.playState === 'running').map((a) => ({ target: a.effect?.target ? path(a.effect.target) : '?', name: a.animationName ?? a.constructor.name, duration: a.effect?.getTiming().duration, iterations: a.effect?.getTiming().iterations }))

  // Touch targets.
  const small = []
  for (const el of all) {
    if (!el.matches('button, [role="button"], [role="radio"], [role="tab"], input:not([type="hidden"]), select, textarea')) continue
    const r = el.getBoundingClientRect()
    if (r.height < 44 || r.width < 44) small.push({ element: path(el), name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) })
  }

  // Contrast of text against the first opaque ancestor background.
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) }
  const blend = (fg, bg) => fg.map((v, i) => i < 3 ? Math.round(v * fg[3] + bg[i] * (1 - fg[3])) : 1)
  const contrast = []
  for (const el of all) {
    if (excluded(el)) continue
    const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ')
    if (!text) continue
    const s = getComputedStyle(el)
    let fg = parse(s.color)
    if (!fg) continue
    let node = el
    let bg = null
    let layers = []
    while (node && node !== document.documentElement) {
      const ns = getComputedStyle(node)
      if (ns.backgroundImage !== 'none') { bg = null; layers = null; break }
      const c = parse(ns.backgroundColor)
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) { bg = c; break } }
      node = node.parentElement
    }
    if (!layers) continue
    if (!bg) bg = parse(getComputedStyle(document.body).backgroundColor) ?? [255, 255, 255, 1]
    let composed = bg
    for (const layer of layers.reverse()) composed = layer[3] >= 1 ? layer : blend(layer, composed)
    if (fg[3] < 1) fg = blend(fg, composed)
    const size = parseFloat(s.fontSize)
    const bold = parseInt(s.fontWeight, 10) >= 700
    const large = size >= 24 || (size >= 18.66 && bold)
    const r = ratio(fg, composed)
    const needed = large ? 3 : 4.5
    if (r < needed) contrast.push({ element: path(el), text: text.slice(0, 40), fg: `rgb(${key(fg)})`, bg: `rgb(${key(composed)})`, ratio: Math.round(r * 100) / 100, needed, size: Math.round(size), bold })
  }
  contrast.sort((a, b) => a.ratio - b.ratio)

  return { fonts, overrides, colours: Object.fromEntries(Object.entries(colours).sort((a, b) => b[1].count - a[1].count).slice(0, 30)), radii, overCanvas: overCanvas.slice(0, 20), animations: animations.slice(0, 20), small: small.slice(0, 40), smallCount: small.length, contrast: contrast.slice(0, 25), contrastCount: contrast.length }
}

async function focusRings(page, steps, container) {
  const stops = []
  for (let index = 0; index < steps; index += 1) {
    await page.keyboard.press('Tab')
    const stop = await page.evaluate((container) => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const inside = container ? !!el.closest(container) : true
      const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 ? `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}` : 'none'
      const ring = outline !== 'none' || (s.boxShadow && s.boxShadow !== 'none')
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)
      const cls = Array.from(el.classList).slice(0, 2).join('.')
      return { element: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}`, name, outline, boxShadow: outline === 'none' ? s.boxShadow.slice(0, 60) : undefined, ok: outline !== 'none' ? parseFloat(s.outlineWidth) >= 3 : ring, inside }
    }, container)
    if (!stop) continue
    stops.push(stop)
  }
  return stops
}

async function surface(name, options, run) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ ...vp, reducedMotion: options.reducedMotion ?? 'no-preference' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
    try {
      await page.goto(`${ORIGIN}${options.path}`, { waitUntil: 'networkidle' })
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(600)
      const result = await run(page, vpName)
      const scopeSelector = result?.scope ?? null
      if (options.screenshot?.includes(vpName)) await page.screenshot({ path: join(OUT, `${name}-${vpName}.png`) })
      const data = await page.evaluate(audit, scopeSelector)
      const rings = await focusRings(page, options.tabs ?? 14, result?.scope ?? null)
      findings[`${name}/${vpName}`] = { ...data, focus: rings, errors, ...(result?.extra ?? {}) }
    } catch (error) {
      findings[`${name}/${vpName}`] = { error: String(error).slice(0, 300), errors }
    }
    await context.close()
  }
}

const dismissQuickStart = async (page) => {
  const dismiss = page.getByRole('button', { name: 'Dismiss quick start' })
  if (await dismiss.count()) { await dismiss.first().click(); await page.waitForTimeout(200) }
}

await surface('landing', { path: '/', screenshot: ['desktop', 'phone'], tabs: 16 }, async () => ({ scope: '.brick-landing' }))

for (const intent of ['join', 'signin', 'teacher']) {
  await surface(`entry-${intent}`, { path: `/build?classroom=${intent}`, screenshot: intent === 'signin' ? ['desktop', 'phone'] : [], tabs: 10 }, async (page) => {
    await page.waitForSelector('.ui-sheet')
    await page.waitForTimeout(300)
    return { scope: '.ui-sheet-root' }
  })
}

await surface('scene-sheet', { path: '/build', screenshot: ['desktop', 'phone'], tabs: 12 }, async (page) => {
  await dismissQuickStart(page)
  await page.getByRole('button', { name: 'Scene' }).first().click()
  await page.waitForSelector('[role="dialog"] .ui-sheet-body')
  await page.waitForTimeout(400)
  return { scope: '.ui-sheet-root' }
})

await surface('character-sheet', { path: '/build', screenshot: ['desktop'], tabs: 12 }, async (page) => {
  await dismissQuickStart(page)
  await page.getByRole('button', { name: 'Character' }).first().click()
  await page.waitForSelector('[role="dialog"] .ui-sheet-body')
  await page.waitForTimeout(600)
  return { scope: '.ui-sheet-root' }
})

const openDrawerIfNeeded = async (page) => {
  const create = page.getByRole('button', { name: 'Create a brick' })
  if (await create.count() && await create.first().isVisible()) return
  for (const label of [/open brick drawer/i, /^bricks$/i, /brick drawer/i, /^add$/i]) {
    const opener = page.getByRole('button', { name: label })
    if (await opener.count()) { await opener.first().click(); await page.waitForTimeout(300); return }
  }
}

await surface('create-brick', { path: '/build', screenshot: ['desktop', 'phone'], tabs: 12 }, async (page) => {
  await dismissQuickStart(page)
  await openDrawerIfNeeded(page)
  await page.getByRole('button', { name: 'Create a brick' }).first().click()
  await page.waitForSelector('[role="dialog"].ui-sheet, .ui-sheet [role="dialog"], .ui-sheet-root')
  await page.waitForTimeout(400)
  return { scope: '.ui-sheet-root' }
})

await surface('color-dialog', { path: '/build', screenshot: ['desktop'], tabs: 10 }, async (page) => {
  await dismissQuickStart(page)
  await openDrawerIfNeeded(page)
  await page.getByRole('button', { name: 'Choose any brick color' }).first().click()
  await page.waitForSelector('.ui-sheet-root')
  await page.waitForTimeout(400)
  return { scope: '.ui-sheet-root' }
})

// Editor chrome itself (header, drawer, toolbar) without a sheet, so blur/shadow over the canvas is measured.
await surface('editor', { path: '/build', screenshot: ['desktop', 'phone'], tabs: 14 }, async (page) => {
  await dismissQuickStart(page)
  return { scope: null }
})

// Reduced motion: which animations still run on the landing and editor.
await surface('landing-reduced-motion', { path: '/', reducedMotion: 'reduce', screenshot: [], tabs: 0 }, async () => ({ scope: '.brick-landing' }))
await surface('editor-reduced-motion', { path: '/build', reducedMotion: 'reduce', screenshot: [], tabs: 0 }, async (page) => { await dismissQuickStart(page); return { scope: null } })

await browser.close()
writeFileSync(join(OUT, 'findings.json'), JSON.stringify(findings, null, 1))
for (const [name, data] of Object.entries(findings)) {
  if (data.error) { console.log(`\n## ${name}: ERROR ${data.error}`); continue }
  const badRings = data.focus.filter((s) => !s.ok)
  console.log(`\n## ${name}: fonts=${Object.keys(data.fonts).join(', ')} | overrides=${data.overrides.length} | non-token colours=${Object.keys(data.colours).length} | radii=${Object.keys(data.radii).join(',') || 'none'} | overCanvas=${data.overCanvas.length} | animations=${data.animations.length} | small targets=${data.smallCount} | contrast fails=${data.contrastCount} | focus stops=${data.focus.length} bad=${badRings.length} | page errors=${data.errors.length}`)
}
console.log(`\nWrote ${join(OUT, 'findings.json')}`)
