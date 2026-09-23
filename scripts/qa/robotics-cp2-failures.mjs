/**
 * Robot Workshop spike, checkpoint 2: the five failures (contract §9), each built deliberately and
 * diagnosed from what the app shows, in real Chrome at 1366×768.
 *
 * Real Chrome through Playwright against the robotics dev server
 * (`npx vite --mode robotics --port 5247 --strictPort --host 127.0.0.1`). Each construction is placed
 * with the studio's own placement actions (choosePart → rotate → setDraftPosition → placeDraft, so
 * assisted wiring and the creation card run as they do on a click; pointer placement is proven by
 * robotics-spike-cp1-pointer.mjs). Everything after that is a student's input: clicks on parts in the
 * canvas (aimed with the dev-only `window.__robotics.project`), the hub's port list, the inspector's
 * Unplug / Plug into port / name field, arrow keys, R and Delete on a selected brick, the panel's
 * Code button, the + menu, blocks dragged out of the palette under a hat, a click on a block's
 * dropdown and on its number field with typed digits, Run / Reset, Test plate / My world,
 * "Someone walks up", Back to build, and the stage's own orbit, pan and zoom.
 *
 *   F1  wheel left off its axle     the intact rover is coded, then the wheel is nudged off; Code, a
 *                                   one-motor program, test plate and My world; nudged back on
 *   F2  one motor mounted backwards raw "run Left/Right motor at 40 %" on the mirror-mounted pair; the
 *                                   fix typed while it runs; the drive helper for comparison
 *   F5  motor unplugged             the F2 rover: Unplug in the inspector, reload, Code, Run; plugged back
 *   F3  sensor pointed sideways     "Stop before the wall" never stops; turned forward with R, it does
 *   F4  arm built into the frame    two bricks under the door; "Smart gate" in My world; bricks deleted
 *   F2d the other way round         the right motor outboard with its socket facing in: no reversed
 *                                   motor, and the same two raw blocks drive straight
 *
 * Every diagnosis is read from what the app shows: the panel's lines and part rows, the
 * selected-part line and the device inspector in Build; the blocks' warning text, outline, dropdown
 * labels and glow, the problems list and the run-blocked line in Code; the stage's reading chips and
 * status. Where a proof needs a number the page draws but does not print (a pose, a beam's end), it
 * is read from the stage's observation (`window.__robotics.stageStore`), which is what the stage
 * scene draws from, and the blocks from `window.__robotics.codeWorkspace` (both dev only).
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp2-failures.mjs
 *
 * ONLY=1,3 runs some failures (while iterating; F5 builds its own rover when F2 did not run); the
 * evidence run takes all of them. Writes PNGs and results.json under docs/qa/robotics-cp2/failures/.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5247', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-cp2/failures')
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null
const want = (n) => !only || only.has(n)
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const measured = {}
const seen = {}
const consoleErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
/** A failed check is recorded and the run goes on, so one run shows every gap at once. */
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); return Boolean(condition) }
const norm = (text) => (text ?? '').replace(/\s+/g, ' ').trim()

const STUD = 0.62
const PLATE = 0.18
const GREY = '#52636c'
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
const yawOf = (q) => (Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) * 180) / Math.PI

/* ================================================================ the page */
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await context.newPage()
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(String(error)))
await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
await page.goto(`${origin}/build`)
await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.project && window.__robotics?.cables), null, { timeout: 30_000 })
await page.waitForSelector('canvas')

const sleep = (ms) => page.waitForTimeout(ms)
const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(target === 'hook' ? window.__robotics : window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
const brick = run('brickStore')
const robo = run('roboticsStore')
const stage = run('stageStore')
const hook = run('hook')
const shots = []
async function shot(name) { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); shots.push(file); console.log(`  shot ${file}`); return file }

async function place({ partId, x, y, z, rotation = 0, color }) {
  const ok = await brick((state, p) => {
    state.choosePart(p.partId)
    for (let turn = 0; turn < p.rotation; turn += 1) state.rotate()
    if (p.color) state.setActiveColor(p.color)
    state.setDraftPosition(p.x, p.y, p.z)
    const placed = state.placeDraft()
    state.cancelInteraction()
    return placed
  }, { partId, x, y, z, rotation, color })
  assert(ok, `could not place ${partId} at ${x},${y},${z}`)
  await sleep(90)
  return brick((state) => state.bricks[state.bricks.length - 1].id)
}
const section = () => brick((state) => JSON.parse(JSON.stringify(state.documentMetadata.robotics ?? null)))
const selectedId = () => brick((state) => state.selectedId)
const toast = () => brick((state) => state.toast)
async function clickPart(point, label) {
  const at = await hook((h, p) => h.project(p), point)
  assert(at.inFront, `${label} is behind the camera`)
  await page.mouse.move(at.x, at.y, { steps: 4 })
  await page.mouse.click(at.x, at.y)
  await sleep(250)
  return { at, selected: await selectedId() }
}
const frameOn = async (ids) => { await robo((state, list) => state.requestFrame(list), ids); await sleep(600) }

/* ---------------------------------------------------------------- Build: what the panel and inspector say */
const panel = page.getByTestId('robotics-panel')
const inspector = page.getByTestId('robotics-device-inspector')
const panelLines = async () => (await panel.locator('.robotics-lines li').allTextContents()).map(norm)
const partRow = (id) => panel.locator(`.robotics-parts li[data-brick-id="${id}"]`)
const rowText = async (id) => ((await partRow(id).count()) ? norm(await partRow(id).textContent()) : null)
const rowTone = async (id) => ((await partRow(id).count()) ? (await partRow(id).getAttribute('class')).split(' ').filter(Boolean) : null)
const selectedPartLine = async () => ((await page.getByTestId('robotics-selected-part').count()) ? norm(await page.getByTestId('robotics-selected-part').textContent()) : null)
const inspectorText = async () => ({
  name: await inspector.getByLabel('Device name').inputValue(),
  sub: norm(await inspector.getByTestId('wiring-sub').textContent()),
  state: norm(await inspector.getByTestId('wiring-state').textContent()),
  reading: norm(await inspector.getByTestId('wiring-reading').textContent()),
  block: norm(await inspector.getByTestId('wiring-block').textContent()),
  hint: norm(await inspector.locator('.wiring-hint').textContent()),
})

/* ---------------------------------------------------------------- Code: blocks, chips, stage */
const observation = () => stage((state) => {
  const o = state.stageObservation
  return o && { phase: o.phase, timeSeconds: o.timeSeconds, sensors: o.sensors, motors: o.motors, speed: o.speedStudsPerSecond, beams: o.beams, contacts: o.contacts, activeBlockIds: o.activeBlockIds, diagnostics: o.diagnostics.map((d) => ({ code: d.code, severity: d.severity, message: d.message, blockId: d.blockId })) }
})
const poseOf = (brickId) => stage((state, id) => { const c = state.stage.controller; const body = c.bodyOfBrick(id); const p = body && c.poses().get(body); return p ? { position: p.position, rotation: p.rotation } : null }, brickId)
const spaceNow = () => stage((state) => state.stage?.space ?? null)
const text = async (testId) => ((await page.getByTestId(testId).count()) ? norm(await page.getByTestId(testId).textContent()) : null)
/** The stage's reading chips as the page draws them: label → { value, detail, tone }. */
const chips = () => page.locator('[data-testid=robo-readings] .robo-read').evaluateAll((list) => Object.fromEntries(list.map((chip) => [chip.querySelector('small').textContent, { value: chip.querySelector('strong').textContent, detail: chip.querySelector('span:not(.robo-swatch)')?.textContent ?? null, tone: [...chip.classList].find((name) => name !== 'robo-read') }])))
const problems = async () => ((await page.getByTestId('robo-problems').count()) ? (await page.getByTestId('robo-problems').locator('li').allTextContents()).map(norm) : [])
/** Every block in the open workspace: type, id, field values, the labels it draws, and its warning text. */
const blocks = () => hook((h) => h.codeWorkspace().getAllBlocks(true).map((block) => {
  const fields = block.inputList.flatMap((input) => input.fieldRow).filter((field) => field.name)
  const warning = block.icons?.find((icon) => String(icon.getType()) === 'warning')
  return {
    type: block.type,
    id: block.id,
    parent: block.getParent()?.id ?? null,
    fields: Object.fromEntries(fields.map((field) => [field.name, String(field.getValue())])),
    labels: fields.map((field) => field.getText()),
    warning: warning ? warning.getText() : null,
    outline: ['robo-diag-error', 'robo-diag-warning', 'robo-diag-info'].find((name) => block.getSvgRoot().classList.contains(name)) ?? null,
  }
}))
/** A block's (or one of its fields', or its input's number field's) screen rect; `flyout` looks in the open palette. */
const blockRect = (query) => hook((h, q) => {
  const workspace = h.codeWorkspace()
  const target = q.flyout ? workspace.getToolbox().getFlyout().getWorkspace() : workspace
  let block = q.id ? target.getBlockById(q.id) : target.getTopBlocks(true).find((candidate) => candidate.type === q.type)
  if (!block) return null
  if (q.input) block = block.getInputTargetBlock(q.input)
  const element = q.field ? block.getField(q.field).getSvgRoot() : block.getSvgRoot().querySelector('.blocklyPath')
  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, id: block.id }
}, query)

