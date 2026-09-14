/** W5 evidence capture: boards 08 (scene/plate) and 10 (custom bricks/color) at desktop and phone widths.
 * Usage: PLAYWRIGHT_MODULE=... CHROME_PATH=... UI_ORIGIN=http://127.0.0.1:5195 UI_OUTPUT=docs/brand/qa/w5/<dir> node docs/brand/qa/w5/capture-boards.mjs
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
    const noOverflow = async (label) => {
      const overflow = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
      assert(overflow.scrollWidth <= overflow.innerWidth, `${label}: horizontal overflow ${overflow.scrollWidth} > ${overflow.innerWidth} at ${width}x${height}`)
      const dialog = page.locator('[role="dialog"][aria-modal="true"]').last()
      if (await dialog.count()) {
        const box = await dialog.boundingBox()
        assert(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, `${label}: dialog outside viewport at ${width}x${height} ${JSON.stringify(box)}`)
      }
    }
    const shot = async (name) => { await page.screenshot({ path: `${output}/${name}-${width}x${height}.png` }) }
    await page.goto(`${origin}/build`)
    await page.getByRole('button', { name: 'World menu', exact: true }).waitFor()
    const guide = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
    if (await guide.count()) await guide.click()

    // Board 08: scene & plate
    await page.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.getByRole('radio', { name: /Toy Room/ }).click()
    await noOverflow('scene sheet')
    await shot('08-scene')
    const plate64 = page.getByRole('button', { name: /64 × 64/ })
    if (await plate64.count()) await plate64.click()
    await shot('08-plate-64')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    results.push({ width, height, sceneSheetFocusRestored: await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute('aria-label')) })

    // Board 10: create a brick
    const drawerToggle = page.getByRole('button', { name: 'Open brick drawer', exact: true })
    if (await drawerToggle.count() && await drawerToggle.isVisible()) await drawerToggle.click()
    await page.getByRole('button', { name: 'Create a brick', exact: true }).click()
    await page.getByRole('dialog', { name: 'Create a brick' }).waitFor()
    await noOverflow('create sheet')
    await shot('10-create-brick')
    await page.getByLabel(/Width/).first().fill('64')
    await page.getByLabel(/Depth/).first().fill('64')
    await page.getByLabel(/Height/).first().fill('192')
    await page.waitForTimeout(150)
    await shot('10-create-brick-max')
    await page.getByLabel(/Width/).first().fill('0')
    await page.waitForTimeout(100)
    await shot('10-create-brick-invalid')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Create a brick' }).waitFor({ state: 'hidden' })

    // Board 10: color picker
    const anyColor = page.getByRole('button', { name: 'Choose any brick color', exact: true })
    if (await anyColor.count() && await anyColor.isVisible()) {
      await anyColor.click()
      await page.getByRole('dialog', { name: 'Choose any color' }).waitFor()
      await noOverflow('color picker')
      await shot('10-color')
      await page.getByRole('textbox', { name: 'Hex color' }).fill('#nope')
      await shot('10-color-invalid')
      await page.getByRole('textbox', { name: 'Hex color' }).fill('#5888DA')
      await page.getByRole('button', { name: 'Apply color' }).click()
      await page.getByRole('dialog', { name: 'Choose any color' }).waitFor({ state: 'hidden' })
    }

    // Board 10: resize (needs a placed, selected brick)
    const closeDrawer = page.getByRole('button', { name: 'Close brick drawer', exact: true })
    if (await closeDrawer.count() && await closeDrawer.isVisible()) await closeDrawer.click()
    const place = page.getByRole('button', { name: 'Place brick', exact: true }).first()
    if (await place.count() && await place.isVisible()) {
      await place.click()
      await page.waitForTimeout(200)
      await page.mouse.click(width / 2, height / 2)
      await page.waitForTimeout(200)
      const resize = page.getByRole('button', { name: /^Resize/ }).first()
      if (await resize.count() && await resize.isVisible()) {
        await resize.click()
        await page.getByRole('dialog', { name: /Resize/ }).waitFor()
        await noOverflow('resize sheet')
        await shot('10-resize')
        await page.keyboard.press('Escape')
      }
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ result: 'passed', output, results }, null, 2))
} finally { await browser.close() }
