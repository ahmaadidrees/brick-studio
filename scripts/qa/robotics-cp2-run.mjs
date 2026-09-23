/**
 * Robot Workshop spike, checkpoint 2, lane M (mechanics and run controller): the stage in real Chrome.
 *
 * Drives the real studio at 1366×768 against a dev server started in the robotics mode
 * (`npx vite --mode robotics --port 5242 --strictPort --host 127.0.0.1`). The rover, the gate
 * and the signal post are built from loose parts through the studio's own placement actions
 * (choosePart → rotate → setDraftPosition → placeDraft), exactly as in robotics-spike-cp1.mjs,
 * so assisted wiring and the creation card run for real. The stage is then driven through the
 * dev-only `window.__robotics.stageStore` (the seam the Code view will call): openStage, a
 * plain-object runtime implementing `tick` run with runOnStage, triggerVisitor, resetStage and
 * closeStage. The scene advances the run controller from its own frame loop with real frame time.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp2-run.mjs
 *
 * Writes PNGs and results.json under docs/qa/robotics-cp2/run/.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5242', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-cp2/run')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const results = []
const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(String(error)))
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }
const shot = async (name) => { const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); console.log(`  shot ${name}.png`); return file }
const sleep = (ms) => page.waitForTimeout(ms)

await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
await page.goto(`${origin}/build`)
await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.stageStore), null, { timeout: 30_000 })
await page.waitForSelector('canvas')

/* ---------------------------------------------------------------- helpers */
const brick = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const robo = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), arg), { src: fn.toString(), arg })
const stage = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.stageStore.getState(), arg), { src: fn.toString(), arg })

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
  await sleep(80)
  return brick((state) => state.bricks[state.bricks.length - 1].id)
}
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
const snapshot = async () => JSON.stringify(sortKeys(JSON.parse(await brick((state) => JSON.stringify(state.getDocumentSnapshot())))))
const newBuild = async () => { await stage((state) => state.closeStage()); await robo((state) => state.resetSim()); await brick((state) => state.newBuild()); await sleep(150) }
const confirmCard = async (name) => { await robo((state, n) => state.confirmCard(n, false), name); await sleep(100) }
const frame = async (brickIds) => { await robo((state, ids) => state.requestFrame(ids), brickIds); await sleep(700) }
const observation = () => stage((state) => {
  const o = state.stageObservation
  return o && { phase: o.phase, tick: o.tick, timeSeconds: o.timeSeconds, sensors: o.sensors, motors: o.motors, lights: o.lights, beams: o.beams.map((b) => ({ deviceId: b.deviceId, hit: b.hit })), contacts: o.contacts.length, diagnostics: o.diagnostics, speedStudsPerSecond: o.speedStudsPerSecond, visitorPhase: o.visitorPhase }
})
const openStage = async (creationId, space) => {
  await stage((state, a) => { void state.openStage(a.creationId, a.space) }, { creationId, space })
  await page.waitForFunction(() => window.__robotics.stageStore.getState().stage !== null, null, { timeout: 20_000 })
  await sleep(400)
}
const GREY = '#52636c'
/** A few loose bricks around the plate: "my world", which the test plate leaves out. */
async function placeScenery(spots) {
  const ids = []
  for (const spot of spots) ids.push(await place({ partId: 'brick_2x4', color: '#6fae5b', ...spot }))
  return ids
}

/* ---------------------------------------------------------------- A. rover on the test plate */
console.log('\nA. Rover on the test plate: stop before the wall')
await newBuild()
const rover = {}
rover.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
rover.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
await confirmCard('Mars buggy')
rover.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
rover.rightMotor = await place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0, color: GREY })
rover.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
rover.rightAxle = await place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
rover.leftWheel = await place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
rover.rightWheel = await place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
rover.sensor = await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
const scenery = await placeScenery([{ x: 18, y: 0, z: 20 }, { x: 18, y: 3, z: 20 }, { x: 42, y: 0, z: 22, rotation: 1 }, { x: 30, y: 0, z: 10 }, { x: 44, y: 0, z: 36 }])
await sleep(200)
const roverCreation = await robo((state) => { const c = state.model.creations[0]; return { id: c.id, kind: c.kind, testSpace: c.testSpace, drivePair: c.drivePair, bricks: c.brickIds.length } })
check('A.rover-built', roverCreation.kind === 'rover' && roverCreation.testSpace === 'testPlate' && roverCreation.bricks === 9 && roverCreation.drivePair?.reversedIds.length === 1, `a rover of ${roverCreation.bricks} bricks, runs on the test plate, drive pair with ${roverCreation.drivePair?.reversedIds.length} reversed motor`)
await frame([...Object.values(rover), ...scenery])
await shot('A1-world-before-stage')
const roverDocument = await snapshot()

