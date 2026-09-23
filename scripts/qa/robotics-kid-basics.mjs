/**
 * Robot Workshop kid-UX pass, lane M: the studio basics a child hits while building a robot (the first
 * screen, placing and moving parts, seeing where things went), with a real mouse, keyboard and wheel
 * in real Chrome, the way the novice testers did it (docs/qa/robotics-kid/basics/README.md).
 *
 *   A. First screen: a picture-first quick start in the device's words; nothing in hand; "Build a
 *      robot" opens the drawer on the Robots kits (desktop 1366×768, and a touch tablet 820×1180).
 *   B. Leo's motor: dragged from the ground onto a plate, grabbed near its corner, it lands on the
 *      plate (not floating); moving it never stacks it on its own old spot.
 *   C. Arrows, Raise and the height handle never leave a part in the air; a part left in the air
 *      (its support deleted) is brought down by the handle; a refused move says why.
 *   D. Leo's hub: grabbed in the middle, where the height handle used to sit, it drags sideways.
 *   E. Noah's gate: a click just above the top of a tall build, or at the top of the view, places
 *      nothing far away and says why; a normal placement flashes the new part.
 *   F. Zoom: wheel notches from the default view to twice the distance (target 3–5).
 *   G. Refusals in kid words with what is in the way outlined; H. the top view says what a part sits on.
 *   I. Without the flag (UI_FLAG_OFF_ORIGIN, default http://127.0.0.1:5246): the studio's own quick
 *      start, its armed 2 × 4 brick, its moves and its 5 % zoom step, unchanged.
 *
 * Where the mouse goes comes from the studio's own world→screen projection (the dev-only
 * `window.__robotics.project`, or the camera read from React Three Fiber's roots when the flag is off),
 * the aiming a student does by eye. Nothing is placed through the store except the flag-off check's
 * starting bricks. Measurements (the store, `__robotics.basics()`, the camera distance) are verdicts only.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5245 node scripts/qa/robotics-kid-basics.mjs
 *
 * against `npx vite --mode robotics --port 5245 --strictPort --host 127.0.0.1` (and, for section I,
 * `npx vite --port 5246 --strictPort --host 127.0.0.1`; skipped with a note when it is not running).
 * Writes PNGs and results.json under docs/qa/robotics-kid/basics/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5245', 'the harness clears and rewrites the guest project')
const flagOffOrigin = localOrigin('UI_FLAG_OFF_ORIGIN', 'http://127.0.0.1:5246', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/basics')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const measures = {}
const pageErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); return ok }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const STUD = 0.62
const PLATE = 0.18
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
const PART_NAMES = { plate_6x8: '6 × 8 Plate', plate_4x6: '4 × 6 Plate', brick_2x2: '2 × 2 Brick', brick_1x2: '1 × 2 Brick', brick_2x4: '2 × 4 Brick', robo_hub: 'Hub', robo_motor: 'Motor' }

async function openStudio(site, { viewport = { width: 1366, height: 768 }, touch = false, quickStart = false } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
  const page = await context.newPage()
  page.on('pageerror', (error) => { pageErrors.push(`${site}: ${error.message}`); console.log(`  pageerror: ${error.message}`) })
  if (!quickStart) await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  // The studio's web fonts come from the network; "load" can stall offline, so wait for the app itself.
  await page.goto(`${site}/build`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.evaluate(({ projectKey, onboardingKey, quickStart }) => { window.localStorage.removeItem(projectKey); if (quickStart) window.localStorage.removeItem(onboardingKey) }, { projectKey: PROJECT_KEY, onboardingKey: ONBOARDING_KEY, quickStart })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForSelector('canvas', { timeout: 60_000 })
  const s = { page, context, site }
  s.sleep = (ms) => page.waitForTimeout(ms)
  s.shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log(`  shot ${name}.png`) }
  /**
   * The brick store the app uses: the robotics dev hook when the flag is on, else the exact module URL
   * the page loaded (after a hot update Vite serves it with a `?t=` query, a different module instance).
   */
  s.brick = (fn, arg) => page.evaluate(async ({ src, arg }) => {
    let store = window.__robotics?.brickStore
    if (!store) {
      const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => new URL(name).pathname === '/src/brick/store.ts') ?? '/src/brick/store.ts'
      store = (await import(url)).useBrickStore
    }
    return new Function('state', 'arg', `return (${src})(state, arg)`)(store.getState(), arg)
  }, { src: fn.toString(), arg })
  s.basics = () => page.evaluate(() => window.__robotics?.basics?.() ?? null)
  /** World → page, from the live camera (works with and without the flag). */
  s.screenOf = (point) => page.evaluate(async (p) => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => name.includes('/node_modules/.vite/deps/@react-three_fiber.js'))
    const { _roots } = await import(url)
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const { camera } = _roots.get(canvas).store.getState()
    const v = camera.position.clone().set(p.x, p.y, p.z).project(camera)
    const rect = canvas.getBoundingClientRect()
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height, inFront: v.z < 1 }
  }, point)
  s.cameraDistance = () => page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').map((entry) => entry.name).find((name) => name.includes('/node_modules/.vite/deps/@react-three_fiber.js'))
    const { _roots } = await import(url)
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]
    const { camera, controls } = _roots.get(canvas).store.getState()
    return camera.position.distanceTo(controls.target)
  })
  s.draft = () => s.brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z })
  s.find = (id) => s.brick((state, brickId) => { const b = state.bricks.find((candidate) => candidate.id === brickId); return b && { id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation } }, id)
  s.count = () => s.brick((state) => state.bricks.length)
  s.toast = () => s.brick((state) => state.toast)
  return s
}

