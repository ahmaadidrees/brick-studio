/**
 * Robot Workshop kid-UX pass, lane S: magnetic connections, with a real mouse aimed the way a
 * young student aims (docs/robotics/KID-UX.md §S).
 *
 * Real Chrome, real mouse and keyboard (Playwright CDP). Every part is chosen from the drawer
 * with a click and placed with a click. The mouse goes near where the part belongs, never
 * exactly on it: beside the plate for a motor, on the ground about a stud short of a socket for
 * an axle, near an axle end for a wheel. Where "near" is on the screen comes from the studio's
 * own world→screen projection (the dev-only `window.__robotics.project`), the same aiming a
 * student does by eye. Nothing is placed with injected coordinates and no fixture is loaded.
 *
 *   A. A car from parts at 1366×768: a plate, a hub, a motor near each side edge (it turns and
 *      mounts itself), a short axle near each socket (it snaps in), a wheel near each axle end
 *      (it snaps on); `readiness()` (src/robotics/drive/readiness.ts) says it can drive. A motor
 *      dropped on the ground beside it says it is not on the robot, next to the part and in the
 *      wiring line. A wheel nudged off its axle shows a red gap marker; dragged back near its axle
 *      end it snaps on again.
 *   B. The owner's first try, replayed: a hub on the bare ground, a motor beside it, an axle
 *      aimed where it looks like it goes. No second robot, no snap, and the reason is said.
 *   C. The same car at 1024×768: targets and snapped ghosts photographed, the same counts.
 *
 * Counts, per build: placements (one click each) and placements that looked connected but were
 * not (a green snapped ghost whose part did not connect, or a part left beside a connector
 * without a red gap marker). Target: 8 placements for the car and 0 misleading ones.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5252 node scripts/qa/robotics-kid-snap.mjs
 *
 * against `npx vite --mode robotics --port 5252 --strictPort --host 127.0.0.1`.
 * Writes PNGs and results.json under docs/qa/robotics-kid/snap/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5252', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/snap')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const builds = {}
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const STUD = 0.62
const PLATE = 0.18
/** Plate grid coordinates (studs from the corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
const PART_NAMES = { plate_6x8: '6 × 8 Plate', robo_hub: 'Hub', robo_motor: 'Motor', robo_axle_short: 'Short axle', robo_wheel: 'Wheel' }
const BARE_GROUND = 'Put motors on a plate so wheels reach the ground'

async function session(width, tag) {
  const context = await browser.newContext({ viewport: { width, height: 768 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (error) => console.log(`  page error: ${error}`))
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  // The studio's web fonts come from the network; "load" can stall offline, so wait for the app itself.
  await page.goto(`${origin}/build`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.__robotics?.project && window.__robotics?.connections), null, { timeout: 60_000 })
  await page.waitForSelector('canvas')
  const s = { page, context, width, tag, placements: 0, misleading: 0, log: [] }
  s.sleep = (ms) => page.waitForTimeout(ms)
  s.brick = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), arg), { src: fn.toString(), arg })
  s.robo = (fn, arg) => page.evaluate(({ src, arg }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), arg), { src: fn.toString(), arg })
  s.connections = () => page.evaluate(() => window.__robotics.connections())
  s.screenOf = (point) => page.evaluate((p) => window.__robotics.project(p), point)
  s.draft = () => s.brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z, rotation: state.draft.rotation })
  s.lastBrick = () => s.brick((state) => { const b = state.bricks[state.bricks.length - 1]; return { id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation } })
  s.shot = async (name) => { await page.screenshot({ path: path.join(out, `${name}-${width}.png`) }); console.log(`  shot ${name}-${width}.png`) }
  s.wiringLine = async () => {
    const line = page.getByTestId('robotics-wiring-line')
    return (await line.count()) ? (await line.textContent()) : await s.robo((state) => state.wiringNote?.text ?? null)
  }
  return s
}

/** Picks a part in the drawer with a click. */
async function choose(s, partId) {
  await s.page.getByLabel('Brick category').selectOption(partId.startsWith('robo_') ? 'robotics' : 'all')
  await s.page.locator(`.library-part[title="${PART_NAMES[partId]}"]`).click()
  await s.sleep(150)
  assert.equal((await s.draft())?.partId, partId, `the drawer armed ${partId}`)
}

