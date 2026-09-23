/**
 * Robot Workshop spike, checkpoint 1 (mechanics) acceptance harness.
 *
 * Drives the real studio in Chrome at 1366×768 against a dev server started in the
 * robotics mode (`npx vite --mode robotics --port 5232 --strictPort --host 127.0.0.1`).
 * Parts are placed from loose parts through the studio's own placement actions
 * (choosePart → rotate → setDraftPosition → placeDraft), so every placement runs the
 * real layout rules and raises the same `placeFeedback` a click would. The cards,
 * lines and Nudge are read back through the dev-only `window.__robotics` hook and
 * exercised through their real buttons. Kid-UX pass (docs/robotics/KID-UX.md §G): the card
 * is "You started a robot!" + Keep building (Code is the panel's), the motor tests ("Nudge")
 * sit in the panel's folded More, the part rows and the drive line in its folded Parts.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-spike-cp1.mjs
 *
 * Writes PNGs and results.json under docs/qa/robotics-spike-cp1-repair/store-driven/ (the checkpoint-1
 * evidence under docs/qa/robotics-spike-cp1/ is the original run). The pointer-driven companion is
 * robotics-spike-cp1-pointer.mjs.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5232', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-spike-cp1-repair/store-driven')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const results = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }
const shot = async (name) => { const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); console.log(`  shot ${name}.png`); return file }
const sleep = (ms) => page.waitForTimeout(ms)

await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
await page.goto(`${origin}/build`)
await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics), null, { timeout: 30_000 })
await page.waitForSelector('canvas')

/* ---------------------------------------------------------------- helpers */
const brick = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const robo = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), arg), { src: fn.toString(), arg })

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
  await sleep(120)
  return brick((state) => state.bricks[state.bricks.length - 1].id)
}
// Documents are compared structurally: a freshly placed brick carries its keys in insertion
// order ({...draft, id}) while a reloaded one is normalised by the parser (id first).
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
const canonical = (json) => JSON.stringify(sortKeys(JSON.parse(json)))
const snapshot = async () => canonical(await brick((state) => JSON.stringify(state.getDocumentSnapshot())))
const creations = () => robo((state) => state.model.creations.map((c) => ({
  id: c.id, name: c.name, kind: c.kind, testSpace: c.testSpace, brickCount: c.brickIds.length, bodies: c.bodies.length, arms: c.armBodyIds.length, lines: c.lines,
  wheels: c.wheels.map((w) => ({ id: w.brickId, onAxle: w.onAxle, note: w.note })),
  motors: c.motors.map((m) => ({ id: m.brickId, name: m.name, axle: Boolean(m.axleId), wheels: m.wheelIds.length, port: m.port?.port ?? null, drives: m.drives })),
  hinges: c.hinges.map((h) => ({ id: h.brickId, name: h.name, locked: h.locked, arm: h.armBrickIds.length, bridging: h.bridging.map((j) => [j.lowerBrickId, j.upperBrickId]), port: h.port?.port ?? null })),
  sensors: c.sensors.map((s) => ({ name: s.name, facing: s.facing, port: s.port?.port ?? null })),
  hubs: c.hubs.length, lights: c.lights.length, drivePair: c.drivePair ? { left: c.drivePair.leftId, right: c.drivePair.rightId, reversed: c.drivePair.reversedIds } : null,
})))
const cardState = () => robo((state) => state.card && { creationId: state.card.creationId, suggestedName: state.card.suggestedName, anchors: state.card.anchorBrickIds.length })
const wiringNote = () => robo((state) => state.wiringNote?.text ?? null)
const simState = () => robo((state) => {
  if (!state.sim) return null
  const poses = {}
  for (const [id, pose] of state.sim.mechanics.poses()) poses[id] = pose
  return { creationId: state.sim.creationId, elapsed: state.sim.mechanics.elapsed, poses, hidden: state.sim.hiddenBrickIds.size, reports: state.hingeReports, angles: state.motorAngles, contacts: state.contacts.length }
})
const bodyOf = (id) => robo((state, brickId) => state.sim?.mechanics.bodyOfBrick(brickId) ?? null, id)
const yawOf = (pose) => { const q = pose.rotation; const fx = 2 * (q.x * q.z + q.w * q.y); const fz = 1 - 2 * (q.x * q.x + q.y * q.y); return (Math.atan2(fx, fz) * 180) / Math.PI }
const panel = page.getByTestId('robotics-panel')
const card = page.getByTestId('robotics-creation-card')
const clickNudge = async (name) => { await page.getByRole('button', { name, exact: true }).first().click() }
const resetNudge = async () => { await page.getByTestId('robotics-reset').click(); await sleep(150) }
/** Opens a folded section of the robot panel (Parts, More) when it is shut: the kid-UX panel folds both by default. */
const openFold = async (name) => {
  // The panel's own folds by test id: a picked part has a More of its own (lane P).
  const toggle = panel.getByTestId(name === 'More' ? 'robotics-more-fold' : 'robotics-parts-fold').locator('> .robotics-fold-toggle')
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') { await toggle.click(); await sleep(150) }
}
const newBuild = async () => { await robo((state) => state.resetSim()); await brick((state) => state.newBuild()); await sleep(150) }
/** Frames the creation the way the card does: inside the canvas area the drawer and panels leave free. */
const frame = async (brickIds) => {
  await robo((state, ids) => state.requestFrame(ids), brickIds)
  await sleep(700)
}