/** Would a real mouse at this page point reach the build canvas (not a panel, the drawer or the strip)? */
async function inFreeArea(s, at) {
  return s.page.evaluate((p) => {
    if (!p.inFront) return false
    const hits = [[0, 0], [-5, -5], [5, -5], [-5, 5], [5, 5]].map(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy))
    return hits.every((element) => element?.tagName === 'CANVAS')
  }, at)
}

/** Waits until the view stops moving (framing and the panels' view offset ease in). */
async function settle(s) {
  let last = null
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const now = await s.screenOf(world(32, 0, 32))
    if (last && Math.abs(now.x - last.x) < 0.25 && Math.abs(now.y - last.y) < 0.25) return
    last = now
    await s.sleep(90)
  }
}

/** Zooms out with the mouse wheel (at the middle of the canvas) until `point` is in the free canvas area, as a student would. */
async function bringIntoView(s, point) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await settle(s)
    if (await inFreeArea(s, await s.screenOf(point))) return true
    const middle = await s.page.evaluate(() => { const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const r = canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.42, y: r.top + r.height * 0.45 } })
    await s.page.mouse.move(middle.x, middle.y, { steps: 3 })
    for (let notch = 0; notch < 2; notch += 1) { await s.page.mouse.wheel(0, 100); await s.sleep(80) }
    await s.sleep(250)
  }
  return inFreeArea(s, await s.screenOf(point))
}

async function aim(s, point, label) {
  await settle(s)
  const at = await s.screenOf(point)
  assert(await inFreeArea(s, at), `${label}: ${JSON.stringify(point)} projects to (${Math.round(at.x)}, ${Math.round(at.y)}), outside the free canvas area`)
  await s.page.mouse.move(at.x, at.y, { steps: 8 })
  await s.sleep(220)
  return at
}

async function choose(s, partId) {
  await s.page.getByLabel('Brick category').selectOption(partId.startsWith('robo_') ? 'robotics' : 'all')
  await s.page.locator(`.library-part[title="${PART_NAMES[partId]}"]`).click()
  await s.sleep(150)
  assert.equal((await s.draft())?.partId, partId, `the drawer armed ${partId}`)
}

/** Chooses a part, aims at `point`, clicks; Escape puts the brush down. Returns the placed brick. */
async function place(s, partId, point, label) {
  await choose(s, partId)
  const at = await aim(s, point, label)
  const before = await s.count()
  await s.page.mouse.click(at.x, at.y)
  await s.sleep(300)
  await s.page.keyboard.press('Escape')
  await s.sleep(150)
  assert.equal(await s.count(), before + 1, `${label}: one click placed one part`)
  return s.brick((state) => { const b = state.bricks[state.bricks.length - 1]; return { id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z } })
}

/** The creation card (lane G) opens for a first device: keep building with the name it suggests. */
async function keepBuilding(s) {
  await s.sleep(350)
  const card = s.page.getByTestId('robotics-creation-card')
  if (await card.count()) {
    const go = card.getByRole('button', { name: 'Keep building', exact: true })
    if (await go.count()) { await go.click(); await s.sleep(300) }
  }
}

/** A part's footprint centre at a height (plates) above its base, in world units. */
const topOf = (brick, width, depth, height, dx = width / 2, dz = depth / 2) => world(brick.x + dx, brick.y + height, brick.z + dz)

/** Mouse-drags from one page point to another with the left button, as a student does. */
async function drag(s, from, to, { steps = 16, midShot } = {}) {
  await s.page.mouse.move(from.x, from.y, { steps: 4 })
  await s.sleep(120)
  await s.page.mouse.down()
  await s.page.mouse.move(to.x, to.y, { steps })
  await s.sleep(260)
  const mid = { ghost: await s.draft(), basics: await s.basics() }
  if (midShot) await s.shot(midShot)
  await s.page.mouse.up()
  await s.sleep(350)
  return mid
}

/** What rests under a brick in the document: 'plate'/'ground'/… (verdict only; the same rule the studio uses). */
const restingOf = (s, id) => s.brick((state, brickId) => {
  const sizes = { plate_6x8: [6, 8, 1], plate_4x6: [4, 6, 1], brick_2x2: [2, 2, 3], brick_1x2: [1, 2, 3], brick_2x4: [2, 4, 3], robo_hub: [4, 4, 6], robo_motor: [3, 3, 6] }
  const box = (b) => { const [w, d, h] = sizes[b.partId] ?? [1, 1, 3]; const [rw, rd] = b.rotation % 2 ? [d, w] : [w, d]; return { x0: b.x, x1: b.x + rw, z0: b.z, z1: b.z + rd, y0: b.y, y1: b.y + h } }
  const me = state.bricks.find((b) => b.id === brickId)
  if (!me) return null
  const mine = box(me)
  if (mine.y0 === 0) return 'ground'
  const under = state.bricks.filter((b) => b.id !== brickId).map((b) => ({ b, box: box(b) })).filter(({ box: other }) => other.y1 === mine.y0 && other.x0 < mine.x1 && other.x1 > mine.x0 && other.z0 < mine.z1 && other.z1 > mine.z0)
  return under.length ? under.map(({ b }) => b.partId).join('+') : 'nothing (floating)'
}, id)

