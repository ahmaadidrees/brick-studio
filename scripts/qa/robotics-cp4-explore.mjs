/**
 * Robot Workshop spike, checkpoint 4, lane E (Explore riding): ride the rover in real Chrome.
 *
 * Drives the real studio at 1366×768 against a dev server started in the robotics mode
 * (`npx vite --mode robotics --port 5246 --strictPort --host 127.0.0.1`). The rover is built
 * from loose parts through the studio's own placement actions (choosePart → rotate →
 * setDraftPosition → placeDraft), exactly as robotics-spike-cp1.mjs and robotics-cp2-run.mjs
 * do, with a seat on its hub, and named "Mars buggy" through the creation card's action. Then
 * everything the student does is real input: the Explore switch in the header, walking up with
 * the W key, E to ride, W / ← to drive and turn, E to hop off, the prompt's Ride and Hop off
 * buttons, walking into the rover with W, and Back to building. Measurements are read through the dev-only `window.__robotics.exploreRides`
 * hook (a debug read of the ride store, the run controller and the Explore physics world).
 * The one camera nudge (aiming the follow camera at the rover before walking into it) is a
 * `touchYaw` write, noted in the results.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp4-explore.mjs
 *
 * Writes PNGs, results.json under docs/qa/robotics-cp4/explore/.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5246', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-cp4/explore')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const results = []
const measurements = {}
const consoleErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => consoleErrors.push(String(error)))
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }
const shots = []
const shot = async (name) => { const file = path.join(out, `${name}.png`); await page.screenshot({ path: file }); shots.push(`${name}.png`); console.log(`  shot ${name}.png`); return file }
const sleep = (ms) => page.waitForTimeout(ms)
const STUD = 0.62

await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
await page.goto(`${origin}/build`)
await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.stageStore), null, { timeout: 30_000 })
await page.waitForSelector('canvas')

/* ---------------------------------------------------------------- helpers */
const brick = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const robo = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), arg), { src: fn.toString(), arg })
const debug = () => page.evaluate(() => window.__robotics.exploreRides?.debug() ?? null)
const promptText = () => page.evaluate(() => document.querySelector('.explore-ride-prompt[data-visible="true"]')?.textContent ?? '')

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
const history = () => brick((state) => ({ undo: state.undoStack.length, redo: state.redoStack.length }))
const frame = async (brickIds) => { await robo((state, ids) => state.requestFrame(ids), brickIds); await sleep(700) }
async function waitFor(predicate, { timeout = 8000, every = 50 } = {}) {
  const start = Date.now()
  for (;;) {
    const value = await predicate()
    if (value) return value
    if (Date.now() - start > timeout) return null
    await sleep(every)
  }
}
/** Distance (studs, on the ground) from a point to a rotated footprint's edge; 0 inside. */
function footprintDistance(point, footprint) {
  const dx = point.x - footprint.center.x
  const dz = point.z - footprint.center.z
  const axisZ = { x: -footprint.axisX.z, z: footprint.axisX.x }
  const u = Math.max(0, Math.abs(dx * footprint.axisX.x + dz * footprint.axisX.z) - footprint.halfX)
  const v = Math.max(0, Math.abs(dx * axisZ.x + dz * axisZ.z) - footprint.halfZ)
  return Math.hypot(u, v) / STUD
}
const angleBetween = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places

