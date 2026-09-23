/**
 * Robot Workshop kid lane Y: "Try it", the walk-up test, Code's stage and the light, by a real pointer.
 *
 * Real Chrome through Playwright against the robotics dev server
 * (`npx vite --mode robotics --port 5243 --strictPort --host 127.0.0.1`), at 1366×768 (one pass at 1024×768,
 * one on a touch screen). Everything is a student's input: the drawer's Robots choice, a kit card and the
 * command strip's Place button; the panel's Try it and Code buttons; "Someone walks up"; Back to build; a
 * click on a number block and typed digits; More → "Swing to 60°"; the Undo button. The Gate kit's
 * "Door sensor" looks out of the gate's front, where people come from: the visitor stands in open ground
 * in front of it, and the run checks that, and that the whole figure is on screen, clear of the panels.
 * Two builds are made with the studio's own placement actions (as the cp1/cp2 harnesses do): a gate whose
 * sensor was turned round to look at the door (select it, press R twice), and the same with a wall of its
 * own bricks between the sensor and the door.
 *
 * Measured from the stage itself (`window.__robotics.stageStore`): where the visitor is in its walk, what
 * the sensor reads, the arm's angle (the hinge reading), the light's colour, and the walk's verdict; read
 * from the page: the result line, the chips, the ready row. The light's look and the visitor's body are
 * measured from the pixels the student sees. Each first-try check is repeated five times, each in a fresh
 * page with a fresh world.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5243 node scripts/qa/robotics-kid-tryit.mjs
 *
 * Writes PNGs and results.json under docs/qa/robotics-kid/tryit/ (UI_OUTPUT overrides; README.md is by hand).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5243', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/tryit')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const measured = {}
const consoleErrors = []
/** Requests that failed, to name the resource when a console error is only "Failed to load resource". */
const failedRequests = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const RUNS = 5
const STUD = 0.62
const PLATE = 0.18
const NO_UNITS = /studs|°/

/** One fresh page with a fresh world, and helpers bound to it. */
async function openStudio({ width = 1366, height = 768, touch = false, tag = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${tag}: ${message.text()}`) })
  page.on('pageerror', (error) => consoleErrors.push(`${tag}: ${String(error)}`))
  page.on('requestfailed', (request) => failedRequests.push(`${tag}: ${request.url()} (${request.failure()?.errorText})`))
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`)
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.project && window.__robotics?.driveView), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  await page.waitForTimeout(600)
  const sleep = (ms) => page.waitForTimeout(ms)
  const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(target === 'hook' ? window.__robotics : window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
  const s = {
    page, context, sleep, tag,
    brick: run('brickStore'), robo: run('roboticsStore'), stage: run('stageStore'), hook: run('hook'),
    async shot(name) { const file = `${name}.png`; await page.screenshot({ path: path.join(out, file) }); console.log(`  shot ${file}`); return file },
    text: async (testId) => (await page.getByTestId(testId).first().textContent().catch(() => ''))?.replace(/\s+/g, ' ').trim() ?? '',
  }
  /** What the walk-up test reads each moment: the visitor's phase, the sensor, the arm, the light, the verdict, and the line on screen. */
  s.sample = (ids) => page.evaluate((ids) => {
    const state = window.__robotics.stageStore.getState()
    const o = state.stage?.controller.observe()
    if (!o) return null
    const reading = ids.sensor ? o.sensors[ids.sensor] : null
    const line = document.querySelector('[data-testid=robo-try-result]')
    return {
      t: o.timeSeconds, phase: o.visitorPhase ?? null, running: o.phase,
      sees: Boolean(reading?.hit && reading.distanceStuds < 5), distance: reading?.hit ? reading.distanceStuds : null,
      arm: ids.hinge ? o.motors[ids.hinge]?.positionDegrees ?? 0 : null,
      light: ids.light ? o.lights[ids.light] ?? null : null,
      verdict: state.walk?.verdict ?? null,
      line: line?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    }
  }, ids)
  s.robot = () => s.robo((state) => {
    const c = state.model.creations.at(-1)
    return { id: c.id, name: c.name, hinge: c.hinges[0]?.brickId ?? null, sensor: c.sensors[0]?.brickId ?? null, light: c.lights[0]?.brickId ?? null, brickIds: c.brickIds, sensorName: c.sensors[0]?.name ?? null, sensorFacing: c.sensors[0]?.facing ?? null }
  })
  return s
}