/* ============================================================== A. first screen */
console.log('\nA. The first screen')
{
  const s = await openStudio(origin, { quickStart: true })
  const guide = s.page.getByTestId('kid-quick-start')
  await guide.waitFor({ timeout: 30_000 })
  await s.sleep(400)
  await s.shot('A1-quick-start-desktop')
  const seen = await guide.evaluate((element) => {
    const visible = (node) => { const rect = node.getBoundingClientRect(); const style = getComputedStyle(node); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' }
    const text = element.innerText.replace(/\s+/g, ' ').trim()
    const targets = [...element.querySelectorAll('button')].filter(visible).map((button) => { const rect = button.getBoundingClientRect(); return { name: (button.getAttribute('aria-label') || button.textContent).trim(), width: Math.round(rect.width), height: Math.round(rect.height) } })
    const small = []
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim() || !visible(node.parentElement)) continue
      const size = parseFloat(getComputedStyle(node.parentElement).fontSize)
      if (size < 14) small.push({ text: node.textContent.trim(), size })
    }
    return { text, words: text.split(' ').length, pictures: element.querySelectorAll('li svg').length, targets, small }
  })
  measures.quickStart = seen
  check('A.one-screen', seen.pictures === 3 && seen.words <= 30, `the quick start is ${seen.words} words and ${seen.pictures} pictures: "${seen.text}"`)
  check('A.mouse-words', seen.text.includes('Click to place it') && seen.text.includes('Right-drag to look around') && !seen.text.includes('Tap, then Place'), 'with a mouse it says click and right-drag (the touch words are hidden)')
  check('A.big-targets', seen.targets.every((target) => target.width >= 44 && target.height >= 44) && seen.small.length === 0, `buttons ${JSON.stringify(seen.targets)}; text under 14 px: ${JSON.stringify(seen.small)}`)
  check('A.nothing-in-hand', (await s.draft()) === null && (await s.brick((state) => state.activePartId)) === null, 'no brick is armed at start (the studio used to start with a 2 × 4 brick being placed)')
  const robot = guide.getByRole('button', { name: /Build a robot/ })
  const box = await robot.boundingBox()
  await s.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await s.page.getByTestId('kit-shelf').waitFor({ timeout: 15_000 })
  await s.page.waitForFunction(() => document.querySelectorAll('.kit-card img').length === 4, null, { timeout: 15_000 }).catch(() => {})
  await s.sleep(300)
  check('A.build-a-robot', (await guide.count()) === 0 && (await s.page.getByLabel('Brick category').inputValue()) === 'robotics' && await s.page.getByRole('heading', { name: 'Start with a kit' }).isVisible(), 'Build a robot closed the quick start and opened the drawer on Start with a kit')
  await s.shot('A2-build-a-robot-opens-kits')
  await s.context.close()

  const t = await openStudio(origin, { viewport: { width: 820, height: 1180 }, touch: true, quickStart: true })
  const touchGuide = t.page.getByTestId('kid-quick-start')
  await touchGuide.waitFor({ timeout: 30_000 })
  await t.sleep(400)
  const touchText = (await touchGuide.innerText()).replace(/\s+/g, ' ')
  await t.shot('A3-quick-start-touch')
  check('A.touch-words', touchText.includes('Tap, then Place') && touchText.includes('Drag to look around') && !touchText.includes('Right-drag'), `on a touch screen it says tap and drag: "${touchText.trim()}"`)
  check('A.touch-nothing-in-hand', (await t.draft()) === null, 'no brick is armed on the tablet either')
  await touchGuide.getByRole('button', { name: /Build a robot/ }).tap()
  await t.page.getByRole('dialog', { name: 'Bricks' }).getByTestId('kit-shelf').waitFor({ timeout: 15_000 })
  await t.sleep(500)
  check('A.touch-build-a-robot', await t.page.getByRole('dialog', { name: 'Bricks' }).getByRole('heading', { name: 'Start with a kit' }).isVisible(), 'Build a robot opened the (+) sheet on Start with a kit')
  await t.shot('A4-touch-build-a-robot-opens-kits')
  await t.context.close()
}

/* ============================================================== B–H. building (1366 × 768) */
const s = await openStudio(origin)
await s.page.getByRole('button', { name: 'Frame build' }).click()
await s.sleep(700)

console.log('\nB. Leo\'s motor: dragged from the ground onto the plate')
const plate = await place(s, 'plate_6x8', world(31, 0, 30), 'the plate')
check('B.plate', plate.x === 28 && plate.z === 26 && plate.y === 0, `plate at ${plate.x},${plate.y},${plate.z}`)
const motor = await place(s, 'robo_motor', world(21.5, 0, 31.5), 'a motor on the ground, well left of the plate')
await keepBuilding(s)
check('B.motor-on-ground', motor.y === 0 && (await restingOf(s, motor.id)) === 'ground', `motor at ${motor.x},${motor.y},${motor.z} on the ground`)
await s.page.getByRole('button', { name: 'Frame build' }).click()
await s.sleep(800)
await settle(s)
await s.page.mouse.click(...Object.values(await s.screenOf(topOf(motor, 3, 3, 6))).slice(0, 2))
await s.sleep(300)
check('B.motor-selected', (await s.brick((state) => state.selectedId)) === motor.id, 'a click on the motor selects it')
await s.shot('B1-motor-selected-on-ground')
// Grab it near a corner of its top, not its middle, and drag it over the plate.
const grab = await s.screenOf(topOf(motor, 3, 3, 6, 0.45, 2.55))
const onPlate = await s.screenOf(world(31, 1, 31.5))
check('B.drag-in-view', await inFreeArea(s, grab) && await inFreeArea(s, onPlate), 'the grab point and the plate are in the free canvas area')
const mid = await drag(s, grab, onPlate, { midShot: 'B2-mid-drag-ghost-on-plate' })
check('B.mid-drag-ghost', mid.ghost && mid.ghost.y === 1 && mid.basics?.caption?.tone !== 'blocked', `mid-drag the ghost shows it sitting on the plate (${mid.ghost && `${mid.ghost.x},${mid.ghost.y},${mid.ghost.z}`}), caption ${JSON.stringify(mid.basics?.caption)}`)
let moved = await s.find(motor.id)
check('B.lands-on-plate', moved.y === 1 && (await restingOf(s, motor.id)) === 'plate_6x8' && moved.x === mid.ghost.x && moved.z === mid.ghost.z, `let go, the motor is on the plate at ${moved.x},${moved.y},${moved.z}, where the ghost showed (resting on ${await restingOf(s, motor.id)})`)
const flashAfterMove = await s.basics()
check('B.flash-on-move', flashAfterMove.flash?.ids.includes(motor.id), 'the moved motor flashes where it landed')
await s.shot('B3-motor-landed-on-plate')