/* ---------------------------------------------------------------- A. build the rover with a seat */
console.log('\nA. Build: the rover from loose parts, a seat on its hub, named Mars buggy')
await brick((state) => state.newBuild())
await sleep(150)
const GREY = '#52636c'
const rover = {}
rover.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
rover.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
await robo((state) => state.confirmCard('Mars buggy', false))
await sleep(100)
rover.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
rover.rightMotor = await place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0, color: GREY })
rover.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
rover.rightAxle = await place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
rover.leftWheel = await place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
rover.rightWheel = await place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
rover.sensor = await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
rover.seat = await place({ partId: 'robo_seat', x: 30, y: 7, z: 28, color: '#3e83d7' })
// My world: a few loose bricks, well clear of the drive, that stay static scenery.
const scenery = []
for (const spot of [{ x: 14, y: 0, z: 18 }, { x: 14, y: 3, z: 18 }, { x: 46, y: 0, z: 20, rotation: 1 }, { x: 44, y: 0, z: 40 }]) scenery.push(await place({ partId: 'brick_2x4', color: '#6fae5b', ...spot }))
await sleep(250)
const creation = await robo((state) => { const c = state.model.creations[0]; return { id: c.id, name: c.name, kind: c.kind, seats: c.seats, drivePair: Boolean(c.drivePair), bricks: c.brickIds.length, plugged: c.motors.map((m) => m.plugged) } })
check('A.rover-with-seat', creation.name === 'Mars buggy' && creation.kind === 'rover' && creation.seats.length === 1 && creation.seats[0] === rover.seat && creation.drivePair && creation.bricks === 10 && creation.plugged.every(Boolean),
  `“${creation.name}”, a ${creation.kind} of ${creation.bricks} bricks with seat ${creation.seats[0]}, drive pair ${creation.drivePair}, motors plugged ${JSON.stringify(creation.plugged)} (assisted wiring)`)
await frame([...Object.values(rover), ...scenery])
await shot('A1-build-rover-with-seat')
const before = await snapshot()
const historyBefore = await history()

/* ---------------------------------------------------------------- B. Explore, walk up */
console.log('\nB. Explore: walk up to the seat with the keyboard')
await page.getByRole('radio', { name: 'Explore' }).click()
await page.waitForFunction(() => window.__robotics.brickStore.getState().mode === 'explore' && Boolean(window.__robotics.exploreRides), null, { timeout: 15_000 })
await page.waitForFunction(() => window.__robotics.brickStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 15_000 })
// The character reports itself to the ride layer every frame once it has spawned.
const spawned = await waitFor(async () => (await debug())?.avatar, { timeout: 10_000 })
const startState = await debug()
check('B.explore-ready', spawned && startState.active && startState.candidates.length === 1 && startState.candidates[0].status === 'rideable' && startState.liveIds.length === 0,
  `Explore open, the character spawned at ${JSON.stringify(spawned)}; candidate ${JSON.stringify(startState.candidates.map((c) => ({ name: c.name, status: c.status, program: c.program })))}`)
// Click the canvas once so the keyboard is the page's (no field or button has focus).
await page.mouse.click(683, 420)
await sleep(300)
await shot('B1-explore-start')

const walkStart = (await debug()).avatar
await page.keyboard.down('w')
const near = await waitFor(async () => { const d = await debug(); return d.nearestId ? d : null }, { timeout: 6000, every: 40 })
await page.keyboard.up('w')
await sleep(400)
const atSeat = await debug()
const walked = Math.hypot(atSeat.avatar.x - walkStart.x, atSeat.avatar.z - walkStart.z) / STUD
const nearText = await promptText()
measurements.walk = { from: walkStart, to: atSeat.avatar, studs: round(walked, 2), method: 'keyboard (W held until the prompt appeared)' }
check('B.walked-up-with-keys', near && walked > 2 && atSeat.nearestId === creation.id, `walked ${walked.toFixed(1)} studs with W held; the seat is near (nearestId ${atSeat.nearestId})`)
check('B.prompt', /Mars buggy/.test(nearText) && /Press E to ride Mars buggy/.test(nearText) && /Ride/.test(nearText) && /Joystick drive/.test(nearText), `prompt: “${nearText}”`)
await shot('B2-prompt-press-e-to-ride')

/* ---------------------------------------------------------------- C. ride and drive */
console.log('\nC. Ride: E, then drive with W and turn with ←')
await page.keyboard.press('e')
const riding = await waitFor(async () => { const d = await debug(); return d.phase === 'riding' && d.rides.length === 1 ? d : null })
await sleep(500)
const seated = await debug()
const ride0 = seated.rides[0]
const seatGap = Math.hypot(seated.avatar.x - ride0.seat.x, seated.avatar.z - ride0.seat.z)
const hiddenCount = await page.evaluate(() => window.__robotics.brickStore.getState().bricks.length)
const ridingText = await promptText()
check('C.riding', riding && seated.riding === creation.id && ride0.controllerPhase === 'running' && ride0.program?.source === 'starter' && ride0.program?.name === 'Joystick drive',
  `riding ${seated.riding}; the controller runs “${ride0.program?.name}” (${ride0.program?.source}, compiled on the fly, not saved)`)