async function openCode() {
  await page.waitForSelector('.brick-toast', { state: 'detached', timeout: 6000 }).catch(() => {})
  await page.getByTestId('robotics-code-button').click()
  await page.waitForSelector('.robo-code-blockly .blocklySvg', { timeout: 30_000 })
  await page.waitForFunction(() => { const s = window.__robotics.stageStore.getState(); return s.stage !== null && !s.stageLoading }, null, { timeout: 30_000 })
  await sleep(900)
}
async function back() {
  await page.getByTestId('robo-back').click()
  await page.waitForSelector('[data-testid=robo-code]', { state: 'detached' })
  await sleep(300)
}
async function newProgram(label) {
  await page.getByRole('button', { name: 'New program' }).click()
  await sleep(200)
  await page.getByTestId('robo-starters-menu').getByText(label, { exact: true }).click()
  await sleep(700)
}
/** Drags a block out of a palette category and drops it under `underId` (it snaps into the stack). */
async function dragFromPalette(category, type, underId) {
  // A click on the open category would close its palette: click only when it is not the one showing.
  const showing = await hook((h, name) => { const toolbox = h.codeWorkspace().getToolbox(); return toolbox.getFlyout().isVisible() && toolbox.getSelectedItem()?.getName() === name }, category)
  if (!showing) await page.locator('.blocklyToolboxCategory', { hasText: category }).click()
  await sleep(500)
  const source = await blockRect({ flyout: true, type })
  assert(source, `no ${type} in the ${category} palette`)
  const under = await blockRect({ id: underId })
  const before = new Set((await blocks()).map((block) => block.id))
  await page.mouse.move(source.x + 12, source.y + 14)
  await page.mouse.down()
  await page.mouse.move(source.x + 60, source.y + 30, { steps: 6 })
  await page.mouse.move(under.x + 14, under.y + under.height + 16, { steps: 14 })
  await page.mouse.up()
  await sleep(700)
  const added = (await blocks()).find((block) => block.type === type && !before.has(block.id))
  if (!added) await page.screenshot({ path: path.join(out, `debug-drag-${type}.png`) })
  assert(added, `dragging ${type} added nothing (from ${JSON.stringify(source)} to under ${JSON.stringify(under)})`)
  return added.id
}
/** Clicks a block's number slot and types a value, as a student does. */
async function typeNumber(blockId, input, value) {
  const field = await blockRect({ id: blockId, input, field: 'NUM' })
  await page.mouse.click(field.x + field.width / 2, field.y + field.height / 2)
  await sleep(250)
  await page.keyboard.press('Meta+A').catch(() => {})
  await page.keyboard.type(String(value))
  await page.keyboard.press('Enter')
  await sleep(600)
}
/** Opens a block's dropdown with a click and picks an option by its label. */
async function pickOption(blockId, field, label) {
  const rect = await blockRect({ id: blockId, field })
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await sleep(300)
  const option = page.locator('.blocklyDropDownDiv .blocklyMenuItem', { hasText: label })
  const options = (await page.locator('.blocklyDropDownDiv .blocklyMenuItem').allTextContents()).map(norm)
  assert(await option.count(), `no "${label}" in the dropdown (${options.join(' | ')})`)
  await option.first().click()
  await sleep(600)
  return options
}
const runProgram = async () => { await page.getByTestId('robo-run').click(); await sleep(150) }
const resetStage = async () => { await page.getByTestId('robo-reset').click(); await sleep(500) }

/* ---------------------------------------------------------------- builds */
/** The rover from loose parts (robotics fixtures' layout); the card is named and closed with "Not now". */
async function buildRover(name, { leftWheelOff = false, sensorSideways = false } = {}) {
  await stage((state) => state.closeStage())
  if (await brick((state) => state.bricks.length)) await brick((state) => state.newBuild())
  await sleep(150)
  const ids = {}
  ids.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
  ids.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
  const card = page.getByTestId('robotics-creation-card')
  await card.getByLabel('Creation name').fill(name)
  await card.getByRole('button', { name: 'Not now' }).click()
  ids.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
  ids.rightMotor = await place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0, color: GREY })
  ids.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
  ids.rightAxle = await place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
  // Left off its axle: one stud further out, so the axle end no longer reaches the hole.
  ids.leftWheel = await place({ partId: 'robo_wheel', x: leftWheelOff ? 24 : 25, y: 0, z: 31, color: '#1f2a33' })
  ids.rightWheel = await place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
  // Pointed sideways: turned a quarter (R once) and set at the plate's far-right edge.
  ids.sensor = sensorSideways
    ? await place({ partId: 'robo_distance_sensor', x: 33, y: 1, z: 26, rotation: 1, color: '#f4ca3a' })
    : await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
  await robo((state) => state.dismissWiringNote())
  await frameOn(Object.values(ids))
  return ids
}

/** The gate from loose parts (cp2-code's layout). `builtIntoFrame` stands two bricks on the sill under the door's far end. */
async function buildGate(name, { builtIntoFrame = false } = {}) {
  await stage((state) => state.closeStage())
  if (await brick((state) => state.bricks.length)) await brick((state) => state.newBuild())
  await sleep(150)
  const ids = {}
  ids.plate = await place({ partId: 'plate_6x8', x: 20, y: 0, z: 20, color: '#3e83d7' })
  ids.leftPost = await place({ partId: 'pillar_1x1', x: 20, y: 1, z: 20, color: GREY })
  ids.leftTop = await place({ partId: 'brick_1x1', x: 20, y: 10, z: 20, color: GREY })
  ids.rightPost = await place({ partId: 'pillar_1x1', x: 25, y: 1, z: 20, color: GREY })
  ids.rightTop = await place({ partId: 'brick_1x1', x: 25, y: 10, z: 20, color: GREY })
  ids.lintel = await place({ partId: 'brick_1x6', x: 20, y: 13, z: 20, rotation: 1, color: GREY })
  ids.sill = await place({ partId: 'plate_2x4', x: 21, y: 1, z: 21, rotation: 1, color: GREY })
  ids.hinge = await place({ partId: 'robo_hinge_motor', x: 21, y: 2, z: 21, color: '#e7473c' })
  const card = page.getByTestId('robotics-creation-card')
  await card.getByLabel('Creation name').fill(name)
  await card.getByRole('button', { name: 'Not now' }).click()
  if (builtIntoFrame) {
    // The student props the door's far end up from the sill: two 2×2 bricks, the door rests on their studs.
    ids.bridge1 = await place({ partId: 'brick_2x2', x: 23, y: 2, z: 21, color: GREY })
    ids.bridge2 = await place({ partId: 'brick_2x2', x: 23, y: 5, z: 21, color: GREY })
  }
  ids.door = await place({ partId: 'brick_1x4', x: 21, y: 8, z: 21, rotation: 1, color: '#f4ca3a' })
  ids.hub = await place({ partId: 'robo_hub', x: 20, y: 1, z: 24, color: '#f5eee0' })
  ids.sensor = await place({ partId: 'robo_distance_sensor', x: 21, y: 7, z: 27, color: '#f4ca3a' })
  await robo((state) => state.dismissWiringNote())
  await frameOn(Object.values(ids))
  return ids
}