console.log('\nC. Arrows, Raise and the height handle never leave it in the air')
await s.page.getByRole('button', { name: 'Adjust' }).click()
await s.sleep(200)
const heights = []
for (let press = 0; press < 6; press += 1) {
  await s.page.getByRole('button', { name: 'Move brick right one stud' }).click()
  await s.sleep(160)
  moved = await s.find(motor.id)
  heights.push({ x: moved.x, y: moved.y, on: await restingOf(s, motor.id) })
  if (moved.y === 0) break
}
measures.arrowsOffTheEdge = heights
check('C.arrow-drops-off-edge', heights.at(-1).y === 0 && heights.every((step) => step.on !== 'nothing (floating)'), `Right, press by press: ${heights.map((step) => `${step.x}/${step.y} on ${step.on}`).join(', ')}`)
await s.shot('C1-arrow-off-the-edge-drops')
await s.page.getByRole('button', { name: 'Move brick left one stud' }).click()
await s.sleep(200)
moved = await s.find(motor.id)
check('C.arrow-steps-up', moved.y === 1 && (await restingOf(s, motor.id)) === 'plate_6x8', `Left once: back on the plate at ${moved.x},${moved.y},${moved.z}`)
await s.page.getByRole('button', { name: 'Raise brick one plate' }).click()
await s.sleep(200)
moved = await s.find(motor.id)
check('C.raise-refused', moved.y === 1 && (await s.toast()) === "Parts can't float. Put something under it.", `Raise: still at height ${moved.y}; the line says "${await s.toast()}"`)
await s.shot('C2-raise-says-parts-cannot-float')
await s.page.getByRole('button', { name: 'Lower brick one plate' }).click()
await s.sleep(200)
const lowered = await s.basics()
check('C.lower-refused-outlined', (await s.find(motor.id)).y === 1 && (await s.toast()) === "It can't go any lower." && lowered.refusal?.ids.includes(plate.id), `Lower: "${await s.toast()}", outlining ${JSON.stringify(lowered.refusal?.ids)}`)
await s.shot('C3-lower-outlines-what-it-sits-on')
await s.page.getByRole('button', { name: 'Adjust' }).click()
await s.sleep(200)
// The height handle floats clear of the part: the part's own middle is the canvas, not the handle.
await settle(s)
const handle = s.page.getByRole('button', { name: 'Drag selection up or down' })
const handleBox = await handle.boundingBox()
const motorTop = await s.screenOf(topOf(await s.find(motor.id), 3, 3, 6))
check('C.handle-clear-of-part', handleBox && handleBox.y + handleBox.height < motorTop.y && await inFreeArea(s, motorTop), `the handle (${Math.round(handleBox.x)},${Math.round(handleBox.y)} ${Math.round(handleBox.width)}×${Math.round(handleBox.height)}) sits above the part's top (${Math.round(motorTop.x)},${Math.round(motorTop.y)})`)
await drag(s, { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 }, { x: handleBox.x + handleBox.width / 2, y: handleBox.y + handleBox.height / 2 - 120 }, { steps: 12 })
moved = await s.find(motor.id)
check('C.handle-up-no-float', moved.y === 1 && (await s.toast()) === "Parts can't float. Put something under it.", `pulled up 120 px: still at height ${moved.y} ("${await s.toast()}")`)
await s.shot('C4-handle-up-stays-put')

// A part left in the air: stack a 1 × 2 on a 2 × 2 on the plate, then delete the 2 × 2 under it.
await s.page.keyboard.press('Escape')
const base = await place(s, 'brick_2x2', world(29, 1, 33), 'a 2 × 2 on the plate')
const stacked = await place(s, 'brick_1x2', world(29.5, 4, 33.5), 'a 1 × 2 on the 2 × 2')
check('C.stacked', stacked.y === base.y + 3, `1 × 2 on the 2 × 2 at height ${stacked.y}`)
await s.page.mouse.click(...Object.values(await s.screenOf(topOf(base, 2, 2, 1.5, 1.8, 1.9))).slice(0, 2))
await s.sleep(250)
check('C.base-selected', (await s.brick((state) => state.selectedId)) === base.id, 'the 2 × 2 under it is selected')
await s.page.getByRole('button', { name: /^Delete/ }).click()
await s.sleep(300)
check('C.left-in-air', (await restingOf(s, stacked.id)) === 'nothing (floating)', `with its support deleted the 1 × 2 hangs at height ${(await s.find(stacked.id)).y}`)
await s.page.mouse.click(...Object.values(await s.screenOf(topOf(stacked, 1, 2, 3))).slice(0, 2))
await s.sleep(250)
check('C.floating-selected', (await s.brick((state) => state.selectedId)) === stacked.id, 'the floating 1 × 2 is selected')
await settle(s)
const handle2 = await s.page.getByRole('button', { name: 'Drag selection up or down' }).boundingBox()
await drag(s, { x: handle2.x + handle2.width / 2, y: handle2.y + handle2.height / 2 }, { x: handle2.x + handle2.width / 2, y: handle2.y + handle2.height / 2 + 160 }, { steps: 14, midShot: 'C5-handle-down-mid' })
const landed = await s.find(stacked.id)
check('C.handle-down-lands', landed.y === 1 && (await restingOf(s, stacked.id)) === 'plate_6x8', `pulled down, it landed on the plate at height ${landed.y} (not beside it, not under it)`)
await s.shot('C6-handle-down-landed-on-plate')

