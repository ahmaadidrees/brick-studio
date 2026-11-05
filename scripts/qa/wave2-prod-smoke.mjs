/**
 * Wave 2 release smoke test on the live site (docs/qa/release-2026-11-04-wave2), guests only, UI only: production has
 * no dev hooks, so everything is clicks, keys and what the page shows.
 *
 * 1. The landing page and every Make a game picker button.
 * 2. Rooms (README section 9): Ana opens a Hackable Platformer and Play together; Ben and Cy join from the link; Ben
 *    places a Coin; Ana lets Ben code and he presses Code at once (nothing is sent); Ben switches the Walker's script
 *    off (everyone hears it).
 * 3. A game from nothing in a room: Ana draws Zip and plays together; Ben joins; Ana lets Ben code; Ben gives Zip a
 *    job.
 * 4. /3d/hackable plays; classic /2d/build opens.
 * 5. No console errors anywhere.
 *
 *   SITE=https://brickgineers.com node scripts/qa/wave2-prod-smoke.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadChromium } from './lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const site = (process.env.SITE ?? 'https://brickgineers.com').replace(/\/$/, '')
const output = process.env.UI_OUTPUT ?? path.join(here, '../../docs/qa/release-2026-11-04-wave2/shots')
await mkdir(output, { recursive: true })
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }))
const report = { site, steps: [] }
let failed = 0
const IGNORED = [/favicon/i, /Download the React DevTools/, /GPU stall/]
const everyone = []
/** Run only some sections: SECTIONS=ways,rooms,blank,solo (default all). */
const only = new Set((process.env.SECTIONS ?? 'ways,rooms,blank,solo').split(','))