async function reloadStudio() {
  await sleep(2500) // autosave
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.project && window.__robotics?.cables), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  await sleep(900)
}

/** Samples the observation for `seconds`, calling `each` on every sample. */
async function sample(seconds, each, every = 200) {
  const list = []
  const started = Date.now()
  while (Date.now() - started < seconds * 1000) {
    const o = await observation()
    list.push(o)
    if (each) await each(o, list.length)
    await sleep(every)
  }
  return list
}

/* ================================================================ F1. Wheel left off its axle */
async function failureWheelOff() {
  console.log('\nF1. A wheel left off its axle')
  // The student built the rover and coded it; then the left wheel comes off its axle (a nudge one stud out).
  const ids = await buildRover('Wheel-off buggy')
  await openCode()
  const intact = { space: await spaceNow(), program: (await section()).programs.at(-1)?.name }
  seen.F1 = { intact }
  await back()
  await frameOn(Object.values(ids))
  let picked = await clickPart(world(25.5, 4, 32.5), 'the left wheel')
  assert.equal(picked.selected, ids.leftWheel, 'clicking the left wheel selects it')
  await page.keyboard.press('ArrowLeft')
  await sleep(350)
  const moved = await brick((state, id) => state.bricks.find((b) => b.id === id).x, ids.leftWheel)
  assert.equal(moved, 24, 'the wheel moved one stud out')

  const lines = await panelLines()
  const wheelRow = await rowText(ids.leftWheel)
  const leftMotorRow = await rowText(ids.leftMotor)
  const selectedLine = await selectedPartLine()
  seen.F1.build = { lines, wheelRow, leftMotorRow, selectedLine }
  check('F1.build.selected-line', (selectedLine ?? '').startsWith('Wheel · Not on an axle'), `with the wheel still selected, the selected-part line reads "${selectedLine}"`)
  check('F1.build.wheel-row', wheelRow?.startsWith('Wheel · Not on an axle') && (await rowTone(ids.leftWheel)).includes('bad'), `the panel's row for the wheel (red): "${wheelRow}"`)
  check('F1.build.motor-row', leftMotorRow?.includes('axle in it, no wheel'), `the left motor's row: "${leftMotorRow}"`)
  check('F1.build.ready-line', lines.some((line) => line.includes('1 wheel not on an axle')), `the creation's line: "${lines[1]}"`)
  check('F1.build.no-drive-pair', !lines.some((line) => line.includes('Drive:')), `the drive line is gone: ${JSON.stringify(lines)}`)
  await shot('F1a-build-wheel-not-on-axle')
  await reloadStudio()
  check('F1.reload', (await rowText(ids.leftWheel))?.startsWith('Wheel · Not on an axle') && (await brick((state, id) => state.bricks.find((b) => b.id === id)?.x, ids.leftWheel)) === 24, `after a save and cold reload the wheel is still off: "${await rowText(ids.leftWheel)}"`)

  // Code, as the student left it: "Stop before the wall" and its "drive forward".
  await brick((state) => state.selectBrick(null))
  await openCode()
  const reopened = { space: await spaceNow(), program: (await page.getByRole('tab', { selected: true }).textContent()) }
  let list = await blocks()
  const drive = list.find((block) => block.type === 'robo_drive')
  let listed = await problems()
  await runProgram()
  await sleep(300)
  const blocked = await text('robo-run-blocked')
  const phase = (await observation())?.phase
  seen.F1.code = { intact, reopened, driveBlock: drive && { warning: drive.warning, outline: drive.outline }, problems: listed, runBlocked: blocked }
  measured.F1 = { spaceBefore: intact.space, spaceAfter: reopened.space }
  record('F1.code.space-default', true, `the intact rover opened on the ${intact.space}; with the wheel off it reopens on ${reopened.space} (no drive pair, so it is no longer a rover)`)
  check('F1.code.drive-block', drive?.outline === 'robo-diag-error' && /^Choose two drive motors first/.test(drive.warning ?? ''), `"drive forward" is marked: "${drive?.warning}"`)
  check('F1.code.drive-block-names-cause', /wheel|axle/i.test(drive?.warning ?? ''), `the drive block's message names the cause (the wheel): "${drive?.warning}"`)
  check('F1.code.run-blocked', phase === 'ready' && /^Can’t run yet: Choose two drive motors first/.test(blocked ?? ''), `Run: "${blocked}"`)
  await shot('F1b-code-drive-block-no-pair')

  // The student tries the motor alone: a blank program, when run → run Left motor at 40 %.
  await newProgram('Blank')
  const hat = (await blocks()).find((block) => block.type === 'robo_when_run')
  const runLeft = await dragFromPalette('Motion', 'robo_run_motor', hat.id)
  await typeNumber(runLeft, 'POWER', 40)
  list = await blocks()
  const leftBlock = list.find((block) => block.id === runLeft)
  check('F1.code.block', leftBlock.parent === hat.id && leftBlock.fields.MOTOR === ids.leftMotor && leftBlock.labels[0] === 'Left motor · A' && list.find((block) => block.parent === runLeft)?.fields.NUM === '40', `dragged under "when run": "run ${leftBlock.labels[0]} at 40 %"`)

  // Test plate: the rover is free to roll there, so if it stays put it is because no wheel reaches the ground.
  if ((await spaceNow()) !== 'testPlate') { await page.getByRole('button', { name: 'Test plate' }).click(); await sleep(900) }
  const before = await poseOf(ids.hub)
  await runProgram()
  let shotTaken = false
  const trace = await sample(3, async (o) => { if (!shotTaken && o.motors[ids.leftMotor]?.positionDegrees > 360) { shotTaken = true; await shot('F1c-code-motor-turns-rover-still') } })
  const last = trace.at(-1)
  const after = await poseOf(ids.hub)
  const drift = Math.hypot(after.position.x - before.position.x, after.position.z - before.position.z) / STUD
  const leftChip = (await chips())['Left motor']
  // The loose wheel is not part of the creation, so the test plate leaves it out: the stage shows a bare axle.
  const wheelOnTestPlate = await stage((state, id) => state.stage.controller.simulatedBrickIds.has(id), ids.leftWheel)
  Object.assign(measured.F1, { testPlate: { wheelOnStage: wheelOnTestPlate, leftMotorDegrees: last.motors[ids.leftMotor].positionDegrees, leftMotorSpeedPercent: last.motors[ids.leftMotor].speedPercent, chassisMovedStuds: Number(drift.toFixed(3)), chassisYawDegrees: Number(yawOf(after.rotation).toFixed(2)), leftChip } })
  check('F1.run.motor-turns', last.motors[ids.leftMotor].positionDegrees > 360 && last.motors[ids.leftMotor].speedPercent > 30, `the left motor's output turned ${last.motors[ids.leftMotor].positionDegrees}° at ${last.motors[ids.leftMotor].speedPercent} % speed`)
  check('F1.run.chip', leftChip && leftChip.value === '40 %' && /^speed \d+ % · \d+°$/.test(leftChip.detail ?? ''), `the stage's chip: Left motor ${leftChip?.value} (${leftChip?.detail})`)
  check('F1.run.rover-still', drift < 0.05 && Math.abs(yawOf(after.rotation)) < 1, `the rover stayed where it was: moved ${drift.toFixed(3)} studs, turned ${yawOf(after.rotation).toFixed(2)}°`)
  if (!shotTaken) await shot('F1c-code-motor-turns-rover-still')

  // The motor keeps its last command, so it is still turning: swing the stage view round to the rover's left
  // side (a right-button drag, the studio's orbit) and photograph its output twice. The yellow notch moves.
  await page.mouse.move(1180, 620)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1180 + 230, 620, { steps: 16 })
  await page.mouse.up({ button: 'right' })
  await sleep(300)
  // The view turns about a point beside the rover (framing slides the camera to clear the Code panel), so pan
  // it back into the stage with a middle-button drag from where the socket is to the middle of the stage.
  // Then zoom in with the wheel and pan again, so the output fills the middle of the stage.
  const bringToMiddle = async () => {
    const at = await hook((h, p) => h.project(p), world(28, 4, 32.5))
    await page.mouse.move(Math.min(1340, Math.max(840, at.x)), Math.min(700, Math.max(220, at.y)))
    await page.mouse.down({ button: 'middle' })
    await page.mouse.move(1090 + (Math.min(1340, Math.max(840, at.x)) - at.x), 470 + (Math.min(700, Math.max(220, at.y)) - at.y), { steps: 16 })
    await page.mouse.up({ button: 'middle' })
    await sleep(400)
  }
  await bringToMiddle()
  for (let step = 0; step < 14; step += 1) { await page.mouse.move(1090, 470); await page.mouse.wheel(0, -400); await sleep(120) }
  await sleep(300)
  await bringToMiddle()
  await bringToMiddle()
  const socket = await hook((h, p) => h.project(p), world(28, 4, 32.5))
  const clip = { x: Math.min(1366 - 360, Math.max(830, Math.round(socket.x - 180))), y: Math.min(768 - 260, Math.max(200, Math.round(socket.y - 130))), width: 360, height: 260 }
  const angles = []
  for (const suffix of ['1', '2']) {
    angles.push((await observation()).motors[ids.leftMotor].positionDegrees)
    const file = `F1c-closeup-output-${suffix}.png`
    await page.screenshot({ path: path.join(out, file), clip })
    shots.push(file)
    await sleep(350)
  }
  await shot('F1c-code-left-side-view')
  measured.F1.outputCloseups = { socketOnScreen: [Math.round(socket.x), Math.round(socket.y)], inFront: socket.inFront, degreesAtShots: angles }
  record('F1.run.output-closeups', socket.inFront && angles[1] > angles[0], `two close-ups of the left motor's output (socket at ${Math.round(socket.x)}, ${Math.round(socket.y)} on screen), taken at ${angles.map((a) => `${Math.round(a)}°`).join(' and ')}`)

  // My world: the loose wheel is scenery the studio draws where it was built, beside the turning axle.
  await page.getByRole('button', { name: 'My world' }).click()
  await sleep(900)
  const wheelHidden = await stage((state, id) => state.stage.controller.hiddenBrickIds.has(id), ids.leftWheel)
  await runProgram()
  await sleep(2000)
  const inWorld = await observation()
  measured.F1.myWorld = { leftMotorDegrees: inWorld.motors[ids.leftMotor].positionDegrees, wheelDrawnByStudioAtBuiltPose: !wheelHidden }
  check('F1.world.wheel-stays', !wheelHidden && inWorld.motors[ids.leftMotor].positionDegrees > 300, `in My world the loose wheel stays where it was built (the studio's own copy, not simulated) while the axle beside it turns ${inWorld.motors[ids.leftMotor].positionDegrees}°`)
  await shot('F1d-my-world-axle-turns-wheel-still')
  await resetStage()
  await back()

  // Repair: select the wheel, nudge it one stud back in.
  await frameOn(Object.values(ids))
  picked = await clickPart(world(24.5, 4, 32.5), 'the loose wheel')
  await page.keyboard.press('ArrowRight')
  await sleep(300)
  await page.keyboard.press('Escape')
  const repaired = await panelLines()
  check('F1.repair', picked.selected === ids.leftWheel && (await rowText(ids.leftWheel))?.startsWith('Wheel · on an axle in Left motor') && repaired.some((line) => line.includes('Drive: Left motor + Right motor')), `nudged back on: "${await rowText(ids.leftWheel)}"; ${repaired.find((line) => line.includes('Drive:'))}`)
}

