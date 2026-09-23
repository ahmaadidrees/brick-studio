/**
 * Robot Workshop spike, checkpoint 3 (lane T, discovery): the checkpoint-1 rover journey by real touch in
 * iPadOS Safari on the iOS Simulator.
 *
 * Every tap, double tap and scroll is a W3C touch action sent through safaridriver to Safari on the simulated
 * iPad (`scripts/qa/lib/safari-ios.mjs`): WebKit receives touchstart/pointerdown(touch)/touchend exactly as under
 * a finger. The page is only *read* through execute-script — the stores, the dev hook `window.__robotics.project`
 * (where a world point is on screen: the aiming a student does by eye), element rects and hit tests — plus two
 * setup writes (empty the guest project, home camera). Typing the creation's name uses WebDriver Element Send
 * Keys after the field was focused by a tap (the software keyboard is not driven).
 *
 * At each stage the harness records what a touch student would meet: whether the thing to tap is on top at the
 * tap point (not under the card, the panel, the sheet or the command strip), targets under 44 px, text under
 * 13 px, how much of the canvas is left free, and a screenshot of the whole simulated screen (JPEG, 1 px per CSS px).
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp3-touch.mjs
 *
 * against `npx vite --mode robotics --port 5245 --strictPort --host 127.0.0.1` from this worktree.
 * Environment: UI_ORIGIN (default http://127.0.0.1:5245), SIM_UDID (default: the booted iPad),
 * SAFARIDRIVER_PORT (default 4471), UI_OUTPUT (default docs/qa/robotics-cp3/touch/<orientation>).
 * The orientation is whatever the simulator shows; rotate it in Simulator (Device › Rotate, ⌘← / ⌘→) and re-run.
 * The run does not stop at the first failed check: a step that cannot be done by touch is recorded as blocking
 * and the journey goes on where it still can.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { localOrigin } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'
import { SafariSimulator, bootedDevice, ensureSafariDriver } from './lib/safari-ios.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5245', 'the harness clears and rewrites the guest project')
const port = Number(process.env.SAFARIDRIVER_PORT || 4471)
const device = await bootedDevice(process.env.SIM_UDID)
const driverChild = await ensureSafariDriver(port)
const sim = await SafariSimulator.open({ port, udid: device.udid })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
const stages = []
const findings = []
const swallowedTaps = []
const aimSizes = []
let out = ''
let shotIndex = 0
const record = (id, ok, detail, extra) => { results.push({ id, ok, detail, ...(extra ? { extra } : {}) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); return ok }
const note = (severity, id, detail, extra) => { findings.push({ severity, id, detail, ...(extra ? { extra } : {}) }); console.log(`  ${severity.toUpperCase()} ${id} — ${detail}`) }

/* ---------------------------------------------------------------- page-side helpers */

