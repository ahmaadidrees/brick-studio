/**
 * Robot Workshop kid-UX pass, lane P: make it yours (painting, the part card, the panel always
 * about the robot you touch), in real Chrome, by real mouse clicks and touch taps.
 *
 * Against the robotics dev server (`npx vite --mode robotics --port 5244 --strictPort --host 127.0.0.1`).
 * Where the pointer goes is the studio's own answer to "where is that brick on my screen" (the
 * dev-only `window.__robotics.project`), the aiming a student does by eye; everything else is a
 * click or a tap on what the page shows. After each step the harness reads back the document
 * (brick colours, the history) and what the page shows.
 *
 *   K (1366×768)  a kit just placed leaves nothing picked: the first click on a wheel picks just the
 *                 wheel, and the strip's Color is for that one brick (Ava's "Color all 9 bricks").
 *   A (1366×768)  a Buggy kit; pick a colour in the Paint row, click two bricks (2 clicks + 1 per
 *                 brick with Done); "Paint all of Buggy"; one Undo takes it back; a picked brick
 *                 and a drawer swatch paint it; a motor's card (no port letters or code line until
 *                 More; big Turn and Remove); an idea's part placed once (the strip goes back to
 *                 "Pick a brick", the part flashes); the drawer remembers Robots across a reload.
 *   S (1366×768)  the seat idea (Ava's first seat landed loose): its ghost comes on the robot's top and
 *                 Place puts it on (the idea ticks); placed on bare ground instead, it goes back into the
 *                 hand, on top again, and a line says so.
 *   B (1366×768)  a Gate and a Signal light: a motor test on the Gate, then a click on the Signal
 *                 light's hub: the title, the steps and Code are the Signal light's and the test
 *                 stops; back from Try it the panel is the Gate's and the Gate is framed clear of
 *                 the drawer and the panel.
 *   C (1024×768)  the command strip's Color popover is fully visible beside the robot panel (their
 *                 boxes do not overlap); the paint states and the part card photographed.
 *   D (iPad portrait 820×1094, touch)  the Buggy by touch is framed beside the panel; tap a colour,
 *                 tap a brick: it is painted; the part card's targets are finger-sized; the Color
 *                 popover clears the panel.
 *   E (iPad landscape 1180×820, touch)  the Color popover clears the panel there too.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5244 node scripts/qa/robotics-kid-paint.mjs
 *
 * Writes PNGs and results.json under docs/qa/robotics-kid/paint/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5244', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/paint')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const shots = []
const consoleErrors = []
const counts = {}
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); return ok }
const check = (id, condition, detail) => record(id, Boolean(condition), detail)

const STUD = 0.62
const PLATE = 0.18
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
const RED = '#e7473c'
const GREEN = '#65b85a'
const PURPLE = '#6857d9'
const ORANGE = '#ef8d32'

async function openStudio(width, height, touch = false) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${width}: ${message.text()}`) })
  page.on('pageerror', (error) => consoleErrors.push(`${width}: ${String(error)}`))
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`)
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.project && window.__robotics?.driveView && window.__robotics?.codeView), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(target === 'hook' ? window.__robotics : window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
  const t = {
    page, context, width, height, touch,
    tag: touch ? `ipad-${width}` : String(width),
    sleep: (ms) => page.waitForTimeout(ms),
    brick: run('brickStore'), robo: run('roboticsStore'), drive: run('driveView'), code: run('codeView'), hook: run('hook'),
    panel: page.getByTestId('robotics-panel'),
  }
  t.shot = async (name) => { const file = `${t.tag}-${name}.png`; await page.screenshot({ path: path.join(out, file) }); shots.push(file); console.log(`  shot ${file}`); return file }
  t.screenOf = (point) => t.hook((hook, p) => hook.project(p), point)
  t.clearToast = () => page.evaluate(() => window.__robotics.brickStore.setState({ toast: null }))
  t.colors = (ids) => t.brick((state, list) => Object.fromEntries(list.map((id) => [id, state.bricks.find((brick) => brick.id === id)?.color ?? null])), ids)
  t.history = () => t.brick((state) => state.undoStack.map((entry) => entry.label))
  t.selected = () => t.brick((state) => [...state.selectedIds])
  t.painting = () => page.evaluate(() => window.__robotics.paintMode.getState().painting)
  t.title = () => t.panel.locator('input.robotics-name').inputValue()
  t.freeArea = () => page.evaluate(() => { const hook = window.__robotics; const rect = hook.canvasRect(); const insets = hook.insets(); return { left: rect.left + insets.left, right: rect.left + rect.width - insets.right, top: rect.top + insets.top, bottom: rect.top + rect.height - insets.bottom } })
  await t.brick((state) => state.newBuild())
  await t.brick((state) => state.requestView('home'))
  await t.clearToast()
  await t.sleep(600)
  return t
}

/**
 * Where on a brick's top a pointer can land: the stud nearest its middle that nothing stands on
 * (a hub carries a sensor and a light; a plate carries the hub), in world units.
 */