/* ================================================================ F2. One motor mounted backwards */
async function failureReversed() {
  console.log('\nF2. One motor mounted backwards: two raw motor blocks at 40 %')
  const ids = await buildRover('Mirror buggy')
  const lines = await panelLines()
  const driveLine = lines.find((line) => line.includes('Drive:')) ?? null
  const rightRow = await rowText(ids.rightMotor)
  const leftRow = await rowText(ids.leftMotor)
  seen.F2 = { build: { driveLine, leftRow, rightRow } }
  check('F2.build.drive-line', driveLine?.endsWith('Drive: Left motor + Right motor · Right motor reversed'), `the panel's drive line: "${driveLine}"`)
  check('F2.build.motor-rows', rightRow?.includes('runs backward (reversed)') && leftRow?.includes('runs forward'), `rows: "${leftRow}" / "${rightRow}"`)
  const picked = await clickPart(world(32.5, 7, 32.5), 'the right motor')
  const rightInspector = picked.selected === ids.rightMotor ? await inspectorText() : null
  seen.F2.build.rightInspector = rightInspector
  check('F2.build.inspector', rightInspector?.sub === 'Motor · wheel on its axle · runs backward (reversed)', `clicking the right motor, the inspector says "${rightInspector?.sub}"`)
  await shot('F2a-build-drive-pair-right-reversed')
  await brick((state) => state.selectBrick(null))

  await openCode()
  // A new blank program: when run → run Left motor at 40 % → run Right motor at 40 %.
  await newProgram('Blank')
  const hat = (await blocks()).find((block) => block.type === 'robo_when_run')
  const runLeft = await dragFromPalette('Motion', 'robo_run_motor', hat.id)
  await typeNumber(runLeft, 'POWER', 40)
  const runRight = await dragFromPalette('Motion', 'robo_run_motor', runLeft)
  const options = await pickOption(runRight, 'MOTOR', 'Right motor · B')
  await typeNumber(runRight, 'POWER', 40)
  const list = await blocks()
  const program = list.filter((block) => block.type === 'robo_run_motor').map((block) => `run ${block.labels[0]} at ${list.find((child) => child.parent === block.id)?.fields.NUM} %`)
  seen.F2.code = { program, motorOptions: options }
  check('F2.code.program', program.join(' → ') === 'run Left motor · A at 40 % → run Right motor · B at 40 %' && list.find((block) => block.id === runRight).parent === runLeft, `the student's program: when run → ${program.join(' → ')} (dropdown offered ${options.join(', ')})`)
  check('F2.code.no-warnings', list.every((block) => !block.warning), 'no block has a warning: the program is valid, only the build is wrong')

  const before = await poseOf(ids.hub)
  await runProgram()
  let shotTaken = false
  const trace = await sample(3, async (o) => { if (!shotTaken && o.timeSeconds > 1.2) { shotTaken = true; await shot('F2b-code-raw-blocks-rover-turns') } })
  const last = trace.at(-1)
  const after = await poseOf(ids.hub)
  const drive = (await chips()).Motors
  const speedChip = (await chips()).Speed
  const yaw = yawOf(after.rotation) - yawOf(before.rotation)
  // The point it turned about: the fixed point of the chassis' rigid motion from `before` to `after`.
  const phi = (yaw * Math.PI) / 180
  const [c, s1] = [Math.cos(phi), Math.sin(phi)]
  const rotate = (p) => ({ x: p.x * c + p.z * s1, z: -p.x * s1 + p.z * c })
  const r0 = rotate(before.position)
  const b = { x: after.position.x - r0.x, z: after.position.z - r0.z }
  const det = 2 - 2 * c
  const pivot = { x: ((1 - c) * b.x + s1 * b.z) / det, z: (-s1 * b.x + (1 - c) * b.z) / det }
  // Midway between the wheels as built (grid x 25–37, z 32.5).
  const axleMid = world(31, 0, 32.5)
  const drift = Math.hypot(pivot.x - axleMid.x, pivot.z - axleMid.z) / STUD
  const moving = trace.filter((o) => o.timeSeconds > 0.3)
  const meanSpeed = moving.reduce((sum, o) => sum + Math.abs(o.speed), 0) / Math.max(1, moving.length)
  measured.F2 = {
    rawBlocks: {
      yawDegreesAfter3s: Number(yaw.toFixed(1)), pivotFromWheelsMidpointStuds: Number(drift.toFixed(2)), pivot: { x: Number(pivot.x.toFixed(3)), z: Number(pivot.z.toFixed(3)) }, meanForwardSpeedStudsPerSecond: Number(meanSpeed.toFixed(2)),
      left: { powerPercent: last.motors[ids.leftMotor].powerPercent, speedPercent: last.motors[ids.leftMotor].speedPercent, forwardPercent: last.motors[ids.leftMotor].forwardPercent },
      right: { powerPercent: last.motors[ids.rightMotor].powerPercent, speedPercent: last.motors[ids.rightMotor].speedPercent, forwardPercent: last.motors[ids.rightMotor].forwardPercent },
      chips: { Motors: drive, Speed: speedChip },
    },
  }
  check('F2.run.turns', Math.abs(yaw) > 60 && drift < 1 && meanSpeed < 0.5, `it spun ${Math.abs(yaw).toFixed(0)}° on the spot instead of driving straight: it turned about a point ${drift.toFixed(2)} studs from midway between its wheels, forward speed averaged ${meanSpeed.toFixed(2)} st/s (chip "Speed ${speedChip?.value}")`)
  check('F2.run.opposite-speeds', last.motors[ids.leftMotor].forwardPercent > 20 && last.motors[ids.rightMotor].forwardPercent < -20, `forward speeds as the creation feels them: left ${last.motors[ids.leftMotor].forwardPercent} %, right ${last.motors[ids.rightMotor].forwardPercent} % (both commanded +40)`)
  check('F2.run.chip', drive && /^40 · −40 %$/.test(drive.value) && /^speed \d+ · −\d+ %$/.test(drive.detail ?? '') && drive.tone === 'bad', `the stage's Motors chip: ${drive?.value} (${drive?.detail}), tone ${drive?.tone}`)
  if (!shotTaken) await shot('F2b-code-raw-blocks-rover-turns')

  // Repair, typed while it still spins: the right motor at −40. The run keeps the program it started with.
  await typeNumber(runRight, 'POWER', -40)
  const changedLine = await text('robo-changed')
  const stillSpinning = await observation()
  const yawWhileChanged = yawOf((await poseOf(ids.hub)).rotation)
  await sleep(600)
  const yawLater = yawOf((await poseOf(ids.hub)).rotation)
  const saved = (await section()).programs.find((program) => program.name === 'My program')
  check('F2.edit-while-running', changedLine === 'Changed · press Run to use it' && stillSpinning.phase === 'running' && Math.abs(yawLater - yawWhileChanged) > 5 && JSON.stringify(saved.workspace).includes('"NUM":-40'), `typed −40 while it spun: saved (revision ${saved.revision}), the stage says "${changedLine}" and the run keeps spinning (${yawWhileChanged.toFixed(0)}° → ${yawLater.toFixed(0)}°)`)
  await shot('F2c-changed-while-running')
  await resetStage()
  const fixStart = await poseOf(ids.hub)
  await runProgram()
  await sleep(1300)
  const fixed = await poseOf(ids.hub)
  const fixedChip = (await chips()).Motors
  measured.F2.repaired = { yawDegrees: Number(yawOf(fixed.rotation).toFixed(2)), forwardStuds: Number((-(fixed.position.z - fixStart.position.z) / STUD).toFixed(2)), chip: fixedChip }
  check('F2.repair', Math.abs(yawOf(fixed.rotation)) < 3 && -(fixed.position.z - fixStart.position.z) / STUD > 2 && fixedChip?.value === '40 · 40 %', `Reset, Run: with "run Right motor at −40 %" it drives straight: yaw ${yawOf(fixed.rotation).toFixed(1)}°, ${(-(fixed.position.z - fixStart.position.z) / STUD).toFixed(1)} studs in 1.3 s, chip ${fixedChip?.value}`)
  await shot('F2d-repaired-right-at-minus-40')
  await resetStage()

  // The same rover on its drive pair: the starter's "drive forward at 40 %" already goes straight.
  await page.getByRole('tab', { name: 'Stop before the wall' }).click()
  await sleep(700)
  const start = await poseOf(ids.hub)
  await runProgram()
  await sleep(1300)
  const helper = await observation()
  const straight = await poseOf(ids.hub)
  const helperChip = (await chips()).Motors
  measured.F2.driveHelper = { yawDegrees: Number(yawOf(straight.rotation).toFixed(2)), forwardStuds: Number((-(straight.position.z - start.position.z) / STUD).toFixed(2)), left: helper.motors[ids.leftMotor].powerPercent, right: helper.motors[ids.rightMotor].powerPercent, chip: helperChip }
  check('F2.helper-goes-straight', Math.abs(yawOf(straight.rotation)) < 3 && -(straight.position.z - start.position.z) / STUD > 2 && helper.motors[ids.rightMotor].powerPercent === -40 && helperChip?.value === '40 · 40 %', `"drive forward at 40 %" sends ${helper.motors[ids.leftMotor].powerPercent} and ${helper.motors[ids.rightMotor].powerPercent} (the pair knows the right motor is reversed): straight, yaw ${yawOf(straight.rotation).toFixed(1)}°, chip ${helperChip?.value}`)
  await resetStage()
  await page.getByRole('tab', { name: 'My program' }).click()
  await sleep(500)
  await back()
  return ids
}

