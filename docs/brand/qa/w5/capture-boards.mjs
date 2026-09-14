/** W5 evidence capture: boards 08 (scene/plate) and 10 (custom bricks, resize, color) at 1366×768, 390×844 and 320×740.
 * Usage: PLAYWRIGHT_MODULE=... CHROME_PATH=... UI_ORIGIN=http://127.0.0.1:5195 UI_OUTPUT=docs/brand/qa/w5/final node docs/brand/qa/w5/capture-boards.mjs
 * Asserts, for every open sheet: no horizontal page overflow, the dialog and its footer fit the viewport after the
 * open animation, every button/input/select inside it is at least 44px tall on touch viewports, Tab stays inside the
 * dialog, and Escape returns focus to the control that opened it. Guest local build only (no accounts, nothing saved).
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5195'
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Local guest builds only.')
const output = process.env.UI_OUTPUT || 'docs/brand/qa/w5/latest'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) })
const results = []
const viewports = (process.env.UI_VIEWPORTS || '1366x768,390x844,320x740').split(',').map((pair) => pair.split('x').map(Number))
try {
  for (const [width, height] of viewports) {
    const touch = width < 700
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const checks = { width, height, sheets: {} }

    const dialog = () => page.locator('[role="dialog"][aria-modal="true"]').last()
    const settle = async () => {
      // Wait for the sheet's open animation so measurements are of the resting layout.
      await dialog().evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {}))))
      await page.locator('.ui-sheet-body').last().evaluate((element) => { element.scrollTop = 0 }).catch(() => {})
    }
    const audit = async (label) => {
      await settle()
      const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
      assert(overflow.scrollWidth <= overflow.innerWidth, `${label}: horizontal overflow ${overflow.scrollWidth} > ${overflow.innerWidth} at ${width}x${height}`)
      const box = await dialog().boundingBox()
      assert(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${label}: dialog outside viewport at ${width}x${height} ${JSON.stringify(box)}`)
      const footer = await dialog().locator('.ui-sheet-footer').boundingBox()
      assert(footer && footer.y + footer.height <= height + 1 && footer.height > 0, `${label}: footer not visible at ${width}x${height} ${JSON.stringify(footer)}`)
      const small = await dialog().evaluate((element) => [...element.querySelectorAll('button, input, select, [role="tab"], [role="radio"]')]
        .filter((control) => control.getClientRects().length && !control.closest('[hidden]'))
        .map((control) => ({ name: control.getAttribute('aria-label') || control.textContent.trim().slice(0, 30), height: control.getBoundingClientRect().height }))
        .filter((control) => control.height < 43.5))
      if (touch) assert.deepEqual(small, [], `${label}: touch targets under 44px at ${width}x${height}`)
      // Tab stays inside the dialog in both directions.
      const inside = []
      for (let step = 0; step < 40; step += 1) {
        await page.keyboard.press(step < 30 ? 'Tab' : 'Shift+Tab')
        inside.push(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"][aria-modal="true"]')))
      }
      assert(inside.every(Boolean), `${label}: focus escaped the dialog at ${width}x${height}`)
      checks.sheets[label] = { box, footerBottom: footer.y + footer.height, smallTargets: small.length }
    }
    const shot = async (name) => { await settle(); await page.screenshot({ path: `${output}/${name}-${width}x${height}.png` }) }
    const escapeRestores = async (label, ...openerNames) => {
      await page.keyboard.press('Escape')
      await dialog().waitFor({ state: 'hidden' })
      const focused = await page.evaluate(() => document.activeElement === document.body ? '<body>' : (document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 40)))
      assert(openerNames.includes(focused), `${label}: focus not restored to ${openerNames.map((name) => `"${name}"`).join(' / ')} (got "${focused}")`)
      checks.sheets[label].escapeRestoredFocusTo = focused
    }

    await page.goto(`${origin}/build`)
    await page.getByRole('button', { name: 'World menu', exact: true }).waitFor()
    const guide = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
    if (await guide.count()) await guide.click()

    // Board 08: scene & plate
    await page.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.getByRole('dialog', { name: 'Scene & character' }).waitFor()
    await page.getByRole('radio', { name: /Toy Room/ }).click()
    await audit('08 scene')
    await shot('08-scene')
    await page.getByRole('button', { name: /^64 × 64$/ }).click()
    await shot('08-plate-64')
    await page.getByRole('tab', { name: 'Character' }).click()
    await shot('08-character-tab')
    await escapeRestores('08 scene', 'Scene')

    // Board 10: create a brick
    const openDrawer = page.getByRole('button', { name: 'Open brick drawer', exact: true })
    if (await openDrawer.count() && await openDrawer.first().isVisible()) await openDrawer.first().click()
    await page.getByRole('button', { name: 'Create a brick', exact: true }).click()
    await page.getByRole('dialog', { name: 'Create a brick' }).waitFor()
    await audit('10 create')
    await shot('10-create-brick')
    await page.getByRole('spinbutton', { name: 'Width (studs)' }).fill('64')
    await page.getByRole('spinbutton', { name: 'Depth (studs)' }).fill('64')
    await page.getByRole('spinbutton', { name: 'Height (plates)' }).fill('192')
    await page.getByLabel('Shape').selectOption('arch')
    await page.waitForTimeout(150)
    await shot('10-create-brick-max')
    await page.getByRole('spinbutton', { name: 'Width (studs)' }).fill('0')
    await page.getByRole('button', { name: 'Create and place' }).click()
    await page.getByRole('alert').first().waitFor()
    await shot('10-create-brick-invalid')
    // On compact layouts the drawer sheet closes when Create opens, so focus returns to the drawer button.
    await escapeRestores('10 create', 'Create a brick', 'Open brick drawer')

    // Board 10: color picker (lives in the drawer / brick sheet)
    const anyColor = page.getByRole('button', { name: 'Choose any brick color', exact: true })
    if (!(await anyColor.count()) || !(await anyColor.first().isVisible())) {
      if (await openDrawer.count() && await openDrawer.first().isVisible()) await openDrawer.first().click()
    }
    if (await anyColor.count() && await anyColor.first().isVisible()) {
      await anyColor.first().click()
      await page.getByRole('dialog', { name: 'Choose any color' }).waitFor()
      await audit('10 color')
      await shot('10-color')
      await page.getByRole('textbox', { name: 'Hex color' }).fill('#nope')
      await shot('10-color-invalid')
      await page.getByRole('textbox', { name: 'Hex color' }).fill('#5888DA')
      await page.getByRole('button', { name: 'Apply color' }).click()
      await page.getByRole('dialog', { name: 'Choose any color' }).waitFor({ state: 'hidden' })
      checks.sheets['10 color'].appliedColorSelected = await anyColor.first().getAttribute('aria-pressed')
    }

    // Board 10: resize (place the armed brick, select it, open Resize)
    const closeDrawer = page.getByRole('button', { name: 'Close brick drawer', exact: true })
    if (await closeDrawer.count() && await closeDrawer.first().isVisible()) await closeDrawer.first().click()
    const place = page.getByRole('button', { name: 'Place brick', exact: true }).first()
    if (await place.count() && await place.isVisible()) {
      await place.click()
      await page.waitForTimeout(200)
      const cancelPlacement = page.getByRole('button', { name: /Cancel placement/ }).first()
      if (await cancelPlacement.count() && await cancelPlacement.isVisible()) await cancelPlacement.click()
      await page.mouse.click(width / 2, height / 2)
      await page.waitForTimeout(250)
      const resize = page.getByRole('button', { name: /^Resize/ }).first()
      if (await resize.count() && await resize.isVisible()) {
        await resize.click()
        await page.getByRole('dialog', { name: /^Resize/ }).waitFor()
        await audit('10 resize')
        await page.getByRole('button', { name: 'Increase width' }).click()
        await shot('10-resize')
        // A rejected resize keeps the sheet open with the real reason inline.
        for (let step = 0; step < 70; step += 1) await page.getByRole('button', { name: 'Increase width' }).click()
        await page.getByRole('button', { name: 'Apply resize' }).click()
        await page.getByRole('alert').waitFor()
        checks.sheets['10 resize'].rejection = await page.getByRole('alert').textContent()
        await shot('10-resize-rejected')
        await escapeRestores('10 resize', await resize.getAttribute('aria-label'))
      } else {
        checks.sheets['10 resize'] = { skipped: 'no selection control visible' }
      }
    }
    assert.deepEqual(errors, [])
    results.push(checks)
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ result: 'passed', output, sheets: results.map((entry) => `${entry.width}x${entry.height}: ${Object.keys(entry.sheets).join(', ')}`) }, null, 2))
} finally { await browser.close() }