/** Would a real mouse at this screen point reach the build canvas (not a panel, the drawer or the command strip)? */
async function inFreeArea(s, at) {
  return s.page.evaluate((p) => {
    if (!p.inFront) return false
    const hits = [[0, 0], [-6, -6], [6, -6], [-6, 6], [6, 6]].map(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy))
    return hits.every((element) => element?.tagName === 'CANVAS')
  }, at)
}

/** Waits until the view stops moving (the canvas eases its offset when a panel or the command strip changes size). */
async function settle(s) {
  let last = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const now = await s.screenOf(world(32, 0, 32))
    if (last && Math.abs(now.x - last.x) < 0.25 && Math.abs(now.y - last.y) < 0.25) return
    last = now
    await s.sleep(100)
  }
}

/** Moves the real mouse over a world point and lets the ghost settle. */
async function aim(s, point) {
  await settle(s)
  const at = await s.screenOf(point)
  assert(await inFreeArea(s, at), `${JSON.stringify(point)} projects to (${Math.round(at.x)}, ${Math.round(at.y)}), outside the free canvas area`)
  await s.page.mouse.move(at.x, at.y, { steps: 8 })
  await s.sleep(240)
  return at
}

/**
 * At 1024×768 the robotics panel covers the right side of the car. A student hides the panel
 * (its own Hide button) and scrolls out with the mouse wheel until everything the car needs (the
 * plate and the ground where its wheels go) is in view. At 1366×768 this does nothing.
 */
async function makeRoom(s) {
  const extent = [world(24, 0, 29), world(38.4, 0, 29), world(24, 0, 35.4), world(38.4, 0, 35.4), world(31, 0, 39.2)]
  const steps = []
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await settle(s)
    const inside = await Promise.all(extent.map(async (point) => inFreeArea(s, await s.screenOf(point))))
    if (inside.every(Boolean)) return steps
    const hide = s.page.getByTestId('robotics-panel').getByRole('button', { name: 'Hide', exact: true })
    if (!steps.includes('hid the robot panel') && await hide.count()) {
      await hide.click()
      steps.push('hid the robot panel')
      await s.sleep(500)
      continue
    }
    steps.push('scrolled out')
    const middle = await s.page.evaluate(() => {
      const rect = window.__robotics.canvasRect()
      const insets = window.__robotics.insets()
      return { x: rect.left + (insets.left + rect.width - insets.right) / 2, y: rect.top + (insets.top + rect.height - insets.bottom) / 2 }
    })
    await s.page.mouse.move(middle.x, middle.y, { steps: 4 })
    // Each wheel notch dollies out about 5 %.
    for (let notch = 0; notch < 4; notch += 1) {
      await s.page.mouse.wheel(0, 120)
      await s.sleep(60)
    }
    await s.sleep(400)
  }
  throw new Error('could not bring the car\'s working area into view')
}

/** Parks the mouse on open baseplate well away from the robot, so only the glowing targets show. */
async function park(s) {
  for (const point of [world(33, 0, 44), world(40, 0, 42), world(22, 0, 42), world(44, 0, 36), world(20, 0, 22), world(42, 0, 22)]) {
    await settle(s)
    const at = await s.screenOf(point)
    if (!(await inFreeArea(s, at))) continue
    await s.page.mouse.move(at.x, at.y, { steps: 8 })
    await s.sleep(400)
    return
  }
  throw new Error('no open baseplate to park the mouse on')
}

/**
 * One student placement: aim near, read what the ghost shows, click where the mouse is. `snaps`
 * says the ghost must show the green snapped outline at `expect`; otherwise the pose alone.
 */