const freeTop = (t, id) => t.robo((state, brickId) => {
  const { bricks, partMap, plateSize } = state.model.input
  const size = (brick) => { const part = partMap[brick.partId]; const turned = brick.rotation % 2 === 1; return { w: turned ? part.depth : part.width, d: turned ? part.width : part.depth, h: part.height } }
  const brick = bricks.find((candidate) => candidate.id === brickId)
  if (!brick) return null
  const own = size(brick)
  const top = brick.y + own.h
  const covered = (x, z) => bricks.some((other) => { if (other.id === brickId) return false; const s = size(other); return other.y <= top && other.y + s.h > top && x >= other.x && x < other.x + s.w && z >= other.z && z < other.z + s.d })
  const studs = []
  for (let x = brick.x; x < brick.x + own.w; x += 1) for (let z = brick.z; z < brick.z + own.d; z += 1) if (!covered(x, z)) studs.push({ x, z })
  const middle = { x: brick.x + own.w / 2, z: brick.z + own.d / 2 }
  studs.sort((a, b) => Math.hypot(a.x + 0.5 - middle.x, a.z + 0.5 - middle.z) - Math.hypot(b.x + 0.5 - middle.x, b.z + 0.5 - middle.z))
  const stud = studs[0] ?? { x: Math.floor(middle.x), z: Math.floor(middle.z) }
  const half = plateSize / 2
  return { x: (stud.x + 0.5 - half) * 0.62, y: top * 0.18 - 0.01, z: (stud.z + 0.5 - half) * 0.62 }
}, id)

/** A student's click (or tap) on a brick: aimed at a free stud on its top. */
async function hitBrick(t, id, label) {
  const point = await freeTop(t, id)
  assert(point, `${label}: no such brick`)
  const at = await t.screenOf(point)
  assert(at.inFront, `${label}: behind the camera`)
  if (t.touch) await t.page.touchscreen.tap(at.x, at.y)
  else {
    await t.page.mouse.move(at.x, at.y, { steps: 6 })
    await t.sleep(120)
    await t.page.mouse.click(at.x, at.y)
  }
  await t.sleep(300)
  return at
}

/** Each robot as the panel reads it. */
const robotsOf = (t) => t.robo((state) => state.model.creations.map((c) => ({
  id: c.id, name: c.name, brickIds: c.brickIds, hubId: c.hubs[0]?.brickId ?? null,
  motors: c.motors.map((m) => m.brickId), motorNames: Object.fromEntries(c.motors.map((m) => [m.name, m.brickId])), hinges: c.hinges.map((h) => h.brickId), sensors: c.sensors.map((s) => s.brickId), lights: c.lights.map((l) => l.brickId),
  wheels: c.wheels.map((w) => w.brickId), axles: c.axles.map((a) => a.brickId),
})))

/**
 * Moves the real mouse onto a stud-grid point. When it is not comfortably inside the canvas area
 * the panels leave free, the camera is zoomed out with the mouse wheel first, as a student would
 * (the kits harness's aim).
 */
async function aimAt(t, point, label) {
  const { page, sleep } = t
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const at = await t.screenOf(point)
    const free = await t.freeArea()
    const margin = 60
    if (at.inFront && at.x > free.left + margin && at.x < free.right - margin && at.y > free.top + margin && at.y < free.bottom - margin) {
      await page.mouse.move(at.x - 40, at.y - 20, { steps: 4 })
      await page.mouse.move(at.x, at.y, { steps: 8 })
      await sleep(200)
      return at
    }
    const middle = { x: (free.left + free.right) / 2, y: (free.top + free.bottom) / 2 }
    await page.mouse.move(middle.x, middle.y)
    for (let notch = 0; notch < 3; notch += 1) { await page.mouse.wheel(0, 120); await sleep(60) }
    await sleep(300)
    console.log(`  zoomed out to bring ${label} into view`)
  }
  throw new Error(`${label} never came into view`)
}

/** A kit from the drawer, placed at a stud-grid spot: Robots, the kit card, then a click (or a tap and Place). */
async function placeKit(t, kit, spot) {
  const { page, sleep } = t
  const before = (await robotsOf(t)).length
  if (t.touch) {
    // A portrait tablet opens the (+) sheet; a landscape one has the drawer docked.
    const sheet = page.getByRole('button', { name: 'Open brick drawer' })
    if (await sheet.isVisible().catch(() => false)) await sheet.tap()
    const robots = page.getByRole('button', { name: /^Robots/ }).last()
    if ((await robots.getAttribute('aria-pressed')) !== 'true') await robots.tap()
    await page.locator(`.kit-card[data-kit="${kit}"]`).tap()
    await sleep(400)
    const at = await t.screenOf(spot)
    await page.touchscreen.tap(at.x, at.y)
    await sleep(300)
    await page.getByRole('button', { name: /^Place / }).tap()
  } else {
    const robots = page.getByRole('button', { name: /^Robots/ })
    if ((await robots.getAttribute('aria-pressed')) !== 'true') await robots.click()
    await page.locator(`.kit-card[data-kit="${kit}"]`).click()
    await sleep(250)
    const at = await aimAt(t, spot, `the spot for the ${kit}`)
    await page.mouse.click(at.x, at.y)
  }
  await sleep(900)
  const robots = await robotsOf(t)
  assert(robots.length === before + 1, `${kit}: a robot was placed`)
  return robots.at(-1)
}

