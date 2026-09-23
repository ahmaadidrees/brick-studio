/**
 * Robot Workshop kid-UX pass, lane R (Explore rides): the journey a tester playing an 8-year-old
 * took, in real Chrome at 1366×768, and the three things it found.
 *
 *   1. Blocker: ride the Buggy, get sent back when it left the plate, press Ride again → the studio
 *      crashed ("RuntimeError: unreachable", then "recursive use of an object… in rust").
 *   2. The car drove off an edge the child could not see and she was thrown out of it.
 *   3. The ride card spoke in program jargon ("A new Joystick drive program (not saved) reads WASD / arrows").
 *
 * The Buggy kit is placed and given a seat through the studio's own actions (armKit → setDraftPosition →
 * placeDraft; choosePart → placeDraft), as the kit and cp4 harnesses build. From then on it is the
 * student's input: the Explore switch, W to walk up, E to ride, W / S to drive, E to hop off, Back to
 * building. Two things go through the dev-only `window.__robotics` hook: the measurements
 * (`exploreRides.debug()`, a read of the ride store, the run controller and the Explore physics world),
 * and one forced "back to the start" (`exploreRides.bringBack()`, what happens when a robot gets past the
 * curb, falls or tips over: the curb stops it, so driving alone no longer gets there), done three times
 * in a row while driving to stress the remount. One edit (Undo then Redo through the brick store, as a
 * student's Ctrl+Z and Ctrl+Shift+Z) retires the ride and puts the rider down: the exact remount the crash
 * came from, followed by Ride again. Before that second visit the remembered spawn point is cleared, so
 * the character starts behind the Buggy as on a first visit. Then a touch pass at 1024×768 (Chrome's touch
 * emulation): one finger on the Explore stick walks up, a tap on Ride, the card says "Drive with the stick.",
 * the stick drives, a tap on Hop off. Last, a novice tester's (Ava's) Buggy at 1024×768, a five-brick tower
 * with the seat on top: the robot panel's "Ride it in Explore" opens Explore with her seated; riding, the
 * key help steps aside; beside it on the ground the big Ride button is up and stays up; the camera beside
 * it stays out of it and on her (Recenter, scroll-zoom, walking by); walking away and back; the Ride
 * button seats her up there. The camera aims there are `touchYaw` writes (what a drag leaves), as in cp4,
 * and after a Recenter click the harness clicks the scene first: the studio keeps keys pressed on a focused
 * button from walking.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5241 node scripts/qa/robotics-kid-ride.mjs
 *
 * against `npx vite --mode robotics --port 5241 --strictPort --host 127.0.0.1`.
 * Writes PNGs and results.json under docs/qa/robotics-kid/ride/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5241', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/ride')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 })
const page = await context.newPage()
const results = []
const measurements = {}
const consoleErrors = []
const pageErrors = []
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
page.on('pageerror', (error) => pageErrors.push(String(error)))
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }
const shots = []
const shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}.png`) }); shots.push(`${name}.png`); console.log(`  shot ${name}.png`) }
const sleep = (ms) => page.waitForTimeout(ms)
const STUD = 0.62
const PLATE_HALF = (64 * STUD) / 2
const round = (value, places = 3) => Math.round(value * 10 ** places) / 10 ** places
const RUST = /unreachable|rust|recursive use|null pointer|ownership|expected instance/i
const JARGON = /program|not saved|Joystick drive|reads WASD|creation/i

await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
await page.goto(`${origin}/build`)
await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await page.reload()
await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.armKit), null, { timeout: 30_000 })
await page.waitForSelector('canvas')

/* ---------------------------------------------------------------- helpers */
const brick = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const debug = () => page.evaluate(() => window.__robotics.exploreRides?.debug() ?? null)
const card = () => page.evaluate(() => {
  const element = document.querySelector('.explore-ride-prompt[data-visible="true"]')
  if (!element) return null
  const text = (selector) => element.querySelector(selector)?.textContent ?? null
  return { state: element.getAttribute('data-state'), label: text('.explore-ride-prompt-label'), detail: text('.explore-ride-prompt-detail'), code: text('.explore-ride-prompt-code'), hint: text('.explore-ride-prompt-hint'), button: text('.explore-ride-prompt-button'), all: element.textContent }
})
async function waitFor(predicate, { timeout = 8000, every = 50 } = {}) {
  const start = Date.now()
  for (;;) {
    const value = await predicate()
    if (value) return value
    if (Date.now() - start > timeout) return null
    await sleep(every)
  }
}
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
const snapshot = async () => JSON.stringify(sortKeys(JSON.parse(await brick((state) => JSON.stringify(state.getDocumentSnapshot())))))
const history = () => brick((state) => ({ undo: state.undoStack.length, redo: state.redoStack.length }))
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
/** The footprint's nearest reach towards -Z (the rover drives -Z at first). */
const frontZ = (footprint) => footprint.center.z - Math.abs(footprint.axisX.z) * footprint.halfX - Math.abs(footprint.axisX.x) * footprint.halfZ
const rustErrors = () => [...pageErrors, ...consoleErrors].filter((text) => RUST.test(text))

/** W held (or another key) for `ms`, sampling the ride; returns the samples. */
async function hold(key, ms, every = 100) {
  const samples = []
  await page.keyboard.down(key)
  const start = Date.now()
  while (Date.now() - start < ms) {
    const d = await debug()
    const r = d.rides.find((entry) => entry.creationId === d.riding) ?? d.rides[0]
    samples.push({ t: Date.now() - start, phase: d.phase, generation: r?.generation ?? null, chassis: r?.chassis ?? null, speed: r?.speed ?? 0, avatarToSeat: r ? round(distance(d.avatar, r.seat), 3) : null, frontZ: r ? round(frontZ(r.footprint), 3) : null, notice: d.notice })
    await sleep(every)
  }
  await page.keyboard.up(key)
  return samples
}