check('C.seated', seatGap < 0.05 && seated.avatar.y > ride0.seat.y && seated.avatar.y - ride0.seat.y < 0.6, `the character sits on the seat: ${seatGap.toFixed(3)} units from the seat centre on the ground, ${(seated.avatar.y - ride0.seat.y).toFixed(3)} above the pan`)
check('C.mirrored', ride0.mirroredBodies === ride0.bodies && ride0.hiddenBricks === creation.bricks && Math.abs(ride0.mirroredChassis.y - ride0.chassis.y) < 0.02,
  `${ride0.mirroredBodies}/${ride0.bodies} controller bodies mirrored as kinematic bodies in the Explore world; the studio hides the creation's ${ride0.hiddenBricks} bricks (of ${hiddenCount}); chassis ${JSON.stringify(ride0.chassis)} ↔ mirror ${JSON.stringify(ride0.mirroredChassis)}`)
check('C.prompt', /Riding Mars buggy/.test(ridingText) && /Press E to hop off/.test(ridingText) && /Hop off/.test(ridingText), `prompt: “${ridingText}”`)
await shot('C1-riding-seated')

// Idle for a moment: nothing moves without a key (the program reads the keys; nothing drives by itself).
const idleFrom = (await debug()).rides[0]
await sleep(700)
const idleTo = (await debug()).rides[0]
const idleDrift = Math.hypot(idleTo.chassis.x - idleFrom.chassis.x, idleTo.chassis.z - idleFrom.chassis.z) / STUD
check('C.still-without-keys', idleDrift < 0.1, `with no key held the rover moved ${idleDrift.toFixed(3)} studs in 0.7 s`)

const driveFrom = (await debug()).rides[0]
await page.keyboard.down('w')
await sleep(1100)
const driving = await debug()
await shot('C2-driving-forward')
await page.keyboard.up('w')
await sleep(700)
const driveTo = (await debug()).rides[0]
const driven = Math.hypot(driveTo.chassis.x - driveFrom.chassis.x, driveTo.chassis.z - driveFrom.chassis.z) / STUD
const alongForward = (driveFrom.chassis.z - driveTo.chassis.z) / STUD
const carried = Math.hypot(driving.avatar.x - driving.rides[0].seat.x, driving.avatar.z - driving.rides[0].seat.z)
measurements.drive = { from: driveFrom.chassis, to: driveTo.chassis, studs: round(driven, 2), forwardStuds: round(alongForward, 2), speedWhileHeld: driving.rides[0].speed, riderToSeatWhileDriving: round(carried, 3) }
check('C.drove-forward', driven > 4 && alongForward > 4 && Math.abs(angleBetween(driveTo.yaw, driveFrom.yaw)) < 0.15,
  `W held 1.1 s: the rover drove ${driven.toFixed(1)} studs (${alongForward.toFixed(1)} along its forward, -Z), heading change ${(angleBetween(driveTo.yaw, driveFrom.yaw) * 180 / Math.PI).toFixed(1)}°`)
check('C.rider-carried', carried < 0.12, `while driving, the character stayed on the seat (${carried.toFixed(3)} units from it: one physics step at speed)`)

const turnFrom = (await debug()).rides[0]
await page.keyboard.down('ArrowLeft')
await sleep(1000)
await page.keyboard.up('ArrowLeft')
await sleep(600)
const turnTo = (await debug()).rides[0]
const turned = angleBetween(turnTo.yaw, turnFrom.yaw) * 180 / Math.PI
const turnMove = Math.hypot(turnTo.chassis.x - turnFrom.chassis.x, turnTo.chassis.z - turnFrom.chassis.z) / STUD
measurements.turn = { fromYawDeg: round(turnFrom.yaw * 180 / Math.PI, 1), toYawDeg: round(turnTo.yaw * 180 / Math.PI, 1), turnedDeg: round(turned, 1), chassisMovedStuds: round(turnMove, 2) }
check('C.turned', Math.abs(turned) > 45 && turnMove < 2, `← held 1.0 s: the rover turned ${turned.toFixed(0)}° (positive = left) and its chassis moved ${turnMove.toFixed(2)} studs`)
await shot('C3-turned-left')

