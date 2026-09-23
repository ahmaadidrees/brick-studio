/**
 * Robot Workshop spike, checkpoint 2, lane W: wiring in Build, driven by a real pointer.
 *
 * Real Chrome at 1366×768 against the robotics dev server
 * (`npx vite --mode robotics --port 5243 --strictPort --host 127.0.0.1`). The rover is
 * built with the studio's own placement actions exactly as robotics-spike-cp1.mjs does
 * (choosePart → rotate → setDraftPosition → placeDraft, so assisted wiring runs as it
 * does on a click; pointer placement is proven by robotics-spike-cp1-pointer.mjs). The
 * wiring is then done the way a student does it: parts are selected by clicking them
 * in the canvas (aimed with the dev-only `window.__robotics.project`, the studio's own
 * world→screen answer), and every wiring edit is a click on the device inspector's
 * chips and buttons, the hub's port list, the Wiring toggle or the name field. After
 * each step the harness reads back the document's robotics section, what the scene
 * draws (`window.__robotics.cables`, dev only) and what the inspector says. Kid-UX pass
 * (docs/robotics/KID-UX.md §G): the Wiring toggle, the run space and the motor tests sit in the
 * robot panel's folded More, the part rows in its folded Parts; both are opened with a click.
 * Lane P: a part's card is simple first, so its ports, cable, code line and wiring buttons are
 * behind the part's own More (opened with a click before they are read), and the toggle reads
 * "Plug in by itself: On / Off".
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp2-wiring.mjs
 *
 * Writes PNGs, results.json and nothing else under docs/qa/robotics-cp2/wiring/.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5243', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-cp2/wiring')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const results = []
const shots = []
const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(String(error)))
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }
const sleep = (ms) => page.waitForTimeout(ms)

await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
await page.goto(`${origin}/build`)
await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.project && window.__robotics?.cables), null, { timeout: 30_000 })
await page.waitForSelector('canvas')

/* ---------------------------------------------------------------- helpers */
const STUD = 0.62
const PLATE = 0.18
const brick = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const robo = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), arg), { src: fn.toString(), arg })
const hook = (fn, arg) => page.evaluate(({ src, arg }) => new Function('hook', 'arg', `return (${src})(hook, arg)`)(window.__robotics, arg), { src: fn.toString(), arg })
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
const screenOf = (point) => hook((h, p) => h.project(p), point)
/** The robotics section as stored in the document, read back after every step. */
const section = () => brick((state) => JSON.parse(JSON.stringify(state.documentMetadata.robotics ?? null)))
const portOf = (s, id) => s?.connections.find((c) => c.deviceId === id)?.port ?? null
const drawn = () => hook((h) => h.cables())
const toast = () => brick((state) => state.toast)
const wiringNote = () => robo((state) => state.wiringNote?.text ?? null)
const topLabel = () => brick((state) => state.undoStack.at(-1)?.label ?? null)
const selectedId = () => brick((state) => state.selectedId)
const inspector = page.getByTestId('robotics-device-inspector')
const hubInspector = page.getByTestId('robotics-hub-inspector')
const panel = page.getByTestId('robotics-panel')
/** Opens the picked part's own More (lane P: its ports, cable, code line and wiring buttons are there). */
const partMore = async () => {
  const toggle = page.locator('[data-testid=robotics-device-inspector], [data-testid=robotics-hub-inspector]').getByRole('button', { name: /^More about / })
  if ((await toggle.count()) && (await toggle.getAttribute('aria-expanded')) !== 'true') { await toggle.click(); await sleep(120) }
}
const stateText = async () => { await partMore(); return inspector.getByTestId('wiring-state').textContent() }
const readingText = async () => { await partMore(); return inspector.getByTestId('wiring-reading').textContent() }
const blockText = async () => { await partMore(); return inspector.getByTestId('wiring-block').textContent() }
const chip = (port) => inspector.locator(`button.wiring-port[data-port="${port}"]`)
const chipStates = async () => { await partMore(); return inspector.locator('button.wiring-port').evaluateAll((buttons) => buttons.map((button) => `${button.dataset.port}:${button.dataset.state}`).join(' ')) }
/** Opens a folded section of the robot panel (Parts, More) when it is shut: the kid-UX panel folds both by default. */
const openFold = async (name) => {
  const toggle = panel.getByTestId(name === 'More' ? 'robotics-more-fold' : 'robotics-parts-fold').locator('> .robotics-fold-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') { await toggle.click(); await sleep(150) }
}
const steps = []
const readBack = async (step) => {
  const s = await section()
  steps.push({ step, connections: s?.connections ?? [], devices: s?.devices ?? {}, wiring: s?.settings?.wiring ?? null, drawn: await drawn() })
  return s
}

