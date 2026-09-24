/**
 * Demo studio: records the real app as smooth video, frame by frame.
 *
 * The page's clock is frozen (Playwright's clock: Date, timers, requestAnimationFrame and performance.now), so the app
 * only moves when the director steps it one frame forward. After each step the frame is saved as an image, and ffmpeg
 * joins them. However slow the machine (3D in a headless browser is slow), every frame is exactly 1/fps apart, so the
 * result is perfectly smooth. A drawn cursor with a click ripple shows what is being done.
 *
 * Environment: PLAYWRIGHT_MODULE, CHROME_PATH (see scripts/qa/lib/env.mjs), DEMO_ORIGIN (default
 * http://127.0.0.1:5199), DEMO_OUT (default ./demo-out).
 */
import { spawnSync } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { launchOptions, loadChromium } from '../../qa/lib/env.mjs'

export const ORIGIN = (process.env.DEMO_ORIGIN || 'http://127.0.0.1:5199').replace(/\/+$/, '')
export const OUT = process.env.DEMO_OUT || 'demo-out'

/** The drawn cursor: a white arrow with a navy edge; it squeezes while pressed and rings out on each click. */
const CURSOR_SCRIPT = `(() => {
  const state = { x: -100, y: -100, down: false, clicks: [], fade: { from: 1, to: 1, at: 0 } }
  // The director fades the cursor out while the game plays, and back in to build.
  window.__demoCursor = { fade: (to) => { const now = performance.now(); state.fade = { from: opacity(now), to, at: now } } }
  const opacity = (now) => { const k = Math.min(1, (now - state.fade.at) / 300); return state.fade.from + (state.fade.to - state.fade.from) * k }
  const install = () => {
    if (document.getElementById('demo-cursor')) return
    const root = document.createElement('div')
    root.id = 'demo-cursor'
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    root.innerHTML = '<canvas id="demo-ripples" style="position:absolute;inset:0;width:100%;height:100%"></canvas>' +
      '<svg id="demo-arrow" width="30" height="36" viewBox="0 0 26 32" style="position:absolute;left:0;top:0;transform-origin:2px 2px;filter:drop-shadow(0 3px 4px rgba(38,60,81,.35))">' +
      '<path d="M2 2 L2 26 L8.5 19.5 L13 29.5 L17.5 27.5 L13 18 L22 18 Z" fill="#fff" stroke="#263C51" stroke-width="2.2" stroke-linejoin="round"/></svg>'
    document.documentElement.appendChild(root)
  }
  addEventListener('mousemove', (e) => { state.x = e.clientX; state.y = e.clientY }, true)
  addEventListener('mousedown', (e) => { state.down = true; state.clicks.push({ x: e.clientX, y: e.clientY, t: performance.now() }) }, true)
  addEventListener('mouseup', () => { state.down = false }, true)
  const paint = () => {
    install()
    const arrow = document.getElementById('demo-arrow')
    const canvas = document.getElementById('demo-ripples')
    if (arrow && canvas) {
      arrow.style.transform = 'translate(' + (state.x - 2) + 'px,' + (state.y - 2) + 'px) scale(' + (state.down ? 0.86 : 1) + ')'
      arrow.style.opacity = String(opacity(performance.now()))
      const dpr = devicePixelRatio || 1
      if (canvas.width !== innerWidth * dpr) { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr }
      const g = canvas.getContext('2d')
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.clearRect(0, 0, innerWidth, innerHeight)
      const now = performance.now()
      state.clicks = state.clicks.filter((c) => now - c.t < 450)
      for (const c of state.clicks) {
        const k = (now - c.t) / 450
        g.beginPath()
        g.arc(c.x, c.y, 8 + k * 26, 0, Math.PI * 2)
        g.strokeStyle = 'rgba(53,101,191,' + (0.55 * (1 - k)) + ')'
        g.lineWidth = 5 * (1 - k) + 1
        g.stroke()
      }
    }
    requestAnimationFrame(paint)
  }
  requestAnimationFrame(paint)
})()`

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/**
 * One recording. `open()` starts a page with the clock installed and running (so the app loads normally); `start()`
 * freezes it, and from then on every director call steps time frame by frame and saves frames.
 */
export class Director {
  /** `gpu`: render WebGL on the graphics card (3D is far too slow in software rendering). */
  constructor({ name, width = 1280, height = 720, scale = 1.5, fps = 60, css = '', gpu = false }) {
    Object.assign(this, { name, width, height, scale, fps, css, gpu })
    this.frame = 0
    // Where the cursor is on each frame and whether it shows: the hero cut's camera follows it.
    this.track = []
    this.cursorShown = true
    this.mouse = { x: width / 2, y: height / 2 }
    this.dir = path.join(OUT, `${name}-frames`)
  }

