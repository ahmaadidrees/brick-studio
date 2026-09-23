/**
 * Robot Workshop spike, checkpoint 2, lane U: the Code view, driven by a real pointer and keyboard.
 *
 * Real Chrome through Playwright against the robotics dev server
 * (`npx vite --mode robotics --port 5244 --strictPort --host 127.0.0.1`). The rover, the gate and
 * the signal post are built from loose parts with the studio's own placement actions exactly as
 * robotics-spike-cp1.mjs does (choosePart → rotate → setDraftPosition → placeDraft, so assisted
 * wiring and the creation card run as they do on a click; pointer placement is proven by
 * robotics-spike-cp1-pointer.mjs). Everything after that is a student's input: clicks on the card,
 * the panel's Code button, the tabs, the + menu, Run / Stop / Reset, the Test plate / My world
 * switch, "Someone walks up", Back to build; a click on a number field and typed digits; a drag of a
 * block out of the palette; Delete and ⌘Z inside the workspace; the on-screen joystick dragged with
 * the mouse; the arrow keys. Parts in the canvas are clicked where the studio's own projection
 * (`window.__robotics.project`, dev only) says they are; blocks where Blockly says they are
 * (`window.__robotics.codeWorkspace`, dev only). After each step the harness reads back the
 * document, the stage's observation (`window.__robotics.stageStore`) and what the page shows.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp2-code.mjs
 *
 * Part 1 takes the screenshot set at 1366×768 and 1024×768; part 2 runs the journeys at 1366×768.
 * Writes PNGs, results.json and nothing else under docs/qa/robotics-cp2/code/.
 *
 * Kid-UX pass (docs/robotics/KID-UX.md §G): the card is named in its "Robot name" field and closed
 * with Keep building; Code is always the robot panel's button (the card no longer has one).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5244', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-cp2/code')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const measured = {}
const consoleErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const STUD = 0.62
const PLATE = 0.18
const GREY = '#52636c'
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })

/** One page at one viewport, with the store and Blockly helpers bound to it. */
async function openStudio(width, height) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${width}: ${message.text()}`) })
  page.on('pageerror', (error) => consoleErrors.push(`${width}: ${String(error)}`))
  page.on('response', (response) => { if (response.url().includes('blockly-media')) consoleErrors.push(`${width}: fetched ${response.url()}`) })
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`)
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.project), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  const sleep = (ms) => page.waitForTimeout(ms)
  const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(target === 'hook' ? window.__robotics : window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
  const s = {
    page, context, width, height, sleep,
    brick: run('brickStore'), robo: run('roboticsStore'), stage: run('stageStore'), hook: run('hook'),
    async shot(name) { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); console.log(`  shot ${file}`); return file },
  }
  s.place = async ({ partId, x, y, z, rotation = 0, color }) => {
    const ok = await s.brick((state, p) => {
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
    return s.brick((state) => state.bricks[state.bricks.length - 1].id)
  }
  s.section = () => s.brick((state) => JSON.parse(JSON.stringify(state.documentMetadata.robotics ?? null)))
  s.bricks = () => s.brick((state) => JSON.parse(JSON.stringify(state.bricks)))
  s.observation = () => s.stage((state) => {
    const o = state.stageObservation
    return o && { phase: o.phase, timeSeconds: o.timeSeconds, sensors: o.sensors, motors: o.motors, lights: o.lights, speed: o.speedStudsPerSecond, contacts: o.contacts.length, visitorPhase: o.visitorPhase ?? null, activeBlockIds: o.activeBlockIds, diagnostics: o.diagnostics.map((d) => d.message) }
  })
  s.text = async (testId) => (await page.getByTestId(testId).textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  s.readings = () => page.locator('[data-testid=robo-readings] .robo-read').evaluateAll((chips) => Object.fromEntries(chips.map((chip) => [chip.querySelector('small').textContent, chip.querySelector('strong').textContent + (chip.querySelector('span:not(.robo-swatch)') ? ` (${chip.querySelector('span:not(.robo-swatch)').textContent})` : '')])))
  /** A Blockly element's screen rect: a block, or one of its fields; `flyout` looks in the open palette. */
  s.blockRect = (query) => s.hook((hook, q) => {
    const workspace = hook.codeWorkspace()
    const target = q.flyout ? workspace.getToolbox().getFlyout().getWorkspace() : workspace
    const block = q.id ? target.getBlockById(q.id) : target.getTopBlocks(true).find((candidate) => candidate.type === q.type)
    if (!block) return null
    const element = q.field ? block.getField(q.field).getSvgRoot() : block.getSvgRoot().querySelector('.blocklyPath')
    const rect = element.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, id: block.id }
  }, query)
  s.workspaceJson = () => s.hook((hook) => {
    const workspace = hook.codeWorkspace()
    const walk = (block) => ({ type: block.type, id: block.id, fields: Object.fromEntries(block.inputList.flatMap((input) => input.fieldRow).filter((field) => field.name).map((field) => [field.name, String(field.getValue())])), text: block.inputList.flatMap((input) => input.fieldRow).filter((field) => field.name).map((field) => field.getText()) })
    return workspace.getAllBlocks(true).map(walk)
  })
  s.clickPart = async (point, label) => {
    const at = await s.hook((hook, p) => hook.project(p), point)
    assert(at.inFront, `${label} is behind the camera`)
    await page.mouse.move(at.x, at.y, { steps: 4 })
    await page.mouse.click(at.x, at.y)
    await sleep(250)
    return { at, selected: await s.brick((state) => state.selectedId) }
  }
  s.waitStage = async () => {
    await page.waitForFunction(() => { const s = window.__robotics.stageStore.getState(); return s.stage !== null && !s.stageLoading }, null, { timeout: 30_000 })
    await sleep(300)
  }
  s.openCodeFromPanel = async () => {
    // Let a studio message from Build ("Left motor is unplugged…") finish first, so it does not sit over the stage in a shot.
    await page.waitForSelector('.brick-toast', { state: 'detached', timeout: 6000 }).catch(() => {})
    await page.getByTestId('robotics-code-button').click()
    await page.waitForSelector('.robo-code-blockly .blocklySvg', { timeout: 30_000 })
    await s.waitStage()
    await sleep(700)
  }
  s.back = async () => {
    await page.getByTestId('robo-back').click()
    await page.waitForSelector('[data-testid=robo-code]', { state: 'detached' })
    await sleep(300)
  }
  return s
}

/** The rover from loose parts; the card is named and closed with "Keep building". */
async function buildRover(s, { name = 'Mars buggy' } = {}) {
  await s.stage((state) => state.closeStage())
  await s.brick((state) => state.newBuild())
  await s.sleep(150)
  const ids = {}
  ids.plate = await s.place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
  ids.hub = await s.place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
  const card = s.page.getByTestId('robotics-creation-card')
  await card.getByLabel('Robot name').fill(name)
  await card.getByRole('button', { name: 'Keep building' }).click()
  ids.leftMotor = await s.place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
  ids.rightMotor = await s.place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0, color: GREY })
  ids.leftAxle = await s.place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
  ids.rightAxle = await s.place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
  ids.leftWheel = await s.place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
  ids.rightWheel = await s.place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
  ids.sensor = await s.place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
  await s.robo((state) => state.dismissWiringNote())
  await s.robo((state, list) => state.requestFrame(list), Object.values(ids))
  await s.sleep(500)
  return ids
}

