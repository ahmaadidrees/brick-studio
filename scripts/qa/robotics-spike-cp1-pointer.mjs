/**
 * Robot Workshop spike, checkpoint 1 repair: pointer-driven assembly harness.
 *
 * The companion `robotics-spike-cp1.mjs` places parts through the store's placement
 * actions; that proves the model, not the hands. This one builds the rover and the
 * gate the way a student does, in real Chrome at 1366×768: every part is chosen from
 * the drawer with a click, aimed with the mouse over the plate or over the part it
 * connects to, turned with the R key and placed with a click. Where the mouse goes
 * is the studio's own answer to "where is that socket on my screen" (the dev-only
 * `window.__robotics.project` the scene layer exposes) — the same aiming a student
 * does by eye. Nothing is placed with injected coordinates and no fixture is loaded.
 *
 * The run reads back what the app shows (the ghost before each click, the cards,
 * the panel, the simulation) and photographs each stage. It also checks the four
 * checkpoint-1 repairs from the browser side: naming does not interrupt building,
 * the creation is framed inside the free canvas area, an edit while a nudge runs
 * retires the run, Reset and a cold reload keep the authored geometry and cables.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-spike-cp1-pointer.mjs
 *
 * against `npx vite --mode robotics --port 5232 --strictPort --host 127.0.0.1`.
 * Writes PNGs and results.json under docs/qa/robotics-spike-cp1-repair/pointer/.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5232', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-spike-cp1-repair/pointer')
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
await page.waitForFunction(() => Boolean(window.__robotics?.project), null, { timeout: 30_000 })
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
const draft = () => brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z, rotation: state.draft.rotation })
const lastBrick = () => brick((state) => { const b = state.bricks[state.bricks.length - 1]; return { id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation, color: b.color } })
const cardState = () => robo((state) => state.card && { creationId: state.card.creationId, suggestedName: state.card.suggestedName })
const wiringNote = () => robo((state) => state.wiringNote?.text ?? null)
const toast = () => brick((state) => state.toast)
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
const snapshot = async () => JSON.stringify(sortKeys(JSON.parse(await brick((state) => JSON.stringify(state.getDocumentSnapshot())))))
const creations = () => robo((state) => state.model.creations.map((c) => ({
  id: c.id, name: c.name, kind: c.kind, testSpace: c.testSpace, brickIds: c.brickIds, bodies: c.bodies.length, arms: c.armBodyIds.length, lines: c.lines,
  wheels: c.wheels.map((w) => ({ id: w.brickId, onAxle: w.onAxle, note: w.note })),
  motors: c.motors.map((m) => ({ id: m.brickId, name: m.name, axle: Boolean(m.axleId), wheels: m.wheelIds.length, port: m.port?.port ?? null, drives: m.drives })),
  hinges: c.hinges.map((h) => ({ id: h.brickId, name: h.name, locked: h.locked, arm: h.armBrickIds.length, port: h.port?.port ?? null })),
  sensors: c.sensors.map((s) => ({ name: s.name, facing: s.facing, port: s.port?.port ?? null })),
  drivePair: c.drivePair ? { reversed: c.drivePair.reversedIds } : null,
})))
const simState = () => robo((state) => {
  if (!state.sim) return null
  const poses = {}
  for (const [id, pose] of state.sim.mechanics.poses()) poses[id] = pose
  return { creationId: state.sim.creationId, elapsed: state.sim.mechanics.elapsed, poses, hidden: state.sim.hiddenBrickIds.size, reports: state.hingeReports, angles: state.motorAngles }
})
const bodyOf = (id) => robo((state, brickId) => state.sim?.mechanics.bodyOfBrick(brickId) ?? null, id)
const yawOf = (pose) => { const q = pose.rotation; const fx = 2 * (q.x * q.z + q.w * q.y); const fz = 1 - 2 * (q.x * q.x + q.y * q.y); return (Math.atan2(fx, fz) * 180) / Math.PI }
const panel = page.getByTestId('robotics-panel')
const card = page.getByTestId('robotics-creation-card')
const waitForSim = () => page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
const resetNudge = async () => { await page.getByTestId('robotics-reset').click(); await sleep(150) }
/** The camera cluster, as a student uses it: a spot hidden behind a taller part is aimed at from the top view. */
const view = async (name) => { await page.getByRole('button', { name, exact: true }).click(); await sleep(650) }

