#!/usr/bin/env node
// W1 evidence: screenshots of the component gallery's header, sign-in form and
// sheet at 1366×768 and 390×844, plus 200% zoom, keyboard focus and
// reduced-motion checks. Needs the gallery served at UI_ORIGIN/dev-gallery.html
// (a temporary, untracked Vite entry) or, once the lead wires it, at /dev/ui.
//
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://127.0.0.1:5191 GALLERY_PATH=/dev-gallery.html \
//     node docs/brand/qa/w1/gallery-screens.mjs
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const ORIGIN = process.env.UI_ORIGIN ?? 'http://127.0.0.1:5191'
const PATH = process.env.GALLERY_PATH ?? '/dev/ui'
const OUT = dirname(fileURLToPath(import.meta.url))
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const findings = []

async function shoot(context, name, viewport, { reducedMotion = 'no-preference' } = {}) {
  const page = await context.newPage()
  await page.emulateMedia({ reducedMotion })
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-gallery="header"]')
  await page.evaluate(() => document.fonts.ready)
  const clip = async (selector, file) => {
    const target = page.locator(selector).first()
    await target.scrollIntoViewIfNeeded()
    await target.screenshot({ path: join(OUT, file) })
  }
  findings.push(`${name}: layout viewport ${await page.evaluate(() => window.innerWidth)} CSS px (expected ${viewport.width}); gallery horizontal overflow = ${await page.evaluate(() => document.querySelector('.ui-gallery').scrollWidth > document.querySelector('.ui-gallery').clientWidth)}`)
  await clip('[data-gallery="header"]', `${name}-header.png`)
  await clip('[data-gallery="signin"]', `${name}-signin.png`)
  await page.getByRole('button', { name: 'Open settings sheet' }).click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, `${name}-sheet.png`) })
  // Escape closes the topmost sheet and focus returns to the opener.
  await page.keyboard.press('Escape')
  const focusedAfterEscape = await page.evaluate(() => document.activeElement?.textContent?.trim())
  findings.push(`${name}: after Escape focus is on "${focusedAfterEscape}" (expected the opener)`)
  await page.close()
}

const desktop = { width: 1366, height: 768 }
const phone = { width: 390, height: 844 }
await shoot(await browser.newContext({ viewport: desktop, deviceScaleFactor: 1 }), 'desktop-1366x768', desktop)
await shoot(await browser.newContext({ viewport: phone, deviceScaleFactor: 2, isMobile: true, hasTouch: true }), 'mobile-390x844', phone)

// 200% zoom: emulate by halving the CSS viewport at 2x device pixels (1366×768 at 200% is 683×384 CSS px).
{
  const context = await browser.newContext({ viewport: { width: 683, height: 384 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: join(OUT, 'zoom-200-header-signin.png'), fullPage: false })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth || document.querySelector('.ui-gallery').scrollWidth > document.querySelector('.ui-gallery').clientWidth)
  findings.push(`200% zoom: innerWidth ${await page.evaluate(() => window.innerWidth)} (expected 683)`)
  findings.push(`200% zoom (683 CSS px wide): horizontal overflow = ${overflow}`)
  await page.getByRole('button', { name: 'Open settings sheet' }).click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(300)
  await page.screenshot({ path: join(OUT, 'zoom-200-sheet.png') })
  const footerVisible = await page.evaluate(() => { const r = document.querySelector('.ui-sheet-footer').getBoundingClientRect(); return r.bottom <= window.innerHeight && r.top >= 0 })
  findings.push(`200% zoom: sheet footer fully inside the viewport = ${footerVisible}`)
  await context.close()
}

// Keyboard focus: Tab through the header and confirm a visible ring (outline) on each stop.
{
  const context = await browser.newContext({ viewport: desktop })
  const page = await context.newPage()
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  const stops = []
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab')
    stops.push(await page.evaluate(() => {
      const element = document.activeElement
      const style = getComputedStyle(element)
      return `${element.tagName.toLowerCase()}[${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 24)}] outline=${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`
    }))
  }
  await page.screenshot({ path: join(OUT, 'keyboard-focus-header.png'), clip: { x: 0, y: 0, width: 1366, height: 420 } })
  findings.push('Tab stops: ' + stops.join(' | '))
  // Sheet focus trap: open, Tab many times, focus must stay inside the dialog.
  await page.getByRole('button', { name: 'Open settings sheet' }).click()
  await page.waitForSelector('[role="dialog"]')
  let inside = true
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab')
    inside = inside && (await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')))
  }
  findings.push(`Sheet focus trap held across 14 Tabs = ${inside}`)
  await page.screenshot({ path: join(OUT, 'keyboard-focus-sheet.png') })
  await context.close()
}

// Reduced motion: animations are disabled on the sheet and spinner.
{
  const context = await browser.newContext({ viewport: desktop, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(`${ORIGIN}${PATH}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Open settings sheet' }).click()
  await page.waitForSelector('[role="dialog"]')
  const motion = await page.evaluate(() => ({
    sheet: getComputedStyle(document.querySelector('.ui-sheet')).animationDuration,
    backdrop: getComputedStyle(document.querySelector('.ui-sheet-backdrop')).animationDuration,
    spinner: getComputedStyle(document.querySelector('.ui-spin')).animationName,
  }))
  findings.push(`Reduced motion: sheet animation ${motion.sheet}, backdrop ${motion.backdrop}, spinner animation-name ${motion.spinner}`)
  await page.screenshot({ path: join(OUT, 'reduced-motion-sheet.png') })
  await context.close()
}

await browser.close()
console.log(findings.join('\n'))
