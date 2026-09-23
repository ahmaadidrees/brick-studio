/**
 * Robot Workshop kid-UX pass, lane D: Drive and Try it, driven by a real pointer and keyboard.
 *
 * Real Chrome through Playwright against the robotics dev server
 * (`npx vite --mode robotics --port 5254 --strictPort --host 127.0.0.1`), at 1366×768 and 1024×768.
 * The rover (a Buggy), the gate and the signal light are built from loose parts with the studio's
 * own placement actions (choosePart → rotate → setDraftPosition → placeDraft, as the cp1/cp2 harnesses
 * do) and named through the robotics store. The Drive view is opened through the dev hook
 * (`window.__robotics.driveView.openDrive`), standing in for lane G's Drive / Try it button. After
 * that everything is a student's input: a real mouse drag on the joystick, the arrow keys and WASD,
 * clicks on Reset, Test plate / My world, "Someone walks up" and Back to build, and Escape.
 *
 * Measured from the stage itself (`window.__robotics.stageStore`): how far the robot moved along its
 * forward and how far it turned (the chassis pose applied to the plate's centre and to its forward),
 * the door's angle, the light's colour. Checked after every Back to build: the document (bricks,
 * cables, device names, creations with their run space, programs) is byte-for-byte what it was, no
 * program was saved and the studio's Undo stack did not grow.
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-kid-drive.mjs
 *
 * Writes PNGs, results.json and nothing else under docs/qa/robotics-kid/drive/ (README.md is written by hand).
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadChromium, launchOptions, localOrigin, outputDir } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5254', 'the harness clears and rewrites the guest project')
const out = await outputDir('UI_OUTPUT', 'docs/qa/robotics-kid/drive')
const chromium = await loadChromium()
const browser = await chromium.launch(launchOptions())
const results = []
const measured = {}
const consoleErrors = []
const record = (id, ok, detail) => { results.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`) }
const check = (id, condition, detail) => { record(id, Boolean(condition), detail); assert(condition, `${id}: ${detail}`) }

const STUD = 0.62
const GREY = '#52636c'
/** Stud-grid coordinates (x, z in studs from the plate corner; y in plates) to world units, the studio's own rule. */
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * 0.18, z: (z - 32) * STUD })

/* ------------------------------------------------------------------ vector helpers (node side) */
const rotate = (q, v) => {
  const ix = q.w * v.x + q.y * v.z - q.z * v.y
  const iy = q.w * v.y + q.z * v.x - q.x * v.z
  const iz = q.w * v.z + q.x * v.y - q.y * v.x
  const iw = -q.x * v.x - q.y * v.y - q.z * v.z
  return { x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y, y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z, z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x }
}
const apply = (pose, p) => { const r = rotate(pose.rotation, p); return { x: r.x + pose.position.x, y: r.y + pose.position.y, z: r.z + pose.position.z } }
const degrees = (radians) => (radians * 180) / Math.PI
/** Heading change (degrees, positive = turned left, i.e. anticlockwise seen from above) of `forward` under a pose. */
const turnOf = (pose, forward) => { const f = rotate(pose.rotation, forward); return degrees(Math.atan2(forward.z * f.x - forward.x * f.z, forward.x * f.x + forward.z * f.z)) }