const PART_NAMES = {
  plate_6x8: '6 × 8 Plate', plate_2x4: '2 × 4 Plate', brick_1x1: '1 × 1 Brick', brick_2x2: '2 × 2 Brick', brick_1x4: '1 × 4 Brick', pillar_1x1: 'Tall Pillar',
  robo_hub: 'Hub', robo_motor: 'Motor', robo_axle_short: 'Short axle', robo_wheel: 'Wheel', robo_distance_sensor: 'Distance sensor', robo_hinge_motor: 'Hinge motor', robo_light: 'Light',
}
/** Picks a part in the drawer with a click, from the Robotics category or the whole catalogue. */
async function choose(partId) {
  await page.getByLabel('Brick category').selectOption(partId.startsWith('robo_') ? 'robotics' : 'all')
  await page.locator(`.library-part[title="${PART_NAMES[partId]}"]`).click()
  await sleep(80)
  const armed = await draft()
  assert.equal(armed?.partId, partId, `drawer armed ${armed?.partId}, wanted ${partId}`)
}
/** Moves the real mouse over a world point (the studio projects it) and returns where the ghost went. */
async function aim(point) {
  const at = await screenOf(point)
  assert(at.inFront, `point ${JSON.stringify(point)} is behind the camera`)
  await page.mouse.move(at.x, at.y, { steps: 6 })
  await sleep(140)
  return { at, ghost: await draft() }
}
/**
 * One placement as a student makes it: choose in the drawer, turn with R, aim the mouse at
 * `point`, click. Returns the placed brick. `expect` is the grid pose the ghost must show
 * before the click (the evidence that aiming landed, or that a connector snapped).
 */
async function placeByPointer({ partId, point, rotation = 0, expect: expected, note }) {
  await choose(partId)
  for (let turn = 0; turn < rotation; turn += 1) { await page.keyboard.press('r'); await sleep(40) }
  const { at, ghost } = await aim(point)
  const ghostOk = ghost && ghost.x === expected.x && ghost.y === expected.y && ghost.z === expected.z && ghost.rotation === (expected.rotation ?? rotation)
  const label = note ?? `${PART_NAMES[partId]} at ${expected.x},${expected.y},${expected.z}`
  check(`ghost:${label}`, ghostOk, `${label}: ghost at ${ghost ? `${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}` : 'none'} after aiming at (${at.x.toFixed(0)}, ${at.y.toFixed(0)})`)
  const countBefore = await brick((state) => state.bricks.length)
  await page.mouse.click(at.x, at.y)
  await sleep(220)
  const placed = await lastBrick()
  check(`placed:${label}`, (await brick((state) => state.bricks.length)) === countBefore + 1 && placed.x === expected.x && placed.y === expected.y && placed.z === expected.z, `${label}: placed by click (${placed.partId} at ${placed.x},${placed.y},${placed.z})`)
  await page.keyboard.press('Escape') // disarm the re-armed brush so the next aim is clean
  await sleep(80)
  return placed
}
/** The creation's bricks projected to the page against the free canvas rectangle. */
async function framedInsideFreeArea(brickIds) {
  return hook((h, ids) => {
    const state = h.brickStore.getState()
    const rect = h.canvasRect()
    const insets = h.insets()
    const free = { left: rect.left + insets.left, right: rect.left + rect.width - insets.right, top: rect.top + insets.top, bottom: rect.top + rect.height - insets.bottom }
    const STUD = 0.62, PLATE = 0.18, half = 32
    const points = []
    for (const b of state.bricks) {
      if (!ids.includes(b.id)) continue
      const sizes = { plate_6x8: [6, 8, 1], robo_hub: [4, 4, 6], robo_motor: [3, 3, 6], robo_axle_short: [2, 1, 8], robo_wheel: [1, 3, 8], robo_distance_sensor: [2, 1, 3] }
      const [w, d, hgt] = sizes[b.partId] ?? [1, 1, 3]
      const rw = b.rotation % 2 ? d : w, rd = b.rotation % 2 ? w : d
      for (const dx of [0, rw]) for (const dz of [0, rd]) for (const dy of [0, hgt]) points.push({ x: (b.x + dx - half) * STUD, y: (b.y + dy) * PLATE, z: (b.z + dz - half) * STUD })
    }
    const projected = points.map((p) => h.project(p))
    const inside = projected.every((p) => p.inFront && p.x >= free.left - 2 && p.x <= free.right + 2 && p.y >= free.top - 2 && p.y <= free.bottom + 2)
    return { inside, free, insets, corners: projected.length, sample: projected.slice(0, 2).map((p) => [Math.round(p.x), Math.round(p.y)]) }
  }, brickIds)
}

