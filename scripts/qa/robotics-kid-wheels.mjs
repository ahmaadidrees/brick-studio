/**
 * Robot Workshop kid-UX pass, lane W: a drivable car from separate parts, the way Leo (9) built
 * his, and the three things Sam (8) hit on the iPad (docs/robotics/KID-UX.md; docs/qa/robotics-kid/wheels/README.md).
 *
 * Real Chrome, real mouse and keyboard (Playwright CDP). Parts come from the drawer with a click and
 * are placed with a click where the mouse is; the robot panel's rows and the line's buttons are
 * clicked. Where a spot is on the screen comes from the studio's own world→screen projection (the
 * dev-only `window.__robotics.project`), the aiming a student does by eye. No fixture is loaded.
 *
 *   A. Leo's car: the Robot plate from Robot parts (the first tile), four wheels at its corners (each
 *      says "This wheel can't spin yet…" the moment it lands and carries a red mark), "Add a motor for
 *      it" on the line, the card, then "Fix wheel 1" three times in the panel; the hub from the next
 *      step, plugged in by itself; three leftover wheels beside it (the ready row says how many spin and
 *      that the loose ones stay here; Parts counts them apart); Drive, held forward: it drives.
 *   B. No room (Leo's first try): a 4 × 6 plate with a hub hanging over its far end and a motor on the
 *      left: the other side is red, the motor in the way outlined, and the row says there is no room;
 *      a wheel at the near-right corner: its fix says "No room for a motor here. Try a bigger plate."
 *   C. Sam: a motor aimed at the other side's green spot goes on facing out; a motor aimed at the hub
 *      never goes on the hub (a side instead, red with the reason when both sides are full); Rotate
 *      three times keeps the motor's name; a motor turned to face the back gets an arrow and "Turn it".
 *   D. Sam on a touch screen (1024 × 768, no hover): the step arms a motor, Place alone puts it on a
 *      side of the plate, never on the hub; a wheel tapped onto the plate gets its line and fix by touch.
 *   E. Ava: a seat, a light and a sensor dropped beside a Buggy each say "This seat isn't on Buggy yet."
 *      with one tap ("Put it on top" for a seat or a light, "Put it on Buggy" for a sensor) that puts it on.
 *
 * "Looked connected but was not" is counted after every placement and fix: a wheel that does not
 * spin (per the model: on an axle held by a motor) without the red can't-spin mark or gap marker, or
 * a green snapped ghost whose part did not connect. Target 0.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5242 node scripts/qa/robotics-kid-wheels.mjs
 *
 * against `npx vite --mode robotics --port 5242 --strictPort --host 127.0.0.1`.
 * Writes PNGs and results.json under docs/qa/robotics-kid/wheels/ (UI_OUTPUT overrides).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5242', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/wheels')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const shots = []
const counts = {}
const consoleErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); return ok }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const STUD = 0.62
const PLATE = 0.18
/** Plate grid coordinates (studs from the corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
const M = { hub: 'robo_hub', motor: 'robo_motor', axle: 'robo_axle_short', wheel: 'robo_wheel' }
const TILE = { robo_hub: 'Hub', robo_motor: 'Motor', robo_wheel: 'Wheel', plate_4x6: '4 × 6 Plate' }
const CANT_SPIN = "This wheel can't spin yet. It needs an axle in a motor."
const NO_ROOM = 'No room for a motor here. Try a bigger plate.'

async function session(width, height, tag, touch = false) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${tag}: ${message.text()}`) })
  page.on('pageerror', (error) => consoleErrors.push(`${tag}: ${String(error)}`))
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.waitForFunction(() => Boolean(window.__robotics?.project && window.__robotics?.connections && window.__robotics?.roboticsStore), null, { timeout: 60_000 })
  await page.waitForSelector('canvas')
  const s = { page, context, tag, width, placements: 0, misleading: 0, log: [] }
  s.sleep = (ms) => page.waitForTimeout(ms)
  const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
  s.brick = run('brickStore')
  s.robo = run('roboticsStore')
  s.stage = run('stageStore')
  s.connections = () => page.evaluate(() => window.__robotics.connections())
  s.screenOf = (point) => page.evaluate((p) => window.__robotics.project(p), point)
  s.draft = () => s.brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z, rotation: state.draft.rotation })
  s.bricks = () => s.brick((state) => state.bricks.map((b) => ({ id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation })))
  s.last = async () => (await s.bricks()).at(-1)
  s.pose = async (id) => { const b = (await s.bricks()).find((candidate) => candidate.id === id); return b && { x: b.x, y: b.y, z: b.z, rotation: b.rotation } }
  s.line = async () => { const line = page.getByTestId('robotics-wiring-line'); return (await line.count()) ? (await line.locator('span').first().textContent())?.trim() ?? '' : '' }
  s.lineAction = () => page.getByTestId('robotics-line-action')
  s.panel = page.getByTestId('robotics-panel')
  s.steps = page.getByTestId('robotics-next-steps')
  s.currentText = async () => { const current = s.steps.locator('[aria-current=step]'); return (await current.count()) ? (await current.first().locator('.robotics-step-text').innerText()).replace(/\s+/g, ' ').trim() : null }
  s.shot = async (name) => { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); shots.push(file); console.log(`  shot ${file}`) }
  /** Every wheel in the world: spins (model) and marked (scene) — a wheel that doesn't spin must carry a mark. */
  s.wheels = () => page.evaluate(async () => {
    // The model's own reading (mechanism.ts): a wheel spins on an axle whose other end is in a motor's socket.
    const { deriveMechanisms } = await import('/src/robotics/model/mechanism.ts')
    const { wheelSpins } = await import('/src/robotics/model/looseWheels.ts')
    const { input } = window.__robotics.roboticsStore.getState().model
    const marks = new Set(window.__robotics.connections().cantSpin.map((mark) => mark.brickId))
    const spinning = new Set(wheelSpins(deriveMechanisms(input.bricks, input.partMap, input.plateSize)).filter((wheel) => wheel.spins).map((wheel) => wheel.wheelId))
    return input.bricks.filter((brick) => brick.partId === 'robo_wheel').map((brick) => ({ id: brick.id, spins: spinning.has(brick.id), marked: marks.has(brick.id) }))
  })
  /** After a placement or a fix: counts wheels (and green-snapped parts) that looked connected but were not. */
  s.tally = async (label, lookedSnapped = false, placedId = null) => {
    const wheels = await s.wheels()
    const unmarked = wheels.filter((wheel) => !wheel.spins && !wheel.marked)
    let snappedButLoose = 0
    if (lookedSnapped && placedId) {
      const connected = await s.robo((state, id) => {
        const partId = state.model.input.bricks.find((b) => b.id === id)?.partId
        return state.model.creations.some((c) => partId === 'robo_motor' ? c.brickIds.includes(id) : partId === 'robo_wheel' ? c.wheels.some((w) => w.brickId === id && w.onAxle) : c.axles.some((a) => a.brickId === id && a.motorId))
      }, placedId)
      if (!connected) snappedButLoose = 1
    }
    const misleading = unmarked.length + snappedButLoose
    s.misleading += misleading
    s.log.push({ label, wheels: wheels.length, spinning: wheels.filter((wheel) => wheel.spins).length, marked: wheels.filter((wheel) => wheel.marked).length, misleading })
    return misleading
  }
  return s
}