/** One page at one viewport, with the store helpers bound to it. */
async function openStudio(width, height, { touch = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...(touch ? { hasTouch: true } : {}) })
  const page = await context.newPage()
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(`${width}: ${message.text()}`) })
  page.on('pageerror', (error) => consoleErrors.push(`${width}: ${String(error)}`))
  await context.addInitScript(({ onboardingKey }) => { window.localStorage.setItem(onboardingKey, 'dismissed') }, { onboardingKey: ONBOARDING_KEY })
  await page.goto(`${origin}/build`)
  await page.evaluate((key) => window.localStorage.removeItem(key), PROJECT_KEY)
  await page.reload()
  await page.waitForFunction(() => Boolean(window.__robotics?.stageStore && window.__robotics?.project && window.__robotics?.driveView), null, { timeout: 30_000 })
  await page.waitForSelector('canvas')
  const sleep = (ms) => page.waitForTimeout(ms)
  const run = (target) => (fn, arg) => page.evaluate(({ src, arg, target }) => new Function('state', 'arg', `return (${src})(state, arg)`)(target === 'hook' ? window.__robotics : window.__robotics[target].getState(), arg), { src: fn.toString(), arg, target })
  const s = {
    page, context, width, height, sleep, tag: `${width}`,
    brick: run('brickStore'), robo: run('roboticsStore'), stage: run('stageStore'), drive: run('driveView'), hook: run('hook'),
    async shot(name) { const file = `${name}-${width}.png`; await page.screenshot({ path: path.join(out, file) }); console.log(`  shot ${file}`); return file },
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
    await sleep(80)
    return s.brick((state) => state.bricks[state.bricks.length - 1].id)
  }
  /** Names the robot the way the card would (whatever the card looks like). */
  s.name = async (name) => {
    await s.robo((state, n) => { if (state.card) state.confirmCard(n, false); else if (state.model.creations.length) state.renameCreation(state.model.creations.at(-1).id, n) }, name)
    await sleep(100)
  }
  s.section = () => s.brick((state) => JSON.parse(JSON.stringify(state.documentMetadata.robotics ?? null)))
  s.creationId = () => s.robo((state) => state.model.creations.at(-1).id)
  s.observation = () => s.stage((state) => {
    const o = state.stageObservation
    return o && { phase: o.phase, speed: o.speedStudsPerSecond, motors: o.motors, lights: o.lights, sensors: o.sensors, visitorPhase: o.visitorPhase ?? null }
  })
  s.stageInfo = () => s.stage((state) => {
    const st = state.stage
    return st && { space: st.space, generation: st.generation, props: st.controller.props.map((prop) => prop.id), hidden: st.controller.hiddenBrickIds.size, simulated: st.controller.simulatedBrickIds.size, phase: st.controller.phase, bodies: st.creation.bodies.map((body) => body.anchored) }
  })
  /** The chassis pose (the hub's body) and the creation's forward. */
  s.chassis = (hubId) => s.stage((state, hub) => {
    const st = state.stage
    const pose = st.controller.poses().get(st.controller.bodyOfBrick(hub))
    return { position: { ...pose.position }, rotation: { ...pose.rotation }, forward: { ...st.creation.drivePair.forward } }
  }, hubId)
  s.waitStage = async (space) => {
    await page.waitForFunction((want) => { const st = window.__robotics.stageStore.getState(); return st.stage !== null && !st.stageLoading && (!want || st.stage.space === want) && st.stageObservation?.phase === 'running' }, space ?? null, { timeout: 30_000 })
    await sleep(350)
  }
  s.openDrive = async (id, space) => {
    await s.drive((state, creationId) => state.openDrive(creationId), id)
    await page.waitForSelector('[data-testid=robo-drive][data-state=play]', { timeout: 30_000 })
    await s.waitStage(space)
    // The framing lands a frame after the request.
    await sleep(500)
  }
  s.back = async () => {
    await page.getByTestId('robo-drive-back').click()
    await page.waitForSelector('[data-testid=robo-drive]', { state: 'detached' })
    await sleep(300)
  }
  s.text = async (testId) => (await page.getByTestId(testId).textContent())?.replace(/\s+/g, ' ').trim() ?? ''
  s.visible = (selector) => page.locator(selector).first().isVisible().catch(() => false)
  s.rects = (selectors) => page.evaluate((list) => Object.fromEntries(list.map((selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector, { left: r.left, top: r.top, right: r.right, bottom: r.bottom }] })), selectors)
  s.scroll = () => page.evaluate(() => ({ x: window.scrollX, y: window.scrollY, top: document.scrollingElement?.scrollTop ?? 0, scale: window.visualViewport?.scale ?? 1 }))
  return s
}

const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
/** The whole document as the harness compares it: every brick, and the robotics section (cables, names, creations, programs). */
const snapshotDocument = async (s) => JSON.stringify(sortKeys({ bricks: await s.brick((state) => JSON.parse(JSON.stringify(state.bricks))), robotics: await s.section() }))
const undoDepth = (s) => s.brick((state) => state.undoStack.length)

/** The rover from loose parts (as a student places them), named "Buggy", with a little of "my world" around it. */
async function buildRover(s) {
  await s.stage((state) => state.closeStage())
  await s.brick((state) => state.newBuild())
  await s.sleep(150)
  const ids = {}
  ids.plate = await s.place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
  ids.hub = await s.place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
  await s.name('Buggy')
  ids.leftMotor = await s.place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
  ids.rightMotor = await s.place({ partId: 'robo_motor', x: 31, y: 1, z: 31, rotation: 0, color: GREY })
  ids.leftAxle = await s.place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
  ids.rightAxle = await s.place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
  ids.leftWheel = await s.place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
  ids.rightWheel = await s.place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
  ids.sensor = await s.place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
  // My world: a few loose bricks around it (not attached to it).
  const scenery = []
  scenery.push(await s.place({ partId: 'brick_2x4', x: 41, y: 0, z: 20, color: '#6fae5b' }))
  scenery.push(await s.place({ partId: 'brick_2x4', x: 18, y: 0, z: 17, color: '#e7473c' }))
  scenery.push(await s.place({ partId: 'brick_2x2', x: 30, y: 0, z: 12, color: '#f4ca3a' }))
  await s.robo((state) => state.dismissWiringNote())
  await s.sleep(300)
  return { ids, scenery }
}