// Leo's self-stacking: start a move and point at the part's own body; the ghost targets what is behind it.
await s.page.mouse.click(...Object.values(await s.screenOf(topOf(await s.find(motor.id), 3, 3, 6))).slice(0, 2))
await s.sleep(250)
await s.page.getByRole('button', { name: 'Adjust' }).click()
await s.sleep(150)
await s.page.getByRole('button', { name: 'Move brick', exact: true }).click()
await s.sleep(200)
const before = await s.find(motor.id)
const ownBody = await s.screenOf(topOf(before, 3, 3, 6))
await s.page.mouse.move(ownBody.x - 30, ownBody.y - 20, { steps: 3 })
await s.page.mouse.move(ownBody.x, ownBody.y, { steps: 6 })
await s.sleep(250)
const ownGhost = await s.draft()
await s.shot('C7-move-pointing-at-its-own-body')
check('C.no-self-stacking', ownGhost && ownGhost.y !== before.y + 6 && ownGhost.y <= 1, `moving the motor (height ${before.y}) with the pointer on its own body, the ghost is at height ${ownGhost?.y}, not ${before.y + 6} on top of itself`)
await s.page.mouse.click(ownBody.x, ownBody.y)
await s.sleep(300)
const afterSelf = await s.find(motor.id)
check('C.self-click-not-floating', (await restingOf(s, motor.id)) !== 'nothing (floating)', `a click there put it at ${afterSelf.x},${afterSelf.y},${afterSelf.z}, resting on ${await restingOf(s, motor.id)}`)
await s.page.keyboard.press('Escape')
await s.sleep(150)

await s.context.close()

// D–H start from a fresh robot base of their own: a plate and a hub, placed with the mouse.
const s2 = await openStudio(origin)
await s2.page.getByRole('button', { name: 'Frame build' }).click()
await s2.sleep(700)
const plate2 = await place(s2, 'plate_6x8', world(31, 0, 30), 'the plate')
check('D.plate', plate2.x === 28 && plate2.z === 26 && plate2.y === 0, `plate at ${plate2.x},${plate2.y},${plate2.z}`)
console.log('\nD. Leo\'s hub: grabbed in the middle, it drags sideways')
const hub = await place(s2, 'robo_hub', world(31, 1, 29), 'a hub on the plate')
await keepBuilding(s2)
check('D.hub-on-plate', hub.y === 1, `hub at ${hub.x},${hub.y},${hub.z}`)
await s2.page.getByRole('button', { name: 'Top view', exact: true }).click()
await s2.sleep(900)
await settle(s2)
const hubNow = await s2.find(hub.id)
const hubMiddle = await s2.screenOf(topOf(hubNow, 4, 4, 6))
await s2.page.mouse.click(hubMiddle.x, hubMiddle.y)
await s2.sleep(300)
check('D.hub-selected', (await s2.brick((state) => state.selectedId)) === hub.id, 'a click in the middle of the hub selects it')
const handle3 = await s2.page.getByRole('button', { name: 'Drag selection up or down' }).boundingBox()
const underMiddle = await s2.page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, hubMiddle)
check('D.middle-is-the-part', underMiddle === 'CANVAS' && !(hubMiddle.x >= handle3.x && hubMiddle.x <= handle3.x + handle3.width && hubMiddle.y >= handle3.y && hubMiddle.y <= handle3.y + handle3.height), `in the top view the hub's middle is the hub itself (${underMiddle}); the handle sits at ${Math.round(handle3.x)},${Math.round(handle3.y)}`)
await s2.shot('D1-top-view-hub-selected-handle-clear')
const ground = await s2.screenOf(world(hubNow.x - 5, 0, hubNow.z + 2))
const hubDrag = await drag(s2, hubMiddle, ground, { midShot: 'D2-hub-dragged-by-its-middle' })
const hubAfter = await s2.find(hub.id)
check('D.hub-moved', hubAfter.x !== hubNow.x && hubAfter.y === 0 && (await restingOf(s2, hub.id)) === 'ground', `dragged by its middle, the hub went sideways to ${hubAfter.x},${hubAfter.y},${hubAfter.z} and sits on the ground (mid-drag ${JSON.stringify(hubDrag.ghost)})`)
const corner = await s2.screenOf(topOf(hubAfter, 4, 4, 6, 3.6, 0.4))
const back = await s2.screenOf(world(hubNow.x + 3.6, 1, hubNow.z + 0.4))
await drag(s2, corner, back)
const hubBack = await s2.find(hub.id)
check('D.hub-back-by-corner', hubBack.y === 1 && (await restingOf(s2, hub.id)) === 'plate_6x8', `grabbed by a corner and dragged back, it is on the plate at ${hubBack.x},${hubBack.y},${hubBack.z}`)
await s2.shot('D3-hub-back-on-plate')
await s2.page.getByRole('button', { name: '3D view', exact: true }).click()
await s2.sleep(800)

console.log('\nH. Seen from the top, the ghost says what it sits on')
await s2.page.getByRole('button', { name: 'Top view', exact: true }).click()
await s2.sleep(900)
await choose(s2, 'brick_2x2')
await aim(s2, world(29.5, 1, 32.5), 'free plate in the top view')
let seen = await s2.basics()
check('H.on-the-plate', seen.caption?.text === 'On the plate', `over the plate: "${seen.caption?.text}"`)
await s2.shot('H1-top-view-on-the-plate')
await aim(s2, world(38, 0, 30), 'the ground in the top view')
seen = await s2.basics()
check('H.on-the-ground', seen.caption?.text === 'On the ground', `over the ground: "${seen.caption?.text}"`)
await s2.shot('H2-top-view-on-the-ground')
const hubTop = await s2.find(hub.id)
await aim(s2, topOf(hubTop, 4, 4, 6), 'the hub in the top view')
seen = await s2.basics()
check('H.on-the-hub', seen.caption?.text === 'On the hub', `over the hub: "${seen.caption?.text}"`)
await s2.shot('H3-top-view-on-the-hub')
await s2.page.keyboard.press('Escape')
await s2.page.getByRole('button', { name: '3D view', exact: true }).click()
await s2.sleep(900)