/** The panel's own folds (a picked part has a More of its own). */
const panelFold = (t, name) => t.panel.getByTestId(name === 'More' ? 'robotics-more-fold' : 'robotics-parts-fold').locator('> .robotics-fold-toggle')
const openPanelFold = async (t, name) => { const toggle = panelFold(t, name); if ((await toggle.getAttribute('aria-expanded')) !== 'true') { await toggle.click(); await t.sleep(200) } }
const box = (locator) => locator.evaluate((element) => { const rect = element.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height } })
const overlaps = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
/** Where the robot's bricks land on screen, against the canvas area the drawer, the panel and the strip leave free. */
async function robotInView(t, ids) {
  const free = await t.freeArea()
  const points = []
  for (const id of ids) { const point = await freeTop(t, id); if (point) points.push(await t.screenOf(point)) }
  const outside = points.filter((p) => !p.inFront || p.x < free.left || p.x > free.right || p.y < free.top || p.y > free.bottom)
  return { free, points: points.length, outside: outside.length }
}

/* ================================================================ A. paint at 1366×768 */
console.log('\nA. Paint a Buggy (1366×768)')
const desk = await openStudio(1366, 768)
const { page } = desk
let buggy = await placeKit(desk, 'buggy', world(32, 0, 32))
const ids = {
  hub: buggy.hubId,
  leftMotor: buggy.motorNames['Left motor'],
  rightMotor: buggy.motorNames['Right motor'],
  sensor: buggy.sensors[0],
  wheels: buggy.wheels,
  axles: buggy.axles,
}
ids.plate = await desk.brick((state, list) => state.bricks.find((brick) => list.includes(brick.id) && brick.partId.startsWith('plate_'))?.id ?? null, buggy.brickIds)
check('A.buggy', buggy.name === 'Buggy' && ids.hub && ids.plate && ids.leftMotor && ids.rightMotor && ids.sensor, `a Buggy kit placed from the drawer: ${buggy.brickIds.length} bricks`)
check('A.paint-row', (await page.getByTestId('robotics-paint').getByRole('button', { name: /^Paint / }).count()) === 12, 'the robot panel has a Paint row of twelve colours')
await desk.clearToast()
await desk.shot('01-buggy-paint-row')

// K. Nothing stays picked after a kit lands; the first click on a wheel picks just that wheel.
check('K.nothing-picked', (await desk.selected()).length === 0 && (await page.getByTestId('command-strip').textContent()).includes('Pick a brick from the drawer'), 'the kit just placed leaves nothing picked; the strip says "Pick a brick from the drawer"')
await hitBrick(desk, ids.wheels[0], 'a wheel')
check('K.wheel-picked', (await desk.selected()).join() === ids.wheels[0] && (await page.getByTestId('command-strip').textContent()).includes('Wheel'), 'the first click on a wheel picks just the wheel')
await page.getByRole('button', { name: 'Recolor brick' }).click()
await desk.sleep(300)
check('K.color-one-brick', (await page.getByRole('dialog', { name: 'Brick color' }).count()) === 1 && !(await page.locator('.command-strip-popover').textContent()).includes('Color all'), 'the strip\'s Color is for that one wheel ("Brick color", not "Color all 9 bricks")')
await desk.shot('00-kit-placed-wheel-picked')
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')
await desk.sleep(200)
const start = await desk.colors([ids.plate, ids.hub, ids.leftMotor, ids.rightMotor, ids.sensor, ...ids.wheels, ...ids.axles])

// A1. Pick a colour, click two bricks, Done: 2 clicks and 1 per brick.
counts.pickColour = 0
await page.getByTestId('robotics-paint').getByRole('button', { name: 'Paint red' }).click()
counts.pickColour += 1
await desk.sleep(250)
const bar = page.getByTestId('robotics-paint-bar')
check('A1.painting', (await desk.painting()) && (await bar.isVisible()) && (await bar.textContent()).includes('Painting') && (await bar.textContent()).includes('Red') && (await bar.textContent()).includes('Tap bricks to paint them'), `one click on red: the bar says "${(await bar.textContent()).trim()}"`)
check('A1.strip-steps-aside', (await page.locator('.command-strip:not(.robotics-paint-bar)').count()) === 0 || !(await page.locator('.command-strip:not(.robotics-paint-bar)').isVisible()), 'the command strip steps aside for the paint bar')
check('A1.paint-line', (await page.getByTestId('robotics-paint-line').textContent()).includes('Tap bricks to paint them red.') && await page.getByTestId('robotics-paint-all').isVisible(), 'the Paint row says what a tap does and offers "Paint all of Buggy", in sight')
await desk.shot('02-painting-red')
const history0 = (await desk.history()).length
await hitBrick(desk, ids.hub, 'the hub')
await hitBrick(desk, ids.leftMotor, 'the left motor')
let now = await desk.colors([ids.hub, ids.leftMotor, ids.rightMotor])
const history1 = await desk.history()
check('A1.two-bricks', now[ids.hub] === RED && now[ids.leftMotor] === RED && now[ids.rightMotor] === start[ids.rightMotor], `two clicks painted the hub and the left motor red (the right motor untouched)`)
check('A1.one-undo-each', history1.length === history0 + 2 && history1.slice(-2).every((label) => label === 'Paint brick red'), `one history entry per brick: ${history1.slice(-2).join(' | ')}`)
check('A1.nothing-selected', (await desk.selected()).length === 0 && (await desk.painting()), 'nothing gets selected; painting goes on')
await desk.shot('03-two-bricks-painted')