const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
/** Bricks (ids, parts, positions, rotations, colours), cables, device names and creations, compared with sorted keys. */
const snapshotConstruction = async (s) => {
  const section = await s.section()
  return JSON.stringify(sortKeys({ bricks: await s.bricks(), connections: section?.connections ?? [], devices: section?.devices ?? {}, creations: (section?.creations ?? []).map((creation) => ({ id: creation.id, name: creation.name, anchorBrickIds: creation.anchorBrickIds, testSpace: creation.testSpace ?? null })) }))
}

/* ================================================================ part 1: the screenshot set */
async function screenSet(width, height) {
  console.log(`\nScreens at ${width}×${height}`)
  const s = await openStudio(width, height)
  const tag = `${width}`
  const ids = await buildRover(s)
  await s.openCodeFromPanel()
  const first = await s.workspaceJson()
  check(`screens.${tag}.first-run`, first.filter((block) => block.type.startsWith('robo_when')).length === 1 && (await s.text('robo-goal')).startsWith('Try it: change 3 to 6') && await s.page.locator('.blocklyToolboxSelected').count() === 0, 'the rover opens on "Stop before the wall": one script, palette collapsed, goal line shown')
  await s.shot(`A1-first-run-${tag}`)
  await s.page.getByRole('button', { name: 'New program' }).click()
  await s.sleep(250)
  await s.shot(`A2-starters-menu-${tag}`)
  await s.page.getByTestId('robo-starters-menu').getByText('Joystick drive', { exact: true }).click()
  await s.sleep(600)
  check(`screens.${tag}.second-tab`, (await s.page.getByRole('tab').allTextContents()).join(' | ') === 'Stop before the wall | Joystick drive', 'a second program tab, "Joystick drive", is open')
  await s.shot(`A3-second-program-${tag}`)
  await s.page.getByRole('tab', { name: 'Stop before the wall' }).click()
  await s.sleep(400)
  await s.back()
  // Break the chain twice, the way a student would: unplug the left motor, delete the sensor.
  await s.robo((state, list) => state.requestFrame(list), Object.values(ids))
  await s.sleep(600)
  let picked = await s.clickPart(world(29.5, 7, 32.5), 'the left motor')
  assert.equal(picked.selected, ids.leftMotor, 'the left motor is selected by a click')
  // Lane P: a part's card is simple first; Unplug and the hub's port list are behind its own More.
  await s.page.getByTestId('robotics-device-inspector').getByRole('button', { name: /^More about / }).click()
  await s.page.getByTestId('robotics-device-inspector').getByRole('button', { name: 'Unplug', exact: true }).click()
  await s.sleep(200)
  // The sensor sits in front of the taller hub: pick it from the hub's port list, as lane W's harness does.
  picked = await s.clickPart(world(31, 7, 29), 'the hub')
  assert.equal(picked.selected, ids.hub, 'the hub is selected by a click')
  await s.page.getByTestId('robotics-hub-inspector').getByRole('button', { name: /^More about / }).click()
  await s.page.getByTestId('robotics-hub-inspector').getByRole('button', { name: 'Port C: Front sensor. Select Front sensor' }).click()
  await s.sleep(200)
  assert.equal(await s.brick((state) => state.selectedId), ids.sensor, 'the port list selects the sensor')
  await s.page.keyboard.press('Delete')
  await s.sleep(300)
  await s.openCodeFromPanel()
  const problems = await s.text('robo-problems')
  check(`screens.${tag}.diagnostics`, problems.includes('Front sensor is missing') && problems.includes('Left motor is not plugged in'), `problems: ${problems}`)
  await s.page.getByTestId('robo-run').click()
  await s.sleep(400)
  const blocked = await s.text('robo-run-blocked')
  check(`screens.${tag}.run-blocked`, blocked === 'Can’t run yet: Front sensor is missing' && (await s.observation()).phase === 'ready', blocked)
  await s.shot(`A4-diagnostics-${tag}`)
  await s.context.close()
}