/* ---------------------------------------------------------------- D. hop off */
console.log('\nD. Hop off: E, then walk into the rover')
await page.keyboard.press('e')
const walking = await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })
await sleep(600)
const hopped = await debug()
const parked = hopped.rides[0]
const besideStuds = footprintDistance(hopped.avatar, parked.footprint)
measurements.hopOff = { avatar: hopped.avatar, parkedChassis: parked.chassis, studsFromFootprint: round(besideStuds, 2), groundY: round(hopped.avatar.y, 3) }
check('D.hopped-off', walking && hopped.riding === null && hopped.liveIds.length === 1 && parked.controllerPhase === 'stopped', `hopped off: walking again, the rover parked and braked (${parked.controllerPhase}), still live where it stopped`)
check('D.beside-on-ground', besideStuds > 0.05 && besideStuds < 2 && hopped.avatarOverlaps === 0 && Math.abs(hopped.avatar.y - 0.39) < 0.06,
  `the character stands ${besideStuds.toFixed(2)} studs from the rover's footprint, on the plate (capsule centre y ${hopped.avatar.y}), overlapping none of its colliders`)
const parkedText = await promptText()
check('D.can-ride-again', hopped.nearestId === creation.id && /Press E to ride Mars buggy/.test(parkedText), `beside it the prompt offers the ride again: “${parkedText}”`)
await shot('D1-hopped-off-beside')

// The prompt's buttons (the touch path) with a mouse: Ride, drive a little with W (the button kept no
// focus, so the keys still work), Hop off.
await page.getByRole('button', { name: 'Ride' }).click()
const byButton = await waitFor(async () => { const d = await debug(); return d.phase === 'riding' ? d : null }, { timeout: 3000 })
const buttonFrom = (await debug()).rides[0].chassis
await page.keyboard.down('w')
await sleep(450)
await page.keyboard.up('w')
await sleep(500)
const buttonTo = (await debug()).rides[0].chassis
const focused = await page.evaluate(() => document.activeElement?.tagName ?? null)
const buttonDrive = Math.hypot(buttonTo.x - buttonFrom.x, buttonTo.z - buttonFrom.z) / STUD
check('D.ride-button', byButton && buttonDrive > 1 && focused !== 'BUTTON', `the Ride button starts a ride; W then drove ${buttonDrive.toFixed(1)} studs (focus on ${focused}, not the button)`)
await page.getByRole('button', { name: 'Hop off' }).click()
const byHopButton = await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })
await sleep(600)
const hopped2 = await debug()
check('D.hop-off-button', byHopButton && hopped2.riding === null && hopped2.avatarOverlaps === 0 && footprintDistance(hopped2.avatar, hopped2.rides[0].footprint) > 0.05, `the Hop off button puts the character down ${footprintDistance(hopped2.avatar, hopped2.rides[0].footprint).toFixed(2)} studs from the rover`)
measurements.buttons = { droveStuds: round(buttonDrive, 2), focusAfterRide: focused, hopOffAvatar: hopped2.avatar }