console.log('\nG. A refusal says why, and what is in the way is outlined')
await choose(s2, 'brick_2x4')
const hubG = await s2.find(hub.id)
// On the plate right beside the hub, so the 2 × 4's footprint runs into it.
await aim(s2, world(hubG.x - 0.3, 1, hubG.z + 2), 'the plate beside the hub')
seen = await s2.basics()
let ghost = await s2.draft()
check('G.in-the-way', seen.caption?.text === 'Something is in the way.' && seen.caption?.tone === 'blocked' && seen.blockers.includes(hub.id), `beside the hub the ghost is red, says "${seen.caption?.text}" and outlines ${JSON.stringify(seen.blockers)} (ghost ${ghost.x},${ghost.y},${ghost.z})`)
await s2.shot('G1-something-is-in-the-way')
const countG = await s2.count()
await s2.page.mouse.click(...Object.values(await s2.screenOf(world(hubG.x - 0.3, 1, hubG.z + 2))).slice(0, 2))
await s2.sleep(250)
check('G.click-refused', (await s2.count()) === countG && (await s2.toast()) === 'Something is in the way.', `a click there places nothing: "${await s2.toast()}"`)
// At the far edge of the build plate: the 2 × 4 would hang past it.
await s2.page.keyboard.press('Escape')
await s2.brick((state) => state.requestView('home'))
await s2.sleep(300)
await choose(s2, 'brick_2x4')
const edgeSpot = world(63.7, 0, 33)
await bringIntoView(s2, edgeSpot)
const edgeAt = await s2.screenOf(edgeSpot)
if (await inFreeArea(s2, edgeAt)) {
  await s2.page.mouse.move(edgeAt.x, edgeAt.y, { steps: 8 })
  await s2.sleep(250)
  seen = await s2.basics()
  check('G.off-the-plate', seen.caption?.text === "That's off the plate.", `at the plate's edge: "${seen.caption?.text}"`)
  await s2.shot('G2-off-the-plate')
} else record('G.off-the-plate', true, 'skipped: the plate edge is not in the free canvas area at this zoom')
await s2.page.keyboard.press('Escape')