await openStage(roverCreation.id)
// Frame the rover and the brick nearest the wall (hidden on the test plate, it still counts for framing).
await frame([...Object.values(rover), scenery[3]])
const opened = await stage((state) => ({ space: state.stage.space, hidden: state.stage.controller.hiddenBrickIds.size, total: window.__robotics.brickStore.getState().bricks.length, props: state.stage.controller.props.map((prop) => ({ kind: prop.kind, center: prop.center, size: prop.size })) }))
check('A.stage-open', opened.space === 'testPlate' && opened.hidden === opened.total && opened.props.length === 1 && opened.props[0].kind === 'wall', `stage on the ${opened.space}: ${opened.hidden}/${opened.total} studio bricks hidden, props ${JSON.stringify(opened.props.map((prop) => prop.kind))}`)
const ready = await observation()
check('A.beam-sees-wall', ready.beams.length === 1 && ready.beams[0].hit && Math.abs(ready.sensors[rover.sensor].distanceStuds - 12) < 0.6, `before Run the front sensor reads ${ready.sensors[rover.sensor].distanceStuds} studs to the wall (hit ${ready.beams[0]?.hit})`)
await shot('A2-stage-open-world-hidden-wall-beam')

await page.evaluate(() => {
  const s = window.__robotics.stageStore.getState()
  const pair = s.stage.creation.drivePair
  const sensor = s.stage.creation.sensors[0].brickId
  const reversed = new Set(pair.reversedIds)
  const source = { scriptId: 'harness', blockId: 'harness-drive', controller: false }
  let braking = false
  const runtime = {
    ticks: 0,
    brakedAt: null,
    readings: [],
    tick(snapshot) {
      runtime.ticks += 1
      const reading = snapshot.sensors[sensor]
      if (snapshot.tick % 30 === 0) runtime.readings.push({ t: snapshot.timeSeconds, d: reading.distanceStuds })
      if (!braking && reading.hit && reading.distanceStuds < 3) { braking = true; runtime.brakedAt = { t: snapshot.timeSeconds, d: reading.distanceStuds } }
      const intents = [pair.leftId, pair.rightId].map((id) => (braking ? { kind: 'motorStop', deviceId: id, source } : { kind: 'motorPower', deviceId: id, percent: reversed.has(id) ? -40 : 40, source }))
      return { intents, activeBlockIds: [source.blockId], diagnostics: [], variables: {}, idle: false }
    },
    stop() {},
  }
  window.__cp2Runtime = runtime
  window.__cp2Wall = performance.now()
  s.runOnStage(runtime)
})
await sleep(1500)
const driving = await observation()
check('A.driving', driving.phase === 'running' && driving.speedStudsPerSecond > 2.5 && driving.sensors[rover.sensor].distanceStuds < 12, `1.5 s after Run: ${driving.speedStudsPerSecond} studs/s, sensor ${driving.sensors[rover.sensor].distanceStuds} studs`)
await shot('A3-rover-driving')
await page.waitForFunction((sensor) => { const o = window.__robotics.stageStore.getState().stageObservation; return o && o.sensors[sensor].distanceStuds < 3 && Math.abs(o.speedStudsPerSecond) < 0.02 && window.__cp2Runtime.brakedAt }, rover.sensor, { timeout: 20_000 })
await sleep(600)
const stopped = await observation()
const clock = await page.evaluate(() => ({ simulated: window.__robotics.stageStore.getState().stage.controller.snapshot.timeSeconds, wall: (performance.now() - window.__cp2Wall) / 1000, dropped: window.__robotics.stageStore.getState().stage.controller.mechanics.droppedSeconds, brakedAt: window.__cp2Runtime.brakedAt, readings: window.__cp2Runtime.readings }))
const shrinking = clock.readings.every((entry, index, all) => index === 0 || entry.d <= all[index - 1].d + 0.05)
check('A.stops-before-wall', stopped.sensors[rover.sensor].hit && stopped.sensors[rover.sensor].distanceStuds > 1 && stopped.sensors[rover.sensor].distanceStuds < 3 && stopped.contacts === 0, `braked at ${clock.brakedAt.d} studs (t=${clock.brakedAt.t.toFixed(2)} s), rests ${stopped.sensors[rover.sensor].distanceStuds} studs from the wall, speed ${stopped.speedStudsPerSecond}`)
check('A.distance-shrinks', shrinking && clock.readings.length > 5, `sensor every 0.25 s: ${clock.readings.map((entry) => entry.d).join(' → ')}`)
check('A.real-time', clock.simulated > clock.wall - 0.5 && clock.simulated <= clock.wall + 0.05, `program time ${clock.simulated.toFixed(2)} s over ${clock.wall.toFixed(2)} s of wall time since Run (stalls dropped since the stage opened: ${clock.dropped.toFixed(3)} s)`)
await shot('A4-rover-stopped-before-wall')