/* ================================================================ F2, the other way round: both motors facing the same way */
/**
 * On a stud grid the natural rover mounts its motors mirror-wise, so one of them is always
 * reversed (F2 above). Mounting the right motor physically the other way round, outboard of its
 * wheel with the socket facing in, makes the two motors face the same way: the model then finds
 * no reversed motor, and the same two raw blocks drive straight. The motor hangs from a beam
 * carried by a pillar on the chassis plate.
 */
async function failureReversedOtherWay() {
  console.log('\nF2d. The right motor mounted the other way round (outboard, socket facing in)')
  await stage((state) => state.closeStage())
  if (await brick((state) => state.bricks.length)) await brick((state) => state.newBuild())
  await sleep(150)
  const ids = {}
  ids.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
  ids.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
  const card = page.getByTestId('robotics-creation-card')
  await card.getByLabel('Creation name').fill('Same-way buggy')
  await card.getByRole('button', { name: 'Not now' }).click()
  ids.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
  ids.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
  ids.leftWheel = await place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
  ids.pillar = await place({ partId: 'pillar_1x1', x: 33, y: 1, z: 32, color: GREY })
  ids.beam = await place({ partId: 'brick_1x6', x: 33, y: 10, z: 32, rotation: 1, color: GREY })
  ids.riser = await place({ partId: 'brick_1x1', x: 37, y: 7, z: 32, color: GREY })
  // The right motor hangs from the riser, turned like the left one (R twice): its socket faces in, toward the chassis.
  ids.rightMotor = await place({ partId: 'robo_motor', x: 37, y: 1, z: 31, rotation: 2, color: GREY })
  ids.rightAxle = await place({ partId: 'robo_axle_short', x: 35, y: 0, z: 32, color: GREY })
  ids.rightWheel = await place({ partId: 'robo_wheel', x: 34, y: 0, z: 31, color: '#1f2a33' })
  ids.sensor = await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
  await robo((state) => state.dismissWiringNote())
  await frameOn(Object.values(ids))
  if (await card.count()) await card.getByRole('button', { name: 'Not now' }).click()

  // Both motors face -X, so both are named for that side; the student renames the second one.
  const rightRowBefore = await rowText(ids.rightMotor)
  const picked = await clickPart(world(38.5, 7, 32.5), 'the outboard motor')
  const inspectorBefore = picked.selected === ids.rightMotor ? await inspectorText() : null
  if (picked.selected === ids.rightMotor) {
    await inspector.getByLabel('Device name').fill('Right motor')
    await inspector.getByLabel('Device name').press('Enter')
    await sleep(300)
    if ((await inspectorText()).state !== 'Port B') {
      const plug = inspector.getByRole('button', { name: /^Plug into port / })
      if (await plug.count()) { await plug.click(); await sleep(300) }
    }
  }
  const lines = await panelLines()
  const driveLine = lines.find((line) => line.includes('Drive:')) ?? null
  const rows = { left: await rowText(ids.leftMotor), right: await rowText(ids.rightMotor) }
  seen.F2d = { build: { rightRowBefore, inspectorBefore, driveLine, rows } }
  check('F2d.build.same-name', /^Left motor/.test(rightRowBefore ?? '') && inspectorBefore?.name === 'Left motor', `named from the way its socket faces, the outboard motor is also "Left motor" until renamed: "${rightRowBefore}"`)
  check('F2d.build.no-reversed', driveLine?.endsWith('Drive: Left motor + Right motor') && !/reversed/.test(driveLine) && rows.right?.includes('runs forward') && rows.left?.includes('runs forward'), `renamed and plugged in: "${driveLine}"; rows "${rows.left}" / "${rows.right}"`)
  await brick((state) => state.selectBrick(null))
  await shot('F2e-build-same-way-no-reversed')

  await openCode()
  await newProgram('Blank')
  const hat = (await blocks()).find((block) => block.type === 'robo_when_run')
  const runLeft = await dragFromPalette('Motion', 'robo_run_motor', hat.id)
  await typeNumber(runLeft, 'POWER', 40)
  const runRight = await dragFromPalette('Motion', 'robo_run_motor', runLeft)
  await pickOption(runRight, 'MOTOR', 'Right motor ·')
  await typeNumber(runRight, 'POWER', 40)
  const list = await blocks()
  const program = list.filter((block) => block.type === 'robo_run_motor').map((block) => `run ${block.labels[0]} at ${list.find((child) => child.parent === block.id)?.fields.NUM} %`)
  const start = await poseOf(ids.hub)
  await runProgram()
  await sleep(1500)
  const o = await observation()
  const end = await poseOf(ids.hub)
  const drive = (await chips()).Motors
  measured.F2d = { program, yawDegrees: Number(yawOf(end.rotation).toFixed(2)), forwardStuds: Number((-(end.position.z - start.position.z) / STUD).toFixed(2)), left: o.motors[ids.leftMotor], right: o.motors[ids.rightMotor], chip: drive }
  check('F2d.run.straight', Math.abs(yawOf(end.rotation)) < 3 && measured.F2d.forwardStuds > 2 && drive?.value === '40 · 40 %', `${program.join(' → ')}: it drives straight, ${measured.F2d.forwardStuds} studs in 1.5 s, yaw ${yawOf(end.rotation).toFixed(1)}°, chip ${drive?.value} (${drive?.detail})`)
  await shot('F2f-code-same-way-raw-blocks-straight')
  await resetStage()
  await back()
}