/** Plate centre of the rover at the built pose (world): the point whose travel is "how far it moved". */
const ROVER_CENTRE = world(31, 0.5, 30)

async function drivePart(width, height) {
  console.log(`\nDrive at ${width}×${height}`)
  const s = await openStudio(width, height)
  const { page, sleep, tag } = s
  const { ids, scenery } = await buildRover(s)
  const id = await s.creationId()
  const built = await snapshotDocument(s)
  const undoBefore = await undoDepth(s)
  const programsBefore = (await s.section()).programs?.length ?? 0

  /* D1: open */
  await s.openDrive(id, 'testPlate')
  const info = await s.stageInfo()
  check(`${tag}.D1.drive-ready`, (await s.observation()).phase === 'running' && await page.getByRole('button', { name: /^Run$/ }).count() === 0, 'Drive opens driving-ready: the program is already running and there is no Run button to find')
  check(`${tag}.D1.what-it-says`, (await s.text('robo-drive-hint')) === 'Drag the joystick or use the arrow keys' && (await page.locator('.robo-drive-name').textContent()) === 'Buggy' && (await page.getByRole('button', { name: 'Test plate' }).getAttribute('aria-pressed')) === 'true', `bar: Back to build · Buggy · Test plate (on) / My world · Reset; the line: "${await s.text('robo-drive-hint')}"`)
  check(`${tag}.D1.course`, JSON.stringify(info.props) === JSON.stringify(['fence-ahead', 'fence-behind', 'fence-right', 'fence-left', 'post-right', 'post-left', 'post-far']) && info.bodies.every((anchored) => !anchored), `the test plate has its course: ${info.props.join(', ')}`)
  check(`${tag}.D1.studio-aside`, !(await s.visible('.part-library')) && !(await s.visible('.command-strip')) && !(await s.visible('[data-testid=robotics-panel]')) && !(await s.visible('.brick-camera-cluster')), 'the drawer, the command strip, the camera cluster and the robotics panel are out of the way')
  // Framing: the robot and the whole course sit clear of the bar and the joystick column, never under a control.
  const insets = await s.hook((hook) => hook.insets())
  const canvas = await s.hook((hook) => hook.canvasRect())
  const rects = await s.rects(['.robo-drive-bar', '.robo-drive-side', '.robo-drive-joystick', '.robo-drive-hint', '.robo-drive-speed'])
  const free = { left: canvas.left, right: rects['.robo-drive-side'].left, top: rects['.robo-drive-bar'].bottom, bottom: canvas.top + canvas.height }
  const fence = await s.stage((state) => state.stage.controller.props.filter((prop) => prop.id.startsWith('fence')).map((prop) => ({ center: prop.center, size: prop.size })))
  const box = { x0: Math.min(...fence.map((f) => f.center.x - f.size.x / 2)), x1: Math.max(...fence.map((f) => f.center.x + f.size.x / 2)), z0: Math.min(...fence.map((f) => f.center.z - f.size.z / 2)), z1: Math.max(...fence.map((f) => f.center.z + f.size.z / 2)) }
  const courseAt = await Promise.all([[box.x0, box.z0], [box.x1, box.z0], [box.x0, box.z1], [box.x1, box.z1]].map(([x, z]) => s.hook((hook, p) => hook.project(p), { x, y: 0.72, z })))
  const robotAt = await Promise.all([world(28, 1, 26), world(34, 1, 26), world(28, 1, 34), world(34, 1, 34)].map((point) => s.hook((hook, p) => hook.project(p), point)))
  const inside = (point, r) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom
  const plateWidth = Math.hypot(robotAt[1].x - robotAt[0].x, robotAt[1].y - robotAt[0].y)
  const margins = { left: Math.round(Math.min(...courseAt.map((p) => p.x)) - free.left), right: Math.round(free.right - Math.max(...courseAt.map((p) => p.x))), top: Math.round(Math.min(...courseAt.map((p) => p.y)) - free.top), bottom: Math.round(free.bottom - Math.max(...courseAt.map((p) => p.y))) }
  measured[`${tag}.framing`] = { insets, courseMarginsPx: margins, robotPlateWidthPx: Math.round(plateWidth) }
  check(`${tag}.D1.insets`, Math.abs(insets.top - (rects['.robo-drive-bar'].bottom - canvas.top)) < 2 && Math.abs(insets.right - (canvas.left + canvas.width - rects['.robo-drive-side'].left)) < 2 && insets.bottom === 0 && insets.left === 0, `the framing counts the bar (top ${Math.round(insets.top)} px) and the speed/hint/joystick column (right ${Math.round(insets.right)} px); nothing covers the bottom or the left`)
  check(`${tag}.D1.framed`, courseAt.every((point) => inside(point, free)) && robotAt.every((point) => inside(point, free)) && plateWidth > 60, `the whole fenced course is on screen clear of every control (margins ${JSON.stringify(margins)} px) and the robot's 6-stud plate is drawn ${Math.round(plateWidth)} px wide`)
  await s.shot('D1-drive-open')

  /* D2: a real mouse drag on the joystick */
  const start = await s.chassis(ids.hub)
  const stick = await page.getByTestId('robo-drive-joystick').boundingBox()
  const centre = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.down()
  await page.mouse.move(centre.x, centre.y - 44, { steps: 10 })
  await sleep(900)
  const held = await s.observation()
  const speedShown = await s.text('robo-drive-speed')
  const knobUp = Number(await page.getByTestId('robo-drive-joystick').getAttribute('data-up'))
  await s.shot('D2-joystick-forward')
  await page.mouse.up()
  await sleep(900)
  const afterStick = await s.chassis(ids.hub)
  const released = await s.observation()
  const moved = (from, to) => {
    const a = apply(from, ROVER_CENTRE)
    const b = apply(to, ROVER_CENTRE)
    const delta = { x: b.x - a.x, z: b.z - a.z }
    return { forward: (delta.x * from.forward.x + delta.z * from.forward.z) / STUD, total: Math.hypot(delta.x, delta.z) / STUD }
  }
  const stickMove = moved(start, afterStick)
  measured[`${tag}.joystick`] = { knobUp, speedWhileHeld: held.speed, speedShown, movedForwardStuds: +stickMove.forward.toFixed(2), turnedDegrees: +turnOf(afterStick, start.forward).toFixed(1) }
  check(`${tag}.D2.joystick-drives`, knobUp > 80 && held.speed > 2 && stickMove.forward > 3 && Math.abs(turnOf(afterStick, start.forward)) < 8, `dragging the knob up (${knobUp} % up) drove it ${stickMove.forward.toFixed(1)} studs forward at ${held.speed.toFixed(1)} studs/s (readout "${speedShown}"), turning ${turnOf(afterStick, start.forward).toFixed(1)}°`)
  check(`${tag}.D2.let-go-stops`, Object.values(released.motors).every((motor) => Math.abs(motor.powerPercent) < 1) && Math.abs(released.speed) < 0.5 && Number(await page.getByTestId('robo-drive-joystick').getAttribute('data-up')) === 0, `letting go: the knob springs back and the motors stop (speed ${released.speed.toFixed(2)} studs/s)`)

  /* D3: the arrow keys turn it, WASD drives it */
  const beforeTurn = await s.chassis(ids.hub)
  await page.keyboard.down('ArrowLeft')
  await sleep(250)
  const leanRight = Number(await page.getByTestId('robo-drive-joystick').getAttribute('data-right'))
  await sleep(550)
  await s.shot('D3-arrow-turn')
  await page.keyboard.up('ArrowLeft')
  await sleep(600)
  const afterTurn = await s.chassis(ids.hub)
  const turned = turnOf(afterTurn, start.forward) - turnOf(beforeTurn, start.forward)
  const turnMove = moved(beforeTurn, afterTurn)
  measured[`${tag}.arrowLeft`] = { turnedDegrees: +turned.toFixed(1), movedStuds: +turnMove.total.toFixed(2), knobLean: leanRight }
  check(`${tag}.D3.arrow-turns`, turned > 25 && turnMove.total < 3 && leanRight === -100, `ArrowLeft held 0.8 s: it turned ${turned.toFixed(0)}° to the left on the spot (moved ${turnMove.total.toFixed(1)} studs); the knob leans left while the key is held`)
  await page.keyboard.down('ArrowRight')
  await sleep(800)
  await page.keyboard.up('ArrowRight')
  await sleep(600)
  const afterRight = await s.chassis(ids.hub)
  const turnedBack = turnOf(afterRight, start.forward) - turnOf(afterTurn, start.forward)
  const beforeW = afterRight
  await page.keyboard.down('w')
  await sleep(600)
  await page.keyboard.up('w')
  await sleep(700)
  const afterW = await s.chassis(ids.hub)
  const wMove = moved({ ...beforeW, forward: rotate(beforeW.rotation, start.forward) }, afterW)
  measured[`${tag}.keys`] = { arrowRightDegrees: +turnedBack.toFixed(1), wForwardStuds: +wMove.forward.toFixed(2) }
  check(`${tag}.D3.arrow-right-and-w`, turnedBack < -25 && wMove.forward > 1.5, `ArrowRight turned it back ${turnedBack.toFixed(0)}°; W drove it ${wMove.forward.toFixed(1)} studs forward`)
  const scroll = await s.scroll()
  check(`${tag}.D3.page-still`, scroll.x === 0 && scroll.y === 0 && scroll.top === 0 && scroll.scale === 1, `after the drag and the keys the page has not scrolled or zoomed (scroll ${scroll.x},${scroll.y}; scale ${scroll.scale})`)

  /* D4: Reset */
  const generation = (await s.stageInfo()).generation
  await page.getByTestId('robo-drive-reset').click()
  await s.waitStage('testPlate')
  const afterReset = await s.stageInfo()
  const resetPose = await s.chassis(ids.hub)
  const drift = Math.hypot(resetPose.position.x - start.position.x, resetPose.position.z - start.position.z)
  check(`${tag}.D4.reset`, afterReset.generation > generation && drift < 0.02 && Math.abs(turnOf(resetPose, start.forward)) < 1 && afterReset.phase === 'running', `Reset: back where it started (${drift.toFixed(3)} from the built pose), driving-ready again`)

  /* D5: My world and back */
  await page.getByRole('button', { name: 'My world' }).click()
  await s.waitStage('myWorld')
  const mine = await s.stageInfo()
  const creationBricks = Object.keys(ids).length
  check(`${tag}.D5.my-world`, mine.props.length === 0 && mine.hidden === creationBricks && mine.simulated === creationBricks && mine.bodies.every((anchored) => !anchored) && (await page.getByRole('button', { name: 'My world' }).getAttribute('aria-pressed')) === 'true', `My world: no course, the student's ${scenery.length} scenery bricks stay drawn by the studio (only the robot's ${creationBricks} bricks are the stage's), and the robot is free to roll`)
  const worldStart = await s.chassis(ids.hub)
  await page.keyboard.down('ArrowUp')
  await sleep(700)
  await page.keyboard.up('ArrowUp')
  await sleep(600)
  const worldMove = moved(worldStart, await s.chassis(ids.hub))
  measured[`${tag}.myWorld`] = { arrowUpForwardStuds: +worldMove.forward.toFixed(2) }
  check(`${tag}.D5.drives-in-my-world`, worldMove.forward > 2, `ArrowUp in My world drove it ${worldMove.forward.toFixed(1)} studs forward among the student's bricks`)
  await s.shot('D4-my-world')
  await page.getByRole('button', { name: 'Test plate' }).click()
  await s.waitStage('testPlate')
  check(`${tag}.D5.back-to-test-plate`, (await s.stageInfo()).props.length === 7, 'Test plate again: the course is back and it is driving-ready')

  /* D6: Back to build: nothing written */
  await s.back()
  const after = await snapshotDocument(s)
  const programsAfter = (await s.section()).programs?.length ?? 0
  if (after !== built) console.log('  document differs:', after.slice(0, 400), '\n  vs', built.slice(0, 400))
  check(`${tag}.D6.document-unchanged`, after === built && programsAfter === programsBefore && programsAfter === 0 && (await undoDepth(s)) === undoBefore && (await s.stage((state) => state.stage)) === null, `Back to build: every brick, cable, name and creation (run space included) is exactly as built; ${programsAfter} programs saved; Undo stack unchanged (${undoBefore}); the stage is closed`)
  check(`${tag}.D6.studio-back`, await s.visible('[data-testid=robotics-panel]') || await s.visible('[data-testid=robotics-creation-card]') || await s.visible('.command-strip'), 'the build tools are back')

  /* D7: a construction edit closes it; a robot that is not ready says what to do */
  await s.openDrive(id, 'testPlate')
  await s.brick((state, wheel) => { state.selectBrick(wheel); state.deleteSelected() }, ids.leftWheel)
  await page.waitForSelector('[data-testid=robo-drive]', { state: 'detached', timeout: 5000 })
  check(`${tag}.D7.edit-closes`, (await s.stage((state) => state.stage)) === null && (await s.drive((state) => state.creationId)) === null, 'taking a wheel off while it drives closes Drive: the construction is the truth')
  await s.drive((state, creationId) => state.openDrive(creationId), id)
  await page.waitForSelector('[data-testid=robo-drive-not-ready]')
  const notReady = await s.text('robo-drive-not-ready')
  check(`${tag}.D7.not-ready`, /^Buggy is almost ready!\s*Put a wheel on .*axle\.\s*Back to build$/.test(notReady) && (await s.stage((state) => state.stage)) === null, `opened without the wheel: "${notReady}" (and no stage)`)
  await s.shot('D5-not-ready')
  await s.back()
  await s.context.close()
}