/* ---------------------------------------------------------------- A. rover by pointer */
console.log('\nA. Rover assembled with the mouse')
await brick((state) => state.newBuild())
await brick((state) => state.requestView('home'))
await sleep(600)
const ids = {}
// The plate: aim at the baseplate where its centre should be.
ids.plate = (await placeByPointer({ partId: 'plate_6x8', point: world(31, 0, 30), expect: { x: 28, y: 0, z: 26 } })).id
// The hub on the plate's studs: the first device, so the card opens and frames the pair.
ids.hub = (await placeByPointer({ partId: 'robo_hub', point: world(31, 1, 29), expect: { x: 29, y: 1, z: 27 } })).id
await sleep(500)
check('A.card-opens-on-first-device', (await cardState())?.creationId === null, 'placing the hub on non-creation bricks opens the creation card')
let framed = await framedInsideFreeArea([ids.plate, ids.hub])
check('A.framed-in-free-area', framed.inside, `the card framed the pair inside the free canvas area (insets L${Math.round(framed.insets.left)} R${Math.round(framed.insets.right)} B${Math.round(framed.insets.bottom)}; ${framed.corners} corners checked)`)
await shot('P1-hub-card-framed')
await card.getByLabel('Creation name').fill('Pointer buggy')
await card.getByRole('button', { name: 'Not now' }).click()
await sleep(200)
check('A.named-on-card', (await creations())[0]?.name === 'Pointer buggy', 'the card named the creation')

// Motors, turned with R so their sockets face outward; aimed at the plate's studs.
ids.leftMotor = (await placeByPointer({ partId: 'robo_motor', point: world(29.5, 1, 32.5), rotation: 2, expect: { x: 28, y: 1, z: 31 }, note: 'Left motor (turned twice with R)' })).id
check('A.no-card-for-second-device', (await cardState()) === null, 'the motor joined the creation without reopening the card')
check('A.wiring-left-motor', (await wiringNote()) === 'Left motor connected to port A', `assisted wiring line: ${await wiringNote()}`)
ids.rightMotor = (await placeByPointer({ partId: 'robo_motor', point: world(32.5, 1, 32.5), expect: { x: 31, y: 1, z: 31 }, note: 'Right motor' })).id
check('A.wiring-right-motor', (await wiringNote()) === 'Right motor connected to port B', `assisted wiring line: ${await wiringNote()}`)

// Axles: hover the motor, the ghost snaps into its socket.
ids.leftAxle = (await placeByPointer({ partId: 'robo_axle_short', point: world(29.5, 7, 32.5), expect: { x: 26, y: 0, z: 32 }, note: 'Short axle snapped into the left motor socket' })).id
ids.rightAxle = (await placeByPointer({ partId: 'robo_axle_short', point: world(32.5, 7, 32.5), expect: { x: 34, y: 0, z: 32 }, note: 'Short axle snapped into the right motor socket' })).id
await shot('P2-axles-snapped')
let rover = (await creations())[0]
check('A.axles-read-as-in-sockets', rover.motors.every((m) => m.axle), `both motors report an axle: ${JSON.stringify(rover.motors.map((m) => m.axle))}`)

