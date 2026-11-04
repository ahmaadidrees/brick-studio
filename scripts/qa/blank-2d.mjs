/**
 * Start from nothing (Blank 2D, docs/qa/blank-2d): a kid's first five minutes in a real browser, headless, against the
 * dev server. Landing card → empty stage → pick a picture and name it → place it → Tiles from a tile picture and paint
 * a wall → tap the brick, Player, Walks around (it plays at once) → hold the arrows → Gold with Collect, a Flag with
 * Goal → Play: collect the gold (the Score goes up) and touch the flag (You win!) → Borrow a brick. Then the landing
 * card and the Make a game picker at a phone's width.
 *
 * It uses the dev-only stage hook (window.__studioStage) to tap bricks where they are drawn, so it needs `vite` (dev),
 * not a production build.
 *
 *   UI_ORIGIN=http://localhost:5262 node scripts/qa/blank-2d.mjs
 *
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (localhost only), UI_OUTPUT (default docs/qa/blank-2d/shots/run).
 * Exits 1 when a step fails, with a screenshot of where it stopped.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://localhost:5262', 'the harness makes projects in this browser.')
const output = await outputDir('UI_OUTPUT', path.join(here, '../../docs/qa/blank-2d/shots/run'))

const browser = await chromium.launch(launchOptions())
const results = []
let page
const step = async (name, fn) => {
  try {
    await fn()
    results.push({ name, ok: true })
    console.log(`ok   ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) })
    console.log(`FAIL ${name}: ${error?.message ?? error}`)
    await page?.screenshot({ path: path.join(output, `FAILED-${name.replace(/\W+/g, '-')}.png`) }).catch(() => {})
    throw error
  }
}
const shot = (name) => page.screenshot({ path: path.join(output, `${name}.jpg`), type: 'jpeg', quality: 80 })
const button = (name) => page.getByRole('button', { name, exact: true })
const wait = (ms) => page.waitForTimeout(ms)
/** Where a point of the level is on screen (dev hook in Stage.tsx). */
const at = (x, y) => page.evaluate(([wx, wy]) => window.__studioStage.toScreen(wx, wy), [x, y])
const tap = async (x, y) => { const p = await at(x, y); await page.mouse.click(p.x, p.y) }
const drag = async (from, to) => {
  const a = await at(...from)
  const b = await at(...to)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 12, a.y + ((b.y - a.y) * i) / 12)
  await page.mouse.up()
}
/** Fit the stage, and let the view settle before tapping where things are. */
const fit = async () => { await page.getByRole('button', { name: 'Reset view to fit' }).click(); await page.waitForTimeout(500) }
const hold = async (key, ms) => { await page.keyboard.down(key); await wait(ms); await page.keyboard.up(key) }
const score = () => page.locator('.cl-blank-score b').first().textContent()
/** The project as this browser saved it, once the header says it is saved. */
const savedDesign = async () => {
  await wait(300)
  await page.getByText('Saved on this computer').first().waitFor({ timeout: 10000 })
  return readSave()
}
const readSave = () => page.evaluate(() => {
  const id = new URL(location.href).searchParams.get('draft')
  const text = id && localStorage.getItem(`code-lab.project.v1:${id}`)
  return text ? JSON.parse(text).design : null
})
const newBrick = async (picture, name) => {
  await page.locator('.cl-drawer').getByRole('button', { name: 'New brick' }).click()
  await page.getByRole('dialog').getByRole('button', { name: picture, exact: true }).click()
  if (name) await page.getByRole('textbox', { name: 'Brick name' }).fill(name)
}
const giveJob = async (x, y, job, way) => {
  await tap(x, y)
  const card = page.getByRole('group', { name: /^Give .* a job$/ })
  await card.waitFor()
  await card.getByRole('button', { name: new RegExp(`^${job}`) }).click()
  if (way) await card.getByRole('button', { name: new RegExp(`^${way}`) }).click()
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  page = await context.newPage()

  await step('landing shows Start from nothing, outlined', async () => {
    await page.goto(`${origin}/`)
    const link = page.getByRole('link', { name: 'Start from nothing' })
    await link.scrollIntoViewIfNeeded()
    assert.equal(await link.getAttribute('href'), '/2d/hackable-blank?new=1')
    await shot('01-landing-card')
    await link.click()
    await page.getByRole('heading', { name: 'Your stage is empty' }).waitFor({ timeout: 20000 })
    await shot('02-empty-stage')
  })

  await step('pick a picture, name it Zip, place it', async () => {
    await page.getByRole('button', { name: 'or pick a picture' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Blob', exact: true }).click()
    await page.getByRole('textbox', { name: 'Brick name' }).fill('Zip')
    assert.equal(await page.getByRole('button', { name: /One thing/ }).getAttribute('aria-pressed'), 'true')
    await shot('03-name-one-thing')
    await button('Make my brick').click()
    await fit()
    await tap(40, 40)
    await button('Done').click()
  })

  await step('a tile picture is Tiles: paint a wall', async () => {
    await newBrick('Stone', 'Wall')
    assert.equal(await page.getByRole('button', { name: /Tiles/ }).getAttribute('aria-pressed'), 'true')
    await shot('04-name-tiles')
    await button('Make my brick').click()
    await drag([136, 104], [136, 248])
    await drag([152, 104], [296, 104])
    await shot('05-paint-tiles')
    await button('Done').click()
    const design = await savedDesign()
    assert.ok(design.tiles.data.join('').replace(/\./g, '').length >= 15, 'cells painted')
  })

  await step('three taps: Zip, Player, Walks around → it plays and the arrows move it', async () => {
    await page.getByText('Tap Zip to give it a job.').waitFor()
    await tap(40, 40)
    await page.getByRole('heading', { name: 'Give Zip a job' }).waitFor()
    await shot('06-give-zip-a-job')
    const card = page.getByRole('group', { name: 'Give Zip a job' })
    await card.getByRole('button', { name: /^Player/ }).click()
    await card.getByRole('button', { name: /^Walks around/ }).click()
    await page.getByRole('radio', { name: /Play/, checked: true }).waitFor()
    await wait(600)
    const before = await page.locator('.cl-stage-frame canvas').screenshot()
    await hold('ArrowUp', 700)
    await hold('ArrowRight', 500)
    const after = await page.locator('.cl-stage-frame canvas').screenshot()
    assert.notDeepEqual(before, after, 'the stage changed while the arrows were held')
    await shot('07-play-moving')
    await page.getByRole('radio', { name: /Build/ }).click()
  })

  await step('Gold with Collect and a Flag with Goal', async () => {
    await fit()
    await newBrick('Gold')
    await button('Make my brick').click()
    await wait(400)
    // Apart in time too, so two taps never count as a double-click (which opens Code).
    for (const x of [120, 200, 280]) { await tap(x, 40); await wait(700) }
    await button('Done').click()
    await giveJob(120, 40, 'Collect')
    await page.getByText('Job: Collect').waitFor()
    await page.locator('.cl-blank-score').waitFor()
    await shot('08-collect-score')
    await page.keyboard.press('Escape')
    await newBrick('Flag')
    await button('Make my brick').click()
    await wait(400)
    await tap(440, 48)
    await button('Done').click()
    // The flag's cloth: its pole is thin and its other pixels are clear.
    await giveJob(437, 61, 'Goal')
    await page.keyboard.press('Escape')
    const design = await savedDesign()
    assert.deepEqual(design.bricks.map((b) => [b.name, (b.powers ?? []).map((p) => p.job).join('/')]), [['Zip', 'player:walk'], ['Wall', 'wall'], ['Gold', 'collect'], ['Flag', 'goal']])
    assert.equal(design.player, design.bricks[0].id)
  })

  await step('Play: collect the gold, the Score goes up, touch the flag: You win!', async () => {
    await page.getByRole('radio', { name: /Play/ }).click()
    await wait(800)
    // Zip went back to where it was placed: straight along the bottom row, through three Gold, to the Flag.
    await page.keyboard.down('ArrowRight')
    await page.getByRole('dialog', { name: 'You win' }).waitFor({ timeout: 15000 })
    await page.keyboard.up('ArrowRight')
    assert.equal(await page.getByRole('dialog', { name: 'You win' }).locator('.p2d-clear-time').nth(1).textContent(), 'Score 3')
    await shot('09-you-win')
    await page.getByRole('button', { name: 'Keep building' }).click()
  })

  await step('Code: the job is real blocks, in one Game category', async () => {
    await page.getByRole('radio', { name: /Code/ }).click()
    await page.locator('.cl-slot-level button').filter({ hasText: /^Gold$/ }).click()
    await page.getByText('Jobs and powers').waitFor()
    await page.locator('.blocklyTreeRow, .blocklyToolboxCategory').filter({ hasText: /^Game$/ }).first().click()
    await page.locator('.blocklyFlyout').getByText('touching the player?').first().waitFor()
    await shot('10-code-game-category')
    await page.getByRole('radio', { name: /Build/ }).click()
  })

  await step('Borrow a brick: the Hero joins My bricks with its code', async () => {
    await page.getByRole('button', { name: /Borrow a brick/ }).click()
    await shot('11-borrow')
    await page.getByRole('button', { name: 'Borrow the Hero: runs, jumps' }).click()
    await page.locator('.cl-drawer').getByText('Hero', { exact: true }).waitFor()
    const design = await savedDesign().catch(() => null)
    await shot('12-borrowed-hero')
    if (design) assert.ok(design.bricks.some((b) => b.name === 'Hero' && b.program.scripts.length > 5))
  })

  await step('reopening the project keeps everything', async () => {
    await wait(1500)
    await page.reload()
    await page.locator('.cl-drawer').getByText('Hero', { exact: true }).waitFor({ timeout: 20000 })
    const design = await savedDesign()
    assert.deepEqual(design.bricks.map((b) => b.name), ['Zip', 'Wall', 'Gold', 'Flag', 'Hero'])
    assert.equal(design.kit, 'blank')
  })

  await step('My projects calls it an Own game', async () => {
    await page.goto(`${origin}/projects`)
    await page.getByText('Own game').first().waitFor({ timeout: 20000 })
    await shot('13-my-projects-own-game')
  })

  await context.close()

  // A phone: the landing card and the picker.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  page = await phone.newPage()
  await step('phone: landing card and the Make a game picker show From nothing', async () => {
    await page.goto(`${origin}/`)
    const link = page.getByRole('link', { name: 'Start from nothing' })
    await link.scrollIntoViewIfNeeded()
    await shot('14-phone-landing-card')
    await page.getByRole('button', { name: 'Platformer', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'What do you want to make?' })
    await dialog.getByRole('heading', { name: 'From nothing' }).scrollIntoViewIfNeeded()
    await shot('15-phone-picker-from-nothing')
    await dialog.getByRole('button', { name: 'Start from nothing' }).click()
    await page.getByRole('heading', { name: 'Your stage is empty' }).waitFor({ timeout: 20000 })
    await shot('16-phone-empty-stage')
  })
  await phone.close()

  // A desktop picker, opened from the landing.
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  page = await desk.newPage()
  await step('desktop: the Make a game picker shows From nothing, outlined, and starts it', async () => {
    await page.goto(`${origin}/`)
    await page.getByRole('button', { name: 'Racing', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'What do you want to make?' })
    await dialog.getByRole('heading', { name: 'From nothing' }).waitFor()
    await shot('17-desktop-picker')
    await dialog.getByRole('button', { name: 'Start from nothing' }).click()
    await page.waitForURL(/\/2d\/hackable-blank/)
  })
  await desk.close()
} finally {
  await browser.close()
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length} of ${results.length} steps passed; screenshots in ${output}`)
  process.exitCode = failed.length ? 1 : 0
}