// SKIP_SCREENS=1 runs the journeys alone (while iterating); the evidence run takes both parts.
if (!process.env.SKIP_SCREENS) {
  await screenSet(1366, 768)
  await screenSet(1024, 768)
}

/* ================================================================ part 2: the journeys at 1366×768 */
const s = await openStudio(1366, 768)
const { page, sleep } = s

console.log('\nR1. Rover: first run')
const rover = await buildRover(s)
const builtRover = await snapshotConstruction(s)
await s.openCodeFromPanel()
let section = await s.section()
check('R1.default-starter', section.programs?.length === 1 && section.programs[0].name === 'Stop before the wall' && section.programs[0].revision === 0 && section.creations[0].activeProgramId === section.programs[0].id, 'Code created "Stop before the wall" (revision 0) and made it the active program')
check('R1.first-run-state', await page.locator('.blocklyToolboxSelected').count() === 0 && !(await page.locator('.blocklyFlyout').first().isVisible()) && await page.locator('.blocklyToolboxCategory').count() === 9 && (await s.workspaceJson()).filter((block) => block.type.startsWith('robo_when')).length === 1, 'palette collapsed (no category open, flyout hidden), the nine-category rail visible, one script')
check('R1.test-plate', (await page.getByRole('button', { name: 'Test plate' }).getAttribute('aria-pressed')) === 'true' && (await s.stage((state) => state.stage.space)) === 'testPlate' && (await s.stage((state) => state.stage.controller.props.map((prop) => prop.kind).join()))  === 'wall', 'the rover opens on the test plate, with its wall')
check('R1.goal', (await s.text('robo-goal')) === 'Try it: change 3 to 6. Does it stop earlier or later?', `goal line: ${await s.text('robo-goal')}`)
const insets = await s.hook((hook) => hook.insets())
check('R1.framed-into-stage', insets.left > 700 && insets.top > 0, `the framing counts the Code view: canvas insets left ${Math.round(insets.left)} px, top ${Math.round(insets.top)} px, bottom ${Math.round(insets.bottom)} px`)
check('R1.studio-hidden', await page.locator('.part-library').count() === 0 || !(await page.locator('.part-library').isVisible()), 'the brick drawer, creation panel and command strip are out of the way')
await s.shot('C1-rover-first-run')