// A2. Paint all of Buggy, in green.
await page.getByTestId('robotics-paint').getByRole('button', { name: 'Paint green' }).click()
await desk.sleep(200)
const beforeAll = await desk.colors([ids.plate, ids.hub, ids.leftMotor, ids.rightMotor, ids.sensor, ...ids.wheels, ...ids.axles])
await page.getByTestId('robotics-paint-all').click()
await desk.sleep(300)
now = await desk.colors([ids.plate, ids.hub, ids.leftMotor, ids.rightMotor, ids.sensor, ...ids.wheels, ...ids.axles])
const body = [ids.plate, ids.hub, ids.leftMotor, ids.rightMotor]
const kept = [ids.sensor, ...ids.wheels, ...ids.axles]
check('A2.paint-all', body.every((id) => now[id] === GREEN) && kept.every((id) => now[id] === beforeAll[id]), 'Paint all of Buggy: plate, hub and motors green; wheels, axles and the sensor keep their colours')
check('A2.one-entry', (await desk.history()).at(-1) === 'Paint Buggy green' && (await desk.brick((state) => state.toast)) === 'Buggy is green now!', `one history entry "${(await desk.history()).at(-1)}"; the line says "${await desk.brick((state) => state.toast)}"`)
await desk.shot('04-paint-all-green')

// A3. One Undo takes it all back.
await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
await desk.sleep(300)
now = await desk.colors(Object.keys(beforeAll))
check('A3.undo-one-step', Object.entries(beforeAll).every(([id, color]) => now[id] === color), 'one Undo puts every brick back as it was before Paint all')
await desk.shot('05-undo-paint-all')
await bar.getByRole('button', { name: 'Done painting' }).click()
await desk.sleep(250)
check('A3.done', !(await desk.painting()) && (await page.getByTestId('robotics-paint-bar').count()) === 0 && await page.getByTestId('command-strip').isVisible(), 'Done: painting stops, the command strip is back')
counts.paintTwoBricks = { colour: 1, bricks: 2, done: 1 }
record('A3.clicks', true, `painting two bricks took ${1 + 2 + 1} clicks: the colour, one per brick, Done`)

// A4. A picked brick and a drawer swatch paint it.
await hitBrick(desk, ids.rightMotor, 'the right motor')
check('A4.picked', (await desk.selected()).join() === ids.rightMotor, 'a click picks the right motor (not painting any more)')
await page.getByRole('complementary', { name: 'Brick drawer' }).getByRole('button', { name: `Use color ${PURPLE}` }).click()
await desk.sleep(250)
now = await desk.colors([ids.rightMotor])
check('A4.swatch-paints', now[ids.rightMotor] === PURPLE && (await desk.history()).at(-1) === 'Paint brick purple' && (await desk.selected()).join() === ids.rightMotor, `the drawer's purple swatch painted the picked motor (one entry, "${(await desk.history()).at(-1)}"), and it stays picked`)
await desk.shot('06-picked-and-drawer-swatch')

// A5. The part card: simple first.
await page.keyboard.press('Escape')
await hitBrick(desk, ids.leftMotor, 'the left motor')
const card = page.getByTestId('robotics-device-inspector')
const cardText = (await card.textContent()).replace(/\s+/g, ' ').trim()
check('A5.card-line', (await card.getByTestId('wiring-does').textContent()) === 'Turns the left wheel · plugged in', `the motor's card says "${await card.getByTestId('wiring-does').textContent()}"`)
check('A5.no-ports-no-code', !/\bport\b|\b[A-D]\b ▾|run .* at|reversed|Unplug|Move to port|name follows/i.test(cardText), `no port letters, code line, Unplug or Move to port before More: "${cardText}"`)
const turn = await box(card.getByRole('button', { name: /^Turn / }))
const remove = await box(card.getByRole('button', { name: /^Remove / }))
check('A5.big-buttons', turn.height >= 48 && remove.height >= 48 && turn.width >= 100 && remove.width >= 100, `big Turn (${Math.round(turn.width)}×${Math.round(turn.height)}) and Remove (${Math.round(remove.width)}×${Math.round(remove.height)})`)
check('A5.picture-and-pencil', (await card.locator('.wiring-picture .part-thumbnail').count()) === 1 && (await card.getByLabel('Device name').getAttribute('readonly')) !== null && (await card.getByRole('button', { name: /^Rename / }).count()) === 1, 'a picture of the part; the name is text with a pencil beside it')
await desk.shot('07-motor-card')
await card.getByRole('button', { name: /^More about / }).click()
await desk.sleep(200)
check('A5.more-has-wiring', (await card.getByTestId('wiring-state').textContent()) === 'Port A' && (await card.locator('button.wiring-port').count()) === 4 && (await card.getByTestId('wiring-block').textContent()).includes('Left motor · A') && (await card.getByRole('button', { name: 'Unplug', exact: true }).count()) === 1, 'More has the port chips, the code line and Unplug')
await card.getByTestId('wiring-block').scrollIntoViewIfNeeded()
await desk.shot('08-motor-more')

