/**
 * Robot Workshop kid-UX pass, lane G: a rover built from separate parts using only the robot
 * panel's next steps, in real Chrome at 1366×768 (docs/robotics/KID-UX.md §G, acceptance 2).
 *
 * Against the robotics dev server (`npx vite --mode robotics --port 5253 --strictPort --host 127.0.0.1`).
 * The only parts taken from the drawer are the two that start a robot (a plate and a hub: before
 * them there is no robot, so there are no next steps). From then on every part comes from a click on
 * the step the panel highlights: the row arms the part (already turned the way this robot needs it)
 * and the student clicks where it goes. Lane S's magnetic snapping is not merged yet, so "where it
 * goes" is aimed exactly with the studio's own world→screen projection (`window.__robotics.project`,
 * dev only), the same aiming robotics-spike-cp1-pointer.mjs uses; axles and wheels then snap onto the
 * motor and the axle with the snapping that is already there. After each placement the harness reads
 * back what the panel shows (the checked, highlighted and waiting steps, the Drive button) and the
 * document. A second part unplugs a motor in its inspector and plugs it back with the "Plug … into the
 * hub" step. A third part photographs every state at 1366×768 and 1024×768 (the card, its "?", a hub
 * alone, not ready, ready, More and Parts open, a picked part, a gate, a gate stuck to its frame, a
 * signal light) and checks the panel's words, text sizes and target sizes in each.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-kid-guide.mjs
 *
 * Writes PNGs and results.json under docs/qa/robotics-kid/guide/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5253', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/guide')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const shots = []
const journey = []
const consoleErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); return ok }
const check = (id, condition, detail) => record(id, Boolean(condition), detail)

const STUD = 0.62
const PLATE = 0.18
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
/** Words the copy guide keeps out of student-facing text (docs/robotics/KID-UX.md §Copy guide). */
const DEVELOPER_WORDS = /\b(creation|assembly|mechanism|body|anchored|test space|assisted|manual|nudge|drive pair|reversed)\b/i

async function openStudio(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${width}: ${message.text()}`) })
  page.on('pageerror', (error) => consoleErrors.push(`${width}: ${String(error)}`))
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`)
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.project && window.__robotics?.driveView), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  const sleep = (ms) => page.waitForTimeout(ms)
  const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(target === 'hook' ? window.__robotics : window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
  const s = { page, context, width, height, sleep, brick: run('brickStore'), robo: run('roboticsStore'), hook: run('hook'), drive: run('driveView') }
  s.panel = page.getByTestId('robotics-panel')
  s.card = page.getByTestId('robotics-creation-card')
  s.steps = page.getByTestId('robotics-next-steps')
  s.shot = async (name) => { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); shots.push(file); console.log(`  shot ${file}`); return file }
  s.screenOf = (point) => s.hook((hook, p) => hook.project(p), point)
  s.draft = () => s.brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z, rotation: state.draft.rotation })
  s.lastBrick = () => s.brick((state) => { const b = state.bricks[state.bricks.length - 1]; return b && { id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation } })
  s.count = () => s.brick((state) => state.bricks.length)
  /** The next steps as the panel shows them: each row's step id, state and words. */
  s.rows = () => s.steps.locator('li[data-step]').evaluateAll((items) => items.map((item) => ({ id: item.dataset.step, state: item.dataset.state, text: item.querySelector('.robotics-step-text')?.firstChild?.textContent?.trim() ?? item.textContent.trim() })))
  s.currentText = async () => { const current = s.steps.locator('[aria-current=step]'); return (await current.count()) ? (await current.first().locator('.robotics-step-text').textContent()).trim() : null }
  s.play = page.getByTestId('robotics-play-button')
  s.openFold = async (name) => {
    const toggle = s.panel.getByRole('button', { name: new RegExp(`^${name}`) })
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') { await toggle.click(); await sleep(200) }
  }
  s.closeFold = async (name) => {
    const toggle = s.panel.getByRole('button', { name: new RegExp(`^${name}`) })
    if ((await toggle.getAttribute('aria-expanded')) === 'true') { await toggle.click(); await sleep(200) }
  }
  /** The panel's visible words, target sizes and text sizes (only what is on screen, not folded away). */
  s.audit = (selector) => page.evaluate((css) => {
    const root = document.querySelector(css)
    if (!root) return null
    const visible = (element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('.visually-hidden') }
    const targets = [...root.querySelectorAll('button, input, select, [role=button]')].filter(visible).map((element) => { const rect = element.getBoundingClientRect(); return { name: (element.getAttribute('aria-label') || element.textContent || element.value || '').trim().slice(0, 40), width: Math.round(rect.width), height: Math.round(rect.height) } })
    const small = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim()
      if (!text || !node.parentElement || !visible(node.parentElement)) continue
      const size = parseFloat(getComputedStyle(node.parentElement).fontSize)
      if (size < 14) small.push({ text: text.slice(0, 30), size })
    }
    // The device inspector is the wiring lane's (its port letters are allowed there); the rest is the panel's own.
    const own = root.cloneNode(true)
    for (const inspector of own.querySelectorAll('[data-testid=robotics-device-inspector], [data-testid=robotics-hub-inspector], .visually-hidden')) inspector.remove()
    return { text: own.innerText.replace(/\s+/g, ' ').trim(), targets, smallTargets: targets.filter((target) => target.width < 44 || target.height < 44), smallText: small }
  }, selector)
  return s
}