async function place(s, { partId, point, expect: expected, label, snaps = true, shot }) {
  const at = await aim(s, point)
  const ghost = await s.draft()
  const view = await s.connections()
  const poseOk = ghost && ghost.partId === partId && ghost.x === expected.x && ghost.y === expected.y && ghost.z === expected.z && ghost.rotation === expected.rotation
  const ghostText = ghost ? `${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}` : 'none'
  check(`${s.tag}:ghost:${label}`, poseOk && (snaps ? view.ghostSnapped : !view.ghostSnapped), `${label}: aimed near, the ghost shows ${ghostText}${view.ghostSnapped ? ` with the green snapped outline (${view.snappedKey})` : ' (not snapped)'}`)
  if (shot) await s.shot(shot)
  const countBefore = await s.brick((state) => state.bricks.length)
  await s.page.mouse.click(at.x, at.y)
  await s.sleep(280)
  const placed = await s.lastBrick()
  check(`${s.tag}:placed:${label}`, (await s.brick((state) => state.bricks.length)) === countBefore + 1 && placed.partId === partId && placed.x === expected.x && placed.y === expected.y && placed.z === expected.z && placed.rotation === expected.rotation, `${label}: one click placed it at ${placed.x},${placed.y},${placed.z} r${placed.rotation}`)
  s.placements += 1
  return { placed, lookedSnapped: Boolean(view.ghostSnapped) }
}

/** Drags the selected part with the real mouse ("Drag to move") and lets go near where it belongs: it snaps like a new one. */
async function dragNear(s, { brickId, grab, to, expect: expected, label, shot }) {
  await settle(s)
  const from = await s.screenOf(grab)
  const dest = await s.screenOf(to)
  assert(await inFreeArea(s, from) && await inFreeArea(s, dest), `${label}: the drag stays inside the free canvas area`)
  await s.page.mouse.move(from.x, from.y, { steps: 4 })
  await s.sleep(120)
  await s.page.mouse.down()
  await s.page.mouse.move(dest.x, dest.y, { steps: 14 })
  await s.sleep(260)
  const ghost = await s.draft()
  const view = await s.connections()
  check(`${s.tag}:ghost:${label}`, ghost && ghost.x === expected.x && ghost.y === expected.y && ghost.z === expected.z && ghost.rotation === expected.rotation && view.ghostSnapped, `${label}: mid-drag the ghost shows ${ghost ? `${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}` : 'none'}${view.ghostSnapped ? ' with the green snapped outline' : ' (not snapped)'}`)
  if (shot) await s.shot(shot)
  await s.page.mouse.up()
  await s.sleep(300)
  const moved = await s.brick((state, id) => state.bricks.find((b) => b.id === id), brickId)
  check(`${s.tag}:moved:${label}`, moved && moved.x === expected.x && moved.y === expected.y && moved.z === expected.z, `${label}: letting go put it at ${moved?.x},${moved?.y},${moved?.z}`)
}

/** Connected the way it looked: an axle in a socket, a wheel on an axle, a motor on the robot. Tallies misleading placements. */
async function tally(s, result) {
  const connected = await s.robo((state, id) => {
    const partId = state.model.input.bricks.find((b) => b.id === id)?.partId
    return state.model.creations.some((creation) => partId === 'robo_motor' ? creation.brickIds.includes(id)
      : partId === 'robo_wheel' ? creation.wheels.some((wheel) => wheel.brickId === id && wheel.onAxle)
        : creation.axles.some((axle) => axle.brickId === id && axle.motorId))
  }, result.placed.id)
  const marked = (await s.connections()).gaps.some((gap) => gap.brickId === result.placed.id)
  const misleading = (result.lookedSnapped && !connected) || (!connected && !marked && result.placed.partId !== 'robo_motor')
  if (misleading) s.misleading += 1
  s.log.push({ partId: result.placed.partId, at: [result.placed.x, result.placed.y, result.placed.z, result.placed.rotation], snappedGhost: result.lookedSnapped, connected, gapMarker: marked, misleading })
  return connected
}