/* ================================================================ F3. Sensor pointed sideways */
async function failureSensorSideways() {
  console.log('\nF3. The sensor pointed sideways')
  const ids = await buildRover('Sideways buggy', { sensorSideways: true })
  const sensorRow = await rowText(ids.sensor)
  seen.F3 = { build: { sensorRow } }
  // The sensor sits behind the taller hub from this camera: select it from the hub's port list.
  const hubPick = await clickPart(world(31, 7, 29), 'the hub')
  assert.equal(hubPick.selected, ids.hub, 'the hub is selected by a click')
  const portButton = page.getByTestId('robotics-hub-inspector').getByRole('button', { name: /^Port C: .*sensor/ })
  const portLabel = await portButton.getAttribute('aria-label')
  await portButton.click()
  await sleep(250)
  const sensorInspector = (await selectedId()) === ids.sensor ? await inspectorText() : null
  seen.F3.build.hubPort = portLabel
  seen.F3.build.inspector = sensorInspector
  check('F3.build.row', /· faces (left|right) ·/.test(sensorRow ?? ''), `the panel's row says which way it faces: "${sensorRow}"`)
  check('F3.build.inspector', /^Distance sensor · faces (left|right)$/.test(sensorInspector?.sub ?? ''), `from the hub's list (${portLabel}), the inspector says "${sensorInspector?.sub}"`)
  await shot('F3a-build-sensor-faces-sideways')
  await brick((state) => state.selectBrick(null))
  await reloadStudio()
  check('F3.reload', (await rowText(ids.sensor)) === sensorRow, `after a save and cold reload: "${await rowText(ids.sensor)}"`)
  await frameOn(Object.values(ids))

  await openCode()
  const opened = { space: await spaceNow(), program: (await section()).programs.at(-1)?.name }
  const list = await blocks()
  const sees = list.find((block) => block.type === 'robo_sensor_sees')
  seen.F3.code = { opened, sensorBlock: sees?.labels }
  check('F3.code.starter', opened.space === 'testPlate' && opened.program === 'Stop before the wall' && sees?.fields.SENSOR === ids.sensor, `Code opens "${opened.program}" on the ${opened.space}; the sensor block reads "${sees?.labels.join(' ')}"`)
  const startZ = (await poseOf(ids.hub)).position.z
  await runProgram()
  let everHit = false
  let shotTaken = false
  let chipSeen = new Set()
  let beam = null
  let minWallGap = Infinity
  const trace = await sample(6, async (o) => {
    everHit ||= o.sensors[ids.sensor].hit
    beam = o.beams.find((candidate) => candidate.deviceId === ids.sensor) ?? beam
    const sensorChip = Object.entries(await chips()).find(([label]) => label.toLowerCase().includes('sensor'))
    if (sensorChip) chipSeen.add(sensorChip[1].value)
    if (!shotTaken && o.timeSeconds > 1.5) { shotTaken = true; await shot('F3b-code-beam-sideways-driving') }
  })
  const last = trace.at(-1)
  const endZ = (await poseOf(ids.hub)).position.z
  const wall = await stage((state) => state.stage.controller.props.find((prop) => prop.kind === 'wall'))
  // The wall stands 12 studs ahead of the rover's front edge (the plate's far edge, grid z = 26).
  const wallGapAtStart = wall ? (world(0, 0, 26).z - (wall.center.z + wall.size.z / 2)) / STUD : null
  const dx = beam ? beam.to.x - beam.from.x : 0
  const dz = beam ? beam.to.z - beam.from.z : 0
  const beamScreen = beam ? { from: await hook((h, p) => h.project(p), beam.from), to: await hook((h, p) => h.project(p), beam.to) } : null
  const drove = -(endZ - startZ) / STUD
  measured.F3 = {
    everHit, sensorChipValues: [...chipSeen], beam: beam && { dx: Number(dx.toFixed(2)), dz: Number(dz.toFixed(2)), lengthStuds: Number((Math.hypot(dx, dz) / STUD).toFixed(1)) },
    beamOnScreen: beamScreen && { from: [Math.round(beamScreen.from.x), Math.round(beamScreen.from.y)], to: [Math.round(beamScreen.to.x), Math.round(beamScreen.to.y)] },
    droveStuds: Number(drove.toFixed(2)), wallGapAtStartStuds: wallGapAtStart && Number(wallGapAtStart.toFixed(2)),
    motorsAtEnd: { left: last.motors[ids.leftMotor].powerPercent, right: last.motors[ids.rightMotor].powerPercent }, speedAtEnd: last.speed,
  }
  check('F3.run.never-sees', !everHit && [...chipSeen].every((value) => value === 'nothing seen'), `in 6 s the sensor never saw anything: its chip only ever read ${[...chipSeen].map((value) => `"${value}"`).join(', ')}`)
  check('F3.run.beam-sideways', beam && Math.abs(dx) > 20 * STUD && Math.abs(dz) < 0.5, `the beam the stage draws runs sideways: ${(Math.abs(dx) / STUD).toFixed(0)} studs across, ${(dz / STUD).toFixed(2)} studs forward${beamScreen ? `, on screen from (${Math.round(beamScreen.from.x)}, ${Math.round(beamScreen.from.y)}) to (${Math.round(beamScreen.to.x)}, ${Math.round(beamScreen.to.y)})` : ''}`)
  check('F3.run.never-stops', last.motors[ids.leftMotor].powerPercent === 40 && wallGapAtStart !== null && drove > wallGapAtStart - 0.5 && Math.abs(last.speed) < 0.3, `it never braked: it drove ${drove.toFixed(1)} studs to a wall that was ${wallGapAtStart?.toFixed(1)} studs ahead and sits against it, still commanding ${last.motors[ids.leftMotor].powerPercent} % (speed ${last.speed} st/s)`)
  const glowing = (await blocks()).filter((block) => last.activeBlockIds.includes(block.id)).map((block) => block.type)
  measured.F3.activeBlocks = glowing
  check('F3.run.waiting', glowing.includes('robo_wait_until') && !glowing.includes('robo_stop_motors'), `at the wall the glowing block is still "wait until ${sees?.labels[0]} sees something closer than 3 studs" (${glowing.join(', ')})`)
  await shot('F3c-code-at-the-wall-nothing-seen')
  await resetStage()
  await back()

  // Repair: select the sensor from the hub's list and turn it with R until it faces forward.
  await frameOn(Object.values(ids))
  await clickPart(world(31, 7, 29), 'the hub')
  await page.getByTestId('robotics-hub-inspector').getByRole('button', { name: /^Port C: .*sensor/ }).click()
  await sleep(200)
  for (let turn = 0; turn < 3; turn += 1) { await page.keyboard.press('r'); await sleep(150) }
  await sleep(300)
  const turned = await brick((state, id) => state.bricks.find((b) => b.id === id), ids.sensor)
  const repairedRow = await rowText(ids.sensor)
  measured.F3.repair = { rotation: turned.rotation, x: turned.x, z: turned.z, row: repairedRow }
  check('F3.repair.faces-forward', / faces forward /.test(` ${repairedRow} `), `turned with R: rotation ${turned.rotation} at ${turned.x},${turned.z}; the row reads "${repairedRow}"`)
  await page.keyboard.press('Escape')
  await brick((state) => state.selectBrick(null))
  await openCode()
  const relabelled = (await blocks()).find((block) => block.type === 'robo_sensor_sees')?.labels[0]
  await runProgram()
  await page.waitForFunction(() => { const o = window.__robotics.stageStore.getState().stageObservation; return o && o.timeSeconds > 1 && Math.abs(o.speedStudsPerSecond) < 0.02 }, null, { timeout: 15_000 }).catch(() => {})
  await sleep(500)
  const stopped = await observation()
  measured.F3.repairedStopStuds = stopped.sensors[ids.sensor].distanceStuds
  check('F3.repair.stops', stopped.sensors[ids.sensor].hit && stopped.sensors[ids.sensor].distanceStuds < 3.5 && stopped.sensors[ids.sensor].distanceStuds > 1, `the same program, now reading "${relabelled}", stops ${stopped.sensors[ids.sensor].distanceStuds} studs before the wall`)
  await shot('F3d-repaired-stops-before-wall')
  await resetStage()
  await back()
  return ids
}