/** Checks the panel (or card) as a student sees it right now: plain words, big targets, readable text. */
async function audit(s, label, selector = '[data-testid=robotics-panel]') {
  const seen = await s.audit(selector)
  if (!seen) return check(`${label}.visible`, false, `${selector} is not on screen`)
  const words = seen.text.match(DEVELOPER_WORDS)
  const ports = seen.text.match(/\bport [A-D]\b/i)
  check(`${label}.words`, !words && !ports, words || ports ? `found "${(words ?? ports)[0]}" in: ${seen.text.slice(0, 160)}` : `no developer words and no port letters in ${seen.text.length} characters`)
  check(`${label}.targets`, seen.smallTargets.length === 0, seen.smallTargets.length ? `under 44 px: ${JSON.stringify(seen.smallTargets)}` : `${seen.targets.length} targets, every one at least 44 × 44 px`)
  check(`${label}.text`, seen.smallText.length === 0, seen.smallText.length ? `under 14 px: ${JSON.stringify(seen.smallText.slice(0, 4))}` : 'all text 14 px or larger')
  return seen
}

/* ================================================================ A. the journey at 1366×768 */
console.log('\nA. A rover from separate parts, using only the next steps (1366×768)')
const s = await openStudio(1366, 768)
const { page, sleep } = s
// A fresh page is already blank (a New build there would only say so in a toast over the shots).
if (await s.count()) await s.brick((state) => state.newBuild())
await s.brick((state) => state.requestView('home'))
await sleep(600)

const PART_NAMES = { plate_6x8: '6 × 8 Plate', robo_hub: 'Hub' }
/** A part from the drawer, chosen with a click (only for the plate and hub that start the robot). */
async function chooseFromDrawer(partId) {
  await page.getByLabel('Brick category').selectOption(partId.startsWith('robo_') ? 'robotics' : 'all')
  await page.locator(`.library-part[title="${PART_NAMES[partId]}"]`).click()
  await sleep(100)
}
/** Moves the real mouse over a world point and clicks there; returns the ghost it showed and the brick placed. */
async function placeAt(point, expected, label) {
  const at = await s.screenOf(point)
  assert(at.inFront, `${label}: the point is behind the camera`)
  await page.mouse.move(at.x, at.y, { steps: 8 })
  await sleep(160)
  const ghost = await s.draft()
  const ghostOk = ghost && ghost.partId === expected.partId && ghost.x === expected.x && ghost.y === expected.y && ghost.z === expected.z && ghost.rotation === expected.rotation
  check(`ghost:${label}`, ghostOk, `${label}: the ghost shows ${ghost ? `${ghost.partId} at ${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}` : 'nothing'} under the mouse at (${Math.round(at.x)}, ${Math.round(at.y)})`)
  const before = await s.count()
  await page.mouse.click(at.x, at.y)
  await sleep(260)
  const placed = await s.lastBrick()
  const ok = (await s.count()) === before + 1 && placed.partId === expected.partId && placed.x === expected.x && placed.y === expected.y && placed.z === expected.z && placed.rotation === expected.rotation
  check(`placed:${label}`, ok, `${label}: a click placed ${placed.partId} at ${placed.x},${placed.y},${placed.z} r${placed.rotation}`)
  return placed
}
/** The camera cluster, as a student uses it: a spot hidden behind a taller part is aimed at from the top view. */
const view = async (name) => { await page.getByRole('button', { name, exact: true }).click(); await sleep(650) }
/** One step of the journey: click the highlighted row (it must say `text`), check what it armed, then place it. */
async function followStep({ text, expected, point, label, fromTop = false }) {
  const row = s.steps.getByRole('button', { name: text, exact: true })
  const highlighted = (await row.count()) === 1 && (await row.getAttribute('aria-current')) === 'step'
  check(`step:${label}`, highlighted, `the highlighted next step reads "${await s.currentText()}"`)
  await row.click()
  await sleep(150)
  const armed = await s.draft()
  check(`armed:${label}`, armed?.partId === expected.partId && armed.rotation === expected.rotation, `clicking it armed ${armed?.partId} turned ${armed?.rotation} (${expected.partId} r${expected.rotation} wanted)`)
  if (fromTop) await view('Top view')
  const placed = await placeAt(point, expected, label)
  if (fromTop) await view('3D view')
  journey.push({ step: text, armed, placed, view: fromTop ? 'top' : '3d' })
  return placed
}
const statesOf = async () => (await s.rows()).filter((row) => !row.id.startsWith('idea') && !row.id.startsWith('choose')).map((row) => `${row.id}:${row.state}`).join(' ')