// A6. An idea's part is placed once: the strip goes back to "Pick a brick", the part flashes.
await page.keyboard.press('Escape')
await desk.sleep(200)
await page.getByTestId('robotics-ideas').getByRole('button', { name: /Add a light on top/ }).click()
await desk.sleep(200)
check('A6.armed', (await desk.brick((state) => state.draft?.partId)) === 'robo_light' && (await page.getByTestId('command-strip').textContent()).includes('Placing'), 'the idea row armed a light; the strip says Placing')
const hubTop = await desk.screenOf(await freeTop(desk, ids.hub))
await page.mouse.move(hubTop.x, hubTop.y, { steps: 8 })
await desk.sleep(250)
await page.mouse.click(hubTop.x, hubTop.y)
await desk.sleep(200)
const placedLight = await desk.brick((state) => { const brick = state.bricks.at(-1); return { partId: brick.partId, id: brick.id, draft: state.draft, active: state.activePartId } })
const flash = await page.evaluate(() => window.__robotics.placedFlash.getState().flash)
check('A6.placed-once', placedLight.partId === 'robo_light' && placedLight.draft === null && placedLight.active === null && (await page.getByTestId('command-strip').textContent()).includes('Pick a brick from the drawer'), 'placed: nothing is left armed and the strip says "Pick a brick from the drawer"')
check('A6.flash', flash?.brickId === placedLight.id, 'the new light flashes')
await desk.shot('09-idea-placed-once')
await desk.sleep(1300)

// A6b. An idea with a count says how far along it is: two bricks on top, "2 of 5", not ticked.
await page.getByTestId('robotics-ideas').getByRole('button', { name: /^Stack 5 bricks on top/ }).click()
await desk.sleep(200)
for (let brick = 0; brick < 2; brick += 1) { await page.getByRole('button', { name: 'Place positioned brick' }).click(); await desk.sleep(300) }
await page.keyboard.press('Escape')
await desk.sleep(300)
const stackRow = page.getByTestId('robotics-ideas').locator('[data-step="idea-stack"]')
check('A6.counts', (await stackRow.textContent()).includes('Stack 5 bricks on top · 2 of 5') && (await stackRow.getAttribute('data-state')) === 'todo', `after two bricks the idea reads "${(await stackRow.textContent()).trim()}" and is not ticked`)
await desk.shot('09b-stack-idea-2-of-5')

// A7. The drawer remembers Robots across a reload.
await page.waitForTimeout(1200)
check('A7.robots-before', (await page.getByLabel('Brick category').inputValue()) === 'robotics', 'the drawer shows Robots')
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.project), null, { timeout: 30_000 })
await desk.sleep(800)
check('A7.robots-after-reload', (await page.getByLabel('Brick category').inputValue()) === 'robotics' && await page.getByRole('button', { name: /^Robots/ }).getAttribute('aria-pressed') === 'true', 'after a reload the drawer still shows Robots')