/* ---------------------------------------------------------------- A. the Buggy kit and a seat */
console.log('\nA. Build: the Buggy kit, then a seat on its hub (“Add a seat. Ride it in Explore.”)')
await brick((state) => state.newBuild())
await sleep(150)
check('A.kit-armed', await page.evaluate(() => window.__robotics.armKit('buggy')), 'the Buggy kit is armed like a click on its card')
check('A.kit-placed', await brick((state) => { state.setDraftPosition(28, 0, 26); return state.placeDraft() }), 'placed with its plate at stud (28, 26), where the cp4 rover stands')
await sleep(300)
const hub = await brick((state) => state.bricks.find((entry) => entry.partId === 'robo_hub'))
check('A.seat-placed', await brick((state, h) => { state.choosePart('robo_seat'); state.setDraftPosition(h.x + 1, h.y + 6, h.z + 1); const ok = state.placeDraft(); state.cancelInteraction(); return ok }, hub), `a seat on the hub at (${hub.x + 1}, ${hub.y + 6}, ${hub.z + 1})`)
await sleep(300)
const buggy = await page.evaluate(() => { const c = window.__robotics.roboticsStore.getState().model.creations[0]; return { id: c.id, name: c.name, bricks: c.brickIds.length, seats: c.seats.length, drivePair: Boolean(c.drivePair), plugged: c.motors.map((m) => m.plugged) } })
check('A.buggy', buggy.name === 'Buggy' && buggy.seats === 1 && buggy.drivePair && buggy.plugged.every(Boolean), `“${buggy.name}”, ${buggy.bricks} bricks, ${buggy.seats} seat, drive pair ${buggy.drivePair}, motors plugged ${JSON.stringify(buggy.plugged)}`)
await page.evaluate((ids) => window.__robotics.roboticsStore.getState().requestFrame(ids), await brick((state) => state.bricks.map((entry) => entry.id)))
await sleep(700)
await shot('A1-buggy-with-seat')
const before = await snapshot()
const historyBefore = await history()

/* ---------------------------------------------------------------- B. Explore, walk up */
console.log('\nB. Explore: walk up to the Buggy with W')
await page.getByRole('radio', { name: 'Explore' }).click()
await page.waitForFunction(() => window.__robotics.brickStore.getState().mode === 'explore' && Boolean(window.__robotics.exploreRides), null, { timeout: 15_000 })
await page.waitForFunction(() => window.__robotics.brickStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 15_000 })
await waitFor(async () => (await debug())?.avatar, { timeout: 10_000 })
await page.mouse.click(683, 420)
await sleep(300)
await page.keyboard.down('w')
const near = await waitFor(async () => { const d = await debug(); return d.nearestId ? d : null }, { timeout: 6000, every: 40 })
await page.keyboard.up('w')
await sleep(400)
const nearCard = await card()
check('B.near', near && near.nearestId === buggy.id, `walked up with W; the Buggy is near (${near?.nearestId})`)
check('B.card-near', nearCard && nearCard.label === 'Buggy' && /Press E to ride Buggy/.test(nearCard.hint ?? '') && nearCard.button === 'Ride' && !JARGON.test(nearCard.all), `card: “${nearCard?.all}” (no program words)`)
await shot('B1-near-press-e-to-ride')

/* ---------------------------------------------------------------- C. ride */
console.log('\nC. Ride: E')
await page.keyboard.press('e')
const riding = await waitFor(async () => { const d = await debug(); return d.phase === 'riding' && d.rides.length === 1 ? d : null })
await sleep(600)
const seated = await debug()
const ride0 = seated.rides[0]
const ridingCard = await card()
check('C.riding', riding && seated.riding === buggy.id && ride0.controllerPhase === 'running' && ride0.mirroredBodies === ride0.bodies, `riding; ${ride0.mirroredBodies}/${ride0.bodies} bodies mirrored for generation ${ride0.generation}`)
check('C.card-riding', ridingCard && ridingCard.label === 'Riding Buggy' && ridingCard.detail === 'Drive with the arrow keys or WASD.' && !ridingCard.code && /Press E to hop off/.test(ridingCard.hint ?? '') && ridingCard.button === 'Hop off' && !JARGON.test(ridingCard.all),
  `card: “${ridingCard?.label}” / “${ridingCard?.detail}” / “${ridingCard?.hint}” / [${ridingCard?.button}]`)
const curbIds = ride0.curb.map((wall) => wall.id)
check('C.curb', curbIds.length === 4 && JSON.stringify([...seated.curbDrawn].sort()) === JSON.stringify([...curbIds].sort()) && ride0.curb.every((wall) => Math.abs(wall.size.y - 0.72) < 0.01),
  `the ride's world has a 4-plate curb just outside the plate (${curbIds.join(', ')}), and the scene draws the same four walls`)
measurements.curb = ride0.curb
await shot('C1-riding-card')