  async open(url, { prepare } = {}) {
    await rm(this.dir, { recursive: true, force: true })
    await mkdir(this.dir, { recursive: true })
    const chromium = await loadChromium()
    const args = this.gpu ? ['--use-angle=gl', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader']
    this.browser = await chromium.launch(launchOptions({ args }))
    this.context = await this.browser.newContext({ viewport: { width: this.width, height: this.height }, deviceScaleFactor: this.scale })
    this.page = await this.context.newPage()
    this.page.on('pageerror', (e) => console.log(`[${this.name}] page error: ${e.message}`))
    await this.page.clock.install()
    await this.page.addInitScript(CURSOR_SCRIPT)
    if (prepare) await this.page.addInitScript(prepare)
    await this.page.goto(ORIGIN + url)
    if (this.css) await this.page.addStyleTag({ content: this.css })
    await this.page.mouse.move(this.mouse.x, this.mouse.y)
    return this.page
  }

  /** Freeze time here; everything after this is recorded. */
  async start() {
    await this.page.clock.pauseAt(Date.now() + 1000)
    await this.page.clock.runFor(1000)
  }

  async shoot() {
    await this.page.clock.runFor(1000 / this.fps)
    // DEMO_PREVIEW=1 steps time without saving frames: a quick way to check a storyboard's timing.
    if (!process.env.DEMO_PREVIEW) {
      const file = path.join(this.dir, `f${String(this.frame).padStart(5, '0')}.jpg`)
      await this.page.screenshot({ path: file, type: 'jpeg', quality: 93, animations: 'disabled', caret: 'hide' })
    }
    this.track.push([Math.round(this.mouse.x), Math.round(this.mouse.y), this.cursorShown ? 1 : 0])
    this.frame++
  }

  /** Hold still for `ms` (the app keeps running). */
  async wait(ms) {
    for (let i = 0; i < Math.round((ms / 1000) * this.fps); i++) await this.shoot()
  }

  /** Glide the cursor to (x, y) over `ms` with an ease in and out, a little arc for a hand-drawn feel. */
  async move(x, y, ms = 600) {
    const from = { ...this.mouse }
    const n = Math.max(1, Math.round((ms / 1000) * this.fps))
    const lift = Math.min(40, Math.hypot(x - from.x, y - from.y) * 0.08)
    for (let i = 1; i <= n; i++) {
      const t = ease(i / n)
      const px = from.x + (x - from.x) * t
      const py = from.y + (y - from.y) * t - Math.sin(Math.PI * t) * lift
      await this.page.mouse.move(px, py)
      this.mouse = { x: px, y: py }
      await this.shoot()
    }
    this.mouse = { x, y }
  }

  /** Fade the drawn cursor out (while the game plays) or back in. */
  async cursor(visible) {
    this.cursorShown = visible
    await this.page.evaluate((v) => window.__demoCursor?.fade(v ? 1 : 0), visible)
  }

  async click({ hold = 90, after = 160 } = {}) {
    await this.page.mouse.down()
    await this.wait(hold)
    await this.page.mouse.up()
    await this.wait(after)
  }

  /** Press and drag through the points, `ms` for the whole path. */
  async drag(points, ms = 900) {
    await this.page.mouse.down()
    const n = Math.max(1, Math.round((ms / 1000) * this.fps))
    const segs = points.length - 1
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * segs
      const k = Math.min(segs - 1, Math.floor(t))
      const f = t - k
      const [a, b] = [points[k], points[k + 1]]
      const px = a.x + (b.x - a.x) * f
      const py = a.y + (b.y - a.y) * f
      await this.page.mouse.move(px, py)
      this.mouse = { x: px, y: py }
      await this.shoot()
    }
    await this.page.mouse.up()
    await this.wait(120)
  }

  /** Hold keys for `ms`; `during` runs once after they go down (for example a jump in the middle of a run). */
  async keys(keys, ms, during) {
    for (const k of keys) await this.page.keyboard.down(k)
    if (during) await during()
    await this.wait(ms)
    for (const k of [...keys].reverse()) await this.page.keyboard.up(k)
  }