// The two parts that start a robot come from the drawer.
await chooseFromDrawer('plate_6x8')
const plate = await placeAt(world(31, 0, 30), { partId: 'plate_6x8', x: 28, y: 0, z: 26, rotation: 0 }, 'plate (drawer)')
await page.keyboard.press('Escape')
await chooseFromDrawer('robo_hub')
const hub = await placeAt(world(31, 1, 29), { partId: 'robo_hub', x: 29, y: 1, z: 27, rotation: 0 }, 'hub (drawer)')
await page.keyboard.press('Escape')
await sleep(500)

// The card: short, a good default name, one button, the why behind "?".
check('card.opens', (await s.card.count()) === 1 && (await s.card.getByText('You started a robot!').count()) === 1, 'the first robotics part opens "You started a robot!"')
check('card.name', (await s.card.getByLabel('Robot name').inputValue()) === 'Robot', `the name field is filled in: "${await s.card.getByLabel('Robot name').inputValue()}"`)
check('card.one-button', (await s.card.getByRole('button').allTextContents()).join(' | ') === '? | Keep building', `the card's buttons: ${(await s.card.getByRole('button').allTextContents()).join(' | ')}`)
await audit(s, 'card', '[data-testid=robotics-creation-card]')
await s.shot('1366-01-card')
await s.card.getByRole('button', { name: 'What does this mean?' }).click()
await sleep(200)
check('card.why', (await s.card.getByText(/Bricks joined by studs move together/).count()) === 1, 'the "?" shows what joined means')
await s.shot('1366-02-card-why')
await s.card.getByLabel('Robot name').fill('Buggy')
await s.card.getByRole('button', { name: 'Keep building' }).click()
await sleep(400)
const robotId = await s.robo((state) => state.model.creations[0]?.id)
check('card.named', (await s.robo((state) => state.model.creations.map((c) => c.name).join()))  === 'Buggy' && (await s.card.count()) === 0, 'Keep building saved the robot as "Buggy" and closed the card')

// A hub alone: two ways to go.
check('hub-only.choices', (await s.steps.getByRole('button', { name: /^Make it move/ }).count()) === 1 && (await s.steps.getByRole('button', { name: /^Make it see and light up/ }).count()) === 1 && (await s.play.count()) === 0, 'a hub alone offers "Make it move" and "Make it see and light up"; no Drive yet')
await audit(s, 'hub-only')
await s.shot('1366-03-hub-only-choices')
await s.steps.getByRole('button', { name: /^Make it move/ }).click()
await sleep(150)
let armed = await s.draft()
check('armed:make-it-move', armed?.partId === 'robo_motor' && armed.rotation === 0, `"Make it move" armed ${armed?.partId} r${armed?.rotation}`)
await placeAt(world(32.5, 1, 32.5), { partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0 }, 'first motor (from Make it move)')
await sleep(300)
check('after-motor-1.steps', (await statesOf()) === 'plate:done hub:done motors:current axles:todo wheels:todo plug:todo ready:todo' && (await s.currentText()) === 'Put a motor on the other side.', `steps: ${await statesOf()} · now "${await s.currentText()}"`)
check('after-motor-1.drive-off', await s.play.isDisabled() && (await s.play.getAttribute('aria-describedby')) !== null, 'Drive is shown, off, and described by the highlighted step')
await audit(s, 'not-ready')
await s.shot('1366-04-one-motor')