/* ================================================================ S. the seat goes on the robot */
console.log('\nS. The seat idea (1366×768)')
await desk.brick((state) => state.newBuild())
await desk.sleep(300)
const seatBuggy = await placeKit(desk, 'buggy', world(32, 0, 32))
await desk.clearToast()
await page.keyboard.press('Escape')
await desk.sleep(200)
const seatsOf = async () => (await desk.robo((state, id) => state.model.creations.find((c) => c.id === id)?.seats ?? [], seatBuggy.id))
const attachedCount = async () => (await desk.robo((state, id) => state.model.creations.find((c) => c.id === id)?.brickIds.length ?? 0, seatBuggy.id))
const hubTopY = await desk.brick((state, id) => { const hub = state.bricks.find((b) => b.id === id); return hub.y + 6 }, seatBuggy.hubId)
const beforeSeat = await attachedCount()
await page.getByTestId('robotics-ideas').getByRole('button', { name: /Add a seat/ }).click()
await desk.sleep(250)
let seatGhost = await desk.brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z })
check('S.ghost-on-top', seatGhost?.partId === 'robo_seat' && seatGhost.y === hubTopY, `the seat idea's ghost stands on the robot's top (y ${seatGhost?.y}, the hub's top is ${hubTopY})`)
await desk.shot('16-seat-ghost-on-top')
// Ava's way: straight to Place.
await page.getByRole('button', { name: 'Place positioned brick' }).click()
await desk.sleep(400)
check('S.place-puts-it-on', (await seatsOf()).length === 1 && (await attachedCount()) === beforeSeat + 1 && (await page.getByTestId('robotics-ideas').locator('[data-step="idea-seat"]').getAttribute('data-state')) === 'done' && (await desk.brick((state) => state.draft)) === null, `Place put the seat on the Buggy: ${await attachedCount()} bricks attached (was ${beforeSeat}), the seat idea ticked, nothing left in hand`)
await desk.shot('17-seat-on-the-robot')
// Undo, then the seat moved to bare ground and placed there: it goes back into the hand, on top.
await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
await desk.sleep(300)
await page.getByTestId('robotics-ideas').getByRole('button', { name: /Add a seat/ }).click()
await desk.sleep(200)
const bare = await desk.screenOf(world(38, 0, 44))
await page.mouse.move(bare.x - 30, bare.y - 30, { steps: 4 })
await page.mouse.move(bare.x, bare.y, { steps: 8 })
await desk.sleep(250)
seatGhost = await desk.brick((state) => state.draft && { x: state.draft.x, y: state.draft.y, z: state.draft.z })
const bricksBeforeLoose = await desk.brick((state) => state.bricks.length)
await page.mouse.click(bare.x, bare.y)
await desk.sleep(400)
const afterLoose = await desk.brick((state) => ({ bricks: state.bricks.length, draft: state.draft && { partId: state.draft.partId, y: state.draft.y }, toast: state.toast }))
check('S.loose-taken-back', seatGhost.y === 0 && afterLoose.bricks === bricksBeforeLoose && (await seatsOf()).length === 0 && afterLoose.draft?.partId === 'robo_seat' && afterLoose.draft.y === hubTopY, `a click on bare ground (the ghost at y ${seatGhost.y}) placed nothing loose: the seat is back in hand on the robot's top (y ${afterLoose.draft?.y})`)
check('S.says-so', afterLoose.toast === 'The seat goes on Buggy. It is back on top: press Place.', `the line says "${afterLoose.toast}"`)
await desk.shot('18-seat-back-on-top')
await page.getByRole('button', { name: 'Place positioned brick' }).click()
await desk.sleep(400)
check('S.then-on', (await seatsOf()).length === 1 && (await desk.brick((state) => state.draft)) === null, 'Place then puts it on the Buggy')

/* ================================================================ B. the panel follows the robot you touch */
console.log('\nB. A Gate and a Signal light (1366×768)')
await desk.brick((state) => state.newBuild())
await desk.sleep(300)
const gate = await placeKit(desk, 'gate', world(24, 0, 32))
const signal = await placeKit(desk, 'signal-light', world(42, 0, 32))
await desk.clearToast()
await page.keyboard.press('Escape')
await desk.brick((state) => state.requestView('home'))
await desk.sleep(700)
check('B.two-robots', gate.name === 'Gate' && signal.name === 'Signal light', `robots: ${gate.name}, ${signal.name}`)
await hitBrick(desk, gate.hubId, 'the Gate’s hub')
check('B.gate-focused', (await desk.title()) === 'Gate', `a click on the Gate's hub: the panel is "${await desk.title()}"`)
await page.keyboard.press('Escape')
await openPanelFold(desk, 'More')
await desk.panel.getByRole('button', { name: 'Swing open', exact: true }).first().click()
await page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
await desk.sleep(1200)
check('B.gate-test-running', (await desk.robo((state) => state.sim?.creationId)) === gate.id, 'the Gate’s motor test runs (Swing open)')
await desk.shot('10-gate-motor-test')
await hitBrick(desk, signal.hubId, 'the Signal light’s hub')
await desk.sleep(300)
const steps = await page.getByTestId('robotics-next-steps').textContent()
check('B.light-title', (await desk.title()) === 'Signal light' && await page.getByTestId('robotics-hub-inspector').isVisible(), `a click on the Signal light's hub: the panel is "${await desk.title()}" with its hub's card`)
check('B.gate-test-stopped', (await desk.robo((state) => state.sim)) === null, 'the Gate’s test stopped')
check('B.light-steps', steps.includes('Ready to try!'), `its steps: "${steps.replace(/\s+/g, ' ').slice(0, 80)}"`)
await desk.shot('11-signal-light-hub-picked')
await page.getByTestId('robotics-code-button').click()
await desk.sleep(600)
check('B.light-code', (await desk.code((state) => state.creationId)) === signal.id, 'Code opens the Signal light’s program')
await page.getByTestId('robo-back').click()
await desk.sleep(900)
check('B.back-from-code', (await desk.title()) === 'Signal light', `back from Code: the panel is "${await desk.title()}"`)