async function shot(name, { clipTo } = {}) {
  const file = path.join(out, `${name}.png`)
  await page.screenshot({ path: file })
  shots.push(`${name}.png`)
  console.log(`  shot ${name}.png`)
  if (clipTo) {
    // A close-up of the creation, so the cables read at print size.
    const corners = []
    for (const [x, y, z] of clipTo) corners.push(await screenOf(world(x, y, z)))
    const left = Math.max(0, Math.min(...corners.map((c) => c.x)) - 60)
    const top = Math.max(0, Math.min(...corners.map((c) => c.y)) - 60)
    const right = Math.min(1366, Math.max(...corners.map((c) => c.x)) + 60)
    const bottom = Math.min(768, Math.max(...corners.map((c) => c.y)) + 60)
    const zoomFile = path.join(out, `${name}-closeup.png`)
    await page.screenshot({ path: zoomFile, clip: { x: left, y: top, width: right - left, height: bottom - top } })
    shots.push(`${name}-closeup.png`)
  }
}
/** The rover's bounding corners, for close-ups. */
const ROVER_BOX = [[24, 0, 26], [37, 0, 26], [24, 0, 34], [37, 0, 34], [24, 9, 26], [37, 9, 26], [24, 9, 34], [37, 9, 34]]

async function place({ partId, x, y, z, rotation = 0 }) {
  const ok = await brick((state, p) => {
    state.choosePart(p.partId)
    for (let turn = 0; turn < p.rotation; turn += 1) state.rotate()
    state.setDraftPosition(p.x, p.y, p.z)
    const placed = state.placeDraft()
    state.cancelInteraction()
    return placed
  }, { partId, x, y, z, rotation })
  assert(ok, `could not place ${partId} at ${x},${y},${z}`)
  await sleep(120)
  return brick((state) => state.bricks[state.bricks.length - 1].id)
}
/** A student's click on a part in the canvas: aim at a point on it and click. Returns what got selected. */
async function clickPart(point, label) {
  const at = await screenOf(point)
  assert(at.inFront, `${label} is behind the camera`)
  await page.mouse.move(at.x, at.y, { steps: 5 })
  await page.mouse.click(at.x, at.y)
  await sleep(250)
  return { at, selected: await selectedId() }
}