console.log('\nE. Noah\'s gate: no surprise far-away drops')
await s2.page.getByRole('button', { name: /^Robots/ }).click()
await s2.page.getByTestId('kit-shelf').waitFor()
await s2.page.locator('.kit-card[data-kit="gate"]').click()
await s2.sleep(250)
const gateSpot = world(33, 0, 45)
const beforeGate = await s2.count()
await s2.page.getByRole('button', { name: 'Frame build' }).click()
await s2.sleep(800)
await bringIntoView(s2, gateSpot)
const gateAt = await aim(s2, gateSpot, 'free ground in front of the robot')
await s2.page.mouse.click(gateAt.x, gateAt.y)
await s2.sleep(900)
const gateBricks = await s2.brick((state, from) => state.bricks.slice(from).map((b) => ({ id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation })), beforeGate)
check('E.gate-placed', gateBricks.length >= 8, `a Gate kit (${gateBricks.length} bricks) stands in front of the robot`)
await s2.page.keyboard.press('Escape')
await s2.page.getByRole('button', { name: 'Frame build' }).click()
await s2.sleep(900)
await choose(s2, 'brick_1x2')
// The gate's tallest brick (its lintel): aim at the middle of its top, then just above its top edge on screen.
const sizesByPart = { pillar_1x1: [1, 1, 9], brick_1x1: [1, 1, 3], brick_1x4: [1, 4, 3], brick_1x6: [1, 6, 3], brick_2x2: [2, 2, 3], plate_2x4: [2, 4, 1], plate_6x8: [6, 8, 1], robo_hinge_motor: [2, 2, 6], robo_hub: [4, 4, 6], robo_distance_sensor: [2, 1, 3] }
const topCentre = (b) => { const [w, d, h] = sizesByPart[b.partId] ?? [1, 1, 3]; const [rw, rd] = b.rotation % 2 ? [d, w] : [w, d]; return world(b.x + rw / 2, b.y + h, b.z + rd / 2) }
const tallest = gateBricks.reduce((best, b) => (b.y + (sizesByPart[b.partId]?.[2] ?? 3) > best.y + (sizesByPart[best.partId]?.[2] ?? 3) ? b : best), gateBricks[0])
await settle(s2)
let topPoint = null
for (let dy = 0; dy < 80; dy += 2) {
  const probeAt = await s2.screenOf(topCentre(tallest))
  topPoint = { x: probeAt.x, y: probeAt.y - dy }
  const hit = await s2.page.evaluate((p) => window.__robotics.pick(p.x, p.y), topPoint)
  if (!hit || !hit.onBrick) break
}
measures.skim = { tallest, above: topPoint }
// On the top of the gate the ghost sits on it; a few pixels higher the ray only just misses it.
await s2.page.mouse.move(topPoint.x, topPoint.y + 40, { steps: 4 })
await s2.page.mouse.move(topPoint.x, topPoint.y + 3, { steps: 6 })
await s2.sleep(250)
const ghostBefore = await s2.draft()
const beforeSkim = await s2.count()
await s2.page.mouse.move(topPoint.x, topPoint.y - 4, { steps: 3 })
await s2.sleep(250)
const skimPick = await s2.page.evaluate((p) => window.__robotics.pick(p.x, p.y), { x: topPoint.x, y: topPoint.y - 4 })
seen = await s2.basics()
const ghostSkim = await s2.draft()
measures.skim.ghostOnTop = ghostBefore
measures.skim.pick = skimPick
check('E.skim-ghost-stays', skimPick && skimPick.far && ghostSkim.x === ghostBefore.x && ghostSkim.y === ghostBefore.y && ghostSkim.z === ghostBefore.z && seen.caption?.text === 'Too far away. Zoom in to build there.', `just above the gate's top the ray lands at z ${skimPick ? `${(skimPick.point[2] / STUD + 32).toFixed(1)}, behind the gate (far: ${skimPick.far})` : 'nowhere'}; the ghost stays on the gate at ${ghostSkim.x},${ghostSkim.y},${ghostSkim.z} (was ${ghostBefore.x},${ghostBefore.y},${ghostBefore.z}) and says "${seen.caption?.text}"`)
await s2.shot('E1-just-above-the-gate-says-too-far')
await s2.page.mouse.click(topPoint.x, topPoint.y - 4)
await s2.sleep(300)
check('E.skim-click-places-nothing', (await s2.count()) === beforeSkim && (await s2.toast()) === 'Too far away. Zoom in to build there.', `a click there places nothing: "${await s2.toast()}"`)
// The top edge of the view, over the build.
const rect = await s2.page.evaluate(() => { const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width } })
const edgeTop = { x: topPoint.x, y: rect.top + 14 }
if (await inFreeArea(s2, { ...edgeTop, inFront: true })) {
  await s2.page.mouse.move(edgeTop.x, edgeTop.y, { steps: 6 })
  await s2.sleep(200)
  await s2.page.mouse.click(edgeTop.x, edgeTop.y)
  await s2.sleep(300)
  const edgePick = await s2.page.evaluate((p) => window.__robotics.pick(p.x, p.y), edgeTop)
  check('E.top-edge-places-nothing', (await s2.count()) === beforeSkim, `a click at the top of the view (${edgePick ? `ray lands ${edgePick.depthRatio?.toFixed(2)}× the view depth, far: ${edgePick.far}` : 'ray hits nothing'}) places nothing`)
} else record('E.top-edge-places-nothing', true, 'skipped: the top edge above the gate is covered by a panel at this size')
// A normal placement on top of the gate still works, and the new part flashes.
const onGate = await s2.screenOf(topCentre(tallest))
await s2.page.mouse.move(onGate.x, onGate.y + 3, { steps: 6 })
await s2.sleep(250)
const gateGhost = await s2.draft()
await s2.page.mouse.click(onGate.x, onGate.y + 3)
await s2.sleep(120)
const flash = await s2.basics()
const newest = await s2.brick((state) => state.bricks.at(-1))
await s2.shot('E2-placed-on-the-gate-flashes')
check('E.place-on-top-flashes', (await s2.count()) === beforeSkim + 1 && newest.y === gateGhost.y && flash.flash?.ids.includes(newest.id), `aimed on the gate's top, the 1 × 2 went on it at ${newest.x},${newest.y},${newest.z} and flashes (${JSON.stringify(flash.flash?.ids)})`)
check('E.no-far-notice', flash.farNotice === null, 'nothing landed out of sight, so no "far away" notice')
// A part that lands out of sight anyway is announced with Show me / Undo: aim, zoom in on it, turn the
// view a little with the right button, walk the ghost off the screen with the arrow keys, press Enter.
await s2.page.keyboard.press('Escape')
await choose(s2, 'brick_1x2')
const aimOut = await aim(s2, world(33, 1, 30), 'the right of the plate')
for (let notch = 0; notch < 6; notch += 1) { await s2.page.mouse.wheel(0, -100); await s2.sleep(90) }
await s2.page.mouse.click(aimOut.x, aimOut.y, { button: 'right' })
await s2.sleep(250)
for (let press = 0; press < 18; press += 1) { await s2.page.keyboard.press('ArrowRight'); await s2.sleep(40) }
await s2.sleep(300)
const hidden = await s2.draft()
const hiddenAt = await s2.screenOf(world(hidden.x + 0.5, hidden.y + 1.5, hidden.z + 1))
const outOfView = !(await inFreeArea(s2, hiddenAt))
await s2.page.keyboard.press('Enter')
await s2.sleep(900)
const notice = s2.page.getByTestId('kid-basics-far-notice')
const noticeText = (await notice.count()) ? await notice.innerText() : null
check('E.far-notice', outOfView && noticeText?.includes('Your part landed far away.'), `placed with the ghost out of view (${Math.round(hiddenAt.x)},${Math.round(hiddenAt.y)}): "${noticeText?.replace(/\s+/g, ' ')}"`)
await s2.shot('E3-landed-out-of-sight-notice')
await notice.getByRole('button', { name: /Show me/ }).click()
await s2.sleep(1200)
const shown = await s2.brick((state) => state.bricks.at(-1))
const shownAt = await s2.screenOf(world(shown.x + 0.5, shown.y + 1.5, shown.z + 1))
check('E.show-me', (await notice.count()) === 0 && await inFreeArea(s2, shownAt), `Show me framed it: now at ${Math.round(shownAt.x)},${Math.round(shownAt.y)} in view`)
await s2.shot('E4-show-me-framed-it')
await s2.page.keyboard.press('Escape')

await s2.context.close()