/** The four-wheel car (lane M2's fixture, from loose parts): all four motors drive it in the Drive view. */
async function fourWheelPart(width, height) {
  console.log(`\nFour-wheel car at ${width}×${height}`)
  const s = await openStudio(width, height)
  const { page, sleep, tag } = s
  await s.brick((state) => state.newBuild())
  await sleep(150)
  const ids = {}
  ids.frontPlate = await s.place({ partId: 'plate_6x8', x: 28, y: 0, z: 18, color: '#3e83d7' })
  ids.backPlate = await s.place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
  ids.hub = await s.place({ partId: 'robo_hub', x: 29, y: 1, z: 24, color: '#f5eee0' })
  await s.name('Four-wheel car')
  ids.frontLeftMotor = await s.place({ partId: 'robo_motor', x: 28, y: 1, z: 21, rotation: 2, color: GREY })
  ids.frontRightMotor = await s.place({ partId: 'robo_motor', x: 31, y: 1, z: 21, rotation: 0, color: GREY })
  ids.backLeftMotor = await s.place({ partId: 'robo_motor', x: 28, y: 1, z: 28, rotation: 2, color: GREY })
  ids.backRightMotor = await s.place({ partId: 'robo_motor', x: 31, y: 1, z: 28, rotation: 0, color: GREY })
  for (const [x, z] of [[26, 22], [34, 22], [26, 29], [34, 29]]) await s.place({ partId: 'robo_axle_short', x, y: 0, z, color: GREY })
  for (const [x, z] of [[25, 21], [36, 21], [25, 28], [36, 28]]) await s.place({ partId: 'robo_wheel', x, y: 0, z, color: '#1f2a33' })
  await s.robo((state) => state.dismissWiringNote())
  await sleep(300)
  const built = await snapshotDocument(s)
  const motors = [ids.frontLeftMotor, ids.frontRightMotor, ids.backLeftMotor, ids.backRightMotor]
  const plugged = await s.robo((state, list) => list.every((id) => state.model.creations.at(-1).motors.find((motor) => motor.brickId === id)?.plugged), motors)
  await s.openDrive(await s.creationId(), 'testPlate')
  check(`${tag}.W1.opens`, plugged && (await s.stageInfo()).props.length === 7, 'the car from loose parts (assisted wiring plugged all four motors in) opens driving-ready on its course')
  const centre = world(31, 0.5, 26)
  const start = await s.chassis(ids.hub)
  const stick = await page.getByTestId('robo-drive-joystick').boundingBox()
  const middle = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x, middle.y - 44, { steps: 10 })
  await sleep(800)
  const held = await s.observation()
  await s.shot('D7-four-wheel')
  await page.mouse.up()
  await sleep(800)
  const afterStick = await s.chassis(ids.hub)
  const a = apply(start, centre)
  const b = apply(afterStick, centre)
  const forward = ((b.x - a.x) * start.forward.x + (b.z - a.z) * start.forward.z) / STUD
  const allFour = motors.every((id) => Math.abs(held.motors[id].powerPercent) > 50)
  await page.keyboard.down('ArrowLeft')
  await sleep(1200)
  await page.keyboard.up('ArrowLeft')
  await sleep(500)
  const turn = turnOf(await s.chassis(ids.hub), start.forward) - turnOf(afterStick, start.forward)
  measured[`${tag}.fourWheel`] = { movedForwardStuds: +forward.toFixed(2), speedWhileHeld: held.speed, arrowLeftDegrees: +turn.toFixed(1), powers: motors.map((id) => held.motors[id].powerPercent) }
  check(`${tag}.W1.drives`, allFour && forward > 3 && held.speed > 2, `the joystick drove all four motors (${motors.map((id) => held.motors[id].powerPercent).join(', ')} %): ${forward.toFixed(1)} studs forward at ${held.speed.toFixed(1)} studs/s`)
  check(`${tag}.W1.turns`, turn > 15, `ArrowLeft held 1.2 s turned it ${turn.toFixed(0)}° to the left`)
  await s.back()
  check(`${tag}.W1.document-unchanged`, (await snapshotDocument(s)) === built && ((await s.section()).programs?.length ?? 0) === 0, 'Back to build: the car is exactly as built and no program was saved')
  await s.context.close()
}