/* ---------------------------------------------------------------- W0. the rover, wired by assisted wiring */
console.log('\nW0. Rover from loose parts (store placement, as checkpoint 1)')
await robo((state) => state.resetSim())
await brick((state) => state.newBuild())
await sleep(150)
const ids = {}
ids.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26 })
ids.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27 })
await sleep(200)
const card = page.getByTestId('robotics-creation-card')
await card.getByRole('button', { name: 'Keep building' }).click()
await sleep(200)
// Kid-UX: the short card has no wiring toggle; "Plug in by itself: On / Off" (assisted / manual) lives in the panel's More.
await openFold('More')
await openFold('Parts')
check('W0.more-has-wiring-toggle', await panel.getByRole('group', { name: 'Plug in by itself' }).count() === 1 && await panel.getByRole('group', { name: 'Plug in by itself' }).getByRole('button', { name: 'On', exact: true }).getAttribute('aria-pressed') === 'true', 'the robot panel’s More shows "Plug in by itself: On / Off", On (assisted) pressed')
await shot('W0-more-wiring-toggle')
ids.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2 })
check('W0.left-motor-A', (await wiringNote()) === 'Left motor connected to port A', `assisted: ${await wiringNote()}`)
ids.rightMotor = await place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0 })
ids.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32 })
ids.rightAxle = await place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32 })
ids.leftWheel = await place({ partId: 'robo_wheel', x: 25, y: 0, z: 31 })
ids.rightWheel = await place({ partId: 'robo_wheel', x: 36, y: 0, z: 31 })
ids.sensor = await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26 })
check('W0.sensor-C', (await wiringNote()) === 'Front sensor connected to port C', `assisted: ${await wiringNote()}`)
await robo((state) => state.dismissWiringNote())
await robo((state, list) => state.requestFrame(list), Object.values(ids))
await sleep(800)
let s = await readBack('W0 assisted wiring')
check('W0.section', portOf(s, ids.leftMotor) === 'A' && portOf(s, ids.rightMotor) === 'B' && portOf(s, ids.sensor) === 'C' && s.settings.wiring === 'assisted', `cables: ${JSON.stringify(s.connections.map((c) => c.port))}`)
let scene = await drawn()
check('W0.cables-drawn', scene.cables.length === 3 && scene.stubs.length === 0 && scene.cables.every((c) => !c.lit), `${scene.cables.length} cables drawn, ${scene.stubs.length} loose ends, none lit`)
check('W0.cables-lifted', scene.cables.every((c) => c.lift > Math.max(c.from.y, c.to.y)), `every cable arcs above both of its ends (lifts ${scene.cables.map((c) => c.lift.toFixed(2)).join(', ')})`)
await shot('W1-rover-cables', { clipTo: ROVER_BOX })

/* ---------------------------------------------------------------- W1. the hub's ports; free port C for the motor */
console.log('\nW1. Hub ports: select the hub in the canvas, pick the sensor from its port list, move it to D')
let picked = await clickPart(world(31, 7, 29), 'the hub top')
check('W1.hub-selected', picked.selected === ids.hub, `clicking the hub at (${picked.at.x.toFixed(0)}, ${picked.at.y.toFixed(0)}) selects it (${picked.selected})`)
check('W1.hub-simple-first', (await hubInspector.getByTestId('wiring-does').textContent()) === 'The robot’s brain' && (await hubInspector.getByTestId('hub-plugged').textContent()) === 'Plugged in: Left motor, Right motor and Front sensor', `the hub's card: "${await hubInspector.getByTestId('wiring-does').textContent()}" · "${await hubInspector.getByTestId('hub-plugged').textContent()}"`)
await partMore()
const hubRows = await hubInspector.locator('.wiring-hub-port').allTextContents()
check('W1.hub-ports', hubRows.join(' | ') === 'ALeft motor | BRight motor | CFront sensor | DPort D · free', `hub inspector: ${hubRows.join(' | ')}`)
await shot('W2-hub-inspector')
await hubInspector.getByRole('button', { name: 'Port C: Front sensor. Select Front sensor' }).click()
await sleep(200)
check('W1.port-selects-device', (await selectedId()) === ids.sensor && (await stateText()) === 'Port C', 'clicking port C in the hub list selects the front sensor; its inspector says Port C')
await partMore()
await chip('D').click()
await sleep(250)
s = await readBack('W1 sensor moved to D')
check('W1.sensor-moved', portOf(s, ids.sensor) === 'D' && (await toast()) === 'Front sensor moved to port D. Port C is free again.', `sensor on ${portOf(s, ids.sensor)}; toast: ${await toast()}`)

