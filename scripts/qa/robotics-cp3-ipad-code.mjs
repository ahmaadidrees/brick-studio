/**
 * Robot Workshop spike, checkpoint 3 (iPad QA lane): the Code view by real touch in iPadOS Safari on the iOS
 * Simulator, portrait.
 *
 * The rover is built from loose parts with the studio's own placement actions, as robotics-cp2-code.mjs does
 * (choosePart → rotate → setDraftPosition → placeDraft: assisted wiring and the creation card run as they do on a
 * tap; touch placement is proven by robotics-cp3-touch.mjs). The card's name field is focused by a tap and filled
 * by a script-dispatched input event (WebDriver typing inserts no text in Safari 26.5 on the simulator); "Not now"
 * is a tap. Everything after that is a finger: every tap, drag and hold is a W3C touch action sent through
 * safaridriver (`scripts/qa/lib/safari-ios.mjs`), so WebKit delivers touchstart / pointerdown(touch) / touchend
 * and its own click and focus timing, exactly as under a finger. The page is only read through execute-script:
 * the stores, `window.__robotics.codeWorkspace()` (where a block or field is on screen, as a student aims by eye),
 * `window.__robotics.project` (where the rover and the wall are), element rects and hit tests. The one exception
 * is the value typed into Blockly's "Change value" prompt, set the same way as the name (and said so).
 *
 * The journey: open Code from the creation panel; Run (the rover stops before the wall) and Reset; drag the
 * scripts to reach the 3, tap it, change it to 6 in the prompt, tap OK, run again; open the Motion palette, drag
 * a block into the script, drag it back out onto the rail to delete it, choose from a dropdown; "+" → Joystick
 * drive, Run, drive with the on-screen joystick and the Keys pad; Test plate / My world; Back to build. In portrait
 * it also checks the stacked layout (editor across the top, stage below, framing insets read that way), that a long
 * press on studio text selects nothing, and that no control sits in the bottom 16 px. At each
 * stage it records targets under 44 px, text under 13 px, what is cut off, whether the page scrolled or zoomed,
 * and a screenshot of the whole simulated screen (JPEG, 1 px per CSS px).
 *
 *   PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp3-ipad-code.mjs
 *
 * against `npx vite --mode robotics --port 5248 --strictPort --host 127.0.0.1` from this worktree.
 * Environment: UI_ORIGIN (default http://127.0.0.1:5248), SIM_UDID (default: the booted iPad), SAFARIDRIVER_PORT
 * (default 4471), UI_OUTPUT (default docs/qa/robotics-cp3/ipad-code). The run does not stop at the first failed
 * check: it records the failure and goes on where it still can.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { localOrigin } from './lib/env.mjs'
import { ONBOARDING_KEY, PROJECT_KEY } from './lib/ui.mjs'
import { SafariSimulator, bootedDevice, ensureSafariDriver } from './lib/safari-ios.mjs'

const origin = localOrigin('UI_ORIGIN', 'http://127.0.0.1:5248', 'the harness clears and rewrites the guest project')
const port = Number(process.env.SAFARIDRIVER_PORT || 4471)
const out = process.env.UI_OUTPUT || 'docs/qa/robotics-cp3/ipad-code'
await mkdir(out, { recursive: true })
const device = await bootedDevice(process.env.SIM_UDID)
const driverChild = await ensureSafariDriver(port)
const sim = await SafariSimulator.open({ port, udid: device.udid })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
const findings = []
const stages = []
const measured = {}
let shotIndex = 0
const record = (id, ok, detail, extra) => { results.push({ id, ok, detail, ...(extra ? { extra } : {}) }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); return ok }
const note = (severity, id, detail, extra) => { findings.push({ severity, id, detail, ...(extra ? { extra } : {}) }); console.log(`  ${severity.toUpperCase()} ${id} — ${detail}`) }

/* ---------------------------------------------------------------- page-side helpers */

/** Installed once per page load as `window.__qa`: element lookup, hit tests, layout, size audits, page scroll state, errors. */
function installQa() {
  const qa = { errors: [] }
  window.addEventListener('error', (event) => qa.errors.push(String(event.message)))
  window.addEventListener('unhandledrejection', (event) => qa.errors.push(`unhandled: ${String(event.reason)}`))
  const visible = (el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05
  }
  const describe = (el) => {
    if (!el) return 'nothing'
    const testid = el.getAttribute?.('data-testid'); const label = el.getAttribute?.('aria-label')
    const cls = el.getAttribute?.('class') ? `.${el.getAttribute('class').trim().split(/\s+/).slice(0, 2).join('.')}` : ''
    return `${el.tagName.toLowerCase()}${testid ? `[data-testid=${testid}]` : ''}${label ? `[aria-label="${label}"]` : ''}${cls}`
  }
  qa.SURFACES = {
    header: 'header[aria-label="Studio toolbar"]',
    panel: '[data-testid="robotics-panel"]',
    codeHead: '.robo-code-head',
    tabs: '.robo-tabs-row',
    starters: '[data-testid="robo-starters-menu"]',
    rail: '.robo-code-blockly .blocklyToolbox',
    palette: '.robo-code-blockly .blocklyFlyout',
    scripts: '.robo-code-blockly',
    zoom: '.robo-zoom',
    moreBlocks: '.robo-all-blocks',
    stageBar: '.robo-code-stagebar',
    readings: '.robo-code-readings',
    stageFoot: '.robo-code-stagefoot',
    goal: '.robo-code-goal',
    prompt: 'dialog.blocklyDialog',
    dropdown: '.blocklyDropDownDiv',
  }
  const surfaceOf = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      for (const [name, css] of Object.entries(qa.SURFACES)) if (node.matches?.(css)) return name
    }
    return el?.tagName === 'CANVAS' ? 'canvas' : describe(el)
  }
  qa.describe = describe
  qa.find = (spec) => {
    const root = spec.within ? document.querySelector(spec.within) : document
    if (!root) return null
    let list = []
    if (spec.css) list = [...root.querySelectorAll(spec.css)]
    else if (spec.label) list = [...root.querySelectorAll('[aria-label]')].filter((el) => el.getAttribute('aria-label') === spec.label)
    else if (spec.text) list = [...root.querySelectorAll(spec.tag ?? 'button, [role="tab"], [role="menuitem"]')].filter((el) => el.textContent.trim() === spec.text)
    return list.find(visible) ?? list[0] ?? null
  }
  /** Where to tap an element: the centre of its part inside the viewport and every clipping ancestor, and what is on top there. */
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
  qa.rect = (css) => { const el = document.querySelector(css); if (!el || !visible(el)) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }
  /** Rects of the visible surfaces and whether each sits inside the viewport (nothing under Safari's bars or off an edge). */
  qa.layout = () => {
    const rects = {}
    const outside = []
    for (const [name, css] of Object.entries(qa.SURFACES)) {
      const el = [...document.querySelectorAll(css)].find(visible)
      if (!el) continue
      const r = el.getBoundingClientRect()
      rects[name] = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
      if (r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) outside.push(name)
    }
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, rects, outside, page: qa.page() }
  }
  /** Interactive elements under 44 px on either side, per surface (Blockly's rail rows and menu items included). */
  qa.smallTargets = () => {
    const found = []
    const seen = new Set()
    for (const [surface, css] of Object.entries(qa.SURFACES)) {
      for (const root of [...document.querySelectorAll(css)].filter(visible)) {
        for (const el of root.querySelectorAll('button, input, select, textarea, [role="tab"], [role="button"], [role="slider"], [role="menuitem"], .blocklyToolboxCategory, .blocklyMenuItem')) {
          // Blockly's fields are SVG (their real targets are measured by fieldAudit); a file input is a hidden picker.
          if (!visible(el) || seen.has(el) || el.closest('svg') || el.type === 'file') continue
          seen.add(el)
          const r = el.getBoundingClientRect()
          if (r.width < 44 || r.height < 44) found.push({ surface, name: (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40), width: Math.round(r.width), height: Math.round(r.height) })
        }
      }
    }
    return found
  }
  /** Distinct HTML text under 13 px, per surface. */
  qa.smallText = () => {
    const found = []
    for (const [surface, css] of Object.entries(qa.SURFACES)) {
      if (surface === 'scripts' || surface === 'palette') continue
      for (const root of [...document.querySelectorAll(css)].filter(visible)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        const seen = new Set()
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent.trim(); const el = node.parentElement
          if (!text || !el || !visible(el) || el.closest('svg')) continue
          const size = parseFloat(getComputedStyle(el).fontSize)
          const key = `${size}|${text.slice(0, 40)}`
          if (size < 13 && !seen.has(key)) { seen.add(key); found.push({ surface, size, text: text.replace(/\s+/g, ' ').slice(0, 50) }) }
        }
      }
    }
    return found
  }
  qa.page = () => ({ scrollX: Math.round(scrollX), scrollY: Math.round(scrollY), docScrollTop: document.scrollingElement?.scrollTop ?? 0, bodyScrollTop: document.body.scrollTop, scale: window.visualViewport?.scale ?? 1, offsetTop: Math.round(window.visualViewport?.offsetTop ?? 0), offsetLeft: Math.round(window.visualViewport?.offsetLeft ?? 0) })

  /* Blockly, through the dev hook. */
  const ws = () => window.__robotics.codeWorkspace()
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 } }
  /** A block's outline (`.blocklyPath`), in the scripts or in the open palette. */
  qa.block = (query) => {
    const workspace = query.flyout ? ws().getToolbox().getFlyout().getWorkspace() : ws()
    const block = query.id ? workspace.getBlockById(query.id) : (query.all ? workspace.getAllBlocks(false) : workspace.getTopBlocks(true)).find((candidate) => candidate.type === query.type)
    if (!block) return null
    return { id: block.id, type: block.type, ...rectOf(block.getSvgRoot().querySelector('.blocklyPath')) }
  }
  qa.field = (blockId, name) => {
    const block = ws().getBlockById(blockId)
    const field = block?.getField(name)
    if (!field) return null
    return { value: field.getValue(), text: field.getText(), ...rectOf(field.getSvgRoot()) }
  }
  qa.wsState = () => {
    const workspace = ws(); const toolbox = workspace.getToolbox(); const flyout = toolbox.getFlyout(); const metrics = workspace.getMetricsManager()
    const host = document.querySelector('.robo-code-blockly').getBoundingClientRect()
    return {
      scale: workspace.scale, scrollX: Math.round(workspace.scrollX), scrollY: Math.round(workspace.scrollY),
      paletteOpen: flyout.isVisible(), paletteFloats: flyout.autoClose, category: toolbox.getSelectedItem()?.getName?.() ?? null,
      paletteWidth: flyout.isVisible() ? Math.round(document.querySelector('.robo-code-blockly .blocklyFlyout').getBoundingClientRect().width) : 0,
      scriptsLeft: Math.round(host.left + metrics.getAbsoluteMetrics().left), scriptsWidth: Math.round(metrics.getViewMetrics().width), hostRight: Math.round(host.right), hostTop: Math.round(host.top), hostBottom: Math.round(host.bottom),
      railWidth: Math.round(toolbox.getWidth()), rail: (() => { const r = document.querySelector('.robo-code-blockly .blocklyToolbox').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })(),
      categories: document.querySelectorAll('.robo-code-blockly .blocklyToolboxCategory').length,
      topBlocks: workspace.getTopBlocks(true).map((block) => ({ type: block.type, ...rectOf(block.getSvgRoot().querySelector('.blocklyPath')) })),
    }
  }
  /** Every editable field on the scripts: its size on screen (a finger's target) and the text size it renders at. */
  qa.fieldAudit = () => {
    const workspace = ws(); const list = []
    for (const block of workspace.getAllBlocks(false)) for (const input of block.inputList) for (const field of input.fieldRow) {
      if (!field.isClickable?.() || !field.getSvgRoot()) continue
      // A number sits in a round shadow block that is the whole target; other fields are their own box.
      const r = (block.isShadow() ? block.getSvgRoot().querySelector('.blocklyPath') : field.getSvgRoot()).getBoundingClientRect()
      list.push({ block: block.type, field: field.name, text: field.getText(), width: Math.round(r.width), height: Math.round(r.height) })
    }
    const text = document.querySelector('.robo-code-blockly .blocklyText')
    return { fields: list, blockTextPx: text ? Math.round(parseFloat(getComputedStyle(text).fontSize) * workspace.scale * 10) / 10 : null }
  }
  qa.observation = () => {
    const state = window.__robotics.stageStore.getState(); const o = state.stageObservation
    if (!o) return null
    const sensorId = Object.keys(o.sensors)[0]
    const chips = Object.fromEntries([...document.querySelectorAll('[data-testid=robo-readings] .robo-read')].map((chip) => [chip.querySelector('small').textContent, chip.querySelector('strong').textContent + (chip.querySelector('span:not(.robo-swatch)') ? ` (${chip.querySelector('span:not(.robo-swatch)').textContent})` : '')]))
    const poses = state.stage ? [...state.stage.controller.poses().entries()].map(([id, pose]) => ({ id, x: pose.position.x, y: pose.position.y, z: pose.position.z })) : []
    return {
      phase: o.phase, t: o.timeSeconds, speed: o.speedStudsPerSecond, distance: o.sensors[sensorId]?.distanceStuds ?? null, hit: o.sensors[sensorId]?.hit ?? null,
      motors: Object.values(o.motors).map((motor) => motor.powerPercent), chips, poses,
      status: document.querySelector('[data-testid=robo-status]')?.textContent ?? null, space: state.stage?.space ?? null,
    }
  }
  /** Starts sampling the run, the joystick and the page every 100 ms (for a gesture that is one WebDriver command). */
  qa.sample = () => {
    qa.samples = []
    clearInterval(qa.sampler)
    qa.sampler = setInterval(() => {
      const o = qa.observation()
      const stick = document.querySelector('[data-testid=robo-joystick]')
      const up = document.querySelector('[data-testid=robo-keypad] [aria-label="Up arrow"]')
      qa.samples.push({ t: o?.t ?? null, speed: o?.speed ?? null, distance: o?.distance ?? null, motors: o?.motors ?? [], stick: stick?.getAttribute('aria-valuetext') ?? null, upHeld: up ? up.getAttribute('aria-pressed') === 'true' : null, selection: document.getSelection()?.toString() ?? '', page: qa.page() })
    }, 100)
    return true
  }
  qa.stopSampling = () => { clearInterval(qa.sampler); return qa.samples }
  window.__qa = qa
  return true
}