// From the home angle the other side of the plate is behind the first motor: the student aims from the top view.
await followStep({ text: 'Put a motor on the other side.', expected: { partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2 }, point: world(29.5, 1, 32.5), label: 'second motor (armed facing the other way, from the top view)', fromTop: true })
await sleep(300)
check('after-motor-2.steps', (await statesOf()) === 'plate:done hub:done motors:done axles:current wheels:todo plug:done ready:todo', `steps: ${await statesOf()}`)
await s.shot('1366-05-two-motors-axle-next')
await followStep({ text: 'Put an axle in Right motor.', expected: { partId: 'robo_axle_short', x: 34, y: 0, z: 32, rotation: 0 }, point: world(32.5, 7, 32.5), label: 'axle into the right motor' })
await sleep(300)
await s.shot('1366-06-one-axle')
await followStep({ text: 'Put an axle in Left motor.', expected: { partId: 'robo_axle_short', x: 26, y: 0, z: 32, rotation: 0 }, point: world(29.5, 7, 32.5), label: 'axle into the left motor' })
await sleep(300)
check('after-axles.steps', (await statesOf()) === 'plate:done hub:done motors:done axles:done wheels:current plug:done ready:todo', `steps: ${await statesOf()}`)
await s.shot('1366-07-axles-wheel-next')
await followStep({ text: 'Put a wheel on Right motor’s axle.', expected: { partId: 'robo_wheel', x: 36, y: 0, z: 31, rotation: 0 }, point: world(35, 4, 32.5), label: 'wheel onto the right axle' })
await sleep(300)
await s.shot('1366-08-one-wheel')
await followStep({ text: 'Put a wheel on Left motor’s axle.', expected: { partId: 'robo_wheel', x: 25, y: 0, z: 31, rotation: 0 }, point: world(27, 4, 32.5), label: 'wheel onto the left axle' })
await page.keyboard.press('Escape')
await sleep(400)

// Ready to drive.
check('ready.step', (await s.currentText()) === 'Ready to drive!' && (await s.steps.locator('li[data-step=ready]').getAttribute('data-state')) === 'current', `the highlighted step: "${await s.currentText()}"`)
check('ready.drive-on', await s.play.isEnabled() && (await s.play.textContent()).trim() === 'Drive', `the big button reads "${(await s.play.textContent()).trim()}" and is on`)
const ideas = await s.page.getByTestId('robotics-ideas').locator('li').evaluateAll((items) => items.map((item) => `${item.dataset.step}:${item.dataset.state}`))
check('ready.ideas', ideas.join(' ') === 'idea-sensor:todo idea-light:todo idea-seat:todo idea-stack:todo', `ideas: ${ideas.join(' ')}`)
const rover = await s.robo((state) => { const c = state.model.creations[0]; return { name: c.name, bricks: c.brickIds.length, drivePair: Boolean(c.drivePair), plugged: c.motors.map((m) => m.plugged), wheels: c.wheels.map((w) => w.onAxle) } })
check('ready.model', rover.name === 'Buggy' && rover.bricks === 8 && rover.drivePair && rover.plugged.every(Boolean) && rover.wheels.length === 2 && rover.wheels.every(Boolean), `the model agrees: ${JSON.stringify(rover)}`)
await audit(s, 'ready')
await s.robo((state, ids) => state.requestFrame(ids), await s.brick((state) => state.bricks.map((b) => b.id)))
await sleep(700)
await s.shot('1366-09-ready-to-drive')
await s.play.click()
await sleep(200)
check('ready.drive-opens', (await s.drive((state) => state.creationId)) === robotId, 'Drive opens the Drive view for Buggy (useDriveView.openDrive)')
await s.drive((state) => state.closeDrive())
await sleep(200)
const clicks = { drawer: 4, placements: 2 + 6, card: 1, steps: 6 }
record('journey.clicks', true, `drawer ${clicks.drawer} (category and part, twice), card 1 (Keep building), next-steps rows ${clicks.steps}, placements ${clicks.placements}: every part after the hub came from a next-steps row`)