// Walk into it: aim the follow camera from the character to the rover's centre, then hold W.
const aim = await page.evaluate(({ avatar, center }) => {
  const yaw = Math.atan2(center.x - avatar.x, center.z - avatar.z)
  window.__robotics.brickStore.setState({ touchYaw: yaw, exploreManualLookAt: Date.now() })
  return yaw
}, { avatar: hopped2.avatar, center: hopped2.rides[0].footprint.center })
await sleep(500)
const trail = []
let maxOverlap = 0
await page.keyboard.down('w')
const walkIntoStart = Date.now()
while (Date.now() - walkIntoStart < 2200) {
  const d = await debug()
  trail.push({ t: Date.now() - walkIntoStart, x: d.avatar.x, y: d.avatar.y, z: d.avatar.z, footprint: round(footprintDistance(d.avatar, d.rides[0].footprint), 3) })
  maxOverlap = Math.max(maxOverlap, d.avatarOverlaps)
  await sleep(80)
}
await page.keyboard.up('w')
await sleep(300)
const blocked = await debug()
// Look down from higher and further back (camera only) to show the character stopped against the rover.
await page.evaluate(() => { window.__robotics.brickStore.setState({ touchPitch: 1.0, touchCameraDistance: 8, exploreManualLookAt: Date.now() }) })
await sleep(1500)
await shot('D2-walked-into-rover-blocked')
const firstPoint = trail[0]
const lastPoints = trail.slice(-6)
const target = hopped2.rides[0]
const closest = Math.min(...trail.map((point) => Math.hypot(point.x - target.footprint.center.x, point.z - target.footprint.center.z)))
const startGap = Math.hypot(firstPoint.x - target.footprint.center.x, firstPoint.z - target.footprint.center.z)
const stalled = Math.hypot(lastPoints[lastPoints.length - 1].x - lastPoints[0].x, lastPoints[lastPoints.length - 1].z - lastPoints[0].z)
const roverMoved = Math.hypot(blocked.rides[0].chassis.x - target.chassis.x, blocked.rides[0].chassis.z - target.chassis.z)
measurements.walkInto = { aimYaw: round(aim, 3), startDistanceToCentre: round(startGap, 3), closestDistanceToCentre: round(closest, 3), stalledOverLast: round(stalled, 3), maxAvatarOverlaps: maxOverlap, roverMoved: round(roverMoved, 4), trail }
check('D.solid', maxOverlap === 0 && closest > 1.2 && closest < startGap - 0.3 && stalled < 0.15 && roverMoved < 0.01,
  `W held 2.2 s toward the rover: the character closed from ${startGap.toFixed(2)} to ${closest.toFixed(2)} units of its centre and stopped (moved ${stalled.toFixed(3)} over the last 0.4 s), never overlapping its colliders; the rover did not move (${roverMoved.toFixed(4)})`)

/* ---------------------------------------------------------------- E. leave Explore */
console.log('\nE. Back to building: the construction is exactly as before')
await page.getByRole('button', { name: 'Back to building' }).click()
await page.waitForFunction(() => window.__robotics.brickStore.getState().mode === 'build', null, { timeout: 10_000 })
await sleep(600)
const after = await snapshot()
const historyAfter = await history()
const hiddenAfter = await page.evaluate(() => document.querySelectorAll('.explore-ride-prompt').length)
check('E.document-unchanged', after === before, `document snapshot identical after the ride (${before.length} characters, sorted keys)`)
check('E.history-unchanged', historyAfter.undo === historyBefore.undo && historyAfter.redo === historyBefore.redo, `undo ${historyBefore.undo} → ${historyAfter.undo}, redo ${historyBefore.redo} → ${historyAfter.redo}`)
check('E.ride-layer-gone', hiddenAfter === 0 && !(await page.evaluate(() => Boolean(window.__robotics.exploreRides))), 'the ride layer and prompt unmounted with Explore')
await frame([...Object.values(rover), ...scenery])
await shot('E1-build-after-explore-authored-pose')

// Explore again: the rover is back where it was built, static, nothing live.
await page.getByRole('radio', { name: 'Explore' }).click()
await page.waitForFunction(() => Boolean(window.__robotics.exploreRides) && window.__robotics.brickStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 15_000 })
await sleep(800)
const again = await debug()
check('E.explore-again-authored', again.liveIds.length === 0 && again.phase === 'walking', `Explore again: nothing live (${JSON.stringify(again.liveIds)}); every creation is its static, authored self`)
await shot('E2-explore-again-authored-pose')
await page.getByRole('button', { name: 'Back to building' }).click()
await page.waitForFunction(() => window.__robotics.brickStore.getState().mode === 'build', null, { timeout: 10_000 })
check('E.document-still-unchanged', (await snapshot()) === before, 'still identical after a second visit')

check('console-clean', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'no console errors')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768', at: new Date().toISOString(), results, measurements, screenshots: shots }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