/** The creation card is lane G's: name the robot through it when it has the familiar controls, else through the store. */
async function nameRobot(s, name) {
  await s.sleep(300)
  const card = s.page.getByTestId('robotics-creation-card')
  if (await card.count()) {
    const field = card.getByRole('textbox').first()
    if (await field.count()) await field.fill(name)
    for (const label of ['Not now', 'Keep building']) {
      const button = card.getByRole('button', { name: label, exact: true })
      if (!(await button.count())) continue
      await button.click()
      await s.sleep(250)
      if ((await s.robo((state) => state.model.creations.map((c) => c.name))).includes(name)) return `the card's ${label}`
    }
  }
  await s.robo((state, n) => { if (state.card) state.confirmCard(n, false) }, name)
  await s.sleep(200)
  return 'the store (card controls not found)'
}

async function readiness(s) {
  return s.page.evaluate(async () => {
    const { readiness } = await import('/src/robotics/drive/readiness.ts')
    const creation = window.__robotics.roboticsStore.getState().model.creations[0]
    return creation ? readiness(creation) : null
  })
}

/* ---------------------------------------------------------------- A / C. a car from parts */
async function buildCar(width, full) {
  const s = await session(width, full ? 'A' : 'C')
  console.log(`\n${s.tag}. A car from parts at ${width}×768, aimed near`)
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  const ids = {}

  await choose(s, 'plate_6x8')
  ids.plate = (await place(s, { partId: 'plate_6x8', point: world(31, 0, 30), expect: { x: 28, y: 0, z: 26, rotation: 0 }, label: 'plate', snaps: false })).placed.id
  await choose(s, 'robo_hub')
  ids.hub = (await place(s, { partId: 'robo_hub', point: world(31, 1, 29), expect: { x: 29, y: 1, z: 27, rotation: 0 }, label: 'hub', snaps: false })).placed.id
  const namedThrough = await nameRobot(s, 'Buggy')
  check(`${s.tag}:named`, (await s.robo((state) => state.model.creations[0]?.name)) === 'Buggy', `the robot is called Buggy (named through ${namedThrough})`)
  await s.page.getByRole('button', { name: 'Frame build' }).click()
  const room = await makeRoom(s)
  if (room.length) s.log.push({ note: `to see the whole car: ${room.includes('hid the robot panel') ? 'hid the robot panel, ' : ''}${room.filter((step) => step === 'scrolled out').length * 4} mouse-wheel notches out` })

  // Motors: the free stretches of the plate's long sides glow; near a side the motor turns and mounts itself.
  await choose(s, 'robo_motor')
  await park(s)
  let view = await s.connections()
  check(`${s.tag}:motor-targets`, view.runs.length === 2 && view.runs.every((run) => run.poses.length > 0) && !view.ghostSnapped, `motor armed, the mouse on open ground: ${view.runs.length} glowing edge stretches (${view.runs.map((run) => run.key.split(':')[1]).join(', ')})`)
  await s.shot('S1-motor-targets')
  let result = await place(s, { partId: 'robo_motor', point: world(26.4, 0, 30.2), expect: { x: 28, y: 1, z: 31, rotation: 2 }, label: 'motor beside the left side (on the ground, 1.6 studs off, level with the hub)', shot: 'S2-motor-snapped' })
  ids.leftMotor = result.placed.id
  check(`${s.tag}:left-motor-on`, await tally(s, result), 'the left motor is on Buggy')
  check(`${s.tag}:left-motor-wired`, (await s.robo((state) => state.wiringNote?.text)) === 'Left motor connected to port A', `wiring line: ${await s.wiringLine()}`)
  result = await place(s, { partId: 'robo_motor', point: world(33.4, 1, 30), expect: { x: 31, y: 1, z: 31, rotation: 0 }, label: 'motor over the plate near the right edge, beside the hub' })
  ids.rightMotor = result.placed.id
  check(`${s.tag}:right-motor-on`, await tally(s, result), 'the right motor is on Buggy')

  // Axles: every free socket glows; aimed at the ground about a stud short, the axle snaps in.
  await choose(s, 'robo_axle_short')
  await park(s)
  view = await s.connections()
  check(`${s.tag}:axle-targets`, view.targets.filter((target) => target.kind === 'socket').length === 2, `axle armed: ${view.targets.length} glowing sockets`)
  await s.shot('S3-axle-targets')
  result = await place(s, { partId: 'robo_axle_short', point: world(25, 0, 33.4), expect: { x: 26, y: 0, z: 32, rotation: 0 }, label: 'axle aimed at the ground a stud past the left socket', shot: 'S4-axle-snapped' })
  ids.leftAxle = result.placed.id
  check(`${s.tag}:left-axle-in`, await tally(s, result), 'the left axle is in the left motor')
  result = await place(s, { partId: 'robo_axle_short', point: world(37, 0, 31.6), expect: { x: 34, y: 0, z: 32, rotation: 0 }, label: 'axle aimed at the ground a stud past the right socket' })
  ids.rightAxle = result.placed.id
  check(`${s.tag}:right-axle-in`, await tally(s, result), 'the right axle is in the right motor')

  // Wheels: every free axle end glows; aimed near it, the wheel snaps on.
  await choose(s, 'robo_wheel')
  await park(s)
  view = await s.connections()
  check(`${s.tag}:wheel-targets`, view.targets.filter((target) => target.kind === 'axle-end').length === 2, `wheel armed: ${view.targets.length} glowing axle ends`)
  await s.shot('S5-wheel-targets')
  result = await place(s, { partId: 'robo_wheel', point: world(24.2, 0, 34.6), expect: { x: 25, y: 0, z: 31, rotation: 0 }, label: 'wheel aimed near the left axle end', shot: 'S6-wheel-snapped' })
  ids.leftWheel = result.placed.id
  check(`${s.tag}:left-wheel-on`, await tally(s, result), 'the left wheel is on its axle')
  result = await place(s, { partId: 'robo_wheel', point: world(37.8, 0, 30.4), expect: { x: 36, y: 0, z: 31, rotation: 0 }, label: 'wheel aimed near the right axle end' })
  ids.rightWheel = result.placed.id
  check(`${s.tag}:right-wheel-on`, await tally(s, result), 'the right wheel is on its axle')
  await s.page.keyboard.press('Escape')
  await s.sleep(200)

  const ready = await readiness(s)
  check(`${s.tag}:can-drive`, ready?.kind === 'drive' && ready.ready === true, `readiness(): ${JSON.stringify(ready)}`)
  view = await s.connections()
  check(`${s.tag}:no-gaps`, view.gaps.length === 0, `no red gap markers on the finished car (${view.gaps.length})`)
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  await s.shot('S7-car-ready')
  builds[s.tag] = { viewport: `${width}x768`, placements: s.placements, lookedConnectedButWasNot: s.misleading, placementsLog: s.log }
  check(`${s.tag}:counts`, s.placements === 8 && s.misleading === 0, `${s.placements} placements, ${s.misleading} that looked connected but were not`)
  if (!full) return s

  // A motor dropped on the bare ground beside Buggy (too far to be pulled onto the plate): it says so.
  await choose(s, 'robo_motor')
  result = await place(s, { partId: 'robo_motor', point: world(31.3, 0, 38.6), expect: { x: 30, y: 0, z: 37, rotation: 0 }, label: 'motor dropped on the ground behind Buggy', snaps: false })
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  const line = await s.wiringLine()
  // Buggy's plate has no spot left for a motor, so the line says so and what would help (kid-UX lane W wording).
  check('A:not-attached-line', line?.includes("This motor isn't on Buggy yet. There's no room for it on Buggy. Try a bigger plate."), `wiring line: ${line}`)
  view = await s.connections()
  check('A:bare-ground-label', view.labels.some((label) => label.brickId === result.placed.id && label.text === BARE_GROUND), `next to the motor: ${JSON.stringify(view.labels.map((label) => label.text))}`)
  check('A:no-second-robot', (await s.robo((state) => state.card)) === null && (await s.robo((state) => state.model.creations.length)) === 1, 'no second robot and no card for it')
  await s.shot('S8-motor-on-ground')
  await s.page.getByRole('button', { name: 'Undo', exact: true }).first().click()
  await s.sleep(300)
  check('A:stray-undone', (await s.brick((state) => state.bricks.length)) === 8, 'Undo took the stray motor away')

  // A near miss: the left wheel nudged a stud off its axle shows a red gap marker until it is fixed.
  const wheelAt = await s.screenOf(world(25.5, 5, 32.5))
  await s.page.mouse.click(wheelAt.x, wheelAt.y)
  await s.sleep(250)
  check('A:wheel-selected', (await s.brick((state) => state.selectedId)) === ids.leftWheel, 'clicking the wheel selects it')
  await s.page.keyboard.press('ArrowLeft')
  await s.sleep(300)
  view = await s.connections()
  check('A:gap-marker', view.gaps.length === 1 && view.gaps[0].brickId === ids.leftWheel && view.gaps[0].text === 'Put the wheel on the axle', `gap markers: ${JSON.stringify(view.gaps.map((gap) => gap.text))}`)
  await s.shot('S9-near-miss')
  await dragNear(s, { brickId: ids.leftWheel, grab: world(24.5, 5, 32.5), to: world(25.8, 5, 33), expect: { x: 25, y: 0, z: 31, rotation: 0 }, label: 'the wheel dragged back near its axle end', shot: 'S9b-near-miss-dragged-back' })
  view = await s.connections()
  check('A:gap-fixed', view.gaps.length === 0 && (await readiness(s))?.ready === true, 'moved back with a snap: no gap marker, still ready to drive')
  return s
}