/* ---------------------------------------------------------------- D. drive at the edge */
console.log('\nD. Drive flat out at the plate’s edge: W held 7 s')
const builtChassis = ride0.chassis
const builtGeneration = ride0.generation
const toEdge = await hold('w', 7000)
const againstCurb = await debug()
const pushed = againstCurb.rides[0]
const nearestFront = Math.min(...toEdge.map((sample) => sample.frontZ))
const stillRiding = toEdge.every((sample) => sample.phase === 'riding' && sample.generation === builtGeneration && !sample.notice)
const maxSeatGap = Math.max(...toEdge.map((sample) => sample.avatarToSeat))
const lastSpeeds = toEdge.slice(-10).map((sample) => sample.speed)
measurements.edge = { builtChassis, pushedChassis: pushed.chassis, nearestFrontZ: round(nearestFront), plateEdgeZ: round(-PLATE_HALF), frontToEdge: round(nearestFront + PLATE_HALF), lastSpeeds, maxRiderToSeat: round(maxSeatGap), samples: toEdge.length }
check('D.bumped-and-stopped', Math.max(...lastSpeeds) < 0.3 && nearestFront > -PLATE_HALF - 0.05 && nearestFront < -PLATE_HALF + 1.5,
  `W held 7 s: the Buggy drove ${round(distance(builtChassis, pushed.chassis) / STUD, 1)} studs and stopped against the curb (its front ${round(Math.abs(nearestFront + PLATE_HALF), 2)} units ${nearestFront < -PLATE_HALF ? 'past the plate’s edge: contact overlap with the curb' : 'short of the plate’s edge'}, speed ${lastSpeeds.at(-1)} over the last second)`)
check('D.stayed-riding', stillRiding && pushed.chassis.y > builtChassis.y - 0.1 && pushed.chassis.y < builtChassis.y + 0.1, `never thrown out, never sent back (phase riding, generation ${builtGeneration}, no notice, every sample); chassis height ${pushed.chassis.y} vs ${builtChassis.y} (it did not climb the curb)`)
check('D.rider-on-seat', maxSeatGap < 0.15, `the rider stayed on the seat the whole way (at most ${round(maxSeatGap, 3)} units off it)`)
await page.keyboard.down('w')
await sleep(400)
await shot('D1-bumped-the-curb-still-riding')
await page.keyboard.up('w')
// Turn the camera for a side view of the Buggy against the curb (camera only).
await page.evaluate(() => window.__robotics.brickStore.setState({ touchYaw: window.__robotics.brickStore.getState().touchYaw + 1.1, touchPitch: 0.62, exploreManualLookAt: Date.now() }))
await sleep(900)
await shot('D2-against-the-curb-side-view')
// Hop off right there, against the curb, and get back on.
await page.keyboard.press('e')
const offAtCurb = await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })
await sleep(500)
const besideCurb = await debug()
check('D.hop-off-at-the-curb', offAtCurb && Math.abs(besideCurb.avatar.y - 0.385) < 0.06 && Math.abs(besideCurb.avatar.x) < PLATE_HALF && Math.abs(besideCurb.avatar.z) < PLATE_HALF && besideCurb.avatarOverlaps === 0 && besideCurb.curbDrawn.length === 0 && besideCurb.nearestId === buggy.id,
  `E at the curb: the character stands on the plate beside the Buggy (${JSON.stringify(besideCurb.avatar)}), inside no collider; the curb is put away; Ride is offered again`)
await shot('D3-hopped-off-at-the-curb')
await page.keyboard.press('e')
const backOn = await waitFor(async () => { const d = await debug(); return d.phase === 'riding' ? d : null }, { timeout: 3000 })
await sleep(300)
const backUp = await hold('s', 900)
const backedTo = (await debug()).rides[0]
check('D.backs-away', backOn && distance(backedTo.chassis, pushed.chassis) / STUD > 2 && backUp.every((sample) => sample.phase === 'riding'), `rode again from the curb (E); S held 0.9 s: backed ${round(distance(backedTo.chassis, pushed.chassis) / STUD, 1)} studs away from it`)
// Back against the curb, then turn on the spot with its nose on it and drive off along the edge.
await hold('w', 2500)
const noseOn = (await debug()).rides[0]
const turnSamples = await hold('ArrowLeft', 1500)
await sleep(300)
const turnedAtCurb = (await debug()).rides[0]
const turnedBy = Math.abs(Math.atan2(Math.sin(turnedAtCurb.yaw - noseOn.yaw), Math.cos(turnedAtCurb.yaw - noseOn.yaw))) * 180 / Math.PI
const offSamples = await hold('w', 1500)
await sleep(300)
const droveOff = (await debug()).rides[0]
const droveOffStuds = distance(droveOff.chassis, turnedAtCurb.chassis) / STUD
measurements.curbManoeuvre = { turnedDeg: round(turnedBy, 1), droveOffStuds: round(droveOffStuds, 2) }
check('D.turns-and-drives-off', turnedBy > 45 && droveOffStuds > 3 && [...turnSamples, ...offSamples].every((sample) => sample.phase === 'riding'), `nose on the curb again, ← held 1.5 s turned it ${round(turnedBy, 0)}° on the spot, then W 1.5 s drove it ${round(droveOffStuds, 1)} studs off along the edge; still riding`)

/* ---------------------------------------------------------------- E. back to the start, seated */
console.log('\nE. Back to the start (forced: the curb stops the Buggy, so a car past it is simulated), still seated, keys still drive')
await page.keyboard.down('w')
await sleep(500)
const beforeBack = await debug()
const brought = await page.evaluate(() => window.__robotics.exploreRides.bringBack())
await sleep(80)
const justBack = await debug()
const backCard = await card()
await sleep(250)
await shot('E1-back-to-the-start-still-seated')
const backRide = justBack.rides[0]
check('E.brought-back', brought && justBack.phase === 'riding' && justBack.riding === buggy.id && backRide.generation > beforeBack.rides[0].generation && distance(backRide.chassis, builtChassis) < 0.3,
  `back to the start: phase ${justBack.phase}, generation ${beforeBack.rides[0].generation} → ${backRide.generation}, chassis ${round(distance(backRide.chassis, builtChassis), 3)} units from where it was built`)