/** The drawer's Robots choice, a kit card, the command strip's Place: a kit placed where the camera looks. */
async function placeKit(s, kitId, name) {
  const { page } = s
  if (!(await page.getByTestId('kit-shelf').isVisible().catch(() => false))) await page.getByTestId('robots-choice').click()
  await page.getByTestId('kit-shelf').waitFor()
  await page.locator(`.kit-card[data-kit="${kitId}"]`).click()
  await page.getByRole('button', { name: `Place ${name}` }).click()
  await s.sleep(700)
  // Let the "ready" message go, as a student would read it, so it never sits over a later shot.
  await page.waitForSelector('.brick-toast', { state: 'detached', timeout: 8000 }).catch(() => {})
  return s.robot()
}

async function openTryIt(s) {
  await s.page.getByTestId('robotics-play-button').click()
  await s.page.waitForSelector('[data-testid=robo-drive][data-state=play]', { timeout: 30_000 })
  await s.page.waitForFunction(() => { const st = window.__robotics.stageStore.getState(); return st.stage && !st.stageLoading && st.stageObservation?.phase === 'running' }, null, { timeout: 30_000 })
  await s.sleep(700)
}

/**
 * Presses "Someone walks up" and follows the whole walk (sampling every 120 ms until the visitor is back
 * or `seconds` pass), taking a shot when the sensor first sees them, while they stand there and after.
 * `standing` runs once, as they have stood there 1.2 s; what it returns is kept as `samples.standing`.
 */
async function walkUp(s, ids, { button = 'Someone walks up', seconds = 12, shots = null, standing = null } = {}) {
  const samples = []
  await s.page.getByRole('button', { name: button }).click()
  const began = Date.now()
  let shotSeen = false
  let lookedHere = false
  let hereSince = null
  while (Date.now() - began < seconds * 1000) {
    const sample = await s.sample(ids)
    if (!sample) break
    samples.push({ ...sample, wall: (Date.now() - began) / 1000 })
    if (shots && !shotSeen && sample.sees) { shotSeen = true; await s.shot(`${shots}-2-seen`) }
    if (sample.phase === 'here' && hereSince === null) hereSince = Date.now()
    if (!lookedHere && hereSince !== null && Date.now() - hereSince > 1200) {
      lookedHere = true
      if (standing) samples.standing = await standing()
      if (shots) await s.shot(`${shots}-3-standing`)
    }
    if (samples.length > 3 && sample.phase === 'away' && samples.some((entry) => entry.phase === 'leaving')) break
    await s.sleep(120)
  }
  return samples
}