/** The drawer's Robots choice, then a part (the Robot plate is the first tile of Robot parts). */
async function choose(s, partId) {
  const robots = s.page.getByTestId('robots-choice')
  if (partId.startsWith('robo_') || partId === 'robot-plate') {
    if ((await robots.getAttribute('aria-pressed')) !== 'true') await robots.click()
    const tile = partId === 'robot-plate' ? s.page.getByTestId('robot-plate-part') : s.page.locator(`.library-part[title="${TILE[partId]}"]`)
    await tile.scrollIntoViewIfNeeded()
    await tile.click()
  } else {
    if ((await robots.getAttribute('aria-pressed')) === 'true') await robots.click()
    await s.page.getByLabel('Brick category').selectOption('all')
    await s.page.locator(`.library-part[title="${TILE[partId]}"]`).click()
  }
  await s.sleep(150)
}

async function inFreeArea(s, at) {
  return s.page.evaluate((p) => {
    if (!p.inFront) return false
    return [[0, 0], [-6, -6], [6, -6], [-6, 6], [6, 6]].every(([dx, dy]) => document.elementFromPoint(p.x + dx, p.y + dy)?.tagName === 'CANVAS')
  }, at)
}

async function settle(s) {
  let last = null
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const now = await s.screenOf(world(32, 0, 32))
    if (last && Math.abs(now.x - last.x) < 0.25 && Math.abs(now.y - last.y) < 0.25) return
    last = now
    await s.sleep(100)
  }
}

async function aim(s, point) {
  await settle(s)
  const at = await s.screenOf(point)
  assert(await inFreeArea(s, at), `${JSON.stringify(point)} projects to (${Math.round(at.x)}, ${Math.round(at.y)}), outside the free canvas area`)
  await s.page.mouse.move(at.x, at.y, { steps: 8 })
  await s.sleep(240)
  return at
}

/** One placement: aim, check the ghost, click where the mouse is, check what was placed. */
async function place(s, { partId, point, expect: expected, label }) {
  const at = await aim(s, point)
  const ghost = await s.draft()
  const view = await s.connections()
  const ghostOk = ghost && ghost.partId === partId && ghost.x === expected.x && ghost.y === expected.y && ghost.z === expected.z && ghost.rotation === expected.rotation
  check(`${s.tag}:ghost:${label}`, ghostOk, `${label}: aimed near, the ghost shows ${ghost ? `${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}` : 'none'}${view.ghostSnapped ? ' with the green snapped outline' : ''}`)
  const before = (await s.bricks()).length
  await s.page.mouse.click(at.x, at.y)
  await s.sleep(320)
  const placed = await s.last()
  check(`${s.tag}:placed:${label}`, (await s.bricks()).length === before + 1 && placed.partId === partId && placed.x === expected.x && placed.y === expected.y && placed.z === expected.z && placed.rotation === expected.rotation, `${label}: one click placed it at ${placed.x},${placed.y},${placed.z} r${placed.rotation}`)
  s.placements += 1
  await s.tally(label, Boolean(view.ghostSnapped), placed.id)
  return placed
}

