/**
 * Robot Workshop kid-UX pass, lane K: robot kits from the drawer, by real pointer
 * (docs/robotics/KID-UX.md §K).
 *
 * In real Chrome at 1366×768, the way a student does it: click the drawer's Robots choice,
 * click the Buggy kit card, move the real mouse over the plate (the whole kit's ghost follows),
 * click to place. The run counts those clicks, then checks what the app made: a robot named
 * Buggy, every device plugged into its hub, ready to drive by `readiness()` (drive/readiness.ts),
 * no creation card, the kit selected and framed, one history entry; Rotate turns the selected
 * robot whole and it still drives (then Undo turns it back). It places a second Buggy
 * (it must be called Buggy 2, and a ghost over the first one must show blocked and place
 * nothing), a Gate and a Signal light, then presses Undo once and checks that the last kit is
 * gone completely: its bricks, its robot and its cables. A Robot base goes down last. Where
 * the mouse goes is the studio's own answer to "where is that stud on my screen" (the dev-only
 * `window.__robotics.project`), the aiming a student does by eye; nothing is placed through the
 * store. A second, shorter pass photographs the same journey at 1024×768, and a third makes it by
 * touch on a portrait tablet (Chrome's touch emulation): the (+) sheet, its Robots choice, the kit
 * card, a tap on the plate and the Place button.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-kid-kits.mjs
 *
 * against `npx vite --mode robotics --port 5251 --strictPort --host 127.0.0.1`.
 * Writes PNGs and results.json under docs/qa/robotics-kid/kits/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5251', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/kits')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const pageErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const STUD = 0.62
const PLATE = 0.18
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })

async function openStudio(viewport, touch = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
  const page = await context.newPage()
  page.on('pageerror', (error) => { pageErrors.push(error.message); console.log(`  pageerror: ${error.message}`) })
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`)
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.project), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  const tools = {
    page,
    context,
    sleep: (ms) => page.waitForTimeout(ms),
    shot: async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); console.log(`  shot ${name}.png`) },
    brick: (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg }),
    robo: (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), arg), { src: fn.toString(), arg }),
    screenOf: (point) => page.evaluate((p) => window.__robotics.project(p), point),
  }
  await tools.brick((state) => state.newBuild())
  await tools.brick((state) => state.requestView('home'))
  await tools.sleep(700)
  return tools
}

/** The armed ghost as the studio holds it: where its base plate is, whether it may be placed, what it is. */
const ghostOf = (page) => page.evaluate(async () => {
  const { selectionDraftIsValid, selectionDrafts } = await import('/src/brick/store.ts')
  const state = window.__robotics.brickStore.getState()
  if (!state.draft) return null
  return { x: state.draft.x, y: state.draft.y, z: state.draft.z, valid: selectionDraftIsValid(state), name: state.movingSelection?.name ?? null, pieces: selectionDrafts(state).length, lowest: Math.min(...selectionDrafts(state).map((draft) => draft.y)) }
})

/** Each robot as the panel and the drive view read it, with `readiness()` from drive/readiness.ts. */
const robotsOf = (page) => page.evaluate(async () => {
  const { readiness } = await import('/src/robotics/drive/readiness.ts')
  const { model } = window.__robotics.roboticsStore.getState()
  return model.creations.map((c) => ({
    id: c.id, name: c.name, kind: c.kind, bricks: c.brickIds.length, brickIds: c.brickIds,
    hubs: c.hubs.length,
    motors: c.motors.map((m) => ({ name: m.name, port: m.port?.port ?? null, wheels: m.wheelIds.length })),
    hinges: c.hinges.map((h) => ({ name: h.name, port: h.port?.port ?? null, locked: h.locked })),
    sensors: c.sensors.map((s) => ({ name: s.name, port: s.port?.port ?? null })),
    lights: c.lights.map((l) => ({ name: l.name, port: l.port?.port ?? null })),
    drivePair: Boolean(c.drivePair),
    readiness: readiness(c),
  }))
})

const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value