/** The average colour of the 5 × 5 pixels the student sees around a point on the page. */
async function pixelAt(s, at) {
  const png = await s.page.screenshot({ clip: { x: Math.round(at.x) - 2, y: Math.round(at.y) - 2, width: 5, height: 5 } })
  return s.page.evaluate(async (b64) => {
    const image = new Image()
    image.src = `data:image/png;base64,${b64}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const sum = [0, 0, 0]
    for (let index = 0; index < data.length; index += 4) for (let channel = 0; channel < 3; channel += 1) sum[channel] += data[index + channel]
    const count = data.length / 4
    return sum.map((value) => Math.round(value / count))
  }, png.toString('base64'))
}

/**
 * The visitor as the student sees them while they stand there: the figure's box (feet to the top of the
 * head, arms out whichever way it turns) projected to the page, whether all of it is on the canvas, how
 * many of the Try it panels (the bar, the chips, the line and the button) it runs under, where its back
 * is against the robot's front edge (world z; the home camera looks from the front), and the colour
 * under the middle of its body.
 */
async function visitorInView(s) {
  const view = await s.page.evaluate(({ stud }) => {
    const hook = window.__robotics
    const controller = hook.stageStore.getState().stage.controller
    const prop = controller.props.find((candidate) => candidate.kind === 'visitor')
    const at = controller.propPoses().get(prop.id).position
    const reach = Math.max(prop.size.x, prop.size.z) * 0.6
    const corners = []
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) for (const y of [at.y - prop.size.y / 2, at.y + prop.size.y / 2 + 0.05]) corners.push(hook.project({ x: at.x + dx * reach, y, z: at.z + dz * reach }))
    const box = { left: Math.min(...corners.map((c) => c.x)), right: Math.max(...corners.map((c) => c.x)), top: Math.min(...corners.map((c) => c.y)), bottom: Math.max(...corners.map((c) => c.y)) }
    const canvas = hook.canvasRect()
    const onCanvas = corners.every((c) => c.inFront) && box.left >= canvas.left && box.right <= canvas.left + canvas.width && box.top >= canvas.top && box.bottom <= canvas.top + canvas.height
    const panels = [...document.querySelectorAll('.robo-drive-bar, [data-testid=robo-drive-results] li, .robo-drive-side > *')].map((element) => element.getBoundingClientRect()).filter((rect) => rect.width && rect.height)
    const under = panels.filter((rect) => rect.left < box.right && rect.right > box.left && rect.top < box.bottom && rect.bottom > box.top).length
    const model = hook.roboticsStore.getState().model
    const ids = new Set(model.creations.at(-1).brickIds)
    const front = Math.max(...model.input.bricks.filter((brick) => ids.has(brick.id)).map((brick) => { const part = model.input.partMap[brick.partId]; return (brick.z + (brick.rotation % 2 ? part.width : part.depth) - model.input.plateSize / 2) * stud }))
    return { back: at.z - reach, front, box, onCanvas, under, body: hook.project({ x: at.x, y: at.y + 0.15, z: at.z }) }
  }, { stud: STUD })
  return { ...view, bodyColor: await pixelAt(s, view.body), clearStuds: rounded((view.back - view.front) / STUD) }
}

const rounded = (value) => (value === null || value === undefined ? value : Math.round(value * 10) / 10)

/** The figure's shirt (#ef8d32), lit or in shade; not the frame's red, the grey ground or the white hub. */
const isShirt = ([r, g, b]) => r > 150 && g > 80 && g < 200 && r - g > 30 && r - b > 90

/* ================================================================ A. Gate kit, first try, five times */
console.log(`\nA. The Gate kit: Try it, Someone walks up — the first try, ${RUNS} fresh times`)
measured.gate = []
for (let runIndex = 1; runIndex <= RUNS; runIndex += 1) {
  const s = await openStudio({ tag: `gate-${runIndex}` })
  const robot = await placeKit(s, 'gate', 'Gate')
  const first = runIndex === 1
  if (first) {
    const readyRow = await s.page.locator('[data-testid=robotics-next-steps] [data-step=ready]').textContent()
    check('A.build-ready', readyRow?.includes('Ready to try!'), `placed from the drawer; the panel's next step reads "${readyRow?.trim()}"`)
    await s.shot('A1-gate-placed')
  }
  await openTryIt(s)
  const before = await s.sample(robot)
  const plan = await s.stage((state) => state.stage.controller.props[0].walk)
  if (first) {
    const labels = await s.page.locator('[data-testid=robo-drive-results] li small').allTextContents()
    check('A.door-sensor', robot.sensorName === 'Door sensor' && robot.sensorFacing === 'the near side' && labels.includes('Door sensor'), `the kit's sensor is called "${robot.sensorName}" and looks out of the gate's front (${robot.sensorFacing}, toward the camera); Try it's chips: ${JSON.stringify(labels)}`)
    check('A.before', before.arm === 0 && !before.sees && (await s.text('robo-drive-hint')) === 'Press the big button. Watch what happens.', `before: arm ${before.arm}°, sensor sees nothing, "${await s.text('robo-drive-hint')}"`)
    await s.shot('A2-gate-try-it')
  }
  const samples = await walkUp(s, robot, { shots: first ? 'A3-gate' : null, standing: () => visitorInView(s) })
  const seen = samples.find((entry) => entry.sees)
  const stopped = samples.find((entry) => entry.phase === 'here')
  const standing = samples.filter((entry) => entry.phase === 'here')
  const maxArm = Math.max(...samples.map((entry) => entry.arm))
  const worked = samples.find((entry) => entry.verdict === 'worked')
  const last = samples.at(-1)
  const view = samples.standing
  measured.gate.push({ run: runIndex, seenAtSeconds: rounded(seen?.wall), seenWhile: seen?.phase, armWhenTheyStop: rounded(stopped?.arm), maxArm: rounded(maxArm), workedAtSeconds: rounded(worked?.wall), line: last?.line, armAfter: rounded(last?.arm), visitorAfter: last?.phase, standing: { clearOfTheFrontStuds: view?.clearStuds, onCanvas: view?.onCanvas, underPanels: view?.under, bodyColor: view?.bodyColor, box: view && { left: Math.round(view.box.left), top: Math.round(view.box.top), right: Math.round(view.box.right), bottom: Math.round(view.box.bottom) } } })
  check(`A.run${runIndex}.open-ground`, plan?.problem === null && plan.approach === 'side' && view && view.back > view.front && view.onCanvas && view.under === 0 && isShirt(view.bodyColor), `run ${runIndex}: they stood in open ground in front of the gate (their back ${view?.clearStuds} studs clear of its front edge), the whole figure on screen (${Math.round(view?.box.left)}–${Math.round(view?.box.right)} × ${Math.round(view?.box.top)}–${Math.round(view?.box.bottom)} px) under none of the panels, their shirt showing ${JSON.stringify(view?.bodyColor)}`)
  check(`A.run${runIndex}.first-try-opens`, seen && seen.phase === 'arriving' && maxArm > 45 && standing.length > 0 && standing.every((entry) => entry.sees), `run ${runIndex}: seen while still walking up (${seen?.wall.toFixed(1)} s), the arm opened to ${maxArm.toFixed(0)}° (hinge reading), seen the whole time they stood there`)
  check(`A.run${runIndex}.open-before-they-stop`, stopped && stopped.arm > 45, `run ${runIndex}: the gate was already ${stopped?.arm.toFixed(0)}° open when the visitor stopped`)
  check(`A.run${runIndex}.it-worked`, worked && worked.line === 'It worked! The gate opened.', `run ${runIndex}: "${worked?.line}" as soon as it opened`)
  check(`A.run${runIndex}.closes-after`, last.phase === 'away' && last.arm < 5 && last.line === 'It worked! The gate opened.', `run ${runIndex}: once they had gone the gate closed (${last.arm.toFixed(0)}°) and the line still says "${last.line}"`)
  if (first) {
    await s.shot('A4-gate-after')
    const words = `${await s.text('robo-drive-results')} ${await s.text('robo-try-result')}`
    check('A.kid-words', !NO_UNITS.test(words), `no "studs" or "°" in the Try it lines: "${words}"`)
    await s.page.getByTestId('robo-drive-back').click()
    await s.page.waitForSelector('[data-testid=robotics-panel]')
    await s.sleep(400)
    const row = s.page.locator('[data-testid=robotics-next-steps] [data-step=ready]')
    const rowText = (await row.textContent())?.trim()
    const tick = await row.locator('.robotics-step-icon.worked').count()
    check('A.ready-row-after', rowText === 'It worked! Try it again' && tick === 1, `back in Build the ready row reads "${rowText}" with a tick`)
    await s.shot('A5-gate-back-in-build')
    // An edit makes it a robot to try again.
    await s.brick((state) => { state.selectBrick(null) })
    const hub = await s.robo((state) => state.model.creations.at(-1).hubs[0].brickId)
    const spot = await s.brick((state, hubId) => { const hub = state.bricks.find((brick) => brick.id === hubId); return { x: hub.x + 4, z: hub.z + 1 } }, hub)
    const placed = await s.brick((state, at) => { state.choosePart('brick_1x1'); state.setDraftPosition(at.x, 1, at.z); const ok = state.placeDraft(); state.cancelInteraction(); return ok }, spot)
    await s.sleep(300)
    const afterEdit = (await row.textContent())?.trim()
    check('A.ready-row-edit', placed && afterEdit === 'Ready to try!', `one more brick on the gate's plate: "${afterEdit}"`)
  }
  await s.context.close()
}

/* ================================================================ B. The same after a long look (Noah's screenshot delay) */
console.log('\nB. Looked at eleven seconds later (a tester that screenshots slowly)')
{
  const s = await openStudio({ tag: 'late' })
  const robot = await placeKit(s, 'gate', 'Gate')
  await openTryIt(s)
  await s.page.getByRole('button', { name: 'Someone walks up' }).click()
  await s.sleep(11_000)
  const late = await s.sample(robot)
  check('B.still-says', late.phase === 'away' && late.line === 'It worked! The gate opened.' && late.arm < 5, `11 s after the press the visitor is back and the gate closed (${late.arm.toFixed(0)}°), and the stage still says "${late.line}"`)
  await s.shot('B1-gate-eleven-seconds-later')
  await s.context.close()
}

/* ================================================================ C. Signal light kit, five times */
console.log(`\nC. The Signal light kit: the light is on while they stand there, off after — ${RUNS} fresh times`)
measured.signal = []

/** The colour the student sees at the middle of the light's dome (the canvas pixels under it). */
async function lightPixel(s, lightId) {
  const at = await s.page.evaluate(({ id, size }) => {
    const state = window.__robotics.brickStore.getState()
    const brick = state.bricks.find((candidate) => candidate.id === id)
    // The middle of the dome of a 1 × 1 light (its dome sits on the top 40 % of its three plates).
    const point = { x: (brick.x + 0.5 - 32) * size.stud, y: (brick.y + 2.2) * size.plate, z: (brick.z + 0.5 - 32) * size.stud }
    return window.__robotics.project(point)
  }, { id: lightId, size: { stud: STUD, plate: PLATE } })
  return pixelAt(s, at)
}
const isRed = ([r, g, b]) => r > 170 && r - g > 70 && r - b > 70
const isGrey = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b) < 40