/* ---------------------------------------------------------------- W2. select the left motor, move it to C */
console.log('\nW2. Left motor: select in the canvas, move to port C with a chip')
picked = await clickPart(world(29.5, 7, 32.5), 'the left motor top')
check('W2.motor-selected', picked.selected === ids.leftMotor, `clicking the left motor at (${picked.at.x.toFixed(0)}, ${picked.at.y.toFixed(0)}) selects it`)
check('W2.simple-first', (await inspector.getByTestId('wiring-does').textContent()) === 'Turns the left wheel · plugged in', `before More, the card says "${await inspector.getByTestId('wiring-does').textContent()}"`)
check('W2.inspector-port-A', (await stateText()) === 'Port A' && (await chipStates()) === 'A:this B:used C:free D:used', `inspector: ${await stateText()}; chips ${await chipStates()}`)
check('W2.reading-stopped', (await readingText()) === 'Stopped', `Right now: ${await readingText()}`)
check('W2.block-label', (await blockText()).includes('Left motor · A') && !(await blockText()).includes('Not plugged in'), `block: ${await blockText()}`)
scene = await drawn()
check('W2.cable-lit', scene.cables.find((c) => c.deviceId === ids.leftMotor)?.lit === true && scene.cables.filter((c) => c.lit).length === 1, 'the selected motor’s cable is the one lit')
await shot('W3-left-motor-port-A', { clipTo: ROVER_BOX })
await chip('C').click()
await sleep(250)
s = await readBack('W2 left motor moved to C')
scene = await drawn()
check('W2.moved-to-C', portOf(s, ids.leftMotor) === 'C' && (await stateText()) === 'Port C', `section: left motor on ${portOf(s, ids.leftMotor)}; inspector: ${await stateText()}`)
check('W2.toast', (await toast()) === 'Left motor moved to port C. Port A is free again.', `toast: ${await toast()}`)
check('W2.cable-redrawn', scene.cables.find((c) => c.deviceId === ids.leftMotor)?.port === 'C' && scene.cables.find((c) => c.deviceId === ids.leftMotor)?.lit, 'the cable now runs to port C, still lit')
check('W2.undo-label', (await topLabel()) === 'Move Left motor to port C', `history: ${await topLabel()}`)
check('W2.block-follows', (await blockText()).includes('Left motor · C'), `block: ${await blockText()}`)
await shot('W4-moved-to-C', { clipTo: ROVER_BOX })

/* ---------------------------------------------------------------- W3. unplug */
console.log('\nW3. Unplug')
await inspector.getByRole('button', { name: 'Unplug', exact: true }).click()
await sleep(250)
s = await readBack('W3 unplugged')
scene = await drawn()
check('W3.unplugged', portOf(s, ids.leftMotor) === null && (await stateText()) === 'Unplugged' && (await readingText()) === 'No power', `section: ${portOf(s, ids.leftMotor)}; inspector: ${await stateText()} · ${await readingText()}`)
check('W3.not-plugged-in-pill', (await blockText()).includes('Not plugged in'), `block: ${await blockText()}`)
check('W3.loose-stub', scene.stubs.some((stub) => stub.deviceId === ids.leftMotor && stub.lit) && !scene.cables.some((c) => c.deviceId === ids.leftMotor), 'the scene draws a loose cable with a red plug and no cable to the hub')
check('W3.toast', (await toast()) === 'Left motor is unplugged. Blocks that use it show “Not plugged in”.', `toast: ${await toast()}`)
check('W3.panel-row', (await panel.locator(`li[data-brick-id="${ids.leftMotor}"]`).textContent()).includes('Not plugged in'), 'the creation panel row says Not plugged in')
await shot('W5-unplugged', { clipTo: ROVER_BOX })

/* ---------------------------------------------------------------- W4. plug back in */
console.log('\nW4. Plug back in')
await inspector.getByRole('button', { name: 'Plug into port A' }).click()
await sleep(250)
s = await readBack('W4 plugged into A')
check('W4.plugged', portOf(s, ids.leftMotor) === 'A' && (await stateText()) === 'Port A' && (await toast()) === 'Left motor connected to port A.', `section: ${portOf(s, ids.leftMotor)}; toast: ${await toast()}`)
check('W4.stub-gone', !(await drawn()).stubs.some((stub) => stub.deviceId === ids.leftMotor), 'the loose end is gone; the cable is back')

/* ---------------------------------------------------------------- W5. swap */
console.log('\nW5. Swap with the right motor')
await chip('B').click()
await sleep(250)
s = await readBack('W5 swapped')
check('W5.swapped', portOf(s, ids.leftMotor) === 'B' && portOf(s, ids.rightMotor) === 'A', `left on ${portOf(s, ids.leftMotor)}, right on ${portOf(s, ids.rightMotor)}`)
check('W5.toast', (await toast()) === 'Swapped ports. Left motor is on port B, Right motor is on port A.', `toast: ${await toast()}`)
check('W5.label', (await topLabel()) === 'Swap ports of Left motor and Right motor', `history: ${await topLabel()}`)
await shot('W6-swapped', { clipTo: ROVER_BOX })