/** One finger on the joystick, as on an iPad: Chrome with touch, driven through the DevTools touch events. */
async function touchPart(width, height) {
  console.log(`\nTouch at ${width}×${height}`)
  const s = await openStudio(width, height, { touch: true })
  const { page, sleep, tag } = s
  const { ids } = await buildRover(s)
  const built = await snapshotDocument(s)
  await s.openDrive(await s.creationId(), 'testPlate')
  const cdp = await s.context.newCDPSession(page)
  const stick = await page.getByTestId('robo-drive-joystick').boundingBox()
  const centre = { x: stick.x + stick.width / 2, y: stick.y + stick.height / 2 }
  const start = await s.chassis(ids.hub)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre.x, y: centre.y, id: 1 }] })
  for (let step = 1; step <= 10; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: centre.x, y: centre.y - 4.4 * step, id: 1 }] })
    await sleep(16)
  }
  await sleep(800)
  const knobUp = Number(await page.getByTestId('robo-drive-joystick').getAttribute('data-up'))
  await s.shot('D6-touch-drag')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await sleep(900)
  const after = await s.chassis(ids.hub)
  const a = apply(start, ROVER_CENTRE)
  const b = apply(after, ROVER_CENTRE)
  const forward = ((b.x - a.x) * start.forward.x + (b.z - a.z) * start.forward.z) / STUD
  const scroll = await s.scroll()
  const coarse = await page.evaluate(() => window.matchMedia('(any-pointer: coarse)').matches)
  const targets = await page.evaluate(() => [...document.querySelectorAll('.robo-drive button')].map((button) => Math.round(button.getBoundingClientRect().height)))
  measured[`${tag}.touch`] = { knobUp, movedForwardStuds: +forward.toFixed(2), scroll, smallestTargetPx: Math.min(...targets) }
  check(`${tag}.touch.one-finger-drives`, knobUp > 80 && forward > 3 && Number(await page.getByTestId('robo-drive-joystick').getAttribute('data-up')) === 0, `one finger dragged the knob up (${knobUp} % up): the robot drove ${forward.toFixed(1)} studs forward; lifting the finger centred it`)
  check(`${tag}.touch.page-still`, scroll.x === 0 && scroll.y === 0 && scroll.top === 0 && scroll.scale === 1, `the page did not scroll or zoom (scroll ${scroll.x},${scroll.y}; scale ${scroll.scale})`)
  check(`${tag}.touch.targets`, coarse && Math.min(...targets) >= 44, `with a touch screen every button in the view is at least 44 px tall (smallest ${Math.min(...targets)} px)`)
  await s.back()
  check(`${tag}.touch.document-unchanged`, (await snapshotDocument(s)) === built && ((await s.section()).programs?.length ?? 0) === 0, 'Back to build: the robot is exactly as built and no program was saved')
  await s.context.close()
}