console.log('\nR2. Run: it drives and stops before the wall')
await page.getByTestId('robo-run').click()
const trace = []
const started = Date.now()
let stopped = null
while (Date.now() - started < 15_000) {
  const o = await s.observation()
  trace.push({ t: o.timeSeconds, d: o.sensors[rover.sensor].distanceStuds, speed: o.speed })
  if (o.timeSeconds > 1 && Math.abs(o.speed) < 0.02 && o.sensors[rover.sensor].distanceStuds < 6) { stopped = o; break }
  if (trace.length === 5) await s.shot('C2-rover-running')
  await sleep(250)
}
assert(stopped, 'the rover never came to rest')
await sleep(600)
stopped = await s.observation()
const chips = await s.readings()
const minDistance = Math.min(...trace.map((entry) => entry.d))
measured.roverFirstRun = { stoppedAtStuds: stopped.sensors[rover.sensor].distanceStuds, minimumStuds: minDistance, trace: trace.map((entry) => `${entry.t.toFixed(2)}s:${entry.d.toFixed(2)}`) }
check('R2.drives', trace.some((entry) => entry.speed > 2), `top speed ${Math.max(...trace.map((entry) => entry.speed)).toFixed(2)} studs/s`)
check('R2.stops-before-wall', stopped.sensors[rover.sensor].hit && stopped.sensors[rover.sensor].distanceStuds > 1.5 && stopped.sensors[rover.sensor].distanceStuds < 3 && minDistance > 1.5, `the sensor read ${stopped.sensors[rover.sensor].distanceStuds.toFixed(2)} studs at rest (never under ${minDistance.toFixed(2)}): it never touched the wall`)
// Kid lane Y: the sensor chip says how far in steps (a stud is a step), whole numbers without a decimal, and "sees something" under it inside 5.
const steps = (studs) => { const whole = Math.round(studs); const text = Math.abs(studs - whole) < 0.05 ? String(whole) : studs.toFixed(1); return `${text} ${text === '1' ? 'step' : 'steps'} away` }
check('R2.readings-are-the-blocks-values', chips['Front sensor'] === `${steps(stopped.sensors[rover.sensor].distanceStuds)} (sees something)` && chips.Speed === `${stopped.speed.toFixed(1)} st/s`, `stage chips ${JSON.stringify(chips)} match the observation the blocks read`)
// The program ended with `stop motors`: the stage says it is done, not still running.
check('R2.status', (await s.text('robo-status')).startsWith('Done ·'), `status: ${await s.text('robo-status')}`)
await s.shot('C3-rover-stopped-before-wall')

console.log('\nR3. Reset')
await page.getByTestId('robo-reset').click()
await sleep(500)
const afterReset = await s.observation()
const poses = await s.stage((state) => [...state.stage.controller.poses().values()].map((pose) => [pose.position.x, pose.position.z]))
const drift = Math.max(...poses.map(([x, z]) => Math.hypot(x, z)))
check('R3.reset', afterReset.phase === 'ready' && drift < 0.01 && Math.abs(afterReset.sensors[rover.sensor].distanceStuds - 12) < 0.2 && (await s.text('robo-status')) === 'Ready', `Reset: every body within ${drift.toFixed(4)} of its built pose, program stopped, sensor ${afterReset.sensors[rover.sensor].distanceStuds} studs, status "${await s.text('robo-status')}"`)
await s.shot('C4-rover-reset')

console.log('\nR4. Edit the 3 to 6 while it runs')
await page.getByTestId('robo-run').click()
await sleep(500)
const three = await s.blockRect({ id: 'stop-before-wall:studs', field: 'NUM' })
await page.mouse.click(three.x + three.width / 2, three.y + three.height / 2)
await sleep(250)
await page.keyboard.press('Meta+A').catch(() => {})
await page.keyboard.type('6')
await page.keyboard.press('Enter')
await sleep(700)
section = await s.section()
const edited = section.programs[0]
check('R4.saved', JSON.stringify(edited.workspace).includes('"NUM":6') && edited.revision === 1, `typed 6 into the field: saved as revision ${edited.revision}`)
check('R4.changed-line', (await s.text('robo-changed')) === 'Your code changed. Press Run to try it.' && (await s.observation()).phase === 'running', `while it runs: "${await s.text('robo-changed')}"`)
await s.shot('C5-changed-while-running')
await page.waitForFunction((sensor) => { const o = window.__robotics.stageStore.getState().stageObservation; return o && o.timeSeconds > 1 && Math.abs(o.speedStudsPerSecond) < 0.02 }, rover.sensor, { timeout: 15_000 })
await sleep(500)
const oldRevisionStop = (await s.observation()).sensors[rover.sensor].distanceStuds
check('R4.run-keeps-its-revision', oldRevisionStop < 3, `the run that started with 3 still braked at 3: rests ${oldRevisionStop.toFixed(2)} studs from the wall`)
await page.getByTestId('robo-reset').click()
await sleep(400)
await page.getByTestId('robo-run').click()
await page.waitForFunction(() => { const o = window.__robotics.stageStore.getState().stageObservation; return o && o.timeSeconds > 1 && Math.abs(o.speedStudsPerSecond) < 0.02 }, null, { timeout: 15_000 })
await sleep(500)
const earlier = (await s.observation()).sensors[rover.sensor].distanceStuds
measured.stopsEarlier = { with3: oldRevisionStop, with6: earlier }
check('R4.stops-earlier', earlier > 4.5 && earlier < 6 && earlier > oldRevisionStop + 2, `with 6 it rests ${earlier.toFixed(2)} studs from the wall (with 3: ${oldRevisionStop.toFixed(2)})`)
check('R4.no-changed-line', await page.getByTestId('robo-changed').count() === 0, 'the new run uses the saved program: no "Changed" line')
await s.shot('C6-stops-earlier')