/* ---------------------------------------------------------------- A. rover */
console.log('\nA. Rover from loose parts')
await newBuild()
const GREY = '#52636c'
const ids = {}
ids.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
ids.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
await sleep(200)
check('A.card-opens-on-first-device', (await cardState())?.creationId === null, 'placing the hub on non-creation bricks opens the creation card')
await shot('A1-hub-card')
check('A.hub-card-copy', await card.getByText('You started a robot!').count() === 1 && (await card.getByLabel('Robot name').inputValue()) === 'Robot' && (await cardState())?.anchors === 2, 'card: "You started a robot!", named "Robot", over the 2 bricks attached')
await card.getByRole('button', { name: 'Keep building' }).click()
await sleep(300)
await panel.getByTestId('robotics-code-button').click()
await sleep(600)
// Kid-UX: the card keeps building; Code is the panel's button, and it opens the Code view. Back to build to keep building.
check('A.code-opens', (await page.evaluate(() => window.__robotics.codeView.getState().creationId)) !== null && await page.getByRole('button', { name: 'Back to build' }).count() === 1, 'Keep building, then the panel’s Code, opens the Code view')
await page.getByRole('button', { name: 'Back to build' }).click()
await sleep(400)
let list = await creations()
check('A.creation-saved-on-code', list.length === 1 && list[0].name === 'Robot', `Keep building keeps the robot with its default name (${list[0]?.name})`)