console.log('\nF. Zoom with the mouse wheel, from the view a new build opens with')
const s3 = await openStudio(origin)
await s3.sleep(600)
await settle(s3)
const d0 = await s3.cameraDistance()
const centre = await s3.page.evaluate(() => { const canvas = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0]; const r = canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.55 } })
await s3.page.mouse.move(centre.x, centre.y)
const ratios = []
let notchesToDouble = null
for (let notch = 1; notch <= 8; notch += 1) {
  await s3.page.mouse.wheel(0, 100)
  await s3.sleep(140)
  const ratio = (await s3.cameraDistance()) / d0
  ratios.push(Number(ratio.toFixed(3)))
  if (notchesToDouble === null && ratio >= 1.99) notchesToDouble = notch
  if (notchesToDouble !== null) break
}
await s3.shot('F1-zoomed-out-twice')
for (let notch = 0; notch < (notchesToDouble ?? 0); notch += 1) { await s3.page.mouse.wheel(0, -100); await s3.sleep(140) }
const backIn = (await s3.cameraDistance()) / d0
let swipe = 1
const swipeStart = await s3.cameraDistance()
for (let step = 0; step < 40; step += 1) { await s3.page.mouse.wheel(0, 10); await s3.sleep(16) }
await s3.sleep(200)
swipe = (await s3.cameraDistance()) / swipeStart
measures.zoom = { notchPixels: 100, ratiosPerNotch: ratios, notchesToDouble, backInRatio: Number(backIn.toFixed(3)), trackpadSwipe40x10px: Number(swipe.toFixed(3)) }
check('F.notches-to-double', notchesToDouble !== null && notchesToDouble >= 3 && notchesToDouble <= 5, `from the view a new build opens with (${d0.toFixed(1)} units away), ${notchesToDouble} wheel notches (100 px each) double the distance: ${ratios.join(' → ')}`)
check('F.back-in', Math.abs(backIn - 1) < 0.02, `as many notches back in return to ${backIn.toFixed(3)}× the distance`)
check('F.trackpad', swipe > 1.5 && swipe < 2.5, `a trackpad swipe of 40 small events (400 px) zooms ${swipe.toFixed(2)}× (a fixed 5 % per event made it 7.8×)`)
await s3.context.close()

/* ============================================================== I. without the flag */
console.log('\nI. Without the flag the studio is unchanged')
let flagOff = null
try {
  const response = await fetch(`${flagOffOrigin}/build`)
  if (response.ok) flagOff = flagOffOrigin
} catch { /* not running */ }
if (!flagOff) record('I.flag-off', true, `skipped: no unflagged studio at ${flagOffOrigin} (start \`npx vite --port 5246 --strictPort --host 127.0.0.1\`)`)
else {
  const o = await openStudio(flagOff, { quickStart: true })
  const oldGuide = o.page.getByRole('heading', { name: 'Build something you can explore' })
  await oldGuide.waitFor({ timeout: 30_000 })
  await o.sleep(300)
  await o.shot('I1-flag-off-studio-quick-start')
  check('I.flag-off-quick-start', (await o.page.getByTestId('kid-quick-start').count()) === 0 && await oldGuide.isVisible(), 'the studio\'s own quick start ("Build something you can explore") is shown')
  check('I.flag-off-armed', (await o.draft())?.partId === 'brick_2x4', 'the studio still starts with a 2 × 4 brick in hand')
  await o.page.getByRole('button', { name: 'Start building' }).click()
  await o.sleep(300)
  // Starting bricks through the store (no robotics dev hooks here): a 2 × 2 on the ground and a 1 × 2 on it.
  await o.brick((state) => {
    state.cancelInteraction()
    state.choosePart('brick_2x2'); state.setDraftPosition(30, 0, 30); state.placeDraft()
    state.choosePart('brick_1x2'); state.setDraftPosition(30, 3, 30); state.placeDraft()
    state.cancelInteraction()
  })
  await o.brick((state) => state.requestView('home'))
  await o.sleep(900)
  const topBrick = await o.brick((state) => state.bricks.find((b) => b.partId === 'brick_1x2'))
  await o.page.getByLabel('Jump to brick').selectOption(topBrick.id)
  await o.sleep(250)
  await o.page.keyboard.press('ArrowRight')
  await o.sleep(150)
  await o.page.keyboard.press('ArrowRight')
  await o.sleep(150)
  let offTop = await o.find(topBrick.id)
  check('I.flag-off-arrows', offTop.x === 32 && offTop.y === 3, `arrows keep the height as before: the 1 × 2 is at ${offTop.x},${offTop.y} past the 2 × 2's edge (in the air, the studio's own behaviour)`)
  await o.page.keyboard.press('PageUp')
  await o.sleep(150)
  offTop = await o.find(topBrick.id)
  check('I.flag-off-raise', offTop.y === 4, `Page Up lifts it one plate to ${offTop.y}, as before`)
  // A mouse drag of the selected brick keeps its height too.
  const fromO = await o.screenOf(world(offTop.x + 0.5, offTop.y + 3, offTop.z + 1))
  const toO = await o.screenOf(world(offTop.x + 4.5, offTop.y + 3, offTop.z + 1))
  await drag(o, fromO, toO)
  const draggedO = await o.find(topBrick.id)
  check('I.flag-off-drag', draggedO.y === 4 && draggedO.x !== offTop.x, `a drag moves it sideways at the same height (${draggedO.x},${draggedO.y},${draggedO.z}), as before`)
  await o.page.getByRole('button', { name: 'Frame build' }).click()
  await o.sleep(900)
  await o.shot('I2-flag-off-moves-unchanged')
  const handleO = await o.page.getByRole('button', { name: 'Drag selection up or down' }).boundingBox()
  const middleO = await o.screenOf(world(draggedO.x + 0.5, draggedO.y + 3, draggedO.z + 1))
  measures.flagOffHandle = { handle: handleO, partTop: middleO }
  await o.page.getByRole('button', { name: 'Frame build' }).click()
  await o.sleep(900)
  const o0 = await o.cameraDistance()
  await o.page.mouse.move(700, 430)
  await o.page.mouse.wheel(0, 100)
  await o.sleep(200)
  const step = (await o.cameraDistance()) / o0
  measures.flagOffZoomPerNotch = Number(step.toFixed(4))
  check('I.flag-off-zoom', Math.abs(step - 1 / 0.95) < 0.005, `one wheel notch still moves the studio's fixed 5 % (${step.toFixed(4)}×)`)
  await o.context.close()
}

check('Z.no-page-errors', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : 'no page errors')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, flagOffOrigin: flagOff, input: "real mouse, keyboard and wheel via Playwright; aim points from the studio's own world→screen projection", at: new Date().toISOString(), measures, results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
