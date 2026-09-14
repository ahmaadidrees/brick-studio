/**
 * W2 landing QA: boards 01/02/16 in a real Chrome.
 *
 *   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://127.0.0.1:5192 node docs/brand/qa/w2/landing-qa.mjs
 *
 * Writes screenshots and `report.json` next to this file (override with UI_OUTPUT).
 * Checks: six-viewport matrix without horizontal overflow, anchor navigation,
 * keyboard order + visible focus, mobile menu, reduced motion, 200% zoom,
 * Continue-building detection without mutating the draft, and a request log
 * with transfer sizes for the landing route (raw and gzip-estimated).
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5192'
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Local test only.')
const output = process.env.UI_OUTPUT || dirname(fileURLToPath(import.meta.url))
await mkdir(output, { recursive: true })
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, executablePath })

const report = { origin, generatedAt: new Date().toISOString(), viewports: [], checks: [], transfer: null, errors: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); if (!ok) console.error('FAIL', name, detail) }

async function fresh(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, ...options })
  const page = await context.newPage()
  page.on('pageerror', (error) => report.errors.push(error.message))
  return { context, page }
}

async function overflow(page) {
  return page.evaluate(() => {
    const root = document.documentElement
    const landing = document.querySelector('.brick-landing')
    return {
      docOverflow: root.scrollWidth - root.clientWidth,
      landingOverflow: landing ? landing.scrollWidth - landing.clientWidth : 0,
      innerWidth: window.innerWidth,
    }
  })
}

/* ---------------------------------------------------------- viewport matrix --- */
const VIEWPORTS = [
  [1366, 768], [1024, 768], [768, 1024], [390, 844], [320, 740], [844, 390],
]
for (const [width, height] of VIEWPORTS) {
  const { context, page } = await fresh({ viewport: { width, height } })
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('.landing-hero h1')
  const o = await overflow(page)
  const ctaVisible = await page.getByRole('link', { name: 'Start building' }).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    return r.top >= 0 && r.bottom <= window.innerHeight
  })
  const name = `landing-${width}x${height}`
  await page.screenshot({ path: join(output, `${name}.png`) })
  // Board 16: the hero carries its own Sign in link on phones only; wider screens use the header link.
  const heroSignin = await page.locator('.landing-hero-signin a').isVisible()
  const headerSignin = await page.locator('.landing-nav nav a', { hasText: 'Sign in' }).isVisible()
  check(`sign in placement @${width}x${height}`, width <= 760 ? heroSignin && !headerSignin : !heroSignin && headerSignin, JSON.stringify({ heroSignin, headerSignin }))
  if ((width === 1366 && height === 768) || (width === 390 && height === 844)) {
    await unclampForFullPage(page)
    await page.screenshot({ path: join(output, `${name}-full.png`), fullPage: true })
  }
  report.viewports.push({ width, height, ...o, heroCtaVisibleOnLoad: ctaVisible, heroSignin, headerSignin })
  check(`no horizontal overflow @${width}x${height}`, o.docOverflow <= 0 && o.landingOverflow <= 0, JSON.stringify(o))
  await context.close()
}

/* The landing scrolls inside .brick-landing (not the document), so a full-page
   capture temporarily lets that element grow to its content height. */
async function unclampForFullPage(page) {
  await page.evaluate(() => {
    for (const el of [document.querySelector('.brick-landing'), document.getElementById('root'), document.body, document.documentElement]) {
      if (!el) continue
      el.style.height = 'auto'
      el.style.overflow = 'visible'
    }
  })
}

/* ---------------------------------------------------------- board captures --- */
{
  const { context, page } = await fresh()
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.getByRole('link', { name: 'How it works' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(output, 'board-02-how-it-works-1366x768.png') })
  await page.getByRole('link', { name: 'For teachers' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(output, 'board-02-teachers-1366x768.png') })
  await context.close()
}
{
  const { context, page } = await fresh({ viewport: { width: 390, height: 844 } })
  await page.goto(`${origin}/#teachers`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(output, 'board-02-teachers-390x844.png') })
  await page.goto(`${origin}/#how-it-works`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: join(output, 'board-02-how-it-works-390x844.png') })
  await context.close()
}