ids.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
check('A.wiring-left-motor', (await wiringNote()) === 'Left motor connected to port A', `assisted wiring line: ${await wiringNote()}`)
await shot('A2-motor-wired')
ids.rightMotor = await place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0, color: GREY })
check('A.wiring-right-motor', (await wiringNote()) === 'Right motor connected to port B', `assisted wiring line: ${await wiringNote()}`)
ids.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
ids.rightAxle = await place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
ids.leftWheel = await place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
ids.rightWheel = await place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
ids.sensor = await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
check('A.wiring-sensor', (await wiringNote()) === 'Front sensor connected to port C', `assisted wiring line: ${await wiringNote()}`)
await sleep(200)
list = await creations()
const rover = list[0]
check('A.one-creation', list.length === 1 && rover.brickCount === 9 && rover.bodies === 3, `one creation over ${rover.brickCount} bricks and ${rover.bodies} bodies`)
check('A.two-wheels-on-motors', rover.wheels.length === 2 && rover.wheels.every((w) => w.onAxle) && rover.motors.every((m) => m.wheels === 1), `wheels: ${JSON.stringify(rover.wheels)}`)
check('A.ready-line', rover.lines.ready === 'Axles and wheels on both motors, so it can roll', `ready line: ${rover.lines.ready}`)
check('A.drive-pair-reversed', rover.drivePair && rover.drivePair.reversed.length === 1 && rover.drivePair.reversed[0] === ids.rightMotor, `drive pair reversed: ${JSON.stringify(rover.drivePair?.reversed)}`)
check('A.card-stays-closed-for-existing', (await cardState()) === null, 'a device joining the saved creation does not reopen the card (naming never interrupts building)')
const anchors = await robo((state) => state.model.section.creations[0].anchorBrickIds)
check('A.anchors-refreshed', [ids.plate, ids.hub, ids.leftMotor, ids.rightMotor, ids.sensor].every((id) => anchors.includes(id)) && !anchors.includes(ids.leftAxle) && !anchors.includes(ids.leftWheel), `the wiring writes refreshed the creation's anchors to every stud-attached brick (${anchors.length}; axles and wheels join by mechanism links, never as anchors)`)
await frame(Object.values(ids))
await panel.getByLabel('Robot name').fill('Mars buggy')
await panel.getByLabel('Robot name').press('Enter')
await sleep(200)
await shot('A3-rover-panel')
check('A.named', (await creations())[0].name === 'Mars buggy', 'the creation was renamed from the panel')

// Nudge both motors as a drive pair → it rolls (the motor tests are in the panel's More).
const before = await snapshot()
await openFold('More')
await page.getByRole('button', { name: 'Drive forward', exact: true }).click()
await page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
await sleep(2600)
let sim = await simState()
let chassis = sim.poses[await bodyOf(ids.plate)]
check('A.rolls', chassis.position.z < -1 && Math.abs(chassis.position.x) < 0.6 && Math.abs(yawOf(chassis)) < 15, `after 2.6 s: moved ${(-chassis.position.z).toFixed(2)} forward, ${chassis.position.x.toFixed(2)} sideways, yaw ${yawOf(chassis).toFixed(1)}°`)
check('A.bodies-hidden-while-running', sim.hidden === 9, `${sim.hidden} bricks drawn by the simulation`)
await shot('A4-rover-rolls')
await resetNudge()
check('A.reset-document-unchanged', (await snapshot()) === before, 'document identical after Nudge + Reset')
check('A.reset-shows-built-pose', (await simState()) === null && await page.getByTestId('robotics-sim-status').textContent() === 'Stopped', 'Reset returns to the built pose (the motor tests say "Stopped")')

// Wheel left off its axle.
await brick((state, id) => { state.selectBrick(id); state.nudge(-1, 0, 0) }, ids.leftWheel)
await sleep(200)
let loose = (await creations())[0]
const looseWheel = loose.wheels.find((w) => w.id === ids.leftWheel)
check('A.wheel-off-note', looseWheel && !looseWheel.onAxle && looseWheel.note.startsWith('Not on an axle'), `wheel card: ${looseWheel?.note}`)
// Kid-UX lane W: the picked wheel says it in a third grader's words, with the one tap that puts it back on.
check('A.wheel-off-selected-part', (await page.getByTestId('robotics-selected-part').textContent()).includes("This wheel isn't on the axle yet.") && (await page.getByTestId('robotics-wheel-fix').textContent()) === "Put it on Left motor's axle", 'selected wheel says "This wheel isn\'t on the axle yet." and offers "Put it on Left motor\'s axle"')
await page.getByRole('button', { name: 'Spin', exact: true }).first().click()
await page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
await sleep(1600)
sim = await simState()
chassis = sim.poses[await bodyOf(ids.plate)]
check('A.wheel-off-motor-spins', Math.abs(sim.angles[ids.leftMotor] ?? 0) > 2 && sim.hidden === 8 && Math.hypot(chassis.position.x, chassis.position.z) < 0.2, `left motor output turned ${((sim.angles[ids.leftMotor] * 180) / Math.PI).toFixed(0)}°, wheel stayed (not simulated), body moved ${Math.hypot(chassis.position.x, chassis.position.z).toFixed(2)}`)
await shot('A5-wheel-off-axle')
await resetNudge()
await brick((state, id) => { state.selectBrick(id); state.nudge(1, 0, 0); state.clearSelection() }, ids.leftWheel)
await sleep(200)
check('A.wheel-back-on', (await creations())[0].wheels.every((w) => w.onAxle), 'wheel back on its axle')