async function frame(s) {
  await s.page.getByRole('button', { name: 'Frame build' }).click()
  await s.sleep(700)
}

/** The robot's card, named through its own field and Keep building. */
async function nameRobot(s, name) {
  const card = s.page.getByTestId('robotics-creation-card')
  await card.waitFor({ timeout: 5000 })
  await card.getByRole('textbox', { name: 'Robot name' }).fill(name)
  await card.getByRole('button', { name: 'Keep building' }).click()
  await s.sleep(300)
}

/* ================================================================ A. Leo's car */
async function leosCar() {
  const s = await session(1366, 768, 'A')
  console.log('\nA. Leo\'s car from separate parts (1366×768)')
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  await s.page.evaluate(() => window.__robotics.brickStore.setState({ toast: null }))

  // The Robot plate: the first tile of Robot parts, the Buggy's size.
  await s.page.getByTestId('robots-choice').click()
  await s.page.getByTestId('kit-shelf').waitFor()
  await s.page.getByTestId('robot-plate-part').waitFor()
  const firstTile = await s.page.evaluate(() => {
    const heading = [...document.querySelectorAll('.kit-shelf-heading')].find((h) => h.textContent === 'Robot parts')
    const next = heading?.closest('.kit-shelf')?.nextElementSibling
    return next ? { testId: next.getAttribute('data-testid'), text: next.textContent?.trim() } : null
  })
  check('A:robot-plate-first', firstTile?.testId === 'robot-plate-part' && firstTile.text === 'Robot plate', `the first tile after "Robot parts" is ${JSON.stringify(firstTile)}`)
  await s.page.getByTestId('robot-plate-part').scrollIntoViewIfNeeded()
  await s.shot('W01-robot-plate-tile')
  await choose(s, 'robot-plate')
  check('A:robot-plate-arms', (await s.draft())?.partId === 'plate_6x8', `the Robot plate tile armed ${(await s.draft())?.partId}`)
  const plate = await place(s, { partId: 'plate_6x8', point: world(31, 0, 30), expect: { x: 28, y: 0, z: 26, rotation: 0 }, label: 'robot plate' })
  await s.page.keyboard.press('Escape')

  // Four wheels at the corners: each says it can't spin, with its fix, and is marked.
  await choose(s, M.wheel)
  const corners = [['front left', 28.5, 27.5, 28, 26], ['front right', 33.5, 27.5, 33, 26], ['back left', 28.5, 32.5, 28, 31], ['back right', 33.5, 32.5, 33, 31]]
  const wheels = {}
  for (const [name, px, pz, x, z] of corners) {
    const placed = await place(s, { partId: M.wheel, point: world(px, 1, pz), expect: { x, y: 1, z, rotation: 0 }, label: `wheel ${name}` })
    wheels[name] = placed.id
    const line = await s.line()
    const view = await s.connections()
    check(`A:cant-spin-line:${name}`, line === CANT_SPIN && (await s.lineAction().textContent()) === 'Add a motor for it', `the line: "${line}" [${await s.lineAction().textContent()}]`)
    check(`A:cant-spin-mark:${name}`, view.cantSpin.some((mark) => mark.brickId === placed.id && mark.mark === 'ring') && view.labels.some((label) => label.brickId === placed.id && label.text === CANT_SPIN), `on the wheel: the red can't-spin mark and the line (${view.cantSpin.length} marked)`)
    if (name === 'front left') await s.shot('W02-wheel-cant-spin')
  }
  await s.page.keyboard.press('Escape')
  await s.sleep(200)
  const loose = await s.wheels()
  check('A:four-loose-wheels', loose.length === 4 && loose.every((wheel) => !wheel.spins && wheel.marked) && (await s.robo((state) => state.model.creations.length)) === 0, `four wheels on the plate, none spinning, every one marked; no robot yet (a wheel is not a robot: the fix makes one)`)
  await s.shot('W03-four-wheels-marked')

  // "Add a motor for it" on the line (the last wheel): a motor, an axle, the wheel on the axle; the robot starts.
  const undoDepth = await s.brick((state) => state.undoStack.length)
  await s.lineAction().click()
  await s.sleep(500)
  const backRight = await s.pose(wheels['back right'])
  check('A:fix-one', backRight.y === 0 && (await s.wheels()).find((wheel) => wheel.id === wheels['back right']).spins, `the back-right wheel now stands on the ground at ${backRight.x},${backRight.y},${backRight.z} on an axle in a new motor, and spins`)
  check('A:fix-one-undo', (await s.brick((state) => state.undoStack.length)) === undoDepth + 1 && (await s.brick((state) => state.undoStack.at(-1).label)) === 'Add a motor for the wheel', `one history entry: "${await s.brick((state) => state.undoStack.at(-1).label)}"`)
  check('A:fix-one-line', (await s.line()) === 'Added a motor and an axle. The wheel can spin now!', `the line: "${await s.line()}"`)
  await s.tally('fix: back right')
  await s.shot('W04-first-fix-card')
  await nameRobot(s, 'Speedy')
  await frame(s)

  // The panel lists the three still loose, numbered as on the wheels; Fix wheel 1, three times.
  const looseBlock = s.page.getByTestId('robotics-loose-wheels')
  check('A:loose-line', (await looseBlock.getByTestId('robotics-loose-line').textContent()) === "1 wheel spins. 3 wheels aren't on an axle.", `under the steps: "${await looseBlock.getByTestId('robotics-loose-line').textContent()}"`)
  const badges = (await s.connections()).cantSpin.map((mark) => mark.number)
  check('A:loose-numbers', badges.join() === '1,2,3', `the scene numbers the loose wheels ${badges.join(', ')}, as the rows do`)
  await looseBlock.scrollIntoViewIfNeeded()
  await s.shot('W05-loose-wheels-in-panel')
  for (let turn = 0; turn < 3; turn += 1) {
    const fix = s.page.getByTestId('robotics-loose-wheel').first().locator('.robotics-loose-fix')
    await fix.click()
    await s.sleep(450)
    await s.tally(`fix wheel ${turn + 1}`)
  }
  const all = await s.wheels()
  check('A:all-wheels-spin', all.length === 4 && all.every((wheel) => wheel.spins), `after three taps on Fix wheel 1: ${all.filter((wheel) => wheel.spins).length} of 4 wheels spin`)
  const parts = await s.bricks()
  check('A:nothing-in-the-air', parts.every((b) => (b.partId === M.motor ? b.y === 1 : b.partId === 'plate_6x8' || b.partId === M.axle || b.partId === M.wheel ? b.y === 0 : true)), `every motor stands on the plate (y 1), every axle and wheel on the ground (y 0): ${parts.map((b) => `${b.partId.replace('robo_', '')}@${b.y}`).join(' ')}`)
  const motorNames = await s.robo((state) => state.model.creations[0].motors.map((motor) => motor.name).sort())
  check('A:motor-names', motorNames.join() === 'Back left motor,Back right motor,Front left motor,Front right motor', `four motors, named by where they stand: ${motorNames.join(', ')}`)
  await frame(s)
  await s.shot('W06-four-wheels-spin')

  // The hub, from the next step: on top of the front motors; every motor plugs in by itself.
  check('A:hub-step', (await s.currentText()) === 'Add a hub. It is the robot’s brain.', `the next step: "${await s.currentText()}"`)
  await s.steps.locator('[aria-current=step]').click()
  await s.sleep(200)
  await place(s, { partId: M.hub, point: world(31, 7, 28), expect: { x: 29, y: 7, z: 26, rotation: 0 }, label: 'hub on the front motors' })
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  const plugged = await s.robo((state) => state.model.creations[0].motors.map((motor) => motor.port?.port ?? null))
  check('A:plugged', plugged.filter(Boolean).length === 4, `the hub plugged every motor in: ports ${plugged.join(', ')}`)
  check('A:ready', (await s.currentText()) === 'Ready to drive!' && await s.page.getByTestId('robotics-play-button').isEnabled(), `"${await s.currentText()}", Drive on`)

  // Leo's leftovers: three wheels beside the car. Drive stays on; the line says they stay here.
  await choose(s, M.wheel)
  for (const [x, px] of [[29, 29.5], [31, 31.5], [33, 33.5]]) await place(s, { partId: M.wheel, point: world(px, 0, 37.5), expect: { x, y: 0, z: 36, rotation: 0 }, label: `leftover wheel ${x}` })
  await s.page.keyboard.press('Escape')
  await s.robo((state) => state.dismissWiringNote())
  await s.sleep(300)
  check('A:ready-with-loose', (await s.currentText()) === 'Ready to drive!' && await s.page.getByTestId('robotics-play-button').isEnabled(), 'still ready, Drive on')
  const readyLine = await s.page.getByTestId('robotics-loose-line').textContent()
  check('A:ready-loose-line', readyLine === "4 wheels spin. 3 wheels aren't on an axle. They stay here when you drive.", `under "Ready to drive!": "${readyLine}"`)
  await frame(s)
  await s.shot('W07-ready-with-loose-wheels')
  await s.panel.getByRole('button', { name: /^Parts/ }).click()
  await s.sleep(200)
  const partsLine = await s.page.getByTestId('robotics-parts-line').textContent()
  check('A:parts-apart', /4 wheels, 4 axles · 3 loose wheels$/.test(partsLine), `Parts: "${partsLine}"`)
  await s.page.getByTestId('robotics-parts-line').scrollIntoViewIfNeeded()
  await s.shot('W08-parts-loose-apart')
  await s.panel.getByRole('button', { name: /^Parts/ }).click()

  // Drive: the leftovers stay in the build; the car drives.
  const creationId = await s.robo((state) => state.model.creations[0].id)
  await s.page.getByTestId('robotics-play-button').click()
  await s.page.waitForSelector('[data-testid=robo-drive][data-state=play]', { timeout: 30_000 })
  await s.page.waitForFunction(() => { const st = window.__robotics.stageStore.getState(); return st.stage && !st.stageLoading && st.stageObservation?.phase === 'running' }, null, { timeout: 30_000 })
  await s.sleep(800)
  const hubId = (await s.bricks()).find((b) => b.partId === M.hub).id
  const chassis = () => s.stage((state, hub) => { const st = state.stage; const pose = st.controller.poses().get(st.controller.bodyOfBrick(hub)); return { x: pose.position.x, z: pose.position.z, forward: st.creation.drivePair.forward, drawn: [...st.controller.simulatedBrickIds] } }, hubId)
  const start = await chassis()
  const leftovers = (await s.bricks()).filter((b) => b.partId === M.wheel && b.z === 36).map((b) => b.id)
  check('A:leftovers-not-driven', leftovers.every((id) => !start.drawn.includes(id)), 'the three loose wheels are not part of the car on the test plate')
  await s.page.keyboard.down('ArrowUp')
  await s.sleep(2500)
  await s.page.keyboard.up('ArrowUp')
  await s.sleep(300)
  const end = await chassis()
  const studs = ((end.x - start.x) * start.forward.x + (end.z - start.z) * start.forward.z) / STUD
  counts.A = { drivenStuds: +studs.toFixed(2) }
  check('A:drives', studs > 2, `ArrowUp held 2.5 s drove Speedy ${studs.toFixed(1)} studs forward`)
  await s.shot('W09-driving')
  await s.page.getByTestId('robo-drive-back').click()
  await s.page.waitForSelector('[data-testid=robo-drive]', { state: 'detached' })
  await s.sleep(400)
  check('A:leftovers-still-here', leftovers.every(async () => true) && (await s.bricks()).filter((b) => leftovers.includes(b.id)).length === 3, 'back in the build, the three loose wheels are where they were')
  // Take them off.
  for (let turn = 0; turn < 3; turn += 1) {
    await s.page.getByTestId('robotics-loose-wheel').first().locator('.robotics-loose-remove').click()
    await s.sleep(250)
  }
  check('A:taken-off', (await s.page.getByTestId('robotics-loose-wheels').count()) === 0 && (await s.bricks()).filter((b) => b.partId === M.wheel).length === 4, 'Take it off, three times: the loose wheels are gone and the loose-wheel line with them')
  counts.A = { ...counts.A, placements: s.placements, fixes: 4, lookedConnectedButWasNot: s.misleading, log: s.log, creationId }
  check('A:counts', s.misleading === 0, `${s.placements} placements and 4 fixes, ${s.misleading} that looked connected but were not`)
  await s.context.close()
}