/** Installed once per page load as `window.__qa`: element lookup, hit tests, layout and size audits. */
function installQa() {
  const qa = { events: [] }
  const visible = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const describe = (el) => {
    if (!el) return 'nothing'
    const testid = el.getAttribute?.('data-testid'); const label = el.getAttribute?.('aria-label')
    const cls = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${testid ? `[data-testid=${testid}]` : ''}${label ? `[aria-label="${label}"]` : ''}${cls}`
  }
  /** The nearest ancestor that names a UI surface, for "covered by …" messages. */
  const surfaceOf = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      for (const [name, css] of Object.entries(qa.SURFACES)) if (node.matches(css)) return name
    }
    return el?.tagName === 'CANVAS' ? 'canvas' : describe(el)
  }
  qa.SURFACES = {
    header: 'header[aria-label="Studio toolbar"]',
    drawerSheet: '[role="dialog"]:has(.part-grid)',
    drawerPanel: '.brick-library:not([role="dialog"] *)',
    card: '[data-testid="robotics-creation-card"]',
    panel: '[data-testid="robotics-panel"]',
    wiringLine: '[data-testid="robotics-wiring-line"]',
    commandStrip: '[data-testid="command-strip"]',
    cameraCluster: '[role="group"][aria-label="Camera view"]',
    buildTools: '[role="group"][aria-label="Build tools"]',
    dock: '.brick-creative-dock',
    toast: '[role="status"].brick-toast, .brick-toast',
  }
  qa.describe = describe
  qa.surfaceOf = surfaceOf
  qa.find = (spec) => {
    const root = spec.within ? document.querySelector(spec.within) : document
    if (!root) return null
    let list = []
    if (spec.css) list = [...root.querySelectorAll(spec.css)]
    else if (spec.label) list = [...root.querySelectorAll('[aria-label]')].filter((el) => spec.label instanceof RegExp || typeof spec.label === 'object' ? new RegExp(spec.label.regex).test(el.getAttribute('aria-label')) : el.getAttribute('aria-label') === spec.label)
    else if (spec.text) list = [...root.querySelectorAll(spec.tag ?? 'button, [role="tab"], a, summary')].filter((el) => el.textContent.trim() === spec.text)
    else if (spec.title) list = [...root.querySelectorAll(`[title="${spec.title}"]`)]
    return list.find(visible) ?? list[0] ?? null
  }
  /** Where to tap an element: the centre of its part that is inside the viewport and every clipping ancestor, and what is on top there. */
  qa.target = (spec) => {
    const el = qa.find(spec)
    if (!el) return { found: false }
    const r = el.getBoundingClientRect()
    let top = r.top, bottom = r.bottom, left = r.left, right = r.right
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (/(auto|scroll|hidden|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
        const pr = p.getBoundingClientRect()
        top = Math.max(top, pr.top); bottom = Math.min(bottom, pr.bottom); left = Math.max(left, pr.left); right = Math.min(right, pr.right)
      }
    }
    top = Math.max(top, 0); left = Math.max(left, 0); bottom = Math.min(bottom, innerHeight); right = Math.min(right, innerWidth)
    const inView = bottom - top >= Math.min(r.height, 24) - 0.5 && right - left >= Math.min(r.width, 24) - 0.5
    const cx = (left + right) / 2, cy = (top + bottom) / 2
    const hitEl = inView ? document.elementFromPoint(cx, cy) : null
    const hit = Boolean(hitEl && (hitEl === el || el.contains(hitEl)))
    return {
      found: true, visible: visible(el), disabled: Boolean(el.disabled), inView, hit, cx, cy,
      hitBy: hit || !hitEl ? null : `${surfaceOf(hitEl)} (${describe(hitEl)})`,
      rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      name: (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      surface: surfaceOf(el.parentElement ?? el),
    }
  }
  /** The scroll container around an element and how far its centre is from the container's centre. */
  qa.scrollInfo = (spec) => {
    const el = qa.find(spec)
    if (!el) return null
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p)
      const scrollsY = /(auto|scroll)/.test(cs.overflowY) && p.scrollHeight > p.clientHeight + 1
      const scrollsX = /(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth + 1
      if (!scrollsY && !scrollsX) continue
      const pr = p.getBoundingClientRect(); const r = el.getBoundingClientRect()
      const box = { top: Math.max(pr.top, 0), bottom: Math.min(pr.bottom, innerHeight), left: Math.max(pr.left, 0), right: Math.min(pr.right, innerWidth) }
      return {
        container: describe(p), box,
        dy: scrollsY ? (r.top + r.height / 2) - (box.top + box.bottom) / 2 : 0,
        dx: scrollsX ? (r.left + r.width / 2) - (box.left + box.right) / 2 : 0,
        scrollTop: p.scrollTop, scrollLeft: p.scrollLeft,
      }
    }
    return null
  }
  /** What is under a canvas tap point. */
  qa.canvasAt = (x, y) => {
    const el = document.elementFromPoint(x, y)
    return { onCanvas: el?.tagName === 'CANVAS', by: el?.tagName === 'CANVAS' ? null : `${surfaceOf(el)} (${describe(el)})` }
  }
  /** Rects of the visible UI surfaces, their pairwise overlaps, and the share of the canvas a finger can still reach. */
  qa.layout = () => {
    const rects = {}
    for (const [name, css] of Object.entries(qa.SURFACES)) {
      const el = [...document.querySelectorAll(css)].find(visible)
      if (el) { const r = el.getBoundingClientRect(); rects[name] = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }
    }
    const overlaps = []
    const names = Object.keys(rects).filter((n) => n !== 'header')
    for (let i = 0; i < names.length; i += 1) for (let j = i + 1; j < names.length; j += 1) {
      const a = rects[names[i]], b = rects[names[j]]
      const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
      const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
      if (w > 1 && h > 1) overlaps.push({ a: names[i], b: names[j], width: Math.round(w), height: Math.round(h) })
    }
    const canvas = document.querySelector('canvas'); const cr = canvas.getBoundingClientRect()
    let total = 0, free = 0
    const coveredBy = {}
    for (let y = cr.top + 6; y < Math.min(cr.bottom, innerHeight); y += 12) for (let x = cr.left + 6; x < Math.min(cr.right, innerWidth); x += 12) {
      total += 1
      const el = document.elementFromPoint(x, y)
      if (el?.tagName === 'CANVAS') free += 1
      else { const s = surfaceOf(el); coveredBy[s] = (coveredBy[s] ?? 0) + 1 }
    }
    const shares = Object.fromEntries(Object.entries(coveredBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round((v / total) * 1000) / 10]))
    const hook = window.__robotics
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visual: window.visualViewport ? { width: Math.round(visualViewport.width), height: Math.round(visualViewport.height), offsetTop: Math.round(visualViewport.offsetTop) } : null },
      canvas: { x: Math.round(cr.x), y: Math.round(cr.y), width: Math.round(cr.width), height: Math.round(cr.height) },
      rects, overlaps, freeCanvasPercent: Math.round((free / Math.max(total, 1)) * 1000) / 10, coveredPercentBy: shares,
      framingInsets: hook?.insets ? hook.insets() : null,
    }
  }
  /** Interactive elements under 44 px on either side, per surface. */
  qa.smallTargets = () => {
    const found = []
    for (const [surface, css] of Object.entries(qa.SURFACES)) {
      const root = [...document.querySelectorAll(css)].find(visible)
      if (!root) continue
      for (const el of root.querySelectorAll('button, input, select, textarea, a[href], summary, [role="tab"], [role="button"]')) {
        if (!visible(el) || el.type === 'file') continue
        const r = el.getBoundingClientRect()
        if (r.width < 44 || r.height < 44) found.push({ surface, name: (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40), width: Math.round(r.width), height: Math.round(r.height) })
      }
    }
    return found
  }
  /** Distinct text under 13 px, per surface, with its size. */
  qa.smallText = () => {
    const found = []
    for (const [surface, css] of Object.entries(qa.SURFACES)) {
      const root = [...document.querySelectorAll(css)].find(visible)
      if (!root) continue
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      const seen = new Set()
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent.trim(); const el = node.parentElement
        if (!text || !el || !visible(el)) continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        const key = `${size}|${text.slice(0, 40)}`
        if (size < 13 && !seen.has(key)) { seen.add(key); found.push({ surface, size, text: text.replace(/\s+/g, ' ').slice(0, 50) }) }
      }
    }
    return found
  }
  for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click']) {
    window.addEventListener(type, (event) => { qa.events.push({ type, pointerType: event.pointerType ?? '', t: Math.round(event.timeStamp) }); if (qa.events.length > 400) qa.events.shift() }, true)
  }
  window.__qa = qa
  return true
}

const qa = (fn, ...args) => sim.exec(fn, ...args)
const target = (spec) => qa((s) => window.__qa.target(s), spec)
const layout = () => qa(() => window.__qa.layout())
const brick = (fn, arg) => qa((src, a) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), a), fn.toString(), arg ?? null)
const robo = (fn, arg) => qa((src, a) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), a), fn.toString(), arg ?? null)
const screenOf = (point) => qa((p) => window.__robotics.project(p), point)
const draft = () => brick((state) => state.draft && { partId: state.draft.partId, x: state.draft.x, y: state.draft.y, z: state.draft.z, rotation: state.draft.rotation })
const brickCount = () => brick((state) => state.bricks.length)
const lastBrick = () => brick((state) => { const b = state.bricks[state.bricks.length - 1]; return b && { id: b.id, partId: b.partId, x: b.x, y: b.y, z: b.z, rotation: b.rotation } })
const cardState = () => robo((state) => state.card && { creationId: state.card.creationId, suggestedName: state.card.suggestedName })
const wiringNote = () => robo((state) => state.wiringNote?.text ?? null)
const snapshot = () => brick((state) => {
  const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
  return JSON.stringify(sortKeys(JSON.parse(JSON.stringify(state.getDocumentSnapshot()))))
})
const creations = () => robo((state) => state.model.creations.map((c) => ({
  id: c.id, name: c.name, kind: c.kind, testSpace: c.testSpace, bricks: c.brickIds.length, bodies: c.bodies.length, ready: c.lines?.ready ?? null,
  wheels: c.wheels.map((w) => ({ onAxle: w.onAxle, note: w.note })),
  motors: c.motors.map((m) => ({ name: m.name, axle: Boolean(m.axleId), wheels: m.wheelIds.length, port: m.port?.port ?? null })),
  sensors: c.sensors.map((s) => ({ name: s.name, facing: s.facing, port: s.port?.port ?? null })),
})))
const simState = () => robo((state) => {
  if (!state.sim) return null
  const poses = {}
  for (const [id, pose] of state.sim.mechanics.poses()) poses[id] = pose
  return { elapsed: state.sim.mechanics.elapsed, poses }
})
const bodyOf = (id) => robo((state, brickId) => state.sim?.mechanics.bodyOfBrick(brickId) ?? null, id)
const yawOf = (pose) => { const q = pose.rotation; return (Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y)) * 180) / Math.PI }
const STUD = 0.62
const PLATE = 0.18
const world = (x, y, z) => ({ x: (x - 32) * STUD, y: y * PLATE, z: (z - 32) * STUD })
/**
 * The rover is the checkpoint-1 pointer journey's rover moved 8 studs along x (ROVER_OFFSET_X/Z). At the home camera the
 * 6 × 8 plate's first ghost sits on the plate's centre, and the pointer journey's spot is under it: a tap there is
 * swallowed as a ghost grab (see the ghost findings). Moved over, the very first tap of the run is a clean
 * tap-to-position on open baseplate.
 */
const OX = Number(process.env.ROVER_OFFSET_X ?? 8)
const OZ = Number(process.env.ROVER_OFFSET_Z ?? 0)
const spot = (x, y, z) => world(x + OX, y, z + OZ)
const cell = (x, y, z) => ({ x: x + OX, y, z: z + OZ })

/** The armed ghost's box projected to the screen (studs × plates sizes for the journey's parts). */
const GHOST_SIZES = { plate_6x8: [6, 8, 1], robo_hub: [4, 4, 6], robo_motor: [3, 3, 6], robo_axle_short: [2, 1, 8], robo_wheel: [1, 3, 8], robo_distance_sensor: [2, 1, 3] }
async function ghostFootprint() {
  const ghost = await draft()
  if (!ghost) return null
  const [w, d, h] = GHOST_SIZES[ghost.partId] ?? [1, 1, 3]
  const rw = ghost.rotation % 2 ? d : w, rd = ghost.rotation % 2 ? w : d
  const corners = []
  for (const dx of [0, rw]) for (const dz of [0, rd]) for (const dy of [0, h]) corners.push(await screenOf(world(ghost.x + dx, ghost.y + dy, ghost.z + dz)))
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y)
  return { ghost, left: Math.round(Math.min(...xs)), right: Math.round(Math.max(...xs)), top: Math.round(Math.min(...ys)), bottom: Math.round(Math.max(...ys)) }
}

async function shot(name) {
  shotIndex += 1
  const file = path.join(out, `${String(shotIndex).padStart(2, '0')}-${name}.jpg`)
  await sim.deviceScreenshot(file, { maxSide: 1180 })
  console.log(`  shot ${path.basename(file)}`)
  return path.basename(file)
}

/** Records the layout, small targets and small text at a stage, with a screenshot. */
async function stage(name, extra = {}) {
  // One WebDriver command at a time: safaridriver serialises a session's commands anyway.
  const box = await layout()
  const small = await qa(() => window.__qa.smallTargets())
  const tiny = await qa(() => window.__qa.smallText())
  const file = await shot(name)
  stages.push({ name, shot: file, layout: box, smallTargets: small, smallText: tiny, ...extra })
  return box
}

/* ---------------------------------------------------------------- touch helpers */

/** Taps an element by touch after checking it is in view and on top. Returns the target record; `ok: false` when it could not be tapped. */
async function tapElement(spec, label, { required = true, scroll = true } = {}) {
  // Wait for the element to stop moving (a sheet sliding up, a panel growing): a student taps what has settled.
  let t = await target(spec)
  for (let settle = 0; settle < 12 && t.found; settle += 1) {
    await sleep(120)
    const again = await target(spec)
    const still = again.found && again.rect.x === t.rect.x && again.rect.y === t.rect.y && again.rect.width === t.rect.width && again.rect.height === t.rect.height
    t = again
    if (still) break
  }
  if (t.found && scroll && !t.inView) t = await scrollIntoViewByScript(spec, t)
  const small = t.found && (t.rect.width < 44 || t.rect.height < 44)
  const entry = { label, ...t }
  if (!t.found || !t.inView || !t.hit || t.disabled) {
    const why = !t.found ? 'not in the page' : t.disabled ? 'disabled' : !t.inView ? `outside the visible area (rect ${JSON.stringify(t.rect)})` : `covered by ${t.hitBy}`
    if (required) record(`tap:${label}`, false, `could not tap "${label}": ${why}`)
    else console.log(`  (skip ${label}: ${why})`)
    return { ok: false, why, ...entry }
  }
  await sim.tap(t.cx, t.cy)
  if (small) note('minor', `small-target:${label}`, `"${t.name}" is ${t.rect.width}×${t.rect.height} px (under 44) in ${t.surface}`)
  return { ok: true, ...entry }
}

/**
 * Brings an element that is inside a scrolled-away region into view. A touch drag over a natively scrolling region
 * (the drawer grid, an overflowing panel) wedges safaridriver's session on the simulator (the gesture returns, then
 * every later command times out until Safari is terminated), so the scroll a student would do with a finger is done
 * with `scrollIntoView` and recorded as "needed a scroll" instead of being driven.
 */
async function scrollIntoViewByScript(spec, first) {
  const info = await qa((s) => window.__qa.scrollInfo(s), spec)
  if (!info) return first
  await qa((s) => { window.__qa.find(s).scrollIntoView({ block: 'center', inline: 'center' }); return true }, spec)
  await sleep(350)
  const t = await target(spec)
  t.scrolledBy = [`${info.container} (scrolled by script; a finger would scroll ${Math.round(info.dy)} px)`]
  note('minor', `needs-scroll:${spec.css ?? spec.label ?? spec.text}`, `"${first.name}" was not in view: it needs a scroll of ${info.container} (${Math.round(info.dy)} px)`)
  return t
}

const PART_NAMES = { plate_6x8: '6 × 8 Plate', robo_hub: 'Hub', robo_motor: 'Motor', robo_axle_short: 'Short axle', robo_wheel: 'Wheel', robo_distance_sensor: 'Distance sensor' }
const CATEGORY = { plate_6x8: 'Plates', robo_hub: 'Robots', robo_motor: 'Robots', robo_axle_short: 'Robots', robo_wheel: 'Robots', robo_distance_sensor: 'Robots' }
const sheetOpen = () => qa(() => Boolean([...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('.part-grid'))))
const drawerVisible = () => qa(() => { const grid = document.querySelector('.part-grid'); if (!grid) return false; const r = grid.getBoundingClientRect(); return r.width > 0 && r.height > 0 })

/** Chooses a part as a touch student does: open the drawer if it is closed, tap the category, bring the part into view if needed, tap the part. */
async function choose(partId, { shotName } = {}) {
  if (!(await drawerVisible())) {
    const opened = await tapElement({ label: 'Open brick drawer' }, 'Open brick drawer (Bricks)')
    if (!opened.ok) return false
    await sleep(450)
  }
  const tab = await tapElement({ text: CATEGORY[partId], tag: '[role="tab"]' }, `${CATEGORY[partId]} category`)
  if (!tab.ok) return false
  await sleep(250)
  if (shotName) await stage(shotName)
  const part = await tapElement({ css: `.library-part[title="${PART_NAMES[partId]}"]` }, `${PART_NAMES[partId]} in the drawer`)
  if (!part.ok) return false
  await sleep(350)
  const armed = await draft()
  return record(`arm:${partId}`, armed?.partId === partId, `tapping "${PART_NAMES[partId]}" armed ${armed?.partId ?? 'nothing'}${part.scrolledBy ? ` (${part.scrolledBy.join(', ')})` : ''}; drawer sheet ${(await sheetOpen()) ? 'still open' : 'closed'}`)
}

/** Taps a world point on the canvas (positioning the ghost), after checking the canvas is what is under the finger there. */
async function tapWorld(point, label, { double = false } = {}) {
  const at = await screenOf(point)
  const under = await qa((x, y) => window.__qa.canvasAt(x, y), at.x, at.y)
  const inViewport = at.x >= 0 && at.y >= 0 && at.x <= (await qa(() => innerWidth)) && at.y <= (await qa(() => innerHeight))
  if (!at.inFront || !inViewport || !under.onCanvas) {
    record(`aim:${label}`, false, `${label}: the spot at (${Math.round(at.x)}, ${Math.round(at.y)}) is ${!at.inFront ? 'behind the camera' : !inViewport ? 'off screen' : `under ${under.by}`}`)
    return { ok: false, at, under }
  }
  // How big one stud is on screen at that spot: the aiming precision a finger needs there (the simulator's taps are exact).
  const across = await screenOf({ x: point.x + STUD, y: point.y, z: point.z })
  const deep = await screenOf({ x: point.x, y: point.y, z: point.z + STUD })
  const studPx = Math.round(Math.max(Math.hypot(across.x - at.x, across.y - at.y), Math.hypot(deep.x - at.x, deep.y - at.y)))
  aimSizes.push({ step: label, studPx })
  if (double) await sim.doubleTap(at.x, at.y)
  else await sim.tap(at.x, at.y)
  await sleep(300)
  return { ok: true, at, studPx }
}

/**
 * One placement by touch: choose in the drawer, tap Rotate `rotation` times, tap the spot (the ghost goes there
 * or snaps onto the connector under it), then confirm with the strip's Place button or with a double tap.
 */
async function placeByTouch({ partId, point, rotation = 0, expect, note: label, confirm = 'place', drawerShot, beforeAim }) {
  const name = label ?? `${PART_NAMES[partId]} at ${expect.x},${expect.y},${expect.z}`
  if (!(await choose(partId, { shotName: drawerShot }))) return null
  for (let turn = 0; turn < rotation; turn += 1) {
    const rotated = await tapElement({ label: 'Rotate', within: '[data-testid="command-strip"]' }, 'Rotate (command strip)')
    if (!rotated.ok) return null
    await sleep(150)
  }
  if (beforeAim) await beforeAim()
  const countBefore = await brickCount()
  if (confirm === 'doubleTap') {
    const tapped = await tapWorld(point, name, { double: true })
    if (!tapped.ok) return null
    await sleep(250)
    const placed = await lastBrick()
    const ok = (await brickCount()) === countBefore + 1 && placed.x === expect.x && placed.y === expect.y && placed.z === expect.z
    record(`double-tap-place:${name}`, ok, `${name}: double tap at (${Math.round(tapped.at.x)}, ${Math.round(tapped.at.y)}) ${(await brickCount()) === countBefore + 1 ? `placed ${placed.partId} at ${placed.x},${placed.y},${placed.z} r${placed.rotation}` : 'placed nothing'}`)
    return ok ? placed : null
  }
  const ghostBefore = await draft()
  const tapped = await tapWorld(point, name)
  if (!tapped.ok) return null
  let ghost = await draft()
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.z === b.z && a.rotation === b.rotation
  const wanted = { ...expect, rotation: expect.rotation ?? rotation }
  let how = 'one tap'
  if (same(ghost, ghostBefore) && !same(ghost, wanted)) {
    // The tap did nothing: the spot is on the ghost (or within its 24 px slop), where a touch grabs the ghost
    // instead of positioning it. The onboarding's answer is "Drag the preview to adjust it": press on the ghost and
    // drag; the ghost rides 44 px above the finger, so the finger ends 44 px below the spot (aimed by eye).
    swallowedTaps.push({ step: name, at: [Math.round(tapped.at.x), Math.round(tapped.at.y)], ghost: ghostBefore })
    note('major', `tap-on-ghost:${name}`, `${name}: the tap at (${Math.round(tapped.at.x)}, ${Math.round(tapped.at.y)}) landed on the ${PART_NAMES[partId]} ghost's own footprint (at ${ghostBefore.x},${ghostBefore.y},${ghostBefore.z}) and did nothing; dragging the ghost instead`)
    const route = Array.from({ length: 6 }, (_, i) => ({ x: tapped.at.x, y: tapped.at.y + ((i + 1) * 44) / 6 }))
    await sim.drag([{ x: tapped.at.x, y: tapped.at.y }, ...route], { stepMs: 60 })
    await sleep(300)
    ghost = await draft()
    how = 'tap swallowed by the ghost, then a drag of the ghost'
  }
  const ghostOk = same(ghost, wanted)
  record(`ghost:${name}`, ghostOk, `${name}: ${how} at (${Math.round(tapped.at.x)}, ${Math.round(tapped.at.y)}; one stud there is ${tapped.studPx} px) put the ghost at ${ghost ? `${ghost.x},${ghost.y},${ghost.z} r${ghost.rotation}` : 'none'} (wanted ${wanted.x},${wanted.y},${wanted.z} r${wanted.rotation}); nothing placed yet: ${(await brickCount()) === countBefore}`, { how })
  if (!ghostOk) return null // a student would not confirm a ghost in the wrong place; the step is recorded as failed
  const placeButton = await tapElement({ label: { regex: '^Place (positioned brick|brick)$' }, within: '[data-testid="command-strip"]' }, 'Place (command strip)')
  if (!placeButton.ok) return null
  await sleep(300)
  const placed = await lastBrick()
  const ok = (await brickCount()) === countBefore + 1 && placed.x === expect.x && placed.y === expect.y && placed.z === expect.z
  record(`placed:${name}`, ok, `${name}: Place ${(await brickCount()) === countBefore + 1 ? `placed ${placed.partId} at ${placed.x},${placed.y},${placed.z} r${placed.rotation}` : 'placed nothing'}`)
  return ok ? placed : null
}