/* ------------------------------------------------------ anchor navigation --- */
{
  const { context, page } = await fresh()
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  const inView = (id) => page.evaluate((id) => {
    const r = document.getElementById(id).getBoundingClientRect()
    return r.top >= -2 && r.top < window.innerHeight * 0.5
  }, id)
  for (const [label, id] of [['How it works', 'how-it-works'], ['For teachers', 'teachers'], ['See classroom tools', 'teachers'], ['Privacy', 'privacy'], ['Help', 'help']]) {
    await page.getByRole('link', { name: label, exact: true }).first().click()
    await page.waitForTimeout(600)
    const hash = await page.evaluate(() => location.hash)
    check(`anchor "${label}" scrolls #${id} into view`, hash === `#${id}` && (await inView(id)), `hash=${hash}`)
  }
  await context.close()
}

/* Direct deep links resolve on a fresh load too (the page is a lazy chunk,
   so the browser's own fragment scroll finds no target; the page resolves it
   after mount and again once web fonts have swapped in). */
for (const id of ['teachers', 'help', 'how-it-works']) {
  const { context, page } = await fresh()
  await page.goto(`${origin}/#${id}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)
  const top = await page.evaluate((id) => document.getElementById(id).getBoundingClientRect().top, id)
  check(`deep link /#${id} lands on its section`, top >= -2 && top < 200, `top=${top}`)
  const route = await page.evaluate(() => location.pathname)
  check(`deep link /#${id} stays on the landing route`, route === '/', route)
  await context.close()
}

/* ------------------------------------------------- keyboard order and focus --- */
{
  const { context, page } = await fresh()
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  const order = []
  for (let i = 0; i < 9; i += 1) {
    await page.keyboard.press('Tab')
    order.push(await page.evaluate(() => {
      const el = document.activeElement
      const style = getComputedStyle(el)
      return { name: (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), outline: `${style.outlineStyle} ${style.outlineWidth}` }
    }))
  }
  report.keyboardOrder = order
  const names = order.map((o) => o.name)
  check('keyboard order starts with skip link, nav, then hero CTAs',
    names.slice(0, 8).join(' | ') === ['Skip to content', 'Menu', 'How it works', 'For teachers', 'Sign in', 'Join a class', 'Start building', 'Join a class'].join(' | ')
      || names.slice(0, 7).join(' | ') === ['Skip to content', 'How it works', 'For teachers', 'Sign in', 'Join a class', 'Start building', 'Join a class'].join(' | '),
    names.join(' | '))
  check('focus ring is visible on keyboard focus', order.slice(1).every((o) => !o.outline.startsWith('none') && !o.outline.endsWith('0px')), JSON.stringify(order.map((o) => o.outline)))

  // Skip link: visible when focused, and activating it moves focus into main.
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  const skipBox = await page.getByRole('link', { name: 'Skip to content' }).boundingBox()
  check('skip link becomes visible on focus', !!skipBox && skipBox.y >= 0 && skipBox.height > 20, JSON.stringify(skipBox))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(200)
  const hash = await page.evaluate(() => location.hash)
  check('skip link targets main', /^#/.test(hash) && (await page.evaluate((h) => document.querySelector(CSS.escape ? `#${CSS.escape(h.slice(1))}` : h)?.tagName === 'MAIN', hash)), hash)
  await context.close()
}

/* -------------------------------------------------------------- mobile menu --- */
{
  const { context, page } = await fresh({ viewport: { width: 390, height: 844 } })
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  const toggle = page.getByRole('button', { name: 'Menu' })
  check('mobile menu button visible at 390px', await toggle.isVisible())
  check('nav hidden before opening', !(await page.getByRole('link', { name: 'How it works' }).isVisible()))
  await toggle.click()
  check('nav visible after opening', await page.getByRole('link', { name: 'How it works' }).isVisible())
  await page.screenshot({ path: join(output, 'landing-390x844-menu-open.png') })
  const sizes = await page.$$eval('.landing-nav nav a, .landing-menu-toggle, .landing-cta', (els) => els.map((el) => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)] }))
  check('all nav/CTA targets are at least 44px tall', sizes.every(([, h]) => h >= 44), JSON.stringify(sizes))
  const heroOrder = await page.evaluate(() => {
    const y = (sel) => document.querySelector(sel).getBoundingClientRect().top
    return [y('.landing-hero-lede'), y('.landing-hero-stage'), y('.landing-hero-actions'), y('.landing-hero-signin')]
  })
  check('board 16 hero order: headline, art, buttons, Sign in', heroOrder.every((v, i) => i === 0 || v > heroOrder[i - 1]), JSON.stringify(heroOrder))
  await page.keyboard.press('Escape')
  check('Escape closes the menu and returns focus', !(await page.getByRole('link', { name: 'How it works' }).isVisible()) && (await page.evaluate(() => document.activeElement?.textContent?.trim())) === 'Menu')
  await context.close()
}

