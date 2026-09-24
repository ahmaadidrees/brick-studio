// Local-only acceptance rehearsal for the 2D Character sheet, image assets and room appearance.
// Start Vite and the local Worker first, then run:
// UI_ORIGIN=http://127.0.0.1:5402 CHARACTER_OUTPUT=test-results/platformer-characters node scripts/qa/platformer-characters.mjs
// PLAYWRIGHT_MODULE and CHROME_PATH use the shared QA defaults in lib/env.mjs.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { hostSnapshot, isLocalOrigin, launchOptions, loadChromium, localOrigin, outputDir } from './lib/env.mjs'

const chromium = await loadChromium()
const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5402', 'this test creates a guest room and changes local browser preferences')
const out = await outputDir('CHARACTER_OUTPUT', 'test-results/platformer-characters')
const browser = await chromium.launch(launchOptions())
const results = []
const errors = []
const DESKTOP = { viewport: { width: 1280, height: 800 } }
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
const characters = [
  ['classic', 'Classic', '/platformer/characters/classic-preview.svg'],
  ['builder', 'Builder', '/platformer/characters/builder-v1.png'],
  ['bolt-bot', 'Bolt Bot', '/platformer/characters/bolt-bot-v1.png'],
  ['brick-fox', 'Brick Fox', '/platformer/characters/brick-fox-v1.png'],
]

async function step(name, fn) {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, ok: true, ms: Date.now() - started })
    console.log(`ok   ${name}`)
  } catch (error) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(error?.stack ?? error) })
    console.log(`FAIL ${name}: ${error?.message ?? error}`)
  }
}

async function open(options, label) {
  const context = await browser.newContext(options)
  // The frontend can only create or inspect rooms on a local Worker in this rehearsal.
  await context.route('**/platformer/rooms**', async (route) => {
    if (!isLocalOrigin(route.request().url())) {
      errors.push(`${label}: blocked nonlocal room request ${route.request().url()}`)
      await route.abort()
      return
    }
    await route.continue()
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(`${label}: page error: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: console error: ${message.text()}`)
  })
  page.on('websocket', (socket) => {
    if (!isLocalOrigin(socket.url())) errors.push(`${label}: nonlocal WebSocket ${socket.url()}`)
  })
  return { context, page }
}

const joined = (page) => page.locator('.p2d-game[data-joined="yes"]').waitFor({ timeout: 15000 })
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' })
const chooser = (page) => page.getByRole('dialog', { name: 'Character' })
const card = (page, name) => chooser(page).getByRole('radio', { name: new RegExp(`^${name}(?:\\s|$)`) })
const selected = (page, id) => page.waitForFunction((wanted) => window.__game2d?.character === wanted, id, { timeout: 5000 })
const noSideScroll = async (page) => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page scrolls sideways')

async function openChooser(page) {
  const trigger = page.getByRole('button', { name: 'Character', exact: true })
  await trigger.click()
  await chooser(page).waitFor()
  return trigger
}

async function pick(page, id, name) {
  await card(page, name).click()
  await selected(page, id)
  assert.equal(await card(page, name).getAttribute('aria-checked'), 'true')
}

async function closeChooser(page, trigger) {
  await page.keyboard.press('Escape')
  await chooser(page).waitFor({ state: 'detached' })
  assert(await trigger.evaluate((element) => document.activeElement === element), 'focus did not return to Character')
}

async function verifyImages(page) {
  const imageResults = await page.evaluate(async (entries) => Promise.all(entries.map(async ([id, , path]) => {
    const image = new Image()
    const loaded = await new Promise((resolve) => {
      image.onload = () => resolve(true)
      image.onerror = () => resolve(false)
      image.src = path
    })
    return { id, path, loaded, width: image.naturalWidth, height: image.naturalHeight }
  })), characters)
  for (const image of imageResults) assert(image.loaded && image.width > 0 && image.height > 0, `asset failed to load: ${JSON.stringify(image)}`)
  return imageResults
}

async function remoteAppearance(page, expected, requireExplicit = true) {
  await page.waitForFunction(([id, explicit]) => {
    const game = window.__game2d
    if (!game?.joined) return false
    const remotes = [...game.remotes.map.values()]
    return remotes.some((remote) => {
      const latest = remote.poses.at(-1)
      const look = game.remotes.looks(game.timeline.tick).find((entry) => entry.num === remote.num)
      return latest && (explicit ? latest.ch === id : latest.ch === undefined) && remote.character === id && look?.character === id
    })
  }, [expected, requireExplicit], { timeout: 7000 })
  return page.evaluate(() => {
    const game = window.__game2d
    return [...game.remotes.map.values()].map((remote) => ({
      num: remote.num,
      latestPose: remote.poses.at(-1),
      character: remote.character,
      renderedLook: game.remotes.looks(game.timeline.tick).find((entry) => entry.num === remote.num),
    }))
  })
}