check('E.still-seated', distance(justBack.avatar, backRide.seat) < 0.15 && justBack.avatar.y > backRide.seat.y, `the rider is on the seat at the start (${round(distance(justBack.avatar, backRide.seat), 3)} units off it), not put down`)
check('E.card-back', backCard && backCard.label === 'Riding Buggy' && backCard.detail === 'Back to the start!' && backCard.button === 'Hop off', `card: “${backCard?.label}” / “${backCard?.detail}” / [${backCard?.button}]`)
const afterBackDrive = await hold('w', 1200)
const movedAfterBack = (await debug()).rides[0]
const afterBackMirror = await debug()
check('E.drives-again', distance(movedAfterBack.chassis, backRide.chassis) / STUD > 3 && afterBackDrive.every((sample) => sample.phase === 'riding'), `W still held: it drove ${round(distance(movedAfterBack.chassis, backRide.chassis) / STUD, 1)} studs from the start in 1.2 s`)
check('E.mirror-follows', afterBackMirror.rides[0].mirroredBodies === afterBackMirror.rides[0].bodies && Math.abs(afterBackMirror.rides[0].mirroredChassis.z - afterBackMirror.rides[0].chassis.z) < 0.25,
  `the new generation's bodies are mirrored (${afterBackMirror.rides[0].mirroredBodies}/${afterBackMirror.rides[0].bodies}) and follow the chassis (mirror ${afterBackMirror.rides[0].mirroredChassis.z} vs ${afterBackMirror.rides[0].chassis.z})`)
await shot('E2-driving-again-after-the-start')
// Three more in quick succession while driving: every remount is clean.
const generations = []
await page.keyboard.down('w')
for (let index = 0; index < 3; index += 1) {
  await page.evaluate(() => window.__robotics.exploreRides.bringBack())
  generations.push((await debug()).rides[0].generation)
  await sleep(index === 1 ? 16 : 250)
}
await sleep(800)
await page.keyboard.up('w')
const stress = await debug()
check('E.quick-succession', rustErrors().length === 0 && pageErrors.length === 0 && stress.phase === 'riding' && distance(stress.rides[0].chassis, builtChassis) / STUD > 2 && stress.rides[0].mirroredBodies === stress.rides[0].bodies,
  `three more trips back to the start (generations ${generations.join(', ')}), one a frame after the last: no errors, still riding, driving again (${round(distance(stress.rides[0].chassis, builtChassis) / STUD, 1)} studs out)`)
measurements.backToStart = { brought, generations: [beforeBack.rides[0].generation, backRide.generation, ...generations], riderToSeat: round(distance(justBack.avatar, backRide.seat)), droveAfterStuds: round(distance(movedAfterBack.chassis, backRide.chassis) / STUD, 2) }

/* ---------------------------------------------------------------- F. hop off, ride again */
console.log('\nF. Hop off with E, ride again with E, drive')
await sleep(600)
await page.keyboard.press('e')
const walking = await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })
await sleep(500)
const hopped = await debug()
check('F.hopped-off', walking && hopped.riding === null && hopped.curbDrawn.length === 0 && hopped.nearestId === buggy.id, `walking beside it; the curb is put away (${hopped.curbDrawn.length} walls drawn); the Buggy is near`)
await page.keyboard.press('e')
await waitFor(async () => { const d = await debug(); return d.phase === 'riding' ? d : null }, { timeout: 3000 })
await sleep(300)
const rideAgainFrom = (await debug()).rides[0]
await hold('w', 1000)
const rideAgainTo = await debug()
check('F.rides-again', rideAgainTo.phase === 'riding' && distance(rideAgainTo.rides[0].chassis, rideAgainFrom.chassis) / STUD > 3 && rideAgainTo.curbDrawn.length === 4, `rode again and W drove it ${round(distance(rideAgainTo.rides[0].chassis, rideAgainFrom.chassis) / STUD, 1)} studs; the curb is drawn again`)
await shot('F1-riding-again')
await page.keyboard.press('e')
await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })

/* ---------------------------------------------------------------- G. leave Explore */
console.log('\nG. Back to building: the construction is exactly as before')
await page.getByRole('button', { name: 'Back to building' }).click()
await page.waitForFunction(() => window.__robotics.brickStore.getState().mode === 'build', null, { timeout: 10_000 })
await sleep(500)
check('G.document-unchanged', (await snapshot()) === before, 'document snapshot identical after riding, bumping, going back to the start and riding again')
const historyAfter = await history()
check('G.history-unchanged', historyAfter.undo === historyBefore.undo && historyAfter.redo === historyBefore.redo, `undo ${historyBefore.undo} → ${historyAfter.undo}, redo ${historyBefore.redo} → ${historyAfter.redo}`)