/* ----------------------------------------------------------- reduced motion --- */
{
  const { context, page } = await fresh({ reducedMotion: 'reduce' })
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  const anim = await page.evaluate(() => {
    const drift = document.querySelector('.landing-drift-a')
    return drift ? getComputedStyle(drift).animationName : 'no-fallback-art'
  })
  check('reduced motion disables drift animation', anim === 'none' || anim === 'no-fallback-art', anim)
  const scroll = await page.evaluate(() => getComputedStyle(document.querySelector('.brick-landing')).scrollBehavior)
  check('reduced motion uses instant scroll', scroll === 'auto', scroll)
  await context.close()
}

/* ------------------------------------------------------------------ 200% zoom --- */
{
  // 1366×768 at 200% browser zoom == 683×384 CSS px with DPR 2.
  const { context, page } = await fresh({ viewport: { width: 683, height: 384 }, deviceScaleFactor: 2 })
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  const o = await overflow(page)
  check('200% zoom: no horizontal overflow', o.docOverflow <= 0 && o.landingOverflow <= 0, JSON.stringify(o))
  await page.screenshot({ path: join(output, 'landing-zoom-200.png') })
  await context.close()
}

/* ----------------------------------------------- continue-building detection --- */
{
  const { context, page } = await fresh()
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  check('first visit shows Start building', (await page.getByRole('link', { name: 'Start building' }).count()) === 3)
  const before = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))
  const draft = JSON.stringify({ version: 1, bricks: [{ id: 'kept' }] })
  await page.evaluate((d) => localStorage.setItem('brick-studio.current-project.v1', d), draft)
  await page.reload({ waitUntil: 'networkidle' })
  check('real local draft shows Continue building', (await page.getByRole('link', { name: 'Continue building' }).count()) === 3)
  const after = await page.evaluate(() => localStorage.getItem('brick-studio.current-project.v1'))
  const keysAfter = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort()))
  check('landing never mutates the draft or adds storage keys', after === draft && keysAfter === JSON.stringify([...JSON.parse(before), 'brick-studio.current-project.v1'].sort()), `${before} -> ${keysAfter}`)
  await context.close()
}

/* ---------------------------------------------------------- transfer sizes --- */
{
  const { context, page } = await fresh()
  const entries = []
  page.on('response', async (response) => {
    const url = response.url()
    if (!url.startsWith(origin)) return
    const status = response.status()
    let bytes = 0
    let gzip = 0
    if (status === 200) {
      try {
        const body = await response.body()
        bytes = body.length
        gzip = gzipSync(body).length
      } catch { /* streamed away */ }
    }
    entries.push({ url: url.slice(origin.length), status, type: response.request().resourceType(), bytes, gzip })
  })
  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const group = (predicate) => entries.filter(predicate).reduce((acc, e) => ({ bytes: acc.bytes + e.bytes, gzip: acc.gzip + e.gzip, count: acc.count + 1 }), { bytes: 0, gzip: 0, count: 0 })
  const media = entries.filter((e) => e.url.startsWith('/brand/media/'))
  report.transfer = {
    html: group((e) => e.type === 'document'),
    script: group((e) => e.type === 'script'),
    stylesheet: group((e) => e.type === 'stylesheet'),
    font: group((e) => e.type === 'font'),
    other: group((e) => !['document', 'script', 'stylesheet', 'font'].includes(e.type) && !e.url.startsWith('/brand/media/')),
    media: { ...group((e) => e.url.startsWith('/brand/media/')), missing: media.filter((e) => e.status !== 200).map((e) => e.url) },
    hero: group((e) => /\/brand\/media\/hero-/.test(e.url)),
    total: group(() => true),
    entries,
  }
  const editorish = entries.filter((e) => e.type === 'script' && /three|BrickStudio|physics|rapier|glb/i.test(e.url))
  check('landing route loads no editor/physics/GLB chunks', editorish.length === 0, editorish.map((e) => e.url).join(', '))
  check('hero media ≤ 250 KB', report.transfer.hero.bytes <= 250 * 1024, `${report.transfer.hero.bytes} B`)
  check('initial media ≤ 600 KB', report.transfer.media.bytes <= 600 * 1024, `${report.transfer.media.bytes} B`)
  await context.close()
}

await browser.close()
report.ok = report.checks.every((c) => c.ok) && report.errors.length === 0
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ ok: report.ok, failed: report.checks.filter((c) => !c.ok).map((c) => c.name), errors: report.errors, transfer: Object.fromEntries(Object.entries(report.transfer).filter(([k]) => k !== 'entries')) }, null, 2))
process.exit(report.ok ? 0 : 1)