const reset = await stage((state) => { state.resetStage(); const fresh = window.__robotics.stageStore.getState().stage; return { phase: fresh.controller.phase, poses: [...fresh.controller.poses().values()].map((pose) => pose.position) } })
check('A.reset', reset.phase === 'ready' && reset.poses.every((position) => position.x === 0 && position.z === 0), 'Reset rebuilds the stage at the built pose (every body at x = z = 0), program stopped')
await sleep(500)
await shot('A5-rover-reset')
await stage((state) => state.closeStage())
await sleep(300)
check('A.document-unchanged', (await snapshot()) === roverDocument, 'the document is identical after open, run, reset and close')

/* ---------------------------------------------------------------- B. gate in my world */
console.log('\nB. Gate in my world: someone walks up, the door opens')
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
await confirmCard('Castle gate')
gate.door = await place({ partId: 'brick_1x4', x: 21, y: 8, z: 21, rotation: 1, color: '#f4ca3a' })
gate.hub = await place({ partId: 'robo_hub', x: 20, y: 1, z: 24, color: '#f5eee0' })
gate.sensor = await place({ partId: 'robo_distance_sensor', x: 21, y: 7, z: 27, color: '#f4ca3a' })
const gateScenery = await placeScenery([{ x: 12, y: 0, z: 14 }, { x: 12, y: 3, z: 14 }, { x: 34, y: 0, z: 30 }, { x: 34, y: 0, z: 16, rotation: 1 }])
await sleep(200)
const gateCreation = await robo((state) => { const c = state.model.creations[0]; return { id: c.id, kind: c.kind, testSpace: c.testSpace, arms: c.armBodyIds.length } })
check('B.gate-built', gateCreation.kind === 'gate' && gateCreation.testSpace === 'myWorld' && gateCreation.arms === 1, `a gate with one arm, runs in ${gateCreation.testSpace}`)
await frame([...Object.values(gate), ...gateScenery])
const gateDocument = await snapshot()
await openStage(gateCreation.id)
await frame(Object.values(gate))
const gateStage = await stage((state) => ({ space: state.stage.space, hidden: state.stage.controller.hiddenBrickIds.size, total: window.__robotics.brickStore.getState().bricks.length, props: state.stage.controller.props.map((prop) => prop.kind) }))
check('B.stage-open', gateStage.space === 'myWorld' && gateStage.hidden === 11 && gateStage.total === 11 + gateScenery.length && gateStage.props[0] === 'visitor', `stage in my world: the studio hides the gate's ${gateStage.hidden} bricks and keeps ${gateStage.total - gateStage.hidden} scenery bricks; props ${JSON.stringify(gateStage.props)}`)
await page.evaluate(() => {
  const s = window.__robotics.stageStore.getState()
  const sensor = s.stage.creation.sensors[0].brickId
  const hinge = s.stage.creation.hinges[0].brickId
  const source = { scriptId: 'harness', blockId: 'harness-turn-arm', controller: false }
  s.runOnStage({ tick(snapshot) { const r = snapshot.sensors[sensor]; return { intents: r.hit && r.distanceStuds < 5 ? [{ kind: 'motorTarget', deviceId: hinge, degrees: 90, source }] : [], activeBlockIds: [], diagnostics: [], variables: {}, idle: false } }, stop() {} })
})
await sleep(500)
const waiting = await observation()
check('B.nothing-seen-yet', !waiting.sensors[gate.sensor].hit && Math.abs(waiting.motors[gate.hinge].positionDegrees) < 1, `before anyone walks up: sensor ${waiting.sensors[gate.sensor].distanceStuds} studs, arm at ${waiting.motors[gate.hinge].positionDegrees}°`)
await shot('B1-gate-my-world-waiting')
await stage((state) => state.triggerVisitor())
await page.waitForFunction(() => window.__robotics.stageStore.getState().stageObservation?.visitorPhase === 'here', null, { timeout: 10_000 })
await sleep(1400)
const open = await observation()
const armPose = await stage((state, door) => state.stage.controller.poses().get(state.stage.controller.bodyOfBrick(door)).rotation, gate.door)
check('B.door-opens', open.sensors[gate.sensor].hit && Math.abs(open.sensors[gate.sensor].distanceStuds - 3) < 0.2 && open.motors[gate.hinge].positionDegrees > 85 && open.motors[gate.hinge].positionDegrees < 95, `visitor at ${open.sensors[gate.sensor].distanceStuds} studs; arm at ${open.motors[gate.hinge].positionDegrees}°`)
check('B.about-hinge-only', Math.abs(armPose.x) < 0.02 && Math.abs(armPose.z) < 0.02, `door rotation x=${armPose.x.toFixed(4)} z=${armPose.z.toFixed(4)} (pure turn about the vertical hinge axis)`)
await shot('B2-gate-visitor-door-open')
// Orbit the camera with a right-button drag (the studio's rotate gesture) to see the visitor beside the open door.
await page.mouse.move(640, 600)
await page.mouse.down({ button: 'right' })
await page.mouse.move(800, 590, { steps: 12 })
await page.mouse.up({ button: 'right' })
await sleep(400)
await shot('B3-gate-visitor-door-open-orbit')
await stage((state) => state.resetStage())
await sleep(300)
const gateReset = await observation()
check('B.reset-zero', gateReset.motors[gate.hinge].positionDegrees === 0 && gateReset.phase === 'ready', `Reset: arm at ${gateReset.motors[gate.hinge].positionDegrees}°`)
await stage((state) => state.closeStage())
await sleep(300)
check('B.document-unchanged', (await snapshot()) === gateDocument, 'the document is identical after the gate run')