// Back from Try it: the Gate stays the panel's, framed clear of the drawer and the panel.
await hitBrick(desk, gate.hubId, 'the Gate’s hub')
await page.keyboard.press('Escape')
await desk.sleep(200)
check('B.gate-kept', (await desk.title()) === 'Gate', 'nothing picked: the robot touched last (the Gate) stays, not the newest')
await page.getByTestId('robotics-play-button').click()
await page.waitForSelector('[data-testid=robo-drive][data-state=play]', { timeout: 20_000 })
await desk.sleep(800)
await desk.shot('12-gate-try-it')
await page.getByTestId('robo-drive-back').click()
await desk.sleep(1200)
const view = await robotInView(desk, gate.brickIds)
check('B.back-focus', (await desk.title()) === 'Gate', `back from Try it: the panel is "${await desk.title()}"`)
check('B.back-framed', view.outside === 0, `the Gate framed clear of the drawer, the panel and the strip (${view.points - view.outside}/${view.points} of its bricks inside the free area ${JSON.stringify(Object.fromEntries(Object.entries(view.free).map(([k, v]) => [k, Math.round(v)])))})`)
await desk.shot('13-back-from-try-it-framed')

// And from Drive: a Buggy driven, then back.
await desk.brick((state) => state.newBuild())
await desk.sleep(300)
buggy = await placeKit(desk, 'buggy', world(32, 0, 32))
await page.keyboard.press('Escape')
await page.getByTestId('robotics-play-button').click()
await page.waitForSelector('[data-testid=robo-drive][data-state=play]', { timeout: 20_000 })
await page.keyboard.down('ArrowUp')
await desk.sleep(900)
await page.keyboard.up('ArrowUp')
await page.getByTestId('robo-drive-back').click()
await desk.sleep(1200)
const driven = await robotInView(desk, buggy.brickIds)
check('B.back-from-drive', (await desk.title()) === 'Buggy' && driven.outside === 0, `back from Drive: the Buggy's panel, the Buggy framed in the free area (${driven.points - driven.outside}/${driven.points} inside)`)
await desk.shot('14-back-from-drive-framed')

/* ================================================================ 1366 popover */
await hitBrick(desk, buggy.hubId, 'the hub')
await page.getByRole('button', { name: 'Recolor brick' }).click()
await desk.sleep(400)
const popover1366 = await box(page.locator('.command-strip-popover'))
const panel1366 = await box(desk.panel)
check('B.popover-1366', !overlaps(popover1366, panel1366) && popover1366.left >= 0 && popover1366.top >= 0, `the Color popover (${Math.round(popover1366.left)}–${Math.round(popover1366.right)}) clears the panel (from ${Math.round(panel1366.left)})`)
await desk.shot('15-color-popover')
await desk.context.close()

/* ================================================================ C. 1024×768 */
console.log('\nC. 1024×768')
const small = await openStudio(1024, 768)
const smallBuggy = await placeKit(small, 'buggy', world(32, 0, 32))
await small.clearToast()
await small.page.keyboard.press('Escape')
await small.sleep(300)
await small.shot('01-buggy-paint-row')
await small.page.getByTestId('robotics-paint').getByRole('button', { name: 'Paint orange' }).click()
await small.sleep(300)
await hitBrick(small, smallBuggy.hubId, 'the hub')
check('C.paint-1024', (await small.colors([smallBuggy.hubId]))[smallBuggy.hubId] === ORANGE, 'at 1024: a colour, then a click on the hub paints it')
check('C.paint-all-in-sight', await small.page.getByTestId('robotics-paint-all').isVisible() && await small.page.getByTestId('robotics-paint-bar').isVisible(), 'the bar and "Paint all" are in sight')
await small.shot('02-painting')
await small.page.getByTestId('robotics-paint-bar').getByRole('button', { name: 'Done painting' }).click()
await small.sleep(200)
await hitBrick(small, smallBuggy.motors[0], 'a motor')
await small.shot('03-motor-card')
await small.page.getByTestId('robotics-device-inspector').getByRole('button', { name: /^More about / }).click()
await small.sleep(200)
await small.shot('04-motor-more')
await small.page.keyboard.press('Escape')
await hitBrick(small, smallBuggy.hubId, 'the hub')
await small.page.getByRole('button', { name: 'Recolor brick' }).click()
await small.sleep(400)
const popover = await box(small.page.locator('.command-strip-popover'))
const panel = await box(small.panel)
const covered = await small.page.evaluate(() => {
  const popover = document.querySelector('.command-strip-popover')
  const rect = popover.getBoundingClientRect()
  // Twelve pixels in: inside its 14 px rounded corners.
  const corners = [[rect.left + 12, rect.top + 12], [rect.right - 12, rect.top + 12], [rect.left + 12, rect.bottom - 12], [rect.right - 12, rect.bottom - 12]]
  return corners.filter(([x, y]) => !popover.contains(document.elementFromPoint(x, y))).length
})
check('C.popover-clear', !overlaps(popover, panel) && covered === 0 && popover.left >= 0 && popover.right <= 1024 && popover.top >= 0, `the Color popover (${Math.round(popover.left)},${Math.round(popover.top)}–${Math.round(popover.right)},${Math.round(popover.bottom)}) and the panel (${Math.round(panel.left)},${Math.round(panel.top)}–${Math.round(panel.right)},${Math.round(panel.bottom)}) do not overlap; all four of its corners are on top`)
await small.shot('05-color-popover')
await small.context.close()