for (let runIndex = 1; runIndex <= RUNS; runIndex += 1) {
  const s = await openStudio({ tag: `signal-${runIndex}` })
  const robot = await placeKit(s, 'signal-light', 'Signal light')
  const first = runIndex === 1
  if (first) {
    const color = await s.brick((state, id) => state.bricks.find((brick) => brick.id === id).color, robot.light)
    await s.brick((state) => state.selectBrick(null))
    await s.sleep(300)
    const buildPixel = await lightPixel(s, robot.light)
    measured.signalLightInBuild = { brickColor: color, pixel: buildPixel }
    check('C.build-looks-off', color === '#c6ced4' && isGrey(buildPixel), `in Build the kit's light looks off: a pale grey lamp (${color}; the pixels under its dome ${JSON.stringify(buildPixel)})`)
    await s.shot('C1-signal-light-placed')
  }
  await openTryIt(s)
  const offPixel = first ? await lightPixel(s, robot.light) : null
  if (first) await s.shot('C2-signal-light-try-it')
  let onPixel = null
  const samples = []
  await s.page.getByRole('button', { name: 'Someone walks up' }).click()
  const began = Date.now()
  let hereSince = null
  while (Date.now() - began < 12_000) {
    const sample = await s.sample(robot)
    samples.push({ ...sample, wall: (Date.now() - began) / 1000 })
    if (sample.phase === 'here' && hereSince === null) hereSince = Date.now()
    if (first && !onPixel && hereSince !== null && Date.now() - hereSince > 1000) { onPixel = await lightPixel(s, robot.light); await s.shot('C3-signal-light-on') }
    if (samples.length > 3 && sample.phase === 'away' && samples.some((entry) => entry.phase === 'leaving')) break
    await s.sleep(120)
  }
  const beforeSeen = samples.filter((entry) => entry.phase === 'arriving' && !entry.sees)
  const standing = samples.filter((entry) => entry.phase === 'here')
  const last = samples.at(-1)
  measured.signal.push({ run: runIndex, standingSamples: standing.length, redWhileStanding: standing.every((entry) => entry.light === 'red'), lightAfter: last.light, line: last.line })
  check(`C.run${runIndex}.on-while-there`, beforeSeen.every((entry) => entry.light === null) && standing.length > 10 && standing.every((entry) => entry.sees && entry.light === 'red'), `run ${runIndex}: off until they walked into the beam, red for all ${standing.length} samples while they stood there`)
  check(`C.run${runIndex}.off-after`, last.phase === 'away' && last.light === null && last.line === 'It worked! The light came on.', `run ${runIndex}: off again once they had gone; the stage says "${last.line}"`)
  if (first) {
    measured.signalLightOnStage = { off: offPixel, on: onPixel }
    check('C.looks-on-and-off', isGrey(offPixel) && isRed(onPixel), `on the stage the dome is grey when off ${JSON.stringify(offPixel)} and red when on ${JSON.stringify(onPixel)}`)
    await s.shot('C4-signal-light-after')
  }
  await s.context.close()
}