/* ================================================================ B. no room on a 4 × 6 plate */
async function noRoom() {
  const s = await session(1366, 768, 'B')
  console.log('\nB. No room on Leo\'s 4 × 6 plate')
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  await choose(s, 'plate_4x6')
  await place(s, { partId: 'plate_4x6', point: world(32, 0, 29), expect: { x: 30, y: 0, z: 26, rotation: 0 }, label: '4 × 6 plate' })
  await choose(s, M.hub)
  // The hub hangs a stud over the plate's far end, as Leo's did.
  await place(s, { partId: M.hub, point: world(32, 1, 27), expect: { x: 30, y: 1, z: 25, rotation: 0 }, label: 'hub over the far end' })
  await s.page.keyboard.press('Escape')
  await nameRobot(s, 'Speedy')
  await frame(s)
  // A hub alone: "Make it move" arms a motor.
  await s.steps.getByRole('button', { name: /^Make it move/ }).click()
  await s.sleep(200)
  const left = await place(s, { partId: M.motor, point: world(30.8, 1, 30.8), expect: { x: 30, y: 1, z: 29, rotation: 2 }, label: 'motor near the left side' })
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  const row = await s.currentText()
  check('B:other-side-no-room-row', row === 'Put a motor on the other side. No room there. Try a bigger plate.', `the row: "${row}"`)
  await s.steps.locator('[aria-current=step]').click()
  await s.sleep(200)
  await s.page.mouse.move(40, 700)
  await s.sleep(300)
  const view = await s.connections()
  check('B:other-side-red', view.otherSide.length === 1 && !view.otherSide[0].free && view.outlined.includes(left.id) && view.labels.some((label) => label.text === NO_ROOM), `the other side: red at ${JSON.stringify(view.otherSide[0]?.pose)}, the left motor outlined, "${NO_ROOM}" above it`)
  await s.shot('W10-no-room-other-side')
  await s.page.keyboard.press('Escape')
  await choose(s, M.wheel)
  const wheel = await place(s, { partId: M.wheel, point: world(33.5, 1, 30.5), expect: { x: 33, y: 1, z: 29, rotation: 0 }, label: 'wheel at the near-right corner' })
  await s.page.keyboard.press('Escape')
  check('B:wheel-line', (await s.line()) === CANT_SPIN, `the line: "${await s.line()}"`)
  const before = await s.bricks()
  await s.lineAction().click()
  await s.sleep(400)
  const note = await s.robo((state) => state.wiringNote && { text: state.wiringNote.text, blockers: state.wiringNote.blockers, ghost: state.wiringNote.ghost })
  check('B:no-room', note.text === NO_ROOM && note.blockers.length > 0 && note.ghost?.partId === M.motor && JSON.stringify(await s.bricks()) === JSON.stringify(before), `"${note.text}"; outlined: ${note.blockers.length} part(s); a red motor where it would go; nothing moved`)
  check('B:no-room-outlined', (await s.connections()).outlined.includes(left.id), 'the motor in the way is outlined')
  await s.shot('W11-no-room-wheel')
  counts.B = { placements: s.placements, lookedConnectedButWasNot: s.misleading, wheel: wheel.id }
  check('B:counts', s.misleading === 0, `${s.misleading} that looked connected but were not (the wheel carries its red mark)`)
  await s.context.close()
}