  /** Centre of an element, in CSS pixels. */
  async centre(locator) {
    const box = await locator.boundingBox()
    if (!box) throw new Error(`[${this.name}] not on screen: ${locator}`)
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  async moveTo(locator, ms) {
    const c = await this.centre(locator)
    await this.move(c.x, c.y, ms)
  }

  /** Close the browser and join the frames into the deliverables (see `encode`). */
  async finish({ squareFocusX = 0.5 } = {}) {
    await this.browser.close()
    const { name, fps, width, height, scale } = this
    const meta = { name, frames: this.frame, fps, seconds: this.frame / fps, width, height, scale, squareFocusX, track: this.track }
    await writeFile(path.join(OUT, `${name}.json`), JSON.stringify(meta, null, 2))
    encode(meta)
  }
}

/**
 * Standard video colour. The frames are JPEGs (full-range BT.601); players and upload pipelines expect limited-range
 * BT.709 in 4:2:0, and show anything else washed out, too dark, or not at all.
 */
export const VIDEO = 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p'
export const VIDEO_TAGS = ['-pix_fmt', 'yuv420p', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv']

export function ffmpeg(args, label) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${label}`)
}

/**
 * Join a recording's frames (in OUT/<name>-frames) into the deliverables: a 1080p MP4 at the recording's frame rate
 * (LinkedIn and anywhere else), a smaller 30 fps MP4 and WebM for the website, a square cut for social feeds, and a
 * poster image. `meta` is what the recording saved as OUT/<name>.json, so encode.mjs can redo this without recording.
 */
export function encode({ name, frames, fps, width = 1280, height = 720, scale = 1.5, squareFocusX = 0.5, track }) {
  const base = path.join(OUT, name)
  const dir = path.join(OUT, `${name}-frames`)
  const input = ['-framerate', String(fps), '-i', path.join(dir, 'f%05d.jpg')]
  const h264 = (crf) => ['-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf), ...VIDEO_TAGS, '-movflags', '+faststart', '-an']
  const W = Math.round(width * scale)
  const H = Math.round(height * scale)
  ffmpeg([...input, '-vf', `scale=trunc(iw/2)*2:trunc(ih/2)*2,${VIDEO}`, ...h264(18), `${base}-1080p${fps}.mp4`], '1080p')
  ffmpeg([...input, '-vf', `fps=30,scale=1280:-2,${VIDEO}`, ...h264(24), `${base}-web.mp4`], 'web mp4')
  ffmpeg([...input, '-vf', `fps=30,scale=1280:-2,${VIDEO}`, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', ...VIDEO_TAGS, '-an', `${base}-web.webm`], 'web webm')
  const side = Math.min(W, H)
  const x = Math.max(0, Math.min(W - side, Math.round(W * squareFocusX - side / 2)))
  ffmpeg([...input, '-vf', `crop=${side}:${side}:${x}:0,scale=1080:1080,${VIDEO}`, ...h264(19), `${base}-square.mp4`], 'square')
  ffmpeg(['-i', path.join(dir, 'f00000.jpg'), '-vf', 'scale=1600:-2', '-q:v', '3', `${base}-poster.jpg`], 'poster')
  if (track) hero({ name, fps, width, height, scale, track })
  console.log(`[${name}] ${frames} frames (${(frames / fps).toFixed(1)} s) → ${base}-*.mp4 / .webm / -poster.jpg`)
}

/**
 * The hero cut: a 4:3 video with a virtual camera, like a screen-recording app's auto zoom. While the cursor shows,
 * the camera zooms in and follows it; when it fades (the game plays) the camera eases back out to the whole view.
 * The camera moves smoothly (it chases the cursor, it never jumps) and never leaves the frame.
 */
export function hero({ name, fps, width, height, scale, track }, { zoom = 1.45, aspect = 4 / 3, out = [1200, 900] } = {}) {
  const base = path.join(OUT, name)
  const full = { w: Math.min(width, height * aspect), h: Math.min(height, width / aspect) }
  const cam = { x: width / 2, y: height / 2, z: 1 }
  const dt = 1 / fps
  const even = (v) => Math.max(2, Math.round(v * scale / 2) * 2)
  const lines = track.map(([mx, my, shown], i) => {
    const tz = shown ? zoom : 1
    const tx = shown ? mx : width / 2
    const ty = shown ? my : height / 2
    cam.z += (tz - cam.z) * (1 - Math.exp(-dt * 2.2))
    cam.x += (tx - cam.x) * (1 - Math.exp(-dt * 2.6))
    cam.y += (ty - cam.y) * (1 - Math.exp(-dt * 2.6))
    const w = full.w / cam.z
    const h = full.h / cam.z
    const x = Math.min(width - w, Math.max(0, cam.x - w / 2))
    const y = Math.min(height - h, Math.max(0, cam.y - h / 2))
    const [W, H] = [even(w), even(h)]
    const X = Math.min(Math.round(width * scale) - W, Math.round(x * scale))
    const Y = Math.min(Math.round(height * scale) - H, Math.round(y * scale))
    return `${(i * dt).toFixed(4)} crop@cam w ${W}, crop@cam h ${H}, crop@cam x ${X}, crop@cam y ${Y};`
  })
  const cmds = `${base}-hero-camera.txt`
  writeFileSync(cmds, lines.join('\n') + '\n')
  const input = ['-framerate', String(fps), '-i', path.join(OUT, `${name}-frames`, 'f%05d.jpg')]
  const vf = `sendcmd=f='${cmds}',crop@cam=${even(full.w)}:${even(full.h)},scale=${out[0]}:${out[1]}:flags=lanczos,fps=30,${VIDEO}`
  ffmpeg([...input, '-vf', vf, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', ...VIDEO_TAGS, '-movflags', '+faststart', '-an', `${base}-hero.mp4`], 'hero mp4')
  ffmpeg([...input, '-vf', vf, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1', ...VIDEO_TAGS, '-an', `${base}-hero.webm`], 'hero webm')
}