/* ================================================================ D. A turned sensor, and a sensor that cannot see */
console.log('\nD. A gate whose sensor was turned round to look at the door, and one whose sensor looks into its own bricks')

/** Pick the gate's sensor and press R twice: it turns round on the hub and looks back across the plate, at the door. */
async function turnSensorToTheDoor(s, robot) {
  await s.brick((state, id) => state.selectBrick(id), robot.sensor)
  await s.page.keyboard.press('r')
  await s.sleep(150)
  await s.page.keyboard.press('r')
  await s.sleep(300)
  await s.brick((state) => state.selectBrick(null))
  return s.robo((state) => { const sensor = state.model.creations.at(-1).sensors[0]; return { facing: sensor.facing, name: sensor.name } })
}
{
  const s = await openStudio({ tag: 'turned' })
  const robot = await placeKit(s, 'gate', 'Gate')
  const sensor = await turnSensorToTheDoor(s, robot)
  await openTryIt(s)
  const plan = await s.stage((state) => state.stage.controller.props[0].walk)
  const samples = await walkUp(s, robot, { shots: 'D1-turned-to-the-door' })
  const worked = samples.find((entry) => entry.verdict === 'worked')
  check('D.turned-still-works', sensor.facing === 'the far side' && sensor.name === 'Door sensor' && worked && Math.max(...samples.map((entry) => entry.arm)) > 45, `the Door sensor turned round (it keeps its name, "${sensor.name}") to look at the door (${sensor.facing}): the visitor came to where it now looks, between the hub and the door (${plan.approach} of the beam, ${plan.standStuds} steps away), and "${worked?.line}"`)
  await s.context.close()
}
{
  const s = await openStudio({ tag: 'blocked' })
  const robot = await placeKit(s, 'gate', 'Gate')
  // The sensor turned to look at the door, then a little wall of the gate's own bricks on its plate, right in front of it.
  const turned = await turnSensorToTheDoor(s, robot)
  assert(turned.facing === 'the far side', 'the sensor looks at the door')
  const hub = await s.robo((state) => state.model.creations.at(-1).hubs[0].brickId)
  const spot = await s.brick((state, hubId) => { const brick = state.bricks.find((candidate) => candidate.id === hubId); return { x: brick.x, z: brick.z - 1 } }, hub)
  for (const y of [1, 4, 7]) {
    const ok = await s.brick((state, at) => { state.choosePart('brick_1x4'); state.rotate(); state.setDraftPosition(at.x, at.y, at.z); const placed = state.placeDraft(); state.cancelInteraction(); return placed }, { ...spot, y })
    assert(ok, 'the wall brick was placed')
  }
  await s.sleep(400)
  const inRobot = await s.robo((state) => state.model.creations.at(-1).brickIds.length)
  await s.brick((state) => state.selectBrick(null))
  await s.shot('D2-sensor-blocked-build')
  await openTryIt(s)
  const plan = await s.stage((state) => state.stage.controller.props[0].walk)
  const samples = await walkUp(s, robot, { shots: 'D2-sensor-blocked' })
  const last = samples.at(-1)
  const verdict = samples.find((entry) => entry.verdict)?.verdict
  const arrow = await s.page.locator('[data-testid=robo-try-result] .robo-beam-arrow').getAttribute('data-angle').catch(() => null)
  check('D.blocked-says-why', inRobot === 14 && plan.problem === 'no-room' && verdict === 'not-seen' && samples.every((entry) => !entry.sees) && last.line?.startsWith('The sensor didn’t see them. It looks this way') && arrow !== null, `with a wall of its own bricks between its sensor and the door (${inRobot} bricks in the robot) the visitor walked up to the gate's front, was never seen, and the stage says "${last.line}" with an arrow along the beam (${arrow}° on screen)`)
  await s.shot('D3-sensor-blocked-after')
  // Take the wall away (Undo three times; the sensor still looks at the door) and try again: it works.
  await s.page.getByTestId('robo-drive-back').click()
  await s.page.waitForSelector('[data-testid=robotics-panel]')
  const readyRow = (await s.page.locator('[data-testid=robotics-next-steps] [data-step=ready]').textContent())?.trim()
  check('D.blocked-ready-row', readyRow === 'The gate didn’t open. Try it again', `back in Build the ready row reads "${readyRow}"`)
  for (let undo = 0; undo < 3; undo += 1) { await s.page.getByRole('button', { name: 'Undo', exact: true }).first().click(); await s.sleep(250) }
  await openTryIt(s)
  const again = await walkUp(s, robot)
  check('D.repaired-works', again.some((entry) => entry.verdict === 'worked') && Math.max(...again.map((entry) => entry.arm)) > 45, `wall gone (Undo ×3): "${again.find((entry) => entry.verdict)?.line}"`)
  await s.context.close()
}