// Wheels: hover the axle rod, the ghost snaps onto its free end.
ids.leftWheel = (await placeByPointer({ partId: 'robo_wheel', point: world(27, 4, 32.5), expect: { x: 25, y: 0, z: 31 }, note: 'Wheel snapped onto the left axle end' })).id
ids.rightWheel = (await placeByPointer({ partId: 'robo_wheel', point: world(35, 4, 32.5), expect: { x: 36, y: 0, z: 31 }, note: 'Wheel snapped onto the right axle end' })).id
// The sensor on the plate's far edge, facing forward: that edge is behind the hub from the home angle, so from the top view.
await view('Top view')
ids.sensor = (await placeByPointer({ partId: 'robo_distance_sensor', point: world(31, 1, 26.5), expect: { x: 30, y: 1, z: 26 }, note: 'Distance sensor (from the top view)' })).id
await view('3D view')
check('A.wiring-sensor', (await wiringNote()) === 'Front sensor connected to port C', `assisted wiring line: ${await wiringNote()}`)
check('A.still-no-card', (await cardState()) === null, 'seven more parts and the card never reopened')
await sleep(200)
rover = (await creations())[0]
check('A.one-creation', rover.brickIds.length === 9 && rover.bodies === 3, `one creation over ${rover.brickIds.length} bricks and ${rover.bodies} bodies`)
check('A.wheels-on-motors', rover.wheels.length === 2 && rover.wheels.every((w) => w.onAxle) && rover.motors.every((m) => m.wheels === 1), `wheels: ${JSON.stringify(rover.wheels)}`)
check('A.ready-line', rover.lines.ready === 'Axles and wheels on both motors, so it can roll', `ready line: ${rover.lines.ready}`)
check('A.part-colours', (await brick((s) => s.bricks.map((b) => b.color))).filter((c, i, all) => all.indexOf(c) === i).length >= 5, 'the parts arrived in their own colours')
await robo((state, list) => state.requestFrame(list), Object.values(ids))
await sleep(700)
framed = await framedInsideFreeArea(Object.values(ids))
check('A.rover-framed', framed.inside, `the whole rover framed inside the free area (${framed.corners} corners)`)
await shot('P3-rover-built')

// Drive: it rolls; the document is untouched by the run and by Reset.
const before = await snapshot()
await page.getByRole('button', { name: 'Drive forward 40%' }).click()
await waitForSim()
await sleep(2600)
let sim = await simState()
let chassis = sim.poses[await bodyOf(ids.plate)]
check('A.rolls', chassis.position.z < -1 && Math.abs(chassis.position.x) < 0.6 && Math.abs(yawOf(chassis)) < 15, `after 2.6 s: moved ${(-chassis.position.z).toFixed(2)} forward, ${chassis.position.x.toFixed(2)} sideways, yaw ${yawOf(chassis).toFixed(1)}°`)
check('A.clock', sim.elapsed > 2.2 && sim.elapsed < 3.2, `simulated ${sim.elapsed.toFixed(2)} s in about 2.6 s of wall time`)
await shot('P4-rover-rolls')
await resetNudge()
check('A.reset-document-unchanged', (await snapshot()) === before, 'document identical after Nudge + Reset')

// Edit while running: placing a brick with the mouse retires the run; the edit stays; Undo takes only the brick.
// (While a run is live the creation's authored bricks are hidden and the moving bodies drawn instead, so the
// brick goes on clear baseplate beside the rover: aiming at the plate's authored spot would hit the baseplate.)
await page.getByRole('button', { name: 'Drive forward 40%' }).click()
await waitForSim()
await sleep(600)
const extra = await placeByPointer({ partId: 'brick_1x1', point: world(36.5, 0, 28.5), expect: { x: 36, y: 0, z: 28 }, note: '1 × 1 brick placed while the rover ran' })
await sleep(200)
check('A.edit-retires-run', (await simState()) === null && await page.getByTestId('robotics-sim-status').textContent() === 'Built pose', 'an edit while the nudge ran retired it and the studio shows the built pose')
check('A.edit-kept', (await brick((state, id) => state.bricks.some((b) => b.id === id), extra.id)), 'the brick placed during the run is part of the construction')
await shot('P5-edit-while-running')
await page.getByRole('button', { name: 'Undo', exact: true }).first().click() // the history cluster: the brick
await sleep(200)
check('A.edit-undone', (await snapshot()) === before, 'Undo removed only that brick: the document is the pre-run document again')