/* ---------------------------------------------------------------- run */

let exitCode = 0
try {
  await sim.navigate(`${origin}/build`)
  await sim.exec((onboardingKey, projectKey) => { localStorage.setItem(onboardingKey, 'dismissed'); localStorage.removeItem(projectKey); return true }, ONBOARDING_KEY, PROJECT_KEY)
  await sim.navigate(`${origin}/build?t=${Date.now()}`)
  await sim.waitFor(() => Boolean(window.__robotics?.project && window.__robotics?.brickStore && document.querySelector('canvas')), { timeout: 45_000 })
  await sim.exec(installQa)
  const env = await sim.exec(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
    coarse: matchMedia('(pointer: coarse)').matches, anyFine: matchMedia('(any-pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches,
    compact: document.querySelector('.brick-studio')?.classList.contains('brick-compact-layout') ?? null,
  }))
  const orientation = env.width > env.height ? 'landscape' : 'portrait'
  out = process.env.UI_OUTPUT || path.join('docs/qa/robotics-cp3/touch', orientation)
  await mkdir(out, { recursive: true })
  console.log(`\n${device.name} (${device.udid}) · Safari ${sim.capabilities?.browserVersion} · ${orientation} ${env.width}×${env.height} @${env.dpr}x · compact layout ${env.compact}`)
  record('env:touch-device', env.coarse && !env.hover && env.maxTouchPoints > 0, `the page sees a touch device: pointer coarse ${env.coarse}, hover ${env.hover}, maxTouchPoints ${env.maxTouchPoints}; user agent says "${env.userAgent.match(/\(([^)]+)\)/)?.[1]}"`)
  if (/Macintosh/.test(env.userAgent)) note('info', 'ua-desktop', 'iPadOS Safari reports a Macintosh user agent; only pointer/hover media queries and maxTouchPoints reveal the tablet. Any UA sniffing would treat it as a desktop.')

  // Setup (store writes, not student actions): an empty build and the home camera.
  await brick((state) => state.newBuild())
  await brick((state) => state.requestView('home'))
  await sleep(900)
  await stage('start')

  /* 0. The camera by touch: a one-finger drag on open canvas orbits and the page itself does not move. */
  console.log('\n0. Camera by touch')
  const cameraProbe = () => qa(() => {
    const a = window.__robotics.project({ x: 0, y: 0, z: 0 }); const b = window.__robotics.project({ x: 3, y: 0, z: 0 })
    return { axis: [Math.round(b.x - a.x), Math.round(b.y - a.y)], scale: window.visualViewport?.scale ?? 1, scrollY: window.scrollY }
  })
  const camBefore = await cameraProbe()
  const lane = Math.round(env.height * 0.8)
  await sim.drag([0, 1, 2, 3, 4, 5].map((i) => ({ x: 260 + i * 40, y: lane })), { stepMs: 50 })
  await sleep(500)
  const camAfter = await cameraProbe()
  record('camera:one-finger-orbit', (camAfter.axis[0] !== camBefore.axis[0] || camAfter.axis[1] !== camBefore.axis[1]) && camAfter.scale === 1 && camAfter.scrollY === 0, `a one-finger drag across open canvas turned the view (a 3-unit x axis went from ${camBefore.axis} px to ${camAfter.axis} px on screen); page scale ${camAfter.scale}, scrollY ${camAfter.scrollY}`)
  await brick((state) => state.requestView('home'))
  await sleep(900)

  /* 1. Proof: arm a brick by tap in the drawer, tap the plate to position the ghost, tap Place. */
  console.log('\n1. Proof of touch: arm, position, Place')
  const ids = {}
  await qa(() => { window.__qa.events.length = 0; return true })
  const plate = await placeByTouch({
    partId: 'plate_6x8', point: spot(31, 0, 30), expect: cell(28, 0, 26), note: '6 × 8 plate on the baseplate', drawerShot: 'drawer-plates',
    // Evidence for the ghost finding: the checkpoint-1 journey's plate spot (no offset) is under the plate's first ghost.
    beforeAim: async () => {
      const footprint = await ghostFootprint()
      const at = await screenOf(world(31, 0, 30))
      await sim.tap(at.x, at.y)
      await sleep(350)
      const after = await draft()
      const unchanged = after && footprint && after.x === footprint.ghost.x && after.z === footprint.ghost.z
      record('ghost-tap:swallowed-evidence', true, `with the plate armed, its ghost at ${footprint.ghost.x},${footprint.ghost.y},${footprint.ghost.z} covers ${footprint.right - footprint.left}×${footprint.bottom - footprint.top} px on screen (x ${footprint.left}–${footprint.right}, y ${footprint.top}–${footprint.bottom}; 24 px slop around it). A tap at (${Math.round(at.x)}, ${Math.round(at.y)}), inside it, ${unchanged ? 'did nothing (swallowed as a ghost grab)' : `moved the ghost to ${after?.x},${after?.z}`}`)
      if (unchanged) {
        swallowedTaps.push({ step: 'plate at the checkpoint-1 spot', at: [Math.round(at.x), Math.round(at.y)], ghost: footprint.ghost, footprint })
        note('major', 'tap-on-ghost', `A tap on the armed ghost's own footprint (plus 24 px) is taken as a ghost grab and does nothing; only a drag moves it (with the ghost riding 44 px above the finger) or a double tap places it where it already is. The 6 × 8 plate's first ghost covers ${footprint.right - footprint.left}×${footprint.bottom - footprint.top} px at the home camera, right where a student taps to put the plate "a bit over". The rule is the app's (BrickStudioScene ghost grab), so Chrome touch emulation behaves the same: a design finding, not a WebKit one.`)
        await stage('tap-on-ghost-swallowed', { footprint })
      }
    },
  })
  ids.plate = plate?.id
  const events = await qa(() => window.__qa.events.slice())
  const touchDowns = events.filter((e) => e.type === 'pointerdown' && e.pointerType === 'touch').length
  const clickTypes = [...new Set(events.filter((e) => e.type === 'click').map((e) => e.pointerType || '(none)'))]
  record('proof:real-touch-events', touchDowns >= 4, `the page received ${touchDowns} pointerdown events with pointerType "touch" for the proof taps; click events arrived with pointerType ${clickTypes.join(', ')}`)
  if (clickTypes.includes('mouse')) note('risk', 'click-pointerType-mouse', 'In iPadOS Safari a tap\'s click event carries pointerType "mouse" (Chrome\'s touch emulation reports "touch"). The studio\'s mesh onClick handlers (Baseplate, BrickObject, instanced bricks) read click.pointerType to ignore touch taps, so in Safari they see a mouse click; only the canvas-level touch click guard (450 ms after a touch pointerup) keeps a first tap from placing. It held for every tap of this run. Emulation hides this.')
  await stage('plate-placed')

  /* 2. The hub: the card opens and is named. */
  console.log('\n2. Hub and the creation card')
  const hub = await placeByTouch({ partId: 'robo_hub', point: spot(31, 1, 29), expect: cell(29, 1, 27), note: 'Hub on the plate', drawerShot: 'drawer-robotics' })
  ids.hub = hub?.id
  await sleep(700)
  const card = await cardState()
  record('hub:card-opens', card?.creationId === null, `placing the hub opened the creation card: ${JSON.stringify(card)}`)
  await stage('hub-card')
  let named = false
  if (card) {
    const field = await tapElement({ css: '[data-testid="robotics-creation-card"] input[aria-label="Robot name"]' }, 'Robot name field (card)')
    if (field.ok) {
      await sleep(900)
      const focus = await qa(() => ({ focused: document.activeElement?.getAttribute('aria-label'), visual: window.visualViewport ? { height: Math.round(visualViewport.height), offsetTop: Math.round(visualViewport.offsetTop) } : null, scale: window.visualViewport?.scale ?? null, innerHeight }))
      record('card:name-focus-by-tap', focus.focused === 'Robot name', `a tap focused the name field (${focus.focused}); visual viewport ${JSON.stringify(focus.visual)} of ${focus.innerHeight} (scale ${focus.scale})`)
      await stage('card-name-focused', { focus })
      const fieldCss = '[data-testid="robotics-creation-card"] input[aria-label="Robot name"]'
      const fieldFont = await qa((css) => getComputedStyle(document.querySelector(css)).fontSize, fieldCss)
      if (parseFloat(fieldFont) < 16) note('major', 'card-name-font', `the card's name field renders at ${fieldFont} (robotics.css declares 15px, but \`font: 900 15px/1.2 inherit\` is an invalid shorthand and is dropped); under 16 px also makes iPhone Safari zoom the page on focus`)
      // Typing: WebDriver Element Send Keys first (keyboard input as WebKit's automation sends it).
      const element = await sim.findElement(fieldCss)
      await qa((css) => { document.querySelector(css).select(); return true }, fieldCss)
      await sim.sendKeys(element, 'Touch buggy')
      await sleep(250)
      let typed = await qa((css) => document.querySelector(css)?.value, fieldCss)
      if (typed !== 'Touch buggy') {
        // Safari 26.5 on the simulator dispatches keydown/keypress/keyup for automation keys but inserts no text
        // (no beforeinput/input), with or without the hardware keyboard; set the value the way an IME commit does.
        note('harness', 'typing-not-drivable', `WebDriver typing into the focused field fired key events but inserted no text (field still "${typed}"); the name was entered with a script-dispatched input event instead. The software keyboard was not exercised.`)
        typed = await qa((css, text) => { const input = document.querySelector(css); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text); input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); return input.value }, fieldCss, 'Touch buggy')
        await sleep(200)
      }
      record('card:name-entered', typed === 'Touch buggy', `the field reads "${typed}"`)
      await qa(() => { document.activeElement?.blur?.(); return true })
      await sleep(500)
    }
    const notNow = await tapElement({ text: 'Keep building', within: '[data-testid="robotics-creation-card"]' }, 'Keep building (card)')
    await sleep(400)
    const list = await creations()
    named = list[0]?.name === 'Touch buggy'
    record('card:named', notNow.ok && named && (await cardState()) === null, `after "Keep building" the card is ${(await cardState()) ? 'still open' : 'closed'} and the robot is named "${list[0]?.name}"`)
  }

  /* 3. Two motors, the second turned twice with Rotate. */
  console.log('\n3. Motors')
  const rightMotor = await placeByTouch({ partId: 'robo_motor', point: spot(32.5, 1, 32.5), expect: cell(31, 1, 31), note: 'First motor (right side)' })
  ids.rightMotor = rightMotor?.id
  const firstWiring = await wiringNote()
  record('motor1:wired-no-card', (await cardState()) === null && Boolean(firstWiring), `no card; wiring line: ${firstWiring}`)
  const leftMotor = await placeByTouch({
    partId: 'robo_motor', point: spot(29.5, 1, 32.5), rotation: 2, expect: cell(28, 1, 31), note: 'Second motor (left side, Rotate tapped twice, from the top view)',
    // From the framed 3D angle the second motor's spot is behind the first motor: tap it there first, as a student
    // would, and record where the ghost goes; then switch to the top view (as for the sensor below) and aim again.
    beforeAim: async () => {
      const at = await screenOf(spot(29.5, 1, 32.5))
      const under = await qa((x, y) => window.__qa.canvasAt(x, y), at.x, at.y)
      if (under.onCanvas) {
        await sim.tap(at.x, at.y)
        await sleep(350)
        const ghost = await draft()
        const hidden = !(ghost && ghost.x === cell(28, 1, 31).x && ghost.y === 1 && ghost.z === 31)
        record('motor2:spot-hidden-in-3d', true, `from the 3D view a tap on the second motor's spot at (${Math.round(at.x)}, ${Math.round(at.y)}) put the ghost at ${ghost ? `${ghost.x},${ghost.y},${ghost.z}` : 'none'}${hidden ? ' — not on the plate: the first motor is in the way' : ' — on the plate'}`)
        if (hidden) {
          note('major', 'occluded-spot', `From the framed 3D camera the second motor's spot on the plate is behind the first motor; a tap there lands on the first motor and the ghost goes to ${ghost?.x},${ghost?.y},${ghost?.z} (on top of it, shown red: "That placement overlaps…"). The student has to know to switch to the top view (the sensor's spot behind the hub needs the same).`)
          await stage('motor2-spot-hidden-in-3d')
        }
      }
      await tapElement({ label: 'Top view' }, 'Top view (camera)')
      await sleep(800)
    },
  })
  ids.leftMotor = leftMotor?.id
  await tapElement({ label: '3D view' }, '3D view (camera)')
  await sleep(800)
  const secondWiring = await wiringNote()
  record('motor2:wired-no-card', (await cardState()) === null && Boolean(secondWiring), `no card; wiring line: ${secondWiring}`)
  await stage('motors')

  /* 4. Axles: tap the motor with the axle armed; the ghost snaps into the socket. */
  console.log('\n4. Axles by tapping the motors')
  ids.leftAxle = (await placeByTouch({ partId: 'robo_axle_short', point: spot(29.5, 7, 32.5), expect: cell(26, 0, 32), note: 'Short axle snapped into the left motor (tap the motor)' }))?.id
  ids.rightAxle = (await placeByTouch({ partId: 'robo_axle_short', point: spot(32.5, 7, 32.5), expect: cell(34, 0, 32), note: 'Short axle snapped into the right motor (tap the motor)' }))?.id
  let rover = (await creations())[0]
  record('axles:in-sockets', rover?.motors.length === 2 && rover.motors.every((m) => m.axle), `motors report axles: ${JSON.stringify(rover?.motors.map((m) => m.axle))}`)
  await stage('axles')

  /* 5. Wheels: tap the axle end; one confirmed with Place, one with a double tap. */
  console.log('\n5. Wheels by tapping the axle ends')
  ids.leftWheel = (await placeByTouch({ partId: 'robo_wheel', point: spot(27, 4, 32.5), expect: cell(25, 0, 31), note: 'Wheel snapped onto the left axle end (tap, Place)' }))?.id
  ids.rightWheel = (await placeByTouch({ partId: 'robo_wheel', point: spot(35, 4, 32.5), expect: cell(36, 0, 31), note: 'Wheel snapped onto the right axle end (double tap)', confirm: 'doubleTap' }))?.id
  const zoom = await qa(() => ({ scale: window.visualViewport?.scale ?? null, studioTouchAction: getComputedStyle(document.querySelector('.brick-studio')).touchAction }))
  record('double-tap:no-page-zoom', zoom.scale === 1, `after the double tap the page scale is ${zoom.scale} (the studio root is touch-action ${zoom.studioTouchAction})`)
  if (!ids.rightWheel) {
    // The double tap did not place it where wanted: undo a wrong placement and fall back to tap + Place so the journey continues.
    const stray = await lastBrick()
    if (stray?.partId === 'robo_wheel' && stray.id !== ids.leftWheel) {
      await tapElement({ label: 'Undo' }, 'Undo (after the double tap)')
      await sleep(300)
    }
    ids.rightWheel = (await placeByTouch({ partId: 'robo_wheel', point: spot(35, 4, 32.5), expect: cell(36, 0, 31), note: 'Wheel snapped onto the right axle end (tap, Place; fallback)' }))?.id
  }
  await stage('wheels')

  /* 6. The sensor, from the top view (its spot is behind the hub from the home angle). */
  console.log('\n6. Sensor from the top view')
  await tapElement({ label: 'Top view' }, 'Top view (camera)')
  await sleep(800)
  ids.sensor = (await placeByTouch({ partId: 'robo_distance_sensor', point: spot(31, 1, 26.5), expect: cell(30, 1, 26), note: 'Distance sensor at the front edge (from the top view)' }))?.id
  const sensorWiring = await wiringNote()
  await tapElement({ label: '3D view' }, '3D view (camera)')
  await sleep(800)
  record('sensor:wired', Boolean(sensorWiring), `wiring line: ${sensorWiring}`)
  // Put the brush away, as a student does before testing.
  await tapElement({ label: 'Cancel', within: '[data-testid="command-strip"]' }, 'Cancel (put the brush away)', { required: false })
  await sleep(300)
  rover = (await creations())[0]
  record('rover:assembled', rover?.bricks === 9 && rover.bodies === 3 && rover.wheels.every((w) => w.onAxle) && rover.motors.every((m) => m.wheels === 1), `one creation "${rover?.name}" over ${rover?.bricks} bricks and ${rover?.bodies} bodies; wheels ${JSON.stringify(rover?.wheels)}; ready: ${rover?.ready}`)
  record('rover:card-never-reopened', (await cardState()) === null, 'the card stayed closed through seven more parts')
  const fonts = await qa(() => Object.fromEntries(['.robotics-name', '.robotics-chip', '.robotics-link-button', '.robotics-nudge-row .studio-button'].map((css) => {
    const el = document.querySelector(css); if (!el) return [css, null]
    const cs = getComputedStyle(el); return [css, { fontSize: cs.fontSize, fontWeight: cs.fontWeight, fontFamily: cs.fontFamily.slice(0, 40) }]
  })))
  record('fonts:robotics-shorthand', true, `computed fonts (robotics.css declares name 900 15px, chip 800 11.5px, link 900 12px via \`font: … inherit\`): ${JSON.stringify(fonts)}`)
  await stage('rover-built', { fonts })

  /* 7. Drive it: the panel's big Drive button, the on-screen joystick by one finger, Reset, Back to build. */
  console.log('\n7. Drive with the joystick, then Reset and Back to build')
  const before = await snapshot()
  const drive = await tapElement({ css: '[data-testid="robotics-play-button"]' }, 'Drive (panel)')
  if (drive.ok) {
    try { await sim.waitFor(() => Boolean(window.__robotics.stageStore.getState().stage), { timeout: 20_000 }) } catch { /* recorded below */ }
    await sleep(1200)
    await stage('drive-view')
    const stick = await qa(() => { const el = document.querySelector('[data-testid="robo-joystick"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, size: Math.round(r.width) } })
    const chassisAt = () => qa((plate) => { const stage = window.__robotics.stageStore.getState().stage; if (!stage) return null; const body = stage.controller.bodyOfBrick(plate); const pose = body ? stage.controller.poses().get(body) : null; return pose ? { x: pose.position.x, z: pose.position.z } : null }, ids.plate)
    const start = await chassisAt()
    record('drive:view-open', Boolean(stick && start), stick ? `the Drive view opened; the joystick is ${stick.size} px wide at (${Math.round(stick.x)}, ${Math.round(stick.y)})` : 'no joystick found')
    if (stick && start) {
      // One finger pushes the knob up 60 px and holds it there for about 1.5 s, then lifts.
      const up = { x: stick.x, y: stick.y - Math.min(60, stick.size / 2 - 8) }
      await sim.drag([{ x: stick.x, y: stick.y }, up, up, up], { stepMs: 500 })
      await sleep(300)
      const end = await chassisAt()
      const moved = end ? Math.hypot(end.x - start.x, end.z - start.z) / STUD : 0
      record('drive:joystick-drives', moved > 2, `one finger on the joystick drove the robot ${moved.toFixed(1)} studs`)
      await stage('driven-by-touch', { moved })
      const reset = await tapElement({ css: '[data-testid="robo-drive-reset"]' }, 'Reset (Drive view)')
      await sleep(600)
      const back = await chassisAt()
      record('drive:reset', reset.ok && Boolean(back) && Math.hypot(back.x - start.x, back.z - start.z) < 0.05, `after Reset the robot is ${back ? (Math.hypot(back.x - start.x, back.z - start.z) / STUD).toFixed(2) : '?'} studs from where it was built`)
    }
    const leave = await tapElement({ css: '[data-testid="robo-drive-back"]' }, 'Back to build (Drive view)')
    await sleep(600)
    record('drive:back-unchanged', leave.ok && (await qa(() => window.__robotics.driveView.getState().creationId)) === null && (await snapshot()) === before, `Back to build: the view is ${(await qa(() => window.__robotics.driveView.getState().creationId)) === null ? 'closed' : 'still open'}, document ${(await snapshot()) === before ? 'unchanged' : 'CHANGED'}`)
    await stage('back-to-build')
  }

  const failed = results.filter((r) => !r.ok)
  exitCode = failed.length ? 1 : 0
  const allSmall = new Map()
  for (const s of stages) for (const t of s.smallTargets) allSmall.set(`${t.surface}|${t.name}|${t.width}x${t.height}`, t)
  const allText = new Map()
  for (const s of stages) for (const t of s.smallText) allText.set(`${t.surface}|${t.size}|${t.text}`, t)
  await writeFile(path.join(out, 'results.json'), `${JSON.stringify({
    origin, at: new Date().toISOString(), orientation, device: { name: device.name, udid: device.udid, runtime: sim.capabilities?.['safari:platformVersion'], safari: sim.capabilities?.browserVersion },
    input: 'W3C touch actions through safaridriver to Safari on the iOS Simulator; tap points from element rects (DOM) and the studio\'s world→screen projection (canvas)',
    offset: { x: OX, z: OZ }, env, passed: results.length - failed.length, total: results.length, results, findings, swallowedTaps, aimSizes,
    smallTargets: [...allSmall.values()], smallText: [...allText.values()], stages,
  }, null, 2)}\n`)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; ${findings.length} findings; evidence in ${out}`)
} catch (error) {
  exitCode = 2
  console.error(error)
  if (out) await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, at: new Date().toISOString(), aborted: String(error?.stack ?? error), results, findings, stages }, null, 2)}\n`).catch(() => {})
} finally {
  const closed = await sim.close().then(() => true, () => false)
  // A wedged session keeps Safari paired and refuses the next one; quitting Safari frees it (closing a session quits
  // Safari anyway). The simulator itself stays booted.
  if (!closed || exitCode === 2) await sim.quitSafari().catch(() => {})
  if (driverChild) driverChild.kill()
}
process.exit(exitCode)