let desktop
let peer
let phone
let imageResults = []
let roomUrl = ''
let roomObservations = {}
try {
  desktop = await open(DESKTOP, 'desktop')
  const page = desktop.page
  await step('desktop: all four choices change the actual local session', async () => {
    await page.goto(`${origin}/2d/play/workshop`)
    await joined(page)
    await page.waitForFunction(() => !!window.__game2d)
    assert.equal(await page.evaluate(() => window.__game2d.character), 'builder', 'new browser should start with Builder')
    const trigger = await openChooser(page)
    await shot(page, 'desktop-character-sheet')
    imageResults = await verifyImages(page)
    for (const [id, name] of characters) await pick(page, id, name)
    await closeChooser(page, trigger)
    await shot(page, 'desktop-brick-fox-play')
  })

  await step('desktop: keyboard arrows, Escape and focus return', async () => {
    const trigger = await openChooser(page)
    const fox = card(page, 'Brick Fox')
    assert(await fox.evaluate((element) => document.activeElement === element), 'selected radio did not receive initial focus')
    await page.keyboard.press('ArrowRight')
    await selected(page, 'classic')
    assert.equal(await card(page, 'Classic').getAttribute('aria-checked'), 'true')
    await closeChooser(page, trigger)
  })

  await step('desktop: selection survives a cold page reload', async () => {
    await page.reload()
    await joined(page)
    await selected(page, 'classic')
    const trigger = await openChooser(page)
    assert.equal(await card(page, 'Classic').getAttribute('aria-checked'), 'true')
    await pick(page, 'builder', 'Builder')
    await closeChooser(page, trigger)
    await page.reload()
    await joined(page)
    await selected(page, 'builder')
  })

  peer = await open(DESKTOP, 'peer')
  await step('room: owner opens a local guest room and a second profile joins', async () => {
    await page.goto(`${origin}/2d`)
    await page.getByRole('article', { name: 'Workshop Run' }).getByRole('button', { name: 'With friends' }).click()
    await page.waitForURL(/\/2d\/r\/[a-f0-9]{32}$/)
    roomUrl = page.url()
    await page.getByRole('button', { name: 'Open the room' }).click()
    await joined(page)
    assert(isLocalOrigin(await page.evaluate(() => window.__game2d.room.ws.url)), 'owner WebSocket is not local')
    const guest = peer.page
    await guest.goto(roomUrl)
    await guest.getByLabel('Your name').fill('Sam')
    await guest.getByRole('button', { name: 'Join', exact: true }).click()
    await joined(guest)
    assert(isLocalOrigin(await guest.evaluate(() => window.__game2d.room.ws.url)), 'peer WebSocket is not local')
    await page.getByRole('button', { name: 'People, 2 here' }).waitFor()
    await guest.getByRole('button', { name: 'People, 2 here' }).waitFor()
  })

  await step('room: owner Bolt Bot and peer Brick Fox reach each other through server poses and render looks', async () => {
    const guest = peer.page
    let trigger = await openChooser(page)
    await pick(page, 'bolt-bot', 'Bolt Bot')
    await closeChooser(page, trigger)
    roomObservations.peerSeesOwner = await remoteAppearance(guest, 'bolt-bot')
    trigger = await openChooser(guest)
    await pick(guest, 'brick-fox', 'Brick Fox')
    await closeChooser(guest, trigger)
    roomObservations.ownerSeesPeer = await remoteAppearance(page, 'brick-fox')
    await shot(page, 'room-owner-bolt-bot')
    await shot(guest, 'room-peer-brick-fox')
  })

  await step('room: a legacy pose with no identity appears as Classic', async () => {
    const guest = peer.page
    // Emulate an older client only at the transport boundary; the choice itself is still made in the UI.
    await guest.evaluate(() => {
      const room = window.__game2d.room
      room.sendPose = function (pose) {
        const { ch, af, ...legacy } = pose
        this.send({ type: 'pose', p: legacy })
      }
    })
    const trigger = await openChooser(guest)
    await pick(guest, 'classic', 'Classic')
    await closeChooser(guest, trigger)
    roomObservations.ownerSeesLegacy = await remoteAppearance(page, 'classic', false)
  })

  phone = await open(PHONE, 'phone')
  await step('phone: 390 × 844 selector fits, assets load and selection works', async () => {
    const mobile = phone.page
    await mobile.goto(`${origin}/2d/play/workshop`)
    const portrait = mobile.getByRole('button', { name: 'Play like this' })
    if (await portrait.isVisible().catch(() => false)) await portrait.click()
    await joined(mobile)
    const trigger = await openChooser(mobile)
    await noSideScroll(mobile)
    for (const [, name] of characters) {
      const box = await card(mobile, name).boundingBox()
      assert(box && box.x >= -1 && box.x + box.width <= 391, `${name} card overflows 390px viewport`)
    }
    await shot(mobile, 'phone-character-sheet')
    await pick(mobile, 'bolt-bot', 'Bolt Bot')
    await closeChooser(mobile, trigger)
    await noSideScroll(mobile)
    await shot(mobile, 'phone-bolt-bot-play')
    await verifyImages(mobile)
  })
} finally {
  await Promise.allSettled([phone?.context.close(), peer?.context.close(), desktop?.context.close()].filter(Boolean))
  await browser.close()
}

const failed = results.filter((result) => !result.ok)
const report = { origin, when: new Date().toISOString(), host: hostSnapshot(), results, imageResults, roomUrl, roomObservations, errors }
await writeFile(`${out}/results.json`, JSON.stringify(report, null, 2))
console.log(`\n${results.length - failed.length}/${results.length} passed · ${errors.length} browser errors · ${out}`)
if (errors.length) console.log(errors.join('\n'))
if (failed.length || errors.length) process.exitCode = 1