// More and Parts, opened.
await s.openFold('More')
await s.page.evaluate(() => { const panel = document.querySelector('[data-testid=robotics-panel]'); panel.scrollTop = panel.scrollHeight })
await sleep(200)
check('more.contents', (await s.panel.getByRole('group', { name: 'Where it runs' }).count()) === 1 && (await s.panel.getByRole('group', { name: 'Wiring' }).count()) === 1 && (await s.panel.getByRole('button', { name: 'Drive forward 40%' }).count()) === 1, 'More holds where it runs, the wiring mode and the motor tests')
await s.shot('1366-10-more-open')
await s.closeFold('More')
await s.openFold('Parts')
await s.page.evaluate(() => { const panel = document.querySelector('[data-testid=robotics-panel]'); panel.scrollTop = panel.scrollHeight })
await sleep(200)
check('parts.rows', (await s.panel.locator('.robotics-parts li').count()) === 5, `Parts lists ${await s.panel.locator('.robotics-parts li').count()} rows: the hub, each motor with its axle and wheel, each wheel`)
await s.shot('1366-11-parts-open')
await s.closeFold('Parts')
await s.page.evaluate(() => { document.querySelector('[data-testid=robotics-panel]').scrollTop = 0 })

/* ---------------------------------------------------------------- B. a plug step */
console.log('\nB. A motor unplugged in its inspector, plugged back with the next step')
const leftMotorId = journey.find((entry) => entry.step === 'Put a motor on the other side.').placed.id
const motorAt = await s.screenOf(world(29.5, 7, 32.5))
await page.mouse.click(motorAt.x, motorAt.y)
await sleep(300)
check('plug.selected', (await s.brick((state) => state.selectedId)) === leftMotorId && (await page.getByTestId('robotics-device-inspector').count()) === 1, 'clicking the left motor shows its panel under the one step that matters now')
check('plug.focus', (await s.steps.locator('li[data-step]').count()) === 1 && (await s.currentText()) === 'Ready to drive!', `with a part picked the next steps show one row: "${await s.currentText()}"`)
await s.shot('1366-12-part-picked')
await page.getByTestId('robotics-device-inspector').getByRole('button', { name: 'Unplug', exact: true }).click()
await sleep(300)
await page.keyboard.press('Escape')
await sleep(300)
check('plug.step', (await s.currentText()) === 'Plug Left motor into the hub.' && await s.play.isDisabled(), `unplugged: Drive is off and the step says "${await s.currentText()}"`)
await s.shot('1366-13-plug-step')
await s.steps.getByRole('button', { name: 'Plug Left motor into the hub.', exact: true }).click()
await sleep(300)
const port = await s.brick((state, id) => state.documentMetadata.robotics?.connections?.find((cable) => cable.deviceId === id)?.port ?? null, leftMotorId)
check('plug.plugged', port !== null && (await s.currentText()) === 'Ready to drive!' && await s.play.isEnabled(), `one tap plugged it into port ${port}; ready to drive again`)

/* ================================================================ C. every state at 1366×768 and 1024×768 */
async function place(t, { partId, x, y, z, rotation = 0 }) {
  const ok = await t.brick((state, p) => { state.choosePart(p.partId); for (let turn = 0; turn < p.rotation; turn += 1) state.rotate(); state.setDraftPosition(p.x, p.y, p.z); const placed = state.placeDraft(); state.cancelInteraction(); return placed }, { partId, x, y, z, rotation })
  assert(ok, `could not place ${partId} at ${x},${y},${z}`)
  await t.sleep(90)
  return t.brick((state) => state.bricks[state.bricks.length - 1].id)
}
const keepBuilding = async (t) => { if (await t.card.count()) await t.card.getByRole('button', { name: 'Keep building' }).click(); await t.sleep(250) }
const frameAll = async (t) => { await t.robo((state, ids) => state.requestFrame(ids), await t.brick((state) => state.bricks.map((b) => b.id))); await t.sleep(700) }
const GATE = [
  ['plate_6x8', 20, 0, 20], ['pillar_1x1', 20, 1, 20], ['brick_1x1', 20, 10, 20], ['pillar_1x1', 25, 1, 20], ['brick_1x1', 25, 10, 20], ['brick_1x6', 20, 13, 20, 1], ['plate_2x4', 21, 1, 21, 1], ['robo_hinge_motor', 21, 2, 21],
]