/* ---------------------------------------------------------------- B. the owner's first try */
async function ownersFirstTry(s) {
  console.log('\nB. The owner\'s first try, replayed')
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  s.tag = 'B'
  s.placements = 0
  s.misleading = 0
  s.log = []
  await choose(s, 'robo_hub')
  await place(s, { partId: 'robo_hub', point: world(22.2, 0, 30.2), expect: { x: 20, y: 0, z: 28, rotation: 0 }, label: 'hub on the bare ground', snaps: false })
  await nameRobot(s, 'Robo')
  await choose(s, 'robo_motor')
  const motor = (await place(s, { partId: 'robo_motor', point: world(26.2, 0, 29.6), expect: { x: 25, y: 0, z: 28, rotation: 0 }, label: 'motor on the ground beside the hub', snaps: false })).placed
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  check('B:no-second-robot', (await s.robo((state) => state.card)) === null && (await s.robo((state) => state.model.creations.length)) === 1, 'the motor did not start a second robot asking for a hub')
  const line = await s.wiringLine()
  check('B:not-attached-line', line?.includes("This motor isn't on Robo yet. Put them both on a plate."), `wiring line: ${line}`)
  let view = await s.connections()
  check('B:bare-ground-label', view.labels.some((label) => label.brickId === motor.id && label.text === BARE_GROUND), `next to the motor: ${JSON.stringify(view.labels.map((label) => label.text))}`)
  await s.shot('S10-owner-motor-beside-hub')
  // The card framed the hub up close: press Frame and scroll out a little, as a student would.
  await s.page.getByRole('button', { name: 'Frame build' }).click()
  await s.sleep(600)
  const middle = await s.screenOf(world(26, 0, 30))
  await s.page.mouse.move(middle.x, middle.y, { steps: 4 })
  await s.page.mouse.wheel(0, 360)
  await s.sleep(700)
  // The axle aimed where it looks like it goes: the socket is one plate too low, so no snap, and the hint says why.
  await choose(s, 'robo_axle_short')
  const at = await aim(s, world(29.2, 0, 29.6))
  view = await s.connections()
  check('B:no-false-snap', !view.ghostSnapped && view.hint === 'Put the motor on a plate first', `aimed in front of the socket: ${view.ghostSnapped ? 'snapped' : 'no snap'}, hint "${view.hint}"`)
  await s.shot('S11-owner-axle-hint')
  await s.page.mouse.click(at.x, at.y)
  await s.sleep(300)
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  const axle = await s.lastBrick()
  view = await s.connections()
  check('B:gap-marker', view.gaps.some((gap) => gap.brickId === axle.id), `the axle that points into the ring but is not in it gets a red gap marker (${JSON.stringify(view.gaps.map((gap) => gap.text))})`)
  s.placements += 1
  await tally(s, { placed: axle, lookedSnapped: false })
  await s.shot('S12-owner-axle-gap')
  builds.B = { viewport: `${s.width}x768`, placements: s.placements, lookedConnectedButWasNot: s.misleading, placementsLog: s.log }
  check('B:counts', s.misleading === 0, `${s.misleading} placements looked connected but were not (the axle beside the grounded motor is marked red)`)
}