console.log('\nR4b. A block from the palette; Delete and ⌘Z inside the workspace')
await page.locator('.blocklyToolboxCategory', { hasText: 'Motion' }).click()
await sleep(500)
const source = await s.blockRect({ flyout: true, type: 'robo_stop_motor' })
const stopMotors = await s.blockRect({ id: 'stop-before-wall:stop' })
await page.mouse.move(source.x + 12, source.y + 14)
await page.mouse.down()
await page.mouse.move(source.x + 60, source.y + 30, { steps: 6 })
await page.mouse.move(stopMotors.x + 14, stopMotors.y + stopMotors.height + 16, { steps: 14 })
await page.mouse.up()
await sleep(700)
let blocks = await s.workspaceJson()
const added = blocks.find((block) => block.type === 'robo_stop_motor')
check('R4b.dragged-in', added && added.fields.MOTOR === rover.leftMotor && added.text[0] === 'Left motor · A', `dragged "stop Left motor · A" out of the palette: ${added ? `${added.text[0]} (value ${added.fields.MOTOR})` : 'nothing'}`)
const chained = await s.hook((hook) => hook.codeWorkspace().getBlockById('stop-before-wall:stop').getNextBlock()?.type ?? null)
check('R4b.snapped', chained === 'robo_stop_motor', `it snapped under "stop motors" (${chained})`)
const undoBefore = await s.brick((state) => state.undoStack.length)
const bricksBefore = JSON.stringify(await s.bricks())
const addedRect = await s.blockRect({ id: added.id })
await page.mouse.click(addedRect.x + 10, addedRect.y + addedRect.height / 2)
await sleep(200)
await page.keyboard.press('Delete')
await sleep(700)
const afterDelete = (await s.workspaceJson()).some((block) => block.type === 'robo_stop_motor')
await page.keyboard.press('Meta+z')
await sleep(700)
blocks = await s.workspaceJson()
section = await s.section()
check('R4b.blockly-keys', !afterDelete && blocks.some((block) => block.type === 'robo_stop_motor') && JSON.stringify(section.programs[0].workspace).includes('robo_stop_motor'), 'Delete removed the block and ⌘Z brought it back (Blockly’s own undo), both saved')
check('R4b.studio-untouched', (await s.brick((state) => state.undoStack.length)) === undoBefore && JSON.stringify(await s.bricks()) === bricksBefore, 'the studio saw neither key: no brick deleted, nothing on its Undo stack')

console.log('\nR5. Back to build: move the left motor to port C with the inspector')
await s.back()
check('R5.construction-unchanged', (await snapshotConstruction(s)) === builtRover && (await s.stage((state) => state.stage)) === null, 'back in Build: bricks, cables and creation exactly as built; the stage is closed')
await s.robo((state, list) => state.requestFrame(list), Object.values(rover))
await sleep(600)
const pickedMotor = await s.clickPart(world(29.5, 7, 32.5), 'the left motor')
check('R5.select-motor', pickedMotor.selected === rover.leftMotor, `clicking the left motor at (${pickedMotor.at.x.toFixed(0)}, ${pickedMotor.at.y.toFixed(0)}) selects it`)
const inspector = page.getByTestId('robotics-device-inspector')
await inspector.getByRole('button', { name: /^More about / }).click()
await inspector.locator('button.wiring-port[data-port="C"]').click()
await sleep(300)
section = await s.section()
const portOf = (id) => section.connections.find((connection) => connection.deviceId === id)?.port
check('R5.port-C', portOf(rover.leftMotor) === 'C' && portOf(rover.sensor) === 'A', `left motor on ${portOf(rover.leftMotor)}, front sensor swapped to ${portOf(rover.sensor)}`)
const rewired = await snapshotConstruction(s)
await s.shot('C7-build-left-motor-port-C')