async function tryPart(width, height) {
  console.log(`\nTry it at ${width}×${height}`)
  const s = await openStudio(width, height)
  const { page, sleep, tag } = s

  /* T1: the gate */
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
  await s.name('Gate')
  gate.door = await s.place({ partId: 'brick_1x4', x: 21, y: 8, z: 21, rotation: 1, color: '#f4ca3a' })
  gate.hub = await s.place({ partId: 'robo_hub', x: 20, y: 1, z: 24, color: '#f5eee0' })
  gate.sensor = await s.place({ partId: 'robo_distance_sensor', x: 21, y: 7, z: 27, color: '#f4ca3a' })
  await s.robo((state) => state.dismissWiringNote())
  await sleep(300)
  const gateBuilt = await snapshotDocument(s)
  const undoGate = await undoDepth(s)
  await s.openDrive(await s.creationId(), 'myWorld')
  const gateInfo = await s.stageInfo()
  check(`${tag}.T1.try-it`, (await page.getByTestId('robo-drive').getAttribute('data-kind')) === 'try' && gateInfo.space === 'myWorld' && gateInfo.props.join() === 'visitor' && (await s.text('robo-drive-hint')) === 'Press the big button. Watch what happens.' && await page.getByRole('button', { name: 'My world' }).count() === 0 && await page.getByRole('button', { name: 'Someone walks up' }).isEnabled(), 'Try it opens in My world with its visitor, a big "Someone walks up" button and one line; no space switch')
  const tryRects = await s.rects(['.robo-drive-bar', '.robo-drive-side', '.robo-drive-foot'])
  const gateAt = await Promise.all([world(20, 14, 20), world(26, 14, 20), world(20, 0, 28), world(26, 0, 28)].map((point) => s.hook((hook, p) => hook.project(p), point)))
  const underTry = gateAt.some((point) => Object.values(tryRects).some((r) => point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom))
  check(`${tag}.T1.framed`, !underTry && gateAt.every((point) => point.inFront && point.y > tryRects['.robo-drive-bar'].bottom && point.x < tryRects['.robo-drive-side'].left), 'the gate is framed clear of the bar, the results and the button column')
  const results0 = await s.text('robo-drive-results')
  check(`${tag}.T1.closed`, /Arm motor\s*closed/.test(results0) && /sees nothing/.test(results0), `before: "${results0}"`)
  await s.shot('T1-gate')
  await page.getByRole('button', { name: 'Someone walks up' }).click()
  let maxAngle = 0
  let openText = ''
  let shotTaken = false
  const began = Date.now()
  while (Date.now() - began < 10_000) {
    const o = await s.observation()
    const angle = o.motors[gate.hinge].positionDegrees
    if (angle > maxAngle) maxAngle = angle
    if (!shotTaken && angle > 87) { openText = await s.text('robo-drive-results'); await sleep(150); await s.shot('T2-gate-open'); shotTaken = true }
    if (maxAngle > 85 && angle < 5) break
    await sleep(100)
  }
  const doorPose = await s.stage((state, door) => state.stage.controller.poses().get(state.stage.controller.bodyOfBrick(door)).rotation, gate.door)
  measured[`${tag}.gate`] = { maxDoorDegrees: maxAngle, whileOpen: openText }
  check(`${tag}.T2.door-opens`, shotTaken && maxAngle > 87 && maxAngle < 93 && /Arm motor\s*open/.test(openText) && /sees something/.test(openText), `someone walked up: the door swung to ${maxAngle.toFixed(1)}° and the results read "${openText}"`)
  check(`${tag}.T2.door-closes`, (await s.observation()).motors[gate.hinge].positionDegrees < 5, 'after the visitor, the starter closed the door again')
  check(`${tag}.T2.hinge-only`, Math.abs(doorPose.x) < 0.02 && Math.abs(doorPose.z) < 0.02, 'the door turns about the hinge only')
  await s.back()
  check(`${tag}.T2.document-unchanged`, (await snapshotDocument(s)) === gateBuilt && ((await s.section()).programs?.length ?? 0) === 0 && (await undoDepth(s)) === undoGate, 'Back to build: the gate is exactly as built and no program was saved (the Smart gate starter ran on the fly)')

  /* T3: the signal light */
  await s.brick((state) => state.newBuild())
  await sleep(150)
  const post = {}
  post.hub = await s.place({ partId: 'robo_hub', x: 40, y: 0, z: 40, color: '#f5eee0' })
  post.sensor = await s.place({ partId: 'robo_distance_sensor', x: 41, y: 6, z: 40, color: '#f4ca3a' })
  post.light = await s.place({ partId: 'robo_light', x: 43, y: 6, z: 43, color: '#e7473c' })
  await s.name('Signal light')
  await s.robo((state) => state.dismissWiringNote())
  await sleep(300)
  const postBuilt = await snapshotDocument(s)
  await s.openDrive(await s.creationId(), 'myWorld')
  const before = await s.text('robo-drive-results')
  check(`${tag}.T3.off`, /Light\s*off/.test(before), `before: "${before}"`)
  await page.getByRole('button', { name: 'Someone walks up' }).click()
  await page.waitForFunction((light) => window.__robotics.stageStore.getState().stageObservation?.lights[light] === 'red', post.light, { timeout: 10_000 })
  await sleep(300)
  const lit = await s.text('robo-drive-results')
  const walking = await page.getByRole('button', { name: 'Someone walks up' }).isDisabled()
  measured[`${tag}.signal`] = { light: (await s.observation()).lights[post.light], results: lit }
  check(`${tag}.T3.light-red`, /Light\s*red/.test(lit) && walking, `someone walked up: the light is red; the results read "${lit}"; the button waits while they walk`)
  await s.shot('T3-signal-red')
  await page.keyboard.press('Escape')
  await page.waitForSelector('[data-testid=robo-drive]', { state: 'detached' })
  check(`${tag}.T3.escape-closes`, (await s.stage((state) => state.stage)) === null && (await snapshotDocument(s)) === postBuilt && ((await s.section()).programs?.length ?? 0) === 0, 'Escape is Back to build too; the signal light is as built and no program was saved')
  await s.context.close()
}

for (const [width, height] of [[1366, 768], [1024, 768]]) {
  await drivePart(width, height)
  await fourWheelPart(width, height)
  await tryPart(width, height)
}
await touchPart(1024, 768)

check('console-clean', consoleErrors.length === 0, consoleErrors.length ? consoleErrors.slice(0, 4).join(' | ') : 'no console errors')
await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, viewports: ['1366x768', '1024x768'], at: new Date().toISOString(), measured, results }, null, 2)}\n`)
await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