const qa = (fn, ...args) => sim.exec(fn, ...args)
const target = (spec) => qa((s) => window.__qa.target(s), spec)
const page = () => qa(() => window.__qa.page())
const wsState = () => qa(() => window.__qa.wsState())
const observation = () => qa(() => window.__qa.observation())
const block = (query) => qa((q) => window.__qa.block(q), query)
const field = (id, name) => qa((i, n) => window.__qa.field(i, n), id, name)
const brick = (fn, arg) => qa((src, a) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.brickStore.getState(), a), fn.toString(), arg ?? null)
const robo = (fn, arg) => qa((src, a) => new Function('state', 'arg', `return (${src})(state, arg)`)(window.__robotics.roboticsStore.getState(), a), fn.toString(), arg ?? null)
const samePage = (a, b) => a.scrollX === b.scrollX && a.scrollY === b.scrollY && a.docScrollTop === b.docScrollTop && a.bodyScrollTop === b.bodyScrollTop && a.scale === b.scale && a.offsetTop === b.offsetTop && a.offsetLeft === b.offsetLeft
const pageStill = (samples, before) => samples.every((sample) => samePage(sample.page ?? sample, before))

async function shot(name) {
  shotIndex += 1
  const file = path.join(out, `${String(shotIndex).padStart(2, '0')}-${name}.jpg`)
  await sim.deviceScreenshot(file, { maxSide: 1180 })
  console.log(`  shot ${path.basename(file)}`)
  return path.basename(file)
}

/** Records the layout, small targets and small text at a stage, with a screenshot. */
async function stage(name, extra = {}) {
  const layout = await qa(() => window.__qa.layout())
  const small = await qa(() => window.__qa.smallTargets())
  const tiny = await qa(() => window.__qa.smallText())
  const file = await shot(name)
  stages.push({ name, shot: file, layout, smallTargets: small, smallText: tiny, ...extra })
  return layout
}

/** Taps an element by touch after checking it is in view and on top. */
async function tapElement(spec, label, { required = true } = {}) {
  let t = await target(spec)
  for (let settle = 0; settle < 12 && t.found; settle += 1) {
    await sleep(120)
    const again = await target(spec)
    const still = again.found && again.rect.x === t.rect.x && again.rect.y === t.rect.y && again.rect.width === t.rect.width && again.rect.height === t.rect.height
    t = again
    if (still) break
  }
  if (!t.found || !t.inView || !t.hit || t.disabled) {
    const why = !t.found ? 'not in the page' : t.disabled ? 'disabled' : !t.inView ? `outside the visible area (rect ${JSON.stringify(t.rect)})` : `covered by ${t.hitBy}`
    if (required) record(`tap:${label}`, false, `could not tap "${label}": ${why}`)
    return { ok: false, why, ...t }
  }
  await sim.tap(t.cx, t.cy)
  return { ok: true, ...t }
}

/** A one-finger drag through `points`, then a lift; `holdEnd` keeps the finger still before lifting. */
async function touchDrag(points, { stepMs = 40, holdEnd = 0 } = {}) {
  const [first, ...rest] = points
  await sim.gesture([
    { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(first.x), y: Math.round(first.y) },
    { type: 'pointerDown', button: 0 },
    ...rest.map((p) => ({ type: 'pointerMove', duration: stepMs, origin: 'viewport', x: Math.round(p.x), y: Math.round(p.y) })),
    ...(holdEnd ? [{ type: 'pause', duration: holdEnd }] : []),
    { type: 'pointerUp', button: 0 },
  ])
}
const line = (from, to, steps) => Array.from({ length: steps + 1 }, (_, i) => ({ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }))

/** Taps a rail row (Blockly category) by its label. */
async function tapRail(name) {
  const at = await qa((n) => { const row = [...document.querySelectorAll('.robo-code-blockly .blocklyToolboxCategory')].find((el) => el.textContent.trim() === n); if (!row) return null; const r = row.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: Math.round(r.width), height: Math.round(r.height), hit: Boolean(hit && row.contains(hit)) } }, name)
  if (!at?.hit) { record(`tap:rail:${name}`, false, `the "${name}" rail row is ${at ? 'covered' : 'missing'}`); return false }
  await sim.tap(at.x, at.y)
  await sleep(600)
  return true
}

