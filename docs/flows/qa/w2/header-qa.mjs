/**
 * W2 shell QA: the App header gallery section and the landing header in a real Chrome.
 *
 *   PLAYWRIGHT_MODULE=… CHROME_PATH=… UI_ORIGIN=http://localhost:5292 node docs/flows/qa/w2/header-qa.mjs
 *
 * Writes screenshots and `report.json` next to this file (override with UI_OUTPUT).
 * Checks: every header control ≥ 44 CSS px tall at 390 (and the mode pill on coarse pointers), the
 * ⋯ menu and the account menu open on click / ArrowDown, arrow keys move between items, Escape closes and
 * returns focus, no horizontal overflow at 1366 / 1024 / 390, the landing header keeps its mobile menu.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://localhost:5292'
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Local test only.')
const output = process.env.UI_OUTPUT || dirname(fileURLToPath(import.meta.url))
await mkdir(output, { recursive: true })
const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, executablePath })

const report = { origin, generatedAt: new Date().toISOString(), checks: [], errors: [] }
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); if (!ok) console.error('FAIL', name, detail) }

async function open(path, viewport, extra = {}) {
  const context = await browser.newContext({ viewport, ...extra })
  const page = await context.newPage()
  page.on('pageerror', (error) => report.errors.push(`${path}: ${error.message}`))
  await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts?.ready)
  return { context, page }
}

/** Element screenshot extended downwards so an open popover below the header is included. */
async function clipShot(page, locator, path) {
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  await page.screenshot({ path, clip: { x: 0, y: Math.max(0, box.y - 4), width: viewport.width, height: Math.min(viewport.height - Math.max(0, box.y - 4), box.height + 420) } })
}

const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

const VIEWPORTS = [
  { id: '1366x768', width: 1366, height: 768, touch: false },
  { id: '1024x768', width: 1024, height: 768, touch: false },
  { id: '390x844', width: 390, height: 844, touch: true },
]