/* ================================================================ D. iPad portrait, touch */
console.log('\nD. iPad portrait 820×1094, touch')
const tablet = await openStudio(820, 1094, true)
const tabletBuggy = await placeKit(tablet, 'buggy', world(32, 0, 32))
await tablet.sleep(500)
await tablet.clearToast()
const framedTablet = await robotInView(tablet, tabletBuggy.brickIds)
const tabletPanel = await box(tablet.panel)
check('D.framed-beside-panel', framedTablet.outside === 0 && framedTablet.free.right <= tabletPanel.left + 1, `the Buggy is framed in the free area beside the panel (${framedTablet.points - framedTablet.outside}/${framedTablet.points} bricks inside, the free area ends at ${Math.round(framedTablet.free.right)} px, the panel starts at ${Math.round(tabletPanel.left)} px)`)
await tablet.shot('01-buggy-by-touch')
// Nothing is picked after the kit lands: a colour, then a tap on a brick paints it.
check('D.nothing-picked', (await tablet.selected()).length === 0, 'the kit placed by touch leaves nothing picked')
await tablet.page.getByTestId('robotics-paint').getByRole('button', { name: 'Paint orange' }).tap()
await tablet.sleep(300)
await hitBrick(tablet, tabletBuggy.hubId, 'the hub (tap)')
check('D.tap-paints', (await tablet.colors([tabletBuggy.hubId]))[tabletBuggy.hubId] === ORANGE && (await tablet.selected()).length === 0, 'orange, then a tap on the hub paints it orange (nothing picked)')
await tablet.shot('02-painting-by-touch')
await tablet.page.getByTestId('robotics-paint-bar').getByRole('button', { name: 'Done painting' }).tap()
await tablet.sleep(300)
await hitBrick(tablet, tabletBuggy.motors[0], 'a motor (tap)')
const tabletCard = tablet.page.getByTestId('robotics-device-inspector')
const targets = await tabletCard.locator('button').evaluateAll((buttons) => buttons.map((button) => { const rect = button.getBoundingClientRect(); return { name: (button.getAttribute('aria-label') || button.textContent).trim().slice(0, 24), w: Math.round(rect.width), h: Math.round(rect.height) } }))
check('D.finger-targets', targets.length >= 4 && targets.every((target) => target.w >= 44 && target.h >= 44), `every control on the part's card is at least 44 px: ${targets.map((target) => `${target.name} ${target.w}×${target.h}`).join(', ')}`)
check('D.name-no-keyboard', (await tabletCard.getByLabel('Device name').getAttribute('readonly')) !== null, 'the name is not a text field until its pencil is tapped (no keyboard from a low tap)')
await tabletCard.getByLabel('Device name').tap()
await tablet.sleep(200)
check('D.low-tap-stays-read-only', (await tabletCard.getByLabel('Device name').getAttribute('readonly')) !== null, 'a tap on the name itself leaves it read-only')
await tablet.shot('03-motor-card-by-touch')
/** The Color popover beside the panel on a touch screen: their boxes do not overlap and it is all on screen. */
async function popoverClear(t, id, label) {
  // One brick or the whole new kit (a tap on a picked brick starts a drag, so the kit may stay picked).
  await hitBrick(t, id, 'the hub (tap)')
  await t.page.getByRole('button', { name: /^Recolor / }).tap()
  await t.sleep(500)
  const pop = await box(t.page.locator('.command-strip-popover'))
  const side = await box(t.panel)
  check(label, !overlaps(pop, side) && pop.left >= 0 && pop.top >= 0 && pop.right <= t.width && pop.bottom <= t.height, `the Color popover (${Math.round(pop.left)},${Math.round(pop.top)}–${Math.round(pop.right)},${Math.round(pop.bottom)}) and the panel (${Math.round(side.left)},${Math.round(side.top)}–${Math.round(side.right)},${Math.round(side.bottom)}) do not overlap`)
  await t.shot('color-popover')
}
await popoverClear(tablet, tabletBuggy.hubId, 'D.popover-clear')
await tablet.context.close()

/* ================================================================ E. iPad landscape, touch */
console.log('\nE. iPad landscape 1180×820, touch')
const landscape = await openStudio(1180, 820, true)
const landscapeBuggy = await placeKit(landscape, 'buggy', world(32, 0, 32))
await landscape.clearToast()
await landscape.shot('01-buggy-by-touch')
await popoverClear(landscape, landscapeBuggy.hubId, 'E.popover-clear')
await landscape.context.close()

check('console.clean', consoleErrors.length === 0, consoleErrors.length ? `console errors: ${consoleErrors.slice(0, 3).join(' | ')}` : 'no console errors or page errors')
const failed = results.filter((result) => !result.ok)
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ harness: 'scripts/qa/robotics-kid-paint.mjs', origin, viewports: ['1366x768', '1024x768', '820x1094 touch (iPad portrait)'], at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, counts, shots, results }, null, 2)}\n`)
await browser.close()
console.log(`\n${results.length - failed.length}/${results.length} checks passed · ${out}`)
process.exit(failed.length ? 1 : 0)