/* ================================================================ C. Sam's three */
async function sam() {
  const s = await session(1366, 768, 'C')
  console.log('\nC. Sam: the green spot faces out, never on the hub, the name stays')
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  await choose(s, 'robot-plate')
  await place(s, { partId: 'plate_6x8', point: world(31, 0, 30), expect: { x: 28, y: 0, z: 26, rotation: 0 }, label: 'robot plate' })
  await choose(s, M.hub)
  await place(s, { partId: M.hub, point: world(31, 1, 29), expect: { x: 29, y: 1, z: 27, rotation: 0 }, label: 'hub' })
  await s.page.keyboard.press('Escape')
  await nameRobot(s, 'Sam bot')
  await frame(s)
  // A motor aimed at the hub: it never goes on the hub; it goes to the nearer side, facing out.
  await s.steps.getByRole('button', { name: /^Make it move/ }).click()
  await s.sleep(200)
  await aim(s, world(30.2, 7, 29))
  const overHub = await s.draft()
  check('C:not-on-hub', overHub.y === 1 && overHub.x === 28 && overHub.rotation === 2, `aimed at the hub's top, the ghost goes to the left side of the plate: ${overHub.x},${overHub.y},${overHub.z} r${overHub.rotation}`)
  await s.shot('W12-motor-over-hub-goes-to-side')
  const first = await place(s, { partId: M.motor, point: world(30.2, 7, 29), expect: { x: 28, y: 1, z: 31, rotation: 2 }, label: 'motor aimed at the hub' })
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  // The other side: shown, armed there; aimed at its green spot near the back corner (where Sam tapped), it faces out.
  check('C:other-side-row', (await s.currentText()) === 'Put a motor on the other side.', `the row: "${await s.currentText()}"`)
  await s.steps.locator('[aria-current=step]').click()
  await s.sleep(250)
  const armed = await s.draft()
  check('C:armed-across', armed.x === 31 && armed.y === 1 && armed.z === 31 && armed.rotation === 0, `the row armed the motor across from the first: ${armed.x},${armed.y},${armed.z} r${armed.rotation}`)
  await s.page.mouse.move(40, 700)
  await s.sleep(300)
  const target = (await s.connections()).otherSide[0]
  check('C:green-target', target?.free && target.pose.x === 31 && target.pose.rotation === 0, `a green motor-shaped target at ${JSON.stringify(target?.pose)}`)
  await s.shot('W13-other-side-green')
  const second = await place(s, { partId: M.motor, point: world(33.6, 1, 33.6), expect: { x: 31, y: 1, z: 31, rotation: 0 }, label: 'motor on the green spot, near its back corner' })
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  const facing = await s.robo((state, id) => state.model.creations[0].motors.find((motor) => motor.brickId === id), second.id)
  check('C:faces-out', facing.socketNormal.x > 0.99 && facing.socketRoom === 'open' && !facing.crossways && facing.name === 'Right motor', `it faces out to the right: "${facing.name}", socket ${facing.socketRoom}`)
  check('C:step-ticked', (await s.currentText()) === 'Put an axle in Left motor.', `"A motor on each side" is done only now: "${await s.currentText()}"`)
  // Both sides full: aimed at the hub, the ghost is red at a side with the reason, and a click places nothing.
  await choose(s, M.motor)
  await aim(s, world(30.2, 7, 29))
  const view = await s.connections()
  check('C:full-red', view.preview?.text === 'No room on the plate. Try a bigger plate.' && view.preview.blockers.length > 0, `with both sides full the ghost is red: "${view.preview?.text}", outlined ${view.preview?.blockers.length}`)
  await s.shot('W14-no-room-red-preview')
  const count = (await s.bricks()).length
  const at = await s.screenOf(world(30.2, 7, 29))
  await s.page.mouse.click(at.x, at.y)
  await s.sleep(300)
  check('C:not-placed-on-hub', (await s.bricks()).length === count && !(await s.bricks()).some((b) => b.partId === M.motor && b.y > 1), 'the click placed nothing; no motor on the hub')
  await s.page.keyboard.press('Escape')
  // Rotate keeps the name: the command strip's Rotate, three times.
  await s.brick((state, id) => state.selectBrick(id), first.id)
  await s.sleep(200)
  const names = []
  for (let turn = 0; turn < 3; turn += 1) {
    await s.page.getByRole('group', { name: 'Selected brick actions' }).getByRole('button', { name: 'Rotate brick' }).click()
    await s.sleep(250)
    names.push(await s.robo((state, id) => state.model.creations[0].motors.find((motor) => motor.brickId === id).name, first.id))
  }
  check('C:rotate-keeps-name', names.every((name) => name === 'Left motor'), `after each Rotate: ${names.join(', ')}`)
  // Turned to face the back now: an arrow on it and a one-tap Turn it.
  await s.page.keyboard.press('Escape')
  await s.sleep(300)
  const stuck = await s.robo((state, id) => state.model.creations[0].motors.find((motor) => motor.brickId === id), first.id)
  const fixes = (await s.connections()).motorFixes
  check('C:turned-wrong-way', (stuck.crossways || stuck.socketRoom !== 'open') && fixes.some((fix) => fix.motorId === first.id), `turned three times it no longer faces a side (${stuck.socketRoom}${stuck.crossways ? ', crossways' : ''}): an arrow shows where Turn it puts it`)
  const row = await s.currentText()
  check('C:turn-row', /^Turn Left motor (around|to face the side)\.$/.test(row), `the row, in kid words: "${row}"`)
  await frame(s)
  await s.shot('W15-turn-it-arrow')
  await s.steps.locator('[aria-current=step]').click()
  await s.sleep(400)
  const back = await s.pose(first.id)
  check('C:turned', back.x === 28 && back.rotation === 2 && (await s.robo((state, id) => state.model.creations[0].motors.find((motor) => motor.brickId === id).name, first.id)) === 'Left motor', `one tap turned it back to face out: ${back.x},${back.y},${back.z} r${back.rotation}, still "Left motor"`)
  counts.C = { placements: s.placements, lookedConnectedButWasNot: s.misleading, rotateNames: names }
  await s.context.close()
}

