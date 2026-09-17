/**
 * Real WebGL/customizer QA in an isolated local guest browser. See docs/classroom/CHARACTER-CUSTOMIZER-QA.md.
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (localhost only), UI_OUTPUT. See docs/brand/qa/README.md.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'
const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5190', 'local guest test only.')
const output = await outputDir('UI_OUTPUT', '/tmp/brick-character-customizer-qa')
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
const page = await context.newPage()
const errors = [], assets = [], checks = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (/\.(glb|gltf)(\?|$)/.test(response.url())) assets.push({ url: response.url(), status: response.status() }) })
const prefKey = 'brick-studio.content-preferences.v1'
const wardrobeKey = 'brick-studio.wardrobe.v1'
const dialog = page.getByRole('dialog', { name: /^(Character Studio|Scene & character)$/ })
async function open() {
  await page.getByRole('button', { name: 'Character', exact: true }).click()
  await dialog.waitFor()
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${output}/studio-initial.png` })
  await page.waitForFunction(() => [...document.querySelectorAll('[role=tab]')].some(element => element.textContent === 'Character' && element.getAttribute('aria-selected') === 'true'))
}
async function studioTab(name) { await dialog.getByRole('tab', { name, exact: true }).click() }
async function category(name) { await studioTab('Customize'); await dialog.getByRole('button', { name, exact: true }).click() }
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
  await dialog.getByRole('button', { name: 'Use this look', exact: true }).click()
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
  for (const [id, name] of [['classic', 'Classic Builder'], ['toy-figure', 'Toy Figure'], ['robot', 'Robot Hero'], ['pip', 'Pip'], ['fern', 'Fern'], ['nova', 'Nova']]) {
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
    const saved = ['pip', 'fern', 'nova'].includes(id) ? await persist(id) : null
    await selected(name)
    checks.push({ character: id, animationSampleHashes: hashes, applyReload: saved ? 'passed' : 'not checked', saved })
  }
  await dialog.getByRole('radio', { name: /^Toy Figure/ }).click()
  await category('Head')
  await dialog.getByRole('button', { name: 'Curls', exact: true }).click()
  await category('Extras')
  await dialog.getByRole('button', { name: 'Glasses', exact: true }).click()
  await category('Head')
  await dialog.getByRole('button', { name: 'Freckles', exact: true }).click()
  await category('Outfit')
  await dialog.getByRole('button', { name: 'Overalls', exact: true }).click()
  await ready()
  await shot('toy-curls-glasses')
  await page.screenshot({ path: `${output}/desktop-outfit.png` })
  await category('Head')
  await ready()
  await page.screenshot({ path: `${output}/desktop-head.png` })
  await studioTab('My looks')
  await dialog.getByRole('textbox', { name: 'Outfit name', exact: true }).fill('Curly Builder QA')
  await dialog.getByRole('button', { name: 'Save outfit', exact: true }).click()
  await dialog.getByRole('button', { name: 'Favorite Curly Builder QA', exact: true }).click()
  const wardrobe = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), wardrobeKey)
  assert.equal(wardrobe.outfits[0].favorite, true)
  assert.equal(wardrobe.outfits[0].appearance.hair, 'curls')
  assert.equal(wardrobe.outfits[0].appearance.accessory, 'glasses')
  const saved = await persist('toy-figure')
  await selected('Toy Figure')
  for (const [section, names] of [['Head', ['Curls', 'Freckles']], ['Extras', ['Glasses']], ['Outfit', ['Overalls']]]) { await category(section); for (const name of names) assert.equal(await dialog.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true') }
  assert.equal(saved.appearance.hair, 'curls')
  assert.equal(saved.appearance.accessory, 'glasses')
  await studioTab('My looks')
  assert.equal(await dialog.getByRole('button', { name: 'Favorite Curly Builder QA', exact: true }).getAttribute('aria-pressed'), 'true')
  await studioTab('Characters')
  await dialog.getByRole('radio', { name: /^Nova/ }).click()
  await studioTab('My looks')
  await dialog.getByRole('button', { name: 'Curly Builder QA', exact: true }).click()
  await studioTab('Characters')
  await selected('Toy Figure')
  await category('Head')
  assert.equal(await dialog.getByRole('button', { name: 'Curls', exact: true }).getAttribute('aria-pressed'), 'true')
  await category('Extras')
  assert.equal(await dialog.getByRole('button', { name: 'Glasses', exact: true }).getAttribute('aria-pressed'), 'true')
  await category('Head')
  const keepHair = dialog.getByRole('button', { name: /Keep hair.*when mixing/i })
  await keepHair.click()
  await dialog.getByRole('button', { name: 'Mix it up', exact: true }).click()
  assert.equal(await dialog.getByRole('button', { name: 'Curls', exact: true }).getAttribute('aria-pressed'), 'true')
  await dialog.getByRole('button', { name: 'Undo mix', exact: true }).click()
  assert.equal(await dialog.getByRole('button', { name: 'Freckles', exact: true }).getAttribute('aria-pressed'), 'true')
  await dialog.getByRole('button', { name: 'Bun', exact: true }).click()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), prefKey), saved)
  await open()
  await category('Head')
  assert.equal(await dialog.getByRole('button', { name: 'Curls', exact: true }).getAttribute('aria-pressed'), 'true')
  checks.push({ lockSurvivesMix: 'passed', undoMix: 'passed', draftCancel: 'passed' })
  await category('Extras')
  checks.push({ toyAppearanceApplyReload: 'passed', outfitSaveFavoriteReloadRestore: 'passed', saved, wardrobe })
  for (const [width, height] of [[1366, 768], [1024, 600], [768, 1024], [1024, 768], [390, 844], [320, 740]]) {
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
    await page.screenshot({ path: `${output}/layout-${width}x${height}-preview.png` })
    await dialog.getByRole('button', { name: 'Glasses', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/layout-${width}x${height}-appearance.png` })
  }
  for (const [width, height] of [[390, 844], [768, 1024], [1024, 768]]) {
    const touch = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true })
    const touchPage = await touch.newPage()
    touchPage.on('pageerror', error => errors.push(error.message))
    await touchPage.goto(`${origin}/build`)
    await touchPage.getByRole('button', { name: 'Character', exact: true }).waitFor()
    const dismiss = touchPage.getByRole('button', { name: 'Dismiss quick start', exact: true })
    if (await dismiss.count()) await dismiss.click()
    await touchPage.getByRole('button', { name: 'Character', exact: true }).click()
    const touchDialog = touchPage.getByRole('dialog', { name: 'Character Studio', exact: true })
    await touchDialog.getByRole('radio', { name: /^Toy Figure/ }).click()
    await touchDialog.getByRole('tab', { name: 'Customize', exact: true }).click()
    await touchPage.waitForTimeout(1200)
    const bounds = await touchDialog.evaluate(element => {
      const r = element.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrollWidth: document.documentElement.scrollWidth, coarse: matchMedia('(any-pointer: coarse)').matches }
    })
    assert(bounds.coarse)
    assert(bounds.left >= 0 && bounds.right <= width + 1 && bounds.top >= 0 && bounds.bottom <= height + 1)
    assert.equal(bounds.scrollWidth, width)
    await touchPage.screenshot({ path: `${output}/touch-${width}x${height}.png` })
    await touchDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    checks.push({ touchViewport: `${width}x${height}`, bounds, cancel: 'passed' })
    await touch.close()
  }
  assert.deepEqual(errors, [])
  assert(assets.some(item => item.url.includes('/pip.glb') && item.status === 200))
  assert(assets.some(item => item.url.includes('/fern.glb') && item.status === 200))
  assert(assets.some(item => item.url.includes('/nova.glb') && item.status === 200))
  await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin, host: hostSnapshot(), checks, errors, assets }, null, 2))
  console.log(JSON.stringify({ result: 'passed', output, checks, assets }, null, 2))
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png` })
  await writeFile(`${output}/results.json`, JSON.stringify({ checkedAt: new Date().toISOString(), origin, host: hostSnapshot(), checks, errors, assets, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