async function step(name, fn) {
  try {
    const detail = await fn()
    report.steps.push({ name, ok: true, ...(detail !== undefined ? { detail } : {}) })
    console.log(`ok   ${name}${detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 240)}` : ''}`)
  } catch (error) {
    failed++
    report.steps.push({ name, ok: false, error: String(error?.message ?? error).slice(0, 400) })
    console.log(`FAIL ${name}: ${String(error?.message ?? error).slice(0, 400)}`)
  }
}
async function person(name, viewport = { width: 1280, height: 800 }) {
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message ?? e).slice(0, 300)}`))
  const k = { name, context, page, errors }
  everyone.push(k)
  return k
}
const shot = (k, name) => k.page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 74 })
/** The middle of the level canvas, plus an offset in screen pixels. */
async function stagePoint(page, dx = 0, dy = 0) {
  const box = await page.locator('canvas.stage-canvas').first().boundingBox()
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy }
}
async function changes(page) {
  await page.getByRole('button', { name: 'Changes' }).click()
  await page.waitForTimeout(400)
  const items = await page.getByRole('menuitem').allTextContents().catch(() => [])
  await page.keyboard.press('Escape')
  return items.map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
async function join(k, link) {
  await k.page.goto(link)
  await k.page.getByRole('textbox', { name: 'Your name' }).fill(k.name)
  await k.page.getByRole('button', { name: /^(Join|Rejoin)$/ }).click()
  await k.page.getByRole('region', { name: 'Playing together' }).waitFor({ timeout: 30000 })
  await k.page.waitForTimeout(2500)
}
async function playTogether(page) {
  await page.getByRole('button', { name: /This project/ }).click()
  await page.getByRole('menuitem', { name: /Play together/ }).click()
  const link = page.getByRole('textbox', { name: 'Link to join' })
  await link.waitFor({ timeout: 30000 })
  return link.inputValue()
}
async function letCode(page, who) {
  await page.getByRole('button', { name: 'Room', exact: true }).click()
  await page.getByRole('menuitem', { name: `Let ${who} change code` }).click()
}

// ------------------------------------------------------------------------------------------------ 1. ways in

if (only.has('ways')) {
  const k = await person('Visitor')
  const picks = [
    ['Platformer: Start', (d) => d.getByRole('button', { name: 'Start a platformer' }), '/2d/build'],
    ['Platformer: code inside', (d) => d.locator('.projects-game').filter({ hasText: 'Platformer' }).getByRole('button', { name: /code inside/ }), '/2d/hackable'],
    ['Racing: Start', (d) => d.getByRole('button', { name: 'Start a race' }), '/2d/build'],
    ['Racing: code inside', (d) => d.locator('.projects-game').filter({ hasText: 'Racing' }).getByRole('button', { name: /code inside/ }), '/2d/hackable-race'],
    ['3D: Start', (d) => d.locator('.projects-3d-start'), '/build'],
    ['3D: code inside', (d) => d.locator('.projects-3d-other'), '/3d/hackable'],
    ['From nothing', (d) => d.getByRole('button', { name: 'Start from nothing' }), '/2d/hackable-blank'],
  ]
  await step('Landing shows Platformer, Racing, Start from nothing and 3D', async () => {
    await k.page.goto(site + '/')
    await k.page.locator('.landing-make').first().waitFor({ timeout: 30000 })
    await shot(k, '1-landing')
    return {
      fromNothing: await k.page.getByRole('link', { name: 'Start from nothing' }).getAttribute('href'),
      threeD: await k.page.getByRole('link', { name: 'Start building in 3D' }).getAttribute('href'),
      cards: await k.page.locator('.landing-game-open').count(),
    }
  })
  for (const [name, find, want] of picks) {
    await step(`Picker → ${name} opens ${want}`, async () => {
      await k.page.goto(site + '/')
      await k.page.locator('.landing-make').first().click()
      const dialog = k.page.getByRole('dialog').first()
      await dialog.waitFor({ timeout: 20000 })
      await find(dialog).first().click()
      await k.page.waitForURL((u) => u.pathname === want, { timeout: 30000 })
      await k.page.getByRole('button', { name: /This project/ }).first().waitFor({ timeout: 45000 })
      return new URL(k.page.url()).pathname + new URL(k.page.url()).search
    })
  }
}

// ------------------------------------------------------------------------------------------------ 2. rooms

if (only.has('rooms')) {
  const ana = await person('Ana')
  const ben = await person('Ben')
  const cy = await person('Cy')
  let link
  await step('Ana: a new Hackable Platformer, This project → Play together', async () => {
    await ana.page.goto(site + '/2d/hackable?new=1')
    await ana.page.getByRole('radio', { name: /Build/ }).waitFor({ timeout: 45000 })
    link = await playTogether(ana.page)
    return { link: link.replace(/r\/[a-f0-9]+/, 'r/<room>') }
  })
  for (const k of [ben, cy]) await step(`${k.name} joins from the link`, async () => { await join(k, link) })
  await step('Ben places a Coin from the drawer; it is in Ana\'s Changes', async () => {
    await ben.page.getByRole('radio', { name: /Build/ }).click()
    await ben.page.getByRole('region', { name: 'Bricks' }).getByRole('button', { name: /^Coin\b/ }).first().click()
    const p = await stagePoint(ben.page, 0, -60)
    await ben.page.mouse.click(p.x, p.y)
    await ben.page.keyboard.press('Escape')
    await ana.page.waitForTimeout(2500)
    const list = await changes(ana.page)
    if (!list.some((t) => /Ben placed Coin/.test(t))) throw new Error(JSON.stringify(list))
    return list
  })
  await shot(ana, '2-room-ana-after-ben-built')
  await step('Ana lets Ben code; he presses Code at once; nothing is sent', async () => {
    const codeTab = ben.page.getByRole('radio', { name: /Code/ })
    const closed = await codeTab.isDisabled()
    const before = (await changes(ana.page)).length
    await letCode(ana.page, 'Ben')
    await ben.page.waitForFunction(() => !document.querySelector('[role="radio"][aria-disabled="true"]') || true)
    for (let i = 0; i < 40 && (await codeTab.isDisabled()); i++) await ben.page.waitForTimeout(250)
    await codeTab.click()
    await ben.page.waitForTimeout(3500)
    const after = await changes(ana.page)
    if (after.length !== before) throw new Error(`opening Code sent: ${JSON.stringify(after)}`)
    return { closedBefore: closed, changes: after.length }
  })
  await step('Ben switches the Walker\'s script off: everyone hears it', async () => {
    await ben.page.getByRole('region', { name: 'In this level' }).getByRole('listitem').filter({ hasText: 'Walker' }).first().click()
    await ben.page.waitForTimeout(1200)
    await ben.page.locator('.code-script-switch').first().dispatchEvent('click')
    await cy.page.getByText(/Ben changed Walker’s code/).first().waitFor({ timeout: 20000 })
    return 'Cy: "Ben changed Walker’s code…"'
  })
  await shot(cy, '3-room-cy-notice')
}

// ------------------------------------------------------------------------------------------------ 3. a game from nothing

if (only.has('blank')) {
  const ana = await person('Ana2')
  const ben = await person('Ben2')
  let link
  await step('Ana draws Zip in a game from nothing, places it, and plays together', async () => {
    await ana.page.goto(site + '/2d/hackable-blank?new=1')
    await ana.page.getByRole('button', { name: 'or pick a picture' }).click({ timeout: 45000 })
    await ana.page.getByRole('dialog').getByRole('button', { name: 'Blob', exact: true }).click()
    await ana.page.getByRole('textbox', { name: 'Brick name' }).fill('Zip')
    await ana.page.getByRole('button', { name: 'Make my brick', exact: true }).click()
    await ana.page.waitForTimeout(800)
    const p = await stagePoint(ana.page)
    await ana.page.mouse.click(p.x, p.y)
    await ana.page.getByRole('button', { name: 'Done', exact: true }).click()
    await ana.page.waitForTimeout(800)
    link = await playTogether(ana.page)
  })
  await step('Ben joins the game from nothing', async () => { await join(ben, link) })
  await step('Ana lets Ben code; Ben gives Zip a job (Player · walks around); Ana\'s Changes has it', async () => {
    await letCode(ana.page, 'Ben2')
    const build = ben.page.getByRole('radio', { name: /Build/ })
    await build.click()
    await ben.page.waitForTimeout(3000)
    const p = await stagePoint(ben.page)
    await ben.page.mouse.click(p.x, p.y)
    const card = ben.page.getByRole('group', { name: 'Give Zip a job' })
    await card.getByRole('button', { name: /^Player/ }).click({ timeout: 15000 })
    await card.getByRole('button', { name: /^Walks around/ }).click({ timeout: 15000 })
    await ana.page.waitForTimeout(3000)
    const list = await changes(ana.page)
    if (!list.some((t) => /Ben2 .*(Zip|player)/.test(t))) throw new Error(JSON.stringify(list))
    return list
  })
  await shot(ben, '4-blank-ben-job')
}

// ------------------------------------------------------------------------------------------------ 4. 3D and classic

if (only.has('solo')) {
  const k = await person('Solo')
  await step('/3d/hackable plays: Play, then the keys change the picture', async () => {
    await k.page.goto(site + '/3d/hackable?new=1')
    await k.page.getByRole('radio', { name: /^Play/ }).click({ timeout: 45000 })
    await k.page.waitForTimeout(3000)
    const before = await k.page.screenshot()
    await k.page.locator('canvas').first().click({ position: { x: 300, y: 300 } }).catch(() => {})
    await k.page.keyboard.down('ArrowUp')
    await k.page.waitForTimeout(1500)
    await k.page.keyboard.up('ArrowUp')
    await k.page.waitForTimeout(500)
    const after = await k.page.screenshot()
    await shot(k, '5-3d-play')
    if (before.equals(after)) throw new Error('nothing moved')
    return { together: await k.page.getByRole('menuitem', { name: /Play together/ }).count() }
  })
  await step('Classic /2d/build?new=1 opens', async () => {
    await k.page.goto(site + '/2d/build?new=1')
    await k.page.getByRole('button', { name: /This project/ }).first().waitFor({ timeout: 45000 })
    await shot(k, '6-classic-2d-build')
  })
}

await step('No console errors in any browser', async () => {
  const errs = everyone.flatMap((k) => k.errors.map((e) => `${k.name}: ${e}`)).filter((e) => !IGNORED.some((re) => re.test(e)))
  if (errs.length) throw new Error(errs.slice(0, 6).join(' | '))
  return { browsers: everyone.length }
})
for (const k of everyone) await k.context.close()
await browser.close()
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`\n${failed ? `${failed} step(s) failed` : 'all steps passed'}; report and screenshots in ${output}`)
process.exit(failed ? 1 : 0)