/* ================================================================ F4. Arm built into the frame */
async function failureArmInFrame() {
  console.log('\nF4. The arm built into the frame')
  const ids = await buildGate('Stuck gate', { builtIntoFrame: true })
  const lines = await panelLines()
  const hingeRow = await rowText(ids.hinge)
  seen.F4 = { build: { lines, hingeRow } }
  check('F4.build.ready-line', lines.some((line) => line.includes("Arm motor's arm is built into the frame, so it can't swing")), `the creation's line: "${lines[1]}"`)
  check('F4.build.hinge-row', hingeRow?.includes("arm built into the frame, so it can't swing") && (await rowTone(ids.hinge)).includes('bad'), `the hinge motor's row (red): "${hingeRow}"`)
  const hubPick = await clickPart(world(22, 7, 26), 'the hub')
  assert.equal(hubPick.selected, ids.hub, 'the hub is selected by a click')
  await page.getByTestId('robotics-hub-inspector').getByRole('button', { name: /^Port A: Arm motor/ }).click()
  await sleep(300)
  const hingeInspector = (await selectedId()) === ids.hinge ? await inspectorText() : null
  seen.F4.build.inspector = hingeInspector
  check('F4.build.inspector', hingeInspector?.sub === 'Hinge motor · arm built into the frame', `the arm motor's inspector: "${hingeInspector?.sub}"`)
  await shot('F4a-build-arm-built-into-frame')
  await brick((state) => state.selectBrick(null))
  await reloadStudio()
  check('F4.reload', (await panelLines()).some((line) => line.includes("Arm motor's arm is built into the frame")), `after a save and cold reload: "${(await panelLines())[1]}"`)
  await frameOn(Object.values(ids))

  await openCode()
  const opened = { space: await spaceNow(), program: (await section()).programs.at(-1)?.name }
  const armChipBefore = (await chips())['Arm motor']
  seen.F4.code = { opened, armChipBefore }
  check('F4.code.opens', opened.space === 'myWorld' && opened.program === 'Smart gate', `Code opens "${opened.program}" in ${opened.space}`)
  check('F4.code.chip-before-run', armChipBefore?.detail === 'built into the frame · can’t swing' && armChipBefore.tone === 'bad', `before Run the arm chip already says: ${armChipBefore?.value} (${armChipBefore?.detail})`)
  await runProgram()
  await sleep(300)
  await page.getByTestId('robo-visitor').click()
  let maxAngle = 0
  let sawTarget = false
  let contacts = []
  let shotTaken = false
  await sample(5, async (o) => {
    maxAngle = Math.max(maxAngle, Math.abs(o.motors[ids.hinge].positionDegrees))
    if (o.contacts.length) contacts = o.contacts
    if (o.diagnostics.some((d) => d.code === 'device.locked')) sawTarget = true
    if (!shotTaken && sawTarget && o.contacts.length) { await sleep(300); shotTaken = true; await shot('F4b-code-contact-highlighted-arm-stuck') }
  }, 150)
  const last = await observation()
  const armChip = (await chips())['Arm motor']
  const list = await blocks()
  const openBlock = list.find((block) => block.id === 'smart-gate:open')
  const doorPose = await poseOf(ids.door)
  const listed = await problems()
  const contactBricks = [...new Set(contacts.flatMap((contact) => [contact.brickId, contact.otherBrickId]).filter(Boolean))]
  const contactNames = contactBricks.map((id) => Object.entries(ids).find(([, value]) => value === id)?.[0] ?? id)
  measured.F4 = { maxArmDegrees: maxAngle, doorYaw: Number(yawOf(doorPose.rotation).toFixed(3)), armChip, contacts: contactNames, blockWarning: openBlock?.warning, problems: listed, diagnostics: last.diagnostics }
  check('F4.run.arm-stuck', maxAngle < 0.5 && Math.abs(yawOf(doorPose.rotation)) < 0.1, `the visitor walked into the beam, "turn Arm motor to 90°" ran, and the arm stayed at ${maxAngle.toFixed(2)}° (door yaw ${yawOf(doorPose.rotation).toFixed(2)}°)`)
  check('F4.run.chip', armChip?.value === '0°' && armChip.detail === 'built into the frame · can’t swing' && armChip.tone === 'bad', `the arm chip: ${armChip?.value} (${armChip?.detail}), red`)
  check('F4.run.contact', contactNames.includes('door') && contactNames.some((name) => name.startsWith('bridge')), `the stage highlights the contact: ${contactNames.join(' ↔ ')}`)
  check('F4.run.block-says', openBlock?.warning === "Arm motor's arm is built into the frame, so it can't swing" && openBlock.outline === 'robo-diag-warning' && listed.some((line) => line.includes('built into the frame')), `the "turn … to 90°" block's warning: "${openBlock?.warning}" (outline ${openBlock?.outline}); problems: ${listed.join(' | ')}`)
  if (!shotTaken) await shot('F4b-code-contact-highlighted-arm-stuck')
  await resetStage()
  await back()

  // Repair: delete the two bricks under the door; the gate swings.
  for (const id of [ids.bridge2, ids.bridge1]) {
    await brick((state, brickId) => state.selectBrick(brickId), id)
    await page.keyboard.press('Delete')
    await sleep(300)
  }
  const after = await panelLines()
  check('F4.repair.line', after.some((line) => line.includes('Fixed side on the frame, moving side on the arm')), `with the two bricks deleted: "${after[1]}"`)
  await openCode()
  await runProgram()
  await sleep(300)
  await page.getByTestId('robo-visitor').click()
  let opened90 = 0
  await sample(4, (o) => { opened90 = Math.max(opened90, o.motors[ids.hinge].positionDegrees) }, 150)
  measured.F4.repairedMaxDegrees = opened90
  check('F4.repair.swings', opened90 > 85, `the door now swings to ${opened90.toFixed(1)}°`)
  await resetStage()
  await back()
  return ids
}