/* ---------------------------------------------------------------- C. signal post */
console.log('\nC. Signal post in my world: the light turns red')
await newBuild()
const post = {}
post.hub = await place({ partId: 'robo_hub', x: 40, y: 0, z: 40, color: '#f5eee0' })
await confirmCard('Signal post')
post.sensor = await place({ partId: 'robo_distance_sensor', x: 41, y: 6, z: 40, color: '#f4ca3a' })
post.light = await place({ partId: 'robo_light', x: 43, y: 6, z: 43, color: '#e7473c' })
await sleep(200)
const postCreation = await robo((state) => state.model.creations[0].id)
await place({ partId: 'brick_2x4', x: 50, y: 0, z: 46, color: '#6fae5b' })
await openStage(postCreation)
await frame(Object.values(post))
await page.evaluate(() => {
  const s = window.__robotics.stageStore.getState()
  const sensor = s.stage.creation.sensors[0].brickId
  const light = s.stage.creation.lights[0].brickId
  const source = { scriptId: 'harness', blockId: 'harness-light', controller: false }
  s.runOnStage({ tick(snapshot) { const r = snapshot.sensors[sensor]; return { intents: r.hit && r.distanceStuds < 5 ? [{ kind: 'light', deviceId: light, color: 'red', source }] : [], activeBlockIds: [], diagnostics: [], variables: {}, idle: false } }, stop() {} })
  s.triggerVisitor()
})
await page.waitForFunction((light) => window.__robotics.stageStore.getState().stageObservation?.lights[light] === 'red', post.light, { timeout: 10_000 })
await sleep(300)
const lit = await observation()
check('C.light-red', lit.lights[post.light] === 'red' && lit.sensors[post.sensor].hit, `light ${lit.lights[post.light]} with the visitor ${lit.sensors[post.sensor].distanceStuds} studs away`)
await shot('C1-signal-post-red')
await stage((state) => state.closeStage())

check('console-clean', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'no console errors')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768', at: new Date().toISOString(), results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
