/** W6 avatar evidence: renders every character in the real preview (idle + walk) and captures the sheet at three viewports.
 * UI_TAG=before (wave-0 audit) or after (final); UI_OUTPUT picks the folder. */
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5196'
const output = process.env.UI_OUTPUT || 'docs/brand/qa/w6/audit'
const tag = process.env.UI_TAG || 'before'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } })
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
const dialog = page.getByRole('dialog', { name: 'Scene & character', exact: true })
async function open() {
  await page.getByRole('button', { name: 'Character', exact: true }).click()
  await dialog.waitFor()
}
async function ready() {
  await page.waitForFunction(() => !!document.querySelector('.character-preview canvas') && !document.querySelector('.character-preview__status'))
  await page.waitForTimeout(700)
}
// Selecting a card scrolls it into view; sheet captures start from the top of the studio.
async function top() {
  await page.locator('.world-character-sheet-body').evaluate(element => { element.scrollTop = 0 })
  await page.waitForTimeout(200)
}
try {
  await page.goto(`${origin}/build`)
  await page.getByRole('button', { name: 'Character', exact: true }).waitFor()
  const dismiss = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
  if (await dismiss.count()) await dismiss.click()
  await open()
  await ready()
  await top()
  await page.screenshot({ path: `${output}/${tag}-sheet-1366x768.png` })
  for (const [id, name] of [['classic', 'Classic Builder'], ['toy-figure', 'Toy Figure'], ['cc0-hero', 'Robot Hero'], ['pip', 'Pip'], ['fern', 'Fern'], ['nova', 'Nova']]) {
    await dialog.getByRole('radio', { name: new RegExp(`^${name}`) }).click()
    await ready()
    for (const action of ['Idle', 'Walk']) {
      await dialog.getByRole('button', { name: action, exact: true }).click()
      await page.waitForTimeout(action === 'Walk' ? 420 : 300)
      await page.locator('.character-preview__stage').screenshot({ path: `${output}/${tag}-${id}-${action.toLowerCase()}.png` })
    }
    await dialog.getByRole('button', { name: 'Idle', exact: true }).click()
  }
  await dialog.getByRole('radio', { name: /^Toy Figure/ }).click()
  await ready()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(400)
  await top()
  await page.screenshot({ path: `${output}/${tag}-sheet-390x844.png` })
  await page.setViewportSize({ width: 320, height: 740 })
  await page.waitForTimeout(400)
  await top()
  await page.screenshot({ path: `${output}/${tag}-sheet-320x740.png` })
  console.log(JSON.stringify({ result: 'captured', output, errors }))
  if (errors.length) process.exitCode = 1
} catch (error) {
  await page.screenshot({ path: `${output}/${tag}-failure.png` })
  throw error
} finally { await browser.close() }