/* ================================================================ F5. Motor unplugged */
async function failureUnplugged(roverIds) {
  console.log('\nF5. A motor unplugged')
  // The F2 rover (both of its programs) when it is still the open build; otherwise a fresh one.
  let ids = roverIds
  if (!ids || (await section())?.creations[0]?.name !== 'Mirror buggy') {
    ids = await buildRover('Mirror buggy')
    await openCode()
    await newProgram('Blank')
    const hat = (await blocks()).find((block) => block.type === 'robo_when_run')
    const runLeft = await dragFromPalette('Motion', 'robo_run_motor', hat.id)
    await typeNumber(runLeft, 'POWER', 40)
    const runRight = await dragFromPalette('Motion', 'robo_run_motor', runLeft)
    await pickOption(runRight, 'MOTOR', 'Right motor · B')
    await typeNumber(runRight, 'POWER', -40)
    await back()
  }
  await frameOn(Object.values(ids))
  const picked = await clickPart(world(29.5, 7, 32.5), 'the left motor')
  assert.equal(picked.selected, ids.leftMotor, 'the left motor is selected by a click')
  await inspector.getByRole('button', { name: 'Unplug', exact: true }).click()
  await sleep(300)
  const unplugged = await inspectorText()
  const drawn = await hook((h) => h.cables())
  const leftRow = await rowText(ids.leftMotor)
  const toastText = await toast()
  const connections = (await section()).connections
  seen.F5 = { build: { inspector: unplugged, leftRow, toast: toastText, drawn: { cables: drawn.cables.map((c) => `${c.deviceId}→${c.port}`), stubs: drawn.stubs.map((s) => s.deviceId) } } }
  check('F5.build.document', !connections.some((c) => c.deviceId === ids.leftMotor), `the left motor has no cable in the document (${connections.map((c) => c.port).join(', ')} still used)`)
  check('F5.build.inspector', unplugged.state === 'Unplugged' && unplugged.reading === 'No power' && unplugged.block.includes('Not plugged in') && unplugged.hint === 'Nothing turns until a cable reaches a port.', `inspector: ${unplugged.state} · ${unplugged.reading} · block "${unplugged.block}" · "${unplugged.hint}"`)
  check('F5.build.loose-end', drawn.stubs.some((stub) => stub.deviceId === ids.leftMotor) && !drawn.cables.some((c) => c.deviceId === ids.leftMotor), 'the scene draws a loose cable end with a red plug on the left motor and no cable to the hub')
  check('F5.build.row', leftRow?.includes('Not plugged in') && (await rowTone(ids.leftMotor)).includes('warn'), `the panel's row: "${leftRow}"`)
  check('F5.build.toast', toastText === 'Left motor is unplugged. Blocks that use it show “Not plugged in”.', `the studio says: "${toastText}"`)
  await shot('F5a-build-left-motor-unplugged')

  await reloadStudio()
  const reloaded = (await section()).connections
  check('F5.reload', !reloaded.some((c) => c.deviceId === ids.leftMotor) && reloaded.length === 2, `after a save and cold reload the left motor is still unplugged (${reloaded.map((c) => c.port).join(', ')} used)`)
  await frameOn(Object.values(ids))
  await clickPart(world(29.5, 7, 32.5), 'the left motor')
  await brick((state) => state.selectBrick(null))

  await openCode()
  // The active program is the raw one (F2 left it there, or this section wrote it).
  let tabs = await page.getByRole('tab').allTextContents()
  if (await page.getByRole('tab', { name: 'My program' }).count()) await page.getByRole('tab', { name: 'My program' }).click()
  await sleep(700)
  let list = await blocks()
  const rawLeft = list.find((block) => block.type === 'robo_run_motor' && block.fields.MOTOR === ids.leftMotor)
  const rawRight = list.find((block) => block.type === 'robo_run_motor' && block.fields.MOTOR === ids.rightMotor)
  let listed = await problems()
  seen.F5.code = { tabs, raw: { left: rawLeft && { labels: rawLeft.labels, warning: rawLeft.warning, outline: rawLeft.outline }, right: rawRight && { labels: rawRight.labels, warning: rawRight.warning } }, problems: listed }
  check('F5.code.raw-block', rawLeft?.labels[0] === 'Left motor · not plugged in' && rawLeft.warning === 'Left motor is not plugged in' && rawLeft.outline === 'robo-diag-warning', `"run ${rawLeft?.labels[0]} …": warning "${rawLeft?.warning}", amber outline`)
  check('F5.code.other-block-clean', rawRight?.labels[0] === 'Right motor · B' && !rawRight.warning, `"run ${rawRight?.labels[0]} …" has no warning`)
  check('F5.code.problems', listed.some((line) => line.includes('Heads up') && line.includes('Left motor is not plugged in')), `problems: ${listed.join(' | ')}`)
  const driveChipBefore = (await chips()).Motors
  check('F5.code.chip', driveChipBefore?.value === 'Left motor not plugged in' && driveChipBefore.tone === 'warn', `the stage's Motors chip before Run: ${driveChipBefore?.value}`)
  await shot('F5b-code-block-not-plugged-in')

  // Run: the left motor does nothing, the right one still runs.
  const before = await poseOf(ids.hub)
  await runProgram()
  let shotTaken = false
  const trace = await sample(2.5, async (o) => { if (!shotTaken && o.timeSeconds > 1.2) { shotTaken = true; await shot('F5c-run-left-does-nothing-right-runs') } })
  const last = trace.at(-1)
  const after = await poseOf(ids.hub)
  const runChips = await chips()
  measured.F5 = {
    raw: { left: last.motors[ids.leftMotor], right: last.motors[ids.rightMotor], chassisYawDegrees: Number(yawOf(after.rotation).toFixed(1)), chassisMovedStuds: Number((Math.hypot(after.position.x - before.position.x, after.position.z - before.position.z) / STUD).toFixed(2)), chips: runChips },
  }
  check('F5.run.left-does-nothing', last.motors[ids.leftMotor].powerPercent === 0 && Math.abs(last.motors[ids.leftMotor].speedPercent) < 10 && last.motors[ids.leftMotor].plugged === false, `the left motor ignores "run … at 40 %": power ${last.motors[ids.leftMotor].powerPercent} %, and it only coasts at ${last.motors[ids.leftMotor].speedPercent} % as the rover drags its wheel round`)
  check('F5.run.right-runs', Math.abs(last.motors[ids.rightMotor].powerPercent) === 40 && Math.abs(last.motors[ids.rightMotor].speedPercent) > 20, `the right motor still runs: power ${last.motors[ids.rightMotor].powerPercent} %, speed ${last.motors[ids.rightMotor].speedPercent} %`)
  check('F5.run.creation-moves-one-side', Math.abs(yawOf(after.rotation)) > 10, `driven by one side only, the rover swung ${yawOf(after.rotation).toFixed(0)}° about its dead wheel`)
  check('F5.run.chip-shows-other', runChips.Motors && runChips.Motors.value === 'Left motor not plugged in' && /^Right motor speed −?[1-9]\d* %$/.test(runChips.Motors.detail ?? ''), `while it runs the Motors chip: ${runChips.Motors?.value} (${runChips.Motors?.detail})`)
  await resetStage()

  // The starter's "drive forward" names the unplugged motor through the drive pair.
  if (await page.getByRole('tab', { name: 'Stop before the wall' }).count()) {
    await page.getByRole('tab', { name: 'Stop before the wall' }).click()
    await sleep(700)
    list = await blocks()
    const driveBlock = list.find((block) => block.type === 'robo_drive')
    seen.F5.code.driveBlock = { warning: driveBlock?.warning, outline: driveBlock?.outline }
    check('F5.code.helper-block', driveBlock?.warning === 'Left motor is not plugged in' && driveBlock.outline === 'robo-diag-warning', `"drive forward at 40 %" also says: "${driveBlock?.warning}"`)
  }
  await back()

  // Repair: plug it back into port A from the inspector.
  await frameOn(Object.values(ids))
  await clickPart(world(29.5, 7, 32.5), 'the left motor')
  await inspector.getByRole('button', { name: 'Plug into port A' }).click()
  await sleep(300)
  const replugged = await inspectorText()
  check('F5.repair', replugged.state === 'Port A' && !(await hook((h) => h.cables())).stubs.length, `"Plug into port A": ${replugged.state}, no loose ends`)
  await page.keyboard.press('Escape')
}

/* ================================================================ run */
let roverIds = null
if (want(1)) await failureWheelOff()
if (want(2)) roverIds = await failureReversed()
if (want(5)) await failureUnplugged(roverIds)
if (want(3)) await failureSensorSideways()
if (want(4)) await failureArmInFrame()
if (want(2)) await failureReversedOtherWay()

check('console-clean', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : 'no console errors')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768', at: new Date().toISOString(), only: only ? [...only] : 'all', shots, measured, seen, results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
