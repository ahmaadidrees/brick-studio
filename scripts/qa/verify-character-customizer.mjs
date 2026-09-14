/** Real WebGL/customizer QA in an isolated local guest browser. See CHARACTER-CUSTOMIZER-QA.md. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.UI_ORIGIN || 'http://127.0.0.1:5190'
assert(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Local guest test only.')
const output = process.env.UI_OUTPUT || '/tmp/brick-character-customizer-qa'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await context.newPage()
const errors = [], assets = [], checks = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (/\.(glb|gltf)(\?|$)/.test(response.url())) assets.push({ url: response.url(), status: response.status() }) })
const prefKey = 'brick-studio.content-preferences.v1'
const wardrobeKey = 'brick-studio.wardrobe.v1'
const dialog = page.getByRole('dialog', { name: 'Scene & character', exact: true })
async function open() {
  await page.getByRole('button', { name: 'Character', exact: true }).click()
  await dialog.waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(element => element.textContent === 'Character' && element.getAttribute('aria-selected') === 'true'))
}
async function ready() {
  await page.locator('.world-character-sheet-body').evaluate(element => { element.scrollTop = 0 })
  await page.waitForFunction(() => !!document.querySelector('.character-preview canvas') && !document.querySelector('.character-preview__status'))
  // Let the glTF Suspense commit and actual GPU frames reach the framebuffer.
  await page.waitForTimeout(650)
  assert.equal(await page.locator('.character-preview__unavailable:visible').count(), 0)
}
async function shot(name, locator = page.locator('.character-preview__stage')) {
  const data = await locator.screenshot({ path: `${output}/${name}.png` })
  return createHash('sha256').update(data).digest('hex')
}
async function selected(name) {
  assert.equal(await dialog.getByRole('radio', { name: new RegExp(`^${name}`) }).getAttribute('aria-checked'), 'true')
}
async function persist(id) {
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.waitForFunction(([key, id]) => JSON.parse(localStorage.getItem(key) || 'null')?.characterId === id, [prefKey, id])
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefKey)
  await page.reload()
  await page.getByRole('button', { name: 'Character', exact: true }).waitFor()
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefKey), before)
  await open()
  return before
}
try {
  await page.goto(`${origin}/build`)
  await page.getByRole('button', { name: 'Character', exact: true }).waitFor()
  const dismiss = page.getByRole('button', { name: 'Dismiss quick start', exact: true })
  if (await dismiss.count()) await dismiss.click()
  await open()
  await dialog.getByRole('tab', { name: 'Scene', exact: true }).click()
  assert.equal(await dialog.getByRole('tab', { name: 'Scene', exact: true }).getAttribute('aria-selected'), 'true')
  await dialog.getByRole('tab', { name: 'Character', exact: true }).click()
  checks.push({ sceneTabFromCharacterShortcut: 'passed' })
  for (const [id, name] of [['pip', 'Pip'], ['fern', 'Fern'], ['nova', 'Nova']]) {
    await dialog.getByRole('radio', { name: new RegExp(`^${name}`) }).click()
    await ready()
    const hashes = {}
    for (const action of ['Idle', 'Walk', 'Run', 'Jump']) {
      await dialog.getByRole('button', { name: action, exact: true }).click()
      assert.equal(await dialog.getByRole('button', { name: action, exact: true }).getAttribute('aria-pressed'), 'true')
      await page.waitForTimeout(350)
      hashes[action] = await shot(`${id}-${action.toLowerCase()}`)
    }
    assert.equal(new Set(Object.values(hashes)).size, 4, `${name} must render distinct animation samples`)
    await dialog.getByRole('button', { name: 'Idle', exact: true }).click()
    const saved = await persist(id)
    await selected(name)
    checks.push({ character: id, animationSampleHashes: hashes, applyReload: 'passed', saved })
  }
  await dialog.getByRole('radio', { name: /^Toy Figure/ }).click()
  await dialog.getByRole('button', { name: 'Curls', exact: true }).click()
  await dialog.getByRole('button', { name: 'Glasses', exact: true }).click()
  await dialog.getByRole('button', { name: 'Freckles', exact: true }).click()
  await dialog.getByRole('button', { name: 'Overalls', exact: true }).click()
  await ready()
  await shot('toy-curls-glasses')
  await dialog.getByRole('textbox', { name: 'Outfit name', exact: true }).fill('Curly Builder QA')
  await dialog.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await dialog.getByRole('button', { name: 'Favorite Curly Builder QA', exact: true }).click()
  const wardrobe = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), wardrobeKey)
  assert.equal(wardrobe.outfits[0].favorite, true)
  assert.equal(wardrobe.outfits[0].appearance.hair, 'curls')
  assert.equal(wardrobe.outfits[0].appearance.accessory, 'glasses')
  const saved = await persist('toy-figure')
  await selected('Toy Figure')
  for (const name of ['Curls', 'Glasses', 'Freckles', 'Overalls']) assert.equal(await dialog.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(saved.appearance.hair, 'curls')
  assert.equal(saved.appearance.accessory, 'glasses')
  assert.equal(await dialog.getByRole('button', { name: 'Favorite Curly Builder QA', exact: true }).getAttribute('aria-pressed'), 'true')
  await dialog.getByRole('radio', { name: /^Nova/ }).click()
  await dialog.getByRole('button', { name: 'Curly Builder QA', exact: true }).click()
  await selected('Toy Figure')
  assert.equal(await dialog.getByRole('button', { name: 'Curls', exact: true }).getAttribute('aria-pressed'), 'true')
  assert.equal(await dialog.getByRole('button', { name: 'Glasses', exact: true }).getAttribute('aria-pressed'), 'true')
  checks.push({ toyAppearanceApplyReload: 'passed', outfitSaveFavoriteReloadRestore: 'passed', saved, wardrobe })
  for (const [width, height] of [[390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height })
    await page.locator('.world-character-sheet-body').evaluate(element => { element.scrollTop = 0 })
    await ready()
    const layout = await dialog.evaluate(element => {
      const panel = element.getBoundingClientRect()
      const footer = element.querySelector('footer').getBoundingClientRect()
      const outsideX = [...element.querySelectorAll('button,input,[role=radio]')].flatMap(el => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) ? [{ label: el.getAttribute('aria-label') || el.textContent.trim(), left: r.left, right: r.right }] : []
      })
      return { panel: panel.toJSON(), footer: footer.toJSON(), outsideX, viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth }
    })
    checks.push({ mobileWidth: width, layout })
    assert(layout.panel.left >= 0 && layout.panel.top >= 0 && layout.panel.right <= width + 1 && layout.panel.bottom <= height + 1)
    assert(layout.footer.bottom <= height + 1 && layout.footer.top >= 0)
    assert.equal(layout.scrollWidth, width)
    assert.deepEqual(layout.outsideX, [])
    await page.screenshot({ path: `${output}/mobile-${width}-preview.png` })
    await dialog.getByRole('button', { name: 'Glasses', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/mobile-${width}-appearance.png` })
  }
  assert.deepEqual(errors, [])
  assert(assets.some(item => item.url.includes('/pip.glb') && item.status === 200))
  assert(assets.some(item => item.url.includes('/fern.glb') && item.status === 200))
  assert(assets.some(item => item.url.includes('/nova.glb') && item.status === 200))
  await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin, checks, errors, assets }, null, 2))
  console.log(JSON.stringify({ result: 'passed', output, checks, assets }, null, 2))
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin, checks, errors, assets, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