{
  // A Signal light whose sensor looks straight at a wall of the student's own bricks, two steps away (on the ground, not part of the robot).
  const s = await openStudio({ tag: 'wall' })
  const robot = await placeKit(s, 'signal-light', 'Signal light')
  const sensor = await s.brick((state, id) => { const brick = state.bricks.find((candidate) => candidate.id === id); return { x: brick.x, z: brick.z } }, robot.sensor)
  for (const y of [0, 3, 6, 9]) {
    const ok = await s.brick((state, at) => { state.choosePart('brick_2x4'); state.rotate(); state.setDraftPosition(at.x, at.y, at.z); const placed = state.placeDraft(); state.cancelInteraction(); return placed }, { x: sensor.x - 1, y, z: sensor.z - 4 })
    assert(ok, 'the wall brick was placed')
  }
  await s.sleep(400)
  const inRobot = await s.robo((state) => state.model.creations.at(-1).brickIds.length)
  await s.brick((state) => state.selectBrick(null))
  await openTryIt(s)
  const plan = await s.stage((state) => state.stage.controller.props[0].walk)
  const before = await s.sample(robot)
  const samples = await walkUp(s, robot, { shots: 'D4-sensor-faces-a-wall' })
  const last = samples.at(-1)
  check('D.wall-says-why', inRobot === 4 && plan.problem === 'wall' && Math.abs(plan.wallStuds - 2) < 0.01 && before.sees && samples.find((entry) => entry.verdict)?.verdict === 'wall' && last.line?.startsWith('The sensor already sees something. Give it room in front.'), `a wall of loose bricks ${plan.wallStuds} steps in front of the sensor (not part of the ${inRobot}-brick robot): it saw the wall before anyone came, and the stage says "${last.line}"`)
  await s.context.close()
}