console.log('\nR6. Back to Code: the block says "· C" and the rover still stops')
await s.openCodeFromPanel()
blocks = await s.workspaceJson()
const motorBlock = blocks.find((block) => block.type === 'robo_stop_motor')
const sensorBlock = blocks.find((block) => block.type === 'robo_sensor_sees')
check('R6.label-C', motorBlock.text[0] === 'Left motor · C' && sensorBlock.text[0] === 'Front sensor · A', `the blocks read "${motorBlock.text[0]}" and "${sensorBlock.text[0]}"`)
await s.shot('C8-code-block-shows-C')
await page.getByTestId('robo-run').click()
await page.waitForFunction(() => { const o = window.__robotics.stageStore.getState().stageObservation; return o && o.timeSeconds > 1 && Math.abs(o.speedStudsPerSecond) < 0.02 }, null, { timeout: 15_000 })
await sleep(500)
const rewiredStop = await s.observation()
check('R6.still-runs', rewiredStop.sensors[rover.sensor].hit && rewiredStop.sensors[rover.sensor].distanceStuds > 4.5 && rewiredStop.sensors[rover.sensor].distanceStuds < 6, `rewired, it still drives and stops before the wall: ${rewiredStop.sensors[rover.sensor].distanceStuds.toFixed(2)} studs`)

console.log('\nR7. A "Joystick drive" program: the on-screen joystick and the arrow keys')
await page.getByRole('button', { name: 'New program' }).click()
await page.getByTestId('robo-starters-menu').getByText('Joystick drive', { exact: true }).click()
await sleep(700)
section = await s.section()
check('R7.new-program', section.programs.length === 2 && section.programs[1].name === 'Joystick drive' && section.creations[0].activeProgramId === section.programs[1].id && (await page.getByRole('tab', { name: 'Joystick drive' }).getAttribute('aria-selected')) === 'true', 'the + menu added "Joystick drive" as a second tab and made it active')
await page.getByTestId('robo-run').click()
await sleep(300)
const stick = await page.getByTestId('robo-joystick').boundingBox()
const center = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
const startSensor = (await s.observation()).sensors[rover.sensor].distanceStuds
await page.mouse.move(center.x, center.y)
await page.mouse.down()
// A half push (the knob travels 34 px to full): about 40 % forward.
await page.mouse.move(center.x, center.y - 14, { steps: 8 })
await sleep(1000)
const pushed = await s.observation()
const pushedChips = await s.readings()
await s.shot('C9-joystick-drive')
await page.mouse.up()
await sleep(700)
const released = await s.observation()
measured.joystick = { up: pushed.speed, sensorBefore: startSensor, sensorPushed: pushed.sensors[rover.sensor].distanceStuds, releasedSpeed: released.speed }
const stickPower = Number(pushedChips.Motors?.match(/^Left (\d+) · /)?.[1])
check('R7.joystick-drives', pushed.speed > 1.5 && pushed.sensors[rover.sensor].distanceStuds < startSensor - 1 && stickPower > 30 && stickPower < 50 && pushedChips.Motors?.startsWith(`Left ${stickPower} · Right ${stickPower} %`), `mouse-dragging the stick up: ${pushed.speed.toFixed(2)} studs/s forward, wall ${startSensor.toFixed(1)} → ${pushed.sensors[rover.sensor].distanceStuds.toFixed(1)} studs; chip "Motors ${pushedChips.Motors}"`)
check('R7.joystick-release', Math.abs(released.motors[rover.leftMotor].powerPercent) < 1 && Math.abs(released.motors[rover.rightMotor].powerPercent) < 1, 'letting go centres the stick and the motors stop')
// From the built pose again, so the arrow keys have room before the wall.
await page.getByTestId('robo-reset').click()
await sleep(300)
await page.getByTestId('robo-run').click()
await sleep(300)
const beforeKeys = (await s.observation()).sensors[rover.sensor].distanceStuds
await page.keyboard.down('ArrowUp')
await sleep(450)
const upHeld = await s.observation()
await page.keyboard.up('ArrowUp')
await sleep(500)
await page.keyboard.down('ArrowLeft')
await sleep(500)
const leftHeld = await s.observation()
await page.keyboard.up('ArrowLeft')
await sleep(400)
const powerOf = (o, id) => o.motors[id].powerPercent
check('R7.arrow-up', upHeld.speed > 1 && upHeld.sensors[rover.sensor].distanceStuds < beforeKeys, `ArrowUp held: ${upHeld.speed.toFixed(2)} studs/s, wall ${beforeKeys.toFixed(1)} → ${upHeld.sensors[rover.sensor].distanceStuds.toFixed(1)} studs`)
check('R7.arrow-left', Math.sign(powerOf(leftHeld, rover.leftMotor)) === Math.sign(powerOf(leftHeld, rover.rightMotor)) && Math.abs(powerOf(leftHeld, rover.leftMotor)) > 20, `ArrowLeft held: raw powers ${powerOf(leftHeld, rover.leftMotor)} and ${powerOf(leftHeld, rover.rightMotor)} (the right motor is reversed, so equal signs spin the rover)`)
await page.getByRole('button', { name: 'Keys', exact: true }).click()
await page.keyboard.down('ArrowUp')
await sleep(250)
check('R7.keypad-lights', (await page.getByRole('button', { name: 'Up arrow' }).getAttribute('aria-pressed')) === 'true', 'the Keys pad lights the arrow being held')
await s.shot('C10-keys')
await page.keyboard.up('ArrowUp')
await sleep(300)