/* ---------------------------------------------------------------- W6. rename */
console.log('\nW6. Rename')
const nameField = inspector.getByLabel('Device name')
await nameField.click()
await nameField.fill('Big wheel')
await nameField.press('Enter')
await sleep(250)
s = await readBack('W6 renamed')
check('W6.renamed', s.devices[ids.leftMotor]?.name === 'Big wheel' && (await nameField.inputValue()) === 'Big wheel', `devices: ${JSON.stringify(s.devices)}`)
check('W6.label-and-toast', (await topLabel()) === 'Rename Left motor to Big wheel' && (await toast()) === 'Left motor is now called Big wheel. Blocks that use it show the new name.', `history: ${await topLabel()}; toast: ${await toast()}`)
check('W6.block-and-panel', (await blockText()).includes('Big wheel · B') && (await panel.locator(`li[data-brick-id="${ids.leftMotor}"]`).textContent()).startsWith('Big wheel'), `block: ${await blockText()}`)
await shot('W7-renamed')

/* ---------------------------------------------------------------- W7. a live reading, and a wiring edit retires the nudge */
console.log('\nW7. Live reading while a nudge runs; a wiring edit retires it')
await panel.getByRole('button', { name: 'Spin', exact: true }).first().click()
await page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
await sleep(1200)
const live = await readingText()
check('W7.live-reading', /^40 % · output at -?\d+°$/.test(live), `Right now while the nudge runs: ${live}`)
await inspector.getByTestId('wiring-reading').scrollIntoViewIfNeeded()
await sleep(150)
await shot('W8-live-reading')
await inspector.getByRole('button', { name: 'Move to port C' }).click()
await sleep(300)
s = await readBack('W7 moved to C during a run')
check('W7.edit-retires-run', (await robo((state) => state.sim)) === null && portOf(s, ids.leftMotor) === 'C' && (await page.getByTestId('robotics-sim-status').textContent()) === 'Stopped', 'the wiring edit retired the running nudge; the studio shows the built pose (the motor tests say "Stopped")')
check('W7.reading-back-to-rest', (await readingText()) === 'Stopped', `Right now after the run: ${await readingText()}`)

/* ---------------------------------------------------------------- W8. manual wiring */
console.log('\nW8. Plug in by itself: off (manual wiring), then place a light')
await panel.getByRole('group', { name: 'Plug in by itself' }).getByRole('button', { name: 'Off', exact: true }).click()
await sleep(250)
s = await readBack('W8 manual')
check('W8.manual', s.settings.wiring === 'manual' && (await topLabel()) === 'Plug in by itself: off' && (await toast()) === 'Plug in by itself is off. New parts wait for you to plug them in.', `mode ${s.settings.wiring}; toast: ${await toast()}`)
ids.light = await place({ partId: 'robo_light', x: 33, y: 1, z: 28 })
await sleep(200)
s = await readBack('W8 light placed in manual')
check('W8.light-unplugged', portOf(s, ids.light) === null && (await wiringNote()) === 'Light placed · plug it into a port in its panel', `light cable: ${portOf(s, ids.light)}; line: ${await wiringNote()}`)
check('W8.light-stub', (await drawn()).stubs.some((stub) => stub.deviceId === ids.light), 'the light shows a loose cable end')
picked = await clickPart(world(33.5, 4, 28.5), 'the light top')
check('W8.light-selected', picked.selected === ids.light, 'clicking the light selects it')
check('W8.light-inspector', (await stateText()) === 'Unplugged' && (await inspector.getByRole('button', { name: /^Plug into port / }).count()) === 1 && (await inspector.getByRole('button', { name: 'Plug it in' }).count()) === 1, `inspector: ${await stateText()}; "Plug it in" in its card`)
await shot('W9-manual-light-unplugged', { clipTo: ROVER_BOX })