// Wheel left off its axle, with the keyboard: select the wheel with a click, nudge it a stud outward.
const wheelAt = await screenOf(world(25.5, 4, 32.5))
await page.mouse.click(wheelAt.x, wheelAt.y)
await sleep(200)
check('A.wheel-selected', (await brick((state) => state.selectedId)) === ids.leftWheel, 'clicking the wheel selects it')
await page.keyboard.press('ArrowLeft')
await sleep(250)
let loose = (await creations())[0]
const looseWheel = loose.wheels.find((w) => w.id === ids.leftWheel)
check('A.wheel-off-note', looseWheel && !looseWheel.onAxle && looseWheel.note.startsWith('Not on an axle'), `wheel card: ${looseWheel?.note}`)
check('A.wheel-off-selected-part', (await page.getByTestId('robotics-selected-part').textContent()).includes('Not on an axle'), 'selected wheel says Not on an axle')
await page.getByRole('button', { name: 'Run 40%' }).first().click()
await waitForSim()
await sleep(1600)
sim = await simState()
chassis = sim.poses[await bodyOf(ids.plate)]
check('A.wheel-off-motor-spins', Math.abs(sim.angles[ids.leftMotor] ?? 0) > 2 && sim.hidden === 8 && Math.hypot(chassis.position.x, chassis.position.z) < 0.2, `left motor output turned ${((sim.angles[ids.leftMotor] * 180) / Math.PI).toFixed(0)}°, wheel stayed, body moved ${Math.hypot(chassis.position.x, chassis.position.z).toFixed(2)}`)
await shot('P6-wheel-off-axle')
await resetNudge()
await page.keyboard.press('ArrowRight')
await sleep(250)
await page.keyboard.press('Escape')
check('A.wheel-back-on', (await creations())[0].wheels.every((w) => w.onAxle), 'nudged back, the wheel is on its axle again')
const roverFinal = await snapshot()
check('A.document-as-built', roverFinal === before, 'the construction is exactly what was built')

/* ---------------------------------------------------------------- D. cold reload */
console.log('\nD. Cold reload')
await sleep(900) // autosave delay
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.project), null, { timeout: 30_000 })
await sleep(500)
check('D.round-trip', (await snapshot()) === roverFinal, 'the document round-trips through autosave and a cold reload byte for byte')
const reloaded = (await creations())[0]
check('D.creation-survives', reloaded?.name === 'Pointer buggy' && reloaded.motors.every((m) => m.port) && reloaded.sensors[0]?.port === 'C', 'creation name and all three cables survive the reload')
await shot('P7-reloaded')

