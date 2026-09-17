#!/usr/bin/env node
// W1 evidence (second pass): the Sheet primitive scrolls its body under a
// persistent footer at 844×390 (landscape phone, touch) and at 683×384
// (1366×768 at 200% zoom), and the new gallery examples (link buttons,
// pressed toggles, Select, described segmented group, touch targets).
//
//   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://127.0.0.1:5191 node docs/brand/qa/w1/sheet-scroll.mjs
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const ORIGIN = process.env.UI_ORIGIN ?? 'http://127.0.0.1:5191'
const OUT = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true })
const findings = []

async function sheetCheck(name, contextOptions) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/dev/ui`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.getByRole('button', { name: 'Open settings sheet' }).click()
  await page.waitForSelector('[role="dialog"]')
  await page.waitForTimeout(300)
  const before = await page.evaluate(() => {
    const body = document.querySelector('.ui-sheet-body')
    const footer = document.querySelector('.ui-sheet-footer').getBoundingClientRect()
    const panel = document.querySelector('.ui-sheet').getBoundingClientRect()
    const last = Array.from(body.querySelectorAll('.ui-gallery-filler')).at(-1).getBoundingClientRect()
    return {
      bodyScrolls: body.scrollHeight > body.clientHeight,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      overflowY: getComputedStyle(body).overflowY,
      footerInside: footer.top >= 0 && footer.bottom <= window.innerHeight,
      panelInside: panel.top >= 0 && panel.bottom <= window.innerHeight + 1,
      lastVisible: last.bottom <= footer.top,
      innerHeight: window.innerHeight,
      coarse: matchMedia('(pointer: coarse)').matches,
    }
  })
  await page.screenshot({ path: join(OUT, `${name}-sheet-top.png`) })
  await page.evaluate(() => { const body = document.querySelector('.ui-sheet-body'); body.scrollTop = body.scrollHeight })
  await page.waitForTimeout(100)
  const after = await page.evaluate(() => {
    const body = document.querySelector('.ui-sheet-body')
    const footer = document.querySelector('.ui-sheet-footer').getBoundingClientRect()
    const last = Array.from(body.querySelectorAll('.ui-gallery-filler')).at(-1).getBoundingClientRect()
    return { scrollTop: body.scrollTop, lastVisible: last.bottom <= footer.top + 1 && last.top >= 0, footerInside: footer.top >= 0 && footer.bottom <= window.innerHeight }
  })
  await page.screenshot({ path: join(OUT, `${name}-sheet-bottom.png`) })
  findings.push(`${name}: innerHeight ${before.innerHeight}, pointer coarse=${before.coarse}, body overflow-y=${before.overflowY}, scrollHeight ${before.scrollHeight} > clientHeight ${before.clientHeight} → scrolls=${before.bodyScrolls}; footer inside viewport before/after=${before.footerInside}/${after.footerInside}; panel inside=${before.panelInside}; last paragraph reachable after scroll=${after.lastVisible} (scrollTop ${after.scrollTop})`)
  // Sizes of the touch-target rule: sm buttons and segmented options.
  const sizes = await page.evaluate(() => {
    const measure = (selector) => Math.round(document.querySelector(selector).getBoundingClientRect().height)
    return { sm: measure('.ui-sheet .ui-button-sm, .ui-gallery .ui-button-sm'), option: measure('.ui-sheet .ui-segmented-option') }
  })
  findings.push(`${name}: .ui-button-sm ${sizes.sm}px, .ui-segmented-option ${sizes.option}px`)
  await page.keyboard.press('Escape')
  await context.close()
}

await sheetCheck('landscape-844x390', { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await sheetCheck('zoom200-683x384', { viewport: { width: 683, height: 384 }, deviceScaleFactor: 2 })

// New gallery examples at desktop and phone.
for (const [name, options] of [
  ['desktop-1366x768', { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }],
  ['mobile-390x844', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  await page.goto(`${ORIGIN}/dev/ui`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // Measure before the element screenshots: Playwright temporarily resizes the
  // viewport for sections taller than it, which drops the touch emulation.
  const a11y = await page.evaluate(() => {
    const link = document.querySelector('a.ui-button')
    const disabledLink = Array.from(document.querySelectorAll('a.ui-button')).find((element) => element.getAttribute('aria-disabled') === 'true')
    const pressed = document.querySelector('.ui-button-pressed')
    const label = Array.from(document.querySelectorAll('.ui-field-label')).find((element) => element.textContent === 'Name your teacher knows')
    const select = document.querySelector('select.ui-select')
    const group = Array.from(document.querySelectorAll('[role="radiogroup"]')).find((element) => element.getAttribute('aria-describedby'))
    const sm = document.querySelector('[data-variant="secondary"] .ui-button-sm').getBoundingClientRect()
    const option = document.querySelector('[data-gallery-section="segmented"] .ui-segmented-option').getBoundingClientRect()
    const smOption = document.querySelector('[data-gallery-section="segmented"] .ui-segmented-sm .ui-segmented-option').getBoundingClientRect()
    link.focus()
    const ring = getComputedStyle(link)
    return {
      linkHref: link.getAttribute('href'),
      linkRing: `${ring.outlineStyle} ${ring.outlineWidth}`,
      disabledLinkHasHref: disabledLink?.hasAttribute('href'),
      pressedAria: pressed?.getAttribute('aria-pressed'),
      requiredMarkInsideLabel: label?.querySelector('.ui-field-required') !== null,
      requiredMarkPresent: !!label?.parentElement?.querySelector('.ui-field-required'),
      selectHeight: Math.round(select.getBoundingClientRect().height),
      describedBy: document.getElementById(group.getAttribute('aria-describedby'))?.textContent,
      smHeight: Math.round(sm.height),
      optionHeight: Math.round(option.height),
      smOptionHeight: Math.round(smOption.height),
      coarse: matchMedia('(pointer: coarse)').matches,
    }
  })
  findings.push(`${name}: ${JSON.stringify(a11y)}`)
  for (const section of ['buttons', 'fields', 'segmented']) {
    const target = page.locator(`[data-gallery-section="${section}"]`)
    await target.scrollIntoViewIfNeeded()
    await target.screenshot({ path: join(OUT, `${name}-${section}.png`) })
  }
  await context.close()
}

await browser.close()
console.log(findings.join('\n'))