for (const viewport of VIEWPORTS) {
  const { context, page } = await open('/dev/ui', { width: viewport.width, height: viewport.height }, viewport.touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {})
  const section = page.locator('[data-gallery-section="app-header"]')
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  check(`gallery ${viewport.id} no horizontal overflow`, (await overflow(page)) <= 0)

  for (const role of ['student', 'guest', 'teacher']) {
    await section.getByRole('radio', { name: role[0].toUpperCase() + role.slice(1), exact: true }).click()
    await page.waitForTimeout(150)
    await section.screenshot({ path: join(output, `gallery-app-header-${role}-${viewport.id}.png`) })
  }
  await section.getByRole('radio', { name: 'Student', exact: true }).click()

  // The two gallery menu slots (the role click above closed the default-open ones; one menu is open at a time by design).
  const menus = section.locator('.ui-gallery-menus')
  await menus.getByRole('button', { name: 'This build' }).click()
  await page.waitForTimeout(250)
  check(`gallery ${viewport.id} This build slot opens`, (await menus.getByRole('menu', { name: 'This build' }).count()) === 1)
  await menus.screenshot({ path: join(output, `gallery-menu-this-build-${viewport.id}.png`) })
  await menus.getByRole('button', { name: /^Account:/ }).click()
  await page.waitForTimeout(250)
  check(`gallery ${viewport.id} opening the account slot closes the other menu`, (await menus.getByRole('menu').count()) === 1 && (await menus.getByRole('menu', { name: 'Account' }).count()) === 1)
  await menus.screenshot({ path: join(output, `gallery-menu-account-${viewport.id}.png`) })
  await page.keyboard.press('Escape')

  // Touch targets: every button/link/radio inside the three header frames.
  const small = await section.locator('.ui-gallery-header-frame').evaluateAll((frames) => {
    const out = []
    for (const frame of frames) {
      for (const el of frame.querySelectorAll('a, button, [role="radio"]')) {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (style.display === 'none' || rect.width === 0) continue
        if (rect.height < 44 - 0.5 || rect.width < 44 - 0.5) out.push(`${frame.dataset.variant}: ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 32)} ${Math.round(rect.width)}x${Math.round(rect.height)}`)
      }
    }
    return out
  })
  if (viewport.touch) check(`gallery ${viewport.id} header targets ≥ 44px`, small.length === 0, small.join('; '))
  else report.checks.push({ name: `gallery ${viewport.id} header targets under 44px (mouse, informational)`, ok: true, detail: small.join('; ') })

  // Keyboard on the editor's ⋯ menu.
  const editor = section.locator('[data-variant="editor"]')
  const trigger = editor.getByRole('button', { name: 'This build' })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  const menu = editor.getByRole('menu', { name: 'This build' })
  check(`gallery ${viewport.id} ⋯ opens on ArrowDown`, await menu.isVisible())
  const first = await page.evaluate(() => document.activeElement?.getAttribute('aria-labelledby') && document.getElementById(document.activeElement.getAttribute('aria-labelledby'))?.textContent)
  check(`gallery ${viewport.id} ⋯ focuses the first item`, first === 'Rename', String(first))
  await page.keyboard.press('ArrowDown')
  const second = await page.evaluate(() => document.getElementById(document.activeElement?.getAttribute('aria-labelledby') || '')?.textContent)
  check(`gallery ${viewport.id} ⋯ ArrowDown moves`, second === 'Download build', String(second))
  await page.waitForTimeout(250)
  const menuBox = await menu.boundingBox()
  check(`gallery ${viewport.id} ⋯ popover inside viewport`, menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= viewport.width + 0.5, JSON.stringify(menuBox))
  await clipShot(page, editor, join(output, `editor-world-menu-${viewport.id}.png`))
  await page.keyboard.press('Escape')
  check(`gallery ${viewport.id} ⋯ Escape closes`, !(await menu.isVisible().catch(() => false)))
  check(`gallery ${viewport.id} ⋯ Escape returns focus`, await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'This build')

  // Account menu from the editor chip.
  const chip = editor.getByRole('button', { name: /^Account:/ })
  await chip.click()
  const account = editor.getByRole('menu', { name: 'Account' })
  check(`gallery ${viewport.id} account menu opens`, await account.isVisible())
  await page.waitForTimeout(250)
  const accountBox = await account.boundingBox()
  check(`gallery ${viewport.id} account popover inside viewport`, accountBox && accountBox.x >= 0 && accountBox.x + accountBox.width <= viewport.width + 0.5, JSON.stringify(accountBox))
  await clipShot(page, editor, join(output, `editor-account-menu-${viewport.id}.png`))
  await page.keyboard.press('Escape')
  check(`gallery ${viewport.id} account Escape closes`, !(await account.isVisible().catch(() => false)))

  // Explore via the pill; Build back.
  await editor.getByRole('radio', { name: 'Explore' }).click()
  check(`gallery ${viewport.id} mode pill switches`, await editor.getByRole('radio', { name: 'Explore' }).getAttribute('aria-checked') === 'true')
  await editor.getByRole('radio', { name: 'Build' }).click()

  await context.close()
}

// Landing header (real page).
for (const viewport of VIEWPORTS) {
  const { context, page } = await open('/', { width: viewport.width, height: viewport.height }, viewport.touch ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {})
  check(`landing ${viewport.id} no horizontal overflow`, (await overflow(page)) <= 0)
  const banner = page.getByRole('banner')
  const signin = banner.getByRole('link', { name: 'Sign in' })
  check(`landing ${viewport.id} chip → /join?mode=signin`, (await signin.getAttribute('href')) === '/join?mode=signin')
  const box = await signin.boundingBox()
  if (viewport.touch) check(`landing ${viewport.id} chip ≥ 44px`, box && box.height >= 43.5 && box.width >= 43.5, JSON.stringify(box))
  await banner.screenshot({ path: join(output, `landing-header-${viewport.id}.png`) })
  if (viewport.touch) {
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.waitForTimeout(150)
    check(`landing ${viewport.id} mobile menu opens`, await page.getByRole('link', { name: 'For teachers' }).isVisible())
    await banner.screenshot({ path: join(output, `landing-header-menu-open-${viewport.id}.png`) })
    await page.keyboard.press('Escape')
    check(`landing ${viewport.id} Escape returns focus to Menu`, await page.evaluate(() => document.activeElement?.textContent?.trim()) === 'Menu')
  }
  await context.close()
}

await browser.close()
report.ok = report.checks.every((c) => c.ok) && report.errors.length === 0
await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
console.log(`${report.checks.filter((c) => c.ok).length}/${report.checks.length} checks passed; ${report.errors.length} page errors`)
process.exit(report.ok ? 0 : 1)