/**
 * The stage's framing, planned and drawn: recomputes `framePoseInFreeArea` for the rover and the wall in the page
 * (dev server modules) and projects the same box through the pinhole of that pose and through the real camera.
 */
function framingProbe() {
  return (async () => {
    const [framing, bounds, plates] = await Promise.all([import('/src/robotics/scene/framing.ts'), import('/src/brick/bounds.ts'), import('/src/brick/buildPlate.ts')])
    const hook = window.__robotics; const state = hook.brickStore.getState()
    const creation = hook.roboticsStore.getState().model.creations[0]
    const ids = new Set(creation.brickIds)
    const wall = hook.stageStore.getState().stage.controller.props.find((prop) => prop.kind === 'wall')
    const points = []
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) points.push({ x: wall.center.x + sx * (wall.size.x / 2 + 0.4), y: wall.center.y + wall.size.y / 2, z: wall.center.z + sz * (wall.size.z / 2 + 0.4) })
    const box = framing.boundsWithPoints(bounds.getBuildBounds(state.bricks.filter((b) => ids.has(b.id)), plates.getBuildPlateSize(state.documentMetadata)), points)
    const canvas = document.querySelector('canvas'); const rect = canvas.getBoundingClientRect()
    const viewport = { width: canvas.clientWidth, height: canvas.clientHeight }
    const insets = framing.measureCanvasInsets(canvas)
    // The stage looks straight at the creation (slide = false) and shifts the image by viewOffsetFor (PanelViewOffset).
    const pose = framing.framePoseInFreeArea(box, 45, viewport, insets, 'home', null, false)
    const offset = framing.viewOffsetFor(viewport, insets)
    const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
    const norm = (v) => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l } }
    const f = norm(sub(pose.target, pose.position)); const r = norm({ x: -f.z, y: 0, z: f.x }); const u = { x: r.y * f.z - r.z * f.y, y: r.z * f.x - r.x * f.z, z: r.x * f.y - r.y * f.x }
    const planned = (p) => { const rel = sub(p, pose.position); const d = rel.x * f.x + rel.y * f.y + rel.z * f.z; const sx = rel.x * r.x + rel.y * r.y + rel.z * r.z; const sy = rel.x * u.x + rel.y * u.y + rel.z * u.z; const hh = d * Math.tan((22.5 * Math.PI) / 180); const hw = (hh * viewport.width) / viewport.height; return { x: rect.left + offset.x + viewport.width / 2 + (sx / hw) * (viewport.width / 2), y: rect.top + offset.y + viewport.height / 2 - (sy / hh) * (viewport.height / 2) } }
    const plannedX = [], drawnX = [], plannedY = [], drawnY = []
    for (const x of [box.min[0], box.max[0]]) for (const z of [box.min[2], box.max[2]]) for (const y of [box.min[1], box.max[1]]) { const a = planned({ x, y, z }); const b = hook.project({ x, y, z }); plannedX.push(a.x); drawnX.push(b.x); plannedY.push(a.y); drawnY.push(b.y) }
    const span = (list) => [Math.round(Math.min(...list)), Math.round(Math.max(...list))]
    const camera = hook.cameraDistance ? hook.cameraDistance() : null
    return { plannedDistance: Math.round(pose.distance * 10) / 10, cameraDistance: camera, insets, offset, plannedX: span(plannedX), drawnX: span(drawnX), plannedY: span(plannedY), drawnY: span(drawnY), scale: Math.round(((Math.max(...drawnX) - Math.min(...drawnX)) / (Math.max(...plannedX) - Math.min(...plannedX))) * 100) / 100, free: framing.freeArea(viewport, insets) }
  })()
}

/* ---------------------------------------------------------------- the rover */

const GREY = '#52636c'
async function place(part) {
  const id = await brick((state, p) => {
    state.choosePart(p.partId)
    for (let turn = 0; turn < (p.rotation ?? 0); turn += 1) state.rotate()
    if (p.color) state.setActiveColor(p.color)
    state.setDraftPosition(p.x, p.y, p.z)
    const placed = state.placeDraft()
    state.cancelInteraction()
    return placed ? window.__robotics.brickStore.getState().bricks.at(-1).id : null
  }, part)
  if (!id) throw new Error(`could not place ${part.partId} at ${part.x},${part.y},${part.z}`)
  await sleep(90)
  return id
}
const sortKeys = (value) => Array.isArray(value) ? value.map(sortKeys) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])])) : value
/** Bricks, cables, device names and creations (names and anchors; the run space is a run setting, read separately). */
const construction = async () => JSON.stringify(sortKeys(await brick((state) => {
  const section = state.documentMetadata.robotics ?? {}
  return JSON.parse(JSON.stringify({ bricks: state.bricks, connections: section.connections ?? [], devices: section.devices ?? {}, creations: (section.creations ?? []).map((c) => ({ id: c.id, name: c.name, anchorBrickIds: c.anchorBrickIds })) }))
})))
const programs = () => brick((state) => (state.documentMetadata.robotics?.programs ?? []).map((program) => ({ id: program.id, name: program.name, revision: program.revision, workspace: JSON.stringify(program.workspace) })))

/* ---------------------------------------------------------------- run */

