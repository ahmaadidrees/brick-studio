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
 * the character starts behind the Buggy as on a first visit.
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
  `W held 7 s: the Buggy drove ${round(distance(builtChassis, pushed.chassis) / STUD, 1)} studs and stopped against the curb (its front ${round(nearestFront + PLATE_HALF, 2)} units inside the plate's edge, speed ${lastSpeeds.at(-1)} over the last second)`)
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
const backUp = await hold('s', 900)
const backedTo = (await debug()).rides[0]
check('D.backs-away', distance(backedTo.chassis, pushed.chassis) / STUD > 2 && backUp.every((sample) => sample.phase === 'riding'), `S held 0.9 s: backed ${round(distance(backedTo.chassis, pushed.chassis) / STUD, 1)} studs away from the curb`)

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

/* ---------------------------------------------------------------- errors */
const crashed = await page.evaluate(() => /tripped over a brick/i.test(document.body.innerText))
check('no-crash', !crashed && pageErrors.length === 0, crashed ? 'the error screen is showing' : `no error screen, ${pageErrors.length} page errors`)
check('no-rapier-errors', rustErrors().length === 0, rustErrors().length ? rustErrors().slice(0, 3).join(' | ') : 'no console or page error mentions unreachable / rust / recursive use / null pointer / ownership')
check('console-clean', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 3).join(' | ') : 'no console errors at all')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewport: '1366x768', at: new Date().toISOString(), results, measurements, consoleErrors, pageErrors, screenshots: shots }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