console.log('\nR8. Back to build: construction unchanged; save and cold reload')
await s.back()
check('R8.construction-unchanged', (await snapshotConstruction(s)) === rewired, 'bricks, poses, attachments and cables identical to before Code opened (after the student’s own port move)')
const savedPrograms = JSON.stringify((await s.section()).programs.map((program) => ({ name: program.name, revision: program.revision, workspace: program.workspace })))
const activeBefore = (await s.section()).creations[0].activeProgramId
await sleep(2500)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.project), null, { timeout: 30_000 })
await page.waitForSelector('canvas')
await sleep(800)
const reloaded = await s.section()
const reloadedConstruction = await snapshotConstruction(s)
const programsSame = JSON.stringify(reloaded.programs.map((program) => ({ name: program.name, revision: program.revision, workspace: program.workspace }))) === savedPrograms
if (!programsSame || reloaded.creations[0].activeProgramId !== activeBefore || reloadedConstruction !== rewired) console.log('  reload differs:', { programsSame, active: [reloaded.creations[0].activeProgramId, activeBefore], construction: reloadedConstruction === rewired ? 'same' : [reloadedConstruction.slice(0, 600), rewired.slice(0, 600)] })
check('R8.reload', programsSame && reloaded.creations[0].activeProgramId === activeBefore && reloadedConstruction === rewired, `after a cold reload: ${reloaded.programs.length} programs (${reloaded.programs.map((program) => program.name).join(', ')}), active program kept, construction and cables intact`)
await s.robo((state, list) => state.requestFrame(list), Object.values(rover))
await sleep(500)
await s.clickPart(world(29.5, 7, 32.5), 'the left motor')
await s.openCodeFromPanel()
check('R8.reopen', (await page.getByRole('tab', { selected: true }).textContent()) === 'Joystick drive' && (await s.workspaceJson())[0].type === 'robo_when_joystick_moves', 'Code reopens on the active tab, "Joystick drive"')
await s.shot('C11-reloaded')
await s.back()