/* ================================================================ E. Code: a stage input runs the newest code, five times */
console.log(`\nE. Code: change 90 to 45, press "Someone walks up" without Run — ${RUNS} fresh times`)
measured.code = []
for (let runIndex = 1; runIndex <= RUNS; runIndex += 1) {
  const s = await openStudio({ tag: `code-${runIndex}` })
  const robot = await placeKit(s, 'gate', 'Gate')
  const first = runIndex === 1
  await s.page.getByTestId('robotics-code-button').click()
  await s.page.waitForSelector('.robo-code-blockly .blocklySvg', { timeout: 30_000 })
  await s.page.waitForFunction(() => { const st = window.__robotics.stageStore.getState(); return st.stage && !st.stageLoading }, null, { timeout: 30_000 })
  await s.sleep(600)
  if (first) await s.shot('E1-code-open')
  const field = await s.hook((hook) => { const block = hook.codeWorkspace().getBlockById('smart-gate:open-degrees'); const rect = block.getField('NUM').getSvgRoot().getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })
  await s.page.mouse.click(field.x, field.y)
  await s.sleep(250)
  await s.page.keyboard.press('Meta+A').catch(() => {})
  await s.page.keyboard.type('45')
  await s.page.keyboard.press('Enter')
  await s.sleep(700)
  const status = await s.text('robo-status')
  const saved = await s.brick((state) => JSON.stringify(state.documentMetadata.robotics).includes('"NUM":45'))
  const samples = await walkUp(s, robot, { shots: first ? 'E2-code' : null, seconds: 6 })
  const running = samples.find((entry) => entry.running === 'running')
  const maxArm = Math.max(...samples.map((entry) => entry.arm))
  const worked = samples.find((entry) => entry.verdict === 'worked')
  const chips = await s.page.locator('[data-testid=robo-readings] .robo-read').evaluateAll((list) => list.map((chip) => chip.textContent.replace(/\s+/g, ' ').trim()))
  measured.code.push({ run: runIndex, statusBefore: status, maxArm: rounded(maxArm), line: worked?.line, chips })
  check(`E.run${runIndex}.runs-and-reacts`, status === 'Ready' && saved && running && maxArm > 40 && maxArm < 50 && worked?.line === 'It worked! The gate opened.' && (await s.page.getByTestId('robo-changed').count()) === 0, `run ${runIndex}: typed 45 (saved), status was "${status}"; "Someone walks up" ran the new code: the arm went to ${maxArm.toFixed(0)}° and the stage says "${worked?.line}"`)
  if (first) {
    // A chip's text runs label, value and the line under it together ("Arm motoropenturned to 45").
    check('E.kid-words', chips.some((chip) => /^Door sensor\d+(\.\d)? steps? away/.test(chip)) && chips.some((chip) => /^Arm motor(open|closed)/.test(chip)) && !chips.some((chip) => NO_UNITS.test(chip)), `Code's stage chips: ${JSON.stringify(chips)}`)
    // Edit while it runs: it says so; the next "Someone walks up" runs the newest code again.
    await s.page.waitForFunction(() => window.__robotics.stageStore.getState().stageObservation?.visitorPhase === 'away', null, { timeout: 15_000 })
    const again = await s.hook((hook) => { const block = hook.codeWorkspace().getBlockById('smart-gate:open-degrees'); const rect = block.getField('NUM').getSvgRoot().getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } })
    await s.page.mouse.click(again.x, again.y)
    await s.sleep(250)
    await s.page.keyboard.press('Meta+A').catch(() => {})
    await s.page.keyboard.type('80')
    await s.page.keyboard.press('Enter')
    await s.sleep(700)
    const changed = await s.text('robo-changed')
    await s.shot('E3-code-changed-while-running')
    const second = await walkUp(s, robot, { seconds: 6 })
    const secondMax = Math.max(...second.map((entry) => entry.arm))
    check('E.changed-then-walk', changed === 'Your code changed. Press Run to try it.' && secondMax > 75 && secondMax < 85, `edited to 80 while it ran: "${changed}"; "Someone walks up" ran the newest code (arm ${secondMax.toFixed(0)}°)`)
  }
  await s.context.close()
}