/* ---------------------------------------------------------------- H. the old crash path */
console.log('\nH. The remount the crash came from: an edit while riding puts the rider down, then Ride again')
// Spawn where the studio spawns a first visit (behind the Buggy), not where the last visit ended.
await brick((state) => { window.__robotics.brickStore.setState({ exploreLastSafePosition: null }); return true })
await page.getByRole('radio', { name: 'Explore' }).click()
await page.waitForFunction(() => Boolean(window.__robotics.exploreRides) && window.__robotics.brickStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 15_000 })
await sleep(600)
await page.mouse.click(683, 420)
await page.keyboard.down('w')
await waitFor(async () => { const d = await debug(); return d.nearestId ? d : null }, { timeout: 6000, every: 40 })
await page.keyboard.up('w')
await sleep(300)
await page.keyboard.press('e')
await waitFor(async () => { const d = await debug(); return d.phase === 'riding' ? d : null }, { timeout: 3000 })
await hold('w', 700)
const firstGeneration = (await debug()).rides[0].generation
// Ctrl+Z in Explore takes the seat off (the ride is retired, the rider put down), Ctrl+Shift+Z puts it back.
await brick((state) => state.undo())
const putDown = await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })
await brick((state) => state.redo())
await sleep(500)
const edited = await debug()
const editCard = await card()
check('H.put-down', putDown && edited.liveIds.length === 0 && edited.nearestId === buggy.id && /The build changed, so robots went back to the start\./.test(editCard?.all ?? ''), `the edit retired the ride (nothing live) and put the rider down beside the Buggy; card: “${editCard?.all}”`)
await page.keyboard.press('e')
const again = await waitFor(async () => { const d = await debug(); return d.phase === 'riding' && d.rides.length === 1 ? d : null }, { timeout: 3000 })
await sleep(300)
const againFrom = (await debug()).rides[0]
await hold('w', 1000)
const againTo = await debug()
check('H.ride-again-after-remount', again && againFrom.generation > firstGeneration && againTo.phase === 'riding' && distance(againTo.rides[0].chassis, againFrom.chassis) / STUD > 3 && againTo.rides[0].mirroredBodies === againTo.rides[0].bodies,
  `Ride again: generation ${firstGeneration} → ${againFrom.generation}, W drove it ${round(distance(againTo.rides[0].chassis, againFrom.chassis) / STUD, 1)} studs, every body mirrored`)
await shot('H1-ride-again-after-the-edit')
await page.keyboard.press('e')
await waitFor(async () => { const d = await debug(); return d.phase === 'walking' ? d : null }, { timeout: 4000 })
await page.getByRole('button', { name: 'Back to building' }).click()
await page.waitForFunction(() => window.__robotics.brickStore.getState().mode === 'build', null, { timeout: 10_000 })

/* ---------------------------------------------------------------- T. touch */
console.log('\nT. Touch at 1024×768: walk up with the stick, tap Ride, drive with the stick, tap Hop off')
const touchContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true })
await touchContext.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
const tablet = await touchContext.newPage()
tablet.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`[touch] ${message.text()}`) })
tablet.on('pageerror', (error) => pageErrors.push(`[touch] ${String(error)}`))
await tablet.goto(`${origin}/build`)
await tablet.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await tablet.reload()
await tablet.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.armKit), null, { timeout: 30_000 })
const tabletBrick = (fn, arg) => tablet.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const tabletDebug = () => tablet.evaluate(() => window.__robotics.exploreRides?.debug() ?? null)
await tabletBrick((state) => state.newBuild())
await tablet.evaluate(() => window.__robotics.armKit('buggy'))
await tabletBrick((state) => { state.setDraftPosition(28, 0, 26); return state.placeDraft() })
await tablet.waitForTimeout(300)
const tabletHub = await tabletBrick((state) => state.bricks.find((entry) => entry.partId === 'robo_hub'))
await tabletBrick((state, h) => { state.choosePart('robo_seat'); state.setDraftPosition(h.x + 1, h.y + 6, h.z + 1); const ok = state.placeDraft(); state.cancelInteraction(); return ok }, tabletHub)
await tablet.waitForTimeout(300)
await tablet.getByRole('radio', { name: 'Explore' }).tap()
await tablet.waitForFunction(() => Boolean(window.__robotics.exploreRides) && window.__robotics.brickStore.getState().exploreSpawnStatus === 'ready', null, { timeout: 15_000 })
await tablet.waitForTimeout(600)
const cdp = await touchContext.newCDPSession(tablet)
const stickBox = await tablet.getByLabel('Movement joystick').boundingBox()
const stickCentre = { x: stickBox.x + stickBox.width / 2, y: stickBox.y + stickBox.height / 2 }
async function stickUp(until, timeout) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: stickCentre.x, y: stickCentre.y, id: 1 }] })
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: stickCentre.x, y: stickCentre.y - 4.2 * step, id: 1 }] })
    await tablet.waitForTimeout(16)
  }
  const start = Date.now()
  let value = null
  while (Date.now() - start < timeout) {
    value = await until()
    if (value) break
    await tablet.waitForTimeout(50)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return value
}
const tabletNear = await stickUp(async () => { const d = await tabletDebug(); return d?.nearestId ? d : null }, 6000)
await tablet.waitForTimeout(400)
check('T.walked-up-by-touch', Boolean(tabletNear), 'one finger on the Explore stick walked the character up to the Buggy')
await tablet.getByRole('button', { name: 'Ride' }).tap()
await tablet.waitForFunction(() => window.__robotics.exploreRides.debug().phase === 'riding', null, { timeout: 4000 })
await tablet.waitForTimeout(500)
const touchCard = await tablet.evaluate(() => {
  const element = document.querySelector('.explore-ride-prompt[data-visible="true"]')
  const visible = (selector) => { const node = element?.querySelector(selector); return node && getComputedStyle(node).display !== 'none' ? node.textContent : null }
  const button = element?.querySelector('.explore-ride-prompt-button')
  return { label: visible('.explore-ride-prompt-label'), detail: visible('.explore-ride-prompt-detail'), hint: visible('.explore-ride-prompt-hint'), button: button?.textContent ?? null, buttonHeight: button ? Math.round(button.getBoundingClientRect().height) : 0, detailPx: element ? parseFloat(getComputedStyle(element.querySelector('.explore-ride-prompt-detail')).fontSize) : 0 }
})
check('T.card-touch', touchCard.label === 'Riding Buggy' && touchCard.detail === 'Drive with the stick.' && touchCard.hint === null && touchCard.button === 'Hop off' && touchCard.buttonHeight >= 44 && touchCard.detailPx >= 15,
  `card on touch: “${touchCard.label}” / “${touchCard.detail}” / [${touchCard.button}] ${touchCard.buttonHeight} px tall, text ${touchCard.detailPx} px; no key hint`)