/* ---------------------------------------------------------------- D. a motor on the ground, fixed with one drag */
async function dragFix(s) {
  console.log('\nD. A motor dropped on the ground beside the robot, fixed with one drag')
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  s.tag = 'D'
  s.placements = 0
  s.misleading = 0
  s.log = []
  await choose(s, 'plate_6x8')
  await place(s, { partId: 'plate_6x8', point: world(31, 0, 30), expect: { x: 28, y: 0, z: 26, rotation: 0 }, label: 'plate', snaps: false })
  await choose(s, 'robo_hub')
  await place(s, { partId: 'robo_hub', point: world(31, 1, 29), expect: { x: 29, y: 1, z: 27, rotation: 0 }, label: 'hub', snaps: false })
  await nameRobot(s, 'Buggy')
  await s.page.getByRole('button', { name: 'Frame build' }).click()
  await makeRoom(s)
  await choose(s, 'robo_motor')
  await tally(s, await place(s, { partId: 'robo_motor', point: world(26.4, 0, 30.2), expect: { x: 28, y: 1, z: 31, rotation: 2 }, label: 'left motor beside the left side' }))
  await choose(s, 'robo_motor')
  const dropped = await place(s, { partId: 'robo_motor', point: world(38.2, 0, 31.6), expect: { x: 37, y: 0, z: 30, rotation: 0 }, label: 'second motor dropped on the ground, too far out to be pulled on', snaps: false })
  await tally(s, dropped)
  const stray = dropped.placed
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  let line = await s.wiringLine()
  // Kid-UX lane W: "This motor isn't on Buggy yet." with a one-tap "Put it on Buggy" (the student here drags it instead).
  check('D:not-attached-line', line?.includes("This motor isn't on Buggy yet.") && (await s.page.getByTestId('robotics-line-action').textContent()) === 'Put it on Buggy', `wiring line: ${line}`)
  const top = await s.screenOf(world(38.5, 6, 31.5))
  await s.page.mouse.click(top.x, top.y)
  await s.sleep(250)
  check('D:motor-selected', (await s.brick((state) => state.selectedId)) === stray.id, 'clicking the motor selects it')
  await dragNear(s, { brickId: stray.id, grab: world(38.5, 6, 31.5), to: world(35.5, 6, 31.8), expect: { x: 31, y: 1, z: 31, rotation: 0 }, label: 'the motor dragged toward the plate', shot: 'S13-motor-dragged-on' })
  await s.sleep(300)
  line = await s.wiringLine()
  check('D:plugged-in', line?.includes('Right motor connected to port B'), `wiring line: ${line}`)
  const view = await s.connections()
  check('D:no-ground-label', !view.labels.some((label) => label.brickId === stray.id), 'the motor is on the plate: its "on the ground" line is gone')
  check('D:on-buggy', await s.robo((state, id) => state.model.creations[0]?.brickIds.includes(id), stray.id), 'the motor is part of Buggy')
  await s.shot('S14-motor-on-plate')
  builds.D = { viewport: `${s.width}x768`, placements: s.placements, fixDrags: 1, lookedConnectedButWasNot: s.misleading, placementsLog: s.log }
}

let failure = null
try {
  const wide = await buildCar(1366, true)
  await ownersFirstTry(wide)
  await dragFix(wide)
  await wide.context.close()
  const narrow = await buildCar(1024, false)
  await narrow.context.close()
} catch (error) {
  failure = error
  console.log(`\nstopped: ${error.message}`)
}
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, input: 'real mouse and keyboard via Playwright CDP; aim points from the studio\'s own world→screen projection, deliberately off the exact spot', at: new Date().toISOString(), builds, results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
for (const [tag, build] of Object.entries(builds)) console.log(`  ${tag} ${build.viewport}: ${build.placements} placements, ${build.lookedConnectedButWasNot} looked connected but were not`)
process.exit(failed.length || failure ? 1 : 0)