/* ---------------------------------------------------------------- W9. delete a wired device, undo */
console.log('\nW9. Delete the right motor, then Undo')
picked = await clickPart(world(32.5, 7, 32.5), 'the right motor top')
check('W9.right-selected', picked.selected === ids.rightMotor && (await stateText()) === 'Port A', `clicking the right motor selects it (${picked.selected}); ${await stateText()}`)
const beforeDelete = await section()
await page.keyboard.press('Delete')
await sleep(300)
s = await readBack('W9 right motor deleted')
check('W9.deleted', !(await brick((state, id) => state.bricks.some((b) => b.id === id), ids.rightMotor)), 'the right motor is gone')
check('W9.cable-kept', portOf(s, ids.rightMotor) === 'A', 'its cable stays in the document (stale), so Undo can restore it')
check('W9.cable-not-drawn', !(await drawn()).cables.some((c) => c.deviceId === ids.rightMotor), 'a stale cable is not drawn')
picked = await clickPart(world(31, 7, 29), 'the hub top')
await partMore()
const staleRows = await hubInspector.locator('.wiring-hub-port').allTextContents()
check('W9.port-free-was', picked.selected === ids.hub && staleRows[0] === 'APort A · free (was Right motor)', `hub inspector: ${staleRows.join(' | ')}`)
await shot('W10-deleted-port-free-was', { clipTo: ROVER_BOX })
await page.keyboard.press('ControlOrMeta+z')
await sleep(300)
s = await readBack('W9 delete undone')
scene = await drawn()
check('W9.undo-restores', (await brick((state, id) => state.bricks.some((b) => b.id === id), ids.rightMotor)) && JSON.stringify(s) === JSON.stringify(beforeDelete), 'Undo brings the motor back and the section is exactly as before the delete')
check('W9.cable-back', scene.cables.some((c) => c.deviceId === ids.rightMotor && c.port === 'A'), 'the cable is drawn again on port A')
// Undo restores the selection the delete had: the right motor, whose inspector shows its port again.
check('W9.inspector-back', (await selectedId()) === ids.rightMotor && (await stateText()) === 'Port A' && scene.cables.find((c) => c.deviceId === ids.rightMotor)?.lit, `after Undo the right motor is selected again: ${await stateText()}, its cable lit`)
await shot('W11-undo-cable-back', { clipTo: ROVER_BOX })

/* ---------------------------------------------------------------- W10. save and reload */
console.log('\nW10. Save and reload')
const beforeReload = await section()
await sleep(1000) // autosave delay
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.cables), null, { timeout: 30_000 })
await sleep(600)
s = await readBack('W10 reloaded')
check('W10.round-trip', JSON.stringify(s) === JSON.stringify(beforeReload), 'cables, names and the wiring mode survive autosave and reload')
scene = await drawn()
check('W10.drawn-after-reload', scene.cables.length === 3 && scene.stubs.length === 1 && scene.stubs[0].deviceId === ids.light, `${scene.cables.length} cables and the light's loose end drawn after reload`)
await shot('W12-reloaded')

/* ---------------------------------------------------------------- W11. a closer look */
console.log('\nW11. Zoomed in with the mouse wheel: the selected cable and both of its ends')
const centre = await screenOf(world(31, 4, 30))
await page.mouse.move(centre.x, centre.y)
for (let tick = 0; tick < 3; tick += 1) { await page.mouse.wheel(0, -200); await sleep(120) }
await sleep(500)
picked = await clickPart(world(29.5, 7, 32.5), 'the left motor top')
check('W11.selected-zoomed', picked.selected === ids.leftMotor && (await drawn()).cables.find((c) => c.deviceId === ids.leftMotor)?.lit, 'zoomed in, clicking Big wheel selects it and lights its cable')
await shot('W13-zoomed-selected-cable')

check('console.clean', consoleErrors.length === 0, consoleErrors.length ? `console errors: ${consoleErrors.slice(0, 3).join(' | ')}` : 'no console errors or page errors')

await writeFile(path.join(out, 'results.json'), JSON.stringify({ harness: 'scripts/qa/robotics-cp2-wiring.mjs', origin, viewport: '1366x768', ranAt: new Date().toISOString(), passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results, steps, shots }, null, 2))
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed · ${out}`)
await browser.close()