const touchFrom = (await tabletDebug()).rides[0].chassis
await stickUp(async () => null, 1200)
await tablet.waitForTimeout(500)
const touchTo = await tabletDebug()
check('T.stick-drives', touchTo.phase === 'riding' && distance(touchTo.rides[0].chassis, touchFrom) / STUD > 3 && touchTo.curbDrawn.length === 4, `the stick drove the Buggy ${round(distance(touchTo.rides[0].chassis, touchFrom) / STUD, 1)} studs; the curb is drawn`)
await tablet.screenshot({ path: path.join(out, 'T1-touch-riding-drive-with-the-stick.png') })
shots.push('T1-touch-riding-drive-with-the-stick.png')
await tablet.getByRole('button', { name: 'Hop off' }).tap()
const touchWalking = await tablet.waitForFunction(() => window.__robotics.exploreRides.debug().phase === 'walking', null, { timeout: 4000 }).then(() => true, () => false)
check('T.hop-off-tap', touchWalking, 'a tap on Hop off put the character down beside the Buggy')
measurements.touch = { card: touchCard, droveStuds: round(distance(touchTo.rides[0].chassis, touchFrom) / STUD, 2) }
await touchContext.close()

/* ---------------------------------------------------------------- V. the tester's tall Buggy (1024×768) */
console.log('\nV. The tester’s Buggy at 1024×768: a five-brick tower with the seat on top')
const tallContext = await browser.newContext({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 })
await tallContext.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
const tall = await tallContext.newPage()
tall.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`[tall] ${message.text()}`) })
tall.on('pageerror', (error) => pageErrors.push(`[tall] ${String(error)}`))
await tall.goto(`${origin}/build`)
await tall.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
await tall.reload()
await tall.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.armKit), null, { timeout: 30_000 })
const tallBrick = (fn, arg) => tall.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
const tallDebug = () => tall.evaluate(() => window.__robotics.exploreRides?.debug() ?? null)
const tallShot = async (name) => { await tall.screenshot({ path: path.join(out, `${name}.png`) }); shots.push(`${name}.png`); console.log(`  shot ${name}.png`) }
const tallCard = () => tall.evaluate(() => {
  const element = document.querySelector('.explore-ride-prompt[data-visible="true"]')
  const button = element?.querySelector('.explore-ride-prompt-button')
  return element ? { state: element.getAttribute('data-state'), text: element.textContent, button: button?.textContent ?? null, buttonHeight: button ? Math.round(button.getBoundingClientRect().height) : 0, bottom: Math.round(element.getBoundingClientRect().bottom) } : null
})
const aimCamera = (yaw) => tallBrick((state, value) => { window.__robotics.brickStore.setState({ touchYaw: value, exploreManualLookAt: Date.now() }); return true }, yaw)
const tallHold = async (key, ms) => { await tall.keyboard.down(key); await tall.waitForTimeout(ms); await tall.keyboard.up(key) }
await tallBrick((state) => state.newBuild())
await tall.evaluate(() => window.__robotics.armKit('buggy'))
await tallBrick((state) => { state.setDraftPosition(28, 0, 26); return state.placeDraft() })
await tall.waitForTimeout(300)
const tallHub = await tallBrick((state) => state.bricks.find((entry) => entry.partId === 'robo_hub'))
const towerColors = ['#7a5cd6', '#5fb35a', '#f0a23b', '#e27fbf', '#f2d43a']
for (let index = 0; index < 5; index += 1) {
  await tallBrick((state, p) => { state.choosePart('brick_2x2'); state.setActiveColor(p.color); state.setDraftPosition(p.x, p.y, p.z); const ok = state.placeDraft(); state.cancelInteraction(); return ok }, { x: tallHub.x + 1, y: tallHub.y + 6 + 3 * index, z: tallHub.z + 1, color: towerColors[index] })
}
await tallBrick((state, h) => { state.choosePart('robo_seat'); state.setActiveColor('#3e83d7'); state.setDraftPosition(h.x + 1, h.y + 21, h.z + 1); const ok = state.placeDraft(); state.cancelInteraction(); return ok }, tallHub)
await tallBrick((state, h) => { state.selectBrick(h.id); return true }, tallHub)
await tall.waitForTimeout(600)
const tallRobot = await tall.evaluate(() => { const c = window.__robotics.roboticsStore.getState().model.creations[0]; return { id: c.id, name: c.name, bricks: c.brickIds.length, seats: c.seats.length } })
const panelRide = tall.getByRole('button', { name: 'Ride it in Explore' })
check('V.tower-buggy', tallRobot.name === 'Buggy' && tallRobot.bricks === 15 && tallRobot.seats === 1 && await panelRide.isVisible(), `“${tallRobot.name}”: ${tallRobot.bricks} bricks with a five-brick tower and the seat on top; the robot panel shows “Ride it in Explore”`)
await tallShot('V1-panel-ride-it-in-explore')