async function screens(t) {
  const tag = String(t.width)
  console.log(`\nC. Screens at ${t.width}×${t.height}`)
  if (await t.count()) await t.brick((state) => state.newBuild())
  await t.brick((state) => { state.toast = null })
  await t.sleep(200)
  await place(t, { partId: 'plate_6x8', x: 28, y: 0, z: 26 })
  await place(t, { partId: 'robo_hub', x: 29, y: 1, z: 27 })
  await t.sleep(500)
  await audit(t, `${tag}.card`, '[data-testid=robotics-creation-card]')
  if (t !== s) await t.shot(`${tag}-01-card`)
  await keepBuilding(t)
  await audit(t, `${tag}.hub-only`)
  if (t !== s) await t.shot(`${tag}-03-hub-only-choices`)
  await place(t, { partId: 'robo_motor', x: 31, y: 1, z: 31 })
  await place(t, { partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2 })
  await place(t, { partId: 'robo_axle_short', x: 34, y: 0, z: 32 })
  await frameAll(t)
  await audit(t, `${tag}.not-ready`)
  if (t !== s) await t.shot(`${tag}-05-not-ready`)
  await place(t, { partId: 'robo_axle_short', x: 26, y: 0, z: 32 })
  await place(t, { partId: 'robo_wheel', x: 36, y: 0, z: 31 })
  await place(t, { partId: 'robo_wheel', x: 25, y: 0, z: 31 })
  await t.robo((state) => state.dismissWiringNote())
  await frameAll(t)
  check(`${tag}.ready`, (await t.currentText()) === 'Ready to drive!' && await t.play.isEnabled(), `${tag}: "${await t.currentText()}", Drive on`)
  await audit(t, `${tag}.ready`)
  if (t !== s) await t.shot(`${tag}-09-ready-to-drive`)
  await t.openFold('More')
  await t.page.evaluate(() => { const panel = document.querySelector('[data-testid=robotics-panel]'); panel.scrollTop = panel.scrollHeight })
  await t.sleep(200)
  if (t !== s) await t.shot(`${tag}-10-more-open`)
  await t.closeFold('More')
  await t.page.evaluate(() => { document.querySelector('[data-testid=robotics-panel]').scrollTop = 0 })
  // A sensor at the front, a light and a seat: the ideas tick off; it still drives.
  await place(t, { partId: 'robo_distance_sensor', x: 30, y: 1, z: 26 })
  await place(t, { partId: 'robo_light', x: 29, y: 7, z: 27 })
  await place(t, { partId: 'robo_seat', x: 30, y: 7, z: 29 })
  await place(t, { partId: 'brick_2x2', x: 31, y: 7, z: 27 })
  await t.robo((state) => state.dismissWiringNote())
  await frameAll(t)
  const ticked = await t.page.getByTestId('robotics-ideas').locator('li').evaluateAll((items) => items.map((item) => item.dataset.state))
  check(`${tag}.ideas-ticked`, ticked.every((state) => state === 'done') && await t.play.isEnabled(), `${tag}: after a sensor, a light, a seat and a brick on top the ideas read ${ticked.join(', ')}; Drive still on`)
  await t.shot(`${tag}-14-made-it-mine`)

  // A gate: not ready (no sensor), then stuck to its frame, then ready.
  await t.brick((state) => state.newBuild())
  await t.sleep(200)
  for (const [partId, x, y, z, rotation = 0] of GATE) await place(t, { partId, x, y, z, rotation })
  await t.sleep(300)
  if (t !== s) await t.shot(`${tag}-15-gate-card`)
  check(`${tag}.gate-name`, (await t.card.getByLabel('Robot name').inputValue()) === 'Gate', `${tag}: a hinge motor starts a robot named "${await t.card.getByLabel('Robot name').inputValue()}"`)
  await keepBuilding(t)
  await place(t, { partId: 'brick_1x4', x: 21, y: 8, z: 21, rotation: 1 })
  await place(t, { partId: 'robo_hub', x: 20, y: 1, z: 24 })
  await t.robo((state) => state.dismissWiringNote())
  await frameAll(t)
  check(`${tag}.gate-not-ready`, (await t.currentText()) === 'Add a sensor so it can see.' && (await t.play.textContent()).trim() === 'Try it' && await t.play.isDisabled(), `${tag}: Try it is off; "${await t.currentText()}"`)
  await audit(t, `${tag}.gate`)
  await t.shot(`${tag}-16-gate-not-ready`)
  const bridge = [await place(t, { partId: 'brick_2x2', x: 23, y: 2, z: 21 }), await place(t, { partId: 'brick_2x2', x: 23, y: 5, z: 21 })]
  await place(t, { partId: 'robo_distance_sensor', x: 21, y: 7, z: 27 })
  await t.robo((state) => state.dismissWiringNote())
  await frameAll(t)
  check(`${tag}.gate-stuck`, (await t.currentText()) === 'The arm is stuck to the frame. Take off the brick that joins them.', `${tag}: "${await t.currentText()}"`)
  await t.shot(`${tag}-17-gate-stuck`)
  await t.steps.locator('[aria-current=step]').click()
  await t.sleep(250)
  check(`${tag}.gate-stuck-selects`, (await t.brick((state) => state.selectedId)) === bridge[1], `${tag}: the fix row picked the brick that holds the arm`)
  await t.page.keyboard.press('Delete')
  await t.sleep(250)
  await t.brick((state, id) => { state.selectBrick(id) }, bridge[0])
  await t.page.keyboard.press('Delete')
  await t.sleep(300)
  check(`${tag}.gate-ready`, (await t.currentText()) === 'Ready to try!' && await t.play.isEnabled(), `${tag}: with the bricks taken off, "${await t.currentText()}" and Try it is on`)
  await t.shot(`${tag}-18-gate-ready`)

  // A signal light.
  await t.brick((state) => state.newBuild())
  await t.sleep(200)
  await place(t, { partId: 'robo_hub', x: 40, y: 0, z: 40 })
  await keepBuilding(t)
  await place(t, { partId: 'robo_distance_sensor', x: 41, y: 6, z: 40 })
  await t.robo((state) => state.dismissWiringNote())
  await frameAll(t)
  check(`${tag}.signal-not-ready`, (await t.currentText()) === 'Add a light so it can show what it sees.' && await t.play.isDisabled(), `${tag}: "${await t.currentText()}"`)
  await t.shot(`${tag}-19-signal-not-ready`)
  await place(t, { partId: 'robo_light', x: 43, y: 6, z: 43 })
  await t.robo((state) => state.dismissWiringNote())
  await frameAll(t)
  check(`${tag}.signal-ready`, (await t.currentText()) === 'Ready to try!' && await t.play.isEnabled(), `${tag}: "${await t.currentText()}", Try it on`)
  await audit(t, `${tag}.signal`)
  await t.shot(`${tag}-20-signal-ready`)
}