let exitCode = 0
try {
  await sim.navigate(`${origin}/build`)
  await sim.exec((onboardingKey, projectKey) => { localStorage.setItem(onboardingKey, 'dismissed'); localStorage.removeItem(projectKey); return true }, ONBOARDING_KEY, PROJECT_KEY)
  await sim.navigate(`${origin}/build?t=${Date.now()}`)
  await sim.waitFor(() => Boolean(window.__robotics?.project && window.__robotics?.brickStore && window.__robotics?.stageStore && document.querySelector('canvas')), { timeout: 45_000 })
  await sim.exec(installQa)
  const env = await sim.exec(() => ({
    width: innerWidth, height: innerHeight, dpr: devicePixelRatio, screen: [screen.width, screen.height], userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints,
    coarse: matchMedia('(pointer: coarse)').matches, anyCoarse: matchMedia('(any-pointer: coarse)').matches, hover: matchMedia('(hover: hover)').matches,
    portrait: matchMedia('(orientation: portrait)').matches, compact: document.querySelector('.brick-studio')?.classList.contains('brick-compact-layout') ?? null,
  }))
  console.log(`\n${device.name} (${device.udid}) · Safari ${sim.capabilities?.browserVersion} · ${env.width}×${env.height} @${env.dpr}x · portrait ${env.portrait}`)
  record('env:touch-portrait', env.coarse && !env.hover && env.maxTouchPoints > 0 && env.portrait, `the page sees a touch device in portrait: pointer coarse ${env.coarse}, hover ${env.hover}, maxTouchPoints ${env.maxTouchPoints}, ${env.width}×${env.height} CSS px of a ${env.screen.join('×')} screen (Safari's bars take the rest)`)
  if (!env.portrait) note('info', 'orientation', 'The simulator is in landscape; this harness was written for portrait (landscape could not be driven non-interactively). Results are recorded as they come.')

  /* 0. The rover, through the store; the card is named by a tap on its field and closed with a tap on "Not now". */
  console.log('\n0. Build the rover (store placements) and name it')
  await brick((state) => state.newBuild())
  await sleep(200)
  const ids = {}
  ids.plate = await place({ partId: 'plate_6x8', x: 28, y: 0, z: 26, color: '#3e83d7' })
  ids.hub = await place({ partId: 'robo_hub', x: 29, y: 1, z: 27, color: '#f5eee0' })
  await sleep(400)
  const nameField = '[data-testid="robotics-creation-card"] input[aria-label="Creation name"]'
  const focusedName = await tapElement({ css: nameField }, 'Creation name field (card)')
  await sleep(500)
  const typedName = await qa((css, text) => { const input = document.querySelector(css); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text); input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); input.blur(); return input.value }, nameField, 'Mars buggy')
  await sleep(250)
  const notNow = await tapElement({ text: 'Not now', within: '[data-testid="robotics-creation-card"]' }, 'Not now (card)')
  await sleep(400)
  ids.leftMotor = await place({ partId: 'robo_motor', x: 28, y: 1, z: 31, rotation: 2, color: GREY })
  ids.rightMotor = await place({ partId: 'robo_motor', x: 31, y: 1, z: 31, color: GREY })
  ids.leftAxle = await place({ partId: 'robo_axle_short', x: 26, y: 0, z: 32, color: GREY })
  ids.rightAxle = await place({ partId: 'robo_axle_short', x: 34, y: 0, z: 32, color: GREY })
  ids.leftWheel = await place({ partId: 'robo_wheel', x: 25, y: 0, z: 31, color: '#1f2a33' })
  ids.rightWheel = await place({ partId: 'robo_wheel', x: 36, y: 0, z: 31, color: '#1f2a33' })
  ids.sensor = await place({ partId: 'robo_distance_sensor', x: 30, y: 1, z: 26, color: '#f4ca3a' })
  await robo((state, list) => { state.dismissWiringNote(); state.requestFrame(list); return true }, Object.values(ids))
  await sleep(900)
  const rover = (await robo((state) => state.model.creations.map((c) => ({ name: c.name, bricks: c.brickIds.length, ready: c.lines?.ready ?? null, sensors: c.sensors.map((s) => s.port?.port ?? null) }))))[0]
  record('build:rover-named', focusedName.ok && notNow.ok && typedName === 'Mars buggy' && rover?.name === 'Mars buggy' && rover.bricks === 9, `one creation "${rover?.name}" over ${rover?.bricks} bricks (${rover?.ready}); the name field was focused by a tap and filled by a script input event, "Not now" tapped`)
  const builtConstruction = await construction()
  const builtSpace = await robo((state) => state.model.creations[0].testSpace ?? null)
  await stage('build-panel')
  // A long press on studio text (the creation panel's first line) must not select it: iPadOS would raise its
  // Copy / Look Up / Translate callout over the panel. Text fields stay selectable.
  const panelLine = await target({ css: '[data-testid="robotics-panel"] .robotics-lines li' })
  if (panelLine.found && panelLine.hit) {
    await qa(() => { document.getSelection()?.removeAllRanges(); return true })
    await sim.gesture([
      { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(panelLine.cx), y: Math.round(panelLine.cy) },
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: 800 },
      { type: 'pointerUp', button: 0 },
    ])
    await sleep(700)
    const selectedText = await qa(() => { const text = document.getSelection()?.toString() ?? ''; document.getSelection()?.removeAllRanges(); return text })
    const fields = await qa(() => ({ studio: getComputedStyle(document.querySelector('.brick-studio')).webkitUserSelect, name: getComputedStyle(document.querySelector('[data-testid="robotics-panel"] input') ?? document.body).webkitUserSelect }))
    record('studio:long-press-selects-nothing', !selectedText && fields.studio === 'none' && fields.name === 'text', selectedText ? `a long press on "${panelLine.name}" selected "${selectedText}" (the studio's -webkit-user-select is ${fields.studio})` : `a 0.8 s press on "${panelLine.name.slice(0, 40)}…" selected nothing (studio -webkit-user-select ${fields.studio}; the panel's name field stays ${fields.name})`)
  }

  /* 1. Open Code from the creation panel. */
  console.log('\n1. Open the Code view by touch')
  const codeButton = await tapElement({ css: '[data-testid="robotics-code-button"]' }, 'Code (creation panel)')
  await sim.waitFor(() => Boolean(document.querySelector('.robo-code-blockly .blocklySvg')), { timeout: 30_000 })
  await sim.waitFor(() => { const s = window.__robotics.stageStore.getState(); return s.stage !== null && !s.stageLoading }, { timeout: 30_000 })
  await sleep(1200)
  record('open:code-button', codeButton.ok && codeButton.rect.height >= 44 && codeButton.rect.width >= 44, `tapped "Code" (${codeButton.rect?.width}×${codeButton.rect?.height} px) in the creation panel; the Code view opened`)
  let ws = await wsState()
  const goal = await qa(() => document.querySelector('[data-testid=robo-goal]')?.textContent ?? null)
  record('first-run:state', ws.topBlocks.length === 1 && !ws.paletteOpen && ws.category === null && ws.categories === 9 && goal === 'Try it: change 3 to 6. Does it stop earlier or later?', `first run: ${ws.topBlocks.length} script, palette ${ws.paletteOpen ? 'open' : 'collapsed'}, ${ws.categories} rail rows, goal "${goal}"`)
  const openLayout = await stage('code-first-run')
  const fieldAudit = await qa(() => window.__qa.fieldAudit())
  measured.firstRun = { workspace: { scale: ws.scale, scriptsLeft: ws.scriptsLeft, scriptsWidth: ws.scriptsWidth, script: ws.topBlocks[0] }, fields: fieldAudit, layout: openLayout }
  // Everything a finger needs on screen: the rail's nine rows, the stage's controls, the goal line.
  const railRows = await qa(() => [...document.querySelectorAll('.robo-code-blockly .blocklyToolboxCategory')].map((row) => { const r = row.getBoundingClientRect(); return { name: row.textContent.trim(), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) } }))
  const controls = {}
  for (const [name, spec] of Object.entries({ back: { css: '[data-testid=robo-back]' }, tab: { css: '[role=tab][aria-selected=true]' }, add: { label: 'New program' }, run: { css: '[data-testid=robo-run]' }, stop: { css: '[data-testid=robo-stop]' }, reset: { css: '[data-testid=robo-reset]' }, testPlate: { text: 'Test plate' }, myWorld: { text: 'My world' }, frame: { label: 'Frame the creation' }, zoomOut: { label: 'Zoom out' }, zoomIn: { label: 'Zoom in' }, recenter: { label: 'Back to the middle' }, moreBlocks: { css: '.robo-all-blocks' } })) {
    const t = await target(spec)
    controls[name] = { inView: t.inView, onTop: t.hit, hitBy: t.hitBy, width: t.rect?.width, height: t.rect?.height, bottomGap: t.rect ? env.height - (t.rect.y + t.rect.height) : null }
  }
  measured.firstRun.controls = controls
  measured.firstRun.railRows = railRows
  const blocked = Object.entries(controls).filter(([, c]) => !c.inView || !c.onTop).map(([name, c]) => `${name} (${c.hitBy ?? 'off screen'})`)
  const smallControls = Object.entries(controls).filter(([, c]) => c.width < 44 || c.height < 44).map(([name, c]) => `${name} ${c.width}×${c.height}`)
  record('first-run:controls-reachable', blocked.length === 0 && railRows.every((row) => row.bottom <= env.height && row.height >= 44), `every Code control is on screen and on top at the tap point${blocked.length ? `, except ${blocked.join(', ')}` : ''}; the nine rail rows end at y ${Math.max(...railRows.map((row) => row.bottom))} of ${env.height} (rows ${railRows[0].width}×${railRows[0].height})${smallControls.length ? `; under 44 px: ${smallControls.join(', ')}` : '; all at least 44 px'}`)
  const lowControls = Object.entries(controls).filter(([, c]) => c.bottomGap !== null && c.bottomGap < 16).map(([name, c]) => `${name} ${c.bottomGap} px`)
  record('first-run:controls-above-bottom-edge', lowControls.length === 0, lowControls.length ? `controls closer than 16 px to the bottom edge (the home-indicator swipe zone on an iPad): ${lowControls.join(', ')}` : `every control is at least 16 px above the bottom edge (closest: ${Math.min(...Object.values(controls).map((c) => c.bottomGap ?? Infinity))} px)`)
  // The portrait layout: the editor across the top, the stage (bar, readings, joystick, goal) below it over the canvas.
  const split = await qa(() => { const r = (css) => { const el = document.querySelector(css); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height), bottom: Math.round(b.bottom), right: Math.round(b.right) } }; return { editor: r('.robo-code-editor'), stage: r('.robo-code-stage'), canvas: r('canvas'), insets: window.__robotics.insets(), stacked: matchMedia('(orientation: portrait) and (max-width: 900px)').matches } })
  measured.split = split
  if (split.stacked) {
    const stackedOk = split.editor.x === 0 && split.editor.width === env.width && split.stage.x === 0 && split.stage.width === env.width && Math.abs(split.stage.y - split.editor.bottom) <= 1 && split.insets.top > split.editor.bottom - split.canvas.y && split.insets.left === 0
    record('layout:portrait-stacked', stackedOk, `portrait: the editor spans the top (${split.editor.width}×${split.editor.height} at y ${split.editor.y}) and the stage the bottom (${split.stage.width}×${split.stage.height} at y ${split.stage.y}); framing insets top ${Math.round(split.insets.top)}, left ${Math.round(split.insets.left)}, bottom ${Math.round(split.insets.bottom)} px`)
  }
  record('first-run:page-inside-viewport', openLayout.outside.length === 0 && openLayout.page.offsetTop === 0 && openLayout.page.scrollY === 0, `the Code view fits the ${env.width}×${env.height} Safari viewport (surfaces outside it: ${openLayout.outside.join(', ') || 'none'}); visual viewport offset ${openLayout.page.offsetTop}, page scroll ${openLayout.page.scrollY}: nothing sits under Safari's bars`)
  // The goal names the 3: is it on screen?
  const three = await field('stop-before-wall:studs', 'NUM')
  const threeOnScreen = three && three.x >= ws.scriptsLeft && three.x + three.width <= ws.hostRight && three.y >= ws.hostTop && three.y + three.height <= ws.hostBottom
  record('first-run:goal-number-on-screen', Boolean(threeOnScreen), `the goal says "change 3 to 6"; the 3 is at x ${Math.round(three?.x)}–${Math.round(three?.x + three?.width)} while the scripts area ends at x ${ws.hostRight} (script ${Math.round(ws.topBlocks[0].width)} px wide at scale ${ws.scale} in a ${ws.scriptsWidth} px scripts area)`)
  if (!threeOnScreen && ws.hostRight < env.width - 1) note('major', 'first-run-script-cut-off', `In portrait the editor is 480 px wide (\`--robo-editor-width: clamp(480px, 58vw, 900px)\`), so the scripts area is ${ws.scriptsWidth} px; the starter's "wait until … sees something closer than 3 studs" block is ${Math.round(ws.topBlocks[0].width)} px at the start scale ${ws.scale}. The 3 the goal line names starts at x ${Math.round(three?.x)}, past the editor's right edge (under the stage). A student has to know to drag the scripts sideways to find it.`)
  const wallView = async () => qa(() => {
    const hook = window.__robotics; const wall = hook.stageStore.getState().stage?.controller.props.find((prop) => prop.kind === 'wall')
    if (!wall) return null
    const xs = [], ys = []
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { const p = hook.project({ x: wall.center.x + (sx * wall.size.x) / 2, y: wall.center.y + (sy * wall.size.y) / 2, z: wall.center.z + (sz * wall.size.z) / 2 }); xs.push(p.x); ys.push(p.y) }
    const insets = hook.insets(); const canvas = document.querySelector('canvas').getBoundingClientRect()
    return { left: Math.round(Math.min(...xs)), right: Math.round(Math.max(...xs)), top: Math.round(Math.min(...ys)), bottom: Math.round(Math.max(...ys)), free: { left: Math.round(canvas.left + insets.left), right: Math.round(canvas.right - insets.right), top: Math.round(canvas.top + insets.top), bottom: Math.round(canvas.bottom - insets.bottom) } }
  })
  const wall = await wallView()
  const wallFramed = wall && wall.left >= wall.free.left - 2 && wall.right <= wall.free.right + 2 && wall.top >= wall.free.top - 2 && wall.bottom <= wall.free.bottom + 2
  record('stage:wall-framed', Boolean(wallFramed), `the test plate's wall spans x ${wall?.left}–${wall?.right}, y ${wall?.top}–${wall?.bottom} on screen; the stage's free area is x ${wall?.free.left}–${wall?.free.right}, y ${wall?.free.top}–${wall?.free.bottom}`)
  const framingPlan = await qa(framingProbe).catch((error) => ({ error: String(error) }))
  measured.framing = { wall, plan: framingPlan }
  if (!wallFramed) note('major', 'stage-framing-clamped', `The wall runs off the stage's right edge (to x ${wall?.right} on an ${env.width} px screen). Recomputed in the page, framePoseInFreeArea plans a camera ${framingPlan.plannedDistance} units away so the rover and the wall fit the ${Math.round(framingPlan.free?.width)}×${Math.round(framingPlan.free?.height)} px free area (their box at x ${framingPlan.plannedX?.join('–')}), but the real camera draws that box at x ${framingPlan.drawnX?.join('–')}: ${framingPlan.scale}× the planned size. The studio's orbit camera caps its distance at max(64, 2 × the build's frame distance) (getBuildCameraLimits via BrickStudioScene's OrbitControls maxDistance), so a pose further away than that is pulled in.`)

  /* 2. Run: it stops before the wall; the readings follow. Reset. */
  console.log('\n2. Run and Reset by touch')
  const barBefore = { reset: (await target({ css: '[data-testid=robo-reset]' })).rect, seg: (await target({ text: 'My world' })).rect, readings: await qa(() => window.__qa.rect('.robo-code-readings')) }
  const runTap = await tapElement({ css: '[data-testid=robo-run]' }, 'Run')
  const trace = []
  let restObs = null
  let runningShot = false
  let barDuring = null
  const t0 = Date.now()
  while (runTap.ok && Date.now() - t0 < 15_000) {
    const o = await observation()
    trace.push({ t: o.t, distance: o.distance, speed: o.speed, chip: o.chips['Front sensor'] })
    if (!runningShot && o.t > 0.9) {
      barDuring = { reset: (await target({ css: '[data-testid=robo-reset]' })).rect, seg: (await target({ text: 'My world' })).rect, readings: await qa(() => window.__qa.rect('.robo-code-readings')), status: o.status }
      await stage('running'); runningShot = true
    }
    if (o.t > 1 && Math.abs(o.speed) < 0.02 && o.distance < 6) break
    await sleep(200)
  }
  await sleep(600)
  restObs = await observation()
  measured.firstRunTrace = trace.map((entry) => `${entry.t.toFixed(2)}s d=${entry.distance?.toFixed(2)} v=${entry.speed.toFixed(2)} chip=${entry.chip}`)
  const minDistance = Math.min(...trace.map((entry) => entry.distance))
  record('run:drives-and-stops-before-wall', Boolean(runTap.ok && restObs && trace.some((entry) => entry.speed > 2) && restObs.hit && restObs.distance > 1.5 && restObs.distance < 3 && minDistance > 1.5), `tapped Run: top speed ${Math.max(...trace.map((entry) => entry.speed)).toFixed(2)} studs/s; at rest the sensor reads ${restObs?.distance?.toFixed(2)} studs (never under ${minDistance.toFixed(2)}): stopped before the wall`)
  record('run:readings-update', restObs?.chips['Front sensor'] === `${restObs?.distance?.toFixed(1)} studs` && restObs?.chips.Speed === `${restObs?.speed.toFixed(1)} st/s` && new Set(trace.map((entry) => entry.chip)).size > 5 && /^(Running|Done) ·/.test(restObs?.status ?? ''), `the Front sensor chip went through ${new Set(trace.map((entry) => entry.chip)).size} values (12.0 studs → ${restObs?.chips['Front sensor']}); Speed chip "${restObs?.chips.Speed}"; status "${restObs?.status}"`)
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  record('run:stage-bar-steady', Boolean(barDuring && same(barBefore.reset, barDuring.reset) && same(barBefore.seg, barDuring.seg) && barBefore.readings?.y === barDuring.readings?.y), `while "${barDuring?.status}" shows, Reset stays at ${JSON.stringify(barDuring?.reset)} (was ${JSON.stringify(barBefore.reset)}), Test plate / My world at ${JSON.stringify(barDuring?.seg)} (was ${JSON.stringify(barBefore.seg)}), the readings start at y ${barDuring?.readings?.y} (was ${barBefore.readings?.y})`)
  measured.readingsHeight = { ready: barBefore.readings?.height, running: barDuring?.readings?.height }
  if (barDuring && barDuring.readings && barBefore.readings && barDuring.readings.height > barBefore.readings.height + 10) note('minor', 'readings-reflow', `In a ${barBefore.readings.width} px stage the reading chips reflow while running: the Motors chip widens ("40 · 40 %", "speed 33 · 35 %") and Speed drops to a second row, so the readings grow from ${barBefore.readings.height} to ${barDuring.readings.height} px over the stage (and shrink back on Reset).`)
  // Where the rover came to rest on screen: inside the stage area?
  const restOnScreen = await qa((plateId) => {
    const hook = window.__robotics; const state = hook.stageStore.getState(); const controller = state.stage.controller
    const body = controller.bodyOfBrick ? controller.bodyOfBrick(plateId) : null
    const pose = body ? controller.poses().get(body) : [...controller.poses().values()][0]
    const built = { x: (31 - 32) * 0.62, y: 0.5 * 0.18, z: (30 - 32) * 0.62 }
    const p = hook.project({ x: built.x + pose.position.x, y: built.y + pose.position.y, z: built.z + pose.position.z })
    const insets = hook.insets(); const canvas = document.querySelector('canvas').getBoundingClientRect()
    return { x: Math.round(p.x), y: Math.round(p.y), freeLeft: Math.round(canvas.left + insets.left), freeRight: Math.round(canvas.right - insets.right), freeTop: Math.round(canvas.top + insets.top), freeBottom: Math.round(canvas.bottom - insets.bottom) }
  }, ids.plate)
  const restInStage = restOnScreen.x >= restOnScreen.freeLeft && restOnScreen.x <= restOnScreen.freeRight && restOnScreen.y >= restOnScreen.freeTop && restOnScreen.y <= restOnScreen.freeBottom
  record('run:rover-in-view-at-rest', restInStage, `at rest the chassis centre is at (${restOnScreen.x}, ${restOnScreen.y}); the stage's free area is x ${restOnScreen.freeLeft}–${restOnScreen.freeRight}, y ${restOnScreen.freeTop}–${restOnScreen.freeBottom}`)
  await stage('stopped-before-wall', { restOnScreen })
  const resetTap = await tapElement({ css: '[data-testid=robo-reset]' }, 'Reset')
  await sleep(600)
  const afterReset = await observation()
  const drift = Math.max(...afterReset.poses.map((pose) => Math.hypot(pose.x, pose.z)))
  record('reset:built-pose', resetTap.ok && afterReset.phase === 'ready' && drift < 0.01 && Math.abs(afterReset.distance - 12) < 0.2 && afterReset.status === 'Ready', `tapped Reset: every body within ${drift.toFixed(4)} of its built pose, sensor ${afterReset.distance} studs, status "${afterReset.status}"`)

  /* 3. Edit by touch: reach the 3, change it to 6 in Blockly's prompt; a block in from the palette and out again; a dropdown. */
  console.log('\n3. Edit the program by touch')
  let pageBefore = await page()
  const scrollBefore = await wsState()
  const threeNow = await field('stop-before-wall:studs', 'NUM')
  // Drag the scripts' background left until the 3 has room (a finger on empty scripts, below the blocks).
  // Always at least 40 px, so the workspace drag itself is exercised even when the 3 is already in view.
  const need = Math.max(40, Math.round(threeNow.x + threeNow.width + 40 - scrollBefore.hostRight))
  const scriptBottom = Math.max(...scrollBefore.topBlocks.map((b) => b.y + b.height))
  const lane = { y: Math.round(Math.min(scriptBottom + 120, scrollBefore.hostBottom - 40)) }
  const laneX = Math.round(Math.min(scrollBefore.hostRight - 60, scrollBefore.scriptsLeft + need + 160))
  await touchDrag(line({ x: laneX, y: lane.y }, { x: laneX - need, y: lane.y }, 8), { stepMs: 45 })
  await sleep(500)
  const scrolled = await wsState()
  const threeReached = await field('stop-before-wall:studs', 'NUM')
  const pageAfterScroll = await page()
  record('edit:drag-scripts', (Math.abs(scrolled.scrollX - scrollBefore.scrollX - -need) < 12 && threeReached.x + threeReached.width <= scrolled.hostRight && samePage(pageBefore, pageAfterScroll)), `a one-finger drag of ${need} px on empty scripts moved them ${scrolled.scrollX - scrollBefore.scrollX} px; the 3 is now at x ${Math.round(threeReached.x)}–${Math.round(threeReached.x + threeReached.width)}; the page did ${samePage(pageBefore, pageAfterScroll) ? 'not' : ''} scroll or zoom (${JSON.stringify(pageAfterScroll)})`)
  await stage('scripts-dragged')
  await sim.tap(threeReached.cx, threeReached.cy)
  await sleep(800)
  const prompt = await qa(() => {
    const dialog = document.querySelector('dialog.blocklyDialog')
    if (!dialog) return null
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height), cx: b.x + b.width / 2, cy: b.y + b.height / 2 } }
    const input = dialog.querySelector('input')
    return { open: dialog.open, modal: dialog.matches(':modal'), label: dialog.querySelector('label')?.textContent, rect: r(dialog), input: { ...r(input), value: input.value, type: input.type, inputmode: input.getAttribute('inputmode'), fontSize: getComputedStyle(input).fontSize, focused: document.activeElement === input }, ok: r(dialog.querySelector('.blocklyDialogConfirmButton')), cancel: r(dialog.querySelector('.blocklyDialogCancelButton')) }
  })
  measured.prompt = prompt
  const threeBlock = await block({ id: 'stop-before-wall:studs' })
  record('edit:tap-number-opens-prompt', Boolean(prompt?.open && prompt.input.value === '3'), `tapping the 3 (its round block is ${Math.round(threeBlock?.width)}×${Math.round(threeBlock?.height)} px on screen) opened Blockly's own ${prompt?.modal ? 'modal ' : ''}"${prompt?.label}" prompt (on a touch device Blockly edits numbers in a <dialog>, not in place): input ${prompt?.input.width}×${prompt?.input.height} (${prompt?.input.fontSize}, type ${prompt?.input.type}, inputmode ${prompt?.input.inputmode}), OK ${prompt?.ok.width}×${prompt?.ok.height}, Cancel ${prompt?.cancel.width}×${prompt?.cancel.height}`)
  record('edit:prompt-targets-44', Boolean(prompt && prompt.input.height >= 44 && prompt.ok.height >= 44 && prompt.cancel.height >= 44 && prompt.ok.width >= 44), `the prompt's input, OK and Cancel are ${prompt?.input.height}, ${prompt?.ok.height} and ${prompt?.cancel.height} px tall`)
  await stage('change-value-prompt', { prompt })
  const revisionBefore = (await programs())[0].revision
  let typed = null
  if (prompt) {
    const element = await sim.findElement('dialog.blocklyDialog input')
    await qa(() => { document.querySelector('dialog.blocklyDialog input').select(); return true })
    await sim.sendKeys(element, '6').catch(() => {})
    await sleep(250)
    typed = await qa(() => document.querySelector('dialog.blocklyDialog input')?.value)
    if (typed !== '6') {
      note('harness', 'prompt-typing-not-drivable', `WebDriver typing into the focused prompt fired key events but inserted no text (still "${typed}"); the 6 was entered with a script-dispatched input event, then OK was tapped. The software keyboard was not exercised (the simulator has a hardware keyboard connected).`)
      await qa(() => { const input = document.querySelector('dialog.blocklyDialog input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '6'); input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '6' })); return input.value })
    }
    await sim.tap(prompt.ok.cx, prompt.ok.cy)
    await sleep(900)
  }
  const edited = await field('stop-before-wall:studs', 'NUM')
  const savedAfterEdit = (await programs())[0]
  record('edit:number-saved', edited?.value === 6 && savedAfterEdit.workspace.includes('"NUM":6') && savedAfterEdit.revision === revisionBefore + 1 && !(await qa(() => Boolean(document.querySelector('dialog.blocklyDialog')))), `after OK the field reads ${edited?.value}; saved as revision ${savedAfterEdit.revision} (was ${revisionBefore}); the prompt closed`)
  await tapElement({ css: '[data-testid=robo-run]' }, 'Run (with 6)')
  try { await sim.waitFor(() => { const o = window.__robotics.stageStore.getState().stageObservation; return o && o.timeSeconds > 1 && Math.abs(o.speedStudsPerSecond) < 0.02 }, { timeout: 15_000 }) } catch { /* recorded below */ }
  await sleep(500)
  const withSix = await observation()
  measured.stopsAt = { with3: restObs?.distance, with6: withSix?.distance }
  record('edit:stops-earlier', withSix?.distance > 4.5 && withSix?.distance < 6, `with 6 the rover rests ${withSix?.distance?.toFixed(2)} studs from the wall (with 3: ${restObs?.distance?.toFixed(2)})`)
  await stage('stops-earlier')
  await tapElement({ css: '[data-testid=robo-reset]' }, 'Reset (after 6)')
  await sleep(500)
  // Put the scripts back where Code opened them, as "Back to the middle" does.
  await tapElement({ label: 'Back to the middle' }, 'Back to the middle (zoom cluster)')
  await sleep(500)

  // The palette: tap Motion on the rail.
  pageBefore = await page()
  const beforePalette = await wsState()
  await tapRail('Motion')
  const motion = await wsState()
  record('palette:opens-over-scripts', motion.paletteOpen && motion.category === 'Motion' && motion.scriptsWidth === beforePalette.scriptsWidth && Math.round(motion.topBlocks[0].x) === Math.round(beforePalette.topBlocks[0].x), `tapping Motion opened a ${motion.paletteWidth} px palette ${motion.paletteFloats ? 'over' : 'beside'} the scripts; the scripts area stays ${motion.scriptsWidth} px (was ${beforePalette.scriptsWidth}) and the script stays at x ${Math.round(motion.topBlocks[0].x)}`)
  await stage('palette-motion')
  await tapRail('Motion')
  const closedByTap = await wsState()
  record('palette:tap-again-closes', !closedByTap.paletteOpen && closedByTap.category === null && closedByTap.scriptsWidth === beforePalette.scriptsWidth, `tapping Motion again closed the palette (open: ${closedByTap.paletteOpen}); the scripts area is ${closedByTap.scriptsWidth} px`)
  await tapRail('Motion')
  // Drag "stop Left motor · A" out of the palette and under "stop motors".
  let source = await block({ flyout: true, type: 'robo_stop_motor' })
  // The palette is taller than a short (stacked) editor at a finger's scale: when the block is below the palette's
  // visible part, scroll the palette the way a student does, with a vertical drag on its empty right-hand side.
  let paletteScroll = 0
  const paletteBox = await qa(() => { const flyout = document.querySelector('.robo-code-blockly .blocklyFlyout').getBoundingClientRect(); const host = document.querySelector('.robo-code-blockly').getBoundingClientRect(); return { x: flyout.x, right: flyout.right, top: Math.max(flyout.top, host.top), bottom: Math.min(flyout.bottom, host.bottom) } })
  if (source && source.y + source.height > paletteBox.bottom - 24) {
    paletteScroll = Math.round(source.y + source.height - paletteBox.bottom + 60)
    // A spot on the palette's own background (not a block, not its scrollbar), low enough to drag up from.
    const spot = await qa((box, need) => {
      for (let y = Math.round(box.bottom - 30); y > box.top + need; y -= 6) {
        for (let x = Math.round(box.right - 40); x > box.x + 40; x -= 8) {
          if (document.elementFromPoint(x, y)?.classList.contains('blocklyFlyoutBackground')) return { x, y }
        }
      }
      return null
    }, paletteBox, paletteScroll)
    if (spot) await touchDrag(line(spot, { x: spot.x, y: spot.y - paletteScroll }, 8), { stepMs: 45 })
    await sleep(500)
    source = await block({ flyout: true, type: 'robo_stop_motor' })
  }
  measured.paletteScroll = { box: paletteBox, scrolledBy: paletteScroll, sourceAfter: source && { y: Math.round(source.y), height: Math.round(source.height) } }
  const anchor = await block({ id: 'stop-before-wall:stop' })
  let dragIn = null
  if (source && anchor) {
    const grab = { x: source.x + 14, y: source.cy }
    const drop = { x: anchor.x + 18, y: anchor.y + anchor.height + source.height / 2 - 6 }
    const sideways = line(grab, { x: grab.x + 48, y: grab.y }, 4)
    await qa(() => window.__qa.sample())
    await touchDrag([...sideways, ...line(sideways.at(-1), drop, 12).slice(1)], { stepMs: 40 })
    await sleep(900)
    const samples = await qa(() => window.__qa.stopSampling())
    const added = await qa(() => { const found = window.__robotics.codeWorkspace().getAllBlocks(false).find((candidate) => candidate.type === 'robo_stop_motor'); return found ? { id: found.id, text: found.getField('MOTOR').getText(), under: found.getPreviousBlock()?.id ?? null } : null })
    await sleep(500)
    const saved = (await programs())[0]
    const after = await wsState()
    dragIn = { added, samples: samples.length, pageStill: pageStill(samples, pageBefore) }
    record('palette:drag-block-in', Boolean(added && added.under === 'stop-before-wall:stop' && saved.workspace.includes('"robo_stop_motor"') && !after.paletteOpen && pageStill(samples, pageBefore)), `${paletteScroll ? `the palette was scrolled ${paletteScroll} px by a vertical drag to reach its last block; ` : ''}a touch drag from the palette to under "stop motors" added "stop ${added?.text}" (snapped under ${added?.under}); saved (revision ${saved.revision}); the palette ${after.paletteOpen ? 'stayed open' : 'went back in as the drag began'}; the page ${pageStill(samples, pageBefore) ? 'never scrolled or zoomed' : 'DID scroll or zoom'} over ${samples.length} samples`)
    await stage('block-dragged-in')
    // Delete: drag it onto the rail.
    const addedRect = await block({ id: added?.id })
    if (addedRect) {
      const hitOk = await qa((x, y, id) => { const el = document.elementFromPoint(x, y); const group = el?.closest('.blocklyDraggable'); return group?.getAttribute('data-id') === id }, addedRect.x + 16, addedRect.cy, added.id)
      const railNow = (await wsState()).rail
      const railDrop = { x: Math.round(railNow.x + railNow.width / 2), y: Math.round(railNow.y + Math.min(railNow.height / 2, 200)) }
      await qa(() => window.__qa.sample())
      await touchDrag(line({ x: addedRect.x + 16, y: addedRect.cy }, railDrop, 12), { stepMs: 40, holdEnd: 250 })
      await sleep(900)
      const samplesOut = await qa(() => window.__qa.stopSampling())
      await sleep(500)
      const gone = !(await qa(() => window.__robotics.codeWorkspace().getAllBlocks(false).some((candidate) => candidate.type === 'robo_stop_motor')))
      const savedOut = (await programs())[0]
      record('palette:drag-block-out-deletes', gone && !savedOut.workspace.includes('"robo_stop_motor"') && pageStill(samplesOut, pageBefore), `a touch drag of that block (grabbed on the block: ${hitOk}) onto the rail deleted it; saved (revision ${savedOut.revision}); the page ${pageStill(samplesOut, pageBefore) ? 'never scrolled or zoomed' : 'DID scroll or zoom'}`)
      await stage('block-dragged-out')
    }
  } else record('palette:drag-block-in', false, `could not find ${source ? '' : 'the palette block'}${anchor ? '' : ' the script block'}`)
  measured.dragIn = dragIn
  // A dropdown: "forward ▾" → backward, then back to forward. A palette still open (a failed drag) is put away first.
  const openCategory = (await wsState()).category
  if (openCategory) await tapRail(openCategory)
  const direction = await field('stop-before-wall:drive', 'DIRECTION')
  let menu = null
  if (direction && direction.x >= (await wsState()).scriptsLeft) {
    await sim.tap(direction.cx, direction.cy)
    await sleep(700)
    menu = await qa(() => { const div = document.querySelector('.blocklyDropDownDiv'); const r = div.getBoundingClientRect(); return { shown: r.width > 0 && getComputedStyle(div).display !== 'none', items: [...div.querySelectorAll('.blocklyMenuItem')].map((item) => { const b = item.getBoundingClientRect(); return { text: item.textContent.trim(), width: Math.round(b.width), height: Math.round(b.height), cx: b.x + b.width / 2, cy: b.y + b.height / 2, fontSize: getComputedStyle(item).fontSize } }) } })
    await stage('dropdown-menu', { menu })
    const backward = menu.items.find((item) => item.text === 'backward')
    if (backward) { await sim.tap(backward.cx, backward.cy); await sleep(700) }
    const chosen = (await field('stop-before-wall:drive', 'DIRECTION'))?.value
    record('edit:dropdown-by-tap', menu.shown && chosen === 'backward', `tapping "forward ▾" (${Math.round(direction.width)}×${Math.round(direction.height)} px) opened a menu of ${menu.items.map((item) => `"${item.text}" ${item.width}×${item.height}`).join(', ')}; tapping "backward" set ${chosen}`)
    const again = await field('stop-before-wall:drive', 'DIRECTION')
    await sim.tap(again.cx, again.cy)
    await sleep(700)
    const forward = (await qa(() => [...document.querySelectorAll('.blocklyDropDownDiv .blocklyMenuItem')].map((item) => { const b = item.getBoundingClientRect(); return { text: item.textContent.trim(), cx: b.x + b.width / 2, cy: b.y + b.height / 2 } }))).find((item) => item.text === 'forward')
    if (forward) { await sim.tap(forward.cx, forward.cy); await sleep(700) }
  } else record('edit:dropdown-by-tap', false, `the "forward" dropdown is not on the scripts area (${JSON.stringify(direction)})`)
  measured.dropdown = menu
  // Double tap the tab: rename opens; a tap on the scripts leaves it as it was.
  const activeTab = await target({ css: '[role=tab][aria-selected=true]' })
  await sim.doubleTap(activeTab.rect.x + 40, activeTab.cy)
  await sleep(600)
  const renaming = await qa(() => { const input = document.querySelector('.robo-tab-rename'); return input ? { focused: document.activeElement === input, value: input.value, height: Math.round(input.getBoundingClientRect().height) } : null })
  const scriptsSpot = await wsState()
  await sim.tap(Math.round((scriptsSpot.scriptsLeft + scriptsSpot.hostRight) / 2), Math.round(scriptsSpot.hostBottom - 60))
  await sleep(500)
  const tabName = await qa(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent)
  record('tab:double-tap-rename', Boolean(renaming?.focused && renaming.value === 'Stop before the wall' && tabName === 'Stop before the wall' && (await page()).scale === 1), `a double tap on the tab opened its rename field (${renaming?.height} px tall, focused ${renaming?.focused}) without zooming the page; a tap on the scripts closed it, name kept ("${tabName}")`)
  measured.fieldsAfterEdit = await qa(() => window.__qa.fieldAudit())

  /* 4. "+" → Joystick drive; drive with the on-screen joystick and the Keys pad. */
  console.log('\n4. Joystick drive')
  // Leave the palette open while switching programs: the new program's script must still land in view.
  await tapRail('Motion')
  const addTap = await tapElement({ label: 'New program' }, '+ (New program)')
  await sleep(500)
  const starters = await qa(() => [...document.querySelectorAll('[data-testid=robo-starters-menu] [role=menuitem]')].map((item) => { const r = item.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { starter: item.dataset.starter, width: Math.round(r.width), height: Math.round(r.height), right: Math.round(r.right), onTop: Boolean(hit && item.contains(hit)) } }))
  await stage('starters-menu', { starters })
  const pick = await tapElement({ css: '[data-testid=robo-starters-menu] [data-starter="joystick-drive"]' }, 'Joystick drive (starters menu)')
  await sleep(1000)
  const tabs = await qa(() => [...document.querySelectorAll('[role=tab]')].map((tab) => `${tab.textContent}${tab.getAttribute('aria-selected') === 'true' ? ' (active)' : ''}`))
  ws = await wsState()
  const joyScript = ws.topBlocks[0]
  const scriptInView = joyScript && joyScript.x >= ws.scriptsLeft - 1 && joyScript.x + joyScript.width <= ws.hostRight
  record('program:joystick-drive-added', addTap.ok && pick.ok && tabs.join(' | ') === 'Stop before the wall | Joystick drive (active)' && starters.every((item) => item.onTop), `"+" then "Joystick drive": tabs ${tabs.join(' | ')}; menu items ${starters.map((item) => `${item.starter} ${item.width}×${item.height}`).join(', ')}`)
  record('program:script-in-view-after-switch', Boolean(scriptInView && !ws.paletteOpen), `switching programs with the palette open: the palette ${ws.paletteOpen ? 'stayed open' : 'went in'}, and "when joystick moves" is at x ${Math.round(joyScript?.x)}–${Math.round(joyScript?.x + joyScript?.width)} in a scripts area x ${ws.scriptsLeft}–${ws.hostRight}`)
  await tapElement({ css: '[data-testid=robo-run]' }, 'Run (joystick)')
  await sleep(500)
  const stick = await target({ css: '[data-testid=robo-joystick]' })
  await stage('joystick-program', { stick: stick.rect })
  const beforeStick = await observation()
  pageBefore = await page()
  await qa(() => window.__qa.sample())
  // Finger on the knob, push up 14 px (about 40 %), hold half a second, lift.
  await touchDrag(line({ x: stick.cx, y: stick.cy }, { x: stick.cx, y: stick.cy - 14 }, 4), { stepMs: 40, holdEnd: 500 })
  await sleep(800)
  const stickSamples = await qa(() => window.__qa.stopSampling())
  const afterStick = await observation()
  const pushed = stickSamples.filter((sample) => /^up [1-9]/.test(sample.stick ?? ''))
  const chassisMove = (() => { const a = beforeStick.poses[0]; const b = afterStick.poses.find((pose) => pose.id === a.id); return b ? Math.hypot(b.x - a.x, b.z - a.z) / 0.62 : null })()
  const topSpeed = Math.max(...stickSamples.map((sample) => sample.speed ?? 0))
  measured.joystick = { stickRect: stick.rect, axesWhileHeld: [...new Set(pushed.map((sample) => sample.stick))], heldSamples: pushed.length, topSpeed, sensor: [beforeStick.distance, afterStick.distance], movedStuds: chassisMove, pageStill: pageStill(stickSamples, pageBefore), samples: stickSamples.map((sample) => `${sample.t?.toFixed(2)}s ${sample.stick} v=${sample.speed?.toFixed(2)} d=${sample.distance?.toFixed(2)}`) }
  record('joystick:drives', pushed.length > 0 && topSpeed > 1 && chassisMove > 1 && afterStick.distance < beforeStick.distance - 1, `a touch drag of the knob 14 px up read "${[...new Set(pushed.map((sample) => sample.stick))].join('", "')}" while held; the rover reached ${topSpeed.toFixed(2)} studs/s and moved ${chassisMove?.toFixed(1)} studs (wall ${beforeStick.distance.toFixed(1)} → ${afterStick.distance.toFixed(1)} studs)`)
  record('joystick:release-stops', afterStick.motors.every((power) => Math.abs(power) < 1) && /up 0, right 0/.test(stickSamples.at(-1)?.stick ?? ''), `lifting the finger centred the stick ("${stickSamples.at(-1)?.stick}") and the motors stopped (${afterStick.motors.join(', ')} %)`)
  const stickSelection = [...new Set(stickSamples.map((sample) => sample.selection).filter(Boolean))]
  record('joystick:page-still', pageStill(stickSamples, pageBefore) && stickSelection.length === 0, `the page never scrolled or zoomed during the joystick drag (${stickSamples.length} samples) and no text was selected${stickSelection.length ? ` (selected: "${stickSelection.join('", "')}")` : ''}`)
  // Keys: Reset, Run, then hold ↑ on the pad.
  await tapElement({ css: '[data-testid=robo-reset]' }, 'Reset (before keys)')
  await sleep(400)
  await tapElement({ css: '[data-testid=robo-run]' }, 'Run (keys)')
  await sleep(400)
  const keysTap = await tapElement({ text: 'Keys', within: '[data-testid=robo-stage-input]' }, 'Keys (input switch)')
  await sleep(400)
  const upKey = await target({ label: 'Up arrow' })
  const beforeKeys = await observation()
  await qa(() => window.__qa.sample())
  await sim.gesture([
    { type: 'pointerMove', duration: 0, origin: 'viewport', x: Math.round(upKey.cx), y: Math.round(upKey.cy) },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: 450 },
    { type: 'pointerUp', button: 0 },
  ])
  await sleep(700)
  const keySamples = await qa(() => window.__qa.stopSampling())
  const afterKeys = await observation()
  // A long press must not select the key's label: iPadOS would then show its Copy / Look Up / Translate callout
  // over the pad (the first run of this harness tapped "Translate" in it by accident).
  const selected = [...new Set(keySamples.map((sample) => sample.selection).filter(Boolean))]
  const stillSelected = await qa(() => { const text = document.getSelection()?.toString() ?? ''; document.getSelection()?.removeAllRanges(); return text })
  record('keys:hold-selects-nothing', selected.length === 0 && !stillSelected, selected.length || stillSelected ? `holding ↑ selected "${selected.join('", "') || stillSelected}" (iPadOS then offers Copy / Look Up / Translate over the pad)` : 'holding ↑ selected no text and raised no callout')
  measured.keys = { upKey: upKey.rect, heldSamples: keySamples.filter((sample) => sample.upHeld).length, topSpeed: Math.max(...keySamples.map((sample) => sample.speed ?? 0)), sensor: [beforeKeys.distance, afterKeys.distance] }
  record('keys:hold-up', keysTap.ok && upKey.hit && measured.keys.heldSamples > 0 && measured.keys.topSpeed > 1 && afterKeys.distance < beforeKeys.distance - 0.5 && afterKeys.motors.every((power) => Math.abs(power) < 1) && pageStill(keySamples, pageBefore), `holding ↑ (${upKey.rect.width}×${upKey.rect.height} px) lit it for ${measured.keys.heldSamples} samples and drove ${measured.keys.topSpeed.toFixed(2)} studs/s (wall ${beforeKeys.distance.toFixed(1)} → ${afterKeys.distance.toFixed(1)}); lifting stopped the motors`)
  await stage('keys')
  await tapElement({ text: 'Joystick', within: '[data-testid=robo-stage-input]' }, 'Joystick (input switch)')
  await sleep(300)

  /* 5. Test plate / My world; Back to build. */
  console.log('\n5. Test plate / My world, Back to build')
  await tapElement({ text: 'My world', within: '[aria-label="Where to test"]' }, 'My world')
  await sleep(1500)
  const world = await qa(() => { const s = window.__robotics.stageStore.getState(); return { space: s.stage?.space, props: s.stage?.controller.props.map((prop) => prop.kind) ?? null, saved: window.__robotics.roboticsStore.getState().model.creations[0].testSpace } })
  record('space:my-world', world.space === 'myWorld' && world.props.length === 0 && world.saved === 'myWorld', `tapped "My world": the stage is in ${world.space} (props: ${world.props?.join(', ') || 'none'}), the creation's run space is saved as ${world.saved}`)
  await stage('my-world')
  await tapElement({ text: 'Test plate', within: '[aria-label="Where to test"]' }, 'Test plate')
  await sleep(1500)
  const plate = await qa(() => { const s = window.__robotics.stageStore.getState(); return { space: s.stage?.space, props: s.stage?.controller.props.map((prop) => prop.kind) ?? null, saved: window.__robotics.roboticsStore.getState().model.creations[0].testSpace } })
  record('space:test-plate', plate.space === 'testPlate' && plate.props.join() === 'wall' && plate.saved === 'testPlate', `tapped "Test plate": the stage is in ${plate.space} (props: ${plate.props?.join(', ') || 'none'}), saved as ${plate.saved}`)
  const programsBeforeBack = await programs()
  const backTap = await tapElement({ css: '[data-testid=robo-back]' }, 'Back to build')
  await sleep(900)
  const backState = await qa(() => ({ code: Boolean(document.querySelector('[data-testid=robo-code]')), stage: window.__robotics.stageStore.getState().stage !== null, panel: Boolean(document.querySelector('[data-testid=robotics-panel]')) }))
  const backConstruction = await construction()
  const backSpace = await robo((state) => state.model.creations[0].testSpace ?? null)
  const programsAfterBack = await programs()
  record('back:construction-unchanged', backTap.ok && !backState.code && !backState.stage && backState.panel && backConstruction === builtConstruction, `tapped "Back to build": Code view ${backState.code ? 'still open' : 'closed'}, stage ${backState.stage ? 'still open' : 'closed'}, creation panel ${backState.panel ? 'back' : 'missing'}; bricks, cables, device names and the creation ${backConstruction === builtConstruction ? 'exactly as built' : 'CHANGED'} (run space ${builtSpace ?? 'default'} → ${backSpace})`)
  record('back:programs-kept', programsAfterBack.length === 2 && JSON.stringify(programsAfterBack) === JSON.stringify(programsBeforeBack), `both programs kept: ${programsAfterBack.map((program) => `${program.name} r${program.revision}`).join(', ')}`)
  await stage('back-to-build')

  const errors = await qa(() => window.__qa.errors)
  record('page-errors', errors.length === 0, errors.length ? errors.slice(0, 4).join(' | ') : 'no uncaught errors or rejections on the page')

  const failed = results.filter((r) => !r.ok)
  exitCode = failed.length ? 1 : 0
  const allSmall = new Map()
  for (const s of stages) for (const t of s.smallTargets) allSmall.set(`${t.surface}|${t.name}|${t.width}x${t.height}`, t)
  const allText = new Map()
  for (const s of stages) for (const t of s.smallText) allText.set(`${t.surface}|${t.size}|${t.text}`, t)
  await writeFile(path.join(out, 'results.json'), `${JSON.stringify({
    origin, at: new Date().toISOString(), device: { name: device.name, udid: device.udid, safari: sim.capabilities?.browserVersion },
    input: 'W3C touch actions through safaridriver to Safari on the iOS Simulator; tap points from element rects, Blockly block and field rects (window.__robotics.codeWorkspace) and the studio projection (canvas)',
    env, passed: results.length - failed.length, total: results.length, results, findings, measured,
    smallTargets: [...allSmall.values()], smallText: [...allText.values()], stages,
  }, null, 2)}\n`)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed; ${findings.length} findings; evidence in ${out}`)
} catch (error) {
  exitCode = 2
  console.error(error)
  await writeFile(path.join(out, 'results.json'), `${JSON.stringify({ origin, at: new Date().toISOString(), aborted: String(error?.stack ?? error), results, findings, measured, stages }, null, 2)}\n`).catch(() => {})
} finally {
  const closed = await sim.close().then(() => true, () => false)
  if (!closed || exitCode === 2) await sim.quitSafari().catch(() => {})
  if (driverChild) driverChild.kill()
}
process.exit(exitCode)