// The panel's button: Explore opens with her already on the seat, four units up.
await panelRide.click()
const clickedAt = Date.now()
await tall.waitForFunction(() => window.__robotics.exploreRides?.debug().phase === 'riding', null, { timeout: 15_000 })
const seatedAfter = Date.now() - clickedAt
await tall.waitForTimeout(1200)
const arrived = await tallDebug()
const arrivedRide = arrived.rides[0]
const arrivedYaw = await tallBrick((state) => state.touchYaw)
check('V.panel-rides-seated', arrived.phase === 'riding' && arrived.riding === tallRobot.id && distance(arrived.avatar, arrivedRide.seat) < 0.15 && arrived.avatar.y > 4 && Math.abs(Math.atan2(Math.sin(arrivedYaw - arrivedRide.seatYaw), Math.cos(arrivedYaw - arrivedRide.seatYaw))) < 0.2,
  `one click: Explore opened with her riding ${Math.round(seatedAfter)} ms later, on the seat ${round(arrived.avatar.y, 2)} units up (${round(distance(arrived.avatar, arrivedRide.seat), 3)} off it), the camera behind her`)
// Riding: the walking key help is gone and the card sits at the bottom, off the car.
const ridingHud = await tall.evaluate(() => {
  const hint = document.querySelector('.desktop-explore-hint')
  const card = document.querySelector('.explore-ride-prompt[data-visible="true"]')
  return { hintShown: Boolean(hint && getComputedStyle(hint).display !== 'none'), cardBottom: card ? Math.round(card.getBoundingClientRect().bottom) : null, cardTop: card ? Math.round(card.getBoundingClientRect().top) : null, marked: document.body.dataset.exploreRiding ?? null }
})
check('V.riding-hud', !ridingHud.hintShown && ridingHud.marked === 'true' && ridingHud.cardBottom !== null && ridingHud.cardBottom >= 768 - 30, `riding: the walking key help is hidden, the card sits at the bottom (top ${ridingHud.cardTop} px, bottom ${ridingHud.cardBottom} px of 768)`)
await tallShot('V2-arrived-seated-whole-robot-framed')

// Hop off: beside the tall robot on the ground, the big Ride button is up and stays up.
await tall.keyboard.press('e')
await tall.waitForFunction(() => window.__robotics.exploreRides.debug().phase === 'walking', null, { timeout: 5000 })
await tall.waitForTimeout(500)
const beside = await tallDebug()
const standingCards = []
for (let sample = 0; sample < 20; sample += 1) { standingCards.push(await tallCard()); await tall.waitForTimeout(100) }
const hintBack = await tall.evaluate(() => { const hint = document.querySelector('.desktop-explore-hint'); return Boolean(hint && getComputedStyle(hint).display !== 'none') })
check('V.ride-card-beside-tall-robot', Math.abs(beside.avatar.y - 0.385) < 0.06 && beside.nearestId === tallRobot.id && standingCards.every((card) => card?.state === 'ride' && card.button === 'Ride' && card.buttonHeight >= 52) && hintBack,
  `on the ground beside it (feet at ${round(beside.avatar.y - 0.385, 3)}, the seat ${round(beside.rides[0].seat.y, 2)} up): the Ride card with a ${standingCards[0]?.buttonHeight} px Ride button, up in 20 of 20 samples over 2 s; the key help is back`)
await tallShot('V3-ride-button-beside-tall-robot')

// Walk away: the card goes; come back: it is there again.
const footprintCentre = beside.rides[0].footprint.center
const footprintStuds = (d) => { const f = d.rides[0].footprint; const dx = d.avatar.x - f.center.x; const dz = d.avatar.z - f.center.z; const axisZ = { x: -f.axisX.z, z: f.axisX.x }; const u = Math.max(0, Math.abs(dx * f.axisX.x + dz * f.axisX.z) - f.halfX); const v = Math.max(0, Math.abs(dx * axisZ.x + dz * axisZ.z) - f.halfZ); return Math.hypot(u, v) / STUD }
const walkBackUp = async () => {
  const at = await tallDebug()
  await aimCamera(Math.atan2(footprintCentre.x - at.avatar.x, footprintCentre.z - at.avatar.z))
  await tall.waitForTimeout(300)
  await tall.keyboard.down('w')
  let found = null
  for (let i = 0; i < 100 && !found; i += 1) { const d = await tallDebug(); if (d.nearestId) found = d; else await tall.waitForTimeout(50) }
  await tall.keyboard.up('w')
  await tall.waitForTimeout(300)
  return found
}
await aimCamera(Math.atan2(beside.avatar.x - footprintCentre.x, beside.avatar.z - footprintCentre.z))
await tall.waitForTimeout(300)
await tallHold('w', 1500)
await tall.waitForTimeout(400)
const awayCard = await tallCard()
const away = await tallDebug()
const backNear = await walkBackUp()
check('V.card-follows-her', footprintStuds(away) > 5 && (awayCard === null || awayCard.state !== 'ride') && backNear && backNear.nearestId === tallRobot.id, `walked away to ${round(footprintStuds(away), 1)} studs from it: the Ride card went; walked back: it came up again at ${backNear ? round(footprintStuds(backNear), 1) : '—'} studs`)

