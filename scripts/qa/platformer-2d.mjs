// 2D worlds end to end against a local Vite + Worker, as a guest (no Supabase needed): the landing page's way in,
// the /2d home, a course, building a level that saves in the browser, the 3D ⇄ 2D switch both ways, a guest room
// with two players (join by link, see each other move, edits reach everyone, the host locks building), and the
// touch layouts (iPad landscape, phone portrait).
// Environment: PLAYWRIGHT_MODULE, CHROME_PATH, UI_ORIGIN (default http://127.0.0.1:5199; the Worker must be running
// where the app expects it, http://localhost:8787 unless VITE_LIVE_SERVER_URL says otherwise), P2D_OUTPUT.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { hostSnapshot, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5199', 'it opens guest rooms on the local Worker')
const out = await outputDir('P2D_OUTPUT', 'docs/qa/platformer-2d-2026-09-23/local')
const browser = await chromium.launch(launchOptions())
const results = []
const errors = []
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const IPAD = { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 }

async function step(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`ok   ${name}`)
  } catch (error) {
    results.push({ name, ok: false, error: String(error?.message ?? error) })
    console.log(`FAIL ${name}: ${error?.message ?? error}`)
  }
}

async function open(options, label) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`))
  return { context, page }
}

const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' })
const joined = (page) => page.locator('.p2d-game[data-joined="yes"]').waitFor({ timeout: 15000 })
const tileCount = (page) => page.evaluate(() => window.__game2d.timeline.world.design.tiles.reduce((n, t) => n + (t ? 1 : 0), 0))
const noSideScroll = async (page) => assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'the page scrolls sideways')

/** Click (or tap) an empty spot of sky in the level, a third of the way down the canvas. */
async function placeInSky(page, { touch = false, dx = 0.5 } = {}) {
  const box = await page.locator('.p2d-canvas').boundingBox()
  const x = box.x + box.width * dx
  const y = box.y + box.height * 0.3
  if (touch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** The move pad, Run and Jump sit inside the screen without covering each other. */
async function touchControlsFit(page) {
  const { width, height } = page.viewportSize()
  const boxes = await Promise.all(
    [page.getByRole('group', { name: /^Move/ }), page.getByRole('button', { name: 'Run', exact: true }), page.getByRole('button', { name: 'Jump', exact: true })].map((l) => l.boundingBox()),
  )
  for (const b of boxes) assert(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= width + 1 && b.y + b.height <= height + 1, `a touch control is off screen: ${JSON.stringify(b)}`)
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]]
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
      assert(apart, `touch controls overlap: ${JSON.stringify(a)} / ${JSON.stringify(b)}`)
    }
}

/** A finger held down for a while (Playwright's touchscreen only taps). */
async function touchHold(context, page, x, y, ms) {
  const cdp = await context.newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await page.waitForTimeout(ms)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

async function hold(page, key, ms) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}

try {
  // ---------------------------------------------------------------------------------------------------------
  const desk = await open(DESKTOP, 'desktop')
  const { page } = desk

  await step('landing: "Make a 2D world" and the two-ways section', async () => {
    await page.goto(`${origin}/`)
    const cta = page.getByRole('link', { name: 'Make a 2D world', exact: true })
    await cta.waitFor()
    assert.equal(await cta.getAttribute('href'), '/2d/build')
    const ways = page.locator('#two-ways')
    await ways.getByRole('heading', { name: 'Stack it in 3D. Or draw it in 2D.' }).waitFor()
    await ways.getByRole('link', { name: 'Build in 2D' }).waitFor()
    await ways.getByRole('link', { name: 'Build in 3D' }).waitFor()
    await shot(page, 'desktop-landing-hero')
    await ways.scrollIntoViewIfNeeded()
    await shot(page, 'desktop-landing-two-ways')
    await cta.click()
    await page.waitForURL(/\/2d\/build$/)
    await page.locator('.p2d-game.p2d-building').waitFor()
  })

  let tilesBefore = 0
  await step('build: a guest places a tile and it saves in this browser', async () => {
    await page.waitForFunction(() => !!window.__game2d)
    tilesBefore = await tileCount(page)
    await placeInSky(page)
    await page.waitForFunction(() => window.__game2d.editCount > 0)
    assert(await page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), 'Undo is not enabled after placing')
    await page.waitForFunction((n) => window.__game2d.timeline.world.design.tiles.reduce((c, t) => c + (t ? 1 : 0), 0) > n, tilesBefore)
    await page.waitForFunction(() => (JSON.parse(localStorage.getItem('brick-studio.2d.drafts.v1') || '[]') || []).length > 0, null, { timeout: 5000 })
    await shot(page, 'desktop-build')
  })

  await step('studio layout: the Bricks drawer, header tools, Scene and the strip', async () => {
    const drawer = page.getByRole('complementary', { name: 'Brick drawer' })
    await drawer.getByRole('heading', { name: 'Bricks' }).waitFor()
    for (const name of ['Scene', 'Build together']) await page.getByRole('button', { name, exact: true }).waitFor()
    assert.equal(await page.getByRole('radio', { name: 'Build' }).getAttribute('aria-checked'), 'true')
    await drawer.getByRole('searchbox', { name: 'Search bricks' }).fill('coin')
    await drawer.getByRole('button', { name: 'Coin', exact: true }).click()
    await page.locator('.p2d-strip').getByText('Coin', { exact: true }).waitFor()
    await drawer.getByRole('searchbox', { name: 'Search bricks' }).fill('')
    await drawer.getByRole('button', { name: 'Ground', exact: true }).click()
    await page.getByRole('button', { name: 'Collapse brick drawer' }).click()
    // Collapsed, the Bricks button and Undo / Redo sit side by side without touching.
    const toggle = await page.getByRole('button', { name: 'Open brick drawer' }).boundingBox()
    const history = await page.getByRole('group', { name: 'Build tools' }).boundingBox()
    assert(toggle.x + toggle.width + 4 <= history.x, `the Bricks button runs into Undo / Redo (${JSON.stringify({ toggle, history })})`)
    await page.getByRole('button', { name: 'Open brick drawer' }).click()
    await drawer.waitFor()
    // New levels start in the cartoon look, drawn at the screen's resolution.
    assert.equal(await page.evaluate(() => window.__game2d.timeline.world.design.style), 'cartoon')
    assert(await page.evaluate(() => window.__game2d.renderer.canvas.width > window.__game2d.renderer.width), 'the cartoon look is not drawn at screen resolution')
    await page.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.getByRole('radiogroup', { name: 'Look' }).waitFor()
    await shot(page, 'desktop-scene-sheet')
    const design = (field, value, label) =>
      page.waitForFunction(([f, v]) => window.__game2d.timeline.world.design[f] === v, [field, value], { timeout: 8000 }).catch(async () => {
        throw new Error(`${label}: design is ${JSON.stringify(await page.evaluate(() => ({ style: window.__game2d.timeline.world.design.style, theme: window.__game2d.timeline.world.design.theme, paused: window.__game2d.paused })))}`)
      })
    await page.getByRole('radio', { name: /Underground/ }).click()
    await design('theme', 'underground', 'Underground')
    await page.getByRole('radio', { name: /^Day/ }).click()
    await design('theme', 'day', 'Day')
    await page.getByRole('radio', { name: /^Pixel/ }).click()
    await design('style', 'pixel', 'Pixel')
    await page.waitForFunction(() => window.__game2d.renderer.canvas.width === window.__game2d.renderer.width)
    await page.getByRole('radio', { name: /^Cartoon/ }).click()
    await design('style', 'cartoon', 'Cartoon')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Scene' }).waitFor({ state: 'detached' })
    await page.getByRole('radio', { name: 'Play' }).click()
    await page.locator('.p2d-game.p2d-playing').waitFor()
    await page.getByRole('radio', { name: 'Build' }).click()
    await page.locator('.p2d-game.p2d-building').waitFor()
    await shot(page, 'desktop-build-studio')
  })

  await step('switch: 2D → 3D from the header', async () => {
    await page.getByRole('navigation', { name: 'Build in 3D or 2D' }).getByRole('button', { name: '3D bricks' }).click()
    await page.waitForURL(/\/build$/)
    const start = page.getByRole('button', { name: 'Start building', exact: true })
    if (await start.isVisible({ timeout: 4000 }).catch(() => false)) await start.click()
    await page.locator('.app-header-dimension').waitFor()
    assert.equal(await page.locator('.app-header-dimension').getByRole('button', { name: '3D bricks' }).getAttribute('aria-current'), 'page')
    await shot(page, 'desktop-3d-switch')
  })

  await step('switch: 3D → 2D reopens the level just built', async () => {
    await page.locator('.app-header-dimension').getByRole('button', { name: '2D worlds' }).click()
    await page.waitForURL(/\/2d\/build/)
    await page.locator('.p2d-game.p2d-building').waitFor()
    await page.waitForFunction(() => !!window.__game2d)
    assert.equal(await tileCount(page), tilesBefore + 1, 'the placed tile did not come back')
  })

  await step('/2d home: continue, courses, the switch, no sideways scroll', async () => {
    await page.goto(`${origin}/2d`)
    await page.getByRole('heading', { name: 'Build a 2D world. Then run through it.' }).waitFor()
    await page.getByRole('link', { name: /^Continue “/ }).waitFor()
    assert.equal(await page.getByRole('navigation', { name: 'Build in 3D or 2D' }).getByRole('button', { name: '2D worlds' }).getAttribute('aria-current'), 'page')
    assert.equal(await page.getByRole('link', { name: 'Play', exact: true }).count(), 3)
    await page.getByRole('article', { name: 'My world' }).waitFor()
    await noSideScroll(page)
    await shot(page, 'desktop-2d-home')
  })

  await step('course: the player runs, Escape pauses', async () => {
    await page.goto(`${origin}/2d/play/workshop`)
    await joined(page)
    await page.waitForFunction(() => !!window.__game2d)
    const x0 = await page.evaluate(() => window.__game2d.player.x)
    await page.locator('.p2d-stage').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await hold(page, 'ArrowRight', 900)
    const x1 = await page.evaluate(() => window.__game2d.player.x)
    assert(x1 > x0, `the player did not move right (${x0} → ${x1})`)
    await shot(page, 'desktop-course')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').getByText('Paused').waitFor()
    await shot(page, 'desktop-course-menu')
    await page.keyboard.press('Escape')
  })

  // ---------------------------------------------------------------------------------------------------------
  let roomUrl = ''
  const guest = await open(DESKTOP, 'guest')
  await step('room: the host opens a course "With friends"', async () => {
    await page.goto(`${origin}/2d`)
    await page.getByRole('article', { name: 'Workshop Run' }).getByRole('button', { name: 'With friends' }).click()
    await page.waitForURL(/\/2d\/r\/[a-f0-9]{32}$/)
    roomUrl = page.url()
    await page.getByRole('heading', { name: 'Your room “Workshop Run”' }).waitFor()
    await page.getByRole('button', { name: 'Open the room' }).click()
    await joined(page)
  })

  await step('room: a guest joins by link and both see two players', async () => {
    assert(roomUrl, 'no room was opened')
    const g = guest.page
    await g.goto(roomUrl)
    await g.getByRole('heading', { name: 'Join “Workshop Run”' }).waitFor()
    await g.getByText('1 player inside.').waitFor()
    await g.getByLabel('Your name').fill('Sam')
    await g.getByRole('button', { name: 'Join', exact: true }).click()
    await joined(g)
    await page.getByRole('button', { name: 'People, 2 here' }).waitFor()
    await g.getByRole('button', { name: 'People, 2 here' }).waitFor()
  })

  await step('room: the host sees the guest move', async () => {
    const g = guest.page
    const remoteX = () =>
      page.evaluate(() => {
        const remotes = [...window.__game2d.remotes.map.values()]
        const poses = remotes[0]?.poses ?? []
        return poses.length ? poses[poses.length - 1].x : null
      })
    await page.waitForFunction(() => [...window.__game2d.remotes.map.values()].some((r) => r.poses.length > 0), null, { timeout: 5000 })
    const before = await remoteX()
    await g.locator('.p2d-stage').click({ position: { x: 5, y: 5 } }).catch(() => {})
    await hold(g, 'ArrowRight', 900)
    await page.waitForTimeout(400)
    const after = await remoteX()
    assert(after !== null && before !== null && after > before, `the guest did not move on the host's screen (${before} → ${after})`)
  })

  await step('room: the host builds and the guest sees it', async () => {
    const g = guest.page
    await page.getByRole('radio', { name: 'Build' }).click()
    await page.locator('.p2d-game.p2d-building').waitFor()
    const n = await tileCount(page)
    await placeInSky(page, { dx: 0.62 })
    await page.waitForFunction((c) => window.__game2d.timeline.world.design.tiles.reduce((m, t) => m + (t ? 1 : 0), 0) > c, n)
    await g.waitForFunction((c) => window.__game2d.timeline.world.design.tiles.reduce((m, t) => m + (t ? 1 : 0), 0) > c, n, { timeout: 5000 })
    await shot(page, 'room-host-building')
  })

  await step('room: the host changes the look and the guest sees it', async () => {
    const g = guest.page
    await page.getByRole('button', { name: 'Scene', exact: true }).click()
    await page.getByRole('radio', { name: /^Pixel/ }).click()
    await g.waitForFunction(() => window.__game2d.timeline.world.design.style === 'pixel', null, { timeout: 5000 })
    await shot(g, 'room-guest-pixel')
    await page.getByRole('radio', { name: /^Cartoon/ }).click()
    await g.waitForFunction(() => window.__game2d.timeline.world.design.style === 'cartoon', null, { timeout: 5000 })
    await page.keyboard.press('Escape')
    await page.getByRole('dialog', { name: 'Scene' }).waitFor({ state: 'detached' })
  })

  await step('room: "Only I can build" locks the guest out of building', async () => {
    const g = guest.page
    await page.getByRole('button', { name: /^People/ }).click()
    const lock = page.getByRole('switch', { name: /Only I can build/ })
    await lock.click()
    await page.waitForFunction(() => window.__game2d.settings.buildLocked === true)
    await shot(page, 'room-host-menu')
    await page.keyboard.press('Escape')
    await g.waitForFunction(() => window.__game2d.canBuild === false, null, { timeout: 5000 })
    await g.getByRole('radio', { name: 'Build' }).click()
    await g.locator('.p2d-toast').waitFor()
    assert.equal(await g.locator('.p2d-game.p2d-building').count(), 0, 'the guest got into building anyway')
    await shot(g, 'room-guest-locked')
  })
  await guest.context.close()
  await desk.context.close()

  // ---------------------------------------------------------------------------------------------------------
  const ipad = await open(IPAD, 'ipad')
  await step('iPad: holding the pad right runs the player right', async () => {
    const p = ipad.page
    await p.goto(`${origin}/2d/play/skies`)
    await joined(p)
    await p.getByRole('button', { name: 'Jump', exact: true }).waitFor()
    await p.waitForFunction(() => !!window.__game2d)
    const pad = await p.getByRole('group', { name: /^Move/ }).boundingBox()
    const x0 = await p.evaluate(() => window.__game2d.player.x)
    await touchHold(ipad.context, p, pad.x + pad.width * 0.85, pad.y + pad.height / 2, 900)
    const x1 = await p.evaluate(() => window.__game2d.player.x)
    assert(x1 > x0, `the player did not move right (${x0} → ${x1})`)
    await touchControlsFit(p)
    await shot(p, 'ipad-course')
  })
  await step('iPad: tapping places a tile in a new level', async () => {
    const p = ipad.page
    await p.goto(`${origin}/2d/build?new=1`)
    await p.locator('.p2d-game.p2d-building').waitFor()
    await p.waitForFunction(() => !!window.__game2d)
    await placeInSky(p, { touch: true })
    await p.waitForFunction(() => window.__game2d.editCount > 0)
    await shot(p, 'ipad-build')
  })
  await ipad.context.close()

  const phone = await open(PHONE, 'phone')
  await step('phone: landing and /2d fit the width', async () => {
    const p = phone.page
    await p.goto(`${origin}/`)
    await p.getByRole('link', { name: 'Make a 2D world', exact: true }).waitFor()
    await noSideScroll(p)
    await p.locator('#two-ways').scrollIntoViewIfNeeded()
    await shot(p, 'phone-landing-two-ways')
    await p.goto(`${origin}/2d`)
    await p.getByRole('heading', { name: 'Build a 2D world. Then run through it.' }).waitFor()
    await noSideScroll(p)
    await shot(p, 'phone-2d-home')
  })
  await step('phone: portrait asks to turn sideways, then plays', async () => {
    const p = phone.page
    await p.goto(`${origin}/2d/play/workshop`)
    await p.getByText('Turn sideways for a bigger view').waitFor()
    await shot(p, 'phone-rotate')
    await p.getByRole('button', { name: 'Play like this' }).click()
    await p.getByRole('button', { name: 'Jump', exact: true }).waitFor()
    await touchControlsFit(p)
    await shot(p, 'phone-course')
  })
  await step('phone: building uses the drawer sheet', async () => {
    const p = phone.page
    await p.setViewportSize({ width: 390, height: 844 })
    await p.goto(`${origin}/2d/build?new=1`)
    await p.locator('.p2d-game.p2d-building').waitFor()
    await p.waitForFunction(() => !!window.__game2d)
    await p.getByRole('button', { name: 'Open brick drawer' }).click()
    const sheet = p.getByRole('dialog', { name: 'Bricks' })
    await sheet.getByRole('tab', { name: 'Blocks', exact: true }).click()
    await shot(p, 'phone-build-sheet')
    await sheet.getByRole('button', { name: 'Spring', exact: true }).click()
    await sheet.waitFor({ state: 'detached' })
    await p.locator('.p2d-strip').getByText('Spring', { exact: true }).waitFor()
    await placeInSky(p, { touch: true })
    await p.waitForFunction(() => window.__game2d.editCount > 0)
    await noSideScroll(p)
    await shot(p, 'phone-build')
  })
  await step('small phone: the touch controls fit at 320px and sideways', async () => {
    const p = phone.page
    for (const size of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
      await p.setViewportSize(size)
      await p.goto(`${origin}/2d/play/workshop`)
      const sideways = p.getByRole('button', { name: 'Play like this' })
      if (await sideways.isVisible().catch(() => false)) await sideways.click()
      await p.getByRole('button', { name: 'Jump', exact: true }).waitFor()
      await touchControlsFit(p)
      await shot(p, `phone-${size.width}x${size.height}`)
    }
  })
  await phone.context.close()
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
const report = { origin, when: new Date().toISOString(), host: hostSnapshot(), results, pageErrors: errors }
await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed · ${errors.length} page errors · ${out}`)
if (errors.length) console.log(errors.join('\n'))
if (failed.length || errors.length) process.exit(1)