/* ================================================================ D. Sam on a touch screen */
async function samTouch() {
  const s = await session(1024, 768, 'D', true)
  console.log('\nD. Sam on a touch screen: Place alone never puts a motor on the hub')
  const env = await s.page.evaluate(() => ({ hoverNone: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches }))
  record('D:touch-device', env.hoverNone && env.coarse, `the page sees a touch screen: hover none ${env.hoverNone}, pointer coarse ${env.coarse}`)
  await s.brick((state) => state.newBuild())
  // The Robot base kit (a plate and a hub), placed where the camera looks, the way Sam started.
  await s.page.evaluate(async () => { const { armKit } = await import('/src/robotics/kits/kitPlacement.ts'); armKit('robot-base') })
  await s.sleep(200)
  await s.page.getByRole('button', { name: /^Place/ }).first().tap()
  await s.sleep(600)
  await frame(s)
  const hub = (await s.bricks()).find((b) => b.partId === M.hub)
  // The camera looks at the robot: a fresh motor's ghost would rest on the hub. Make it move: it goes to a side instead.
  await s.steps.getByRole('button', { name: /^Make it move/ }).tap()
  await s.sleep(400)
  const ghost = await s.draft()
  check('D:ghost-on-side', ghost.y === 1 && (ghost.x === hub.x - 1 || ghost.x === hub.x + 2), `the motor's ghost starts on a side of the plate (${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}), not on the hub (top at y ${hub.y + 6})`)
  await s.shot('W16-touch-ghost-on-side')
  await s.page.getByRole('button', { name: /^Place/ }).first().tap()
  await s.sleep(500)
  const motor = (await s.bricks()).find((b) => b.partId === M.motor)
  check('D:placed-on-side', motor && motor.y === 1, `Place alone put the motor at ${motor?.x},${motor?.y},${motor?.z} r${motor?.rotation}: on the plate's side, facing out`)
  await s.page.getByRole('button', { name: /^Cancel/ }).first().tap().catch(() => {})
  await s.sleep(300)

  // A wheel tapped onto the plate's back-right corner: the line, its button under the words (a narrow line), 44 px.
  const base = (await s.bricks()).find((b) => b.partId === 'plate_6x8')
  const robots = s.page.getByTestId('robots-choice')
  if ((await robots.getAttribute('aria-pressed')) !== 'true') await robots.tap()
  const tile = s.page.locator(`.library-part[title="${TILE[M.wheel]}"]`)
  await tile.scrollIntoViewIfNeeded()
  await tile.tap()
  await s.sleep(250)
  await settle(s)
  const spot = await s.screenOf(world(base.x + 5.5, 1, base.z + 7.5))
  await s.page.touchscreen.tap(spot.x, spot.y)
  await s.sleep(350)
  await s.page.getByRole('button', { name: /^Place/ }).first().tap()
  await s.sleep(450)
  const wheel = (await s.bricks()).filter((b) => b.partId === M.wheel).at(-1)
  const lineBox = await s.page.getByTestId('robotics-wiring-line').boundingBox()
  const buttonBox = await s.lineAction().boundingBox()
  const viewport = s.page.viewportSize()
  check('D:touch-wheel-line', (await s.line()) === CANT_SPIN && buttonBox.height >= 44 && lineBox.x >= 0 && lineBox.x + lineBox.width <= viewport.width, `a wheel tapped onto the plate: "${await s.line()}", its button ${Math.round(buttonBox.width)}×${Math.round(buttonBox.height)} px, the line inside the screen`)
  await s.shot('W17-touch-wheel-line')
  await s.lineAction().tap()
  await s.sleep(500)
  const spun = (await s.wheels()).find((candidate) => candidate.id === wheel.id)
  check('D:touch-fixed', spun?.spins && (await s.line()) === 'Added a motor and an axle. The wheel can spin now!', `one tap: the wheel spins (${JSON.stringify(spun)}), "${await s.line()}"`)
  await s.tally('touch fix')
  await s.shot('W18-touch-wheel-fixed')
  counts.D = { ghost, motor, lookedConnectedButWasNot: s.misleading }
  await s.context.close()
}