// The camera beside it: face away from the robot (the camera then sits on the robot's side), take a step, Recenter.
const standing = await tallDebug()
await aimCamera(Math.atan2(standing.avatar.x - footprintCentre.x, standing.avatar.z - footprintCentre.z))
await tall.waitForTimeout(400)
await tallHold('w', 250)
await tall.waitForTimeout(500)
await tall.getByRole('button', { name: 'Recenter' }).click()
await tall.waitForTimeout(1500)
const recentered = await tallDebug()
check('V.camera-out-of-robot', recentered.cameraToTarget > 0.9 * 6.1 && recentered.cameraInside === 0, `her back to the robot, ${round(footprintStuds(recentered), 1)} studs from it, Recenter: the camera is ${recentered.cameraToTarget} units from her head (before the fix it sat at 0.65 there), inside ${recentered.cameraInside} colliders`)
await tallShot('V4-recentered-beside-robot')
await tall.mouse.move(512, 384)
for (let notch = 0; notch < 4; notch += 1) { await tall.mouse.wheel(0, 400); await tall.waitForTimeout(100) }
await tall.waitForTimeout(1500)
const zoomed = await tallDebug()
check('V.zoom-works', zoomed.cameraToTarget > recentered.cameraToTarget + 3 && zoomed.cameraInside === 0, `scroll-zoom out: ${recentered.cameraToTarget} → ${zoomed.cameraToTarget} units, inside nothing`)
await tallShot('V5-zoomed-out-beside-robot')
await tall.getByRole('button', { name: 'Recenter' }).click()
await tall.waitForTimeout(1500)
const recenteredAgain = await tallDebug()
check('V.recenter-works', Math.abs(recenteredAgain.cameraToTarget - 6.1) < 0.4 && recenteredAgain.cameraInside === 0, `Recenter again: back to ${recenteredAgain.cameraToTarget} units (the default 6.1), inside nothing`)
// The Recenter button keeps the keyboard (the studio's rule: keys pressed on a focused button are not walking), so click the scene first, as a student would.
await tall.mouse.click(512, 300)
await tall.waitForTimeout(200)
// Walk along and around it (the camera trails her): never pinned on her head, never inside anything.
const walkCamera = []
for (const [key, ms] of [['d', 1200], ['s', 900], ['a', 1600], ['w', 700]]) {
  await tall.keyboard.down(key)
  const until = Date.now() + ms
  while (Date.now() < until) { const d = await tallDebug(); walkCamera.push({ key, to: d.cameraToTarget, inside: d.cameraInside, studs: footprintStuds(d), y: d.avatar.y, cam: d.camera, at: d.avatar }); await tall.waitForTimeout(90) }
  await tall.keyboard.up(key)
}
const closest = Math.min(...walkCamera.map((sample) => sample.to))
const nearest = Math.min(...walkCamera.map((sample) => sample.studs))
measurements.tallCamera = { recenteredToHead: recentered.cameraToTarget, zoomedToHead: zoomed.cameraToTarget, recenteredAgainToHead: recenteredAgain.cameraToTarget, walkSamples: walkCamera.length, walkClosestToHead: round(closest, 3), walkNearestToRobotStuds: round(nearest, 2), walkInsideMax: Math.max(...walkCamera.map((sample) => sample.inside)) }
if (closest <= 4) console.log('camera trail', JSON.stringify(walkCamera.map((sample) => [sample.key, sample.to, round(sample.studs, 2), sample.at, sample.cam])))
check('V.camera-walking-by', nearest < 1.5 && closest > 4 && walkCamera.every((sample) => sample.inside === 0), `walking along and around it (${walkCamera.length} samples, as close as ${round(nearest, 1)} studs to it): the camera never came closer than ${round(closest, 2)} units to her head and was never inside a collider`)

// Back up to it, and the Ride button (a real click) puts her on the seat up there.
check('V.back-at-robot', Boolean(await walkBackUp()), 'walked back up to it: the Ride card is up')
await tall.getByRole('button', { name: 'Ride' }).click()
await tall.waitForFunction(() => window.__robotics.exploreRides.debug().phase === 'riding', null, { timeout: 4000 })
await tall.waitForTimeout(600)
const clickedRide = await tallDebug()
check('V.ride-button-seats-her', clickedRide.phase === 'riding' && distance(clickedRide.avatar, clickedRide.rides[0].seat) < 0.15 && clickedRide.avatar.y > 4, `the Ride button (a real click) put her on the seat ${round(clickedRide.avatar.y, 2)} units up`)
const tallFrom = clickedRide.rides[0].chassis
await tallHold('w', 1200)
await tall.waitForTimeout(400)
const tallTo = (await tallDebug()).rides[0].chassis
check('V.tall-drives', distance(tallTo, tallFrom) / STUD > 3, `W 1.2 s drove the tall Buggy ${round(distance(tallTo, tallFrom) / STUD, 1)} studs`)
await tallShot('V6-riding-the-tall-buggy')
await tallContext.close()

/* ---------------------------------------------------------------- errors */
const crashed = await page.evaluate(() => /tripped over a brick/i.test(document.body.innerText))
check('no-crash', !crashed && pageErrors.length === 0, crashed ? 'the error screen is showing' : `no error screen, ${pageErrors.length} page errors`)
check('no-rapier-errors', rustErrors().length === 0, rustErrors().length ? rustErrors().slice(0, 3).join(' | ') : 'no console or page error mentions unreachable / rust / recursive use / null pointer / ownership')
// Scroll-zoom over Explore makes Chrome log this for the studio's own wheel handler (React wheel listeners are passive; not robotics code): listed, not counted.
const KNOWN_STUDIO = /Unable to preventDefault inside passive event listener invocation/
const knownConsoleErrors = consoleErrors.filter((text) => KNOWN_STUDIO.test(text))
const otherConsoleErrors = consoleErrors.filter((text) => !KNOWN_STUDIO.test(text))
check('console-clean', otherConsoleErrors.length === 0, otherConsoleErrors.length ? otherConsoleErrors.slice(0, 3).join(' | ') : `no console errors${knownConsoleErrors.length ? ` (besides ${knownConsoleErrors.length} × the studio's passive-wheel message on scroll-zoom)` : ''}`)
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768 (T and V: 1024x768)', at: new Date().toISOString(), results, measurements, consoleErrors: otherConsoleErrors, knownStudioConsoleErrors: knownConsoleErrors, pageErrors, screenshots: shots }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