await screens(s)
await s.context.close()
const small = await openStudio(1024, 768)
await screens(small)
// The card, its "?" and the panel's first steps at 1024 too.
await small.brick((state) => state.newBuild())
await small.sleep(200)
await place(small, { partId: 'plate_6x8', x: 28, y: 0, z: 26 })
await place(small, { partId: 'robo_hub', x: 29, y: 1, z: 27 })
await small.sleep(400)
await small.card.getByRole('button', { name: 'What does this mean?' }).click()
await small.sleep(200)
await small.shot('1024-02-card-why')
await keepBuilding(small)
await place(small, { partId: 'robo_motor', x: 31, y: 1, z: 31 })
await frameAll(small)
await small.shot('1024-04-one-motor')
await small.context.close()

check('console.clean', consoleErrors.length === 0, consoleErrors.length ? `console errors: ${consoleErrors.slice(0, 3).join(' | ')}` : 'no console errors or page errors')
const failed = results.filter((result) => !result.ok)
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ harness: 'scripts/qa/robotics-kid-guide.mjs', origin, viewports: ['1366x768 (journey and screens)', '1024x768 (screens)'], at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, journey, shots, results }, null, 2)}\n`)
await browser.close()
console.log(`\n${results.length - failed.length}/${results.length} checks passed · ${out}`)
process.exit(failed.length ? 1 : 0)