/* ================================================================ E. Ava: a seat, a light and a sensor beside the robot */
async function besideTheRobot() {
  const s = await session(1366, 768, 'E')
  console.log('\nE. Ava: a seat, a light and a sensor dropped beside the Buggy')
  await s.brick((state) => state.newBuild())
  await s.brick((state) => state.requestView('home'))
  await s.sleep(700)
  await s.page.getByTestId('robots-choice').click()
  await s.page.getByTestId('kit-shelf').waitFor()
  await s.page.getByTestId('kit-shelf').getByRole('button', { name: /Buggy/ }).click()
  await s.sleep(250)
  const at = await aim(s, world(32, 0, 32))
  await s.page.mouse.click(at.x, at.y)
  await s.sleep(700)
  await s.page.keyboard.press('Escape')
  await frame(s)
  const plate = (await s.bricks()).find((b) => b.partId === 'plate_6x8')
  const name = await s.robo((state) => state.model.creations[0].name)
  const cases = [
    ['robo_seat', 'Seat', 'seat', 'Put it on top', 'W19-seat-beside'],
    ['robo_light', 'Light', 'light', 'Put it on top', null],
    ['robo_distance_sensor', 'Distance sensor', 'sensor', `Put it on ${name}`, null],
  ]
  for (const [partId, title, word, label, shot] of cases) {
    const robots = s.page.getByTestId('robots-choice')
    if ((await robots.getAttribute('aria-pressed')) !== 'true') await robots.click()
    const tile = s.page.locator(`.library-part[title="${title}"]`)
    await tile.scrollIntoViewIfNeeded()
    await tile.click()
    await s.sleep(200)
    // On the ground in front of the Buggy, two studs off its plate.
    const spot = await aim(s, world(plate.x + 3, 0, plate.z - 2.5))
    await s.page.mouse.click(spot.x, spot.y)
    await s.sleep(350)
    await s.page.keyboard.press('Escape')
    await s.sleep(250)
    const part = await s.last()
    const line = await s.line()
    check(`E:${word}-line`, line === `This ${word} isn't on ${name} yet.` && (await s.lineAction().textContent()) === label, `a ${word} on the ground beside ${name}: "${line}" [${await s.lineAction().textContent()}]`)
    if (shot) await s.shot(shot)
    await s.lineAction().click()
    await s.sleep(450)
    const on = await s.robo((state, id) => state.model.creations[0].brickIds.includes(id), part.id)
    const placed = await s.pose(part.id)
    check(`E:${word}-on`, on && placed.y >= 1, `one tap put it on ${name} at ${placed.x},${placed.y},${placed.z} (height ${placed.y}): "${await s.line()}"`)
    if (word === 'seat') {
      check('E:seat-rides', (await s.robo((state, id) => state.model.creations[0].seats.includes(id), part.id)) && placed.y === 7, 'the seat is on the very top, one of the robot’s seats: it can be ridden in Explore')
      await s.shot('W20-seat-on-top')
    }
  }
  counts.E = { placements: 3, fixes: 3 }
  await s.context.close()
}

let failure = null
try {
  await leosCar()
  await noRoom()
  await sam()
  await samTouch()
  await besideTheRobot()
} catch (error) {
  failure = error
  console.log(`\nstopped: ${error.message}`)
}
record('console.clean', consoleErrors.length === 0, consoleErrors.length ? `console errors: ${consoleErrors.slice(0, 3).join(' | ')}` : 'no console errors or page errors')
const failed = results.filter((result) => !result.ok)
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ harness: 'scripts/qa/robotics-kid-wheels.mjs', origin, input: 'real mouse and keyboard via Playwright CDP (D: touch taps); aim points from the studio\'s own world→screen projection', at: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, counts, shots, results }, null, 2)}\n`)
await browser.close()
console.log(`\n${results.length - failed.length}/${results.length} checks passed · ${out}`)
process.exit(failed.length || failure ? 1 : 0)