console.log('\nG. Gate in My world')
await s.brick((state) => state.newBuild())
await sleep(150)
const gate = {}
gate.plate = await s.place({ partId: 'plate_6x8', x: 20, y: 0, z: 20, color: '#3e83d7' })
gate.leftPost = await s.place({ partId: 'pillar_1x1', x: 20, y: 1, z: 20, color: GREY })
gate.leftTop = await s.place({ partId: 'brick_1x1', x: 20, y: 10, z: 20, color: GREY })
gate.rightPost = await s.place({ partId: 'pillar_1x1', x: 25, y: 1, z: 20, color: GREY })
gate.rightTop = await s.place({ partId: 'brick_1x1', x: 25, y: 10, z: 20, color: GREY })
gate.lintel = await s.place({ partId: 'brick_1x6', x: 20, y: 13, z: 20, rotation: 1, color: GREY })
gate.sill = await s.place({ partId: 'plate_2x4', x: 21, y: 1, z: 21, rotation: 1, color: GREY })
gate.hinge = await s.place({ partId: 'robo_hinge_motor', x: 21, y: 2, z: 21, color: '#e7473c' })
await page.getByTestId('robotics-creation-card').getByLabel('Robot name').fill('Castle gate')
await page.getByTestId('robotics-creation-card').getByRole('button', { name: 'Keep building' }).click()
gate.door = await s.place({ partId: 'brick_1x4', x: 21, y: 8, z: 21, rotation: 1, color: '#f4ca3a' })
gate.hub = await s.place({ partId: 'robo_hub', x: 20, y: 1, z: 24, color: '#f5eee0' })
gate.sensor = await s.place({ partId: 'robo_distance_sensor', x: 21, y: 7, z: 27, color: '#f4ca3a' })
// One loose brick of "my world" beside the gate (on the ground, not attached to it).
const scenery = await s.place({ partId: 'brick_2x4', x: 28, y: 0, z: 25, color: '#6fae5b' })
await s.robo((state) => state.dismissWiringNote())
await s.robo((state, list) => state.requestFrame(list), Object.values(gate))
await sleep(500)
const builtGate = await snapshotConstruction(s)
await s.openCodeFromPanel()
section = await s.section()
check('G.default', section.programs[0].name === 'Smart gate' && (await page.getByRole('button', { name: 'My world' }).getAttribute('aria-pressed')) === 'true' && (await s.stage((state) => state.stage.space)) === 'myWorld' && await page.getByTestId('robo-visitor').count() === 1, 'the gate opens on "Smart gate" in My world, with "Someone walks up"')
await page.getByTestId('robo-run').click()
await sleep(400)
await s.shot('G1-gate-my-world')
await page.getByTestId('robo-visitor').click()
// The starter keeps the door open (90°) while the visitor is there and shuts it once they have gone: sample until the door is on its way back.
let maxAngle = 0
let openChip = ''
let shotTaken = false
const gateStart = Date.now()
while (Date.now() - gateStart < 10_000) {
  const o = await s.observation()
  const angle = o.motors[gate.hinge].positionDegrees
  if (angle > maxAngle) { maxAngle = angle; openChip = (await s.readings())['Arm motor'] ?? JSON.stringify(await s.readings()) }
  if (!shotTaken && angle > 88) { await s.shot('G2-door-open'); shotTaken = true }
  if (maxAngle > 85 && angle < maxAngle - 10) break
  await sleep(120)
}
const armPose = await s.stage((state, door) => state.stage.controller.poses().get(state.stage.controller.bodyOfBrick(door)).rotation, gate.door)
measured.gate = { maxAngle, openChip }
check('G.door-opens', shotTaken && maxAngle > 87 && maxAngle < 93 && Math.abs(armPose.x) < 0.02 && Math.abs(armPose.z) < 0.02, `the visitor walked into the beam: the door swung to ${maxAngle.toFixed(1)}° about the hinge only (chip "${openChip}")`)
await page.getByTestId('robo-reset').click()
await sleep(500)
const gateReset = await s.observation()
check('G.reset-zero', gateReset.phase === 'ready' && gateReset.motors[gate.hinge].positionDegrees === 0, `Reset: door at ${gateReset.motors[gate.hinge].positionDegrees}°`)
await s.shot('G3-gate-reset')
// A student pokes the scenery on the stage: a click may select it, but a drag must not move it.
const sceneryAt = await s.hook((hook, p) => hook.project(p), world(29, 3, 26))
const beforePoke = await snapshotConstruction(s)
check('G.scenery-in-view', sceneryAt.inFront && sceneryAt.x > 830 && sceneryAt.x < 1366 && sceneryAt.y > 240 && sceneryAt.y < 700, `the scenery brick is on the stage at (${sceneryAt.x.toFixed(0)}, ${sceneryAt.y.toFixed(0)})`)
await page.mouse.click(sceneryAt.x, sceneryAt.y)
await sleep(250)
await page.mouse.move(sceneryAt.x, sceneryAt.y)
await page.mouse.down()
await page.mouse.move(sceneryAt.x + 90, sceneryAt.y + 30, { steps: 12 })
await page.mouse.up()
await sleep(400)
check('G.stage-never-edits', (await snapshotConstruction(s)) === beforePoke && (await s.brick((state) => state.draft)) === null, `after a click and a drag on it (selected: ${(await s.brick((state) => state.selectedId)) === scenery ? 'yes' : 'no'}), the brick has not moved and nothing is armed`)
await s.back()
check('G.construction-unchanged', (await snapshotConstruction(s)) === builtGate, 'the gate is exactly as built')

console.log('\nS. Signal post: named on the card, Code from the panel')
await s.brick((state) => state.newBuild())
await sleep(150)
const post = {}
post.hub = await s.place({ partId: 'robo_hub', x: 40, y: 0, z: 40, color: '#f5eee0' })
post.sensor = await s.place({ partId: 'robo_distance_sensor', x: 41, y: 6, z: 40, color: '#f4ca3a' })
post.light = await s.place({ partId: 'robo_light', x: 43, y: 6, z: 43, color: '#e7473c' })
await s.robo((state) => state.dismissWiringNote())
const postCard = page.getByTestId('robotics-creation-card')
await postCard.getByLabel('Robot name').fill('Signal post')
await postCard.getByRole('button', { name: 'Keep building' }).click()
await sleep(200)
await page.getByTestId('robotics-code-button').click()
await page.waitForSelector('.robo-code-blockly .blocklySvg', { timeout: 30_000 })
await s.waitStage()
section = await s.section()
check('S.card-opens-code', section.creations[0].name === 'Signal post' && section.programs[0].name === 'Signal post' && (await s.stage((state) => state.stage.space)) === 'myWorld', 'the card named it (Keep building) and the panel’s Code opened "Signal post" in My world')
await page.getByTestId('robo-run').click()
await sleep(300)
await page.getByTestId('robo-visitor').click()
await page.waitForFunction((light) => window.__robotics.stageStore.getState().stageObservation?.lights[light] === 'red', post.light, { timeout: 10_000 })
await sleep(300)
const lit = await s.readings()
check('S.light-red', lit.Light?.startsWith('red'), `the light chip reads "${lit.Light}"`)
await s.shot('S1-signal-red')
await s.back()

check('console-clean', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : 'no console errors, and nothing fetched from Blockly’s media folder')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768 (journeys), 1366x768 and 1024x768 (screens)', at: new Date().toISOString(), measured, results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