/* ================================================================ F. Test the motors keeps the cables */
console.log('\nF. More → Test the motors (Swing open): the cables stay while the arm swings')
{
  const s = await openStudio({ tag: 'nudge' })
  const robot = await placeKit(s, 'gate', 'Gate')
  await s.brick((state) => state.selectBrick(null))
  await s.page.getByTestId('robotics-more-fold').getByRole('button', { name: /More/ }).click()
  const before = await s.hook((hook) => hook.cables())
  // "Swing to 60°" here; lane P words it "Swing open" (the same 60°).
  await s.page.getByRole('button', { name: /^(Swing to 60°|Swing open)$/ }).click()
  await s.page.waitForFunction(() => window.__robotics.roboticsStore.getState().sim !== null, null, { timeout: 20_000 })
  await s.sleep(1500)
  const during = await s.hook((hook) => hook.cables())
  const angle = await s.robo((state, id) => state.hingeReports[id]?.angle ?? null, robot.hinge)
  check('F.cables-stay', before.cables.length === 2 && during.cables.length === 0 && during.riding.length === 2 && angle > 50, `before: ${before.cables.length} cables drawn; while the arm swings to ${angle?.toFixed(0)}° the same ${during.riding.length} ride with the gate's frame (none left out)`)
  await s.shot('F1-test-the-motors-cables')
  await s.context.close()
}

/* ================================================================ G. The Gate at 1024×768, and Drive on a touch screen */
console.log('\nG. 1024×768; a touch screen')
{
  const s = await openStudio({ width: 1024, height: 768, tag: '1024' })
  const robot = await placeKit(s, 'gate', 'Gate')
  await openTryIt(s)
  const samples = await walkUp(s, robot, { shots: 'G1-gate-1024' })
  const line = await s.page.getByTestId('robo-try-result').boundingBox()
  const button = await s.page.getByRole('button', { name: 'Someone walks up' }).boundingBox()
  check('G.1024', samples.some((entry) => entry.verdict === 'worked') && line && button && line.y + line.height <= button.y && line.x >= 0 && line.x + line.width <= 1024, `at 1024×768 it works first time and the line sits above the button, on screen (${Math.round(line?.width ?? 0)}×${Math.round(line?.height ?? 0)} px)`)
  await s.context.close()
}
{
  const s = await openStudio({ width: 1024, height: 768, touch: true, tag: 'touch' })
  // The touch layout keeps the drawer in its (+) sheet (lane T's harness drives that); the kit comes from the shelf's own action here.
  await s.hook((hook) => hook.armKit('buggy'))
  await s.page.getByRole('button', { name: 'Place Buggy' }).click()
  await s.sleep(700)
  const buggy = await s.robot()
  const coarse = await s.page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
  await s.hook((hook, id) => hook.driveView.getState().openDrive(id), buggy.id)
  await s.page.waitForSelector('[data-testid=robo-drive][data-state=play]', { timeout: 30_000 })
  await s.sleep(600)
  const hint = await s.text('robo-drive-hint')
  check('G.touch-hint', coarse && hint === 'Drag the blue ball to drive', `on a touch screen (pointer: coarse) the Drive view says "${hint}"`)
  await s.shot('G2-drive-touch-hint')
  await s.context.close()
}

check('console-clean', consoleErrors.length === 0, consoleErrors.length ? `${consoleErrors.slice(0, 4).join(' | ')}; failed requests: ${failedRequests.slice(0, 4).join(' | ') || 'none'}` : 'no console errors')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewports: ['1366x768', '1024x768', '1024x768 touch'], at: new Date().toISOString(), runsPerFirstTryCheck: RUNS, measured, results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