// Both motors commanded the same way → it turns; the card shows one motor reversed.
const runButtons = page.getByRole('button', { name: 'Spin', exact: true })
await runButtons.nth(0).click()
await page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
await runButtons.nth(1).click()
await sleep(2600)
sim = await simState()
chassis = sim.poses[await bodyOf(ids.plate)]
check('A.same-sign-turns', Math.abs(yawOf(chassis)) > 25 && Math.hypot(chassis.position.x, chassis.position.z) < 1, `both at +40%: yaw ${yawOf(chassis).toFixed(1)}°, drift ${Math.hypot(chassis.position.x, chassis.position.z).toFixed(2)}`)
await openFold('Parts')
check('A.reversed-shown', (await panel.textContent()).includes('Right motor faces the other way'), 'panel (Parts): the drive line says Right motor faces the other way')
await shot('A6-same-sign-turns')
await resetNudge()
check('A.reset-again-unchanged', (await snapshot()) === before, 'document identical after every nudge')

/* ---------------------------------------------------------------- D. save / reload (rover) */
console.log('\nD. Save and reload')
await sleep(900) // autosave delay
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics), null, { timeout: 30_000 })
await sleep(400)
const reloaded = await snapshot()
if (reloaded !== before) {
  let at = 0
  while (at < before.length && before[at] === reloaded[at]) at += 1
  console.log(`  round-trip differs at ${at}:\n    before:   ${before.slice(Math.max(0, at - 80), at + 160)}\n    reloaded: ${reloaded.slice(Math.max(0, at - 80), at + 160)}`)
}
check('D.round-trip', reloaded === before, 'the document round-trips through autosave and reload byte for byte')
check('D.creation-survives', (await creations())[0]?.name === 'Mars buggy' && (await creations())[0].motors.every((m) => m.port), 'creation name and cables survive reload')
await shot('D1-reloaded')