/**
 * Moves the real mouse onto a stud-grid point. When it is not comfortably inside the canvas area
 * the panels leave free, the camera is zoomed out with the mouse wheel first, as a student would.
 */
async function aimAt(tools, point, label) {
  const { page, screenOf, sleep } = tools
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const at = await screenOf(point)
    const free = await page.evaluate(() => {
      const hook = window.__robotics
      const rect = hook.canvasRect()
      const insets = hook.insets()
      return { left: rect.left + insets.left, right: rect.left + rect.width - insets.right, top: rect.top + insets.top, bottom: rect.top + rect.height - insets.bottom }
    })
    const margin = 60
    if (at.inFront && at.x > free.left + margin && at.x < free.right - margin && at.y > free.top + margin && at.y < free.bottom - margin) {
      await page.mouse.move(at.x - 70, at.y - 30, { steps: 4 })
      await page.mouse.move(at.x, at.y, { steps: 10 })
      await sleep(180)
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

/* ============================================================== 1366 × 768 */
console.log('\nA. The first Buggy, from the drawer, by clicks and the real mouse (1366×768)')
const desk = await openStudio({ width: 1366, height: 768 })
const { page } = desk
let clicks = 0
const counted = async (locator, what) => { await locator.click(); clicks += 1; console.log(`  click ${clicks}: ${what}`) }

const robotsChoice = page.getByRole('button', { name: /^Robots/ })
check('A.robots-choice-visible', await robotsChoice.isVisible(), 'the drawer shows a Robots choice without opening the category list')
await desk.shot('K0-drawer-with-robots-choice')
await counted(robotsChoice, 'the drawer\'s Robots choice')
await page.getByTestId('kit-shelf').waitFor()
await page.waitForFunction(() => document.querySelectorAll('.kit-card img').length === 4, null, { timeout: 10_000 })
await desk.sleep(150)
const cardTexts = await page.locator('.kit-card').allInnerTexts()
check('A.four-kit-cards', cardTexts.length === 4 && ['Buggy', 'Gate', 'Signal light', 'Robot base'].every((name, index) => cardTexts[index].startsWith(name)), `kit cards: ${cardTexts.map((text) => text.replace(/\n/g, ' / ')).join(' | ')}`)
const cardSizes = await page.locator('.kit-card').evaluateAll((cards) => cards.map((card) => { const rect = card.getBoundingClientRect(); return [Math.round(rect.width), Math.round(rect.height)] }))
check('A.kit-card-targets', cardSizes.every(([width, height]) => width >= 44 && height >= 44), `card sizes ${JSON.stringify(cardSizes)} (44 px or more)`)
const pictureSizes = await page.locator('.kit-card img').evaluateAll((images) => images.map((image) => [image.naturalWidth, image.naturalHeight]))
check('A.kit-pictures-rendered', pictureSizes.every(([width, height]) => width > 0 && height > 0), `each card shows its kit rendered with the studio's own bricks (${JSON.stringify(pictureSizes)})`)
check('A.category-says-robots', (await page.getByLabel('Brick category').inputValue()) === 'robotics', 'the category list switched to Robots too')
await desk.shot('K1-drawer-start-with-a-kit')

await counted(page.locator('.kit-card[data-kit="buggy"]'), 'the Buggy kit card')
let ghost = await ghostOf(page)
check('A.kit-armed', ghost?.name === 'Buggy' && ghost.pieces === 9, `the whole Buggy is armed as one ghost of ${ghost?.pieces} bricks`)
check('A.strip-names-kit', await page.getByRole('button', { name: 'Place Buggy' }).isVisible(), 'the command strip says Placing Buggy with a Place button')
await desk.shot('K2-buggy-armed')
const firstSpot = world(32, 0, 32)
let at = await aimAt(desk, firstSpot, 'the plate centre')
ghost = await ghostOf(page)
check('A.ghost-follows', ghost.x === 29 && ghost.z === 28 && ghost.y === 0 && ghost.valid, `the ghost followed the mouse to the plate centre (base at ${ghost.x},${ghost.y},${ghost.z}, ${ghost.valid ? 'valid' : 'blocked'})`)
await desk.shot('K3-buggy-ghost-follows-the-mouse')
const undoBefore = await desk.brick((state) => state.undoStack.length)
await page.mouse.click(at.x, at.y)
clicks += 1
console.log(`  click ${clicks}: the plate`)
await desk.sleep(700)
const firstClicks = clicks
check('A.placed-in-three-clicks', (await desk.brick((state) => state.bricks.length)) === 9 && firstClicks <= 3, `a placed Buggy ${firstClicks} clicks after opening the drawer's Robots choice (target: 3 or fewer)`)
let robots = await robotsOf(page)
const buggy = robots[0]
check('A.named', robots.length === 1 && buggy.name === 'Buggy' && buggy.kind === 'rover' && buggy.bricks === 9, `one robot named ${buggy?.name} (${buggy?.kind}, ${buggy?.bricks} bricks)`)
check('A.wired', JSON.stringify(buggy.motors.map((m) => [m.name, m.port])) === JSON.stringify([['Left motor', 'A'], ['Right motor', 'B']]) && buggy.sensors[0]?.port === 'C', `plugged in: ${buggy.motors.map((m) => `${m.name} ${m.port}`).join(', ')}, ${buggy.sensors.map((s) => `${s.name} ${s.port}`).join(', ')}`)
check('A.ready-to-drive', buggy.readiness.kind === 'drive' && buggy.readiness.ready === true, `readiness(): ${JSON.stringify(buggy.readiness)}`)
check('A.no-card', (await desk.robo((state) => state.card)) === null && (await page.getByTestId('robotics-creation-card').count()) === 0, 'no creation card interrupted')
const history = await desk.brick((state) => state.undoStack.map((entry) => entry.label))
check('A.one-history-entry', history.length === undoBefore + 1 && history.at(-1) === 'Add Buggy', `one new history entry: ${history.at(-1)}`)
const focus = await desk.brick((state) => ({ selected: [...state.selectedIds], toast: state.toast }))
// Lane P: nothing stays picked after a kit lands (a picked kit painted its tyres from the strip's Color and
// swallowed the next click on one of its parts); the panel shows the new robot all the same (A.panel-shows-buggy).
check('A.focused', focus.selected.length === 0, 'nothing stays picked, so the next click picks one part; the panel shows the new robot')
const frame = await desk.robo((state) => ({ brickIds: state.frameRequest?.brickIds ?? [], snug: state.frameRequest?.snug === true }))
// Lane P: framed snug, the robot filling most of the canvas the drawer and the panel leave free (was: with ground around it).
check('A.framed', JSON.stringify(frame.brickIds) === JSON.stringify(buggy.brickIds) && frame.snug, 'the camera framed the new robot snug in the free canvas')
const panelText = await page.getByTestId('robotics-panel').evaluate((element) => `${element.innerText} ${[...element.querySelectorAll('input')].map((input) => input.value).join(' ')}`).catch(() => '')
check('A.panel-shows-buggy', panelText.includes('Buggy'), 'the robot panel shows Buggy')
check('A.toast', focus.toast === 'Buggy is ready to drive!', `status line: ${focus.toast}`)
await desk.shot('K4-buggy-placed-ready')
// A box drawn around the kit (a drag from empty ground) picks all of it again, so the command strip's Rotate
// turns the whole robot; it must still drive.
const kitBox = await page.evaluate((ids) => {
  const hook = window.__robotics
  const { bricks, partMap, plateSize } = hook.roboticsStore.getState().model.input
  const points = []
  for (const brick of bricks.filter((b) => ids.includes(b.id))) {
    const part = partMap[brick.partId]
    const turned = brick.rotation % 2 === 1
    const w = turned ? part.depth : part.width
    const d = turned ? part.width : part.depth
    for (const [dx, dz] of [[0, 0], [w, 0], [0, d], [w, d]]) for (const y of [0, part.height]) points.push(hook.project({ x: (brick.x + dx - plateSize / 2) * 0.62, y: (brick.y + y) * 0.18, z: (brick.z + dz - plateSize / 2) * 0.62 }))
  }
  return { left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) }
}, buggy.brickIds)
await page.mouse.move(kitBox.left - 30, kitBox.top - 30)
await page.mouse.down()
await page.mouse.move(kitBox.right + 30, kitBox.bottom + 30, { steps: 12 })
await page.mouse.up()
await desk.sleep(300)
check('A.box-picks-kit', (await desk.brick((state) => state.selectedIds.length)) === 9, `a box drawn around it picks all ${await desk.brick((state) => state.selectedIds.length)} of the kit's bricks`)
await page.getByRole('button', { name: 'Rotate 9 bricks' }).click()
await desk.sleep(500)
robots = await robotsOf(page)
check('A.rotate-keeps-robot', robots[0].bricks === 9 && robots[0].readiness.ready && robots[0].motors.every((m) => m.wheels === 1), `after Rotate: ${robots[0].bricks} bricks, wheels on both motors, readiness ${JSON.stringify(robots[0].readiness)}`)
await desk.shot('K4b-buggy-rotated-still-ready')
await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
await desk.sleep(400)

console.log('\nB. A second Buggy: blocked over the first, then Buggy 2')
await page.locator('.kit-card[data-kit="buggy"]').click()
at = await aimAt(desk, firstSpot, 'the first Buggy')
ghost = await ghostOf(page)
check('B.blocked-over-first', ghost && !ghost.valid && ghost.lowest === 0, `over the first Buggy the ghost stays on the ground and shows blocked (valid ${ghost?.valid}, lowest brick at ${ghost?.lowest})`)
await desk.shot('K5-second-buggy-blocked-over-the-first')
await page.mouse.click(at.x, at.y)
await desk.sleep(300)
check('B.blocked-places-nothing', (await desk.brick((state) => state.bricks.length)) === 9 && (await ghostOf(page))?.name === 'Buggy', 'a click on a blocked spot places nothing and keeps the kit in hand')
at = await aimAt(desk, world(32, 0, 45), 'free ground in front of the first Buggy')
ghost = await ghostOf(page)
check('B.valid-on-free-ground', ghost.valid, `on free ground the ghost shows valid (base at ${ghost.x},${ghost.z})`)
await page.mouse.click(at.x, at.y)
await desk.sleep(700)
robots = await robotsOf(page)
check('B.buggy-2', robots.map((r) => r.name).join(',') === 'Buggy,Buggy 2' && robots[1].readiness.ready && robots[1].motors.every((m) => m.port) && robots[1].sensors[0]?.port === 'C', `robots: ${robots.map((r) => `${r.name} (${r.readiness.ready ? 'ready' : 'not ready'})`).join(', ')}`)
await desk.shot('K6-buggy-2-placed')

console.log('\nC. A Gate and a Signal light')
await page.locator('.kit-card[data-kit="gate"]').click()
at = await aimAt(desk, world(17, 0, 32), 'free ground left of the Buggies')
ghost = await ghostOf(page)
check('C.gate-ghost', ghost.name === 'Gate' && ghost.valid, `the Gate ghost is valid on free ground (base at ${ghost.x},${ghost.z})`)
await page.mouse.click(at.x, at.y)
await desk.sleep(700)
robots = await robotsOf(page)
const gate = robots.find((r) => r.name === 'Gate')
check('C.gate', gate && gate.kind === 'gate' && gate.hinges[0]?.locked === false && gate.hinges[0]?.port === 'A' && gate.sensors[0]?.port === 'B' && gate.readiness.kind === 'try' && gate.readiness.ready, `Gate: hinge ${gate?.hinges[0]?.locked ? 'locked' : 'free to swing'} on port ${gate?.hinges[0]?.port}, sensor on ${gate?.sensors[0]?.port}, readiness ${JSON.stringify(gate?.readiness)}`)
await desk.shot('K7-gate-placed')
const beforeSignal = { document: JSON.stringify(sortKeys(JSON.parse(await desk.brick((state) => JSON.stringify(state.getDocumentSnapshot()))))), bricks: await desk.brick((state) => state.bricks.length) }
await page.locator('.kit-card[data-kit="signal-light"]').click()
at = await aimAt(desk, world(47, 0, 32), 'free ground right of the Buggies')
await page.mouse.click(at.x, at.y)
await desk.sleep(700)
robots = await robotsOf(page)
const signal = robots.find((r) => r.name === 'Signal light')
check('C.signal-light', signal && signal.kind === 'signal' && signal.sensors[0]?.port === 'A' && signal.lights[0]?.port === 'B' && signal.readiness.kind === 'try' && signal.readiness.ready, `Signal light: sensor on ${signal?.sensors[0]?.port}, light on ${signal?.lights[0]?.port}, readiness ${JSON.stringify(signal?.readiness)}`)
const signalIds = signal?.brickIds ?? []
await desk.shot('K8-signal-light-placed')

console.log('\nD. One Undo takes the last kit away completely')
await page.getByRole('button', { name: 'Undo', exact: true }).first().click()
await desk.sleep(500)
const afterUndo = {
  document: JSON.stringify(sortKeys(JSON.parse(await desk.brick((state) => JSON.stringify(state.getDocumentSnapshot()))))),
  bricks: await desk.brick((state) => state.bricks.length),
  leftover: await desk.brick((state, ids) => state.bricks.filter((b) => ids.includes(b.id)).length, signalIds),
  cables: await desk.brick((state, ids) => (state.documentMetadata.robotics?.connections ?? []).filter((c) => ids.includes(c.deviceId) || ids.includes(c.hubId)).length, signalIds),
  names: (await robotsOf(page)).map((r) => r.name),
  toast: await desk.brick((state) => state.toast),
}
check('D.undo-once-removes-kit', afterUndo.leftover === 0 && afterUndo.cables === 0 && !afterUndo.names.includes('Signal light') && afterUndo.bricks === beforeSignal.bricks, `after one Undo: ${afterUndo.leftover} of its bricks, ${afterUndo.cables} of its cables, robots ${afterUndo.names.join(', ')} (${afterUndo.toast})`)
check('D.document-as-before', afterUndo.document === beforeSignal.document, 'the document is exactly what it was before the Signal light was placed')
await desk.shot('K9-undo-removed-signal-light')

console.log('\nE. A Robot base')
await page.locator('.kit-card[data-kit="robot-base"]').click()
at = await aimAt(desk, world(47, 0, 32), 'the free ground again')
await page.mouse.click(at.x, at.y)
await desk.sleep(700)
robots = await robotsOf(page)
const base = robots.find((r) => r.name === 'My robot')
check('E.robot-base', base && base.hubs === 1 && base.bricks === 2, `Robot base: a robot named ${base?.name} with ${base?.hubs} hub on its plate`)
await desk.shot('K10-robot-base-placed')
await page.getByRole('button', { name: 'Frame build' }).click()
await desk.sleep(700)
await desk.shot('K11-all-kits-framed')
await desk.context.close()

/* ============================================================== 1024 × 768 */
console.log('\nF. The same first journey at 1024×768')
const narrow = await openStudio({ width: 1024, height: 768 })
clicks = 0
const narrowChoice = narrow.page.getByRole('button', { name: /^Robots/ })
check('F.robots-choice-visible', await narrowChoice.isVisible(), 'the Robots choice is in view at 1024×768')
await narrowChoice.click(); clicks += 1
await narrow.page.getByTestId('kit-shelf').waitFor()
await narrow.page.waitForFunction(() => document.querySelectorAll('.kit-card img').length === 4, null, { timeout: 10_000 })
await narrow.sleep(150)
await narrow.shot('N1-1024-drawer-start-with-a-kit')
await narrow.page.locator('.kit-card[data-kit="buggy"]').click(); clicks += 1
at = await aimAt(narrow, world(32, 0, 32), 'the plate centre')
await narrow.shot('N2-1024-buggy-ghost')
await narrow.page.mouse.click(at.x, at.y); clicks += 1
await narrow.sleep(700)
robots = await robotsOf(narrow.page)
check('F.buggy-at-1024', robots.length === 1 && robots[0].name === 'Buggy' && robots[0].readiness.ready && clicks <= 3, `${robots[0]?.name} ready to drive after ${clicks} clicks`)
await narrow.shot('N3-1024-buggy-placed')
await narrow.context.close()

/* ============================================================== touch, 820 × 1180 */
console.log('\nG. By touch on a portrait tablet (820×1180, Chrome touch emulation)')
const tablet = await openStudio({ width: 820, height: 1180 }, true)
let taps = 0
const tap = async (locator, what) => { await locator.tap(); taps += 1; console.log(`  tap ${taps}: ${what}`) }
check('G.coarse-pointer', await tablet.page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'the page sees a touch screen')
await tap(tablet.page.getByRole('button', { name: 'Open brick drawer' }), 'the (+) Bricks button')
const sheetRobots = tablet.page.getByRole('dialog', { name: 'Bricks' }).getByRole('button', { name: /^Robots/ })
await tap(sheetRobots, 'the sheet\'s Robots choice')
await tablet.page.getByTestId('kit-shelf').waitFor()
await tablet.page.waitForFunction(() => document.querySelectorAll('.kit-card img').length === 4, null, { timeout: 10_000 })
const touchCards = await tablet.page.locator('.kit-card').evaluateAll((cards) => cards.map((card) => { const rect = card.getBoundingClientRect(); return [Math.round(rect.width), Math.round(rect.height)] }))
check('G.sheet-kit-targets', touchCards.length === 4 && touchCards.every(([width, height]) => width >= 44 && height >= 44), `four kit cards in the sheet, ${JSON.stringify(touchCards)} px`)
await tablet.shot('T1-tablet-sheet-start-with-a-kit')
await tap(tablet.page.locator('.kit-card[data-kit="buggy"]'), 'the Buggy kit card')
await tablet.sleep(400)
check('G.sheet-closes-kit-armed', (await tablet.page.getByRole('dialog', { name: 'Bricks' }).count()) === 0 && (await ghostOf(tablet.page))?.name === 'Buggy', 'the sheet closed and the Buggy ghost is out on the plate')
check('G.tap-hint', (await tablet.brick((state) => state.toast)) === 'Tap where your Buggy goes, then press Place.', 'the status line says to tap, then press Place')
await tablet.shot('T2-tablet-buggy-armed')
const spot = await tablet.screenOf(world(40, 0, 46))
await tablet.page.touchscreen.tap(spot.x, spot.y)
taps += 1
console.log(`  tap ${taps}: free ground away from the ghost`)
await tablet.sleep(400)
ghost = await ghostOf(tablet.page)
check('G.tap-positions', ghost.x === 37 && ghost.z === 42 && ghost.y === 0 && ghost.valid, `one tap moved the whole ghost there (base at ${ghost.x},${ghost.y},${ghost.z}, ${ghost.valid ? 'valid' : 'blocked'})`)
await tablet.shot('T3-tablet-buggy-positioned')
await tap(tablet.page.getByRole('button', { name: 'Place Buggy' }), 'Place')
await tablet.sleep(700)
robots = await robotsOf(tablet.page)
check('G.placed-by-touch', robots.length === 1 && robots[0].name === 'Buggy' && robots[0].readiness.ready, `${robots[0]?.name} placed by touch and ready to drive after ${taps} taps (${taps - 1} without moving it from where it first appears)`)
await tablet.shot('T4-tablet-buggy-placed')
await tablet.context.close()

check('Z.no-page-errors', pageErrors.length === 0, pageErrors.length ? pageErrors.join(' | ') : 'no page errors')

await writeFile(path.join(out, 'results.json'), `${JSON.stringify({
  origin,
  viewports: ['1366x768', '1024x768'],
  input: "real mouse and clicks via Playwright; positions from the studio's own world→screen projection",
  at: new Date().toISOString(),
  clicksToFirstPlacedBuggy: firstClicks,
  tapsToFirstPlacedBuggyByTouch: taps,
  results,
}, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed; a placed Buggy took ${firstClicks} clicks from the Robots choice`)
process.exit(failed.length ? 1 : 0)