/* ---------------------------------------------------------------- B. gate by pointer */
console.log('\nB. Gate assembled with the mouse')
await brick((state) => state.newBuild())
await brick((state) => state.requestView('home'))
await sleep(600)
const gate = {}
gate.plate = (await placeByPointer({ partId: 'plate_6x8', point: world(23, 0, 24), expect: { x: 20, y: 0, z: 20 } })).id
gate.leftPost = (await placeByPointer({ partId: 'pillar_1x1', point: world(20.5, 1, 20.5), expect: { x: 20, y: 1, z: 20 }, note: 'Left post' })).id
gate.rightPost = (await placeByPointer({ partId: 'pillar_1x1', point: world(25.5, 1, 20.5), expect: { x: 25, y: 1, z: 20 }, note: 'Right post' })).id
gate.sill = (await placeByPointer({ partId: 'plate_2x4', point: world(23, 1, 22), rotation: 1, expect: { x: 21, y: 1, z: 21 }, note: 'Sill (turned once)' })).id
gate.hinge = (await placeByPointer({ partId: 'robo_hinge_motor', point: world(22, 2, 22), expect: { x: 21, y: 2, z: 21 }, note: 'Hinge motor on the sill' })).id
await sleep(400)
check('B.card-on-hinge', (await cardState())?.creationId === null && await card.getByText('Hinge motor added').count() === 1, 'placing the hinge motor opens the card')
await card.getByLabel('Creation name').fill('Pointer gate')
await card.getByRole('button', { name: 'Not now' }).click()
await sleep(150)
gate.door = (await placeByPointer({ partId: 'brick_1x4', point: world(22.6, 8, 21.5), rotation: 1, expect: { x: 21, y: 8, z: 21 }, note: 'Door on the turntable (turned once)' })).id
gate.hub = (await placeByPointer({ partId: 'robo_hub', point: world(22, 1, 26), expect: { x: 20, y: 1, z: 24 }, note: 'Hub' })).id
check('B.hub-powers-waiting-hinge', (await wiringNote()) === 'Arm motor connected to port A', `hub arrival wires the hinge: ${await wiringNote()}`)
check('B.no-card-for-hub', (await cardState()) === null, 'the hub joined the gate without reopening the card')
gate.sensor = (await placeByPointer({ partId: 'robo_distance_sensor', point: world(22, 7, 27.5), expect: { x: 21, y: 7, z: 27 }, note: 'Sensor on the hub' })).id
await sleep(200)
let g = (await creations())[0]
check('B.base-and-arm', g.kind === 'gate' && g.bodies === 2 && g.arms === 1 && g.hinges[0].arm === 1 && !g.hinges[0].locked, `gate: ${g.bodies} bodies, ${g.arms} arm, hinge carries ${g.hinges[0].arm} brick`)
check('B.my-world', g.testSpace === 'myWorld', 'a gate runs in my world by default')
await robo((state, list) => state.requestFrame(list), Object.values(gate))
await sleep(700)
await shot('P8-gate-built')
const gateBefore = await snapshot()
await page.getByRole('button', { name: 'Swing to 60°', exact: true }).first().click()
await waitForSim()
await sleep(2600)
sim = await simState()
const report = sim.reports[gate.hinge]
const armBody = await bodyOf(gate.door)
const frameBody = await bodyOf(gate.leftPost)
check('B.swings', frameBody !== armBody && report && report.angle > 55 && report.angle < 65 && sim.poses[frameBody].rotation.w === 1, `hinge at ${report?.angle?.toFixed(1)}°, frame unmoved`)
await shot('P9-gate-swings')
await resetNudge()
check('B.reset-unchanged', (await snapshot()) === gateBefore, 'document identical after the swing + Reset')

// Build the door into the frame with two bricks under its far end.
await view('Top view')
gate.bridge1 = (await placeByPointer({ partId: 'brick_2x2', point: world(24, 2, 22.4), expect: { x: 23, y: 2, z: 21 }, note: 'Bridge brick 1 (from the top view)' })).id
gate.bridge2 = (await placeByPointer({ partId: 'brick_2x2', point: world(24, 5, 22.4), expect: { x: 23, y: 5, z: 21 }, note: 'Bridge brick 2 (from the top view)' })).id
await view('3D view')
await sleep(250)
g = (await creations())[0]
check('B.locked', g.hinges[0].locked && g.arms === 0, `the arm is built into the frame: locked ${g.hinges[0].locked}`)
check('B.locked-line', g.lines.ready.includes("built into the frame, so it can't swing"), `ready line: ${g.lines.ready}`)
await page.getByRole('button', { name: 'Swing to 60°', exact: true }).first().click()
await sleep(700)
check('B.locked-nudge-explains', (await toast())?.includes('built into the frame'), `nudge on a locked hinge: ${await toast()}`)
await shot('P10-gate-locked')
await robo((state) => state.resetSim())

await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768', input: 'real mouse and keyboard via Playwright CDP; positions from the studio\'s own world→screen projection', at: new Date().toISOString(), results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