/* ---------------------------------------------------------------- B. gate */
console.log('\nB. Gate from loose parts')
await newBuild()
const gate = {}
gate.plate = await place({ partId: 'plate_6x8', x: 20, y: 0, z: 20, color: '#3e83d7' })
gate.leftPost = await place({ partId: 'pillar_1x1', x: 20, y: 1, z: 20, color: GREY })
gate.leftTop = await place({ partId: 'brick_1x1', x: 20, y: 10, z: 20, color: GREY })
gate.rightPost = await place({ partId: 'pillar_1x1', x: 25, y: 1, z: 20, color: GREY })
gate.rightTop = await place({ partId: 'brick_1x1', x: 25, y: 10, z: 20, color: GREY })
gate.lintel = await place({ partId: 'brick_1x6', x: 20, y: 13, z: 20, rotation: 1, color: GREY })
gate.sill = await place({ partId: 'plate_2x4', x: 21, y: 1, z: 21, rotation: 1, color: GREY })
gate.hinge = await place({ partId: 'robo_hinge_motor', x: 21, y: 2, z: 21, color: '#e7473c' })
await sleep(200)
check('B.card-on-hinge', (await cardState())?.creationId === null && await card.getByText('You started a robot!').count() === 1 && (await card.getByLabel('Robot name').inputValue()) === 'Gate', 'placing the hinge motor opens the card, named "Gate"')
await card.getByRole('button', { name: 'Keep building' }).click()
gate.door = await place({ partId: 'brick_1x4', x: 21, y: 8, z: 21, rotation: 1, color: '#f4ca3a' })
gate.hub = await place({ partId: 'robo_hub', x: 20, y: 1, z: 24, color: '#f5eee0' })
check('B.hub-powers-waiting-hinge', (await wiringNote()) === 'Arm motor connected to port A', `hub arrival wires the hinge: ${await wiringNote()}`)
gate.sensor = await place({ partId: 'robo_distance_sensor', x: 21, y: 7, z: 27, color: '#f4ca3a' })
await sleep(200)
let g = (await creations())[0]
check('B.base-and-arm', g.kind === 'gate' && g.bodies === 2 && g.arms === 1 && g.hinges[0].arm === 1 && !g.hinges[0].locked, `gate: ${g.bodies} bodies, ${g.arms} arm, hinge carries ${g.hinges[0].arm} brick`)
check('B.zero-line', g.lines.ready === 'Fixed side on the frame, moving side on the arm · zero is as built', `ready line: ${g.lines.ready}`)
check('B.my-world', g.testSpace === 'myWorld', 'a gate runs in my world by default (frame anchored to the plate)')
check('B.card-stays-closed-for-existing', (await cardState()) === null, 'the door, hub and sensor joined the gate without reopening the card')
await frame(Object.values(gate))
await panel.getByLabel('Robot name').fill('Castle gate')
await panel.getByLabel('Robot name').press('Enter')
await sleep(200)
await shot('B1-gate-panel')
check('B.named', (await creations())[0].name === 'Castle gate', 'the gate was renamed from the panel')
const gateBefore = await snapshot()
await openFold('More')
await openFold('Parts')
await clickNudge('Swing open')
await page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
await sleep(2600)
sim = await simState()
const frameBody = await bodyOf(gate.leftPost)
const armBody = await bodyOf(gate.door)
const report = sim.reports[gate.hinge]
const arm = sim.poses[armBody]
check('B.swings-about-axis', frameBody !== armBody && report && report.angle > 55 && report.angle < 65 && Math.abs(arm.rotation.x) < 0.02 && Math.abs(arm.rotation.z) < 0.02 && sim.poses[frameBody].position.y === 0 && sim.poses[frameBody].rotation.w === 1, `hinge at ${report?.angle?.toFixed(1)}°, arm quaternion x=${arm.rotation.x.toFixed(3)} z=${arm.rotation.z.toFixed(3)}, frame unmoved`)
// Lane P: the part row says open or shut, not degrees.
check('B.panel-angle', (await panel.textContent()).includes(' · open'), 'panel reports the hinge is open')
await shot('B2-gate-swings')
await clickNudge('Shut')
await sleep(2600)
sim = await simState()
check('B.back-to-zero', Math.abs(sim.reports[gate.hinge].angle) < 3, `back at ${sim.reports[gate.hinge].angle.toFixed(1)}°`)
await resetNudge()
check('B.reset-unchanged', (await snapshot()) === gateBefore, 'document identical after the swing + Reset')

// Build the door into the frame.
gate.bridge1 = await place({ partId: 'brick_2x2', x: 23, y: 2, z: 21, color: GREY })
gate.bridge2 = await place({ partId: 'brick_2x2', x: 23, y: 5, z: 21, color: GREY })
await frame(Object.values(gate))
await brick((state, id) => state.selectBrick(id), gate.door)
await sleep(250)
g = (await creations())[0]
check('B.locked', g.hinges[0].locked && g.arms === 0 && g.hinges[0].bridging.length === 1 && g.hinges[0].bridging[0][1] === gate.door, `locked; bridging joint ${JSON.stringify(g.hinges[0].bridging)}`)
check('B.locked-line', g.lines.ready.includes("built into the frame, so it can't swing"), `ready line: ${g.lines.ready}`)
await shot('B3-gate-built-into-frame')
await clickNudge('Swing open')
await sleep(700)
check('B.locked-nudge-explains', (await brick((state) => state.toast))?.includes('built into the frame'), `nudge on a locked hinge: ${await brick((state) => state.toast)}`)
sim = await simState()
check('B.locked-does-not-move', !sim || (sim.reports[gate.hinge]?.angle ?? 0) === 0, 'the arm did not move')
await robo((state) => state.resetSim())

/* ---------------------------------------------------------------- C. signal post */
console.log('\nC. Signal post')
await newBuild()
await place({ partId: 'robo_hub', x: 40, y: 0, z: 40, color: '#f5eee0' })
await card.getByRole('button', { name: 'Keep building' }).click()
await place({ partId: 'robo_distance_sensor', x: 41, y: 6, z: 40, color: '#f4ca3a' })
check('C.no-card-for-second-device', (await cardState()) === null, 'the sensor joined the post without a card')
await place({ partId: 'robo_light', x: 43, y: 6, z: 43, color: '#e7473c' })
await sleep(200)
const post = (await creations())[0]
check('C.signal-post', post.kind === 'signal' && post.brickCount === 3 && post.hubs === 1 && post.lights === 1 && post.sensors.length === 1 && post.motors.length === 0, `signal post: ${post.lines.parts}`)
check('C.signal-ready', post.lines.ready === 'Hub, sensor and light, so it can sense and signal', `ready line: ${post.lines.ready}`)
check('C.signal-wired', post.sensors[0].port === 'A' && (await wiringNote()) === 'Light connected to port B', `cables: sensor ${post.sensors[0].port}, ${await wiringNote()}`)
await frame((await brick((state) => state.bricks.map((b) => b.id))))
await shot('C1-signal-post')

/* ---------------------------------------------------------------- D2. a document from before this work */
console.log('\nD2. Legacy document loads unchanged')
const legacy = { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [{ id: 'old-1', partId: 'brick_2x4', x: 30, y: 0, z: 30, rotation: 0, color: '#e7473c' }, { id: 'old-2', partId: 'plate_2x4', x: 30, y: 3, z: 30, rotation: 0, color: '#3e83d7' }] }
const legacyText = `${JSON.stringify(legacy, null, 2)}\n`
// Seed at document start of the next load: the studio flushes its autosave on pagehide, so a
// value written before the reload would be overwritten by the signal post.
await context.addInitScript(({ key, text }) => { if (!window.sessionStorage.getItem('qa:legacy-seeded')) { window.localStorage.setItem(key, text); window.sessionStorage.setItem('qa:legacy-seeded', '1') } }, { key: PROJECT_KEY, text: legacyText })
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics), null, { timeout: 30_000 })
await sleep(400)
const legacySnapshot = await snapshot()
if (legacySnapshot !== canonical(JSON.stringify(legacy))) console.log(`  legacy differs:\n    seeded:   ${canonical(JSON.stringify(legacy))}\n    snapshot: ${legacySnapshot}`)
check('D2.legacy-unchanged', legacySnapshot === canonical(JSON.stringify(legacy)), 'a document without a robotics section loads and snapshots unchanged')
check('D2.legacy-no-creations', (await creations()).length === 0 && (await cardState()) === null, 'no creations, no card')
check('D2.drawer-has-robotics', await page.getByRole('option', { name: 'Robots' }).count() === 1 || await page.getByRole('tab', { name: 'Robots' }).count() === 1, 'the drawer offers a Robots category')
await page.getByLabel('Brick category').selectOption('robotics').catch(() => {})
await sleep(300)
await shot('D2-legacy-and-drawer')

await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768', at: new Date().toISOString(), results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
